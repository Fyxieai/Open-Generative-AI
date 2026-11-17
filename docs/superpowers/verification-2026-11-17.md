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
- Hostinger KVM2 dashboard and authenticated root console inspected. Existing n8n, Traefik, OpenShorts and command-center containers verified with docker ps. Reviewed source commit97e938a was checked out at /opt/parallax-studio. Docker build commands could not be verified because native terminal input/rendering became unreliable. Existing services were left running; no DNS changes or public deployment occurred.
- Docker CLI is installed locally but daemon is unavailable; Docker image build could not run. Compose configuration validation passed. Container image build/runtime remain unverified.

The app is running locally at http://127.0.0.1:3210. This is a local preview, not a deployed public studio.

Browser video decoder verification: readyState4,1792×1024,5.108108seconds, no media errors. Original preview viewport restored; studio tab retained as deliverable.
