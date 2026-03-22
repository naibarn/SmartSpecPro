import { describe, it, expect } from "vitest";
import * as roomService from "../roomService";

describe("RoomService", () => {
  describe("type exports", () => {
    it("exports CreateRoomInput interface", () => {
      const input: roomService.CreateRoomInput = {
        teamId: "t1",
        tenantId: "tenant-1",
        orchestratorUserId: 1,
        roomType: "team",
        goalPrompt: "Research topic X",
      };
      expect(input.roomType).toBe("team");
    });

    it("exports SendMessageInput interface", () => {
      const msg: roomService.SendMessageInput = {
        roomId: "r1",
        senderType: "user",
        senderUserId: 1,
        recipientType: "all",
        content: "Hello team",
      };
      expect(msg.senderType).toBe("user");
    });

    it("exports MessageFilters interface", () => {
      const filters: roomService.MessageFilters = {
        viewMode: "transparent",
        callerType: "user",
        limit: 50,
      };
      expect(filters.viewMode).toBe("transparent");
    });
  });

  describe("filterMessagesByViewMode", () => {
    const msgs = [
      { visibility: "transparent", turnType: "discussion" },
      { visibility: "milestone", turnType: "decision" },
      { visibility: "summary_only", turnType: "summary" },
      { visibility: "private_internal", turnType: "discussion" },
    ] as any[];

    it("returns all except private_internal for transparent mode (user caller)", () => {
      const result = roomService.filterMessagesByViewMode(msgs, "transparent", "user");
      expect(result).toHaveLength(3);
      expect(result.map((m: any) => m.visibility)).not.toContain("private_internal");
    });

    it("returns all messages for transparent mode (system caller)", () => {
      const result = roomService.filterMessagesByViewMode(msgs, "transparent", "system");
      expect(result).toHaveLength(4);
    });

    it("returns only transparent + milestone for milestone mode", () => {
      const result = roomService.filterMessagesByViewMode(msgs, "milestone", "user");
      expect(result).toHaveLength(2);
      expect(result.map((m: any) => m.visibility)).toEqual(["transparent", "milestone"]);
    });

    it("returns only summary messages for summary mode", () => {
      const result = roomService.filterMessagesByViewMode(msgs, "summary", "user");
      expect(result).toHaveLength(1);
      expect(result[0].turnType).toBe("summary");
    });
  });

  describe("mapRoomTypeToExecutionMode", () => {
    it("maps supported room types to the correct default run modes", () => {
      expect(roomService.mapRoomTypeToExecutionMode("team")).toBe("team_chat");
      expect(roomService.mapRoomTypeToExecutionMode("auto_team")).toBe("auto_team");
      expect(roomService.mapRoomTypeToExecutionMode("job_review")).toBe("team_chat");
    });

    it("keeps direct rooms on standard chat mode for backward compatibility", () => {
      expect(roomService.mapRoomTypeToExecutionMode("direct")).toBe("team_chat");
    });

    it("allows explicit switching between guided chat and auto team", () => {
      expect(roomService.mapRoomTypeToExecutionMode("team", "auto_team")).toBe("auto_team");
      expect(roomService.mapRoomTypeToExecutionMode("auto_team", "team_chat")).toBe("team_chat");
    });

    it("normalizes deprecated review requests back to guided chat", () => {
      expect(roomService.mapRoomTypeToExecutionMode("team", "review")).toBe("team_chat");
      expect(roomService.mapRoomTypeToExecutionMode("job_review", "review")).toBe("team_chat");
    });
  });

  describe("prepareWorkUpdate", () => {
    it("maps critique updates into review messages with thread metadata", () => {
      const result = roomService.prepareWorkUpdate({
        roomId: "room-1",
        tenantId: "tenant-1",
        senderAssistantId: "assistant-1",
        content: "I found a gap in the article hook.",
        messageType: "critique",
        workItemId: "work-1",
        replyToMessageId: "msg-1",
      });

      expect(result.turnType).toBe("review");
      expect(result.visibility).toBe("transparent");
      expect(result.summaryContent).toContain("I found a gap");
      expect(result.metadataJson).toEqual(expect.objectContaining({
        messageType: "critique",
        workItemId: "work-1",
        replyToMessageId: "msg-1",
        threadRootMessageId: "msg-1",
      }));
    });

    it("redacts sensitive payloads to summary-only content for high sensitivity updates", () => {
      const result = roomService.prepareWorkUpdate({
        roomId: "room-1",
        tenantId: "tenant-1",
        senderAssistantId: "assistant-1",
        content: "Bearer super-secret-token should never be posted directly to the room.",
        messageType: "work_update",
        sensitivity: "high",
        metadataJson: {
          authHeader: "Bearer super-secret-token",
        },
      });

      expect(result.content).toBe(result.summaryContent);
      expect(result.summaryContent).not.toContain("super-secret-token");
      expect(result.metadataJson).toEqual(expect.objectContaining({
        roomRedaction: expect.objectContaining({
          applied: true,
          reason: "sensitive_payload",
        }),
        details: {
          authHeader: "[REDACTED]",
        },
      }));
    });
  });

  describe("projectMessageForView", () => {
    it("prefers summaryContent for redacted user-visible messages", () => {
      const result = roomService.projectMessageForView({
        content: "raw connector payload",
        summaryContent: "safe summary",
        metadataJson: {
          roomRedaction: {
            applied: true,
            reason: "sensitive_payload",
          },
        },
      } as any, "transparent", "user");

      expect(result.content).toBe("safe summary");
    });

    it("keeps raw content for system callers", () => {
      const result = roomService.projectMessageForView({
        content: "raw connector payload",
        summaryContent: "safe summary",
        metadataJson: {
          roomRedaction: {
            applied: true,
            reason: "sensitive_payload",
          },
        },
      } as any, "transparent", "system");

      expect(result.content).toBe("raw connector payload");
    });
  });
});
