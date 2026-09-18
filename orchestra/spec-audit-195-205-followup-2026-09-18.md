# Specs 195–205 follow-up audit

Date: 2026-09-18
Scope: cross-spec ownership, Feature 205 release/update implementation, UI
state safety and repository evidence.

This follow-up audit used ten different lenses. Each round passed after the
Dashboard Runner state/idempotency gap was fixed.

| Round | Lens | Result | Evidence |
|---:|---|---|---|
| 1 | Spec inventory and section completeness | PASS | Specs 195–205 exist; Feature 205 has all fourteen section files. |
| 2 | Ownership boundaries | PASS | 195 owns durable Jobs, 196 owns Goal/Plan, 197 owns Runner semantics, 198 owns Chat UI, 199 owns MCP upstreams and 200 owns External Agent semantics. |
| 3 | Durable execution truth | PASS | `worker_jobs`/`worker_job_events` remain canonical; no second durable Job ledger was added. |
| 4 | Runner/Container/editor boundary | PASS | 204 owns Cloudflare lifecycle, 205 owns Runner executable/entrypoint, and 203 consumes the shared profiles. |
| 5 | MCP/External Agent separation | PASS | Spec 199 retains MCP transport/lifecycle; Spec 200 retains delegated Agent runtime semantics. |
| 6 | Shared UI entry point | PASS | Feedback/Chat launcher and Universal Control Plane remain the inline Task Control surface; Runner and Worker App labels remain distinct. |
| 7 | Release catalog/update contract | PASS | Migrations 0336–0339, same-origin routes, command-bound update binary and durable publish gate align with Sections 10–14. |
| 8 | Manual workflow and stale references | PASS | Workflow is `workflow_dispatch`-only; no stale 0288/0289 or old update-binary route remains in Feature 205 release docs. |
| 9 | Verification/evidence boundaries | PASS | Focused tests, Rust tests, workflow verifier, module import probe and diff checks are recorded; native host, signing, provider and deployed-target evidence remain external. |
| 10 | Localization and final integrity | PASS | EN/TH locale JSON parses and `git diff --check` passes. |

## Gap fixed during this follow-up

The Dashboard Runner release card previously hid the update action for some
unsafe states, did not visibly show the latest version/last-check time, and
rendered update phases as raw enum values. It now keeps revoked Runners
visible, disables updates for offline/degraded, busy, revoked, untrusted and
incompatible states with localized reason copy, shows current/latest/last-
checked values, localizes queued/download/verifying/draining/restarting/
completed/failed/rollback phases, and reuses a stable client idempotency key
for retries. Focused UI regression tests cover online, offline and revoked
states.

The publish path also now rejects `publish=true` with `unsigned-review` at the
shared request schema and in the workflow validation step, preventing a GitHub
release that the server cannot safely sync because update signatures are absent.

## Verification

- Web focused suite: 8 files, 121 passed.
- Rust Runner: 35 passed; `cargo fmt -- --check` passed.
- Manual workflow verifier: passed.
- Runner release/update module import probe: passed.
- `git diff --check`: passed.
- Repository-wide TypeScript type check was not run because of the documented
  RAM constraint.

No safe in-scope MUST_FIX or MUST_DO_NOW gap remains. External environment
acceptance gates are intentionally not promoted to local passes.
