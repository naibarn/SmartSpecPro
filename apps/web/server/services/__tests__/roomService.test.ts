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
});
