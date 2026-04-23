import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  scopedMemories,
  memoryPromotions,
  memoryOwnerTypeEnum,
  memoryKindEnum,
  memoryVisibilityEnum,
  memorySourceTypeEnum,
} from "../../../drizzle/schema";

// Unit tests for schema definitions + service logic
// DB integration tests are in section-18

describe("Scoped Memory Schema", () => {
  describe("enums", () => {
    it("memoryOwnerTypeEnum has correct values", () => {
      expect(memoryOwnerTypeEnum.enumValues).toEqual([
        "user", "agent", "team", "room", "project", "run",
      ]);
    });

    it("memoryKindEnum has correct values", () => {
      expect(memoryKindEnum.enumValues).toEqual([
        "fact", "rule", "preference", "decision", "note",
        "checklist", "artifact_note", "handoff_note", "episode",
      ]);
    });

    it("memoryVisibilityEnum has correct values", () => {
      expect(memoryVisibilityEnum.enumValues).toEqual([
        "private", "shared_team", "shared_room", "shared_project",
      ]);
    });

    it("memorySourceTypeEnum has correct values", () => {
      expect(memorySourceTypeEnum.enumValues).toEqual([
        "auto", "manual", "promoted",
      ]);
    });
  });

  describe("scoped_memories table", () => {
    it("has all required columns", () => {
      const cols = Object.keys(scopedMemories);
      expect(cols).toContain("id");
      expect(cols).toContain("tenantId");
      expect(cols).toContain("ownerType");
      expect(cols).toContain("ownerId");
      expect(cols).toContain("memoryKind");
      expect(cols).toContain("visibility");
      expect(cols).toContain("sourceType");
      expect(cols).toContain("title");
      expect(cols).toContain("content");
      expect(cols).toContain("embedding");
      expect(cols).toContain("tags");
      expect(cols).toContain("confidence");
      expect(cols).toContain("importance");
      expect(cols).toContain("reinforcementCount");
      expect(cols).toContain("lastAccessedAt");
      expect(cols).toContain("expiresAt");
    });
  });

  describe("memory_promotions table", () => {
    it("has all required columns", () => {
      const cols = Object.keys(memoryPromotions);
      expect(cols).toContain("id");
      expect(cols).toContain("memoryId");
      expect(cols).toContain("fromOwnerType");
      expect(cols).toContain("fromOwnerId");
      expect(cols).toContain("toOwnerType");
      expect(cols).toContain("toOwnerId");
      expect(cols).toContain("promotedByUserId");
      expect(cols).toContain("promotedByAssistantId");
      expect(cols).toContain("reason");
    });
  });
});

describe("scopedMemoryService", () => {
  // Import the service module
  let service: typeof import("../scopedMemoryService");

  beforeEach(async () => {
    service = await import("../scopedMemoryService");
  });

  describe("MemoryScope type", () => {
    it("exports MemoryScope interface with type and id", () => {
      const scope: import("../scopedMemoryService").MemoryScope = {
        type: "agent",
        id: "agent-123",
      };
      expect(scope.type).toBe("agent");
      expect(scope.id).toBe("agent-123");
    });
  });

  describe("SearchOptions type", () => {
    it("exports SearchOptions with required and optional fields", () => {
      const opts: import("../scopedMemoryService").SearchOptions = {
        scopes: [{ type: "agent", id: "a1" }],
        query: "test query",
      };
      expect(opts.topK).toBeUndefined();
      expect(opts.keywordWeight).toBeUndefined();
    });
  });

  describe("SCOPE_PRIORITY", () => {
    it("defines correct priority order (agent > run > room > team > project > user)", () => {
      expect(service.SCOPE_PRIORITY).toEqual({
        agent: 6,
        run: 5,
        room: 4,
        team: 3,
        project: 2,
        user: 1,
      });
    });
  });

  describe("getDefaultVisibility", () => {
    it("returns private for agent owner type", () => {
      expect(service.getDefaultVisibility("agent")).toBe("private");
    });

    it("returns shared_team for team owner type", () => {
      expect(service.getDefaultVisibility("team")).toBe("shared_team");
    });

    it("returns shared_room for room owner type", () => {
      expect(service.getDefaultVisibility("room")).toBe("shared_room");
    });

    it("returns private for user owner type", () => {
      expect(service.getDefaultVisibility("user")).toBe("private");
    });
  });

  describe("computeRecencyFactor", () => {
    it("returns 1.0 for just-updated memory", () => {
      const now = new Date();
      expect(service.computeRecencyFactor(now)).toBeCloseTo(1.0, 1);
    });

    it("returns lower factor for older memory", () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
      const factor = service.computeRecencyFactor(tenDaysAgo);
      // 1 / (1 + 10 * 0.1) = 1/2 = 0.5
      expect(factor).toBeCloseTo(0.5, 1);
    });
  });

  describe("buildPromptScopeList", () => {
    it("includes agent, run, room, team, project, and user scopes in priority order", () => {
      expect(
        service.buildPromptScopeList({
          assistantId: "assistant-1",
          runId: "run-1",
          roomId: "room-1",
          teamId: "team-1",
          projectId: "project-1",
          initiatedByUserId: 77,
        }),
      ).toEqual([
        { type: "agent", id: "assistant-1" },
        { type: "run", id: "run-1" },
        { type: "room", id: "room-1" },
        { type: "team", id: "team-1" },
        { type: "project", id: "project-1" },
        { type: "user", id: "77" },
      ]);
    });

    it("deduplicates repeated scopes", () => {
      expect(
        service.buildPromptScopeList({
          assistantId: "assistant-1",
          roomId: "room-1",
          additionalScopes: [
            { type: "room", id: "room-1" },
            { type: "team", id: "team-1" },
            { type: "team", id: "team-1" },
          ],
        }),
      ).toEqual([
        { type: "agent", id: "assistant-1" },
        { type: "room", id: "room-1" },
        { type: "team", id: "team-1" },
      ]);
    });
  });
});
