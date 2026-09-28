# Special Tie-in Dialogue Continuity and Advertising Safety

## Objective

Make special tie-in episodes produce a complete, reviewable nine-shot dialogue plan before the user creates the episode, persist that plan through the same structured dialogue contracts used by normal episodes, and prevent unsafe advertising dialogue. Existing special episodes without reliable dialogue must become explicitly silent without spending LLM credits.

## Product rules

- `character_dialogue` requires exactly nine ordered shot dialogue entries.
- Each speaking shot uses two short, natural turns by default (18 turns total); the validator accepts the existing special contract's bounded 2–3 turns per shot.
- Every speaker must be an explicitly selected character and must be an adult (18+). Characters with explicit minor/child age evidence are visual-only and cannot speak.
- Spoken lines and story text are screened by the shared Thai advertising-compliance policy. Disease treatment/cure claims, absolute or guaranteed outcomes, unsupported efficacy, and hard-sell claims are rejected before the idea is shown or the episode is created.
- The user sees and can review the nine-shot dialogue after selecting an idea. The persisted structural data, not the display-only text, is authoritative.
- `none` means no spoken dialogue, no TTS/native dialogue, and an explicit silent audio strategy; visual action and permitted non-dialogue sound direction remain separate.

## Data flow

1. Marketplace idea generation returns `shotDialogues` as a nine-item structured array in addition to the legacy `dialogueScript` projection. The adapter validates speaker authorization, adult-only speaking, nine-shot coverage, and advertising compliance. Invalid output is repaired through the existing bounded planning retry path; an incomplete card is never persisted or returned.
2. Selecting an idea keeps the structured nine-shot dialogue in the dialog state and renders it as a shot-by-shot review. The final special input carries the structured dialogue through the existing JSONB `specialData` contract, preserving backward compatibility with `dialogueBrief`.
3. Special skill execution consumes the structured dialogue as exact constraints. Successful output is projected into:
   - `specialData.output.shotDialogues` for review/audit;
   - `dialogueAudioPlan.dialogue_lines` plus the normal `shotLines` projection;
   - `startFramePlan.frames[].canonicalShotSummary`;
   - `motionPromptPack.clips[].dialogue`.
4. Per-shot video prompt generation resolves the special structured plan before existing clip/audio/script fallbacks. A speaking special shot with no resolved dialogue fails closed before paid prompt generation; a silent special shot is allowed only when the episode mode is `none`.
5. Legacy repair is deterministic and scoped to special tie-in rows. Reliable persisted/debug dialogue is rehydrated; rows with no reliable dialogue are normalized to `none` with a silent audio plan and empty clip dialogue. No LLM retry or provider generation is used by the repair script.

## Safety and failure handling

- Adult-only is enforced server-side from persisted character metadata and again against generated speaker references. Prompt instructions are advisory; validators are authoritative.
- Advertising compliance is enforced both at marketplace idea validation and special-output validation. The shared Thai compliance helper is reused rather than creating a second claim lexicon.
- A failed repair loop returns a user-visible generation error and leaves no partial idea run or special episode output.
- Existing normal episode routing remains unchanged; only special tie-in source resolution and its dedicated contracts are extended.
- No new database column or migration is required; existing JSONB episode artifacts carry the additive fields.

## Verification

- Shared contract tests cover nine-shot dialogue, adult-only speakers, prohibited claims, and silent mode.
- Marketplace adapter tests cover validation and repair-loop inputs.
- Special adapter tests cover output projection into the normal dialogue plan and all nine clips.
- Router tests cover special source resolution and the fail-closed speaking-shot gate.
- Client tests cover selecting an idea, rendering nine shot dialogue rows, and disabling creation without an adult speaker.
- Run focused Vitest suites, `git diff --check`, and a read-only database audit before any legacy repair. Run the scoped repair only after the code gates pass.
