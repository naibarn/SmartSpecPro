import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const runbookPath = resolve(
  __dirname,
  "../../../../specs/feature/030-PresentationEditAdditional/rollout-runbook.md",
);

function loadRunbook(): string {
  expect(existsSync(runbookPath)).toBe(true);
  return readFileSync(runbookPath, "utf8");
}

describe("presentation rollout runbook (feature 030)", () => {
  it("includes restart/status/log commands for celery-presentation", () => {
    const runbook = loadRunbook();
    expect(runbook).toContain("docker compose -p smartspecpro -f docker-compose.media.yml restart celery-presentation");
    expect(runbook).toContain("docker compose -p smartspecpro -f docker-compose.media.yml ps celery-presentation");
    expect(runbook).toContain("docker logs --tail 200 smartspec-celery-presentation");
  });

  it("documents stage progression and hold rule", () => {
    const runbook = loadRunbook();
    expect(runbook).toContain("dogfood -> 1% -> 5% -> 25% -> 50% -> 100%");
    expect(runbook).toContain("minimum 24h and 500 exports (whichever is later)");
    expect(runbook).toContain("rollback rehearsal at <=5% before promotion to 25%");
  });

  it("documents canary cohort composition gates", () => {
    const runbook = loadRunbook();
    expect(runbook).toContain("media-heavy decks >= 30%");
    expect(runbook).toContain("dense-layout decks >= 20%");
    expect(runbook).toContain("low-complexity baseline decks");
  });

  it("defines stop conditions, ownership, alert windows, and rollback SLA", () => {
    const runbook = loadRunbook();
    expect(runbook).toContain("success rate drop > 1.0% vs control");
    expect(runbook).toContain("E_SLIDE_READY_TIMEOUT > 0.3% slides");
    expect(runbook).toContain("W_SVG_PLACEHOLDER > 0.5% slides");
    expect(runbook).toContain("p95 export latency regression > 15%");
    expect(runbook).toContain("crash/OOM +0.1% absolute");
    expect(runbook).toContain("Canvas Edit FE on-call (primary)");
    expect(runbook).toContain("Export pipeline on-call (secondary)");
    expect(runbook).toContain("acknowledge within 10 minutes");
    expect(runbook).toContain("rollback execution starts within 15 minutes");
    expect(runbook).toContain("fast window: 5m");
    expect(runbook).toContain("stability window: 30m");
  });
});
