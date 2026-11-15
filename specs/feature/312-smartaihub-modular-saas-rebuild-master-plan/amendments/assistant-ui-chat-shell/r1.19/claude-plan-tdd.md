# R1.19 Focused Verification Plan

| Section | Test-first cases |
|---|---|
| Canonical events | schema migration idempotency; envelope validation; stable IDs; per-thread cursor monotonicity; duplicate idempotency key returns original event; cross-tenant/workspace read denied; retention only deletes expired events |
| SSE/reconnect | authenticated event stream; Last-Event-ID catch-up; ordered replay; duplicate suppression; terminal state; interruption and reconnect; disconnect leaves worker job running; unsupported stream falls back to job polling; no duplicate run enqueue |
| Artifacts | upload/register/read/download; tenant/workspace/thread/run access denial; MIME and size validation; private URL expiry; text/Markdown/JSON/image/video preview metadata; untrusted HTML/script rendered inert; capability false until complete |
| Inspector/control links | canonical available-field projection; absent identities reported unavailable; thread/run/job link round-trip; current status updates after reload/reconnect; auth and tenant isolation; no new job/run/task/mission rows |
| UI | composer send/history/attachments unchanged; event progression; artifact preview open/close; inspector responsive drawer/tabs; layout checks for 1440x900, 820x1180, 390x844; locale and themes remain operable |
| Release/spec | migration applied evidence; focused unit/integration tests; package build/typecheck; Worker dry run; exact SHA DEV health/assets/API checks; handoff generation and SPEC traceability validation |

Do not claim authenticated user UAT from fixtures. If interactive MFA browser access is unavailable, preserve BLOCKED with a reproducible checklist.
