import { describe, expect, it } from "vitest";

import {
  isPostgresNodeJobType,
  POSTGRES_NODE_JOB_TYPES,
} from "../feature186JobTypes";
import { defaultJobExecutorRegistry } from "../../services/jobExecutorRegistry";

describe("Feature 195 PostgreSQL node worker admission", () => {
  it.each(["emergency.report.intake", "emergency.evidence.retention"])("retains canonical Node execution for %s", jobType => {
    expect(isPostgresNodeJobType(jobType)).toBe(true);
    expect(defaultJobExecutorRegistry.resolve(jobType, "feature-186-v1")).toBeDefined();
  });
  it("admits the bounded Cloudflare staging deployment executor", () => {
    expect(isPostgresNodeJobType("cloudflare.staging.deploy")).toBe(true);
    expect(defaultJobExecutorRegistry.resolve(
      "cloudflare.staging.deploy",
      "cloudflare-staging-origin-v2",
    )).toBeDefined();
    expect(defaultJobExecutorRegistry.resolve(
      "cloudflare.staging.deploy",
      "cloudflare-staging-deploy-v1",
    )).toBeDefined();
  });
  it("admits the registered Production Queue preparation executor", () => {
    expect(isPostgresNodeJobType("cloudflare.production.queue.provision")).toBe(true);
    expect(defaultJobExecutorRegistry.resolve(
      "cloudflare.production.queue.provision",
      "cloudflare-production-queue-provision-v1",
    )).toBeDefined();
  });
  it("admits the exact grant-bound Production Database provisioning executor", () => {
    expect(isPostgresNodeJobType("cloudflare.production.database.provision")).toBe(true);
    expect(defaultJobExecutorRegistry.resolve(
      "cloudflare.production.database.provision",
      "cloudflare-prod-db-provision-v1",
    )).toBeDefined();
  });
  it("admits external_agent_task through the canonical worker path", () => {
    expect(POSTGRES_NODE_JOB_TYPES.has("external_agent_task")).toBe(true);
    expect(isPostgresNodeJobType("external_agent_task")).toBe(true);
  });

  it("admits the registered Google Drive cleanup job through the canonical worker path", () => {
    expect(POSTGRES_NODE_JOB_TYPES.has("gdrive.edit_session_cleanup")).toBe(true);
    expect(isPostgresNodeJobType("gdrive.edit_session_cleanup")).toBe(true);
  });

  it("admits Library RAG projection reconciliation through the canonical worker path", () => {
    expect(isPostgresNodeJobType("library.rag_projection_sync")).toBe(true);
    expect(defaultJobExecutorRegistry.resolve(
      "library.rag_projection_sync",
      "feature-186-v1",
    )).toBeDefined();
  });

  it("admits both AutoTeam recovery jobs through the registered canonical worker path", () => {
    for (const jobType of ["auto-team.recovery.scan", "auto-team.recovery.evaluate"]) {
      expect(isPostgresNodeJobType(jobType)).toBe(true);
      expect(defaultJobExecutorRegistry.resolve(
        jobType,
        jobType === "auto-team.recovery.evaluate" ? "auto-team-recovery-v1" : "feature-186-v1",
      )).toBeDefined();
    }
  });

  it("admits the registered workspace authority audit through the canonical worker path", () => {
    expect(isPostgresNodeJobType("workspace.authority.audit")).toBe(true);
    expect(defaultJobExecutorRegistry.resolve(
      "workspace.authority.audit",
      "feature-186-v1",
    )).toBeDefined();
  });

  it("routes Research Notes summaries to the server-owned canonical worker executor", () => {
    expect(isPostgresNodeJobType("research_notes.summarize")).toBe(true);
    expect(defaultJobExecutorRegistry.resolve("research_notes.summarize", "mini-app-research-v1")).toBeDefined();
  });

  it("does not register the retired workflow-node executor in the canonical worker", () => {
    expect(isPostgresNodeJobType("workflow.node.execute")).toBe(false);
    expect(defaultJobExecutorRegistry.resolve("workflow.node.execute", "feature-186-v1")).toBeUndefined();
  });

  it("does not broaden admission to arbitrary external job types", () => {
    expect(isPostgresNodeJobType("external_agent_task:arbitrary")).toBe(false);
    expect(isPostgresNodeJobType("runner.exec")).toBe(false);
  });
});
