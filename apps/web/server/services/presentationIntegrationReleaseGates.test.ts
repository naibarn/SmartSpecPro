import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const releaseGateReportPath = resolve(
  __dirname,
  "../../../../specs/feature/030-PresentationEditAdditional/release-gate-report.md",
);
const releaseGateEvidencePath = resolve(
  __dirname,
  "../../../../specs/feature/030-PresentationEditAdditional/release-gate-evidence.json",
);

function loadReleaseGateReport(): string {
  expect(existsSync(releaseGateReportPath)).toBe(true);
  return readFileSync(releaseGateReportPath, "utf8");
}

function loadReleaseGateEvidence(): {
  decision: string;
  commandEvidence: Array<{ command: string; status: string }>;
} {
  expect(existsSync(releaseGateEvidencePath)).toBe(true);
  return JSON.parse(readFileSync(releaseGateEvidencePath, "utf8")) as {
    decision: string;
    commandEvidence: Array<{ command: string; status: string }>;
  };
}

describe("presentation integration release gates (feature 030)", () => {
  it("documents acceptance outcomes across streams A-F", () => {
    const report = loadReleaseGateReport();
    expect(report).toContain("no-silent-drop dense relayout");
    expect(report).toContain("SVG parity and no white-block artifacts");
    expect(report).toContain("Play Mode video + MP4 motion");
    expect(report).toContain("white pre-roll <=100ms");
    expect(report).toContain("warning taxonomy/status mapping compatibility");
    expect(report).toContain("deterministic replay");
  });

  it("documents mixed-version compatibility and tenant-isolation gates", () => {
    const report = loadReleaseGateReport();
    expect(report).toContain("mixed-version compatibility matrix");
    expect(report).toContain("oldReaderNewWriter");
    expect(report).toContain("newReaderOldWriter");
    expect(report).toContain("tenant-isolation");
    expect(report).toContain("deckId/slideIndex claim mismatch");
  });

  it("documents staged rollout simulation and stop-condition thresholds", () => {
    const report = loadReleaseGateReport();
    expect(report).toContain("dogfood -> 1% -> 5% -> 25% -> 50% -> 100%");
    expect(report).toContain("success rate drop > 1.0% vs control");
    expect(report).toContain("E_SLIDE_READY_TIMEOUT > 0.3% slides");
    expect(report).toContain("W_SVG_PLACEHOLDER > 0.5% slides");
    expect(report).toContain("p95 export latency regression > 15%");
    expect(report).toContain("crash/OOM +0.1% absolute");
    expect(report).toContain("rollback rehearsal at <=5% before promotion to 25%");
  });

  it("includes command evidence for regression and release gating", () => {
    const report = loadReleaseGateReport();
    expect(report).toContain("npm --prefix apps/web test -- server/services/__tests__/aiPresentationService.test.ts");
    expect(report).toContain("npm --prefix apps/web test -- client/src/presentation-canvas/CanvasObjects.test.tsx");
    expect(report).toContain("npm --prefix apps/web test -- client/src/pages/PresentationPlayMode.test.tsx");
    expect(report).toContain("npm --prefix apps/web test -- server/routes/slideRender.test.ts");
    expect(report).toContain("DEBUG=false uv run --project python-backend pytest python-backend/tests/test_presentation_render_task.py -k \"SlideReadyTimeout\"");
  });

  it("pins report content to evidence sha256 and all command statuses", () => {
    const report = loadReleaseGateReport();
    const evidenceRaw = readFileSync(releaseGateEvidencePath, "utf8");
    const evidence = loadReleaseGateEvidence();
    const expectedHash = createHash("sha256").update(evidenceRaw).digest("hex");

    expect(report).toContain(`Evidence SHA256: \`${expectedHash}\``);
    expect(evidence.decision).toBe("go_staged_rollout");
    expect(evidence.commandEvidence.length).toBeGreaterThan(0);
    expect(evidence.commandEvidence.every((entry) => entry.status === "pass")).toBe(true);
    for (const entry of evidence.commandEvidence) {
      expect(report).toContain(entry.command);
    }
  });
});
