import { setTimeout as delay } from "node:timers/promises";
import { providerJSON, decodeImage, safeDownload } from "./network.mjs";

const BASE = {
  novai: "https://aiapi-pro.com/v1",
  agnes: "https://apihub.agnes-ai.com",
};
export async function generate(job, key, options) {
  const { signal } = options;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  const call = (url, body) =>
    providerJSON(
      url,
      {
        method: body === undefined ? "GET" : "POST",
        headers,
        signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      options,
    );
  const download = (url) => safeDownload(url, job.provider, job.kind, options);
  let result;
  if (job.kind === "image") {
    if (job.provider === "novai")
      result = await call(`${BASE.novai}/images/generations`, {
        model: "cogview-3-flash",
        prompt: job.prompt,
        size: "1024x1024",
      });
    else if (job.provider === "agnes")
      result = await call(`${BASE.agnes}/v1/images/generations`, {
        model: "agnes-image-2.1-flash",
        prompt: job.prompt,
        size: "1K",
        ratio: job.aspectRatio,
        return_base64: true,
      });
    else throw new Error("Provider is not enabled");
    const item = result.data?.[0];
    if (item?.b64_json) return decodeImage(item.b64_json);
    if (item?.url) return download(item.url);
    throw new Error("Provider returned no image media");
  }
  let poll;
  if (job.provider === "novai") {
    result = await call(`${BASE.novai}/video/generations`, {
      model: "cogvideox-flash",
      prompt: job.prompt,
      duration: 5,
    });
    const id = result.id ?? result.task_id;
    if (typeof id !== "string" || !id || id.length > 256)
      throw new Error("Provider returned no video task ID");
    poll = () =>
      call(
        `${BASE.novai}/video/generations/${encodeURIComponent(id)}?model=cogvideox-flash`,
      );
  } else if (job.provider === "agnes") {
    result = await call(`${BASE.agnes}/v1/videos`, {
      model: "agnes-video-2.5-flash",
      prompt: job.prompt,
      seconds: String(job.duration),
      mode: "text",
      size: "720P",
      aspect_ratio: job.aspectRatio,
    });
    const id = result.video_id ?? result.id;
    if (typeof id !== "string" || !id || id.length > 256)
      throw new Error("Provider returned no video task ID");
    poll = () =>
      call(
        `${BASE.agnes}/agnesapi?video_id=${encodeURIComponent(id)}&model_name=agnes-video-2.5-flash`,
      );
  } else throw new Error("Provider is not enabled");
  let throttles = 0;
  while (true) {
    // Free NovAI accounts allow five requests/minute, including status checks.
    await delay(
      options.pollIntervalMs ?? (job.provider === "novai" ? 15000 : 3000),
      undefined,
      { signal },
    );
    try {
      result = await poll();
    } catch (error) {
      if (error.upstreamStatus !== 429 || throttles++ >= 3) throw error;
      // GET polling is safe to repeat; never repeat the generation POST.
      await delay(
        Math.max(options.pollRetryDelayMs ?? 60000, error.retryAfterMs ?? 0),
        undefined,
        { signal },
      );
      continue;
    }
    const status = String(
      result.task_status ?? result.status ?? "",
    ).toUpperCase();
    if (
      ["FAILED", "FAILURE", "ERROR", "CANCELLED", "REJECTED"].includes(status)
    )
      throw new Error("Provider video generation failed");
    if (["SUCCESS", "SUCCEEDED", "COMPLETED"].includes(status)) {
      const url =
        job.provider === "novai"
          ? (result.video_result?.[0]?.url ?? result.video_url)
          : result.url;
      if (typeof url !== "string")
        throw new Error("Provider returned no video media");
      return download(url);
    }
  }
}
