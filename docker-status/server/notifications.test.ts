import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Create mock context
function createMockContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("notifications router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    const ctx = createMockContext();
    caller = appRouter.createCaller(ctx);
  });

  describe("list", () => {
    it("returns notifications array", async () => {
      const result = await caller.notifications.list();
      expect(result).toHaveProperty("notifications");
      expect(Array.isArray(result.notifications)).toBe(true);
    });
  });

  describe("unreadCount", () => {
    it("returns count property", async () => {
      const result = await caller.notifications.unreadCount();
      expect(result).toHaveProperty("count");
      expect(typeof result.count).toBe("number");
    });
  });

  describe("markAllRead", () => {
    it("returns success true", async () => {
      const result = await caller.notifications.markAllRead();
      expect(result.success).toBe(true);
    });
  });

  describe("clear", () => {
    it("clears all notifications and returns success", async () => {
      const result = await caller.notifications.clear();
      expect(result.success).toBe(true);

      // Verify notifications are cleared
      const listResult = await caller.notifications.list();
      expect(listResult.notifications.length).toBe(0);
    });
  });

  describe("getSettings", () => {
    it("returns notification settings", async () => {
      const result = await caller.notifications.getSettings();
      expect(result).toHaveProperty("settings");
      expect(result.settings).toHaveProperty("enabled");
      expect(result.settings).toHaveProperty("cpuThreshold");
      expect(result.settings).toHaveProperty("memoryThreshold");
      expect(result.settings).toHaveProperty("notifyOnStart");
      expect(result.settings).toHaveProperty("notifyOnStop");
    });
  });

  describe("updateSettings", () => {
    it("updates CPU threshold", async () => {
      const result = await caller.notifications.updateSettings({
        cpuThreshold: 90,
      });
      expect(result.success).toBe(true);
      expect(result.settings.cpuThreshold).toBe(90);
    });

    it("updates memory threshold", async () => {
      const result = await caller.notifications.updateSettings({
        memoryThreshold: 75,
      });
      expect(result.success).toBe(true);
      expect(result.settings.memoryThreshold).toBe(75);
    });

    it("updates enabled status", async () => {
      const result = await caller.notifications.updateSettings({
        enabled: false,
      });
      expect(result.success).toBe(true);
      expect(result.settings.enabled).toBe(false);

      // Reset for other tests
      await caller.notifications.updateSettings({ enabled: true });
    });

    it("updates multiple settings at once", async () => {
      const result = await caller.notifications.updateSettings({
        cpuThreshold: 85,
        memoryThreshold: 70,
        notifyOnStart: false,
        notifyOnStop: false,
      });
      expect(result.success).toBe(true);
      expect(result.settings.cpuThreshold).toBe(85);
      expect(result.settings.memoryThreshold).toBe(70);
      expect(result.settings.notifyOnStart).toBe(false);
      expect(result.settings.notifyOnStop).toBe(false);
    });
  });
});

describe("docker router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    const ctx = createMockContext();
    caller = appRouter.createCaller(ctx);
  });

  describe("info", () => {
    it("returns docker info structure even when Docker is not available", async () => {
      const result = await caller.docker.info();
      expect(result).toHaveProperty("version");
      expect(result).toHaveProperty("containers");
      expect(result).toHaveProperty("running");
      expect(result).toHaveProperty("paused");
      expect(result).toHaveProperty("stopped");
      expect(result).toHaveProperty("connectionType");
    });
  });

  describe("list", () => {
    it("returns containers array and error field", async () => {
      const result = await caller.docker.list();
      expect(result).toHaveProperty("containers");
      expect(Array.isArray(result.containers)).toBe(true);
      // Error is expected since Docker is not running in test environment
      expect(result).toHaveProperty("error");
    });
  });

  describe("statsHistory", () => {
    it("returns history array for container", async () => {
      const result = await caller.docker.statsHistory({
        containerId: "test-container-id",
      });
      expect(result).toHaveProperty("history");
      expect(Array.isArray(result.history)).toBe(true);
    });
  });

  describe("logs", () => {
    it("handles non-existent container gracefully", async () => {
      const result = await caller.docker.logs({
        containerId: "non-existent-container",
        tail: 50,
      });
      expect(result).toHaveProperty("logs");
    });
  });
});

describe("stats history management", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    const ctx = createMockContext();
    caller = appRouter.createCaller(ctx);
  });

  it("returns empty history for new container", async () => {
    const result = await caller.docker.statsHistory({
      containerId: `new-container-${Date.now()}`,
    });
    expect(result.history).toEqual([]);
  });
});
