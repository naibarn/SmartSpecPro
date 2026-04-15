import { describe, it, expect, vi, beforeEach } from "vitest";
import * as teamService from "../teamService";

const { mockGetDb, mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockGetTenantFeatureFlags: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

function makeListBindableWorkersDb(rows: Array<Record<string, unknown>>) {
  const query = {
    from: vi.fn(() => query),
    leftJoin: vi.fn(() => query),
    where: vi.fn(() => query),
    groupBy: vi.fn(() => query),
    orderBy: vi.fn(() => rows),
  };

  return {
    select: vi.fn(() => query),
  };
}

describe("teamService", () => {
  beforeEach(() => {
    mockGetDb.mockReset();
    mockGetTenantFeatureFlags.mockReset();
  });

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

    it("throws when the same bound external worker is included twice", () => {
      const duplicateBoundWorker = {
        ...baseInput,
        members: [
          { ...baseInput.members[0] },
          {
            memberKind: "external_connector" as const,
            externalRef: "openclaw://desk-1",
            externalWorkerId: "11111111-1111-1111-1111-111111111111",
            displayName: "Desk A",
            isLead: false,
          },
          {
            memberKind: "external_connector" as const,
            externalRef: "openclaw://desk-2",
            externalWorkerId: "11111111-1111-1111-1111-111111111111",
            displayName: "Desk B",
            isLead: false,
          },
        ],
      };

      expect(() => teamService.validateTeamInput(duplicateBoundWorker as any)).toThrow("duplicate members");
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

  describe("summarizeBindableWorkerRuntimeCapabilities", () => {
    it("treats Hermes workers as bindable only when nested runtime metadata grants the capability", () => {
      expect(teamService.summarizeBindableWorkerRuntimeCapabilities({
        runtimeType: "hermes_agent_gateway",
        capabilitiesJson: {
          runtimeMetadata: {
            hermesVersion: "1.2.3",
            profileName: "personal-default",
            profileLabel: "Personal Default",
            profilePurpose: "Handle personal follow-up and coordination",
            apiServerEnabled: true,
            apiServerBaseUrl: "http://127.0.0.1:4100",
            terminalBackend: "pty",
            gatewayPlatforms: ["Telegram", "discord", "discord"],
            supportsDelegatedHttp: true,
            supportsDelegatedMcp: false,
            supportsBoundConnector: true,
            supportsCallbacks: true,
            hostPlatform: "macos",
            hostExecutionMode: "foreground",
          },
        },
      })).toEqual({
        supportsBoundConnector: true,
        channelCompanionPlatforms: ["telegram", "discord"],
        remoteEndpointPolicy: "loopback_only",
      });
    });

    it("fails closed for Hermes workers that omit the nested bound-connector capability", () => {
      expect(teamService.summarizeBindableWorkerRuntimeCapabilities({
        runtimeType: "hermes_agent_gateway",
        capabilitiesJson: {
          supportsBoundConnector: true,
          runtimeMetadata: {
            hermesVersion: "1.2.3",
            profileName: "personal-default",
            profileLabel: "Personal Default",
            profilePurpose: "Handle personal follow-up and coordination",
            apiServerEnabled: true,
            apiServerBaseUrl: "http://127.0.0.1:4100",
            terminalBackend: "pty",
            gatewayPlatforms: ["telegram"],
            supportsDelegatedHttp: true,
            supportsDelegatedMcp: false,
            supportsCallbacks: true,
            hostPlatform: "macos",
            hostExecutionMode: "foreground",
          },
        },
      })).toEqual({
        supportsBoundConnector: false,
        channelCompanionPlatforms: ["telegram"],
        remoteEndpointPolicy: "loopback_only",
      });
    });

    it("filters unsafe channel companion labels before surfacing them to the UI", () => {
      expect(teamService.summarizeBindableWorkerRuntimeCapabilities({
        runtimeType: "hermes_agent_gateway",
        capabilitiesJson: {
          runtimeMetadata: {
            hermesVersion: "1.2.3",
            profileName: "personal-default",
            profileLabel: "Personal Default",
            profilePurpose: "Handle personal follow-up and coordination",
            apiServerEnabled: true,
            apiServerBaseUrl: "http://127.0.0.1:4100",
            terminalBackend: "pty",
            gatewayPlatforms: ["telegram", "https://secret.example", "Bearer token", "discord_bot"],
            supportsDelegatedHttp: true,
            supportsDelegatedMcp: false,
            supportsBoundConnector: true,
            supportsCallbacks: true,
            hostPlatform: "macos",
            hostExecutionMode: "foreground",
          },
        },
      })).toEqual({
        supportsBoundConnector: true,
        channelCompanionPlatforms: ["telegram", "discord_bot"],
        remoteEndpointPolicy: "loopback_only",
      });
    });
  });

  describe("listBindableWorkers", () => {
    it("marks Hermes workers unavailable when the tenant rollout gate is disabled", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        hermesAgentRuntime: false,
      });
      mockGetDb.mockResolvedValue(makeListBindableWorkersDb([
        {
          id: "worker-hermes-1",
          displayName: "Hermes Agent",
          status: "online",
          runtimeType: "hermes_agent_gateway",
          runtimeVersion: "0.3.0",
          externalReference: "hermes://profiles/default",
          teamId: null,
          registeredByUserId: 7,
          capabilitiesJson: {
          runtimeMetadata: {
            hermesVersion: "0.3.0",
            profileName: "default",
            profileLabel: "Default Personal Assistant",
            profilePurpose: "Handle personal follow-up and coordination",
            apiServerEnabled: true,
            apiServerBaseUrl: "http://127.0.0.1:9001",
            terminalBackend: "local",
              gatewayPlatforms: ["telegram"],
              supportsDelegatedHttp: true,
              supportsDelegatedMcp: false,
              supportsBoundConnector: true,
              supportsCallbacks: true,
              hostPlatform: "linux",
              hostExecutionMode: "native",
            },
          },
          lastSeenAt: new Date("2026-04-11T00:00:00.000Z"),
          warningFlagsJson: [],
          boundProfileCount: 2,
        },
      ]));

      const workers = await teamService.listBindableWorkers("tenant-1", 7, null);

      expect(workers).toHaveLength(1);
      expect(workers[0]).toEqual(expect.objectContaining({
        id: "worker-hermes-1",
        availableForBinding: false,
        bindingReason: "Hermes runtime is disabled for this tenant",
        remoteEndpointPolicy: "loopback_only",
        personaDisplayLabel: "Default Personal Assistant",
        personaDisplayPurpose: "Handle personal follow-up and coordination",
        channelDisplayLabel: "Connected",
        memorySyncDisplayLabel: "Memory sync off",
      }));
    });

    it("keeps Hermes workers bindable when the tenant rollout gate is enabled and the runtime is ready", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        hermesAgentRuntime: true,
      });
      mockGetDb.mockResolvedValue(makeListBindableWorkersDb([
        {
          id: "worker-hermes-2",
          displayName: "Hermes Agent",
          status: "online",
          runtimeType: "hermes_agent_gateway",
          runtimeVersion: "0.3.0",
          externalReference: "hermes://profiles/default",
          teamId: null,
          registeredByUserId: 7,
          capabilitiesJson: {
          runtimeMetadata: {
            hermesVersion: "0.3.0",
            profileName: "default",
            profileLabel: "Default Personal Assistant",
            profilePurpose: "Handle personal follow-up and coordination",
            apiServerEnabled: true,
            apiServerBaseUrl: "http://127.0.0.1:9001",
            remoteEndpointPolicyExceptionId: "hermes-remote-allow-001",
              terminalBackend: "local",
              gatewayPlatforms: ["telegram", "discord"],
              supportsDelegatedHttp: true,
              supportsDelegatedMcp: false,
              supportsBoundConnector: true,
              supportsCallbacks: true,
              hostPlatform: "linux",
              hostExecutionMode: "native",
            },
          },
          lastSeenAt: new Date("2026-04-11T00:00:00.000Z"),
          warningFlagsJson: [],
          boundProfileCount: 1,
        },
      ]));

      const workers = await teamService.listBindableWorkers("tenant-1", 7, null);

      expect(workers).toHaveLength(1);
      expect(workers[0]).toEqual(expect.objectContaining({
        id: "worker-hermes-2",
        availableForBinding: true,
        bindingReason: null,
        channelCompanionPlatforms: ["telegram", "discord"],
        remoteEndpointPolicy: "audited_exception_granted",
        personaDisplayLabel: "Default Personal Assistant",
        personaDisplayPurpose: "Handle personal follow-up and coordination",
        channelDisplayLabel: "Connected",
        memorySyncDisplayLabel: "Memory sync off",
      }));
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
