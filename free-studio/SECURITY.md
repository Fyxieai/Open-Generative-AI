# Security notes

The production image runs only the standalone Node built-in server and compiled client. It does not ship npm modules, Vite, the Astryx CLI, Electron, Next.js, or upstream plugin servers.

Keys are encrypted at rest with AES-256-GCM. The encryption key shares the data volume: this protects accidental state-file disclosure, not a compromised server or stolen complete backup. Do not expose the single-user app as a public signup service.

A password and exact HTTPS origin are mandatory in production. Local mode is loopback-only. Jobs are serialized, metadata persistent, retries explicit and media constrained by HTTPS host allowlists, public DNS validation pinned to TLS connections, byte limits and file signatures. Media signature tests are not a complete codec parser or malware scanner.

## Dependency audit on 2026-11-17

`npm audit --omit=dev` reports zero known production dependency vulnerabilities. Full developer-tool audit reports seven high findings, all paths to one unpatched picomatch ReDoS advisory [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). It affects build/CLI glob parsing, not this app's runtime request handler. Build only trusted repository source, keep developer tools off public interfaces, and update when a supported patch is published. Downgrading the whole toolchain is not assumed to fix it.

The original upstream runtime is retained for reference and has not been hardened by these isolated changes. Do not deploy its legacy root npm scripts or desktop binary under the assumption this review secures them.

Provider $0 pricing and quotas are external state. The model allowlist and expiry confirmation cannot guarantee future prices or provider uptime. Register one account per provider under its own rules. No automated credit farming, duplicate-account rotation or paid fallbacks are included.
