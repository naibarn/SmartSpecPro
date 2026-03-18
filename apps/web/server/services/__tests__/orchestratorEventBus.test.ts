import { describe, it, expect, vi } from "vitest";
import {
  runChannel,
  teamChannel,
  userChannel,
  validateEvent,
  createEvent,
  publishEvent,
  type RunEvent,
} from "../orchestratorEventBus";

describe("orchestratorEventBus", () => {
  describe("channel names", () => {
    it("generates correct run channel", () => {
      expect(runChannel("run-123")).toBe("orchestrator:run:run-123");
    });

    it("generates correct team channel", () => {
      expect(teamChannel("team-456")).toBe("orchestrator:team:team-456");
    });

    it("generates correct user channel", () => {
      expect(userChannel(42)).toBe("orchestrator:user:42");
    });
  });

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
    it("publishes to run and team channels", async () => {
      const mockPublisher = {
        publish: vi.fn().mockResolvedValue(1),
      };

      const event = createEvent("test", {
        tenantId: "t1",
        teamId: "team1",
        roomId: "room1",
        runId: "run1",
        actorType: "system",
        actorId: "system",
      });

      await publishEvent(event, mockPublisher);

      expect(mockPublisher.publish).toHaveBeenCalledTimes(2);
      expect(mockPublisher.publish).toHaveBeenCalledWith("orchestrator:run:run1", expect.any(String));
      expect(mockPublisher.publish).toHaveBeenCalledWith("orchestrator:team:team1", expect.any(String));
    });

    it("also publishes to user channel when userId present", async () => {
      const mockPublisher = {
        publish: vi.fn().mockResolvedValue(1),
      };

      const event = createEvent("test", {
        tenantId: "t1",
        teamId: "team1",
        roomId: "room1",
        runId: "run1",
        actorType: "user",
        actorId: "42",
        userId: 42,
      });

      await publishEvent(event, mockPublisher);

      expect(mockPublisher.publish).toHaveBeenCalledTimes(3);
      expect(mockPublisher.publish).toHaveBeenCalledWith("orchestrator:user:42", expect.any(String));
    });

    it("throws on invalid event", async () => {
      const mockPublisher = { publish: vi.fn() };
      await expect(publishEvent({} as RunEvent, mockPublisher)).rejects.toThrow("Invalid event");
    });
  });
});
