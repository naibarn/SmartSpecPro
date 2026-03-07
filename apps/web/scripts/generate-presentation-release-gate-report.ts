#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  evaluatePresentationEditAdditionalRolloutGate,
  type PresentationEditAdditionalRolloutGateInput,
} from "../server/services/presentationEditAdditionalRolloutGateEvaluator";
import {
  renderPresentationEditAdditionalReleaseGateReport,
  type PresentationEditAdditionalReleaseGateEvidence,
  type PresentationReleaseGateCommandEvidence,
} from "../server/services/presentationReleaseGateReport";

const repoRoot = resolve(import.meta.dirname, "../../..");
const featureDir = resolve(repoRoot, "specs/feature/030-PresentationEditAdditional");
const gateInputPath = resolve(featureDir, "release-gate-input.json");
const evidencePath = resolve(featureDir, "release-gate-evidence.json");
const reportPath = resolve(featureDir, "release-gate-report.md");

const skipCommands = process.argv.includes("--skip-commands");

const commandMatrix: Array<Pick<PresentationReleaseGateCommandEvidence, "id"> & { command: string }> = [
  {
    id: "ai_presentation_service",
    command: "npm --prefix apps/web test -- server/services/__tests__/aiPresentationService.test.ts",
  },
  {
    id: "presentation_editor",
    command: "npm --prefix apps/web test -- client/src/pages/PresentationEditor.test.tsx",
  },
  {
    id: "canvas_objects",
    command: "npm --prefix apps/web test -- client/src/presentation-canvas/CanvasObjects.test.tsx",
  },
  {
    id: "play_mode",
    command: "npm --prefix apps/web test -- client/src/pages/PresentationPlayMode.test.tsx",
  },
  {
    id: "slide_render",
    command: "npm --prefix apps/web test -- server/routes/slideRender.test.ts",
  },
  {
    id: "playback_export",
    command: "npm --prefix apps/web test -- server/services/presentationPlaybackExport.test.ts",
  },
  {
    id: "degradation_and_warning",
    command:
      "npm --prefix apps/web test -- server/services/presentationExportDegradation.test.ts shared/presentation/exportWarnings.test.ts",
  },
  {
    id: "python_slide_ready_timeout",
    command: "DEBUG=false uv run --project python-backend pytest python-backend/tests/test_presentation_render_task.py -k \"SlideReadyTimeout\"",
  },
  {
    id: "release_gate_core",
    command:
      "npm --prefix apps/web test -- server/services/presentationReleaseReadiness.test.ts server/services/presentationRolloutRunbook.test.ts",
  },
];

function parseVitestTotals(output: string): { passed: number; total: number } | null {
  const match = output.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
  if (!match) {
    return null;
  }
  return { passed: Number(match[1]), total: Number(match[2]) };
}

function parsePytestTotals(output: string): { passed: number; total: number } | null {
  const match = output.match(/=+\s+(\d+)\s+passed(?:,\s*(\d+)\s+deselected)?/);
  if (!match) {
    return null;
  }
  const passed = Number(match[1]);
  return { passed, total: passed };
}

function runCommand(command: string): { output: string; status: "pass" | "fail"; testsPassed: number; testsTotal: number } {
  const run = spawnSync("bash", ["-lc", `source ~/.nvm/nvm.sh && ${command}`], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 12,
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  if (run.status !== 0) {
    return {
      output,
      status: "fail",
      testsPassed: 0,
      testsTotal: 0,
    };
  }

  const vitestTotals = parseVitestTotals(output);
  if (vitestTotals) {
    return {
      output,
      status: "pass",
      testsPassed: vitestTotals.passed,
      testsTotal: vitestTotals.total,
    };
  }

  const pytestTotals = parsePytestTotals(output);
  if (pytestTotals) {
    return {
      output,
      status: "pass",
      testsPassed: pytestTotals.passed,
      testsTotal: pytestTotals.total,
    };
  }

  throw new Error(`Could not parse test totals from command output:\n${command}\n`);
}

function loadGateInput(): PresentationEditAdditionalRolloutGateInput {
  const raw = JSON.parse(readFileSync(gateInputPath, "utf8")) as unknown;
  return raw as PresentationEditAdditionalRolloutGateInput;
}

function main(): void {
  const gateInput = loadGateInput();
  const gateResult = evaluatePresentationEditAdditionalRolloutGate(gateInput);
  const decision = gateResult.passed && !gateResult.shouldHalt ? "go_staged_rollout" : "halt_rollout";

  const commandEvidence: PresentationReleaseGateCommandEvidence[] = [];
  if (skipCommands) {
    const previous = JSON.parse(readFileSync(evidencePath, "utf8")) as PresentationEditAdditionalReleaseGateEvidence;
    commandEvidence.push(...previous.commandEvidence);
  } else {
    for (const item of commandMatrix) {
      // Keep command-by-command output visible in CI logs.
      // eslint-disable-next-line no-console
      console.log(`\n=== ${item.id} ===\n$ ${item.command}`);
      const result = runCommand(item.command);
      // eslint-disable-next-line no-console
      console.log(result.output);
      if (result.status !== "pass") {
        throw new Error(`Command failed for "${item.id}"`);
      }
      commandEvidence.push({
        id: item.id,
        command: item.command,
        status: result.status,
        testsPassed: result.testsPassed,
        testsTotal: result.testsTotal,
      });
    }
  }

  const evidence: PresentationEditAdditionalReleaseGateEvidence = {
    feature: "030-PresentationEditAdditional",
    generatedAt: new Date().toISOString(),
    decision,
    gateInput,
    gateResult,
    commandEvidence,
  };

  const evidenceText = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(evidencePath, evidenceText, "utf8");

  const evidenceSha256 = createHash("sha256").update(evidenceText).digest("hex");
  const report = renderPresentationEditAdditionalReleaseGateReport(evidence, evidenceSha256);
  writeFileSync(reportPath, report, "utf8");

  // eslint-disable-next-line no-console
  console.log(`\nWrote evidence: ${evidencePath}`);
  // eslint-disable-next-line no-console
  console.log(`Wrote report:   ${reportPath}`);

  if (decision !== "go_staged_rollout") {
    throw new Error("Rollout gate evaluator returned halt_rollout");
  }
}

main();
