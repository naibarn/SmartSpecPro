import { describe, it, expect, vi, beforeEach } from "vitest";
import * as teamService from "../teamService";

describe("teamService", () => {
  describe("validateTeamInput", () => {
    const baseInput: teamService.CreateTeamInput = {
      tenantId: "tenant-1",
      ownerUserId: 1,
      name: "Test Team",
      members: [
        {
          personaId: "persona-1",
          displayName: "Lead Agent",
          isLead: true,
          instructions: "You are a lead researcher.",
        },
        {
          personaId: "persona-2",
          displayName: "Helper Agent",
          isLead: false,
          instructions: "You assist the lead.",
        },
      ],
    };

    it("passes validation with valid input", () => {
      expect(() => teamService.validateTeamInput(baseInput)).not.toThrow();
    });

    it("throws when no members provided", () => {
      expect(() =>
        teamService.validateTeamInput({ ...baseInput, members: [] }),
      ).toThrow("at least 1 member");
    });

    it("throws when no lead member designated", () => {
      const noLead = {
        ...baseInput,
        members: baseInput.members.map((m) => ({ ...m, isLead: false })),
      };
      expect(() => teamService.validateTeamInput(noLead)).toThrow("exactly one lead");
    });

    it("throws when multiple leads designated", () => {
      const multiLead = {
        ...baseInput,
        members: baseInput.members.map((m) => ({ ...m, isLead: true })),
      };
      expect(() => teamService.validateTeamInput(multiLead)).toThrow("exactly one lead");
    });

    it("throws when member count exceeds 10", () => {
      const tooMany = {
        ...baseInput,
        members: Array.from({ length: 11 }, (_, i) => ({
          personaId: `persona-${i}`,
          displayName: `Agent ${i}`,
          isLead: i === 0,
          instructions: "Test",
        })),
      };
      expect(() => teamService.validateTeamInput(tooMany)).toThrow("exceed 10");
    });

    it("throws when member missing personaId", () => {
      const noPersna = {
        ...baseInput,
        members: [
          { ...baseInput.members[0] },
          { ...baseInput.members[1], personaId: undefined as any },
        ],
      };
      expect(() => teamService.validateTeamInput(noPersna)).toThrow("personaId");
    });

    it("allows mixed members when exactly one assistant lead exists", () => {
      const mixed = {
        ...baseInput,
        members: [
          ...baseInput.members,
          {
            memberKind: "human" as const,
            humanUserId: 99,
            displayName: "Human Reviewer",
            isLead: false,
          },
          {
            memberKind: "external_connector" as const,
            externalRef: "openclaw://desk-1",
            displayName: "OpenClaw Desk",
            isLead: false,
          },
        ],
      };

      expect(() => teamService.validateTeamInput(mixed)).not.toThrow();
    });

    it("throws when more than one assistant orchestrator exists", () => {
      const invalid = {
        ...baseInput,
        members: baseInput.members.map((member) => ({
          ...member,
          memberRole: "orchestrator" as const,
          isLead: member.personaId === "persona-1",
        })),
      };

      expect(() => teamService.validateTeamInput(invalid)).toThrow("orchestrator");
    });

    it("throws when a human member is marked as lead", () => {
      const invalid = {
        ...baseInput,
        members: [
          {
            memberKind: "human" as const,
            humanUserId: 99,
            displayName: "Human Lead",
            isLead: true,
          },
          { ...baseInput.members[1], isLead: false },
        ],
      };

      expect(() => teamService.validateTeamInput(invalid as any)).toThrow("lead");
    });

    it("allows assistant blueprint references before persona provisioning", () => {
      const blueprintBacked = {
        ...baseInput,
        members: [
          {
            blueprintId: "creative-content-studio",
            blueprintMemberId: "content-director",
            displayName: "Content Director",
            isLead: true,
            instructions: "Lead the team",
          },
          {
            blueprintId: "creative-content-studio",
            blueprintMemberId: "copywriter",
            displayName: "Creative Copywriter",
            isLead: false,
            instructions: "Write content",
          },
        ],
      };

      expect(() => teamService.validateTeamInput(blueprintBacked as any)).not.toThrow();
    });

    it("throws when the same assistant persona is included twice", () => {
      const duplicateAssistants = {
        ...baseInput,
        members: [
          { ...baseInput.members[0], personaId: "persona-1" },
          { ...baseInput.members[1], personaId: "persona-1" },
        ],
      };

      expect(() => teamService.validateTeamInput(duplicateAssistants)).toThrow("duplicate members");
    });

    it("throws when the same human user is included twice", () => {
      const duplicateHumans = {
        ...baseInput,
        members: [
          { ...baseInput.members[0] },
          {
            memberKind: "human" as const,
            humanUserId: 99,
            displayName: "Human A",
            isLead: false,
          },
          {
            memberKind: "human" as const,
            humanUserId: 99,
            displayName: "Human B",
            isLead: false,
          },
        ],
      };

      expect(() => teamService.validateTeamInput(duplicateHumans as any)).toThrow("duplicate members");
    });

    it("throws when the same external connector is included twice", () => {
      const duplicateExternal = {
        ...baseInput,
        members: [
          { ...baseInput.members[0] },
          {
            memberKind: "external_connector" as const,
            externalRef: "OpenClaw://desk-1",
            displayName: "Desk A",
            isLead: false,
          },
          {
            memberKind: "external_connector" as const,
            externalRef: "openclaw://desk-1",
            displayName: "Desk B",
            isLead: false,
          },
        ],
      };

      expect(() => teamService.validateTeamInput(duplicateExternal as any)).toThrow("duplicate members");
    });
  });

  describe("generateTeamSlug", () => {
    it("generates lowercase hyphenated slug from name", () => {
      const slug = teamService.generateTeamSlug("Research & Analysis Team");
      expect(slug).toMatch(/^research-analysis-team-[a-f0-9]{6}$/);
    });

    it("truncates long names to 80 chars", () => {
      const longName = "A".repeat(100);
      const slug = teamService.generateTeamSlug(longName);
      // base is truncated to 80, then "-" + 6 hex chars = 87 max
      expect(slug.length).toBeLessThanOrEqual(87);
    });

    it("handles empty name gracefully", () => {
      const slug = teamService.generateTeamSlug("");
      expect(slug).toMatch(/^-[a-f0-9]{6}$/);
    });
  });

  describe("type exports", () => {
    it("exports CreateTeamInput interface", () => {
      const input: teamService.CreateTeamInput = {
        tenantId: "t",
        ownerUserId: 1,
        name: "n",
        members: [],
      };
      expect(input.tenantId).toBe("t");
    });

    it("exports CreateTeamMemberInput interface", () => {
      const m: teamService.CreateTeamMemberInput = {
        memberKind: "assistant",
        personaId: "p",
        displayName: "d",
        isLead: false,
        instructions: "i",
      };
      expect(m.personaId).toBe("p");
    });

    it("exports mixed-member fields on CreateTeamMemberInput", () => {
      const m: teamService.CreateTeamMemberInput = {
        memberKind: "external_connector",
        memberRole: "publisher",
        externalRef: "manus://worker-1",
        displayName: "Manus Worker",
        isLead: false,
      };
      expect(m.externalRef).toBe("manus://worker-1");
    });

    it("exports CreateTeamResult interface", () => {
      const r: teamService.CreateTeamResult = {
        teamId: "t",
        agencyId: "a",
        members: [],
      };
      expect(r.teamId).toBe("t");
    });
  });
});
