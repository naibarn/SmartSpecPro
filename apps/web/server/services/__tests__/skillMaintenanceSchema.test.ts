import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  skillMaintenanceRecommendationStatusEnum,
  skillMaintenanceRiskLevelEnum,
  skillMaintenanceRunTypeEnum,
  skillMaintenanceRunStatusEnum,
  skillMaintenanceCompatibilityStatusEnum,
  skillMaintenanceScheduleStatusEnum,
  skillMaintenanceSchedules,
  skillImprovementRecommendations,
  skillImprovementRuns,
  skillContractSnapshots,
} from "../../../drizzle/schema";
import type {
  SkillMaintenanceSchedule,
  InsertSkillMaintenanceSchedule,
  SkillImprovementRecommendation,
  InsertSkillImprovementRecommendation,
  SkillImprovementRun,
  InsertSkillImprovementRun,
  SkillContractSnapshot,
  InsertSkillContractSnapshot,
} from "../../../drizzle/schema";

describe("Skill Maintenance Schema", () => {
  describe("maintenance enums", () => {
    it("exports recommendation status enum values", () => {
      expect(skillMaintenanceRecommendationStatusEnum.enumValues).toEqual([
        "pending_review",
        "approved",
        "dismissed",
        "applied",
        "blocked",
        "failed",
      ]);
    });

    it("exports risk level enum values", () => {
      expect(skillMaintenanceRiskLevelEnum.enumValues).toEqual([
        "low",
        "medium",
        "high",
        "critical",
      ]);
    });

    it("exports run type enum values", () => {
      expect(skillMaintenanceRunTypeEnum.enumValues).toEqual([
        "analysis",
        "apply",
        "sweep",
        "verify",
      ]);
    });

    it("exports run status enum values", () => {
      expect(skillMaintenanceRunStatusEnum.enumValues).toEqual([
        "queued",
        "running",
        "completed",
        "failed",
        "blocked",
        "canceled",
      ]);
    });

    it("exports compatibility status enum values", () => {
      expect(skillMaintenanceCompatibilityStatusEnum.enumValues).toEqual([
        "unknown",
        "compatible",
        "warning",
        "blocked",
      ]);
    });

    it("exports schedule status enum values", () => {
      expect(skillMaintenanceScheduleStatusEnum.enumValues).toEqual([
        "active",
        "paused",
        "disabled",
      ]);
    });
  });

  describe("skill_maintenance_schedules table", () => {
    it("defines the expected table and key columns", () => {
      const config = getTableConfig(skillMaintenanceSchedules);
      expect(config.name).toBe("skill_maintenance_schedules");
      expect(config.columns.find((c) => c.name === "tenantId")).toBeDefined();
      expect(config.columns.find((c) => c.name === "name")?.notNull).toBe(true);
      expect(config.columns.find((c) => c.name === "status")).toBeDefined();
      expect(config.columns.find((c) => c.name === "scopeJson")?.notNull).toBe(true);
      expect(config.columns.find((c) => c.name === "policyJson")?.notNull).toBe(true);
      expect(config.indexes.length).toBeGreaterThanOrEqual(2);
    });

    it("infers select and insert types", () => {
      const _select: SkillMaintenanceSchedule = {} as SkillMaintenanceSchedule;
      const _insert: InsertSkillMaintenanceSchedule = {} as InsertSkillMaintenanceSchedule;
      expect(_select).toBeDefined();
      expect(_insert).toBeDefined();
    });
  });

  describe("skill_improvement_recommendations table", () => {
    it("stores recommendation queue metadata", () => {
      const config = getTableConfig(skillImprovementRecommendations);
      expect(config.name).toBe("skill_improvement_recommendations");
      expect(config.columns.find((c) => c.name === "skillId")?.notNull).toBe(true);
      expect(config.columns.find((c) => c.name === "recommendationType")?.notNull).toBe(true);
      expect(config.columns.find((c) => c.name === "status")).toBeDefined();
      expect(config.columns.find((c) => c.name === "riskLevel")).toBeDefined();
      expect(config.columns.find((c) => c.name === "compatibilityStatus")).toBeDefined();
      expect(config.columns.find((c) => c.name === "recommendationJson")?.notNull).toBe(true);
      expect(config.columns.find((c) => c.name === "contractDeltaJson")?.notNull).toBe(true);
      expect(config.indexes.length).toBeGreaterThanOrEqual(3);
    });

    it("infers recommendation select and insert types", () => {
      const _select: SkillImprovementRecommendation = {} as SkillImprovementRecommendation;
      const _insert: InsertSkillImprovementRecommendation = {} as InsertSkillImprovementRecommendation;
      expect(_select).toBeDefined();
      expect(_insert).toBeDefined();
    });
  });

  describe("skill_improvement_runs table", () => {
    it("stores maintenance run lifecycle data", () => {
      const config = getTableConfig(skillImprovementRuns);
      expect(config.name).toBe("skill_improvement_runs");
      expect(config.columns.find((c) => c.name === "runType")?.notNull).toBe(true);
      expect(config.columns.find((c) => c.name === "status")?.notNull).toBe(true);
      expect(config.columns.find((c) => c.name === "logsJson")?.notNull).toBe(true);
      expect(config.columns.find((c) => c.name === "verificationJson")?.notNull).toBe(true);
      expect(config.columns.find((c) => c.name === "diffSummaryJson")?.notNull).toBe(true);
      expect(config.indexes.length).toBeGreaterThanOrEqual(4);
    });

    it("infers run select and insert types", () => {
      const _select: SkillImprovementRun = {} as SkillImprovementRun;
      const _insert: InsertSkillImprovementRun = {} as InsertSkillImprovementRun;
      expect(_select).toBeDefined();
      expect(_insert).toBeDefined();
    });
  });

  describe("skill_contract_snapshots table", () => {
    it("stores contract hashes and compatibility snapshots", () => {
      const config = getTableConfig(skillContractSnapshots);
      expect(config.name).toBe("skill_contract_snapshots");
      expect(config.columns.find((c) => c.name === "skillId")?.notNull).toBe(true);
      expect(config.columns.find((c) => c.name === "snapshotType")?.notNull).toBe(true);
      expect(config.columns.find((c) => c.name === "inputSchemaHash")).toBeDefined();
      expect(config.columns.find((c) => c.name === "outputSchemaHash")).toBeDefined();
      expect(config.columns.find((c) => c.name === "contractHash")).toBeDefined();
      expect(config.columns.find((c) => c.name === "snapshotJson")?.notNull).toBe(true);
      expect(config.indexes.length).toBeGreaterThanOrEqual(4);
    });

    it("infers snapshot select and insert types", () => {
      const _select: SkillContractSnapshot = {} as SkillContractSnapshot;
      const _insert: InsertSkillContractSnapshot = {} as InsertSkillContractSnapshot;
      expect(_select).toBeDefined();
      expect(_insert).toBeDefined();
    });
  });
});
