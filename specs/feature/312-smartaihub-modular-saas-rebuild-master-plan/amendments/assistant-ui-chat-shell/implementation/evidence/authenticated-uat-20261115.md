# SPEC-312 R1.18 — authenticated UAT attempt

**Run date:** 2026-11-15 (Asia/Bangkok)
**Target:** `https://aimarkethubs.com/chat` (`modular-debian-dev`)
**Deployed source:** `smartaihub-platform@e31402ecbbd12fe0c3bc23ae00dac89286c52a43`
**Previous deployment evidence:** [modular development release](modular-debian-dev-release-e31402e.md)

## Result matrix

| Area / scenario | Result | Evidence / reason |
| --- | --- | --- |
| Target mapping and active release | PASS | Registry and receipt identify `aimarkethubs.com`, Debian systemd/local Workerd, shared dev database `smartspec`, active release `...e31402e-responsive-chat-panels`. `smartaihub.app` and production `smartsihub.com` are separate targets. |
| Core, Chat and Shell public health | PASS | Core `/livez`, Chat `/api/chat/livez`, Shell `/`, and `/login` returned `200`. |
| Active Chat module and static assets | PASS | Current module manifest is version `0.1.0`; manifest, `.vite/manifest.json`, JS and CSS returned `200`. Public JS/CSS SHA-256 exactly match the deployed release artifact. |
| Unauthenticated Chat APIs | PASS | Session, capabilities, conversations, turn submission, attachment upload, attachment fetch and Core `/v1/core/me` returned `401` without cookies. No authenticated write was attempted. |
| Browser authentication redirect and MFA | BLOCKED | Orca `computer capabilities` failed with `accessibility_error` / sidecar exit code 1; `computer permissions` reports accessibility and screenshots are `unsupported`. No browser window or authenticated session can be controlled from this runtime. HTTP `200` on SPA routes is not treated as proof of client redirects. |
| Create conversation, send real prompt and receive backend response | BLOCKED | Requires authenticated browser session. The unauthenticated turn request was rejected with `401`; no real turn/job was created. |
| Streaming response | NOT TESTED | No event-stream endpoint (`text/event-stream`, `EventSource`, event cursor route) is present in Core/Shell/Chat source. Current implementation polls canonical worker-job status. Do not claim streaming; this needs a separately versioned persisted Core event contract. |
| Conversation/thread persistence, refresh and switching | BLOCKED | Requires authenticated browser interaction against the deployed account. |
| PNG and `.txt`/`.md` attachment send, owner fetch and preview | BLOCKED | No authenticated request was made. Unauthenticated upload/fetch correctly returned `401`. Existing unit tests cover a PNG + Markdown upload followed by one idempotent queue turn, but are not end-to-end UAT. |
| Cross-tenant attachment denial | BLOCKED | Live cross-tenant test requires two authenticated memberships/sessions. Code inspection shows storage keys and object metadata bind environment, workspace and user; this is not a substitute for runtime UAT. |
| Thread ID stability and reconnect without duplicate job | BLOCKED | Requires authenticated create/send/refresh/reconnect. Existing adapter/API tests cover stable IDs/idempotency only at unit level. |
| Agent/Run mapping | NOT TESTED | No persisted Agent/Run/event read contract is present; the UI correctly keeps these capabilities unavailable rather than fabricating data. |
| Task Control / Mission Control routes | NOT TESTED | No authenticated navigation was possible. These controls remain capability-gated/placeholder surfaces under the SPEC-312 boundary. |
| Responsive visual and interaction checks (1440×900, 820×1180, 390×844) | BLOCKED | No screenshots captured: Orca screenshot/accessibility capabilities are unsupported in this environment. No claim is made about viewport rendering from CSS inspection alone. |
| CSRF/session/workspace regression checks | PASS (automated only) | `authRoutes.test.ts`: 23/23 passed, including cross-origin login/workspace rejection, secure host-only dev cookie, MFA and session behavior. This does not certify the deployed authenticated flow. |
| Chat regression tests | PASS (automated only) | 6 files, 40/40 tests passed. Includes mocked attachment upload + single idempotent turn; not live-provider UAT. |
| Credential/log exposure | NOT TESTED | No authenticated runtime request or associated request logs were available to inspect. No credential, cookie or token was requested or stored. |

## Runtime/API configuration evidence

- Chat module loader uses same-origin `/modules/chat/current/module.manifest.json`, then the versioned asset manifest and asset prefix.
- Chat UI uses `/api/chat`; requests specify `credentials: "same-origin"` and tenant scope from the Core-verified membership. Worker build vars are `CHAT_TARGET_ID=modular-debian-dev` and `CORE_BASE_URL=https://aimarkethubs.com`.
- Cross-origin `OPTIONS` probes returned `404` with no `Access-Control-Allow-Origin`; same-origin browser requests are the supported path. Core automated tests reject cross-origin login/signup/workspace mutation.
- No code fix or redeployment was made during this UAT attempt: no authenticated failing request was captured, and the visible-browser tool is unavailable here. Existing deployed SHA remains `e31402e`.

## Blocker and resume action

Resume authenticated browser UAT when this execution has a supported browser-control session or a user-controlled authenticated browser that can be interactively operated. The account owner must enter credentials/MFA directly in that browser; never send credentials, OTPs, cookies or tokens in chat. Then record sanitized request status/error, safe job/conversation IDs, attachment ownership outcome, and the three viewport screenshots. Keep authenticated acceptance open until those checks pass.
