# Free Studio

Approved direction: the user asked to implement the proposed private free-image-and-video studio, using the Open Generative AI fork, FreeLLMAPI-compatible routing, direct free provider adapters, and existing Hostinger KVM 2. Build and verify all work possible while obtaining account access.

The new default application lives in `free-studio/` and runs independently of the upstream Electron/Next.js/submodule stack. Keep upstream files and attribution for reference; production Docker deploys only the new application. UI direction: charcoal editing workspace, warm off-white type, lime action color, left navigation, large prompt composer, provider connection drawer, results gallery, visible free-access limits. No stock/demo generations presented as real output.

Architecture: React/Vite client; Node 22+ built-in HTTP server; encrypted provider credentials and persistent job/gallery metadata in a data directory. Single-user private access with HttpOnly session cookies; production requires a password. Local server binds loopback. Jobs are serialized with bounded submission and output sizes; no paid model IDs or automatic paid fallback. A provider's changing pricing is outside the application's control: expose the exact recurring/promotion limits and require short-lived acknowledgement before using promotional Agnes access. Never promise that a local toggle can override upstream billing.

Providers: direct NovAI CogView-3-Flash and CogVideoX-Flash; direct Agnes Image 2.1 Flash and Video 2.5 Flash with current API schema. Optional FreeLLMAPI supports explicit reviewed NovAI free model IDs, with response-header provider verification, no `auto` model. No arbitrary browser-supplied endpoints or output URLs. Output downloads require HTTPS, known CDN host allowlists, private-address rejection, no forwarded provider credential, bounded bytes, and safe redirect handling.

API contract:
- `GET /api/session` → `{authenticated,localMode}`. Local loopback-only mode without a configured password may be authenticated; production cannot use this mode.
- `POST /api/login` with `{password}` and `POST /api/logout`.
- `GET /api/status` → `{freeOnly:true,providers:[{id,label,configured,freeUntil}],models:[{id,label,provider,kind,available,unavailableReason,freeType,description,aspectRatios,durations}],queue:{running,waiting}}`.
- Model IDs: `novai-image`, `novai-video`, `agnes-image`, `agnes-video`, `freellmapi-image`, `freellmapi-video`. Kind is `image` or `video`. `freeType` is `recurring` or `promotion`.
- `POST /api/providers/:id` with `{apiKey,freeUntil?}`; IDs `novai`, `agnes`, `freellmapi`. Never return raw keys. `DELETE` clears that provider. Base URL for FreeLLMAPI comes from server env only. Promotion confirmation can be at most 24 hours ahead; expired confirmation disables Agnes submission.
- `GET /api/jobs` → `{jobs:[{id,kind,modelId,provider,prompt,aspectRatio,duration,status,createdAt,updatedAt,error?,mediaUrl?,contentType?}]}`. Status is `queued|running|completed|failed|cancelled`.
- `POST /api/jobs` with `{modelId,prompt,aspectRatio,duration?}` → `{job}` status202. Prompt1–4000 characters. No user-supplied arbitrary model ID. NovAI video5 seconds16:9; Agnes video4–12 seconds720P. Validate against catalog before provider access. Submission idempotency via `Idempotency-Key`.
- `POST /api/jobs/:id/cancel` → `{job}`. `DELETE /api/jobs/:id` deletes only completed/failed/cancelled app-owned data.
- `/api/media/:jobId` serves authenticated stored bytes, supports video range requests and `?download=1`; no arbitrary filesystem paths.
- `GET /api/health` is a non-sensitive liveness check.
- All API errors `{error:string,code?:string}`. Same-origin mutations, rate-limited login, no secret logging, CSP/security headers, JSON size caps, server-side persistent credentials AES-256-GCM with0600 key material. Test-only dependency injection for provider requests must never enable production mock output.

Provider details:
NovAI `https://aiapi-pro.com/v1`: image POST `/images/generations` model `cogview-3-flash`, parse URL/b64 response; video POST `/video/generations` model `cogvideox-flash`, `{prompt,duration:5}`, poll GET `/video/generations/:id?model=cogvideox-flash`, status SUCCESS/SUCCEEDED/COMPLETED, result `video_result[0].url` or `video_url`. Enforce conservative app-side daily submission counters10 total/5 video (reset00:00UTC+8); provider remains authority, surface429 and retry time. No automatic second paid submission.
Agnes base `https://apihub.agnes-ai.com`: image POST `/v1/images/generations` model `agnes-image-2.1-flash`, size`1K`, ratio, return_base64. Video POST `/v1/videos` model `agnes-video-2.5-flash`, prompt, `seconds` string, mode`text`, size`720P`, aspect_ratio; poll `/agnesapi?video_id=...&model_name=agnes-video-2.5-flash`, resulttop-levelurl, statuscompleted/failed. Provider free access is promotional, gated by explicit expiring confirmation.

Deployment: standalone Docker image, non-root runtime, persistent data volume, loopback published port, authenticated HTTPS through the existing reverse proxy where authorized. Do not alter existing n8n data or containers. Pin FreeLLMAPI image/commit if deployed, keep it private; optional service is not needed for direct adapters. No secrets in Git, artifacts, logs, screenshots, or chat.

Acceptance: meaningful provider fixtures and HTTP/auth/SSRF tests pass; client production build passes; browser workflow for login, setup, modelselection, submission validation, pending/completed/error gallery states is checked. Live output and VPS deployment are verified only when external account access permits; report any remaining blocker explicitly.
