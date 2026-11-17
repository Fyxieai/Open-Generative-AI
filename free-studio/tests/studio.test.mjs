import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=",
  "base64",
);
const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from("ftypisom"),
  Buffer.alloc(20),
]);
async function fixture(t, options = {}) {
  const { createApp } = await import("../server/app.mjs");
  const dataDir =
    options.dataDir ?? (await mkdtemp(path.join(os.tmpdir(), "studio-test-")));
  const calls = [];
  const transport =
    options.transport ??
    (async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({ data: [{ b64_json: png.toString("base64") }] });
    });
  const handler = createApp({
    dataDir,
    env: { HOST: "127.0.0.1", ...options.env },
    transport,
    pollIntervalMs: 1,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    ...options,
  });
  await handler.ready;
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function req(url, body, extra = {}) {
    const response = await fetch(base + url, {
      method: body === undefined ? "GET" : "POST",
      ...extra,
      headers: {
        ...(body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              Origin: options.env?.STUDIO_ORIGIN ?? "http://127.0.0.1:3210",
            }),
        ...extra.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let value;
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("json")) value = await response.json();
    else value = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, value };
  }
  t.after(async () => {
    await handler.close();
    await new Promise((resolve) => server.close(resolve));
    if (!options.keep) await rm(dataDir, { recursive: true, force: true });
  });
  return { req, calls, dataDir, handler };
}
async function waitJob(req, id) {
  for (let i = 0; i < 100; i++) {
    const { value } = await req("/api/jobs");
    const job = value.jobs.find((j) => j.id === id);
    if (!["queued", "running"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail("Job did not finish");
}
async function configure(req, id = "novai", extra = {}) {
  const res = await req("/api/providers/" + id, {
    apiKey: "secret-test-provider-key",
    ...extra,
  });
  assert.equal(res.status, 200);
}
async function submit(req, body = {}) {
  return req("/api/jobs", {
    modelId: "novai-image",
    prompt: "A tiny forest",
    aspectRatio: "1:1",
    ...body,
  });
}

test("local session, fixed catalog, unknown models and gateway cannot invoke transport", async (t) => {
  const { req, calls } = await fixture(t, {
    env: { FREELLMAPI_BASE_URL: "https://gateway.example" },
  });
  assert.deepEqual((await req("/api/session")).value, {
    authenticated: true,
    localMode: true,
  });
  const catalog = (await req("/api/status")).value;
  assert.equal(catalog.freeOnly, true);
  assert.equal(catalog.models.length, 8);
  assert.equal(
    catalog.models.find((x) => x.id === "freellmapi-image").available,
    false,
  );
  assert.match(
    catalog.models.find((x) => x.id === "freellmapi-image").unavailableReason,
    /provider|platform/i,
  );
  assert.equal(
    (await submit(req, { modelId: "paid-super-model" })).status,
    400,
  );
  assert.equal(calls.length, 0);
});
test("provider keys encrypted on disk and Agnes confirmations expire within 24 hours", async (t) => {
  let now = Date.now();
  const { req, dataDir } = await fixture(t, { now: () => now });
  assert.equal(
    (await req("/api/providers/agnes", { apiKey: "secret-test-provider-key" }))
      .status,
    400,
  );
  assert.equal(
    (
      await req("/api/providers/agnes", {
        apiKey: "secret-test-provider-key",
        freeUntil: new Date(now + 25 * 3600000).toISOString(),
      })
    ).status,
    400,
  );
  await configure(req, "agnes", {
    freeUntil: new Date(now + 3600000).toISOString(),
  });
  assert.equal(
    (await req("/api/status")).value.models.find((x) => x.id === "agnes-image")
      .available,
    true,
  );
  const disk = await readFile(path.join(dataDir, "state.json"), "utf8");
  assert.ok(!disk.includes("secret-test-provider-key"));
  assert.equal(
    (await stat(path.join(dataDir, "secret.key"))).mode & 0o777,
    0o600,
  );
  now += 3600001;
  assert.equal((await submit(req, { modelId: "agnes-image" })).status, 409);
});
test("production requires password and origin, signed login session enforces origins", async (t) => {
  const { createApp } = await import("../server/app.mjs");
  assert.throws(
    () => createApp({ env: { NODE_ENV: "production" } }),
    /password/i,
  );
  assert.throws(
    () =>
      createApp({
        env: { NODE_ENV: "production", STUDIO_PASSWORD: "password" },
      }),
    /origin/i,
  );
  assert.throws(
    () => createApp({ env: { HOST: "0.0.0.0" } }),
    /loopback|password/i,
  );
  const { req } = await fixture(t, {
    env: {
      NODE_ENV: "production",
      STUDIO_PASSWORD: "correct-password",
      STUDIO_ORIGIN: "https://studio.example",
    },
  });
  assert.equal((await req("/api/status")).status, 401);
  assert.equal((await req("/api/login", { password: "wrong" })).status, 401);
  const login = await req("/api/login", { password: "correct-password" });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  const headers = { Cookie: cookie.split(";")[0] };
  assert.equal((await req("/api/status", undefined, { headers })).status, 200);
  assert.equal(
    (
      await req(
        "/api/providers/novai",
        { apiKey: "secret" },
        { headers: { ...headers, Origin: "https://evil.example" } },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await req(
        "/api/providers/novai",
        { apiKey: "secret" },
        { headers: { ...headers, Origin: "" } },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await req("/api/status", undefined, {
        headers: { Cookie: "studio_session=forged" },
      })
    ).status,
    401,
  );
  await req("/api/logout", {}, { headers });
  assert.equal((await req("/api/status", undefined, { headers })).status, 401);
});
test("images persist, idempotency survives, media is validated and supports download", async (t) => {
  const { req, calls, dataDir } = await fixture(t);
  await configure(req);
  const response = await req(
    "/api/jobs",
    { modelId: "novai-image", prompt: "A tiny forest", aspectRatio: "1:1" },
    { headers: { "Idempotency-Key": "same-job" } },
  );
  assert.equal(response.status, 202);
  const job = await waitJob(req, response.value.job.id);
  assert.equal(job.status, "completed");
  const again = await req(
    "/api/jobs",
    { modelId: "novai-image", prompt: "A tiny forest", aspectRatio: "1:1" },
    { headers: { "Idempotency-Key": "same-job" } },
  );
  assert.equal(again.value.job.id, job.id);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: "cogview-3-flash",
    prompt: "A tiny forest",
    size: "1024x1024",
  });
  const media = await req(job.mediaUrl + "?download=1");
  assert.equal(media.status, 200);
  assert.equal(media.headers.get("content-type"), "image/png");
  assert.deepEqual(media.value, png);
  assert.match(media.headers.get("content-disposition"), /attachment/);
  assert.ok(
    (await readFile(path.join(dataDir, "state.json"), "utf8")).includes(job.id),
  );
  assert.equal(
    (
      await req("/api/jobs/" + job.id, undefined, {
        method: "DELETE",
        headers: { Origin: "http://127.0.0.1:3210" },
      })
    ).status,
    200,
  );
  assert.equal((await req(job.mediaUrl)).status, 404);
});
test("NovAI video polls exact free model, stores mp4 and serves byte ranges", async (t) => {
  const calls = [];
  const { req } = await fixture(t, {
    transport: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("cdn")) return new Response(mp4);
      if (init.method === "POST") return Response.json({ id: "remote-id" });
      return Response.json({
        task_status: "SUCCESS",
        video_result: [{ url: "https://cdn.aiapi-pro.com/video.mp4" }],
      });
    },
  });
  await configure(req);
  const response = await submit(req, {
    modelId: "novai-video",
    aspectRatio: "16:9",
    duration: 5,
  });
  const job = await waitJob(req, response.value.job.id);
  assert.equal(job.status, "completed");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: "cogvideox-flash",
    prompt: "A tiny forest",
    duration: 5,
  });
  assert.match(calls[1].url, /remote-id\?model=cogvideox-flash$/);
  assert.equal(calls[2].init.headers?.Authorization, undefined);
  const partial = await req(job.mediaUrl, undefined, {
    headers: { Range: "bytes=4-11" },
  });
  assert.equal(partial.status, 206);
  assert.equal(
    partial.headers.get("content-range"),
    `bytes 4-11/${mp4.length}`,
  );
  assert.equal(partial.value.toString(), "ftypisom");
  assert.equal(
    (await req(job.mediaUrl, undefined, { headers: { Range: "bytes=999-" } }))
      .status,
    416,
  );
});
test("Agnes image and video use reviewed flash identities and durations", async (t) => {
  const calls = [];
  const { req } = await fixture(t, {
    transport: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("media.agnes-ai.space"))
        return new Response(mp4);
      if (String(url).includes("/v1/images"))
        return Response.json({ data: [{ b64_json: png.toString("base64") }] });
      if (String(url).includes("/v1/videos"))
        return Response.json({ video_id: "agnes-id" });
      return Response.json({
        status: "completed",
        url: "https://media.agnes-ai.space/output.mp4",
      });
    },
  });
  await configure(req, "agnes", {
    freeUntil: new Date(Date.now() + 3600000).toISOString(),
  });
  let response = await submit(req, {
    modelId: "agnes-image",
    aspectRatio: "9:16",
  });
  assert.equal((await waitJob(req, response.value.job.id)).status, "completed");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: "agnes-image-2.1-flash",
    prompt: "A tiny forest",
    size: "1K",
    ratio: "9:16",
    return_base64: true,
  });
  response = await submit(req, {
    modelId: "agnes-video",
    aspectRatio: "9:16",
    duration: 4,
  });
  assert.equal((await waitJob(req, response.value.job.id)).status, "completed");
  assert.equal(JSON.parse(calls[1].init.body).seconds, "4");
  assert.match(
    calls[2].url,
    /video_id=agnes-id&model_name=agnes-video-2.5-flash/,
  );
  assert.equal(
    (await submit(req, { modelId: "agnes-video", duration: 13 })).status,
    400,
  );
});
test("bad provider results never persist or expose provider secrets", async (t) => {
  const { req } = await fixture(t, {
    transport: async () =>
      Response.json({
        data: [{ b64_json: Buffer.from("not an image").toString("base64") }],
      }),
  });
  await configure(req);
  const response = await submit(req);
  const job = await waitJob(req, response.value.job.id);
  assert.equal(job.status, "failed");
  assert.match(job.error, /media|image/i);
  assert.equal(job.mediaUrl, undefined);
});
test("single queue, cancellation and waiting limit prevent duplicate submissions", async (t) => {
  let calls = 0;
  const { req } = await fixture(t, {
    maxWaiting: 2,
    transport: async (url, init) => {
      calls++;
      return new Promise((resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(init.signal.reason),
          { once: true },
        );
      });
    },
  });
  await configure(req);
  const a = (await submit(req)).value.job;
  const b = (await submit(req)).value.job;
  const c = (await submit(req)).value.job;
  assert.equal((await submit(req)).status, 429);
  assert.equal(calls, 1);
  assert.equal(
    (await req("/api/jobs/" + b.id + "/cancel", {})).value.job.status,
    "cancelled",
  );
  await req("/api/jobs/" + a.id + "/cancel", {});
  assert.equal((await waitJob(req, a.id)).status, "cancelled");
  await req("/api/jobs/" + c.id + "/cancel", {});
});
test("restart marks interrupted jobs failed without calling provider", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "studio-restart-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const { req, handler } = await fixture(t, {
    dataDir,
    keep: true,
    transport: async (url, init) =>
      new Promise((resolve, reject) =>
        init.signal.addEventListener("abort", () => reject(init.signal.reason)),
      ),
  });
  await configure(req);
  const response = await submit(req);
  await handler.close();
  const state = JSON.parse(
    await readFile(path.join(dataDir, "state.json"), "utf8"),
  );
  state.jobs[0].status = "running";
  await writeFile(path.join(dataDir, "state.json"), JSON.stringify(state));
  const next = await fixture(t, { dataDir, keep: true });
  assert.equal((await next.req("/api/jobs")).value.jobs[0].status, "failed");
  assert.match(
    (await next.req("/api/jobs")).value.jobs[0].error,
    /interrupted/i,
  );
  assert.equal(next.calls.length, 0);
});
test("daily conservative quotas persist and reset on UTC+8 day boundary", async (t) => {
  let now = Date.parse("2026-11-17T15:59:00Z");
  const { req } = await fixture(t, { now: () => now });
  await configure(req);
  for (let i = 0; i < 10; i++) {
    const response = await submit(req);
    assert.equal(response.status, 202);
    assert.equal(
      (await waitJob(req, response.value.job.id)).status,
      "completed",
    );
  }
  assert.equal((await submit(req)).status, 429);
  now += 120000;
  assert.equal((await submit(req)).status, 202);
});
test("JSON limits and origin checks apply in local mode", async (t) => {
  const { req } = await fixture(t);
  assert.equal(
    (await req("/api/providers/novai", { apiKey: "a".repeat(70000) })).status,
    413,
  );
  assert.equal(
    (
      await req(
        "/api/providers/novai",
        { apiKey: "secret" },
        { headers: { Origin: "https://evil.example" } },
      )
    ).status,
    403,
  );
});
test("concurrent identical idempotency keys make one provider submission including prototype-like keys", async (t) => {
  const { req, calls } = await fixture(t);
  await configure(req);
  const body = {
    modelId: "novai-image",
    prompt: "Concurrent forest",
    aspectRatio: "1:1",
  };
  const responses = await Promise.all(
    Array.from({ length: 6 }, () =>
      req("/api/jobs", body, { headers: { "Idempotency-Key": "__proto__" } }),
    ),
  );
  for (const response of responses) assert.equal(response.status, 202);
  assert.equal(new Set(responses.map((r) => r.value.job.id)).size, 1);
  await waitJob(req, responses[0].value.job.id);
  assert.equal(calls.length, 1);
});
test("login rate limits after five failed attempts without trusting proxy headers", async (t) => {
  const { req } = await fixture(t, {
    env: { STUDIO_PASSWORD: "correct-password" },
  });
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await req(
          "/api/login",
          { password: "wrong" },
          { headers: { "X-Forwarded-For": `8.8.8.${i}` } },
        )
      ).status,
      401,
    );
  assert.equal(
    (await req("/api/login", { password: "correct-password" })).status,
    429,
  );
});
test("NovAI videos stop at five daily submissions and provider raw errors remain private", async (t) => {
  let calls = 0;
  const { req } = await fixture(t, {
    transport: async () => {
      calls++;
      return new Response(
        "secret-test-provider-key token internal diagnostics",
        { status: 429 },
      );
    },
  });
  await configure(req);
  for (let i = 0; i < 5; i++) {
    const response = await submit(req, {
      modelId: "novai-video",
      aspectRatio: "16:9",
      duration: 5,
    });
    assert.equal(response.status, 202);
    const job = await waitJob(req, response.value.job.id);
    assert.equal(job.status, "failed");
    assert.ok(!JSON.stringify(job).includes("secret-test-provider-key"));
    assert.match(job.error, /HTTP 429/);
  }
  assert.equal(
    (
      await submit(req, {
        modelId: "novai-video",
        aspectRatio: "16:9",
        duration: 5,
      })
    ).status,
    429,
  );
  assert.equal(calls, 5);
});
test("provider credentials and idempotency remain usable after restart, and clearing keys prevents admission", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "studio-persist-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const first = await fixture(t, { dataDir, keep: true });
  await configure(first.req);
  const body = {
    modelId: "novai-image",
    prompt: "Persisted forest",
    aspectRatio: "1:1",
  };
  const submitted = await first.req("/api/jobs", body, {
    headers: { "Idempotency-Key": "persisted" },
  });
  await waitJob(first.req, submitted.value.job.id);
  await first.handler.close();
  const next = await fixture(t, { dataDir, keep: true });
  const replay = await next.req("/api/jobs", body, {
    headers: { "Idempotency-Key": "persisted" },
  });
  assert.equal(replay.value.job.id, submitted.value.job.id);
  assert.equal(next.calls.length, 0);
  assert.equal((await submit(next.req)).status, 202);
  const response = await next.req("/api/providers/novai", undefined, {
    method: "DELETE",
    headers: { Origin: "http://127.0.0.1:3210" },
  });
  assert.equal(response.status, 200);
  assert.equal((await submit(next.req)).status, 409);
});
test("cancelled running jobs never download a late provider result", async (t) => {
  let release;
  let calls = 0;
  const { req } = await fixture(t, {
    transport: async () => {
      calls++;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  await configure(req);
  const job = (await submit(req)).value.job;
  for (let i = 0; i < 20 && !release; i++)
    await new Promise((r) => setTimeout(r, 1));
  await req("/api/jobs/" + job.id + "/cancel", {});
  release(
    Response.json({ data: [{ url: "https://cdn.aiapi-pro.com/late.png" }] }),
  );
  assert.equal((await waitJob(req, job.id)).status, "cancelled");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls, 1);
});
test("a generation deadline fails once without automatic resubmission", async (t) => {
  let calls = 0;
  const { req } = await fixture(t, {
    deadlineMs: 15,
    transport: async (_url, init) => {
      calls++;
      return new Promise((_resolve, reject) =>
        init.signal.addEventListener(
          "abort",
          () => reject(init.signal.reason),
          { once: true },
        ),
      );
    },
  });
  await configure(req);
  const response = await submit(req);
  const job = await waitJob(req, response.value.job.id);
  assert.equal(job.status, "failed");
  assert.match(job.error, /deadline/i);
  assert.equal(calls, 1);
});
test("429 numeric Retry-After is bounded and sanitized without leaking response headers or bodies", async (t) => {
  let calls = 0;
  const { req } = await fixture(t, {
    transport: async () => {
      calls++;
      return new Response("provider body secret-test-provider-key", {
        status: 429,
        headers: {
          "Retry-After": "999999999",
          "X-Debug-Token": "secret-header-token",
        },
      });
    },
  });
  await configure(req);
  const response = await submit(req);
  const job = await waitJob(req, response.value.job.id);
  assert.equal(job.status, "failed");
  assert.match(job.error, /HTTP 429/);
  assert.match(job.error, /Retry after 86400 seconds/);
  assert.ok(!JSON.stringify(job).includes("secret"));
  assert.equal(calls, 1);
});
test("429 HTTP-date Retry-After is converted to seconds and invalid values are omitted", async (t) => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  let header = "Tue, 17 Nov 2026 12:02:00 GMT";
  let calls = 0;
  const { req } = await fixture(t, {
    now: () => now,
    transport: async () => {
      calls++;
      return new Response("private upstream diagnostics", {
        status: 429,
        headers: { "Retry-After": header, "X-Api-Key": "secret-header-key" },
      });
    },
  });
  await configure(req);
  let response = await submit(req);
  let job = await waitJob(req, response.value.job.id);
  assert.match(job.error, /Retry after 120 seconds/);
  header = "secret-header-key";
  response = await submit(req);
  job = await waitJob(req, response.value.job.id);
  assert.doesNotMatch(job.error, /Retry after|secret-header|diagnostics/);
  assert.equal(calls, 2);
});
test("status exposes conservative app quota remaining and exact UTC+8 reset time", async (t) => {
  let now = Date.parse("2026-11-17T15:59:00Z");
  const { req } = await fixture(t, { now: () => now });
  await configure(req);
  let quota = (await req("/api/status")).value.quotas.novai;
  assert.equal(quota.totalRemaining, 10);
  assert.equal(quota.videoRemaining, 5);
  assert.equal(quota.resetAt, "2026-11-17T16:00:00.000Z");
  assert.equal(quota.scope, "app");
  const response = await submit(req);
  await waitJob(req, response.value.job.id);
  quota = (await req("/api/status")).value.quotas.novai;
  assert.equal(quota.totalUsed, 1);
  assert.equal(quota.totalRemaining, 9);
  assert.equal(quota.videoRemaining, 5);
  now += 120000;
  quota = (await req("/api/status")).value.quotas.novai;
  assert.equal(quota.totalRemaining, 10);
  assert.equal(quota.resetAt, "2026-11-18T16:00:00.000Z");
});

test("rate-limited video status checks retry the same task without resubmitting generation", async (t) => {
  let posts = 0,
    polls = 0;
  const { req } = await fixture(t, {
    pollRetryDelayMs: 1,
    transport: async (url, init) => {
      if (init.method === "POST") {
        posts++;
        return Response.json({ id: "existing-free-task" });
      }
      if (String(url).includes("/video/generations/")) {
        polls++;
        if (polls === 1)
          return new Response("private rate limit detail", {
            status: 429,
            headers: { "Retry-After": "0" },
          });
        return Response.json({
          task_status: "SUCCESS",
          video_result: [{ url: "https://cdn.ufileos.com/final.mp4" }],
        });
      }
      return new Response(mp4);
    },
  });
  await configure(req);
  const response = await submit(req, {
    modelId: "novai-video",
    aspectRatio: "16:9",
    duration: 5,
  });
  const job = await waitJob(req, response.value.job.id);
  assert.equal(job.status, "completed");
  assert.equal(posts, 1);
  assert.equal(polls, 2);
});
