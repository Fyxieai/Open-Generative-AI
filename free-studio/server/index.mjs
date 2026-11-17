import http from "node:http";
import { createApp } from "./app.mjs";

const handler = createApp();
await handler.ready;
const port = Number(process.env.PORT ?? 3210);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535");
const host = process.env.HOST ?? "127.0.0.1";
const server = http.createServer(
  { requestTimeout: 30000, headersTimeout: 15000, maxHeaderSize: 16384 },
  handler,
);
server.listen(port, host, () =>
  console.log(`Free Studio listening on ${host}:${port}`),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  await handler.close();
  server.closeAllConnections();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
