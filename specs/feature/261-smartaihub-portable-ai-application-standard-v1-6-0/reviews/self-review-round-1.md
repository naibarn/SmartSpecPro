# Adversarial Plan Review — Round 1

## Phase A checklist scorecard

| Category | Score | Result |
|---|---:|---|
| Structural integrity | 5/5 | All package modules have locations and pure input/output boundaries. |
| Completeness vs synthesized scope | 5/5 | Schema/parser, model, structure, graph, digest, secret scanning and V1–V8 composition covered. |
| Implementability | 5/5 | Package and module ownership, dependencies, limits, stable codes, tests and proof commands are defined. |
| Internal consistency | 5/5 | One issue found and fixed: digest exclusions were broad/ambiguous; closed policy now includes lock and secret-reference IDs. One cross-section ownership collision was found and fixed: semantic canonicalizer belongs to section 02; `paths.ts` belongs to section 03. |
| Edge cases/failure modes | 5/5 | Ambiguous YAML, resource limits, path traversal/collision, graph cycles, secret redaction, absent external evidence and digest framing covered. |

Total: 25/25 — PASS after two automatic corrections.

## Adversarial findings and fixes

1. **Digest malleability / secret-reference ambiguity — FIXED.** Prohibited caller-defined exclusions. `app.lock.json`, canonical manifest secret-reference identifiers and ordinary provenance files are included. Resolved secret values are never package inputs. Only VCS metadata and the fixed self-referential signature envelope are excluded and reported.
2. **Duplicate canonicalization ownership — FIXED.** Section 02 owns semantic manifest canonicalization; section 03 owns the sole `paths.ts` relative-path policy. Parser preserves typed canonical-separator path strings, while structural validation applies normalization and inventory matching.
3. **External validation overstated — CLOSED BY CONTRACT.** V3 external resolution and V5–V8 runtime/database/tests/marketplace conclusions require digest-bound evidence. Missing evidence is `not_evaluated`, not a pass. No external adapters are added.

## Residual scope boundary

Actual provider/runtime, migration database, external test runner, registry, publisher trust, marketplace entitlement and production conformance cannot be proven by this package-only phase. The API is designed to report these checks as `not_evaluated` until trustworthy evidence is supplied by a later integration.
