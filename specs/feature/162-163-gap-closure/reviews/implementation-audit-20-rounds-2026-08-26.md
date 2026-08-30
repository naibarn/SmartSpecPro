# Feature 162/163 implementation audit — 20 rounds

Date: 2026-08-26
Scope: repository implementation of Feature 162 (Drama media intelligence,
local Worker preprocessing, shot generation) and Feature 163 (Worker App
sidebar, Series binding, media workspace).

## Result

The second ten-round convergence pass (rounds 11–20) found and closed the
following safe repository-level gaps:

1. Workflow policy now validates the global and per-operation defaults against
   the allowlist. Settings exposes defaults for B-roll preprocess, shot
   generation, image-to-video, and reference-to-video.
2. Workflow policy writes now use a server-generated revision, an optimistic
   compare-and-swap predicate, and a redacted audit event.
3. Required MCP capabilities are enforced for the actual operation inputs;
   framed operations require advertised start/reference capability evidence.
4. Shot retries resolve current policy and Worker capability again and pin the
   new resolution/capability snapshot.
5. Worker local media execution root-confines the canonical source before
   ffprobe or analysis, including traversal and Windows-separator rejection.
6. Vector retrieval normalizes positive safe Series IDs and matches the numeric
   type used in vector metadata.
7. Queue projection preserves canceled and expired terminal states.
8. `worker_jobs.workerSeriesBindingId` now has an additive FK with
   `ON DELETE SET NULL`; the migration stops on orphaned legacy pins instead of
   repairing or deleting them.

## Ten-round convergence ledger

| Round | Boundary checked | Finding/action | Result |
|---:|---|---|---|
| 11 | spec → plan → call paths | Reconciled both original specs, combined spec, seven plan sections, and source | clean |
| 12 | workflow policy/capability contract | Added allowlist cross-validation and conditional required capabilities | fixed |
| 13 | policy mutation | Added server revision, optimistic guard, audit, and per-operation UI fields | fixed |
| 14 | retry recovery | Re-resolve current policy/capability for shot retries | fixed |
| 15 | local media security | Confine canonical source before probe/analysis | fixed |
| 16 | MCP transport | Require declared frame capability for framed operations | fixed |
| 17 | vector retrieval | Normalize and validate Series ID type/value | fixed |
| 18 | queue/UI state | Project terminal canceled/expired states | fixed |
| 19 | schema/migration | Add guarded binding FK without data rewrite | fixed |
| 20 | final convergence | Re-ran relevant focused gates and static safety checks | clean |

## Fresh verification

- `cargo fmt --check` — pass.
- `cargo test --lib` — pass, 171 tests.
- Focused Web Vitest suite — pass, 66 tests across media contracts, MCP
  adapter, media services, Worker registry, and control-plane contracts.
- Worker App TypeScript check — pass (exit 0).
- Web TypeScript check — pass (exit 0) after the final changes.
- `git diff --check` — pass.
- Migration/journal review — pass statically; no migration was executed.

## Scope and evidence boundary

The combined repository implementation is internally consistent for its stated
outcomes. The broader original specs still contain staged or external-evidence
requirements that are not fabricated as complete:

- real detector/tracker-backed automatic subject following;
- a production LLM automated edit-plan/apply service;
- EpisodeResourcePlan with GPU lease, cost reservation/settlement, timeout and
  retention rollout controls;
- live ComfyUI/MiniMax H3/GPU/R2/vector-provider execution;
- packaged Tauri/browser evidence and production deployment proof.

The current safe behavior fails closed or keeps the intent in review when those
capabilities are not available. Original footage remains local until a verified
derived artifact is published. No migration, production database write,
deployment, restart, or destructive cleanup was performed in this audit.
