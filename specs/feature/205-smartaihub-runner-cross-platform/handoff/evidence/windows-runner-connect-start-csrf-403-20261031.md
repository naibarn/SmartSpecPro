# Windows Runner pairing start rejected before browser launch — 2026-10-31

- WorkUnit: `SPEC205_WINDOWS_RUNNER_BROWSER_RECONNECT_UX_20261031`
- Owner Debug Report: Runner `0.2.52`; `lastConnectErrorCode=RUNNER_CONNECT_START_REJECTED_403`; `credentialRefreshErrorCode=RUNNER_REFRESH_CREDENTIAL_SIGNATURE_INVALID`; `running=false`; no fresh capability ACK or heartbeat.
- Root cause: native Runner `POST /api/runners/connect/start` sends no browser `Origin`. In the Cloudflare production ingress path, CSRF middleware rejects no-Origin writes when a verified public edge origin is present. The request therefore never reaches the pairing handler, so no verification URL exists and the OS browser handler is never invoked. Refresh signature rejection separately requires browser reauthorization; it was not the cause of the missing browser window.

## Repair

- Source SHA: `6d9d829bdb4bc46474b68e3d21bec46626a8a77b`.
- CSRF now permits no-Origin requests only for the exact native device-flow endpoints `/api/runners/connect/start` and `/api/runners/connect/token`, and only when the SmartAIHub browser session cookie is absent. If an Origin is supplied, normal configured-origin validation still applies. Cookie-authenticated writes remain blocked.
- Runner desktop UI preserves the most recent connect-attempt failure across status refresh so it is not replaced by an older credential-refresh message.
- Focused verification: production-mode CSRF middleware tests, 11 passed; `node --check apps/runner-desktop/ui/app.js`; `git diff --check`.
- Development release: `aimarkethubs.com`, `smartspec-dev-web.service`, port `3100`, source `6d9d829bdb4bc46474b68e3d21bec46626a8a77b`, public immutable asset SHA-256 `c8c870fab3f7f3749275b113eed4462a263ef2685f4cbb9ccbb773dd11918b6b`, artifact SHA-256 `0d2a731b21286b83c9505a4d3be9e00d5ecc85031306213f0f09b034523fe2ab`. `https://aimarkethubs.com/healthz` returned `{"status":"ok"}`. A non-mutating empty JSON POST to `/api/runners/connect/start` returned HTTP 400 `RUNNER_REQUEST_INVALID` (the expected route validation response), rather than being rejected by CSRF with 403.
- Production `smartspec-web.service` release pointer and service fingerprint were unchanged by the development release.
- Runtime caveat: the dev service reports backend runtime revision `6d9d829bdb4bc46474b68e3d21bec46626a8a77b-dirty` because unrelated files are dirty in the primary checkout. They were preserved and not staged; this receipt does not prove a clean source-to-runtime backend match.

## Acceptance boundary

- The deployed development boundary is verified, but no valid pairing request was created during verification. The Windows owner must click reconnect against this development Control Plane, authenticate/approve the displayed request, and then verify same Runner/device identity, capability ACK and heartbeat.
- Runtime acceptance remains pending. This development deployment does not update `smartaihub.app` production. If the installed Runner targets production, this fix is not yet live for that Runner; production deployment was not performed.
