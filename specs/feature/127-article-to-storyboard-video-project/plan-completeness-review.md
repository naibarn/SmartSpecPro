# Plan Completeness Review

## Review Scope

This review compares the source `spec.md` against the generated deep-plan artifacts:

- `claude-spec.md`
- `claude-plan.md`
- `claude-plan-tdd.md`
- `sections/index.md`
- `sections/section-*.md`

## Result

Status: complete after fixes.

The plan already covered the main feature shape: opt-in Builder output, one page per Storyboard Review shot, 3x3 references, character references, Seedance prompt adapter, article storytelling script skill, separate TTS/native video audio strategies, voice IDs, Storyboard Review metadata, overlay separation, UI/UX contracts, and verification.

## Gaps Found And Fixed

### 1. Access And Credit Blocking Coverage

Issue: The source spec required several blockers that were present in the main plan but not fully enforced in TDD/sections.

Fixes added:

- unsupported/missing voice mode blocks preview/handoff
- native video audio prompt composer flag blocks native audio handoff when disabled
- required skill/provider access blockers are explicit in Builder preview section
- provider OAuth tokens, provider session references, signed provider upload URLs, and other credentials must not appear in preview or persisted metadata
- credit estimate categories are explicitly tested and verified

### 2. Static Slide Fallback

Issue: The source spec says static slide images are fallback/reference assets only. The plan did not explicitly bind this to handoff and final composite sections.

Fixes added:

- handoff stores static slide metadata only as fallback/reference data
- final composite keeps static images fallback/reference-only
- verification section checks this rule

### 3. Presentation Note Relationship

Issue: The source spec says Presentation Note/Slide Note may store secondary metadata but cannot become canonical video state.

Fixes added:

- handoff section includes optional Presentation Note writes
- plan states Storyboard Review remains canonical
- TDD and verification check notes remain secondary/non-canonical

### 4. Downstream Track Mapping

Issue: The source spec defines downstream composition tracks: `V1` video, `T1` overlay, `A1` separate TTS, native audio inside video clip.

Fixes added:

- final render/TTS section now explicitly verifies `V1`/`T1`/`A1` track separation
- native video audio remains inside `V1` unless explicitly replaced

### 5. Section Numbering

Issue: `section-01-contracts-flags.md` had duplicate task number `8`.

Fix added:

- renumbered implementation tasks to keep the section unambiguous.

### 6. Stable Preview And Audio Strategy Contracts

Issue: The source spec defines concrete preview/audio contract shapes, but the plan could still be implemented with inconsistent field names.

Fixes added:

- `accessDecision` fields are now explicitly required across the main plan, TDD plan, and Builder preview section
- `audioEstimate` fields are now explicitly required across the main plan, TDD plan, and Builder preview section
- per-page `warningCodes`, `nativeSpeechLineCount`, and `speakerSegmentCount` are called out for UI/tests
- audio strategy resolution must return `requested`, `resolved`, `reasonCode`, `message`, `nativeAudioAllowed`, `separateTtsAllowed`, and `fallbackOffered`
- `silent` is documented as internal fallback/advanced state, not a primary MVP Builder choice

### 7. Legacy Draft And Asset-Safety Behavior

Issue: The source spec requires old drafts/projects to keep loading safely, but the plan did not fully spell out missing voice ID recovery and no-destructive-migration behavior.

Fixes added:

- old Storyboard Review projects without Feature 127 metadata load with defaults and recoverable warnings
- old separate-TTS drafts with missing voice IDs remain viewable and keep existing generated audio
- missing voice IDs block new TTS generation until fixed
- existing `companionAudio`, `companionAudioUpdatedAt`, and `voiceoverFullScript` conventions must be preserved
- migration/normalization must not rewrite existing generated video/audio assets unless the user explicitly regenerates them

## Remaining Notes

- Provider capability details remain intentionally capability-driven and must be verified against the app's current model/provider registry during implementation.
- No unresolved product decision blocks remain for MVP planning.
