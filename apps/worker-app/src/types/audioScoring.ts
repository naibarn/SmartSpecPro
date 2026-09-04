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
  provider: "minimax_direct" | "project_bin" | "harmonic_fallback" | "library";
  tags?: string[];
}

export type MusicCuePlacement = "intro_hook" | "dialogue_underbed" | "suspense_buildup" | "cliffhanger_outro";

export interface MusicCue {
  cueId: string;
  timelineStartMs: number;
  timelineDurationMs: number;
  placement: MusicCuePlacement;
  stylePrompt: string;
  lyricsPrompt?: string;          // instrumental vs vocal lyric tags
  tempoBpm?: number;
  intensity: number;              // 0.0 - 1.0
  sourceAssetId?: string;
  audioFilePath?: string;
  duckingRequired: boolean;
  duckingLevelDb?: number;        // e.g. -16.0 dB
  fadeInMs: number;
  fadeOutMs: number;
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
  integratedLufs: number;         // measured LUFS
  targetLufs: number;             // target e.g. -16.0
  loudnessRangeLu: number;        // LRA
  maxTruePeakDb: number;          // measured true peak
  dialogueIntelligibilityScore: number; // 0.0 - 1.0 (ensure dialogue is never overpowered by BGM)
  clippingDetected: boolean;
  issues: string[];
  recommendations: string[];
}
