# Feature 179 — 50-round completeness audit

Date: 2026-09-06

Each round below was executed as a focused repository assertion against the current worktree. The audit loop returned `PASS 01` through `PASS 50`. A later focused test found one real idempotency gap; it was fixed and the relevant dynamic gates were rerun before this record was finalized.

| Round | Check | Result |
|---:|---|---|
| 01 | Section 01 contract file exists | PASS |
| 02 | All 8 implementation section files exist | PASS |
| 03 | Web contract version is `feature-179-v1` | PASS |
| 04 | Rust contract version matches Web | PASS |
| 05 | Worker scan job type is registered | PASS |
| 06 | Worker edit-plan job type is registered | PASS |
| 07 | Server capability requirement is present | PASS |
| 08 | Worker capability constant is present | PASS |
| 09 | Server adapter-policy hash gate is present | PASS |
| 10 | Canonical payload hash is used for scheduler idempotency | PASS after fix |
| 11 | Deny policy cannot fallback | PASS |
| 12 | Configured runner probe exists | PASS |
| 13 | Submit command blocks failed preflight | PASS |
| 14 | Local relative source field is contract-bound | PASS |
| 15 | Analysis artifact inputs are downloaded | PASS |
| 16 | Expired/missing source is typed | PASS |
| 17 | Worker root escape is rejected | PASS |
| 18 | Published artifact checksum is recorded | PASS |
| 19 | Publication progress stage is declared | PASS |
| 20 | Status query includes speaker-aware job types | PASS |
| 21 | Status query is tenant-scoped | PASS |
| 22 | Status query is user-scoped | PASS |
| 23 | Status query is Series-scoped | PASS |
| 24 | Remote input route only accepts active jobs | PASS |
| 25 | Remote input route binds artifact id to the job | PASS |
| 26 | Series binding revision is enforced | PASS |
| 27 | Series action permission is enforced | PASS |
| 28 | Tauri command is registered | PASS |
| 29 | Worker host callback is wired | PASS |
| 30 | Worker panel is mounted | PASS |
| 31 | Series parent submits the job | PASS |
| 32 | Stage definitions are explicit | PASS |
| 33 | Stage dependency validation exists | PASS |
| 34 | Manual review is required | PASS |
| 35 | Worker status uses accessible live messaging | PASS |
| 36 | Web Production status card exists | PASS |
| 37 | Web status polls active jobs | PASS |
| 38 | Web status has an error state | PASS |
| 39 | Worker panel CSS exists | PASS |
| 40 | Reduced-motion CSS exists | PASS |
| 41 | FFmpeg compiler exists | PASS |
| 42 | Remotion compiler exists | PASS |
| 43 | Render parity assertion exists | PASS |
| 44 | Renderers keep only approved ranges | PASS |
| 45 | Approval-required contract field exists | PASS |
| 46 | Parent edit-map hash linkage exists | PASS |
| 47 | Browser evidence document exists | PASS |
| 48 | At least 10 prior review records exist | PASS |
| 49 | Worker UI stage test source exists | PASS |
| 50 | `git diff --check` is clean | PASS |

## Gap closure

The scheduler previously returned an existing speaker-aware job solely by idempotency key. This was unsafe because the same key could be reused with a different payload. The scheduler now compares job type and `hashSpeakerAwarePayload(existing.inputJson)` against the requested payload and returns `idempotency_conflict` (HTTP 409 at the route boundary). A regression test was added and passed.

## Fresh gates after the fix

- Web scheduler/contracts/render/Production status focused tests: 50 passed.
- Worker TypeScript typecheck: passed.
- Rust full suite: 229 unit tests, 12 runtime-manifest tests, 21 worker-executor tests passed.
- Server router/control-plane import smoke: passed.
- `git diff --check`: passed.
- Full Web `npm run check`: intentionally skipped because of the previously reported RAM constraint.
- Browser, RTX/GPU, and real adapter-runner execution: skipped because those external runtimes are not available in this environment; no production proof is claimed.
