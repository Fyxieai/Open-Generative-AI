import path from "node:path";
import { fileURLToPath } from "node:url";
import { stat, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Store } from "./store.mjs";
import { JobQueue } from "./queue.mjs";
import { Auth, configuration } from "./auth.mjs";
import { catalog, providerStatus, PROVIDERS } from "./catalog.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FINISHED = new Set(["completed", "failed", "cancelled"]);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};
function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
function failure(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
async function bodyJSON(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? ""))
    failure("Content-Type must be application/json", 415);
  const length = Number(req.headers["content-length"]);
  if (length > 65536) failure("JSON body exceeds 64 KB", 413);
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 65536) failure("JSON body exceeds 64 KB", 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    failure("Invalid JSON body");
  }
}
function secureHeaders(res) {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
}
async function media(req, res, store, job, download) {
  if (!job || job.status !== "completed" || !job.contentType)
    failure("Media not found", 404);
  const file = store.mediaPath(job.id);
  let metadata;
  try {
    metadata = await stat(file);
  } catch {
    failure("Media not found", 404);
  }
  let start = 0,
    end = metadata.size - 1,
    status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) {
      res.writeHead(416, { "Content-Range": `bytes */${metadata.size}` });
      res.end();
      return;
    }
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, metadata.size - suffix);
      if (!suffix) start = metadata.size;
    } else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= metadata.size
    ) {
      res.writeHead(416, { "Content-Range": `bytes */${metadata.size}` });
      res.end();
      return;
    }
    status = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${metadata.size}`);
  }
  const extension = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
  }[job.contentType];
  res.writeHead(status, {
    "Content-Type": job.contentType,
    "Content-Length": end - start + 1,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${job.id}.${extension}"`,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(file, { start, end });
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}
export function createApp(options = {}) {
  const env = options.env ?? process.env;
  const config = configuration(env);
  const store = new Store(
    path.resolve(
      options.dataDir ?? env.STUDIO_DATA_DIR ?? path.join(here, "../data"),
    ),
  );
  const now = options.now ?? Date.now;
  const auth = new Auth(config, store, now);
  const queue = new JobQueue(store, {
    ...options,
    env,
    extraHosts: (env.STUDIO_EXTRA_MEDIA_HOSTS ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  });
  const dist = path.resolve(options.distDir ?? path.join(here, "../dist"));
  // Mutations are serialized to make admission, quota reservations, persistent
  // idempotency and provider changes atomic relative to concurrent HTTP requests.
  let mutations = Promise.resolve();
  async function mutate(work) {
    const result = mutations.then(work);
    mutations = result.catch(() => {});
    return result;
  }
  async function route(req, res) {
    await store.ready;
    secureHeaders(res);
    if (config.secure)
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    let url;
    try {
      url = new URL(req.url, "http://studio.invalid");
    } catch {
      failure("Invalid URL");
    }
    const pathname = url.pathname;
    if (req.method === "GET" && pathname === "/api/health")
      return json(res, 200, { ok: true });
    if (req.method === "GET" && pathname === "/api/session")
      return json(res, 200, {
        authenticated: auth.authenticated(req),
        localMode: config.localMode,
      });
    const mutation = !["GET", "HEAD"].includes(req.method);
    if (pathname.startsWith("/api/") && mutation && !auth.sameOrigin(req))
      failure("Request origin is not allowed", 403);
    if (pathname === "/api/login" && req.method === "POST") {
      const body = await bodyJSON(req);
      res.setHeader("Set-Cookie", auth.login(req, body.password));
      return json(res, 200, { authenticated: true, localMode: false });
    }
    if (pathname.startsWith("/api/") && !auth.authenticated(req))
      failure("Authentication required", 401);
    if (pathname === "/api/logout" && req.method === "POST") {
      res.setHeader("Set-Cookie", auth.logout(req));
      return json(res, 200, {
        authenticated: config.localMode,
        localMode: config.localMode,
      });
    }
    if (pathname === "/api/status" && req.method === "GET")
      return json(res, 200, {
        freeOnly: true,
        providers: providerStatus(store.state, env),
        models: catalog(store.state, env, now()),
        queue: queue.counts(),
        quotas: queue.quotas(),
      });
    const providerMatch = /^\/api\/providers\/([a-z]+)$/.exec(pathname);
    if (providerMatch && ["POST", "DELETE"].includes(req.method)) {
      const id = providerMatch[1];
      if (!PROVIDERS.some((p) => p.id === id)) failure("Unknown provider");
      const body = req.method === "POST" ? await bodyJSON(req) : {};
      await mutate(async () => {
        if (req.method === "DELETE") delete store.state.providers[id];
        else {
          if (
            typeof body.apiKey !== "string" ||
            !body.apiKey.trim() ||
            body.apiKey.length > 4096 ||
            /[\r\n\x00]/.test(body.apiKey)
          )
            failure("API key must contain 1–4096 characters");
          let freeUntil;
          if (id === "agnes") {
            const timestamp = Date.parse(body.freeUntil);
            if (
              !Number.isFinite(timestamp) ||
              timestamp <= now() ||
              timestamp > now() + 24 * 3600000
            )
              failure(
                "Confirm a future free promotion end time within 24 hours.",
              );
            freeUntil = new Date(timestamp).toISOString();
          }
          store.state.providers[id] = {
            encryptedKey: store.encrypt(body.apiKey.trim()),
            ...(freeUntil ? { freeUntil } : {}),
          };
        }
        await store.save();
      });
      return json(res, 200, { providers: providerStatus(store.state, env) });
    }
    if (pathname === "/api/jobs" && req.method === "GET")
      return json(res, 200, { jobs: queue.list() });
    if (pathname === "/api/jobs" && req.method === "POST") {
      const body = await bodyJSON(req);
      const job = await mutate(() =>
        queue.submit(body, req.headers["idempotency-key"]),
      );
      return json(res, 202, { job });
    }
    const jobMatch = /^\/api\/jobs\/([a-f0-9-]{36})(\/cancel)?$/.exec(pathname);
    if (jobMatch && req.method === "POST" && jobMatch[2]) {
      const job = await mutate(() => queue.cancel(jobMatch[1]));
      return json(res, 200, { job });
    }
    if (jobMatch && req.method === "DELETE" && !jobMatch[2]) {
      await mutate(() => queue.remove(jobMatch[1]));
      return json(res, 200, { deleted: true });
    }
    const mediaMatch = /^\/api\/media\/([a-f0-9-]{36})$/.exec(pathname);
    if (mediaMatch && ["GET", "HEAD"].includes(req.method))
      return media(
        req,
        res,
        store,
        queue.find(mediaMatch[1]),
        url.searchParams.get("download") === "1",
      );
    if (pathname.startsWith("/api/")) failure("Endpoint not found", 404);
    if (!["GET", "HEAD"].includes(req.method))
      failure("Method not allowed", 405);
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      failure("Invalid URL");
    }
    if (decoded.includes("\0") || decoded.includes("\\"))
      failure("Invalid path");
    let file = path.resolve(dist, "." + decoded);
    if (file !== dist && !file.startsWith(dist + path.sep))
      failure("Not found", 404);
    let metadata;
    try {
      metadata = await stat(file);
    } catch {}
    if (metadata?.isDirectory() || !metadata)
      file = path.join(dist, "index.html");
    let bytes;
    try {
      bytes = await readFile(file);
    } catch {
      failure("Build the studio client before opening this page.", 404);
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control":
        path.basename(file) === "index.html"
          ? "no-cache"
          : "public, max-age=3600",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  }
  const handler = (req, res) => {
    route(req, res).catch((error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      secureHeaders(res);
      json(res, error.status ?? 500, {
        error: error.status
          ? error.message
          : "Studio could not complete this request.",
      });
    });
  };
  handler.ready = store.ready;
  handler.close = async () => {
    await store.ready;
    await mutations;
    await queue.close();
  };
  return handler;
}
