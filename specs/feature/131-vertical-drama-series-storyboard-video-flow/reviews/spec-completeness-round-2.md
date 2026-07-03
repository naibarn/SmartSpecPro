# Spec Completeness Review Round 2

Date: 2026-07-03

## Result

PASS after auto-fixes.

## Source Compared

- `spec.md` source requirements.
- Pinned GitHub guide `naibarn/vertical-drama-video-flow` at `e2dbef07d07447489d041112d862d994adeac5d4`.
- `claude-spec.md`, `claude-plan.md`, `claude-plan-tdd.md`, and all nine section files.

## Gaps Found And Fixed

| Gap | Files Updated | Fix |
|---|---|---|
| Source-spec tables omitted append-only memory events and first-class QC reports. | `claude-spec.md`, `claude-plan.md`, `section-02`, `section-09`, TDD plan | Added `vertical_drama_memory_events`, `vertical_drama_qc_reports`, indexes, contracts, tests, and export write rules. |
| Feature flag names drifted from source spec. | `claude-plan.md`, `section-03`, TDD plan | Replaced short alias list with canonical source-spec flags and required alias mapping tests. |
| Approval checkpoint artifact/versioning was too implicit. | `claude-plan.md`, `section-02`, `section-04`, TDD plan | Added immutable checkpoint artifact semantics, `sourceArtifactIds`, `repairRequestIds`, supersede behavior, and tests. |
| GitHub `vdflow` command equivalents were incomplete. | `claude-spec.md`, `claude-plan.md`, `section-01`, `section-04`, `section-05`, `section-08`, `section-09`, TDD plan | Added app-safe equivalents for validate, run, render-images, render-video, assemble, and repair. |
| Default 9-frame to 8-clip bridge timing was not explicit enough. | `claude-spec.md`, `claude-plan.md`, `section-06`, `section-08`, `section-09`, TDD plan | Added `veo31_first_last_bridge_60s`, 8 adjacent clips, and `8+8+8+8+8+8+8+4` timing tests. |
| Provider job lifecycle was underspecified. | `claude-spec.md`, `claude-plan.md`, `section-08`, TDD plan | Added create, poll, webhook, download/import, cancel, retry, stale, and repair lifecycle requirements. |
| Imported GitHub skill output fields were not listed by exact snake_case name. | `section-01` | Added exact top-level output fields and provider status terms for fixture tests. |

## Evidence

- GitHub remote HEAD rechecked and matches pinned commit `e2dbef07d07447489d041112d862d994adeac5d4`.
- Requirement term scan passed for canonical flags, tables, imported output fields, provider statuses, `vdflow` equivalents, provider lifecycle terms, normalized input, and approval repair lineage fields.
- Deep-plan section validator and UI contract validator passed after fixes.

## Residual Risk

None for the planning artifacts. Runtime implementation must still verify exact model/provider capabilities against the live model registry during deep-implement.
