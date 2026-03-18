import { describe, it, expect } from "vitest";
import {
  parseThreadRef,
  serializeThreadRef,
  isSameThread,
  getThreadKindLabel,
  type ActiveThreadRef,
} from "../lib/threadRef";

describe("ActiveThreadRef", () => {
  describe("parseThreadRef", () => {
    it("parses 'chat:123' into { kind: 'chat', id: 123 }", () => {
      expect(parseThreadRef("chat:123")).toEqual({ kind: "chat", id: 123 });
    });

    it("parses 'team_room:uuid' into { kind: 'team_room', id: 'uuid' }", () => {
      expect(parseThreadRef("team_room:abc-123")).toEqual({ kind: "team_room", id: "abc-123" });
    });

    it("parses 'agency:a1:c2' into agency_conversation", () => {
      expect(parseThreadRef("agency:a1:c2")).toEqual({
        kind: "agency_conversation",
        id: "c2",
        agencyId: "a1",
      });
    });

    it("parses 'inbox:task_123' into external_inbox_task", () => {
      expect(parseThreadRef("inbox:task_123")).toEqual({
        kind: "external_inbox_task",
        id: "task_123",
      });
    });

    it("returns null for invalid format", () => {
      expect(parseThreadRef("")).toBeNull();
      expect(parseThreadRef("unknown:123")).toBeNull();
      expect(parseThreadRef("chat:abc")).toBeNull();
    });
  });

  describe("serializeThreadRef", () => {
    it("serializes chat ref", () => {
      expect(serializeThreadRef({ kind: "chat", id: 42 })).toBe("chat:42");
    });

    it("serializes team_room ref", () => {
      expect(serializeThreadRef({ kind: "team_room", id: "room-1" })).toBe("team_room:room-1");
    });

    it("serializes agency_conversation ref", () => {
      expect(
        serializeThreadRef({ kind: "agency_conversation", id: "c1", agencyId: "a1" }),
      ).toBe("agency:a1:c1");
    });

    it("round-trips correctly", () => {
      const refs: ActiveThreadRef[] = [
        { kind: "chat", id: 1 },
        { kind: "team_room", id: "r1" },
        { kind: "agency_conversation", id: "c1", agencyId: "a1" },
        { kind: "external_inbox_task", id: "t1" },
      ];
      for (const ref of refs) {
        expect(parseThreadRef(serializeThreadRef(ref))).toEqual(ref);
      }
    });
  });

  describe("isSameThread", () => {
    it("returns true for same chat", () => {
      expect(isSameThread({ kind: "chat", id: 1 }, { kind: "chat", id: 1 })).toBe(true);
    });

    it("returns false for different kinds", () => {
      expect(isSameThread({ kind: "chat", id: 1 }, { kind: "team_room", id: "1" })).toBe(false);
    });

    it("returns false for null", () => {
      expect(isSameThread(null, { kind: "chat", id: 1 })).toBe(false);
    });
  });

  describe("getThreadKindLabel", () => {
    it("returns correct labels", () => {
      expect(getThreadKindLabel("chat")).toBe("Chat");
      expect(getThreadKindLabel("team_room")).toBe("Team Room");
      expect(getThreadKindLabel("agency_conversation")).toBe("Agency");
      expect(getThreadKindLabel("external_inbox_task")).toBe("Inbox Task");
    });
  });
});
