# Enhanced Speaker Binding and Model-Specific Video Prompt Budgets

Date: 2026-09-07
Status: Implemented and focused verification passed

## Problem

Enhanced prompt generation binds canonical dialogue to the correct speaker ID and observed viewer-relative position, but `_build_motion_timeline` currently couples `actions[idx]` to `dialogue[idx]`. The prompt-intent Agent returns chronological physical actions, not an index-aligned action per dialogue line. This can create a terminal prompt whose dialogue lock is correct while the timed motion prose assigns another character's action to the active speaker. Thai mouth-motion phrases also survive the current English-oriented cleanup and become duplicate speaking cues.

The video prompt budget resolver also treats Kie.ai as synonymous with Grok and clamps every video prompt to an absolute 4,096 characters. That is incorrect for other supported model families.

## Accepted Requirements

1. Fix speaker/action ownership in the shared Enhanced compiler so the correction applies to every target video model.
2. Preserve canonical dialogue text, order, speaker ID, speaker name, and observed screen position.
3. A non-speaking character must remain explicitly mouth-closed during another character's line.
4. Do not infer speaker ownership from array index or brittle natural-language name parsing.
5. Apply these effective positive-prompt limits:
   - Grok Imagine Video 1.5: 4,096 characters
   - MiniMax H3 and H3 Max: 7,000 characters
   - Gemini Omni Flash 1.1: 20,000 characters
   - Wan 3.0 variants: 20,000 characters
   - Seedance 2.5 variants: 30,000 characters
6. Preserve existing behavior for unknown models through a conservative configured/default fallback.
7. Do not mutate existing episode rows or trigger paid generation as part of implementation or proof.

## Design

### 1. Deterministic speech events

The terminal compiler will construct every speech event exclusively from the canonical bound dialogue object. A speech event owns:

- `lineId`
- `speakerId` / `characterKey`
- canonical speaker display name
- observed viewer-relative position
- exact dialogue text
- optional emotion/delivery cue
- explicit mouth-closed listener constraints

Arbitrary `prompt_intent.actions[]` will no longer be attached to a speech event by matching array index. They remain chronological physical-action events outside the speech ownership clause.

### 2. Speech-like action sanitization

Physical actions will be sanitized for quoted dialogue and redundant speech/lip-motion directives in both English and Thai. A physical-action event that becomes empty after sanitization is omitted. Canonical speech events remain the only source of mouth-opening/lip-sync instructions.

This trades some free-form simultaneous acting prose for deterministic speaker correctness. The visual action remains available as a separate adjacent timeline event.

### 3. Semantic fail-closed validation

Before returning the terminal prompt, validate that:

- every canonical line appears with its bound speaker ID/name and position;
- no line is transferred to another speaker;
- every other known on-screen character is constrained as a silent listener for that speech event;
- no standalone physical-action event retains speech, quoted dialogue, or lip-motion intent;
- no cross-character action is interpolated into a canonical speech clause.

Validation failure rejects the Enhanced prompt before persistence and credit settlement rather than relying on provider interpretation.

### 4. Model-specific budget resolution

Replace provider-wide Kie.ai handling with model-aware resolution. The resolver accepts model ID/name plus provider config and applies this precedence:

1. Known model-family ceiling listed in Accepted Requirements. An explicit video-specific configuration may tighten this ceiling but may not raise it.
2. For unknown models, explicit positive `maxVideoPromptLength` / `max_video_prompt_length` configuration.
3. For unknown models, explicit positive generic `maxPromptLength` / `max_prompt_length` configuration.
4. Existing conservative default for an unknown model.

The global safety ceiling becomes 30,000 characters, while Grok remains explicitly capped at 4,096. Call sites must pass the resolved model ID so a shared Kie.ai provider name cannot collapse all model families to Grok's limit. The resolved value is also passed into the Enhanced skill input and included in its fingerprint so a budget change makes an older variant stale rather than silently reusing it.

### 5. Persistence and render boundary

Enhanced bridge output validation will use the resolved target-model budget rather than the unrelated 40,000-character structural ceiling. The Python terminal compiler will apply deterministic compaction tiers before returning:

1. remove redundant episode/context prose;
2. compact observed state to cast positions and critical held objects;
3. deduplicate and compact continuity/camera wording;
4. retain only sanitized physical actions needed for the timed beat.

The protected core — reference/start-state authority, target model, canonical speaker/position/line bindings, speech events, silent listeners, and essential negative constraints — is never truncated. If the protected core itself cannot fit, generation fails before persistence. Provider-bound render QC continues to run as the final safeguard, using the same shared resolver and protected canonical dialogue fragments.

No schema migration is required for correctness: known model limits are runtime contracts. Static catalog metadata may be aligned where the model is defined locally, but existing DB rows are not modified during this task.

## Files Expected to Change

- `apps/web/skills/generic-commercial-video-director/src/smartaihub_video_director/enhanced_bridge.py`
- `apps/web/skills/generic-commercial-video-director/tests/test_enhanced_audio_bridge.py`
- `apps/web/shared/verticalDramaSeries/videoPromptBudget.ts`
- `apps/web/shared/verticalDramaSeries/__tests__/videoPromptBudget.test.ts`
- `apps/web/server/services/verticalDramaEnhancedVideoPrompt.ts`
- bounded TypeScript call sites that invoke `resolveVdVideoPromptBudgetForCatalogModel`
- Enhanced service tests if the bridge budget is enforced at the TypeScript admission boundary

## Verification

1. Regression using episode 258 shot 1 and shot 2 patterns: no `speaker A as they speaker B...` output and no duplicate Thai mouth-motion events.
2. Multi-speaker tests verify exact line order, speaker ID/name/position, and silent listeners.
3. Parameterized budget tests cover Grok, MiniMax H3/H3 Max, Omni Flash 1.1, Wan 3.0, Seedance 2.5, configured unknown models, and conservative unknown fallback.
4. Run the focused Python bridge suite and focused TypeScript budget/Enhanced suites.
5. Run `git diff --check` on touched paths.

## Non-goals

- Regenerating or rewriting persisted episode prompts.
- Paid Grok/Omni/MiniMax/Seedance/Wan provider comparisons.
- Changing canonical dialogue, character casting, Start Frame assets, or video outputs.
- Broad migration or catalog cleanup unrelated to these limits.
