/**
 * Vertical Drama Series — per-character voice casting contracts (spec feature
 * 131, W12-A "voice chain" wave).
 *
 * Pure field-only TypeScript contracts + zod schemas. NO server/db imports so
 * both the client and the server (characters router + dialogue-audio planner
 * service) can import this directly — same "small, focused, direct-path
 * import" convention `@shared/verticalDramaSeries/audio`'s own doc comment
 * documents for itself, kept separate from `contracts.ts`/`audio.ts` because
 * voice casting is a per-CHARACTER concern both of those modules need without
 * pulling in either module's full surface.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Character voice casting                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A character's locked voice casting. Tolerant zod schema (`.passthrough()`)
 * so a stored record with extra/future fields round-trips without a
 * validation failure — same tolerant-parse convention as
 * `providerCapabilitiesSchema` in `server/services/verticalDramaDialogueAudio.ts`.
 *
 * `voiceModelId`/`voiceId` are the only two fields required once a casting
 * exists. The DB column itself (`vertical_drama_characters.voiceConfig`) is
 * nullable — NULL means "not cast yet", never an empty object; there is no
 * "cast but no model/voice" state.
 */
export const verticalDramaCharacterVoiceConfigSchema = z
  .object({
    /** Provider name (e.g. "uvoice", "elevenlabs") — informational; `voiceId`
     *  + `voiceModelId` (not this field) are what resolve generation. */
    voiceProvider: z.string().trim().max(80).optional(),
    /** The `media_models.modelId` this voice was cast against — the same
     *  catalog `verticalDramaCharacters.listVoiceCatalog` reads from. */
    voiceModelId: z.string().trim().min(1).max(120),
    /** Stable voice id within that model (e.g. UVoice's `voiceID`). */
    voiceId: z.string().trim().min(1).max(120),
    /** Display label captured at cast time (e.g. "th - ปอร์เช่ (Adult)") so
     *  the UI can show what's cast without a live catalog re-fetch. */
    voiceLabel: z.string().trim().max(200).optional(),
    /** Free-form delivery/style notes for this character's voice (e.g. "warm,
     *  slightly raspy") — informational only; never sent verbatim to a TTS
     *  provider as control parameters. */
    styleHints: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    /** Server-stamped lock metadata — set by `setCharacterVoiceConfig` from
     *  request context (never trusted from client input; see that
     *  mutation's own input schema, which omits these two fields). */
    lockedAt: z.string().optional(),
    lockedByUserId: z.number().int().positive().optional(),
  })
  .passthrough();

export type VerticalDramaCharacterVoiceConfig = z.infer<
  typeof verticalDramaCharacterVoiceConfigSchema
>;

/**
 * Mutation-input subset — omits the two server-stamped lock fields. Used by
 * `verticalDramaCharacters.setCharacterVoiceConfig`'s input schema; the
 * router fills in `lockedAt`/`lockedByUserId` itself before persisting.
 */
export const verticalDramaCharacterVoiceConfigInputSchema =
  verticalDramaCharacterVoiceConfigSchema.omit({
    lockedAt: true,
    lockedByUserId: true,
  });

export type VerticalDramaCharacterVoiceConfigInput = z.infer<
  typeof verticalDramaCharacterVoiceConfigInputSchema
>;

/**
 * A `characterId` keyed casting entry — the shape carried on
 * `planDialogueAudioInputSchema.characterVoiceConfigs` (an array, for
 * zod/JSON-RPC friendliness) and produced by the characters-table sweep in
 * `server/routers/verticalDramaDialogueAudio.ts`.
 */
export const verticalDramaCharacterVoiceConfigMapEntrySchema = z
  .object({ characterId: z.string().trim().min(1).max(120) })
  .merge(verticalDramaCharacterVoiceConfigSchema);

export type VerticalDramaCharacterVoiceConfigMapEntry = z.infer<
  typeof verticalDramaCharacterVoiceConfigMapEntrySchema
>;

/**
 * Build a `characterId -> config` lookup map from the flat array shape above
 * — the single conversion point so the dialogue-audio planner service and its
 * router callers agree on the same key normalization (never re-implemented
 * per call site).
 */
export function buildCharacterVoiceConfigMap(
  entries: VerticalDramaCharacterVoiceConfigMapEntry[] | undefined,
): Map<string, VerticalDramaCharacterVoiceConfig> {
  const map = new Map<string, VerticalDramaCharacterVoiceConfig>();
  for (const entry of entries ?? []) {
    if (!entry.characterId) continue;
    const { characterId, ...config } = entry;
    map.set(characterId, config as VerticalDramaCharacterVoiceConfig);
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Voice catalog (verticalDramaCharacters.listVoiceCatalog)                   */
/* -------------------------------------------------------------------------- */

/**
 * One flattened voice catalog entry. Sourced from the SAME machinery the
 * series-trailer voice picker uses (`mediaModels` table, type `"audio"`, +
 * `media.listModelFieldOptions`'s dynamic/static voice-option resolution —
 * see `verticalDramaCharacters.listVoiceCatalog`'s own doc comment for the
 * exact reuse path) — never a new provider integration.
 *
 * `language`/`gender`/`ageTag` are best-effort, parsed from the option label
 * when the source encodes them there (e.g. UVoice's `"th - ปอร์เช่ (Adult)"`
 * — language prefix, age tag in trailing parens); absent when not present in
 * the label. No current source publishes an explicit machine-readable
 * `gender` field — the property exists for forward compatibility only.
 */
export type VerticalDramaVoiceCatalogEntry = {
  voiceModelId: string;
  voiceId: string;
  label: string;
  language?: string;
  gender?: string;
  ageTag?: string;
  previewUrl?: string;
};
