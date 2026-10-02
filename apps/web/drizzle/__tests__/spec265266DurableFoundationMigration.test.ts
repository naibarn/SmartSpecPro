import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decisionAnalysisRuns,
  decisionProjects,
  intelligenceDatasets,
  intelligenceEvidenceItems,
  intelligenceResearchRequests,
  intelligenceResearchRuns,
  intelligenceSources,
} from "../schema";

const migration = readFileSync(new URL("../0381_spec265_266_durable_foundation.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../meta/_journal.json", import.meta.url), "utf8")) as { entries: Array<{ idx: number; tag: string }> };

describe("Spec 265/266 durable foundation migration", () => {
  it("adds canonical source, evidence, research and decision records after Spec 262 migrations", () => {
    const entry = journal.entries.find(item => item.tag === "0381_spec265_266_durable_foundation");
    expect(entry).toMatchObject({ idx: 367 });
    expect(migration).toContain('CREATE TABLE "intelligence_sources"');
    expect(migration).toContain('CREATE TABLE "intelligence_evidence_items"');
    expect(migration).toContain('CREATE TABLE "intelligence_research_requests"');
    expect(migration).toContain('CREATE TABLE "intelligence_research_runs"');
    expect(migration).toContain('CREATE TABLE "decision_projects"');
    expect(migration).toContain('CREATE TABLE "decision_analysis_runs"');
    expect(migration).toContain('FOREIGN KEY ("tenantId", "projectId") REFERENCES "decision_projects"("tenantId", "id")');
    expect(migration).toContain('REFERENCES "worker_jobs"("id")');
    expect(migration).toContain('INTELLIGENCE_TENANT_SCOPE_MISMATCH');
    expect(migration).toContain('INTELLIGENCE_RESEARCH_JOB_SCOPE_MISMATCH');
    expect(migration).toContain('DECISION_ANALYSIS_RESEARCH_SCOPE_MISMATCH');
    expect(migration).toContain('"intelligence_research_request_job_scope" BEFORE INSERT OR UPDATE');
    expect(migration).toContain('"decision_analysis_research_scope" BEFORE INSERT');
    expect(migration).toContain('"intelligence_research_request_identity_immutable" BEFORE UPDATE');
    expect(migration).toContain('IMMUTABLE_RESEARCH_REQUEST_IDENTITY');
    expect(migration).toContain('IMMUTABLE_RESEARCH_JOB_BINDING');
    expect(intelligenceSources.sourceJson).toBeDefined();
    expect(intelligenceDatasets.datasetJson).toBeDefined();
    expect(intelligenceEvidenceItems.contentHash).toBeDefined();
    expect(intelligenceResearchRequests.idempotencyKeyHash).toBeDefined();
    expect(intelligenceResearchRuns.receiptJson).toBeDefined();
    expect(decisionProjects.projectJson).toBeDefined();
    expect(decisionAnalysisRuns.snapshotJson).toBeDefined();
  });

  it("keeps public idempotency unique, bounds JSON records, and rejects mutation of immutable receipts", () => {
    expect(migration).toContain('COALESCE("tenantId", \'\')');
    expect(migration).toContain('octet_length("requestJson"::text) <= 65536');
    expect(migration).toContain('"intelligence_evidence_immutable" BEFORE UPDATE OR DELETE');
    expect(migration).toContain('"intelligence_research_run_immutable" BEFORE UPDATE OR DELETE');
    expect(migration).toContain('"decision_analysis_run_immutable" BEFORE UPDATE OR DELETE');
    expect(migration).toContain('"intelligence_source_identity_immutable" BEFORE UPDATE');
    expect(migration).toContain('IMMUTABLE_SOURCE_IDENTITY');
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN)|TRUNCATE/i);
  });
});
