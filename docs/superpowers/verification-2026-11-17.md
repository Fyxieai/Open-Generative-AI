# PARALLAX verification — 2026-11-17

## Verified

- Standalone client production build succeeds using Astryx 0.7.16 and custom compiled PARALLAX theme.
- 27/27 Node tests pass against mocked upstream transports and real local HTTP servers.
- Independent spec review and final quality/security review completed. Findings fixed: promotion expiry input, persistent client idempotency after uncertain submission, gateway disabled wording/form, sanitized Retry-After, portrait preview dimensions, preset selection and encoder startup cleanup.
- Browser image/video/code/library navigation and provider dialog inspected. Desktop 1440 and mobile 390 layouts inspected. No browser error logs on latest build.
- Real browser-generated PNG and six-second MP4 downloaded. First motion file inspected with ffprobe: 1280×720, 5.9959 seconds. Portrait exports also exercised.
- `npm audit --omit=dev`: 0 known findings. Full developer audit has 7 paths to one unpatched picomatch ReDoS, documented in free-studio/SECURITY.md.
- Astryx doctor built-output check: 0 failures,20 passes,2 warnings (inherited optional theme font metadata; actual app font loader is replaced with system-only CSS).
- Private AgentMail owner credential stored outside the repo, 0600. Dedicated verification inbox created. NovAI key configured securely. No paid generation or credits purchased.

## Remaining external work

- NovAI registration requires manual signup under its anti-automation rules, new-password entry and terms acceptance. Safari signup was opened and a user handoff requested. User completed registration and supplied a key; it was connected through the local backend. No account was created automatically.
- Agnes verification request did not deliver an email; signup remains incomplete.
- Live NovAI image and video both succeeded. Image:1024×1024 JPEG with AI watermark. First video attempt was throttled; polling was made slower with bounded GET-only retry, covered by a regression test. Second video succeeded without a paid fallback: H.264,1792×1024,5.108seconds. Provider dashboard showed $0 spend after image generation; no top-up occurred.
- Hostinger KVM2 deployed using the pre-existing custom SSH key. Separate PARALLAX service/volume and Traefik overlay preserve existing n8n, OpenShorts and command-center services. Existing hostname DNS supports `parallax.srv1599519.hstgr.cloud`; no DNS change needed. HTTPS certificate verified with normal certificate validation (Let's Encrypt, expires 2027-02-15), unauthenticated status returns 401, password login sets Secure/HttpOnly cookie, migrated image/video gallery serves valid byte ranges. Private access details stored outside Git with mode 0600. Initial reviewed container is live; Cloudflare update deployment verification follows below.

## Cloudflare expansion

- Added direct FLUX.1 Schnell and Leonardo Lucid Origin adapters; no gateway/fallback. Saved account credential read securely outside Git, account subscriptions API returned successful empty active subscription list, both model-search API checks succeeded. No paid plan or purchase activated.
- Live local jobs completed: FLUX `188ded84-2475-4313-95b0-3f8fe78a5560` and Lucid Origin `fc7c11ff-4b2c-4c0b-ae19-cda9f7fe9e07`, both JPEG. Image selector visibly shows FLUX, Lucid, CogView connected; Agnes remains explicitly unavailable.
- Shared persistent 10,000-Neuron UTC app estimate, fixed reservations 60/2,800 per model, explicit Workers Free confirmation, bounded decoded media, token encryption/redaction. Counts are conservative estimates, not account usage telemetry; Cloudflare Free provides the account billing boundary.
- Fresh backend tests: 34/34 pass. Spec review passes; independent quality/security review reports no critical or important issues. UI prompt-length guard added for switching from a longer-prompt model to FLUX.
- VPS Docker build of `d717fba` completed and image `parallax-studio:d717fba` deployed. Production status lists FLUX, Lucid Origin, CogView and CogVideoX as available. Hosted FLUX job `45ae9cfc-e01b-45bd-8d6b-b758ad1ecfce` completed; authenticated HTTPS media returned JPEG, 433,409 bytes. Browser password login succeeded; selector visibly shows the three connected image models, gallery includes the live VPS output, console errors empty. Screenshot saved as `parallax-hosted-models.jpg` in the local task artifacts. Live site retained as browser deliverable.
- Latest local build passes; Astryx built-output doctor reports 20 pass / 2 inherited font metadata warnings / 0 failures. The runtime uses system fonts and no remote font request. Build bundle-size advisory remains non-blocking.
- Docker CLI is installed locally but daemon is unavailable; Docker image build could not run. Compose configuration validation passed. Container image build/runtime remain unverified.

The app is running locally at http://127.0.0.1:3210. This is a local preview, not a deployed public studio.

Browser video decoder verification: readyState4,1792×1024,5.108108seconds, no media errors. Original preview viewport restored; studio tab retained as deliverable.
