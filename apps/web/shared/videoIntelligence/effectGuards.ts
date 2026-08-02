/**
 * Feature 142 — section-08: the canonical non-duplication guard for every
 * Video Intelligence effects interface.
 *
 * Video Intelligence PLANS structure and EDITS JSON; it never generates
 * pixels or audio and never renders (spec §2.3). Three effects interfaces
 * each already carried their own inline copy of this forbidden-member list
 * (`VideoProjectQualityLoopEffects`, `ScenePlanEffects`, `RepairEffects`).
 * This module is the single source of truth those three now re-express
 * through, so the list can never quietly drift into three different subsets.
 *
 * Exported as a runtime array (not just a type) so the fs-based guard test
 * (`server/__tests__/videoIntelligenceNonDuplicationGuards.test.ts`) can
 * prove every interface's guard covers the FULL list rather than a stale
 * subset, instead of hardcoding the same nine strings a second time there.
 */
export const MEDIA_GENERATION_EFFECT_MEMBER_NAMES = [
  "render",
  "renderVideo",
  "queueRender",
  "generateImage",
  "generateVideo",
  "generateAudio",
  "generateMedia",
  "synthesizeSpeech",
  "runFfmpeg",
] as const;

export type MediaGenerationEffectMemberName =
  (typeof MEDIA_GENERATION_EFFECT_MEMBER_NAMES)[number];

/**
 * Deviation note (TypeScript limitation, verified empirically against this
 * repo's TS 5.9.3): a single combined generic
 * `AssertNoMediaGenerationEffects<TEffects> = AssertNever<Extract<keyof
 * TEffects, Names>>` — the form originally sketched for this section — makes
 * `tsc` fail at THIS FILE's own declaration line for every possible
 * `TEffects`, not just a bad one. Wrapping a still-generic (unresolved
 * `TEffects`) expression in a hard-constrained generic (`T extends never`)
 * requires the wrapper's body to satisfy that constraint for ALL possible
 * instantiations, which it structurally cannot (a well-behaved interface
 * only satisfies it by construction, not by type-level proof) — so `tsc`
 * flags it immediately, even when every real interface passed to it is
 * perfectly fine. The fix below splits the single generic into a pure
 * computation (`ForbiddenMediaGenerationEffectMembers`, no constraint — safe
 * to define generically) and the hard-constrained check (`AssertNever`,
 * unchanged from the original per-file idiom) and composes them at each
 * CONCRETE call site (each interface file), where `TEffects` has already
 * been substituted with a real, non-generic interface — the same shape the
 * three interfaces used individually before this section, just sharing the
 * canonical member list and the `AssertNever` primitive instead of each
 * re-declaring both.
 */
export type ForbiddenMediaGenerationEffectMembers<TEffects> = Extract<
  keyof TEffects,
  MediaGenerationEffectMemberName
>;

/**
 * Compile-time assertion helper. Instantiate once per effects interface, at
 * a CONCRETE (non-generic) call site:
 *
 *   export type AssertScenePlanHasNoMediaGeneration =
 *     AssertNever<ForbiddenMediaGenerationEffectMembers<ScenePlanEffects>>;
 *
 * Adding a forbidden member to the interface makes
 * `ForbiddenMediaGenerationEffectMembers<TheInterface>` resolve to a
 * non-`never` string-literal union, the `T extends never` constraint stops
 * being satisfied, and `pnpm check` fails to compile the file that declares
 * the alias. Type-only, zero runtime cost.
 */
export type AssertNever<T extends never> = T;
