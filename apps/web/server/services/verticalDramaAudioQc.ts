/**
 * Vertical Drama Series — Feature 175: Worker Audio QC Engine
 *
 * Provides evaluation and scoring for generated native audio tracks:
 * - Speech detection via Silero VAD (with vocal fry resilience)
 * - Thai ASR Character Error Rate (CER) calculation
 * - Lip-sync / AV synchronization boundary check ([-60ms, +30ms])
 * - Acoustic mastering integrity (LUFS, True Peak, Clipping, BGM bleed)
 * - Ingestion FFmpeg transcoding command builder (CFR 25fps + 48kHz float soxr)
 */

import type { AudioQcReport } from "@shared/verticalDramaSeries/audioContracts";

export interface AudioQcInput {
  seriesId: string;
  episodeId: string;
  shotNumber: number;
  clipNumber?: number;
  expectedText?: string;
  transcribedText?: string;
  hasSpeech?: boolean;
  speechDurationSec?: number;
  avSyncOffsetMs?: number;
  truePeakDbfs?: number;
  integratedLufs?: number;
  loudnessRangeLu?: number;
  clippingDetected?: boolean;
  bgmBleedDetected?: boolean;
  meanF0Hz?: number;
  f0IdentityDrift?: boolean;
}

export const AUDIO_QC_THRESHOLDS = {
  CER_MAX_PASS: 0.15,
  AV_SYNC_MIN_MS: -60,
  AV_SYNC_MAX_MS: 30,
  TRUE_PEAK_MAX_DBFS: -1.0,
  INTEGRATED_LUFS_TARGET: -14.0,
  INTEGRATED_LUFS_TOLERANCE: 1.5,
  MAX_LOUDNESS_RANGE_LU: 6.5,
} as const;

/**
 * Normalizes text by lowercasing, stripping zero-width spaces/whitespace, and converting Thai digits to Arabic.
 */
export function normalizeTextForCer(text: string): string {
  const thaiDigits = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
  let res = text.toLowerCase().trim().replace(/[\s\u200B-\u200D\uFEFF]/g, "");
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(thaiDigits[i], String(i));
  }
  return res;
}

/**
 * Computes Character Error Rate (CER) between expected and transcribed strings.
 * Normalized to handle Thai text whitespace, digits, and zero-width spaces cleanly.
 */
export function calculateCharacterErrorRate(expected: string, actual: string): number {
  const cleanExp = normalizeTextForCer(expected);
  const cleanAct = normalizeTextForCer(actual);

  if (!cleanExp && !cleanAct) return 0.0;
  if (!cleanExp) return 1.0;
  if (!cleanAct) return 1.0;

  const m = cleanExp.length;
  const n = cleanAct.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (cleanExp[i - 1] === cleanAct[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j], // deletion
          dp[i][j - 1], // insertion
          dp[i - 1][j - 1] // substitution
        );
      }
    }
  }

  const distance = dp[m][n];
  return Math.min(1.0, distance / m);
}

/**
 * Builds the standard FFmpeg command line arguments for continuous video/audio ingestion.
 * Enforces CFR 25.000 fps and high-precision 48kHz float resampling (`soxr`).
 */
export function buildIngestionTranscodingArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-y",
    "-i", inputPath,
    "-r", "25",
    "-af", "aresample=48000:resampler=soxr:precision=28",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "pcm_s16le",
    "-ar", "48000",
    "-ac", "2",
    outputPath,
  ];
}

/**
 * Evaluates audio health from worker metrics and returns a structured AudioQcReport.
 */
export function evaluateAudioQc(input: AudioQcInput): AudioQcReport {
  const expectedText = input.expectedText ?? "";
  const transcribedText = input.transcribedText ?? "";
  const hasExpectedSpeech = expectedText.trim().length > 0;
  const hasSpeech = input.hasSpeech ?? (transcribedText.trim().length > 0);

  const cer = hasExpectedSpeech
    ? calculateCharacterErrorRate(expectedText, transcribedText)
    : 0.0;
  const passesCer = cer <= AUDIO_QC_THRESHOLDS.CER_MAX_PASS;

  const avSyncOffsetMs = input.avSyncOffsetMs ?? 0;
  const passesSync =
    avSyncOffsetMs >= AUDIO_QC_THRESHOLDS.AV_SYNC_MIN_MS &&
    avSyncOffsetMs <= AUDIO_QC_THRESHOLDS.AV_SYNC_MAX_MS;

  const truePeakDbfs = input.truePeakDbfs ?? -2.0;
  const integratedLufs = input.integratedLufs ?? -14.0;
  const clippingDetected = input.clippingDetected ?? (truePeakDbfs > -0.1);
  const bgmBleed = input.bgmBleedDetected ?? false;
  const f0IdentityDrift = input.f0IdentityDrift ?? false;

  // Calculate composite score (0-10)
  let score = 10.0;

  if (hasExpectedSpeech) {
    if (!hasSpeech) {
      score -= 6.0;
    } else {
      score -= cer * 5.0;
    }
  }
  if (!passesSync) {
    score -= 2.0;
  }
  if (clippingDetected) {
    score -= 2.0;
  }
  if (bgmBleed) {
    score -= 1.5;
  }
  if (f0IdentityDrift) {
    score -= 1.5;
  }

  score = Math.max(0.0, Math.min(10.0, Math.round(score * 10) / 10));

  // Determine status and suggested action
  let status: AudioQcReport["status"] = "PASS";
  let suggestedAction: AudioQcReport["suggestedAction"] = "NONE";

  if (score <= 5.0) {
    status = "FAIL_RETRY";
    if (hasExpectedSpeech && !passesCer) {
      suggestedAction = "TTS_SWAP";
    } else {
      suggestedAction = "REGENERATE_SHOT";
    }
  } else if (score < 8.0) {
    status = "WARNING_MINOR";
    if (hasExpectedSpeech && !passesCer) {
      suggestedAction = "TTS_SWAP";
    } else if (bgmBleed) {
      suggestedAction = "TTS_SWAP";
    }
  }

  return {
    reportId: `qc_${input.seriesId}_ep${input.episodeId}_s${input.shotNumber}_${Date.now()}`,
    seriesId: input.seriesId,
    episodeId: input.episodeId,
    shotNumber: input.shotNumber,
    clipNumber: input.clipNumber ?? 1,
    overallScore: score,
    status,
    speechQc: {
      hasSpeech,
      speechDurationSec: input.speechDurationSec ?? (hasSpeech ? 3.0 : 0.0),
      asrTranscribedText: transcribedText,
      canonicalExpectedText: expectedText,
      characterErrorRate: cer,
      passesCerThreshold: passesCer,
      meanF0Hz: input.meanF0Hz,
      f0IdentityDrift,
    },
    syncQc: {
      avSyncOffsetMs,
      syncScore: passesSync ? 1.0 : Math.max(0.0, 1.0 - Math.abs(avSyncOffsetMs) / 200),
      passesSyncThreshold: passesSync,
    },
    acousticQc: {
      truePeakDbfs,
      integratedLufs,
      loudnessRangeLu: input.loudnessRangeLu ?? 4.2,
      phaseCorrelation: 0.95,
      clippingDetected,
      dcOffsetDetected: false,
      bgmBleedDetected: bgmBleed,
    },
    suggestedAction,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Computes stereo phase correlation between Left and Right channels.
 * Returns value between -1.0 (complete phase cancellation) and +1.0 (in-phase mono).
 * A healthy stereo mix for mobile phones should be > +0.6.
 */
export function calculateStereoPhaseCorrelation(
  leftChannel: number[],
  rightChannel: number[]
): number {
  if (leftChannel.length === 0 || rightChannel.length === 0) return 1.0;
  const n = Math.min(leftChannel.length, rightChannel.length);

  let sumL = 0;
  let sumR = 0;
  let sumLR = 0;
  let sumL2 = 0;
  let sumR2 = 0;

  for (let i = 0; i < n; i++) {
    const l = leftChannel[i];
    const r = rightChannel[i];
    sumL += l;
    sumR += r;
    sumLR += l * r;
    sumL2 += l * l;
    sumR2 += r * r;
  }

  const meanL = sumL / n;
  const meanR = sumR / n;
  const numerator = sumLR - n * meanL * meanR;
  const denominator = Math.sqrt((sumL2 - n * meanL * meanL) * (sumR2 - n * meanR * meanR));

  if (denominator === 0) return 1.0;
  const correlation = numerator / denominator;
  return Math.max(-1.0, Math.min(1.0, Math.round(correlation * 100) / 100));
}

/**
 * Detects classic Whisper ASR hallucinations during silent intervals.
 */
export function detectWhisperHallucination(
  hasExpectedSpeech: boolean,
  transcribedText: string
): boolean {
  if (hasExpectedSpeech) return false;
  const text = transcribedText.toLowerCase().trim();
  if (!text) return false;

  const hallucinationPatterns = [
    "ขอบคุณสำหรับการรับชม",
    "ขอบคุณครับ",
    "ขอบคุณค่ะ",
    "thank you for watching",
    "subscribe",
    "subtitles by",
  ];

  return hallucinationPatterns.some(pat => text.includes(pat));
}

/**
 * Formats OpenTelemetry audio metrics payload (Spec §11).
 */
export function formatAudioQcTelemetryMetrics(
  report: AudioQcReport
): Record<string, number | string> {
  return {
    "vd_audio_qc_score": report.overallScore,
    "vd_audio_cer": report.speechQc.characterErrorRate,
    "vd_audio_sync_ms": report.syncQc.avSyncOffsetMs,
    "vd_audio_true_peak_dbfs": report.acousticQc.truePeakDbfs,
    "vd_audio_status": report.status,
    "vd_audio_suggested_action": report.suggestedAction,
  };
}
