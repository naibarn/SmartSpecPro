import type { HyperframesCompositionInput } from "@shared/hyperframes/contracts";
import type { HyperframesStagedManifest } from "./hyperframesAssetStagingService";

export type HyperframesQaIssueCode =
  | "composition_schema_invalid"
  | "stale_input_hash"
  | "missing_required_asset"
  | "missing_disclosure"
  | "invalid_subtitle_safe_area"
  | "blank_frames"
  | "unplayable_output"
  | "duration_mismatch"
  | "resolution_mismatch"
  | "missing_required_audio"
  | "output_checksum_missing";

export interface HyperframesQaIssue {
  code: HyperframesQaIssueCode;
  severity: "warning" | "blocking";
  safeMessage: string;
}

export interface HyperframesQaResult {
  status: "passed" | "passed_with_warnings" | "failed";
  issues: HyperframesQaIssue[];
  libraryReady: boolean;
}

export function runHyperframesPreRenderQa(input: {
  composition: HyperframesCompositionInput;
  manifest?: HyperframesStagedManifest | null;
  expectedInputHash?: string | null;
}): HyperframesQaResult {
  const issues: HyperframesQaIssue[] = [];
  if (
    input.expectedInputHash &&
    input.expectedInputHash !== input.composition.provenance.compositionInputHash
  ) {
    issues.push({
      code: "stale_input_hash",
      severity: "blocking",
      safeMessage: "Composition input changed after the plan was created.",
    });
  }
  if (!input.manifest || input.manifest.assets.length === 0) {
    issues.push({
      code: "missing_required_asset",
      severity: "blocking",
      safeMessage: "A required product or storyboard asset is missing.",
    });
  }
  if (
    input.composition.compliance.requiresDisclosure &&
    !input.composition.compliance.disclosureText
  ) {
    issues.push({
      code: "missing_disclosure",
      severity: "blocking",
      safeMessage: "Required disclosure copy is missing.",
    });
  }
  const safeArea = input.composition.platformPreset.safeArea;
  if (safeArea.bottom < 80 || safeArea.left < 40 || safeArea.right < 40) {
    issues.push({
      code: "invalid_subtitle_safe_area",
      severity: "blocking",
      safeMessage: "Subtitle safe area is too narrow for this platform preset.",
    });
  }
  const blocking = issues.some(issue => issue.severity === "blocking");
  return {
    status: blocking ? "failed" : issues.length ? "passed_with_warnings" : "passed",
    issues,
    libraryReady: false,
  };
}

export function runHyperframesPostRenderQa(input: {
  outputHash?: string | null;
  playable?: boolean;
  blankFrameRatio?: number;
  durationSeconds?: number;
  expectedDurationSeconds?: number;
  width?: number;
  height?: number;
  expectedWidth?: number;
  expectedHeight?: number;
  audioRequired?: boolean;
  hasAudio?: boolean;
}): HyperframesQaResult {
  const issues: HyperframesQaIssue[] = [];
  if (!input.outputHash) {
    issues.push({
      code: "output_checksum_missing",
      severity: "blocking",
      safeMessage: "Output checksum is missing.",
    });
  }
  if (input.playable === false) {
    issues.push({
      code: "unplayable_output",
      severity: "blocking",
      safeMessage: "Rendered output is not playable.",
    });
  }
  if ((input.blankFrameRatio ?? 0) > 0.25) {
    issues.push({
      code: "blank_frames",
      severity: "blocking",
      safeMessage: "Rendered output contains too many blank frames.",
    });
  }
  if (
    input.expectedDurationSeconds &&
    input.durationSeconds &&
    Math.abs(input.durationSeconds - input.expectedDurationSeconds) > 2
  ) {
    issues.push({
      code: "duration_mismatch",
      severity: "blocking",
      safeMessage: "Rendered duration does not match the composition profile.",
    });
  }
  if (
    input.expectedWidth &&
    input.expectedHeight &&
    (input.width !== input.expectedWidth || input.height !== input.expectedHeight)
  ) {
    issues.push({
      code: "resolution_mismatch",
      severity: "blocking",
      safeMessage: "Rendered resolution does not match the platform preset.",
    });
  }
  if (input.audioRequired && !input.hasAudio) {
    issues.push({
      code: "missing_required_audio",
      severity: "blocking",
      safeMessage: "Required audio track is missing.",
    });
  }
  const blocking = issues.some(issue => issue.severity === "blocking");
  return {
    status: blocking ? "failed" : issues.length ? "passed_with_warnings" : "passed",
    issues,
    libraryReady: !blocking,
  };
}
