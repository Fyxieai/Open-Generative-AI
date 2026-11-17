# Free Studio Implementation Plan

> For agentic workers: follow test-driven-development and verify results. Implement tasks in this session with subagent-driven-development, using one implementation worker and independent spec/code review. The controller handles client/deployment integration in disjoint files.

**Goal:** Deliver a private working image/video studio that uses reviewed free models and the existing KVM2, with honest free-tier controls.

**Architecture:** A standalone Node HTTP application and React client in `free-studio/`, isolated from the upstream runtime. Provider secrets and media remain server-side; serial jobs normalize the differing provider APIs.

**Tech stack:** Node22 built-ins, React, Vite, Node test runner, Docker and existing VPS reverse proxy.

## Task1: Server and provider adapters
- [ ] Write failing Node tests for catalog restrictions, credential encryption, promotion expiration, auth, origin rejection, bounded request bodies, serialized/idempotent jobs, quota, safe output URLs and byte limits, provider image parsing and asynchronous video polling.
- [ ] Implement `free-studio/server/{index,app,config,store,providers,media,jobs,auth}.mjs` and focused files as needed. Export `createApp(options)` for isolated HTTP tests and use mocked external transports only in test injection.
- [ ] Verify `node --test free-studio/tests/*.test.mjs`, inspect failures and fix implementation.
- [ ] Commit only server/test files after self-review; then independent spec review followed by code quality/security review.

## Task2: Client and packaging
- [ ] Create `free-studio/package.json`, Vite config, HTML entry, `src/{App.jsx,main.jsx,style.css}` and local icons with no paid services or remote trackers.
- [ ] Implement API-contract client with responsive editor, image/video controls, secure provider setup, explicit free-access wording, jobs gallery, downloads, cancellation, limits and accessible feedback.
- [ ] Install only this standalone package's dependencies. Run production build, dependency audit, and browser inspection.
- [ ] Update root README/defaultDockerfile/compose to use the standalone runtime, retain upstream attribution and document legacy application status.

## Task3: Accounts, integration and delivery
- [ ] Inspect authorized Hostinger existing services and available account access; use AgentMail only if configured and user-authorized.
- [ ] Perform independent spec then security/code review and fix findings.
- [ ] Start and inspect the local app. Test real provider generations only with verified free access and secure credentials.
- [ ] Deploy separately from n8n when remote access is available; verify authentication, HTTPS, media and persistence.
- [ ] Push branch to user fork; document exact checks, account/deployment blockers, and usage URL. Never imply mocked generation is live success.
