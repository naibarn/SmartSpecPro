import type { AudioQCReport } from "../../types/audioScoring";
import type { SmartSpecProjectDraft } from "../../types/nleProject";

export interface FullMixMeasurement {
  sourceDurationMs: number;
  integratedLufs: number;
  loudnessRangeLu: number;
  maxTruePeakDb: number;
  dialogueIntelligibilityScore: number;
  clippingDetected: boolean;
  analyzerVersion: string;
  measuredAt: string;
}

function insufficientMeasurementReport(reason: string): AudioQCReport {
  return {
    passed: false,
    integratedLufs: null,
    targetLufs: -16.0,
    loudnessRangeLu: null,
    maxTruePeakDb: null,
    dialogueIntelligibilityScore: 0,
    clippingDetected: false,
    issues: [reason],
    recommendations: ["Render and measure the complete mix with the approved FFmpeg/analyzer path before applying."],
    measurementStatus: "insufficient_data",
  };
}

/**
 * Validates measurements produced by the real full-mix analyzer. This module
 * deliberately never estimates LUFS, peak, intelligibility or LRA from track
 * volume values; unknown measurements cannot pass QC.
 */
export function runAudioQualityControl(
  _project: SmartSpecProjectDraft,
  _generatedCues: unknown[] = [],
  measurement?: FullMixMeasurement,
): AudioQCReport {
  if (!measurement) {
    return insufficientMeasurementReport("Full-program audio measurement is unavailable; track-volume formulas are not QC evidence.");
  }

  const issues: string[] = [];
  const recommendations: string[] = [];
  if (!Number.isFinite(measurement.integratedLufs) || Math.abs(measurement.integratedLufs + 16) > 1) {
    issues.push("Integrated loudness is outside the web_drama_v1 target tolerance.");
    recommendations.push("Apply bounded DSP-only loudness remediation and remeasure the emitted file.");
  }
  if (!Number.isFinite(measurement.maxTruePeakDb) || measurement.maxTruePeakDb > -1) {
    issues.push("True peak measurement is above the -1 dBTP ceiling or unknown.");
  }
  if (measurement.clippingDetected || measurement.dialogueIntelligibilityScore < 0.8) {
    issues.push("Clipping or dialogue intelligibility gate failed.");
  }

  return {
    passed: issues.length === 0,
    integratedLufs: measurement.integratedLufs,
    targetLufs: -16.0,
    loudnessRangeLu: measurement.loudnessRangeLu,
    maxTruePeakDb: measurement.maxTruePeakDb,
    dialogueIntelligibilityScore: measurement.dialogueIntelligibilityScore,
    clippingDetected: measurement.clippingDetected,
    issues,
    recommendations,
    measurementStatus: "measured",
    sourceDurationMs: measurement.sourceDurationMs,
    measuredAt: measurement.measuredAt,
    analyzerVersion: measurement.analyzerVersion,
  };
}

/**
 * Kept as a bounded DSP helper for callers that explicitly request a remix.
 * It does not claim QC success; callers must run the real analyzer again.
 */
export function autoRemixForQcCompliance(project: SmartSpecProjectDraft): SmartSpecProjectDraft {
  return {
    ...project,
    tracks: project.tracks.map((track) => track.id === "track_a2"
      ? {
          ...track,
          volume: Math.min(track.volume, 0.35),
          ducking: {
            enabled: true,
            sidechainSourceTrackId: "track_a1",
            attenuationDb: -12.0,
            thresholdDb: -28.0,
            attackMs: 50,
            releaseMs: 300,
            holdMs: 100,
          },
        }
      : track),
    updatedAt: new Date().toISOString(),
  };
}
