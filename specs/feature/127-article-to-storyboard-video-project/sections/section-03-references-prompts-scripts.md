# section-03-references-prompts-scripts

## Goal

Implement the reference candidate flow, Seedance prompt adapter, and article storytelling voice script skill.

## Depends On

- section-01-contracts-flags
- section-02-builder-preview

## Files

- `apps/web/shared/articleStoryboardVideo/references.ts`
- `apps/web/shared/articleStoryboardVideo/prompting.ts`
- `apps/web/shared/articleStoryboardVideo/validation.ts`
- `apps/web/skills/article-storytelling-voiceover-script/SKILL.md`
- optional skill fixtures/tests following existing skill conventions
- tests under `apps/web/shared/articleStoryboardVideo/`

## Test First

Write tests for:

- candidate sheet lifecycle: empty, generating, ready, failed, stale
- 3x3 split creates 9 durable frame records
- auto-select returns 1-5 scene frames
- users can adjust auto-selected scene references before prompt generation when advanced controls are exposed
- repair/regenerate preserves character references
- character reference change stales candidate sheet and prompt
- scene reference change stales prompt only
- prompt adapter separates character references from scene references
- separate TTS prompt policy is silent/no speech/no lip-sync
- native audio prompt policy includes speech only when allowed
- prompt adapter excludes overlay text drawing
- generated 3x3 image reference prompt includes character references and is reviewable/editable before handoff
- generated video prompt text is deterministic so the Builder preview and Storyboard Review handoff use the same base prompt
- storytelling skill fixtures cover single narrator and two-speaker dialogue

## Implementation Tasks

1. Add candidate sheet helpers and selected frame helpers.
2. Add character reference attach/remove/update helpers.
3. Add candidate generation input builder that includes article page intent and character references.
4. Add auto-selection plus adjustment state for selected 1-5 scene references.
5. Add prompt adapter for `seedance-multishot-review`.
6. Add shared generated prompt text helpers for 3x3 image references and video generation.
7. Add audio policy block in prompt adapter.
8. Add stale-state helpers for candidate/prompt/script/audio changes.
9. Create `article-storytelling-voiceover-script` skill.
10. Add skill output contract for structured segments mapped to shot/page IDs.

## Skill Contract

The article storytelling skill must output structured content that can be parsed into:

- script mode
- language
- speakers
- per-shot segments
- target duration guidance
- safety/warning notes

It must not output:

- Markdown code fences
- implementation instructions
- CSS overlay copy as narration unless explicitly derived from article text
- video camera directions
- unsupported claims
- provider credentials or hidden metadata

## Acceptance

- 3x3 and character reference logic can run without provider calls.
- Seedance adapter input is deterministic and testable.
- Prompt audio policy follows requested/resolved audio strategy.
- Storytelling skill is specific to article narration, not product ad copy.

## UI/UX Contract

### Target User / JTBD

Indirect UI only. This section supplies states and messages consumed by Builder reference controls.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Builder preview references | implemented in section-02 | consumes candidate/reference states |
| Storyboard Review references | implemented in section-05 | displays persisted reference metadata |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Reference helpers | `references.ts` | candidate/reference state | Builder and Storyboard Review UI |
| Prompt adapter | `prompting.ts` | prompt input policy | skill runner/UI preview |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | candidate sheet generating | section-02/05 UI evidence |
| empty | no references attached/selected | section-02/05 UI evidence |
| error | blocked reference or generation failed | unit + UI evidence |
| success | ready sheet and selected frames | unit + UI evidence |
| disabled/focus/hover | owned by UI sections | section-02/05 evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | reference state must support compact rendering | section-02/05 evidence |
| tablet 768x1024 | same metadata, no layout ownership | section-02/05 evidence |
| desktop 1440x900 | same metadata, no layout ownership | section-02/05 evidence |

### Accessibility Acceptance

This section must provide labels/status codes that UI sections can expose accessibly.

### Copy Contract

Expose stable reason codes for blocked/stale/failed reference states; localized copy is added in UI sections.

### Browser Evidence Required

Indirect. Verify through section-02 and section-05 browser evidence.

## Verification

- focused shared helper tests
- skill fixture tests if available
- `cd apps/web && pnpm check`

## Implementation Notes

- Added 3x3 candidate-sheet helpers with one selected scene-reference set per page and repair-friendly lifecycle states.
- Wired Builder preview adjustment state for selected 1-5 scene references before handoff.
- Added character reference separation so character images are not confused with scene references.
- Added Seedance prompt input adapter that can reference 1-5 selected scene images plus character references.
- Added deterministic prompt text helpers for the 3x3 reference image sheet and the video shot prompt, enabling the Builder to show exactly what will be sent downstream.
- Added `article-storytelling-voiceover-script` skill for single narrator and two-speaker storytelling dialogue.
- Focused verification included `section03.test.ts`.
