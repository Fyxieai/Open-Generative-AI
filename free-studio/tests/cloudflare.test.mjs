import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.mjs";
import { generate } from "../server/providers.mjs";
import { catalog } from "../server/catalog.mjs";

const accountId = "0123456789abcdef0123456789abcdef";
const apiKey = "private-cloudflare-token";
const image =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=";
async function fixture(t, options = {}) {
  const dataDir =
    options.dataDir ??
    (await mkdtemp(path.join(os.tmpdir(), "cloudflare-studio-")));
  const calls = [];
  const handler = createApp({
    dataDir,
    env: { HOST: "127.0.0.1" },
    ...options,
    transport:
      options.transport ??
      (async (url, init) => {
        calls.push({ url: String(url), init });
        return Response.json({ success: true, result: { image } });
      }),
  });
  await handler.ready;
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  async function req(
    route,
    body,
    method = body === undefined ? "GET" : "POST",
  ) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}${route}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:3210",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return { status: response.status, value: await response.json() };
  }
  t.after(async () => {
    await handler.close();
    await new Promise((resolve) => server.close(resolve));
    if (!options.keep) await rm(dataDir, { recursive: true, force: true });
  });
  return { req, dataDir, handler, calls };
}
const configure = (req) =>
  req("/api/providers/cloudflare", {
    apiKey,
    accountId,
    freePlanConfirmed: true,
  });
const submit = (req, extra = {}) =>
  req("/api/jobs", {
    modelId: "cloudflare-flux",
    prompt: "A cloud forest",
    aspectRatio: "1:1",
    ...extra,
  });
async function finish(req, id) {
  for (let i = 0; i < 150; i++) {
    const job = (await req("/api/jobs")).value.jobs.find(
      (job) => job.id === id,
    );
    if (!["queued", "running"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail("Job did not finish");
}

test("Cloudflare requires a valid account and explicit Free plan confirmation; tokens remain private", async (t) => {
  const { req, dataDir } = await fixture(t);
  let status = (await req("/api/status")).value;
  assert.equal(
    status.models.filter((model) => model.provider === "cloudflare").length,
    2,
  );
  assert.ok(
    status.models
      .filter((model) => model.provider === "cloudflare")
      .every((model) => !model.available),
  );
  for (const bad of [
    "",
    "abc",
    "a".repeat(31),
    "g".repeat(32),
    accountId + "/evil",
    null,
  ]) {
    assert.equal(
      (
        await req("/api/providers/cloudflare", {
          apiKey,
          accountId: bad,
          freePlanConfirmed: true,
        })
      ).status,
      400,
    );
  }
  for (const confirmation of [undefined, false, "true", 1]) {
    assert.equal(
      (
        await req("/api/providers/cloudflare", {
          apiKey,
          accountId,
          freePlanConfirmed: confirmation,
        })
      ).status,
      400,
    );
  }
  const configured = await configure(req);
  assert.equal(configured.status, 200);
  assert.doesNotMatch(
    JSON.stringify(configured.value),
    /private-cloudflare|encryptedKey/,
  );
  status = (await req("/api/status")).value;
  const provider = status.providers.find(
    (provider) => provider.id === "cloudflare",
  );
  assert.equal(provider.configured, true);
  assert.equal(provider.accountId, accountId);
  assert.equal(provider.freePlanConfirmed, true);
  assert.ok(
    status.models
      .filter((model) => model.provider === "cloudflare")
      .every((model) => model.available),
  );
  const disk = await readFile(path.join(dataDir, "state.json"), "utf8");
  assert.doesNotMatch(disk, /private-cloudflare-token/);
  assert.equal(JSON.parse(disk).providers.cloudflare.accountId, accountId);
  assert.equal((await submit(req, { prompt: "x".repeat(2049) })).status, 400);
  assert.equal((await submit(req, { aspectRatio: "16:9" })).status, 400);
  assert.equal(
    (await req("/api/providers/cloudflare", undefined, "DELETE")).status,
    200,
  );
  assert.equal((await submit(req)).status, 409);
});

test("Cloudflare uses fixed direct model paths and payloads and decodes result.image", async (t) => {
  const { req, calls, dataDir } = await fixture(t);
  assert.equal((await configure(req)).status, 200);
  for (const [modelId, aspectRatio, expectedModel, expectedBody] of [
    [
      "cloudflare-flux",
      "1:1",
      "@cf/black-forest-labs/flux-1-schnell",
      { prompt: "A cloud forest", steps: 4 },
    ],
    ...[
      ["1:1", 1024, 1024],
      ["16:9", 1024, 576],
      ["9:16", 576, 1024],
    ].map(([ratio, width, height]) => [
      "cloudflare-lucid",
      ratio,
      "@cf/leonardo/lucid-origin",
      { prompt: "A cloud forest", width, height, num_steps: 20 },
    ]),
  ]) {
    const response = await submit(req, {
      modelId,
      aspectRatio,
      steps: 40,
      width: 2500,
      baseURL: "https://evil.example",
    });
    assert.equal(response.status, 202);
    const job = await finish(req, response.value.job.id);
    assert.equal(job.status, "completed");
    assert.equal(job.contentType, "image/png");
    assert.doesNotMatch(
      JSON.stringify(job),
      /private-cloudflare|accountId|encryptedKey|reservation/,
    );
    const call = calls.at(-1);
    assert.equal(
      call.url,
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${expectedModel}`,
    );
    assert.equal(call.init.headers.Authorization, `Bearer ${apiKey}`);
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.redirect, "error");
    assert.deepEqual(JSON.parse(call.init.body), expectedBody);
  }
  const jobs = JSON.parse(
    await readFile(path.join(dataDir, "state.json"), "utf8"),
  ).jobs;
  assert.doesNotMatch(JSON.stringify(jobs), /private-cloudflare|accountId/);
});

test("Cloudflare unsuccessful envelopes, malformed media and HTTP errors fail once without fallback or raw diagnostics", async (t) => {
  let calls = 0;
  let response = () =>
    Response.json({
      success: false,
      result: { image },
      errors: [{ message: apiKey }],
    });
  const { req } = await fixture(t, {
    transport: async () => {
      calls++;
      return response();
    },
  });
  assert.equal((await configure(req)).status, 200);
  for (const next of [
    response,
    () =>
      Response.json({
        success: true,
        result: { image: Buffer.from("<svg>active</svg>").toString("base64") },
      }),
    () => Response.json({ success: true, result: {} }),
    () => new Response(apiKey, { status: 429 }),
    () =>
      new Response("tiny", {
        headers: { "Content-Length": String(31 * 1024 * 1024) },
      }),
  ]) {
    response = next;
    const job = await finish(req, (await submit(req)).value.job.id);
    assert.equal(job.status, "failed");
    assert.doesNotMatch(JSON.stringify(job), /private-cloudflare|<svg>|errors/);
  }
  assert.equal(calls, 5);
  assert.equal(
    (await req("/api/status")).value.quotas.cloudflare.totalUsed,
    300,
  );
});

test("Cloudflare adapters reject unreviewed models and invalid account paths before network", async () => {
  let calls = 0;
  const options = {
    signal: new AbortController().signal,
    providerConfig: { accountId, freePlanConfirmed: true },
    transport: async () => {
      calls++;
      return Response.json({ result: { image } });
    },
  };
  for (const [modelId, config] of [
    ["paid-model", options.providerConfig],
    ["cloudflare-flux", { accountId: "../elsewhere", freePlanConfirmed: true }],
    ["cloudflare-flux", { accountId, freePlanConfirmed: false }],
  ]) {
    await assert.rejects(
      generate(
        {
          kind: "image",
          provider: "cloudflare",
          modelId,
          prompt: "forest",
          aspectRatio: "1:1",
        },
        apiKey,
        { ...options, providerConfig: config },
      ),
    );
  }
  assert.equal(calls, 0);
});

test("Cloudflare reservations share the UTC daily estimate, survive reconnect/restart, and reject before network", async (t) => {
  let now = Date.parse("2026-11-17T23:59:00Z");
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "cloudflare-persist-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const first = await fixture(t, { dataDir, keep: true, now: () => now });
  assert.equal((await configure(first.req)).status, 200);
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await finish(
          first.req,
          (await submit(first.req, { modelId: "cloudflare-lucid" })).value.job
            .id,
        )
      ).status,
      "completed",
    );
  for (let i = 0; i < 26; i++)
    assert.equal(
      (await finish(first.req, (await submit(first.req)).value.job.id)).status,
      "completed",
    );
  let quota = (await first.req("/api/status")).value.quotas.cloudflare;
  assert.deepEqual(quota, {
    totalLimit: 10000,
    totalUsed: 9960,
    totalRemaining: 40,
    resetAt: "2026-11-18T00:00:00.000Z",
    timezone: "UTC",
    scope: "app-estimate",
    units: "neurons",
  });
  assert.equal((await submit(first.req)).status, 429);
  assert.equal(first.calls.length, 29);
  await first.req("/api/providers/cloudflare", undefined, "DELETE");
  await configure(first.req);
  assert.equal((await submit(first.req)).status, 429);
  await first.handler.close();
  const next = await fixture(t, { dataDir, keep: true, now: () => now });
  assert.equal(
    (await submit(next.req, { modelId: "cloudflare-lucid" })).status,
    429,
  );
  assert.equal(next.calls.length, 0);
  now += 120000;
  quota = (await next.req("/api/status")).value.quotas.cloudflare;
  assert.equal(quota.totalUsed, 0);
  assert.equal(quota.totalRemaining, 10000);
  assert.equal(quota.resetAt, "2026-11-19T00:00:00.000Z");
  assert.equal(
    (await finish(next.req, (await submit(next.req)).value.job.id)).status,
    "completed",
  );
  assert.equal(next.calls.length, 1);
});

test("Cloudflare admission serializes simultaneous reservations across models", async (t) => {
  let release;
  let calls = 0;
  const { req } = await fixture(t, {
    transport: async () => {
      calls++;
      if (calls === 1)
        return new Promise((resolve) => {
          release = resolve;
        });
      return Response.json({ success: true, result: { image } });
    },
  });
  assert.equal((await configure(req)).status, 200);
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      submit(req, { modelId: "cloudflare-lucid" }),
    ),
  );
  assert.deepEqual(
    results.map((result) => result.status).sort(),
    [202, 202, 202, 429],
  );
  assert.equal(calls, 1);
  assert.equal(
    (await req("/api/status")).value.quotas.cloudflare.totalUsed,
    8400,
  );
  release(Response.json({ success: true, result: { image } }));
  for (const result of results.filter((result) => result.status === 202))
    assert.equal((await finish(req, result.value.job.id)).status, "completed");
  assert.equal(calls, 3);
});

test("queued Cloudflare requests reserve the current UTC day when crossing midnight and revoked config blocks submission", async (t) => {
  let now = Date.parse("2026-11-17T23:59:59Z");
  let release;
  let calls = 0;
  const { req } = await fixture(t, {
    now: () => now,
    transport: async () => {
      calls++;
      if (calls === 1)
        return new Promise((resolve) => {
          release = resolve;
        });
      return Response.json({ success: true, result: { image } });
    },
  });
  assert.equal((await configure(req)).status, 200);
  const running = (await submit(req)).value.job;
  const queued = (await submit(req, { modelId: "cloudflare-lucid" })).value.job;
  assert.equal(
    (await req("/api/status")).value.quotas.cloudflare.totalUsed,
    2860,
  );
  now += 2000;
  release(Response.json({ success: true, result: { image } }));
  assert.equal((await finish(req, running.id)).status, "completed");
  assert.equal((await finish(req, queued.id)).status, "completed");
  assert.equal(
    (await req("/api/status")).value.quotas.cloudflare.totalUsed,
    2800,
  );
  assert.equal(calls, 2);
  for (const config of [
    {},
    { accountId, freePlanConfirmed: false },
    { accountId: "bad", freePlanConfirmed: true },
  ]) {
    const models = catalog(
      { providers: { cloudflare: { encryptedKey: {}, ...config } } },
      {},
      now,
    );
    assert.ok(
      models
        .filter((model) => model.provider === "cloudflare")
        .every((model) => !model.available),
    );
  }
});
