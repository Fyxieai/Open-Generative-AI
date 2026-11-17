# PARALLAX

A private image, video, and code-art studio. An isolated runtime in this fork of [Open Generative AI](https://github.com/anil-matcha/open-generative-ai), built with Meta [Astryx](https://github.com/meta/astryx), an original dark theme and geometric logo.

## Included

- Direct image and asynchronous video adapters for reviewed NovAI and Agnes Flash models.
- Encrypted server-side provider keys, private login, same-origin requests, persistent serial jobs, cancellation, downloads and video seeking.
- Daily allowance display: NovAI 10 shared calls, including at most 5 videos; midnight UTC+8 reset. Counts are conservative studio submissions, not a provider balance.
- Browser code-art lab: four procedural designs, optional title, landscape/square/portrait, PNG and six-second MP4 or WebM motion exports. No provider key or daily quota. Keep the tab visible during motion rendering. Exports download locally, outside the AI library.

Free tiers have limits. Agnes $0 access is promotional and requires a user-confirmed expiry within 24 hours. The allowlist prevents paid-model selection and automatic fallback; it cannot control future provider pricing. FreeLLMAPI routes remain disabled because upstream routing cannot bind requests to one reviewed provider before submission.

**Live NovAI image and video generation verified on 2026-11-17.** Adapter/security tests separately use mocked upstream responses. Agnes access has not been live-tested. Connect your own provider account before use.

## Local

Requires Node 22.20+.

```sh
cd free-studio
npm ci --ignore-scripts
npm run build
npm start
```

Open **http://127.0.0.1:3210**. Default mode binds to loopback and accepts only loopback Host values. Do not expose this mode through a tunnel. Keys and outputs are in `free-studio/data/`; protect and back up the whole directory, including `secret.key`.

For Vite development, start the backend with `STUDIO_ORIGIN=http://127.0.0.1:3211 node server/index.mjs`, then run `npm run dev` separately and open port 3211. This origin setting is required for mutations.

## Hostinger / production

KVM2 can host this app and outputs; it does not run a video diffusion model. Leave existing n8n containers and volumes intact.

```sh
cp .env.example .env
# Set your exact HTTPS origin and a long unique studio password.
chmod 600 .env
docker compose up -d --build
```

The standalone container uses a non-root user, read-only filesystem, resource limits and separate persistent volume. Port 3210 binds only to VPS loopback. Configure an HTTPS reverse proxy for the origin. For a Docker proxy, attach the studio to a dedicated shared proxy network and remove the host port; do not replace existing n8n deployment files.

| Environment | Purpose |
| --- | --- |
| `STUDIO_PASSWORD` | Required for production or non-loopback binding |
| `STUDIO_ORIGIN` | Exact HTTPS origin in production, controls CSRF and cookies |
| `STUDIO_DATA_DIR` | Encrypted settings, master key, jobs, media; `/data` in Docker |
| `HOST`, `PORT` | Default `127.0.0.1:3210` outside Docker |
| `STUDIO_EXTRA_MEDIA_HOSTS` | Optional administrator-reviewed output CDN suffixes |

Back up the data volume and `.env` securely. Interrupted jobs fail on restart and are never automatically resubmitted. Cancellation cannot undo provider work already accepted. Monitor disk space and remove unwanted library outputs manually.

## Customize and verify

App: `free-studio/src/App.jsx`. Logo: `src/Brand.jsx`, `public/logo.svg`. Artwork: `src/art.mjs`. Theme: `free-studio/themes/parallax/parallax.theme.ts`.

```sh
cd free-studio
npm run astryx -- experimental theme compile themes/parallax/parallax.theme.ts
npm test
npm run build
npm run astryx -- doctor --built dist
npm audit
```

The compiled theme is checked in. UI requires no remote fonts, tracking or external media. This is a personal studio, not multi-user SaaS. Tests cover auth, CSRF, credential encryption, restricted models, quotas/reset, idempotency, restart/cancel/deadline behavior, failure redaction, Retry-After, DNS pinning, private address rejection, media size/type policy and ranges. They cannot establish availability of third-party free tiers. See [security notes](free-studio/SECURITY.md), including the unpatched development-only dependency advisory.

## Attribution

The upstream MIT application remains for reference, with its README at [docs/upstream/README.md](docs/upstream/README.md). Root Docker and compose now run only `free-studio/`; upstream Electron/Next packages and submodules are not installed, built or executed. Root upstream npm scripts are legacy, not PARALLAX instructions. Original copyright and LICENSE remain. Astryx template attribution is retained in source.
