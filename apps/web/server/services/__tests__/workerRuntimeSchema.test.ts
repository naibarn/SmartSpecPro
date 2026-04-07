import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as schema from "../../../drizzle/schema";

describe("worker runtime schema foundation", () => {
  it("exports worker runtime enums with openclaw_gateway", () => {
    expect((schema as any).workerRuntimeTypeEnum).toBeDefined();
    expect((schema as any).workerRuntimeTypeEnum?.enumValues).toContain("openclaw_gateway");
  });

  it("defines the canonical worker control-plane tables", () => {
    expect((schema as any).workerPolicies).toBeDefined();
    expect((schema as any).runtimeProfiles).toBeDefined();
    expect((schema as any).workers).toBeDefined();
    expect((schema as any).workerHeartbeats).toBeDefined();
    expect((schema as any).workerJobs).toBeDefined();
    expect((schema as any).workerJobEvents).toBeDefined();
    expect((schema as any).workerArtifacts).toBeDefined();
  });

  it("adds externalWorkerId to assistant_profiles as a nullable bridge", () => {
    const columns = getTableColumns(schema.assistantProfiles);
    expect(columns.externalWorkerId).toBeDefined();
    expect(columns.externalWorkerId.notNull).toBe(false);
  });

  it("stores canonical worker metadata columns", () => {
    const workers = (schema as any).workers;
    expect(workers).toBeDefined();
    if (!workers) return;

    const columns = getTableColumns(workers);
    expect(columns.runtimeType).toBeDefined();
    expect(columns.workerMode).toBeDefined();
    expect(columns.runtimeVersion).toBeDefined();
    expect(columns.externalReference).toBeDefined();
    expect(columns.capabilitiesJson).toBeDefined();
    expect(columns.fileScopeMode).toBeDefined();
    expect(columns.lastSeenAt).toBeDefined();
  });

  it("stores canonical worker job metadata columns", () => {
    const workerJobs = (schema as any).workerJobs;
    expect(workerJobs).toBeDefined();
    if (!workerJobs) return;

    const columns = getTableColumns(workerJobs);
    expect(columns.jobType).toBeDefined();
    expect(columns.status).toBeDefined();
    expect(columns.resourceProfile).toBeDefined();
    expect(columns.idempotencyKey).toBeDefined();
    expect(columns.leaseOwnerToken).toBeDefined();
    expect(columns.leaseExpiresAt).toBeDefined();
  });

  it("stores policy and runtime profile tables for forward-compatible runtimes", () => {
    const workerPolicies = (schema as any).workerPolicies;
    const runtimeProfiles = (schema as any).runtimeProfiles;
    expect(workerPolicies).toBeDefined();
    expect(runtimeProfiles).toBeDefined();
    if (!workerPolicies || !runtimeProfiles) return;

    const policyColumns = getTableColumns(workerPolicies);
    const profileColumns = getTableColumns(runtimeProfiles);
    expect(policyColumns.runtimeType).toBeDefined();
    expect(policyColumns.rulesJson).toBeDefined();
    expect(profileColumns.runtimeType).toBeDefined();
    expect(profileColumns.profileJson).toBeDefined();
  });
});
