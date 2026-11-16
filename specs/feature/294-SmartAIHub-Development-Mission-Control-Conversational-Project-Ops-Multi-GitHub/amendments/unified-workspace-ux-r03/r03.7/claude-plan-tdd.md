# R03.7 Focused Verification Plan

| Section | Verification |
|---|---|
| Contract/probe | Run existing `smartaihub-runner verify codex` only after inspecting its isolation behavior; capture binary/CLI version and redacted fresh result. Use fixture requests copied from Rust serde contracts. |
| Pairing/security | Hono tests: unauthenticated approval denied; wrong tenant/workspace denied; invalid signature, old/replayed nonce, unsupported contract, revoked device and expired/rotated credential denied; valid proof accepted once. |
| Runtime/control plane | PostgreSQL disposable fixtures: capabilities upsert idempotency, heartbeat freshness, canonical Job claim only once, attempt/fence matching, duplicate event idempotency, reconnect cursor replay without duplication, receipt binds exact attempt/session. |
| UI/identity | Existing Mission/Task tests verify exact Job and Attempt link, return context and workspace reauthorization; navigation has no dispatch/cancel side effect. Missing transcript/tool/terminal/diff/test evidence renders `NOT_CAPTURED`. |
| Release/UAT | Focused Platform build/tests, registered modular DEV controller health/source SHA and asset parity. Browser owner UAT only with normal authenticated MFA session; record pending if absent. |

Do not run destructive DB fixtures against DEV; use disposable PostgreSQL 15.17. Do not rerun completed PG15 fixture suites unless source, privilege design or environment materially changes.
