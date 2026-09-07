# Section 03 — Subtitle Localization

> v2 implementation prerequisite: read ../contracts-v2.md and the v2 section dependency graph. Both local and cloud execution are supported through one control plane. Existing v1 scope remains unless explicitly revised there.

## Goal

Make subtitle/transcript data a first-class, user-controlled input for localized dialogue without forcing a fixed editing order.

## Implementation scope

- Map source subtitle cues to scan speech intervals and speaker candidates.
- When cues are absent, offer existing transcript selection, subtitle import, the existing transcription capability as a separate job, or manual cue creation without blocking scan/reframe/Silence Cut.
- Add `subtitle_localization_plan` durable job using a versioned `speaker-aware-dialogue-localizer` Skill through the server gateway.
- Support source/target language, BCP-47 region, glossary, protected terms, character style, emotion/intent policy and timing budget.
- Add optional `localized-dubbing-quality-reviewer` Skill for semantic, pronunciation and timing flags.
- Support all/selected/single cue approval and regeneration, partial results and visible source references for condensation.
- Add target duration/range, protected topics and explicit removable-content policy for optional short-form condensation; fail visibly when the target is impossible under policy.
- Keep source subtitles immutable and make default mode preserve every cue.

## UI/UX contract

Show source and target text side-by-side with speaker name/character, source/target timings, warning badges, provenance and regenerate/approve actions. On mobile, use stacked cue cards with a sticky approve bar. A condensation mode must display removed/merged source cues before approval.

## TDD stubs

- Cue mapping, overlap and unmatched subtitle tests.
- Skill request/response provenance tests.
- Condensation opt-in and default-preservation tests.
- Partial localization retry tests.
- Target-duration impossibility, protected-topic and removed/merged-cue provenance tests.
- No-subtitle transcript/import/transcribe/manual-cue path tests.
- Keyboard and narrow viewport review tests.

## Exit criteria

The user can produce an approved localized subtitle plan from either the original video or a Feature 179 derived edit, with no silent content removal.

## UI/UX Contract

### Target User / JTBD

Editors need to make target-language dialogue sound natural while retaining control over meaning, timing and optional condensation.

### Surface Inventory

The Translation tab contains locale controls, glossary, cue review, provenance, condensation preview and approve/regenerate actions.

### Component Map

`LocalizationReviewPanel` owns plan status; `LocaleControls` owns language/region/style; `CueReviewCard` owns source/target text and timing; `CondensationDiff` owns removed/merged cue disclosure.

### State Matrix

Cover no subtitle, loading, partial cues, translation error, needs linguistic review, condensation preview, approved cue and batch success. Keep successful cues visible after partial failure.

### Responsive Matrix

Use side-by-side source/target at 1440×900 and 1280×800; stack cue cards at 768×1024 and 390×844 with a sticky approve bar.

### Accessibility Acceptance

Associate source/target labels, warning descriptions and approve/regenerate actions; preserve focus after cue regeneration and announce completion/errors.

### Copy Contract

Thai copy must distinguish “แปลภาษา”, “ปรับให้เป็นภาษาธรรมชาติ” and “ตัดให้กระชับ”; condensation must explicitly state which source cues will be removed or merged.

### Browser Evidence Required

Capture locale selection, cue review, condensation diff, partial failure/retry and approved plan at desktop and mobile widths.

## v2 required integration

Localization is optional for authored/source-language dialogue. Validate transcript privacy before Skill execution; preserve source text. No permitted semantic executor means explicit unavailable or manual plan, not silent cloud transfer.
