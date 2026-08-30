import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CREDIT_CONTEXT_SOURCE_TYPES } from "../../../shared/creditContextContracts";
import { CREDIT_CONTEXT_REGISTRY } from "../creditContextRegistry";
import { inferCreditContextRefFromMetadata } from "../creditContextBilling";
import { candidateContext, parseCreditContextBackfillArgs } from "../../../scripts/backfill-credit-context-lineage";

describe("credit context foundation", () => {
  it("has an explicit registry entry for every accepted source type", () => {
    for (const sourceType of CREDIT_CONTEXT_SOURCE_TYPES) {
      expect(CREDIT_CONTEXT_REGISTRY[sourceType]).toBeDefined();
    }
  });

  it("only derives historical context from structured series metadata", () => {
    expect(candidateContext({ seriesId: 12 })?.sourceId).toBe("12");
    expect(candidateContext({ description: "series 12" })).toBeNull();
  });

  it("maps structured conversation, skill, worker, and media identities", () => {
    expect(inferCreditContextRefFromMetadata({ conversationId: 7 })).toMatchObject({ sourceType: "conversation", sourceId: "7" });
    expect(inferCreditContextRefFromMetadata({ skillRunId: "skill-run-1" })).toMatchObject({ sourceType: "skill_execution", sourceId: "skill-run-1" });
    expect(inferCreditContextRefFromMetadata({ workerJobId: "worker-1" })).toMatchObject({ sourceType: "worker_job", sourceId: "worker-1" });
    expect(inferCreditContextRefFromMetadata({ mediaTaskId: "media-1" })).toMatchObject({ sourceType: "media_task", sourceId: "media-1" });
  });

  it("defaults backfill to dry-run and bounds the batch", () => {
    expect(parseCreditContextBackfillArgs([])).toMatchObject({ apply: false, batchSize: 100 });
    expect(parseCreditContextBackfillArgs(["--apply", "--batch-size", "5000"]).batchSize).toBe(1000);
  });

  it("uses the next migration after the current journal", () => {
    const migration = fs.readFileSync(path.resolve(process.cwd(), "drizzle/0264_credit_context_polymorphic_lineage.sql"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "credit_contexts"');
    expect(migration).toContain('"id" uuid PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(migration).not.toContain("UPDATE \"users\"");
  });
});
