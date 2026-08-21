import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before imports
vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));
vi.mock("../redis", () => ({
  getRedisClient: vi.fn(),
}));
vi.mock("../telegramService", () => ({
  enqueueTelegramNotification: vi.fn(),
}));

import { getDb } from "../../db";
import { getRedisClient } from "../redis";
import { enqueueTelegramNotification } from "../telegramService";
import {
  mapToCategory,
  createNotification,
} from "../notificationService";

// ---------- helpers ----------
function mockRedis(overrides: Record<string, unknown> = {}) {
  const redis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
    ...overrides,
  };
  (getRedisClient as any).mockReturnValue(redis);
  return redis;
}

function mockDb(preferenceRow: Record<string, unknown> | null = null) {
  const whereResult = {
    limit: vi.fn().mockResolvedValue(preferenceRow ? [preferenceRow] : []),
  };
  const fromResult = { where: vi.fn().mockReturnValue(whereResult) };
  const selectResult = { from: vi.fn().mockReturnValue(fromResult) };

  const returningResult = vi.fn().mockResolvedValue([{ id: 1, occurrenceCount: 1 }]);
  const onConflictResult = { returning: returningResult };
  const valuesResult = {
    returning: returningResult,
    onConflictDoUpdate: vi.fn().mockReturnValue(onConflictResult),
  };
  const insertResult = { values: vi.fn().mockReturnValue(valuesResult) };

  const db = {
    select: vi.fn().mockReturnValue(selectResult),
    insert: vi.fn().mockReturnValue(insertResult),
  };

  (getDb as any).mockReturnValue(db);
  return db;
}

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    db: getDb(),
    userId: 42,
    type: "alert" as const,
    title: "Test",
    content: "Body",
    priority: "normal" as const,
    ...overrides,
  };
}

// ---------- mapToCategory ----------
describe("mapToCategory", () => {
  it("maps relatedResourceType 'media_job' to category 'media_jobs'", () => {
    expect(mapToCategory("media_job")).toBe("media_jobs");
  });
  it("maps relatedResourceType 'system_health' to category 'system_health'", () => {
    expect(mapToCategory("system_health")).toBe("system_health");
  });
  it("maps relatedResourceType 'credits' to category 'credits'", () => {
    expect(mapToCategory("credits")).toBe("credits");
  });
  it("maps relatedResourceType 'workflow' to category 'workflow'", () => {
    expect(mapToCategory("workflow")).toBe("workflow");
  });
  it("maps relatedResourceType 'skill' to category 'skill'", () => {
    expect(mapToCategory("skill")).toBe("skill");
  });
  it("maps relatedResourceType 'feedback' to category 'feedback'", () => {
    expect(mapToCategory("feedback")).toBe("feedback");
  });
  it("maps relatedResourceType 'agency' to category 'agency'", () => {
    expect(mapToCategory("agency")).toBe("agency");
  });
  it("maps relatedResourceType 'security' to category 'security'", () => {
    expect(mapToCategory("security")).toBe("security");
  });
  it("maps type 'follow_request' to category 'follow'", () => {
    expect(mapToCategory(undefined, "follow_request")).toBe("follow");
  });
  it("maps type 'scheduled_message' to category 'scheduled'", () => {
    expect(mapToCategory(undefined, "scheduled_message")).toBe("scheduled");
  });
  it("returns 'business' as fallback for unknown combinations", () => {
    expect(mapToCategory(undefined, "alert")).toBe("business");
    expect(mapToCategory("unknown_type" as any)).toBe("business");
  });
  it("prioritizes relatedResourceType over type when both are present", () => {
    expect(mapToCategory("security", "follow_request")).toBe("security");
  });
});

// ---------- preference-aware delivery ----------
describe("preference-aware delivery in createNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when NOTIFICATION_PREFERENCES_ENABLED is false (default)", () => {
    it("bypasses preference checks entirely and delivers normally", async () => {
      const db = mockDb();
      const redis = mockRedis();

      const result = await createNotification(baseParams({ db }));

      expect(result).not.toBeNull();
      expect(result!.notificationId).toBe(1);
      // Should NOT have attempted preference lookup (no Redis get for prefs)
      expect(redis.get).not.toHaveBeenCalled();
    });
  });

  describe("when NOTIFICATION_PREFERENCES_ENABLED is true", () => {
    beforeEach(() => {
      // Enable the preference flag via env var
      process.env.NOTIFICATION_PREFERENCES_ENABLED = "true";
    });
    afterEach(() => {
      delete process.env.NOTIFICATION_PREFERENCES_ENABLED;
    });

    it("delivers normally when user has preference with inApp=true", async () => {
      const db = mockDb();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: null, mutedUntil: null })
        ),
      });

      const result = await createNotification(baseParams({ db }));
      expect(result).not.toBeNull();
      expect(result!.notificationId).toBe(1);
    });

    it("skips DB insert and returns null when user has preference with inApp=false", async () => {
      const db = mockDb();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: false, email: false, telegram: false, minSeverity: null, mutedUntil: null })
        ),
      });

      const result = await createNotification(baseParams({ db }));
      expect(result).toBeNull();
      // Should NOT have called insert
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("skips delivery entirely when mutedUntil is in the future", async () => {
      const db = mockDb();
      const futureDate = new Date(Date.now() + 3600_000).toISOString();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: null, mutedUntil: futureDate })
        ),
      });

      const result = await createNotification(baseParams({ db }));
      expect(result).toBeNull();
    });

    it("delivers normally when mutedUntil is in the past", async () => {
      const db = mockDb();
      const pastDate = new Date(Date.now() - 3600_000).toISOString();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: null, mutedUntil: pastDate })
        ),
      });

      const result = await createNotification(baseParams({ db }));
      expect(result).not.toBeNull();
    });

    it("skips delivery when minSeverity='high' and notification priority is 'normal'", async () => {
      const db = mockDb();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: "high", mutedUntil: null })
        ),
      });

      const result = await createNotification(baseParams({ db, priority: "normal" }));
      expect(result).toBeNull();
    });

    it("delivers when minSeverity='high' and notification priority is 'critical'", async () => {
      const db = mockDb();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: "high", mutedUntil: null })
        ),
      });

      const result = await createNotification(baseParams({ db, priority: "critical" }));
      expect(result).not.toBeNull();
    });

    it("delivers when minSeverity='high' and notification priority is 'high'", async () => {
      const db = mockDb();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: "high", mutedUntil: null })
        ),
      });

      const result = await createNotification(baseParams({ db, priority: "high" }));
      expect(result).not.toBeNull();
    });

    it("uses the Credits setting as the persisted priority", async () => {
      const db = mockDb();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: "normal", mutedUntil: null })
        ),
      });

      const result = await createNotification(
        baseParams({ db, relatedResourceType: "credits", priority: "high" })
      );

      expect(result).not.toBeNull();
      const insertResult = (db.insert as any).mock.results[0].value;
      expect(insertResult.values.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          priority: "normal",
          relatedResourceType: "credits",
        })
      );
      expect(redis.get).toHaveBeenCalledWith("notification:prefs:42:credits");
    });

    it("defaults Credits notifications to High when the preference is unset", async () => {
      const db = mockDb();
      mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: null, mutedUntil: null })
        ),
      });

      await createNotification(
        baseParams({ db, relatedResourceType: "credits", priority: "high" })
      );

      const insertResult = (db.insert as any).mock.results[0].value;
      expect(insertResult.values.mock.calls[0][0]).toEqual(
        expect.objectContaining({ priority: "high" })
      );
    });

    it("uses defaults (inApp=true) when no preference row exists for category", async () => {
      const db = mockDb();
      const redis = mockRedis(); // get returns null (cache miss), db returns empty

      const result = await createNotification(baseParams({ db }));
      expect(result).not.toBeNull();
    });

    it("enqueues Telegram delivery when preference has telegram=true", async () => {
      const db = mockDb();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: true, minSeverity: null, mutedUntil: null })
        ),
      });

      await createNotification(baseParams({ db }));
      expect(enqueueTelegramNotification).toHaveBeenCalled();
    });

    it("skips Telegram when preference has telegram=false", async () => {
      const db = mockDb();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: null, mutedUntil: null })
        ),
      });

      await createNotification(baseParams({ db }));
      expect(enqueueTelegramNotification).not.toHaveBeenCalled();
    });
  });

  describe("escalation bypass", () => {
    beforeEach(() => {
      process.env.NOTIFICATION_PREFERENCES_ENABLED = "true";
    });
    afterEach(() => {
      delete process.env.NOTIFICATION_PREFERENCES_ENABLED;
    });

    it("bypasses preference checks when metadata.isEscalated is true", async () => {
      const db = mockDb();
      const redis = mockRedis({
        // Even if preference says muted, should still deliver
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: false, email: false, telegram: false, minSeverity: null, mutedUntil: new Date(Date.now() + 3600_000).toISOString() })
        ),
      });

      const result = await createNotification(
        baseParams({ db, metadata: { isEscalated: true } })
      );
      expect(result).not.toBeNull();
      expect(result!.notificationId).toBe(1);
    });

    it("delivers on ALL channels when escalated regardless of user preferences", async () => {
      const db = mockDb();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: false, email: false, telegram: false, minSeverity: null, mutedUntil: null })
        ),
      });

      const result = await createNotification(
        baseParams({ db, metadata: { isEscalated: true } })
      );
      expect(result).not.toBeNull();
      expect(result!.channels).toEqual({ inApp: true, email: true, telegram: true });
      expect(enqueueTelegramNotification).toHaveBeenCalled();
    });

    it("delivers even when category is muted if isEscalated is true", async () => {
      const db = mockDb();
      const futureDate = new Date(Date.now() + 3600_000).toISOString();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: null, mutedUntil: futureDate })
        ),
      });

      const result = await createNotification(
        baseParams({ db, metadata: { isEscalated: true } })
      );
      expect(result).not.toBeNull();
    });

    it("delivers even when minSeverity would filter if isEscalated is true", async () => {
      const db = mockDb();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: "critical", mutedUntil: null })
        ),
      });

      const result = await createNotification(
        baseParams({ db, priority: "low", metadata: { isEscalated: true } })
      );
      expect(result).not.toBeNull();
    });
  });

  describe("preference cache", () => {
    beforeEach(() => {
      process.env.NOTIFICATION_PREFERENCES_ENABLED = "true";
    });
    afterEach(() => {
      delete process.env.NOTIFICATION_PREFERENCES_ENABLED;
    });

    it("reads preference from Redis cache when available (within 60s TTL)", async () => {
      const db = mockDb();
      const redis = mockRedis({
        get: vi.fn().mockResolvedValue(
          JSON.stringify({ inApp: true, email: false, telegram: false, minSeverity: null, mutedUntil: null })
        ),
      });

      await createNotification(baseParams({ db }));
      expect(redis.get).toHaveBeenCalledWith("notification:prefs:42:business");
      // Should NOT have queried DB for preferences
      expect(db.select).not.toHaveBeenCalled();
    });

    it("falls back to DB query when Redis cache misses", async () => {
      const db = mockDb();
      const redis = mockRedis(); // get returns null

      await createNotification(baseParams({ db }));
      expect(redis.get).toHaveBeenCalledWith("notification:prefs:42:business");
      expect(db.select).toHaveBeenCalled();
    });

    it("stores queried preference in Redis with 60s TTL after DB read", async () => {
      const prefRow = {
        inApp: true,
        email: true,
        telegram: false,
        minSeverity: null,
        mutedUntil: null,
        emailDigestFrequency: null,
      };
      const db = mockDb(prefRow);
      const redis = mockRedis();

      await createNotification(baseParams({ db }));
      expect(redis.set).toHaveBeenCalledWith(
        "notification:prefs:42:business",
        expect.any(String),
        "EX",
        60
      );
    });

    it("cache key follows pattern 'notification:prefs:{userId}:{category}'", async () => {
      const db = mockDb();
      const redis = mockRedis();

      await createNotification(
        baseParams({ db, relatedResourceType: "security" })
      );
      expect(redis.get).toHaveBeenCalledWith("notification:prefs:42:security");
    });
  });
});
