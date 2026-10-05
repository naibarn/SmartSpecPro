# Spec 261 Phase A — ten post-implementation gap-audit rounds

Audits were run after Sections 01–07 had implementations. Each round checked a different seam against its section contract; findings were repaired before the final verification below.

| Round | Surface | Audit result and closure | Evidence |
|---|---|---|---|
| 1 | Package contract and public exports | Confirmed package-scoped entrypoints and bounded named limits. The integrated test suite covers package contract, parser, inventory, graph, scanner, digest, and composer. | `pnpm --filter @smartspec/spaas-standard test`: 26 passed. |
| 2 | Parser limits and failure safety | Found that the pipeline did not forward caller limit overrides into V1. Forwarded the overrides; parser failures remain fixed-code/source-free and do not serialize dependency exceptions. | Parser boundary tests; package suite passed. |
| 3 | Canonical path identity | Found that path byte/depth overrides were ignored by normalization. Added configured ceilings and NFC, case-sensitive, slash-only logical identity. | Path ceiling and absolute/traversal/separator tests pass. |
| 4 | Manifest-to-inventory authority | Found that a supplied manifest could differ from `app.manifest.yaml` while the digest covered only the supplied semantic object. Pipeline now requires byte equality before a successful V2; added a mismatch regression. | `binds digest provenance to the exact authoritative manifest bytes` passes. |
| 5 | Dependency declarations and graph bounds | Found documented `skill:name` references were parsed as component IDs and graph ceilings were unenforced. Added skill/capability parsing, duplicate-edge rejection, node/edge limits, and stable comparator. | Documented skill-edge test; bounded graph code review; package suite passes. |
| 6 | Secret scan completeness | Found NUL-containing entries were silently skipped. Removed the skip; undecodable text now yields an incomplete V4 failure, and safe-path/content rules return redacted findings. | Invalid binary/UTF-8 test asserts incomplete scan; serialized finding test has no secret substring. |
| 7 | Digest framing and exclusions | Checked canonical semantic manifest framing, bytewise path order, `app.lock.json` inclusion, exact `.git` and `provenance/signatures/**` exclusions, and rejection of malformed inventory / extra fields. | Fixed-exclusion and digest tests; `git diff --check` passes. |
| 8 | External evidence binding | Found evidence could be accepted without explicit time/check identity or could be ambiguous. Evidence now binds stage check, digest, manifest identity/version, profile, observation/expiry window, safe codes, and one evidence ID; invalid/duplicate evidence fails closed. | Wrong-digest evidence regression passes; stage summaries expose only accepted IDs. |
| 9 | Report statuses and blockers | Found invalid external evidence was reported as `not_evaluated`, allowing `needs_context` to mask an evidence defect. It now marks the stage failed; report union includes the relevant failed/missing stage. | Wrong-digest evidence expects overall `invalid`; all eight fixed stages are asserted. |
| 10 | Cross-section and retired-system boundary | Rechecked V1–V8 composition, pure in-memory boundary, exported APIs, and forbidden retired-system references. No retired system is imported or called by the package. | `check-sections.py --planning-dir ...`: 7/7; focused tests 26/26; scoped `git diff --check` clean. |

## Remaining boundaries

V3 and V5–V8 facts remain `not_evaluated`/`needs_context` unless the host supplies matching trusted evidence. This package does not authenticate the evidence issuer. V4 rejects undecodable text rather than attempting heuristic binary credential extraction. No repository-wide TypeScript check was run, per repository memory constraints.
