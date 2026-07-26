import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../marketplaceAutoReviewService.ts", import.meta.url),
  "utf8"
);

describe("Marketplace Auto Review durable initialization wiring", () => {
  it("persists a versioned initialization payload and returns through a durable outbox job", () => {
    expect(source).toContain("initializationControl:");
    expect(source).toContain('status: "queued"');
    expect(source).toContain('jobType: "initialize_run"');
    expect(source).toContain(
      "marketplace-auto-review:${runId}:initialize:v1"
    );
    expect(source).toContain("preserveExistingStatus: true");
  });

  it("keeps the legacy direct start contract while exposing an async enqueue entry point", () => {
    expect(source).toContain(
      "export async function startMarketplaceAutoReviewRun("
    );
    expect(source).toContain(
      "export async function enqueueMarketplaceAutoReviewRun("
    );
    expect(source).toMatch(
      /enqueueMarketplaceAutoReviewRun\([\s\S]*?deferInitialization: true/
    );
  });

  it("rehydrates initialization from the persisted payload and marks completion", () => {
    expect(source).toContain(
      "export async function initializeMarketplaceAutoReviewRun("
    );
    expect(source).toContain(
      "initializationInput as MarketplaceAutoReviewStartInput"
    );
    expect(source).toContain("initializationRunId: runId");
    expect(source).toContain('status: "completed"');
  });

  it("repairs a missing outbox insert from the active-run scanner without resetting an existing job", () => {
    const advanceStart = source.indexOf(
      "export async function advanceMarketplaceAutoReviewRun("
    );
    const recovery = source.indexOf(
      'jobType: "initialize_run"',
      advanceStart
    );
    const preserve = source.indexOf(
      "preserveExistingStatus: true",
      recovery
    );
    expect(advanceStart).toBeGreaterThan(-1);
    expect(recovery).toBeGreaterThan(advanceStart);
    expect(preserve).toBeGreaterThan(recovery);
  });
});
