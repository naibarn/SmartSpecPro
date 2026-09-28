/**
 * SmartAIHub MiniMax Music 3 Direct Runtime + Auto Audio Scoring Specification
 * Canonical Types & Data Models
 */

export type DramaGenre =
  | "romance_ceo"
  | "revenge_thriller"
  | "historical_palace"
  | "urban_suspense"
  | "fantasy_wuxia"
  | "comedy_slice_of_life";

export type AudioPacing = "slow_burn" | "moderate" | "fast_paced" | "dynamic_crescendo";

export type AudioScoringErrorCode =
  | "SKILL_UNAVAILABLE"
  | "SKILL_REVISION_MISMATCH"
  | "SEMANTIC_MODEL_UNAVAILABLE"
  | "MODEL_NOT_INSTALLED"
  | "MODEL_IDENTITY_MISMATCH"
  | "RUNTIME_INCOMPATIBLE"
  | "GPU_UNAVAILABLE"
  | "INSUFFICIENT_RESOURCES"
  | "LICENSE_REVIEW_REQUIRED"
  | "PLAN_STALE"
  | "TRANSCRIPT_UNAVAILABLE"
  | "TIMELINE_MAPPING_PARTIAL"
  | "NATIVE_MUSIC_CONFLICT"
  | "GENERATION_FAILED"
  | "GENERATION_OUTCOME_UNKNOWN"
  | "TAKE_TOO_SHORT"
  | "VOCALS_DETECTED"
  | "QC_FAILED"
  | "RIGHTS_REVIEW_REQUIRED"
  | "PUBLICATION_FAILED"
  | "CANCELED";

export interface SkillExecutionProvenance {
  skillId: "vertical-drama-emotion-score-director";
  skillVersion: string;
  skillContentHash: string;
  mode: "analyze_regions" | "critique_plan" | "revise_plan" | "compile_music_caption" | "critique_caption";
  executionId: string;
  modelProvider: string;
  modelId: string;
  inputHash: string;
  outputHash: string;
  executedAt: string;
}

export interface ApprovedPlanAuthority {
  planId: string;
  planHash: string;
  semanticRevision: string;
  timelineRevision: string;
  approvedAt: string;
  approvedBy: string;
  rightsPolicyHash: string;
  skill: SkillExecutionProvenance;
}

export interface SeriesSoundBible {
  bibleId: string;
  seriesId: string;
  seriesTitle: string;
  primaryGenre: DramaGenre;
  tempoRangeBpm: [number, number]; // e.g. [80, 130]
  keySignatures: string[];        // e.g. ["C minor", "Eb major", "A minor"]
  signatureThemes: Array<{
    themeId: string;
    characterOrMotif: string;     // e.g. "Female Lead Melancholy Theme", "Villain Suspense"
    stylePrompt: string;          // MiniMax prompt e.g. "cinematic strings, melancholic cello solo"
    negativePrompt?: string;
  }>;
  forbiddenElements: string[];    // e.g. ["808 heavy bass", "techno beats", "robotic voice"]
  masteringTargetLufs: number;    // e.g. -16.0 (OTT/Mobile vertical drama standard)
  maxTruePeakDb: number;          // e.g. -1.0 dBTP
}

export interface EpisodeSoundPlan {
  planId: string;
  episodeId: string;
  seriesId: string;
  totalDurationMs: number;
  overallMood: string;
  authority: ApprovedPlanAuthority;
  intensityCurve: Array<{
    timelineMs: number;
    intensity: number; // 0.0 - 1.0
    dramaticEvent?: string;
  }>;
  cues: MusicCue[];
  sfxEvents: SFXEvent[];
}

export interface AudioAsset {
  assetId: string;
  name: string;
  filePath: string;
  category: "music" | "sfx" | "voice";
  durationSeconds: number;
  /** Newly generated score assets have one eligible provider. Legacy assets
   * remain readable elsewhere but cannot be admitted as Music 3 output. */
  provider: "minimax_direct";
  tags?: string[];
}

export type MusicCuePlacement = "intro_hook" | "dialogue_underbed" | "suspense_buildup" | "cliffhanger_outro";

export interface MusicCue {
  cueId: string;
  timelineStartMs: number;
  timelineDurationMs: number;
  placement: MusicCuePlacement;
  displayCaption: string;
  modelInstruction: string;
  lyricsPrompt?: string;          // instrumental vs vocal lyric tags
  tempoBpm?: number;
  intensity: number;              // 0.0 - 1.0
  sourceAssetId?: string;
  audioFilePath?: string;
  duckingRequired: boolean;
  duckingLevelDb?: number;        // e.g. -12.0 dB
  duckingAttackMs?: number;       // default 50 ms (Spec 177 §8.2)
  duckingReleaseMs?: number;      // default 300 ms (Spec 177 §8.2)
  duckingHoldMs?: number;         // default 100 ms (Spec 177 §8.2)
  fadeInMs: number;
  fadeOutMs: number;
  rightsPolicyHash?: string;
}

export interface SFXEvent {
  sfxId: string;
  timelineMs: number;
  durationMs: number;
  category: "foley" | "whoosh_transition" | "impact_dramatic" | "ambient" | "heartbeat_suspense";
  description: string;
  audioFilePath?: string;
  volume: number; // 0.0 - 1.0
}

export interface ShotAudioIntent {
  shotIndex: number;
  startMs: number;
  endMs: number;
  dialoguePresent: boolean;
  emotionalTone: "neutral" | "tender" | "tension" | "climax" | "heartbreak" | "action";
  suggestedBgmAction: "duck" | "swell" | "silence" | "continue";
  targetBgmVolume: number; // 0.0 - 1.0
}

export interface AudioMixAutomationPoint {
  timeMs: number;
  trackId: string;
  volume: number;       // 0.0 - 2.0
  pan?: number;         // -1.0 to 1.0
}

export interface AudioMixAutomation {
  points: AudioMixAutomationPoint[];
}

export interface AudioQCReport {
  passed: boolean;
  integratedLufs: number | null;         // measured LUFS
  targetLufs: number;                    // target e.g. -16.0
  loudnessRangeLu: number | null;        // LRA
  maxTruePeakDb: number | null;          // measured true peak
  dialogueIntelligibilityScore: number; // 0.0 - 1.0 (ensure dialogue is never overpowered by BGM)
  clippingDetected: boolean;
  issues: string[];
  recommendations: string[];
  measurementStatus: "measured" | "insufficient_data" | "failed";
  sourceDurationMs?: number;
  measuredAt?: string;
  analyzerVersion?: string;
}
