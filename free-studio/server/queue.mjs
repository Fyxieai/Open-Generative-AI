import { randomUUID } from "node:crypto";
import { generate } from "./providers.mjs";
import { validateJob } from "./catalog.mjs";

const ACTIVE = new Set(["queued", "running"]);
const dayKey = (now) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const utcDayKey = (now) => new Date(now).toISOString().slice(0, 10);
const CLOUDFLARE_COSTS = { "cloudflare-flux": 60, "cloudflare-lucid": 2800 };
function publicJob(job) {
  const { reservationDay, ...safe } = job;
  return safe;
}
export class JobQueue {
  constructor(store, options) {
    this.store = store;
    this.options = options;
    this.current = null;
    this.work = null;
    this.closed = false;
  }
  list() {
    return this.store.state.jobs.map(publicJob).reverse();
  }
  counts() {
    return {
      running: this.current ? 1 : 0,
      waiting: this.store.state.jobs.filter((job) => job.status === "queued")
        .length,
    };
  }
  now() {
    return (this.options.now ?? Date.now)();
  }
  quotas() {
    const day = dayKey(this.now());
    const utcDay = utcDayKey(this.now());
    const neurons = this.store.state.quota.cloudflare?.[utcDay]?.total ?? 0;
    const used = this.store.state.quota[day] ?? { total: 0, video: 0 };
    return {
      cloudflare: {
        totalLimit: 10000,
        totalUsed: neurons,
        totalRemaining: Math.max(0, 10000 - neurons),
        resetAt: new Date(
          Date.parse(utcDay + "T00:00:00.000Z") + 86400000,
        ).toISOString(),
        timezone: "UTC",
        scope: "app-estimate",
        units: "neurons",
      },
      novai: {
        totalLimit: 10,
        videoLimit: 5,
        totalUsed: used.total,
        videoUsed: used.video,
        totalRemaining: Math.max(0, 10 - used.total),
        videoRemaining: Math.max(0, 5 - used.video),
        resetAt: new Date(
          Date.parse(day + "T00:00:00.000Z") + 16 * 3600000,
        ).toISOString(),
        timezone: "UTC+8",
        scope: "app",
      },
    };
  }
  quotaFor(day) {
    return (this.store.state.quota[day] ??= { total: 0, video: 0 });
  }
  reserve(job) {
    if (job.provider === "cloudflare") {
      const day = utcDayKey(this.now());
      const cost = CLOUDFLARE_COSTS[job.modelId];
      const history = (this.store.state.quota.cloudflare ??= {});
      const quota = (history[day] ??= { total: 0 });
      if (!cost || quota.total + cost > 10000)
        throw Object.assign(
          new Error(
            "App Cloudflare daily neuron estimate limit reached. Resets at 00:00 UTC; other account use may reduce actual availability.",
          ),
          { status: 429 },
        );
      quota.total += cost;
      job.reservationDay = day;
      return;
    }
    const day = dayKey(this.now());
    const quota = this.quotaFor(day);
    if (quota.total >= 10 || (job.kind === "video" && quota.video >= 5))
      throw Object.assign(
        new Error(
          "App NovAI daily submission limit reached. Resets at 00:00 UTC+8; other account activity may also affect provider availability.",
        ),
        { status: 429 },
      );
    quota.total++;
    if (job.kind === "video") quota.video++;
    job.reservationDay = day;
  }
  async submit(body, idempotency) {
    const state = this.store.state;
    if (this.closed)
      throw Object.assign(new Error("Studio is shutting down"), {
        status: 503,
      });
    if (
      idempotency &&
      (idempotency.length > 128 || !/^[\x21-\x7e]+$/.test(idempotency))
    )
      throw Object.assign(new Error("Invalid Idempotency-Key"), {
        status: 400,
      });
    if (idempotency && Object.hasOwn(state.idempotency, idempotency)) {
      const prior = state.jobs.find(
        (job) => job.id === state.idempotency[idempotency],
      );
      if (prior) return publicJob(prior);
      throw Object.assign(
        new Error(
          "This idempotency key belongs to a deleted job; use a new key.",
        ),
        { status: 409 },
      );
    }
    const { model, prompt, duration } = validateJob(
      body,
      state,
      this.options.env,
      this.now(),
    );
    if (this.counts().waiting >= (this.options.maxWaiting ?? 8) && this.current)
      throw Object.assign(
        new Error("Queue is full. Try after a job finishes."),
        { status: 429 },
      );
    const timestamp = new Date(this.now()).toISOString();
    const job = {
      id: randomUUID(),
      kind: model.kind,
      modelId: model.id,
      provider: model.provider,
      prompt,
      aspectRatio: body.aspectRatio,
      ...(duration === undefined ? {} : { duration }),
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (["novai", "cloudflare"].includes(job.provider)) this.reserve(job);
    state.jobs.push(job);
    if (idempotency) state.idempotency[idempotency] = job.id;
    await this.store.save();
    this.pump();
    return publicJob(job);
  }
  pump() {
    if (this.current || this.closed) return;
    const job = this.store.state.jobs.find((job) => job.status === "queued");
    if (!job) return;
    const controller = new AbortController();
    this.current = { job, controller };
    job.status = "running";
    job.updatedAt = new Date(this.now()).toISOString();
    this.work = this.run(job, controller)
      .catch(() => {
        this.closed = true;
      })
      .finally(() => {
        this.current = null;
        this.work = null;
        this.pump();
      });
  }
  async run(job, controller) {
    const timeout = setTimeout(
      () => controller.abort(new Error("deadline")),
      Math.min(this.options.deadlineMs ?? 300000, 300000),
    );
    timeout.unref();
    try {
      // A queued reservation from yesterday must also count against today's cap.
      if (job.provider === "novai" && job.reservationDay !== dayKey(this.now()))
        this.reserve(job);
      if (
        job.provider === "cloudflare" &&
        job.reservationDay !== utcDayKey(this.now())
      )
        this.reserve(job);
      // Recheck promotions and revoked keys at execution time.
      validateJob(job, this.store.state, this.options.env, this.now());
      await this.store.save();
      const media = await generate(job, this.store.keyFor(job.provider), {
        ...this.options,
        providerConfig:
          job.provider === "cloudflare"
            ? {
                accountId: this.store.state.providers.cloudflare?.accountId,
                freePlanConfirmed:
                  this.store.state.providers.cloudflare?.freePlanConfirmed,
              }
            : undefined,
        signal: controller.signal,
      });
      if (controller.signal.aborted || job.status === "cancelled") return;
      await this.store.saveMedia(job.id, media.bytes);
      if (controller.signal.aborted || job.status === "cancelled") {
        await this.store.removeMedia(job.id);
        return;
      }
      job.status = "completed";
      job.contentType = media.contentType;
      job.mediaUrl = "/api/media/" + job.id;
    } catch (error) {
      if (job.status !== "cancelled") {
        job.status = "failed";
        // Only errors authored in this application may reach a browser. Provider
        // bodies and arbitrary transport exceptions can contain credentials.
        const allowed =
          /^(Provider returned (invalid|no)|Provider (request|video) |Output |Media exceeds |Image exceeds |App (NovAI|Cloudflare) |Free promotion |Add a provider)/;
        job.error = controller.signal.aborted
          ? "Generation deadline exceeded or server stopped. No automatic retry was made."
          : allowed.test(error.message)
            ? error.message
            : "Generation failed. Check your provider account and try a new job.";
      }
    } finally {
      clearTimeout(timeout);
      job.updatedAt = new Date(this.now()).toISOString();
      await this.store.save();
    }
  }
  find(id) {
    return this.store.state.jobs.find((job) => job.id === id);
  }
  async cancel(id) {
    const job = this.find(id);
    if (!job) throw Object.assign(new Error("Job not found"), { status: 404 });
    if (ACTIVE.has(job.status)) {
      job.status = "cancelled";
      job.updatedAt = new Date(this.now()).toISOString();
      if (this.current?.job.id === id)
        this.current.controller.abort(new Error("cancelled"));
      await this.store.save();
    }
    return publicJob(job);
  }
  async remove(id) {
    const job = this.find(id);
    if (!job) throw Object.assign(new Error("Job not found"), { status: 404 });
    if (ACTIVE.has(job.status) || this.current?.job.id === id)
      throw Object.assign(
        new Error("Cancel or finish the job before deleting it"),
        { status: 409 },
      );
    await this.store.removeMedia(id);
    this.store.state.jobs = this.store.state.jobs.filter(
      (job) => job.id !== id,
    );
    await this.store.save();
  }
  async close() {
    this.closed = true;
    this.current?.controller.abort(new Error("shutdown"));
    await this.work;
    await this.store.pending;
  }
}
