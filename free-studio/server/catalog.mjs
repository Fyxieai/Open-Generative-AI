export const PROVIDERS = [
  { id: "novai", label: "NovAI" },
  { id: "agnes", label: "Agnes (temporary promotion)" },
  { id: "cloudflare", label: "Cloudflare Workers AI" },
  { id: "freellmapi", label: "FreeLLMAPI (gateway disabled)" },
];
const models = [
  {
    id: "cloudflare-flux",
    label: "FLUX.1 Schnell",
    provider: "cloudflare",
    kind: "image",
    freeType: "recurring",
    description:
      "Workers Free plan required. Reserves an app estimate of 60 neurons at 4 steps; shares 10,000 neurons per UTC day. Other account use reduces availability. Paid plans can bill beyond the free allocation.",
    aspectRatios: ["1:1"],
    durations: [],
    promptMaxLength: 2048,
    estimatedNeurons: 60,
  },
  {
    id: "cloudflare-lucid",
    label: "Lucid Origin",
    provider: "cloudflare",
    kind: "image",
    freeType: "recurring",
    description:
      "Workers Free plan required. Reserves an app estimate of 2,800 neurons at 20 steps; shares 10,000 neurons per UTC day. This estimate cannot guarantee billing; check account usage and plan.",
    aspectRatios: ["1:1", "16:9", "9:16"],
    durations: [],
    promptMaxLength: 4000,
    estimatedNeurons: 2800,
  },
  {
    id: "novai-image",
    label: "CogView 3 Flash",
    provider: "novai",
    kind: "image",
    freeType: "recurring",
    description:
      "Reviewed free model. App limit: 10 total submissions and 5 videos per UTC+8 day. Other account use can reduce availability.",
    aspectRatios: ["1:1"],
    durations: [],
  },
  {
    id: "novai-video",
    label: "CogVideoX Flash",
    provider: "novai",
    kind: "video",
    freeType: "recurring",
    description:
      "Reviewed free model. Landscape, 5 seconds. Shares the app daily NovAI submission limits.",
    aspectRatios: ["16:9"],
    durations: [5],
  },
  {
    id: "agnes-image",
    label: "Agnes Image 2.1 Flash",
    provider: "agnes",
    kind: "image",
    freeType: "promotion",
    description:
      "Temporary provider promotion. Requires an explicit free-period confirmation renewed at least daily; provider pricing is outside app control.",
    aspectRatios: ["1:1", "16:9", "9:16"],
    durations: [],
  },
  {
    id: "agnes-video",
    label: "Agnes Video 2.5 Flash",
    provider: "agnes",
    kind: "video",
    freeType: "promotion",
    description:
      "Temporary provider promotion. Requires an explicit free-period confirmation. 720p, 4–12 seconds.",
    aspectRatios: ["16:9", "9:16"],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
  {
    id: "freellmapi-image",
    label: "FreeLLMAPI Image",
    provider: "freellmapi",
    kind: "image",
    freeType: "recurring",
    description:
      "Disabled: gateway model names do not bind a request to one reviewed provider.",
    aspectRatios: ["1:1"],
    durations: [],
  },
  {
    id: "freellmapi-video",
    label: "FreeLLMAPI Video",
    provider: "freellmapi",
    kind: "video",
    freeType: "recurring",
    description:
      "Disabled: gateway model names do not bind a request to one reviewed provider.",
    aspectRatios: ["16:9"],
    durations: [5],
  },
];
export function catalog(state, env, now) {
  return models.map((model) => {
    let reason = "";
    if (model.provider === "freellmapi")
      reason = env.FREELLMAPI_BASE_URL
        ? "Gateway cannot guarantee a reviewed platform-specific provider before submitting. Use a direct provider."
        : "FREELLMAPI_BASE_URL is not configured; gateway platform identity cannot be guaranteed.";
    else if (!state.providers[model.provider]?.encryptedKey)
      reason = "Add a provider API key in settings.";
    else if (
      model.provider === "cloudflare" &&
      !validCloudflareConfig(state.providers.cloudflare)
    )
      reason =
        "Add a valid Cloudflare account ID and explicitly confirm the Workers Free plan.";
    else if (
      model.provider === "agnes" &&
      !(Date.parse(state.providers.agnes.freeUntil) > now)
    )
      reason =
        "Free promotion confirmation is missing or expired. Confirm current free pricing and an end time within 24 hours.";
    return { ...model, available: !reason, unavailableReason: reason || null };
  });
}
export function providerStatus(state, env) {
  return PROVIDERS.map((provider) => ({
    ...provider,
    configured:
      provider.id === "freellmapi"
        ? Boolean(env.FREELLMAPI_BASE_URL)
        : Boolean(state.providers[provider.id]?.encryptedKey),
    freeUntil: state.providers[provider.id]?.freeUntil ?? null,
    ...(provider.id === "cloudflare"
      ? {
          accountId: /^[a-f0-9]{32}$/i.test(
            state.providers.cloudflare?.accountId ?? "",
          )
            ? state.providers.cloudflare.accountId
            : null,
          freePlanConfirmed:
            state.providers.cloudflare?.freePlanConfirmed === true,
        }
      : {}),
  }));
}
export function validCloudflareConfig(config) {
  return (
    typeof config?.accountId === "string" &&
    /^[a-f0-9]{32}$/i.test(config.accountId) &&
    config.freePlanConfirmed === true
  );
}
export function validateJob(body, state, env, now) {
  const model = catalog(state, env, now).find(
    (model) => model.id === body.modelId,
  );
  if (!model)
    throw Object.assign(
      new Error("Unknown model. Only reviewed free model IDs are allowed."),
      { status: 400 },
    );
  if (!model.available)
    throw Object.assign(new Error(model.unavailableReason), { status: 409 });
  const promptMaxLength = model.promptMaxLength ?? 4000;
  if (
    typeof body.prompt !== "string" ||
    !body.prompt.trim() ||
    body.prompt.trim().length > promptMaxLength
  )
    throw Object.assign(
      new Error(`Prompt must contain 1–${promptMaxLength} characters.`),
      {
        status: 400,
      },
    );
  if (!model.aspectRatios.includes(body.aspectRatio))
    throw Object.assign(new Error("Unsupported aspect ratio for this model."), {
      status: 400,
    });
  const duration =
    model.kind === "video" ? (body.duration ?? model.durations[0]) : undefined;
  if (model.kind === "video" && !model.durations.includes(duration))
    throw Object.assign(new Error("Unsupported duration for this model."), {
      status: 400,
    });
  return { model, prompt: body.prompt.trim(), duration };
}
