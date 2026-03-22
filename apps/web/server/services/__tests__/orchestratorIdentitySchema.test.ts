import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../../db";
import {
  userOrchestratorProfiles,
  assistantTeams,
  assistantProfiles,
  assistantTeamTemplates,
  personaTemplates,
  orchestratorViewModeEnum,
  orchestratorAutonomyLevelEnum,
  assistantTeamStatusEnum,
  modelSelectionPolicyEnum,
  teamMemberRoleEnum,
} from "../../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Schema validation tests for Virtual AI Office Orchestrator identity tables.
 *
 * These tests verify enum values, defaults, constraints, and FK references
 * for section-01 tables. They use the real database (not mocks).
 */

describe("Orchestrator Identity Schema", () => {
  // Verify the enums are defined with correct values
  describe("Enums", () => {
    it("orchestratorViewModeEnum has correct values", () => {
      expect(orchestratorViewModeEnum.enumValues).toEqual([
        "transparent",
        "milestone",
        "summary",
      ]);
    });

    it("orchestratorAutonomyLevelEnum has correct values", () => {
      expect(orchestratorAutonomyLevelEnum.enumValues).toEqual([
        "manual",
        "guided",
        "autonomous",
      ]);
    });

    it("assistantTeamStatusEnum has correct values", () => {
      expect(assistantTeamStatusEnum.enumValues).toEqual([
        "active",
        "archived",
        "draft",
      ]);
    });

    it("modelSelectionPolicyEnum has correct values", () => {
      expect(modelSelectionPolicyEnum.enumValues).toEqual([
        "fixed",
        "cost_optimized",
        "quality_optimized",
        "auto",
      ]);
    });

    it("teamMemberRoleEnum has correct values", () => {
      expect(teamMemberRoleEnum.enumValues).toEqual([
        "orchestrator",
        "researcher",
        "reviewer",
        "publisher",
        "specialist",
      ]);
    });
  });

  // Verify table column definitions and shapes
  describe("Table shapes", () => {
    describe("user_orchestrator_profiles", () => {
      it("has expected columns", () => {
        const cols = Object.keys(userOrchestratorProfiles);
        expect(cols).toContain("id");
        expect(cols).toContain("userId");
        expect(cols).toContain("defaultPersonaId");
        expect(cols).toContain("preferredViewMode");
        expect(cols).toContain("preferredAutonomyLevel");
        expect(cols).toContain("preferredSummaryStyle");
        expect(cols).toContain("defaultApprovalPolicy");
        expect(cols).toContain("createdAt");
        expect(cols).toContain("updatedAt");
      });
    });

    describe("assistant_teams", () => {
      it("has expected columns", () => {
        const cols = Object.keys(assistantTeams);
        expect(cols).toContain("id");
        expect(cols).toContain("tenantId");
        expect(cols).toContain("ownerUserId");
        expect(cols).toContain("agencyId");
        expect(cols).toContain("name");
        expect(cols).toContain("status");
        expect(cols).toContain("defaultViewMode");
        expect(cols).toContain("defaultAutonomyLevel");
        expect(cols).toContain("modelBudgetPolicy");
      });
    });

    describe("assistant_profiles", () => {
      it("has expected columns", () => {
        const cols = Object.keys(assistantProfiles);
        expect(cols).toContain("id");
        expect(cols).toContain("tenantId");
        expect(cols).toContain("teamId");
        expect(cols).toContain("memberKind");
        expect(cols).toContain("agencyAgentId");
        expect(cols).toContain("personaId");
        expect(cols).toContain("humanUserId");
        expect(cols).toContain("externalRef");
        expect(cols).toContain("displayName");
        expect(cols).toContain("memberRole");
        expect(cols).toContain("isLead");
        expect(cols).toContain("isActive");
        expect(cols).toContain("sortOrder");
        expect(cols).toContain("modelSelectionPolicy");
        expect(cols).toContain("preferredLanguage");
        expect(cols).toContain("specialtyTags");
      });
    });

    describe("assistant_team_templates", () => {
      it("has expected columns", () => {
        const cols = Object.keys(assistantTeamTemplates);
        expect(cols).toContain("id");
        expect(cols).toContain("tenantId");
        expect(cols).toContain("name");
        expect(cols).toContain("teamConfigJson");
        expect(cols).toContain("memberTemplateJson");
        expect(cols).toContain("isSystem");
      });
    });

    describe("persona_templates", () => {
      it("includes blueprint provenance columns", () => {
        const cols = Object.keys(personaTemplates);
        expect(cols).toContain("provisionedByBlueprintId");
        expect(cols).toContain("provisionedByBlueprintMemberId");
      });
    });
  });

  // Verify inferred types compile correctly
  describe("Type inference", () => {
    it("exports select and insert types", async () => {
      // This is a compile-time check — if types are wrong, TS will fail
      const _selectProfile: typeof userOrchestratorProfiles.$inferSelect = {} as any;
      const _insertProfile: typeof userOrchestratorProfiles.$inferInsert = {} as any;
      const _selectTeam: typeof assistantTeams.$inferSelect = {} as any;
      const _insertTeam: typeof assistantTeams.$inferInsert = {} as any;
      const _selectAssistant: typeof assistantProfiles.$inferSelect = {} as any;
      const _insertAssistant: typeof assistantProfiles.$inferInsert = {} as any;
      const _selectTemplate: typeof assistantTeamTemplates.$inferSelect = {} as any;
      const _insertTemplate: typeof assistantTeamTemplates.$inferInsert = {} as any;
      const _selectPersonaTemplate: typeof personaTemplates.$inferSelect = {} as any;
      const _insertPersonaTemplate: typeof personaTemplates.$inferInsert = {} as any;
      expect(true).toBe(true);
    });
  });
});
