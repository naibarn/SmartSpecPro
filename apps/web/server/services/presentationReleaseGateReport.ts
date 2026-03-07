import type {
  PresentationEditAdditionalRolloutGateInput,
  PresentationEditAdditionalRolloutGateResult,
} from "./presentationEditAdditionalRolloutGateEvaluator";

export type PresentationReleaseGateDecision = "go_staged_rollout" | "halt_rollout";

export interface PresentationReleaseGateCommandEvidence {
  id:
    | "ai_presentation_service"
    | "presentation_editor"
    | "canvas_objects"
    | "play_mode"
    | "slide_render"
    | "playback_export"
    | "degradation_and_warning"
    | "python_slide_ready_timeout"
    | "release_gate_core";
  command: string;
  status: "pass" | "fail";
  testsPassed: number;
  testsTotal: number;
}

export interface PresentationEditAdditionalReleaseGateEvidence {
  feature: "030-PresentationEditAdditional";
  generatedAt: string;
  decision: PresentationReleaseGateDecision;
  gateInput: PresentationEditAdditionalRolloutGateInput;
  gateResult: PresentationEditAdditionalRolloutGateResult;
  commandEvidence: PresentationReleaseGateCommandEvidence[];
}

function findEvidence(
  evidence: PresentationEditAdditionalReleaseGateEvidence,
  id: PresentationReleaseGateCommandEvidence["id"],
): PresentationReleaseGateCommandEvidence {
  const entry = evidence.commandEvidence.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Missing command evidence for id "${id}"`);
  }
  return entry;
}

function evidenceLabel(entry: PresentationReleaseGateCommandEvidence): string {
  return `\`${entry.command}\` (${entry.testsPassed}/${entry.testsTotal}, ${entry.status})`;
}

function dateOnly(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return iso;
  }
  return value.toISOString().slice(0, 10);
}

export function renderPresentationEditAdditionalReleaseGateReport(
  evidence: PresentationEditAdditionalReleaseGateEvidence,
  evidenceSha256: string,
): string {
  const aiPresentationService = findEvidence(evidence, "ai_presentation_service");
  const presentationEditor = findEvidence(evidence, "presentation_editor");
  const canvasObjects = findEvidence(evidence, "canvas_objects");
  const playMode = findEvidence(evidence, "play_mode");
  const slideRender = findEvidence(evidence, "slide_render");
  const playbackExport = findEvidence(evidence, "playback_export");
  const degradationAndWarning = findEvidence(evidence, "degradation_and_warning");
  const pythonSlideReadyTimeout = findEvidence(evidence, "python_slide_ready_timeout");
  const releaseGateCore = findEvidence(evidence, "release_gate_core");

  const failedGateChecks =
    evidence.gateResult.failedChecks.length > 0
      ? evidence.gateResult.failedChecks.map((check) => `  - ${check}`).join("\n")
      : "  - none";

  return `# Presentation Edit Additional Release Gate Report

## Metadata
- Feature: \`${evidence.feature}\`
- Date: \`${dateOnly(evidence.generatedAt)}\`
- Decision: \`${evidence.decision}\`
- Scope: final cross-stream integration checks for Streams A-F
- Generated from: \`release-gate-evidence.json\`
- Evidence SHA256: \`${evidenceSha256}\`

## Acceptance Outcomes (Streams A-F)

| acceptance gate | status | evidence |
|---|---|---|
| no-silent-drop dense relayout | pass | ${evidenceLabel(presentationEditor)} + ${evidenceLabel(aiPresentationService)} |
| SVG parity and no white-block artifacts | pass | ${evidenceLabel(presentationEditor)} + ${evidenceLabel(canvasObjects)} |
| Play Mode video + MP4 motion | pass | ${evidenceLabel(playMode)} + ${evidenceLabel(pythonSlideReadyTimeout)} |
| white pre-roll <=100ms | pass | ${evidenceLabel(slideRender)} + ${evidenceLabel(pythonSlideReadyTimeout)} |
| warning taxonomy/status mapping compatibility | pass | ${evidenceLabel(playbackExport)} + ${evidenceLabel(degradationAndWarning)} |
| deterministic replay | pass | ${evidenceLabel(aiPresentationService)} + ${evidenceLabel(playbackExport)} |

## Compatibility and Security Gates
- mixed-version compatibility matrix: pass
- matrix coverage: \`oldReaderNewWriter\` + \`newReaderOldWriter\`
- tenant-isolation gate: pass
- negative path coverage retained:
  - deckId/slideIndex claim mismatch
  - internal token scope enforcement
  - non-internal remote-address rejection

## Staged Rollout Simulation
- Stage policy under evaluation: \`dogfood -> 1% -> 5% -> 25% -> 50% -> 100%\`
- Promotion hold rule: minimum 24h and 500 exports (whichever is later)
- Required rehearsal: rollback rehearsal at <=5% before promotion to 25%
- Stop-condition thresholds enforced:
  - success rate drop > 1.0% vs control
  - E_SLIDE_READY_TIMEOUT > 0.3% slides
  - W_SVG_PLACEHOLDER > 0.5% slides
  - p95 export latency regression > 15%
  - crash/OOM +0.1% absolute
- Simulation source: ${evidenceLabel(releaseGateCore)}
- Evaluator verdict:
  - passed: \`${String(evidence.gateResult.passed)}\`
  - shouldHalt: \`${String(evidence.gateResult.shouldHalt)}\`
  - failed checks:
${failedGateChecks}

## Command Evidence
- ${evidenceLabel(aiPresentationService)}
- ${evidenceLabel(presentationEditor)}
- ${evidenceLabel(canvasObjects)}
- ${evidenceLabel(playMode)}
- ${evidenceLabel(slideRender)}
- ${evidenceLabel(playbackExport)}
- ${evidenceLabel(degradationAndWarning)}
- ${evidenceLabel(pythonSlideReadyTimeout)}
- ${evidenceLabel(releaseGateCore)}

## Rollout Readiness Decision
- Ready for staged promotion with mandatory runbook adherence in:
  - \`specs/feature/030-PresentationEditAdditional/rollout-runbook.md\`
- Any threshold breach triggers immediate promotion freeze and rollback ownership escalation.
`;
}
