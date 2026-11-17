import test from "node:test";
import assert from "node:assert/strict";

test("output URL policy rejects credentials, redirects, private DNS and lookalike suffixes", async () => {
  const { safeDownload } = await import("../server/network.mjs");
  const publicDNS = async () => [{ address: "93.184.216.34", family: 4 }];
  let calls = 0;
  const transport = async () => {
    calls++;
    return new Response("bad", {
      status: 302,
      headers: { Location: "http://127.0.0.1/secret" },
    });
  };
  for (const url of [
    "http://cdn.aiapi-pro.com/a",
    "https://aiapi-pro.com.evil.org/a",
    "https://user:pass@cdn.aiapi-pro.com/a",
    "https://127.0.0.1/a",
    "https://cdn.aiapi-pro.com:8443/a",
  ])
    await assert.rejects(
      safeDownload(url, "novai", "image", { lookup: publicDNS, transport }),
      /URL|host|HTTPS|port/i,
    );
  assert.equal(calls, 0);
  await assert.rejects(
    safeDownload("https://cdn.aiapi-pro.com/a", "novai", "image", {
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
      transport,
    }),
    /private|public/i,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    safeDownload("https://cdn.aiapi-pro.com/a", "novai", "image", {
      lookup: publicDNS,
      transport,
    }),
    /redirect|response/i,
  );
  assert.equal(calls, 1);
});
test("DNS policy denies local, mapped and nonpublic addresses", async () => {
  const { isPublicAddress } = await import("../server/network.mjs");
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "198.18.1.1",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "2001:db8::1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("93.184.216.34"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});
test("download limits and content signatures reject active documents and oversized payloads", async () => {
  const { safeDownload, sniffMedia } = await import("../server/network.mjs");
  assert.throws(
    () => sniffMedia(Buffer.from("<svg><script>bad</script></svg>"), "image"),
    /media|image/i,
  );
  assert.throws(
    () => sniffMedia(Buffer.from("<html>bad</html>"), "video"),
    /media|video/i,
  );
  const options = {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    transport: async () =>
      new Response("tiny", {
        headers: { "content-length": String(21 * 1024 * 1024) },
      }),
  };
  await assert.rejects(
    safeDownload("https://cdn.aiapi-pro.com/a", "novai", "image", options),
    /large|limit/i,
  );
});
test("the HTTPS socket pins the checked DNS address and reuses the original TLS host", async (t) => {
  const https = await import("node:https");
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  const { pinnedRequest } = await import("../server/network.mjs");
  let lookups = 0;
  let socketOptions;
  let socketURL;
  t.mock.method(https.default, "request", (url, options, onResponse) => {
    socketOptions = options;
    socketURL = url;
    const request = new EventEmitter();
    request.write = () => {};
    request.setTimeout = () => {};
    request.end = () => {
      const response = new PassThrough();
      response.statusCode = 200;
      response.headers = {};
      onResponse(response);
      response.end("ok");
    };
    return request;
  });
  const response = await pinnedRequest(
    "https://cdn.aiapi-pro.com/a",
    {},
    {
      lookup: async () => {
        lookups++;
        return [
          { address: lookups === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 },
        ];
      },
    },
  );
  assert.equal(await response.text(), "ok");
  assert.equal(socketURL.hostname, "cdn.aiapi-pro.com");
  const pinned = await new Promise((resolve, reject) =>
    socketOptions.lookup("cdn.aiapi-pro.com", { all: true }, (error, result) =>
      error ? reject(error) : resolve(result),
    ),
  );
  assert.deepEqual(pinned, [{ address: "93.184.216.34", family: 4 }]);
  assert.equal(lookups, 1);
});
test("DNS resolution is cancelled promptly if a generation is cancelled", async () => {
  const { safeDownload } = await import("../server/network.mjs");
  const controller = new AbortController();
  let calls = 0;
  const pending = safeDownload(
    "https://cdn.aiapi-pro.com/a",
    "novai",
    "image",
    {
      signal: controller.signal,
      lookup: () => new Promise(() => {}),
      transport: async () => {
        calls++;
        return new Response("bad");
      },
    },
  );
  controller.abort(new Error("cancelled DNS"));
  const outcome = await Promise.race([
    pending.then(
      () => false,
      (error) => /cancelled DNS/.test(error.message),
    ),
    new Promise((resolve) => setTimeout(() => resolve(false), 50)),
  ]);
  assert.equal(outcome, true);
  assert.equal(calls, 0);
});
test("a bodyless upstream HTTP response becomes a bounded parse failure rather than a process error", async (t) => {
  const https = await import("node:https");
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  const { pinnedRequest } = await import("../server/network.mjs");
  t.mock.method(https.default, "request", (_url, _options, onResponse) => {
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.end = () => {
      const res = new PassThrough();
      res.statusCode = 204;
      res.headers = {};
      onResponse(res);
      res.end();
    };
    return req;
  });
  const response = await pinnedRequest(
    "https://aiapi-pro.com/v1/images/generations",
    {},
    { lookup: async () => [{ address: "93.184.216.34", family: 4 }] },
  );
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});
