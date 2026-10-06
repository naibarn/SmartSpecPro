# Canonical candidate import reconciliation — 2026-10-06

## Snapshot and source

- Refreshed configured canonical ref: `refs/heads/main` at baseline `0a840d75a75e61f32dacb12e0b292dfb81cc3864`.
- Candidate archive: `/home/dev/.codex/attachments/fba644fe-88f9-46fb-8b3e-e2b9eebe557a/SpecV9.zip`.
- Archive SHA-256: `77fd5bd3ac842fc8d7ecb42440fc807b1320b6f309c5e927e4aaa21102af02f`.
- The archive was already imported in PR #66 at `6ab8fc6d290a7e42dd7df195aa433f5d092edc74`, which is an ancestor of the refreshed canonical baseline. This reconciliation adds no Spec revisions or replacement files.
- The primary checkout remains dirty and was not modified. Work was performed in an isolated worktree.

## Candidate dispositions

| Spec | Candidate source | Previous canonical at pre-upload snapshot | Decision | Final canonical path | Revision | Provenance | Validation |
|---|---|---|---|---|---|---|---|
| 047 | SpecV9 ZIP `047-cloudflare-remotion-render-lane/spec.md` | Missing | `SEMANTICALLY_IDENTICAL` — already integrated | `specs/feature/047-cloudflare-remotion-render-lane/spec.md` | 2.0 | ZIP member SHA matches canonical bytes; archive SHA above | Exact byte match; indexed once |
| 259 | SpecV9 ZIP `259-smartaihub-thclaws-hybrid-runtime-cloud-development-llm-subscription-interop/spec.md` | Missing | `SEMANTICALLY_IDENTICAL` — already integrated | `specs/feature/259-smartaihub-thclaws-hybrid-runtime-cloud-development-llm-subscription-interop/spec.md` | 1.2 | ZIP member SHA matches canonical bytes; archive SHA above | Exact byte match; indexed once |
| 264 | SpecV9 ZIP `264-emergency-hazard-intelligence-temporal-observation-impact-coordination-extension/spec.md` | Missing | `SEMANTICALLY_IDENTICAL` — already integrated | `specs/feature/264-emergency-hazard-intelligence-temporal-observation-impact-coordination-extension/spec.md` | Not declared | ZIP member SHA matches canonical bytes; archive SHA above | Exact byte match; indexed once |
| 267 | SpecV9 ZIP `267-smartaihub-cloudflare-production-migration-durable-execution-control-plane-v2/spec.md` | Missing | `SEMANTICALLY_IDENTICAL` — already integrated | `specs/feature/267-smartaihub-cloudflare-production-migration-durable-execution-control-plane-v2/spec.md` | 4.0 | ZIP member SHA matches canonical bytes; archive SHA above | Exact byte match; indexed once |
| 272 | SpecV9 ZIP `272-smartaihub-credential-vault-root-of-trust-secure-provider-broker/spec.md` | Missing | `SEMANTICALLY_IDENTICAL` — already integrated | `specs/feature/272-smartaihub-credential-vault-root-of-trust-secure-provider-broker/spec.md` | 1.1 | ZIP member SHA matches canonical bytes; archive SHA above | Exact byte match; indexed once |
| 273 | SpecV9 ZIP `273-portable-mini-app-data-architecture/spec.md` | Missing | `SEMANTICALLY_IDENTICAL` — already integrated | `specs/feature/273-portable-mini-app-data-architecture/spec.md` | 1.1 | ZIP member SHA matches canonical bytes; archive SHA above | Exact byte match; indexed once |
| 274 | SpecV9 ZIP `274-canonical-executable-artifact-manifest/spec.md` | Missing | `SEMANTICALLY_IDENTICAL` — already integrated | `specs/feature/274-canonical-executable-artifact-manifest/spec.md` | 1 | ZIP member SHA matches canonical bytes; archive SHA above | Exact byte match; indexed once |
| 275 | SpecV9 ZIP `275-autonomous-execution-learning-reliability/spec.md` | Missing | `SEMANTICALLY_IDENTICAL` — already integrated | `specs/feature/275-autonomous-execution-learning-reliability/spec.md` | 1.1 | ZIP member SHA matches canonical bytes; archive SHA above | Exact byte match; indexed once |
| 287 | SpecV9 ZIP `287-Unified-UI-Governance-Rendering-Conformance-MiniApp-Design-Contract/spec.md` | Missing | `SEMANTICALLY_IDENTICAL` — already integrated; canonical revision R1.3 | `specs/feature/287-Unified-UI-Governance-Rendering-Conformance-MiniApp-Design-Contract/spec.md` | 1.3 | ZIP member SHA matches canonical bytes; archive SHA above | Exact byte match; one canonical ID; remains scoped to UI/Mini App governance and explicitly defers function invocation/WebMCP protocol authority to the forthcoming canonical contract |
| 288 | SpecV9 ZIP `288-SmartAIHub-Resource-Fabric-Portable-Application-Backend-Contract/spec.docx` | Missing | `SEMANTICALLY_IDENTICAL` — already integrated; canonical revision R1.2 | `specs/feature/288-SmartAIHub-Resource-Fabric-Portable-Application-Backend-Contract/spec.md` (DOCX source also retained) | 1.2 | DOCX member SHA matches retained canonical DOCX; Markdown is an inventory transcription | Exact DOCX byte match; one canonical ID; no stale `SPEC-280` reference found in Specs 287/288; historical provenance untouched |
| 290 | SpecV9 ZIP `290-Longdo-Map-Migration-Google-Maps-Decommission/spec.md` | Missing / reserved | `SEMANTICALLY_IDENTICAL` — already integrated | `specs/feature/290-Longdo-Map-Migration-Google-Maps-Decommission/spec.md` | 1.1 | ZIP member SHA matches canonical bytes; archive SHA above | Exact byte match; one canonical ID and revision |
| 291 | SpecV9 ZIP `291-Local-Agentic-Model-Runtime-Capability-Resolution/spec.md` | Missing / reserved | `SEMANTICALLY_IDENTICAL` — already integrated | `specs/feature/291-Local-Agentic-Model-Runtime-Capability-Resolution/spec.md` | 1.0 | ZIP member SHA matches canonical bytes; archive SHA above | Exact byte match; one canonical ID and revision |

No candidate was quarantined, skipped as a conflicting revision, or promoted as a new revision in this reconciliation because all 12 candidates already exist byte-for-byte in canonical from PR #66. No incoming source replaced a pre-existing canonical Spec.

## Refreshed canonical views

- Pre-upload checkpoint: 291 canonical Specs / 447 discovered and indexed records / 286 relationship candidate edges.
- Current canonical baseline: 303 canonical Specs / 459 discovered and indexed records / 300 relationship candidate edges.
- Ambiguity-review projection: 327 records. These remain open and are not closed by this import reconciliation.
- SpecV9 therefore added 12 canonical Specs, 12 indexed records, and 14 candidate relationship edges versus the recorded pre-upload checkpoint.
- The eight duplicate-ID groups `000`, `014`, `031`, `045`, `058`, `059`, `162`, and `164` remain unresolved and unchanged. Next workunit: `REVIEW_DUPLICATE_SPEC_ID_GROUPS`.
- The post-recovery upload predicate is satisfied: `Recovered/canonical Spec set has been uploaded, validated, and integrated into canonical ref`.
- `REPOSITORY_WIDE_SPEC_RECONCILIATION_COMPLETE` and `CANONICAL_SPEC_HANDOFF_MIGRATION_COMPLETE` remain open.
- Regenerated the five global projections after refreshing the continuation Handoff: `specs/_status/spec-index.json`, `specs/_status/SPEC-STATUS.md`, `specs/_status/reconciliation-report.json`, `specs/_status/continuation-queue.json`, and `specs/_status/ambiguity-review.json`.

## Verification on the refreshed canonical baseline

- `python3 -m tools.spec_handoff index --check`: PASS — 459 indexed records, 303 canonical Specs, no drift.
- `python3 -m tools.spec_handoff validate --all`: PASS — complete walk, no missing Handoffs or invalid manifests.
- `python3 -m unittest discover -s tools/spec_handoff/tests -v`: PASS — 72 tests.
- `bash skills/audit-skills.sh`: PASS — skill audit and 330 skill tests.
- 40-case scenario matrix: PASS; inventory-dependent assertions refreshed to 303 Specs / 459 records, with no fabricated duplicate-revision fixtures.
