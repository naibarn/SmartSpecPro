# Feature 132 — Section Index

See [../claude-plan.md](../claude-plan.md) for the overview, binding build
order, and cross-cutting ownership rules resolved after
[../reviews/self-review-round-1.md](../reviews/self-review-round-1.md).

| # | File | Flag(s) | Depends on | Depended on by |
|---|---|---|---|---|
| 01 | [section-01-shared-criteria-and-flags.md](section-01-shared-criteria-and-flags.md) | (foundation) | — | 02, 03, 04, 05, 06, 07, 08, 09 |
| 02 | [section-02-user-premise-preset-mix.md](section-02-user-premise-preset-mix.md) | F132A | 01 | 06 (`evaluatePremiseCoverage` reuse) |
| 03 | [section-03-ledgers-and-story-state.md](section-03-ledgers-and-story-state.md) | F132B | 01 | 04 (soft), 06, 07, 08 (soft, skill scaffold) |
| 04 | [section-04-scene-contracts.md](section-04-scene-contracts.md) | F132C | 01, 03 (soft) | 05 (soft), 06, 07, 08 (soft), 09 (indirect) |
| 05 | [section-05-dialogue-rules-and-speech-profiles.md](section-05-dialogue-rules-and-speech-profiles.md) | F132D (dialogue), F132F (speech) | 01, 04 (soft), 08 (soft/stub) | 06, 08 (hard) |
| 06 | [section-06-multipass-qc-and-scorecard-v3.md](section-06-multipass-qc-and-scorecard-v3.md) | F132D (QC), F132H | 01, 02, 03, 04, 05 | 07 |
| 07 | [section-07-targeted-revision-engine.md](section-07-targeted-revision-engine.md) | F132E | 01, 03, 04, 06 | — |
| 08 | [section-08-character-personality-and-visual-bible.md](section-08-character-personality-and-visual-bible.md) | F132F (personality), F132G (bible/expression) | 01, 02 (read-only), 03 (soft), 04 (soft), 05 (hard) | 09 (hard) |
| 09 | [section-09-character-image-qc-and-cast-contrast.md](section-09-character-image-qc-and-cast-contrast.md) | F132G (image QC/ledger/contrast) | 08 (hard) | 06 (final hand-off, `.todo` hook flip) |
| 10 | [section-10-camera-angle-grid-quality.md](section-10-camera-angle-grid-quality.md) | F132I | — (independent of F132A-H) | — |

**Section 10 note**: unlike Sections 01-09, this section touches an entirely
different pipeline stage (the shipped "multi-angle variations"/"สร้างหลาย
มุมกล้อง (3x3)" feature) and shares zero files with Sections 01-09. It can be
implemented in any order relative to the rest — sequenced last only for
context-budget reasons, not a real dependency.

## Binding ownership (see claude-plan.md for full detail)

- **Flags (F132A–H)**: Section 01 only. **F132I**: Section 10 only (registered independently, not part of Section 01's 8-flag batch).
- **`VD_SEASON_CRITIQUE_FINDING_KINDS`**: Section 06 only (all 16 kinds).
- **`personality` schema**: Section 08 only.
- **`extractCharacterDescription`**: Section 08 only (calls Section 05's `renderVoiceCardBlock`).
- **`vertical-drama-ledger-planner` skill directory**: Section 03 scaffolds first, Section 08 extends.
- **Criteria-module (`renderCriteriaVersionMarker`) adoption**: every section touching a spec §11 consumer flips its own `.todo` entry in `verticalDramaQualityCriteria.agreement.test.ts`.
