# Section 06 — Integration, rollout, and final verification

## Goal

Prove cross-section behavior, add flags/observability, and prepare safe
rollout/rollback without claiming live provider or GPU readiness.

## Files

- Add focused integration tests under existing server/shared/Worker test paths.
- Add feature flag/policy keys using existing feature-flag conventions.
- Add migration dry-run/invariant checks and bounded operational diagnostics.
- Update section docs with actual paths/deviations after implementation.

## Required behavior

Exercise local source → derived QC → R2 verification → Series media projection
→ vector index → nine-shot picker. Test duplicate/replay, stale/revoked root,
offline, missing GPU/MCP, provider failure, crash recovery, and rollback.
Flags independently disable local ingest, AI planning, shot generation,
publication, and indexing while preserving legacy behavior and artifacts.
Metrics distinguish local processing, publication, index lag, QC rejection,
MCP capability failure, and authorization failure without raw path/source logs.

## Verification

Run focused Vitest suites, Worker typecheck/build/tests, Rust tests, JSON/schema
contract checks, UI contract checker, and `git diff --check`. Full repository
typecheck/build and browser/live GPU/MCP/R2/migration/deployment checks are
reported separately when baseline/environment prevents them.

## Acceptance

All section contracts align, no MUST_FIX remains in the implementation review,
flags/rollback are documented, and the final report clearly separates local
proof from unperformed runtime evidence.

## UI/UX Contract

### Target User / JTBD
N/A — integration gate; it verifies UI contracts from section 05.
### Surface Inventory
N/A — no new screen.
### Component Map
N/A — cross-section test ownership only.
### State Matrix
Integration fixtures cover success, blocked, stale, offline, revoked, recovery, and rollback states.
### Responsive Matrix
N/A — visual proof is tracked by section 05.
### Accessibility Acceptance
No release until section 05 accessibility checks pass.
### Copy Contract
No new copy; verify stable localized code mapping.
### Browser Evidence Required
Cross-section browser/native evidence checklist; live provider/GPU proof remains separate.
