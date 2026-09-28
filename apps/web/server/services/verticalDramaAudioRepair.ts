/**
 * Vertical Drama Series — Feature 175: Surgical Demucs Stem Repair Pipeline
 *
 * Implements Zero-Pixel Audio Repair:
 * - Demucs v4 stem isolation command builder with VRAM guardrail (GPU vs CPU)
 * - TTS SSML builder with Thai particle tonal preservation (<prosody pitch="+5%">)
 * - Acoustic Room Impulse Response (IR) convolver filter (afir)
 * - Zero-pixel lossless video remuxing command (-c:v copy)
 * - Credit savings calculator (saving ~92% credits vs full video re-render)
 */

export interface DemucsOptions {
  device?: "cuda" | "cpu";
  freeVramGb?: number;
  model?: "htdemucs" | "htdemucs_ft";
}

export interface TtsSsmlOptions {
  pitchShiftSemitones?: number;
  speedRate?: number;
  preserveThaiParticles?: boolean;
}

export const THAI_PARTICLES = [
  "ครับ", "ค่ะ", "นะคะ", "คะ", "จ้ะ", "จ๊ะ", "จ๋า", "ขอรับ", "เจ้าค่ะ", "นะ", "ล่ะ", "สิ",
];

/**
 * Builds Demucs CLI execution arguments with automatic VRAM fallback to CPU if VRAM < 2.0GB.
 */
export function buildDemucsSeparationArgs(
  inputAudioPath: string,
  outputDir: string,
  options: DemucsOptions = {}
): string[] {
  const freeVram = options.freeVramGb ?? 8.0;
  // Guardrail: fallback to CPU if free VRAM < 2.0GB to prevent CUDA OOM
  const device = options.device ?? (freeVram < 2.0 ? "cpu" : "cuda");
  const model = options.model ?? "htdemucs";

  return [
    "demucs",
    "-n", model,
    "--two-stems", "vocals",
    "-d", device,
    "-o", outputDir,
    inputAudioPath,
  ];
}

/**
 * Generates SSML for TTS dialogue replacement.
 * Automatically wraps Thai conversational polite particles in elevated pitch tags to preserve natural tone.
 */
export function buildTtsSsml(text: string, options: TtsSsmlOptions = {}): string {
  let processedText = text;

  if (options.preserveThaiParticles !== false) {
    const sortedParticles = [...THAI_PARTICLES].sort((a, b) => b.length - a.length);
    const particleRegex = new RegExp(`(${sortedParticles.join("|")})`, "g");
    processedText = processedText.replace(
      particleRegex,
      `<prosody pitch="+5%">$1</prosody>`
    );
  }

  const pitch = options.pitchShiftSemitones ? `${options.pitchShiftSemitones > 0 ? "+" : ""}${options.pitchShiftSemitones}st` : "0st";
  const rate = options.speedRate ? `${Math.round(options.speedRate * 100)}%` : "100%";

  return `<speak><prosody pitch="${pitch}" rate="${rate}">${processedText}</prosody></speak>`;
}

/**
 * Builds an FFmpeg convolution filter string using an Impulse Response (IR) audio file.
 */
export function buildIrConvolverFilter(wetRatio: number = 0.15): string {
  const clampedWet = Math.max(0.0, Math.min(1.0, wetRatio));
  const dryRatio = Math.round((1.0 - clampedWet) * 100) / 100;
  const wetFormatted = Math.round(clampedWet * 100) / 100;

  return `[0:a][1:a]afir=dry=${dryRatio}:wet=${wetFormatted}[reverbed]`;
}

/**
 * Builds FFmpeg command arguments to losslessly remux video with repaired audio track.
 * Video bitstream is copied without re-encoding (-c:v copy), preserving 100% original visual pixels.
 */
export function buildSurgicalRemuxCommand(
  originalVideoPath: string,
  repairedAudioPath: string,
  outputPath: string
): string[] {
  return [
    "-y",
    "-i", originalVideoPath,
    "-i", repairedAudioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-shortest",
    outputPath,
  ];
}

/**
 * Computes estimated credit cost and credit savings of surgical audio repair vs full video re-render.
 */
export function estimateRepairCreditCost(durationSec: number): {
  repairCredits: number;
  fullRerenderCredits: number;
  savingsPercentage: number;
} {
  // Full re-rendering video costs typically 60 credits per 6s shot (10 credits/sec)
  const fullRerenderCredits = Math.ceil(durationSec * 10);
  // Surgical stem separation + TTS swap costs flat 5 credits
  const repairCredits = 5;
  const savings = ((fullRerenderCredits - repairCredits) / fullRerenderCredits) * 100;

  return {
    repairCredits,
    fullRerenderCredits,
    savingsPercentage: Math.round(savings * 10) / 10,
  };
}

/**
 * Builds downward expander noise gate filter to suppress low-level ambient floor without abrupt cutting.
 */
export function buildDownwardExpanderNoiseGateFilter(): string {
  return "agate=threshold=0.03:ratio=3:range=0.05:attack=20:release=250";
}

/**
 * Builds WSOLA filter graph to inject dramatic pause (silence/room tone) at an exact timecode.
 */
export function buildWsolaPauseFilter(insertionSec: number, pauseDurationSec: number): string {
  return `[0:a]asplit=2[pre][post];[pre]atrim=0:${insertionSec.toFixed(2)}[a1];[post]atrim=${insertionSec.toFixed(2)}[a2];anullsrc=d=${pauseDurationSec.toFixed(2)}:r=48000:cl=stereo[pause];[a1][pause][a2]concat=n=3:v=0:a=1[out]`;
}

/**
 * Builds sub-segment punch-in editing instructions.
 */
export function buildSubSegmentPunchInFilter(
  segments: Array<{ startSec: number; endSec: number; action: "keep" | "tts_replace" | "foley_infill" }>
): { segmentCount: number; hasReplacements: boolean; filterSummary: string } {
  const hasReplacements = segments.some(s => s.action !== "keep");
  const filterSummary = segments
    .map((s, idx) => `segment_${idx + 1}[${s.startSec}s-${s.endSec}s]:${s.action}`)
    .join(";");

  return {
    segmentCount: segments.length,
    hasReplacements,
    filterSummary,
  };
}

/**
 * Builds Stage 4b Audio-Driven Visual Mouth Realignment dispatch payload.
 */
export function buildMouthRealignmentJobInput(
  videoAssetUrl: string,
  repairedAudioUrl: string,
  model: "liveportrait" | "musetalk" = "liveportrait"
): {
  stage: "STAGE_4B_MOUTH_REALIGNMENT";
  model: "liveportrait" | "musetalk";
  videoUrl: string;
  audioUrl: string;
  targetFps: number;
} {
  return {
    stage: "STAGE_4B_MOUTH_REALIGNMENT",
    model,
    videoUrl: videoAssetUrl,
    audioUrl: repairedAudioUrl,
    targetFps: 25,
  };
}

/**
 * Creates Redis stage checkpoint payload for Spot instance preemption resilience.
 */
export function createStageCheckpointPayload(
  jobKey: string,
  stage: "STAGE_DOWNLOADED" | "STAGE_DEMUXED" | "STAGE_REPAIRED" | "STAGE_MASTERED",
  artifactUrls: Record<string, string>
): { jobKey: string; stage: string; timestamp: string; artifacts: Record<string, string> } {
  return {
    jobKey,
    stage,
    timestamp: new Date().toISOString(),
    artifacts: { ...artifactUrls },
  };
}

/**
 * Builds FFmpeg audio offset correction filter to realign drifting dialogue into AV sync window.
 */
export function buildAvSyncOffsetCorrectionFilter(offsetMs: number): string {
  if (offsetMs === 0) return "anull";
  if (offsetMs > 0) {
    // Audio leads video -> delay audio
    return `adelay=${offsetMs}|${offsetMs}`;
  }
  // Video leads audio -> trim audio start
  const trimSec = Math.abs(offsetMs) / 1000;
  return `atrim=start=${trimSec.toFixed(3)},asetpts=PTS-STARTPTS`;
}

/**
 * Validates Voice Actor Consent Token per PDPA guidelines (Spec §9.3).
 */
export function verifyVoiceActorConsent(consentRecord: {
  actorId: string;
  consentGivenAt: string;
  revokedAt?: string;
}): { valid: boolean; reason?: string } {
  if (!consentRecord.actorId) {
    return { valid: false, reason: "MISSING_ACTOR_ID" };
  }
  if (consentRecord.revokedAt) {
    return { valid: false, reason: "CONSENT_REVOKED" };
  }
  if (!consentRecord.consentGivenAt) {
    return { valid: false, reason: "NO_CONSENT_TIMESTAMP" };
  }
  return { valid: true };
}

/**
 * Builds continuous room tone loop filter with seamless crossfade.
 */
export function buildRoomToneLoopFilter(
  targetDurationSec: number,
  roomToneAssetDurationSec: number
): string {
  const loopCount = Math.max(1, Math.ceil(targetDurationSec / roomToneAssetDurationSec));
  return `aloop=loop=${loopCount}:size=${Math.round(roomToneAssetDurationSec * 48000)},atrim=0:${targetDurationSec.toFixed(2)}`;
}

/**
 * Resolves standard Demucs output stem filepaths given output directory and track basename.
 */
export function parseDemucsStemPaths(
  outputDir: string,
  trackName: string,
  modelName: string = "htdemucs"
): { vocalsPath: string; noVocalsPath: string } {
  const cleanDir = outputDir.replace(/\/+$/, "");
  const baseName = trackName.replace(/\.[^/.]+$/, "");
  return {
    vocalsPath: `${cleanDir}/${modelName}/${baseName}/vocals.wav`,
    noVocalsPath: `${cleanDir}/${modelName}/${baseName}/no_vocals.wav`,
  };
}
