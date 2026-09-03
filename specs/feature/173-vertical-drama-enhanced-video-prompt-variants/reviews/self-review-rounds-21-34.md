# Feature 173 Spec Review — Rounds 21–34

**Reviewer:** Main Codex conductor
**Date:** 2026-09-01
**Scope:** Fresh completeness audit after the prior Round 20 review, with
strict Legacy non-regression and cross-checks against the current TypeScript
contracts and Generic Commercial Video Director v11 package.

Rounds 21–32 were independent domain checks. Rounds 33–34 were clean
convergence checks after the final corrections. The earlier reviews remain in
`self-review-round-1.md`, `self-review-round-2.md`, and
`self-review-rounds-3-20.md`.

| Round | Focus | Finding | Disposition |
|---:|---|---|---|
| 21 | File and section inventory | Main spec, index, four implementation sections, and prior review records were present. | PASS. |
| 22 | Index/manifest integrity | Section references and files matched after correcting an overly narrow local count assertion. | PASS. |
| 23 | Legacy isolation | Existing `generateShotVideoPrompt`, active projection, flag-off behavior, and no-silent-fallback rules remained explicit. | PASS. |
| 24 | Viewed versus active state | Tab selection, preview rendering, Apply, refresh, and active-render badge rules were consistent. | PASS. |
| 25 | First variant-store initialization | First Enhanced success did not explicitly persist `activeVariant` when lazily creating the store. | CLOSED: seed `activeVariant: "legacy"` as a no-op state stamp and define the Legacy fingerprint provenance. |
| 26 | Complete typed prompt bundle | Existing clip fields `castPositionLock`, `effectiveRisk`, and `motionContractStatus` were not explicit in the variant bundle; `warnings` is pack-level while `identityQc`/`videoTask` are media lifecycle state. | CLOSED: include typed prompt metadata, retain diagnostics as variant provenance, and keep media/task state outside prompt variants. |
| 27 | Enhanced provenance completeness | Enhanced success needed an unambiguous minimum for the exact Feature 170 bundle, target capability snapshot, and provider profile/plan identity. | CLOSED: make those fields mandatory for successful Enhanced variants; allow omissions only for Legacy snapshots with visible provenance. |
| 28 | Generic input defaults and tools | Generic `researchMode=auto` and package tool toggles could be accidentally trusted by an adapter. | CLOSED: explicitly set research off unless admitted, use a Core-owned allow-list, and keep cost estimation advisory/Core-owned. |
| 29 | Edit/finalize concurrency and spend | Variant edit/finalize needed explicit revision/hash CAS and operation-level durable idempotency to prevent stale writes and ambiguous paid work. | CLOSED: add expected revision/hash CAS, `generate`/`finalize` operation identity, explicit confirmation/estimate, and ledger settlement rules. |
| 30 | Split-shot and late-result safety | Group-atomic Apply, ordered mappings, group fingerprints, row lock/CAS, and task guards covered partial and late completion paths. | PASS. |
| 31 | Model/runtime boundary | Image, authoring, and video roles stayed separate; locked target routing, isolated SDK bridge, package identity drift gate, and no global skill route remained explicit. | PASS. |
| 32 | Flags, persistence, recovery, security, and proof | Independent kill switches, no backfill, clip-scoped merge, credit safety, bounded payloads, redacted observability, acceptance, and browser proof were traceable. | PASS. |
| 33 | Clean convergence 1 | Re-read the updated main contract and sections 01–04; no unresolved MUST_FIX/MUST_DO_NOW marker or Legacy contradiction remained. | PASS. |
| 34 | Clean convergence 2 | Repeated exact assertions for first-store state, active/viewed separation, typed bundle, required provenance, locked routing, finalize identity, JSON validity, fence balance, and scope. | PASS. No new gap found. |

## Final result

The fresh audit completed 14 rounds, including two clean rounds after the last
fix. Together with the retained prior records, the spec has been reviewed
through Round 34. No unresolved MUST_FIX gap remains in the current design
scope.

The changes are specification-only and confined to Feature 173. No Legacy
callback, product route, shared SDK dependency, database migration, global skill
route, or existing media asset was changed. The intentional enablement gates
remain: isolated compatible SDK runtime, package version/entrypoint identity,
Core tool allow-list, capability seed, product implementation, and browser/
live-provider proof.
