/**
 * Vertical Drama Series — Feature 175: Native Cinematic Audio Contracts
 *
 * Pure field-only TypeScript contracts and Zod schemas for:
 * - ShotAudioIntent: Structured intent for prompt compilation.
 * - AudioManifest: Multi-stream audio asset tracking with non-destructive take versioning.
 * - AudioQcReport: Worker-level QA evaluation (VAD, Faster-Whisper ASR, SyncNet, MusicNN).
 * - SeriesSoundBible: Series-level acoustic rules and mastering specifications.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Shot Audio Intent Schemas                                                  */
/* -------------------------------------------------------------------------- */

export const shotAudioSpeakerDialogueLineSchema = z.object({
  lineId: z.string(),
  text: z.string(),
  delivery: z.string().optional(),
  startHintSec: z.number().optional(),
  endHintSec: z.number().optional(),
  preLinePauseSeconds: z.number().optional(),
  postLinePauseSeconds: z.number().optional(),
  mustBeExact: z.boolean().default(true),
  lipSyncRequired: z.boolean().default(true),
  interruptedAtSec: z.number().nullable().optional(),
  interruptedByLineId: z.string().nullable().optional(),
});
export type ShotAudioSpeakerDialogueLine = z.infer<typeof shotAudioSpeakerDialogueLineSchema>;

export const shotAudioSpeakerSchema = z.object({
  characterId: z.string(),
  screenPosition: z.enum(["viewer-left", "viewer-center", "viewer-right", "off-screen", "behind-camera"]).default("viewer-center"),
  mouthStateAtT0: z.enum(["closed", "slightly_parted", "speaking"]).default("closed"),
  acousticMedium: z.enum(["acoustic_direct", "phone_earpiece", "speakerphone", "intercom", "tv_broadcast"]).default("acoustic_direct"),
  occlusion: z.object({
    isOccluded: z.boolean().default(false),
    barrierType: z.enum(["wooden_door", "glass_window", "concrete_wall", "curtain"]).nullable().optional(),
  }).default({ isOccluded: false, barrierType: null }),
  thaiRegionalDialect: z.enum(["central_bangkok", "isan_northeastern", "kammuang_northern", "southern_paktai"]).default("central_bangkok"),
  temporalAgeOffsetYears: z.number().default(0),
  dialogue: z.array(shotAudioSpeakerDialogueLineSchema).default([]),
});
export type ShotAudioSpeaker = z.infer<typeof shotAudioSpeakerSchema>;

export const shotAudioSilentListenerSchema = z.object({
  characterId: z.string(),
  screenPosition: z.enum(["viewer-left", "viewer-center", "viewer-right", "off-screen"]).default("viewer-right"),
  mouthState: z.enum(["strictly_closed", "subtle_reaction", "parted_shock"]).default("strictly_closed"),
});
export type ShotAudioSilentListener = z.infer<typeof shotAudioSilentListenerSchema>;

export const shotAudioNonVerbalVocalizationSchema = z.object({
  characterId: z.string(),
  type: z.enum(["gasp", "sigh", "chuckle", "gasp_shock", "sob_whimper", "gulp"]),
  timestampSec: z.number(),
  intensity: z.enum(["subtle", "pronounced"]).default("subtle"),
  mouthVisualCue: z.string().optional(),
});
export type ShotAudioNonVerbalVocalization = z.infer<typeof shotAudioNonVerbalVocalizationSchema>;

export const shotAudioFoleyEventSchema = z.object({
  eventId: z.string(),
  category: z.enum(["prop_interaction", "footsteps", "body_movement", "vehicle_pass", "impact"]).default("prop_interaction"),
  foleyPriority: z.enum(["standard", "hero_commercial_asmr"]).default("standard"),
  description: z.string(),
  anchorAction: z.string().optional(),
  screenPosition: z.string().optional(),
  timing: z.string().optional(),
  materialPairing: z.object({
    activeSurface: z.enum(["flesh", "glass", "wood", "metal", "concrete", "fabric", "plastic"]),
    passiveSurface: z.enum(["flesh", "glass", "wood", "metal", "concrete", "fabric", "plastic"]),
    impactVelocity: z.enum(["gentle", "moderate", "violent"]).default("moderate"),
  }).optional(),
});
export type ShotAudioFoleyEvent = z.infer<typeof shotAudioFoleyEventSchema>;

export const shotAudioAtmosphereSchema = z.object({
  description: z.string(),
  continuityKey: z.string(),
  intensity: z.enum(["silent", "subtle_background", "prominent_environment"]).default("subtle_background"),
});
export type ShotAudioAtmosphere = z.infer<typeof shotAudioAtmosphereSchema>;

export const shotAudioMusicSchema = z.object({
  enabled: z.boolean().default(false),
  isDiegetic: z.boolean().default(false),
  source: z.enum(["car_radio", "cafe_speaker", "club_dj", "phone_playback"]).nullable().optional(),
  volumeRelativeDb: z.number().default(-18.0),
  rationale: z.string().optional(),
});
export type ShotAudioMusic = z.infer<typeof shotAudioMusicSchema>;

export const shotAudioIntentSchema = z.object({
  seriesId: z.string(),
  episodeId: z.string(),
  shotNumber: z.number(),
  durationSeconds: z.number().default(6),
  nativeAudioEnabled: z.boolean().default(true),
  language: z.string().default("th-TH"),
  dramaticBeat: z.string().optional(),
  speakers: z.array(shotAudioSpeakerSchema).default([]),
  silentListeners: z.array(shotAudioSilentListenerSchema).default([]),
  nonVerbalVocalizations: z.array(shotAudioNonVerbalVocalizationSchema).default([]),
  subjectiveAcousticState: z.enum(["normal", "panic_heartbeat", "tinnitus_shock", "underwater_daze"]).default("normal"),
  mustHearFoley: z.array(shotAudioFoleyEventSchema).default([]),
  atmosphere: shotAudioAtmosphereSchema.nullable().optional(),
  creativeSfx: z.array(z.string()).default([]),
  music: shotAudioMusicSchema.default({ enabled: false, isDiegetic: false, source: null }),
  forbiddenAudio: z.array(z.string()).default([]),
});
export type ShotAudioIntent = z.infer<typeof shotAudioIntentSchema>;

/* -------------------------------------------------------------------------- */
/* Audio Manifest Schemas                                                     */
/* -------------------------------------------------------------------------- */

export const audioManifestTakeSchema = z.object({
  version: z.number(),
  action: z.string(),
  timestamp: z.string(),
});
export type AudioManifestTake = z.infer<typeof audioManifestTakeSchema>;

export const audioManifestSchema = z.object({
  manifestId: z.string(),
  version: z.number().default(1),
  parentManifestId: z.string().nullable().optional(),
  takeHistory: z.array(audioManifestTakeSchema).default([]),
  seriesId: z.string(),
  episodeId: z.string(),
  shotNumber: z.number(),
  clipNumber: z.number().default(1),
  nativeAudioMode: z.enum(["native_baked", "demuxed_hybrid", "tts_foley_layered", "silent_visual"]).default("native_baked"),
  sampleRateHz: z.number().default(48000),
  channels: z.number().default(2),
  stems: z.object({
    nativeMasterUrl: z.string().nullable().optional(),
    dialogueCleanUrl: z.string().nullable().optional(),
    foleyPropsUrl: z.string().nullable().optional(),
    ambienceRoomToneUrl: z.string().nullable().optional(),
    masterMixUrl: z.string().nullable().optional(),
    previewM4aUrl: z.string().nullable().optional(),
    previewWebmUrl: z.string().nullable().optional(),
  }).default({}),
  mixDeltas: z.object({
    dialogueDb: z.number().default(0),
    foleyDb: z.number().default(-2),
    ambienceDb: z.number().default(-6),
  }).default({ dialogueDb: 0, foleyDb: -2, ambienceDb: -6 }),
  peaksJson: z.array(z.number()).default([]),
  licenseStatus: z.enum(["cleared", "pending", "flagged"]).default("cleared"),
  encryption: z.object({
    keyId: z.string(),
    algorithm: z.literal("AES-256-GCM").default("AES-256-GCM"),
    ivHex: z.string(),
    authTagHex: z.string(),
  }).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type AudioManifest = z.infer<typeof audioManifestSchema>;

/* -------------------------------------------------------------------------- */
/* Audio QC Report Schemas                                                    */
/* -------------------------------------------------------------------------- */

export const audioQcReportSchema = z.object({
  reportId: z.string(),
  seriesId: z.string(),
  episodeId: z.string(),
  shotNumber: z.number(),
  clipNumber: z.number().default(1),
  overallScore: z.number().min(0).max(10),
  status: z.enum(["PASS", "WARNING_MINOR", "FAIL_RETRY", "FAIL_EXTERNAL_REPLACE"]),
  speechQc: z.object({
    hasSpeech: z.boolean(),
    speechDurationSec: z.number(),
    asrTranscribedText: z.string(),
    canonicalExpectedText: z.string(),
    characterErrorRate: z.number(),
    passesCerThreshold: z.boolean(),
    meanF0Hz: z.number().optional(),
    f0IdentityDrift: z.boolean().default(false),
  }),
  syncQc: z.object({
    avSyncOffsetMs: z.number(),
    syncScore: z.number(),
    passesSyncThreshold: z.boolean(),
  }),
  acousticQc: z.object({
    truePeakDbfs: z.number(),
    integratedLufs: z.number(),
    loudnessRangeLu: z.number().optional(),
    phaseCorrelation: z.number().optional(),
    clippingDetected: z.boolean(),
    dcOffsetDetected: z.boolean(),
    bgmBleedDetected: z.boolean().default(false),
  }),
  suggestedAction: z.enum(["NONE", "TTS_SWAP", "FOLEY_INFALL", "REGENERATE_SHOT", "BYPASS_QC"]),
  createdAt: z.string().optional(),
});
export type AudioQcReport = z.infer<typeof audioQcReportSchema>;

/* -------------------------------------------------------------------------- */
/* Series Sound Bible Schemas                                                 */
/* -------------------------------------------------------------------------- */

export const seriesSoundBibleSchema = z.object({
  bibleVersion: z.number().default(1),
  seriesId: z.string(),
  globalRules: z.object({
    dialoguePriority: z.enum(["paramount", "balanced"]).default("paramount"),
    noBackgroundScoreDefault: z.boolean().default(true),
    nativeAudioEnabledDefault: z.boolean().default(true),
    targetLufs: z.number().default(-14.0),
    truePeakLimitDbfs: z.number().default(-1.0),
    loudnessRangeCeilingLu: z.number().default(6.5),
    language: z.string().default("th-TH"),
  }).default({
    dialoguePriority: "paramount",
    noBackgroundScoreDefault: true,
    nativeAudioEnabledDefault: true,
    targetLufs: -14.0,
    truePeakLimitDbfs: -1.0,
    loudnessRangeCeilingLu: 6.5,
    language: "th-TH",
  }),
  characterVoiceProfiles: z.record(
    z.string(),
    z.object({
      characterName: z.string(),
      gender: z.enum(["female", "male", "non-binary"]),
      timbre: z.string(),
      referenceAudioId: z.string().optional(),
      consentProofAssetId: z.string().optional(),
      formantRatio: z.number().default(1.0),
      pitchShiftSemitones: z.number().default(0),
      speechPacing: z.string().optional(),
      thaiParticleHabit: z.string().optional(),
    })
  ).default({}),
  locationSoundProfiles: z.record(
    z.string(),
    z.object({
      locationName: z.string(),
      acousticSurfaceMaterial: z.string().optional(),
      roomToneAssetId: z.string().optional(),
      roomToneLoopAssetId: z.string().optional(),
      irProfileId: z.string().optional(),
      reverbWetRatio: z.number().default(0.15),
      foleyBaselines: z.array(z.string()).default([]),
    })
  ).default({}),
  profanityPolicy: z.enum(["raw_unfiltered", "platform_safe_bleep", "platform_safe_mute", "mild_substitute"]).default("platform_safe_bleep"),
});
export type SeriesSoundBible = z.infer<typeof seriesSoundBibleSchema>;

/* -------------------------------------------------------------------------- */
/* Validation Helpers                                                         */
/* -------------------------------------------------------------------------- */

export function validateAudioManifest(data: unknown): {
  success: boolean;
  data?: AudioManifest;
  error?: z.ZodError;
} {
  const result = audioManifestSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

export function validateSeriesSoundBible(data: unknown): {
  success: boolean;
  data?: SeriesSoundBible;
  error?: z.ZodError;
} {
  const result = seriesSoundBibleSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

export function validateAudioQcReport(data: unknown): {
  success: boolean;
  data?: AudioQcReport;
  error?: z.ZodError;
} {
  const result = audioQcReportSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
