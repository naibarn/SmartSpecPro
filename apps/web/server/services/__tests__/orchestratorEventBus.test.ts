import { describe, it, expect, vi } from "vitest";

const { mockRecordEvent } = vi.hoisted(() => ({ mockRecordEvent: vi.fn().mockResolvedValue({}) }));

vi.mock("../monitoringService", () => ({ recordEvent: mockRecordEvent }));

import {
  validateEvent,
  createEvent,
  publishEvent,
  type RunEvent,
} from "../orchestratorEventBus";

describe("orchestratorEventBus", () => {
  describe("validateEvent", () => {
    it("returns true for valid event", () => {
      const event: RunEvent = {
        eventId: "e1",
        eventType: "run_started",
        tenantId: "t1",
        teamId: "team1",
        roomId: "room1",
        runId: "run1",
        ts: new Date().toISOString(),
        actorType: "system",
        actorId: "system",
        visibility: "transparent",
        data: {},
      };
      expect(validateEvent(event)).toBe(true);
    });

    it("returns false for event missing eventId", () => {
      expect(validateEvent({ eventType: "test", runId: "r", teamId: "t", ts: "ts" })).toBe(false);
    });

    it("returns false for event missing eventType", () => {
      expect(validateEvent({ eventId: "e", runId: "r", teamId: "t", ts: "ts" })).toBe(false);
    });
  });

  describe("createEvent", () => {
    it("creates event with all required fields", () => {
      const event = createEvent("run_started", {
        tenantId: "t1",
        teamId: "team1",
        roomId: "room1",
        runId: "run1",
        actorType: "system",
        actorId: "system",
      });

      expect(event.eventType).toBe("run_started");
      expect(event.eventId).toBeTruthy();
      expect(event.ts).toBeTruthy();
      expect(event.visibility).toBe("transparent");
    });
  });

  describe("publishEvent", () => {
    it("persists an event for PostgreSQL-backed SSE delivery", async () => {
      const event = createEvent("test", {
        tenantId: "t1",
        teamId: "team1",
        roomId: "room1",
        runId: "run1",
        actorType: "system",
        actorId: "system",
      });

      await publishEvent(event);

      expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
        eventId: event.eventId,
        tenantId: "t1",
        runId: "run1",
        eventCategory: "communication",
        detailJson: { realtimeEvent: event },
      }));
    });

    it("persists user scope inside the event payload", async () => {
      const event = createEvent("test", {
        tenantId: "t1",
        teamId: "team1",
        roomId: "room1",
        runId: "run1",
        actorType: "user",
        actorId: "42",
        userId: 42,
      });

      await publishEvent(event);

      expect(mockRecordEvent).toHaveBeenCalledWith(expect.objectContaining({
        detailJson: { realtimeEvent: event },
      }));
    });

    it("throws on invalid event", async () => {
      await expect(publishEvent({} as RunEvent)).rejects.toThrow("Invalid event");
    });
  });
});
