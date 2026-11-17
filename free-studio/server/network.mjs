import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";

const LIMITS = {
  image: 20 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  json: 1024 * 1024,
};
const CDN_HOSTS = {
  novai: ["aiapi-pro.com", "ufileos.com"],
  agnes: ["agnes-ai.space", "agnes-ai.com"],
};

// IPv6 is allowed only in ordinary globally routed 2000::/3 space. Reject
// transition/tunnel and documentation ranges rather than interpreting embedded IPs.
export function isPublicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || b === 2)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (net.isIP(address) !== 6) return false;
  const lower = address.toLowerCase();
  return (
    /^[23]/.test(lower) &&
    !lower.startsWith("2001:") &&
    !lower.startsWith("2002:") &&
    !lower.startsWith("3fff:")
  );
}
function checkedURL(value, hosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid output URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "Output URL must use HTTPS without credentials or custom port",
    );
  if (
    net.isIP(url.hostname) ||
    !hosts.some(
      (host) => url.hostname === host || url.hostname.endsWith("." + host),
    )
  )
    throw new Error("Output URL host is not allowed");
  return url;
}
async function resolvePublic(url, lookup = dns.lookup, signal) {
  signal?.throwIfAborted();
  const addresses = await new Promise((resolve, reject) => {
    const aborted = () => finish(signal.reason);
    const timer = setTimeout(
      () => finish(new Error("Upstream DNS deadline exceeded")),
      15000,
    );
    const finish = (error, result) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      error ? reject(error) : resolve(result);
    };
    signal?.addEventListener("abort", aborted, { once: true });
    Promise.resolve()
      .then(() => lookup(url.hostname, { all: true, verbatim: true }))
      .then(
        (result) => finish(null, result),
        (error) => finish(error),
      );
  });
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicAddress(item.address))
  )
    throw new Error("Upstream DNS must resolve only to public addresses");
  return addresses[0];
}

// The resolved address is pinned to the actual TLS connection. Hostname and SNI
// remain intact for certificate verification. Redirects are never followed.
export async function pinnedRequest(value, init = {}, options = {}) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("Invalid HTTPS upstream URL");
  const address =
    options.address ?? (await resolvePublic(url, options.lookup, init.signal));
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: init.method ?? "GET",
        headers: init.headers,
        signal: init.signal,
        lookup: (_hostname, lookupOptions, callback) => {
          if (lookupOptions?.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
      },
      (res) => {
        if ([204, 205, 304].includes(res.statusCode)) {
          res.resume();
          resolve(
            new Response(null, {
              status: res.statusCode,
              headers: res.headers,
            }),
          );
          return;
        }
        // Expose a fetch-style response, while retaining a streaming byte limit.
        const stream = new ReadableStream({
          start(controller) {
            res.on("data", (chunk) => {
              res.pause();
              controller.enqueue(new Uint8Array(chunk));
            });
            res.on("end", () => controller.close());
            res.on("error", (error) => controller.error(error));
          },
          pull() {
            res.resume();
          },
          cancel() {
            res.destroy();
          },
        });
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers))
          if (value !== undefined)
            headers.set(key, Array.isArray(value) ? value.join(",") : value);
        resolve(new Response(stream, { status: res.statusCode, headers }));
      },
    );
    req.on("error", reject);
    req.setTimeout(300000, () =>
      req.destroy(new Error("Upstream deadline exceeded")),
    );
    if (init.body) req.write(init.body);
    req.end();
  });
}
export async function readLimited(response, limit) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel();
    throw new Error("Media exceeds byte limit");
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error("Media exceeds byte limit");
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, total);
}
export function sniffMedia(bytes, kind) {
  if (kind === "image") {
    if (
      bytes.length >= 24 &&
      bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
      bytes.subarray(12, 16).toString() === "IHDR"
    )
      return "image/png";
    if (
      bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    )
      return "image/jpeg";
    if (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP"
    )
      return "image/webp";
  } else if (kind === "video") {
    if (
      bytes.length >= 16 &&
      bytes.subarray(4, 8).toString() === "ftyp" &&
      bytes.readUInt32BE(0) >= 16 &&
      bytes.readUInt32BE(0) <= bytes.length
    )
      return "video/mp4";
    if (
      bytes.length >= 16 &&
      bytes.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex")) &&
      bytes.subarray(0, 4096).includes(Buffer.from("webm"))
    )
      return "video/webm";
  }
  throw new Error(`Provider returned invalid ${kind} media`);
}
export async function safeDownload(value, provider, kind, options = {}) {
  options.signal?.throwIfAborted();
  const extra = (options.extraHosts ?? []).filter((host) =>
    /^[a-z0-9.-]+$/.test(host),
  );
  const url = checkedURL(value, [...(CDN_HOSTS[provider] ?? []), ...extra]);
  const address = await resolvePublic(url, options.lookup, options.signal);
  options.signal?.throwIfAborted();
  const response = await (
    options.transport ?? ((url, init) => pinnedRequest(url, init, { address }))
  )(url.toString(), {
    method: "GET",
    redirect: "error",
    signal: options.signal,
    headers: {},
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error("Output redirects are not allowed");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Output response failed");
  }
  const bytes = await readLimited(response, LIMITS[kind]);
  return { bytes, contentType: sniffMedia(bytes, kind) };
}
function retrySeconds(value, now) {
  if (typeof value !== "string" || value.length > 128) return null;
  let seconds;
  if (/^\d{1,12}$/.test(value)) seconds = Number(value);
  else {
    const standard =
      /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;
    const obsolete =
      /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2} \d{2}:\d{2}:\d{2} GMT$/;
    const asctime =
      /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/;
    if (!standard.test(value) && !obsolete.test(value) && !asctime.test(value))
      return null;
    const timestamp = Date.parse(asctime.test(value) ? value + " GMT" : value);
    if (!Number.isFinite(timestamp)) return null;
    seconds = Math.ceil((timestamp - now) / 1000);
  }
  return Math.max(0, Math.min(seconds, 86400));
}
export async function providerJSON(url, init, options = {}) {
  init.signal?.throwIfAborted();
  const response = await (
    options.transport ??
    ((u, i) => pinnedRequest(u, i, { lookup: options.lookup }))
  )(url, { ...init, redirect: "error" });
  if (!response.ok) {
    const retry =
      response.status === 429
        ? retrySeconds(
            response.headers.get("retry-after"),
            (options.now ?? Date.now)(),
          )
        : null;
    await response.body?.cancel();
    throw Object.assign(
      new Error(
        `Provider request failed (HTTP ${response.status})${retry === null ? "" : `. Retry after ${retry} seconds.`}`,
      ),
      {
        upstreamStatus: response.status,
        retryAfterMs: retry === null ? null : retry * 1000,
      },
    );
  }
  const bytes = await readLimited(response, LIMITS.json + 28 * 1024 * 1024);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Provider returned invalid JSON");
  }
}
export function decodeImage(value) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(LIMITS.image / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw new Error("Provider returned invalid image media");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > LIMITS.image) throw new Error("Image exceeds byte limit");
  return { bytes, contentType: sniffMedia(bytes, "image") };
}
