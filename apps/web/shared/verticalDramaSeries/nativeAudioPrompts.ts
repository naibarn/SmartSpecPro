/**
 * Vertical Drama Series — optional NATIVE AUDIO DIRECTION prompt option
 * (task #36, added 2026-07-09).
 *
 * Owner rationale: modern video models (Veo 3 family etc.) generate
 * excellent synchronized ambient sound + SFX natively as part of the
 * rendered clip itself. It is rights-clean by construction (generated, not
 * licensed) and atmosphere matters enormously for a short-form vertical
 * drama. This is an OPTION, never mandatory — see
 * `skills/vertical-drama-shot-video-prompt/skill.md`'s "NATIVE AUDIO
 * DIRECTION" section for the actual prompt-direction content and its hard
 * content rules.
 *
 * THREE-LAYER AUDIO ARCHITECTURE (documented here since this is where the
 * option's rollout marker lives — the other two layers are untouched by
 * this task):
 *  - Layer 1 (THIS task): native ambient bed + SFX INSIDE the generated
 *    video clip itself, directed via the video prompt text. SFX cues tied
 *    to visible on-screen actions are the PRIMARY, always-produced element
 *    (rights-clean by construction, no copyright risk); ambient
 *    soundscape/atmosphere is the secondary enrichment layer included by
 *    default alongside it. NEVER speech/dialogue/voices, NEVER music/
 *    melody/lyrics/score — see the skill's hard content rules.
 *  - Layer 2 (exists, unrelated to this task): TTS dialogue mixed on top
 *    (the W12 chain) — dialogue always comes from TTS, never from Layer 1.
 *  - Layer 3 (future, task #35): optional BGM with ducking. This clip's
 *    native audio (Layer 1) will be duckable under dialogue via the render
 *    engine's already-reserved `duckClipAudioDb` field — untouched by this
 *    task.
 *
 * ROLLOUT (TEMPORARY — remove this paragraph once resolved): every real
 * caller threads a `nativeAudioPromptsEnabled` boolean (default `false`)
 * rather than importing a real feature-flag check directly, because
 * `shared/featureFlags.ts` and `client/src/components/admin/
 * tenantFeatureFlagGroups.ts` were off-limits to this task (another agent
 * was concurrently finishing Vertical Drama share-links work in adjacent
 * files at the time this module was written) — mirrors task #23's
 * `VD_FORMAT_PROFILES_ROLLOUT` precedent
 * (`shared/verticalDramaSeries/formatProfiles.ts`) exactly. See
 * `VD_NATIVE_AUDIO_PROMPTS_ROLLOUT` below for the exact TODO — the
 * conductor should register flag F131AC
 * `verticalDramaSeriesNativeAudioPrompts` and swap every
 * `nativeAudioPromptsEnabled` call site (see this task's Result Report for
 * the full list) from its current hardcoded/omitted `false` default to a
 * real `isFeatureEnabled("verticalDramaSeriesNativeAudioPrompts", tenantId)`
 * -style check. Pure, side-effect-free, server-import-free — safe to import
 * from both server code and client components (mirrors every other module
 * in this barrel's own "no server-only imports" rule).
 */

/**
 * TODO(conductor, F131AC `verticalDramaSeriesNativeAudioPrompts`): register
 * this feature flag in `shared/featureFlags.ts` (and its admin group entry
 * in `client/src/components/admin/tenantFeatureFlagGroups.ts`), then swap
 * every `nativeAudioPromptsEnabled` call site (see the Result Report for
 * this task) from its current hardcoded/omitted `false` default to a real
 * `isFeatureEnabled("verticalDramaSeriesNativeAudioPrompts", tenantId)`
 * check. This marker exists so a repo-wide search for
 * `VD_NATIVE_AUDIO_PROMPTS_ROLLOUT` finds every place that still needs the
 * swap.
 */
export const VD_NATIVE_AUDIO_PROMPTS_ROLLOUT = "flag_pending" as const;
