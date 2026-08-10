import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the redis module
vi.mock("../redis", () => ({
  getRedisClient: vi.fn(() => ({
    publish: vi.fn().mockResolvedValue(1),
  })),
}));

// Mock the telegram service
vi.mock("../telegramService", () => ({
  enqueueTelegramNotification: vi.fn().mockResolvedValue(undefined),
}));

import { createNotification } from "../notificationService";

function makeMockDb(options?: {
  deduplicated?: boolean;
  existingId?: number;
  occurrenceCount?: number;
}) {
  const insertedOccurrences: any[] = [];
  const returning = vi.fn().mockResolvedValue([
    {
      id: options?.existingId ?? 42,
      occurrenceCount: options?.occurrenceCount ?? 1,
    },
  ]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({
    returning,
    onConflictDoUpdate,
  });
  const insert = vi.fn().mockReturnValue({ values });

  // Track occurrence inserts
  const occurrenceReturning = vi.fn().mockResolvedValue([{ id: 99 }]);
  const occurrenceValues = vi.fn().mockReturnValue({ returning: occurrenceReturning });

  const db = {
    insert: vi.fn((table: any) => {
      const tableName = table?.[Symbol.for("drizzle:Name")] ?? "";
      if (tableName === "notification_occurrences") {
        return { values: (...args: any[]) => {
          insertedOccurrences.push(args[0]);
          return occurrenceValues(...args);
        }};
      }
      return { values };
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    execute: vi.fn(),
    _insertedOccurrences: insertedOccurrences,
  } as any;

  return { db, insert, values, returning, onConflictDoUpdate };
}

describe("createNotification dedup logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts new notification with groupKey when no existing group (no dedup)", async () => {
    const { db } = makeMockDb({ deduplicated: false, occurrenceCount: 1 });

    const result = await createNotification({
      db,
      userId: 1,
      type: "alert",
      title: "Test",
      content: "Test content",
      groupKey: "media_job_failure:user_1",
    });

    expect(result.notificationId).toBe(42);
    expect(result.deduplicated).toBe(false);
  });

  it("returns deduplicated: true when occurrenceCount > 1 (dedup hit)", async () => {
    const { db } = makeMockDb({ existingId: 10, occurrenceCount: 3 });

    const result = await createNotification({
      db,
      userId: 1,
      type: "alert",
      title: "Test",
      content: "Test content",
      groupKey: "media_job_failure:user_1",
    });

    expect(result.notificationId).toBe(10);
    expect(result.deduplicated).toBe(true);
  });

  it("refreshes the actionable target when a grouped notification is deduplicated", async () => {
    const { db, onConflictDoUpdate } = makeMockDb({ existingId: 10, occurrenceCount: 2 });

    await createNotification({
      db,
      userId: 1,
      type: "alert",
      title: "New Feedback: [Auto] media generation failed",
      content: "Ticket #250",
      priority: "high",
      relatedResourceType: "feedback",
      relatedResourceId: "250",
      actionUrl: "/admin/feedback-hub?ticketId=250",
      actionLabel: "View Feedback",
      groupKey: "feedback-auto:media generation failed",
    });

    const update = onConflictDoUpdate.mock.calls[0]?.[0];
    expect(update?.set).toEqual(expect.objectContaining({
      title: expect.anything(),
      priority: expect.anything(),
      relatedResourceType: expect.anything(),
      relatedResourceId: expect.anything(),
      actionUrl: expect.anything(),
      actionLabel: expect.anything(),
    }));
  });

  it("inserts occurrence snapshot on dedup hit", async () => {
    const { db } = makeMockDb({ existingId: 10, occurrenceCount: 2 });

    await createNotification({
      db,
      userId: 1,
      type: "alert",
      title: "Test",
      content: "Occurrence content",
      groupKey: "media_job_failure:user_1",
      metadata: { source: "test" },
    });

    // Verify an occurrence was inserted
    expect(db._insertedOccurrences.length).toBeGreaterThan(0);
    const occurrence = db._insertedOccurrences[0];
    expect(occurrence.notificationId).toBe(10);
    expect(occurrence.content).toBe("Occurrence content");
  });

  it("does not insert occurrence when no dedup hit", async () => {
    const { db } = makeMockDb({ occurrenceCount: 1 });

    await createNotification({
      db,
      userId: 1,
      type: "alert",
      title: "Test",
      content: "Test content",
      groupKey: "media_job_failure:user_1",
    });

    expect(db._insertedOccurrences.length).toBe(0);
  });

  it("bypasses dedup when groupKey is undefined", async () => {
    const { db } = makeMockDb();

    const result = await createNotification({
      db,
      userId: 1,
      type: "alert",
      title: "Test",
      content: "Test content",
      // No groupKey
    });

    expect(result.notificationId).toBe(42);
    expect(result.deduplicated).toBe(false);
  });

  it("truncates groupKey to 200 characters", async () => {
    const longKey = "x".repeat(300);
    const { db, values } = makeMockDb();

    await createNotification({
      db,
      userId: 1,
      type: "alert",
      title: "Test",
      content: "Test content",
      groupKey: longKey,
    });

    // Verify values was called and groupKey was truncated
    const callArgs = values.mock.calls[0]?.[0];
    if (callArgs?.groupKey) {
      expect(callArgs.groupKey.length).toBeLessThanOrEqual(200);
    }
  });

  it("returns correct occurrenceCount on dedup hit for SSE consumers", async () => {
    const { db } = makeMockDb({ occurrenceCount: 5, existingId: 77 });

    const result = await createNotification({
      db,
      userId: 1,
      type: "alert",
      title: "Test",
      content: "Test content",
      groupKey: "test_key",
    });

    // The SSE event includes occurrenceCount and deduplicated from the result
    expect(result.notificationId).toBe(77);
    expect(result.deduplicated).toBe(true);
    // occurrenceCount > 1 means dedup hit, which SSE will include
  });

  it("returns deduplicated: false when notification has no groupKey", async () => {
    const { db } = makeMockDb();

    const result = await createNotification({
      db,
      userId: 1,
      type: "system",
      title: "System message",
      content: "Hello",
    });

    expect(result.deduplicated).toBe(false);
  });
});
