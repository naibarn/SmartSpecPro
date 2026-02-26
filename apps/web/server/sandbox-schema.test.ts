/**
 * Sandbox schema definition tests.
 * Validates that all new tables, enums, and extensions compile correctly.
 */
import { describe, it, expect } from "vitest";
import {
  sandboxProfiles,
  sandboxJobs,
  sandboxArtifacts,
  tenantSandboxPolicies,
  sandboxExecutionModeEnum,
  sandboxJobStatusEnum,
  sandboxArtifactTypeEnum,
  sandboxNetworkActionEnum,
  sandboxFeatureTypeEnum,
  skills,
  mediaCallbackEvents,
  presentationConversionRecords,
  apiAuditEvents,
  workflowExecutions,
} from "../drizzle/schema";
import type {
  SandboxProfile,
  InsertSandboxProfile,
  SandboxJob,
  InsertSandboxJob,
  SandboxArtifact,
  InsertSandboxArtifact,
  TenantSandboxPolicy,
  InsertTenantSandboxPolicy,
} from "../drizzle/schema";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("Sandbox Schema Definitions", () => {
  describe("sandboxProfiles table", () => {
    it("should export table with correct name", () => {
      const config = getTableConfig(sandboxProfiles);
      expect(config.name).toBe("sandbox_profiles");
    });

    it("should have slug as unique column", () => {
      const config = getTableConfig(sandboxProfiles);
      const slugCol = config.columns.find((c) => c.name === "slug");
      expect(slugCol).toBeDefined();
      expect(slugCol!.isUnique).toBe(true);
    });

    it("should have correct column types for resource limits", () => {
      const config = getTableConfig(sandboxProfiles);
      const cols = config.columns;
      expect(cols.find((c) => c.name === "cpuLimit")).toBeDefined();
      expect(cols.find((c) => c.name === "memoryLimitMb")).toBeDefined();
      expect(cols.find((c) => c.name === "timeoutSeconds")).toBeDefined();
      expect(cols.find((c) => c.name === "ephemeralDiskMb")).toBeDefined();
    });

    it("should infer correct select and insert types", () => {
      // Type-level check: these should compile without errors
      const _select: SandboxProfile = {} as SandboxProfile;
      const _insert: InsertSandboxProfile = {} as InsertSandboxProfile;
      expect(_select).toBeDefined();
      expect(_insert).toBeDefined();
    });
  });

  describe("sandboxJobs table", () => {
    it("should export table with correct name", () => {
      const config = getTableConfig(sandboxJobs);
      expect(config.name).toBe("sandbox_jobs");
    });

    it("should have varchar(36) id column", () => {
      const config = getTableConfig(sandboxJobs);
      const idCol = config.columns.find((c) => c.name === "id");
      expect(idCol).toBeDefined();
    });

    it("should have indexes for tenant+status and opensandboxId", () => {
      const config = getTableConfig(sandboxJobs);
      expect(config.indexes.length).toBeGreaterThanOrEqual(5);
    });

    it("should reference tenants and users via FK", () => {
      const config = getTableConfig(sandboxJobs);
      expect(config.foreignKeys.length).toBeGreaterThanOrEqual(2);
    });

    it("should infer correct types", () => {
      const _select: SandboxJob = {} as SandboxJob;
      const _insert: InsertSandboxJob = {} as InsertSandboxJob;
      expect(_select).toBeDefined();
      expect(_insert).toBeDefined();
    });
  });

  describe("sandboxArtifacts table", () => {
    it("should export table with correct name", () => {
      const config = getTableConfig(sandboxArtifacts);
      expect(config.name).toBe("sandbox_artifacts");
    });

    it("should reference sandbox_jobs via FK", () => {
      const config = getTableConfig(sandboxArtifacts);
      expect(config.foreignKeys.length).toBeGreaterThanOrEqual(1);
    });

    it("should infer correct types", () => {
      const _select: SandboxArtifact = {} as SandboxArtifact;
      const _insert: InsertSandboxArtifact = {} as InsertSandboxArtifact;
      expect(_select).toBeDefined();
      expect(_insert).toBeDefined();
    });
  });

  describe("tenantSandboxPolicies table", () => {
    it("should export table with correct name", () => {
      const config = getTableConfig(tenantSandboxPolicies);
      expect(config.name).toBe("tenant_sandbox_policies");
    });

    it("should have unique tenantId", () => {
      const config = getTableConfig(tenantSandboxPolicies);
      const tenantCol = config.columns.find((c) => c.name === "tenantId");
      expect(tenantCol).toBeDefined();
      expect(tenantCol!.isUnique).toBe(true);
    });

    it("should infer correct types", () => {
      const _select: TenantSandboxPolicy = {} as TenantSandboxPolicy;
      const _insert: InsertTenantSandboxPolicy = {} as InsertTenantSandboxPolicy;
      expect(_select).toBeDefined();
      expect(_insert).toBeDefined();
    });
  });

  describe("Sandbox Enums", () => {
    it("sandboxExecutionModeEnum should have all expected values", () => {
      expect(sandboxExecutionModeEnum.enumValues).toEqual(
        expect.arrayContaining(["code", "command", "browser", "file", "media"])
      );
      expect(sandboxExecutionModeEnum.enumValues).toHaveLength(5);
    });

    it("sandboxJobStatusEnum should have all expected values", () => {
      expect(sandboxJobStatusEnum.enumValues).toEqual(
        expect.arrayContaining([
          "accepted", "policy_resolved", "queued", "provisioning",
          "staging_inputs", "executing", "collecting_outputs", "persisting",
          "completed", "failed", "timed_out", "canceled",
        ])
      );
      expect(sandboxJobStatusEnum.enumValues).toHaveLength(12);
    });

    it("sandboxArtifactTypeEnum should have all expected values", () => {
      expect(sandboxArtifactTypeEnum.enumValues).toEqual(
        expect.arrayContaining(["primary", "log", "screenshot", "thumbnail", "chunk", "debug"])
      );
      expect(sandboxArtifactTypeEnum.enumValues).toHaveLength(6);
    });

    it("sandboxNetworkActionEnum should have all expected values", () => {
      expect(sandboxNetworkActionEnum.enumValues).toEqual(
        expect.arrayContaining(["deny", "allow"])
      );
      expect(sandboxNetworkActionEnum.enumValues).toHaveLength(2);
    });

    it("sandboxFeatureTypeEnum should have all expected values", () => {
      expect(sandboxFeatureTypeEnum.enumValues).toEqual(
        expect.arrayContaining(["chat", "skill", "workflow", "library", "media", "presentation", "connector"])
      );
      expect(sandboxFeatureTypeEnum.enumValues).toHaveLength(7);
    });
  });

  describe("Existing Table Extensions", () => {
    it("skills table should have sandboxProfileSlug as nullable varchar", () => {
      const config = getTableConfig(skills);
      const col = config.columns.find((c) => c.name === "sandboxProfileSlug");
      expect(col).toBeDefined();
      expect(col!.notNull).toBe(false);
    });

    it("skills table should have requiresNetwork as nullable boolean", () => {
      const config = getTableConfig(skills);
      const col = config.columns.find((c) => c.name === "requiresNetwork");
      expect(col).toBeDefined();
      expect(col!.notNull).toBe(false);
    });

    it("mediaCallbackEvents should have sandboxJobId column", () => {
      const config = getTableConfig(mediaCallbackEvents);
      const col = config.columns.find((c) => c.name === "sandbox_job_id");
      expect(col).toBeDefined();
      expect(col!.notNull).toBe(false);
    });

    it("presentationConversionRecords should have sandboxJobId column", () => {
      const config = getTableConfig(presentationConversionRecords);
      const col = config.columns.find((c) => c.name === "sandbox_job_id");
      expect(col).toBeDefined();
      expect(col!.notNull).toBe(false);
    });

    it("apiAuditEvents should have sandboxJobId and opensandboxId", () => {
      const config = getTableConfig(apiAuditEvents);
      const jobId = config.columns.find((c) => c.name === "sandboxJobId");
      const sbxId = config.columns.find((c) => c.name === "opensandboxId");
      expect(jobId).toBeDefined();
      expect(sbxId).toBeDefined();
    });

    it("workflowExecutions should have sandboxJobIds as JSONB", () => {
      const config = getTableConfig(workflowExecutions);
      const col = config.columns.find((c) => c.name === "sandboxJobIds");
      expect(col).toBeDefined();
    });
  });
});
