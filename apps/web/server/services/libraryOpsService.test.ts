import { describe, expect, it } from "vitest";

import {
  reprocessCallbackDlqEntry,
  type LibraryOpsRepository,
} from "./libraryOpsService";

function createInMemoryRepo(): LibraryOpsRepository {
  const dlq = new Map<number, {
    id: number;
    eventId: number | null;
    status: "pending" | "reprocessed" | "discarded";
    resolvedAt: Date | null;
  }>();
  const eventStatus = new Map<number, { status: string; nextRetryAt: Date | null }>();

  dlq.set(1, { id: 1, eventId: 100, status: "pending", resolvedAt: null });
  dlq.set(2, { id: 2, eventId: null, status: "pending", resolvedAt: null });
  eventStatus.set(100, { status: "failed", nextRetryAt: null });

  return {
    getDlqEntryById: async (id) => dlq.get(id) ?? null,
    markDlqEntryReprocessed: async (id, resolvedAt) => {
      const entry = dlq.get(id);
      if (!entry) return;
      entry.status = "reprocessed";
      entry.resolvedAt = resolvedAt;
    },
    moveEventToRetryPending: async (eventId, retryAt) => {
      const event = eventStatus.get(eventId);
      if (!event) return;
      event.status = "retry_pending";
      event.nextRetryAt = retryAt;
    },
  };
}

describe("reprocessCallbackDlqEntry", () => {
  it("moves pending DLQ entry back into retry pipeline", async () => {
    const repo = createInMemoryRepo();

    const result = await reprocessCallbackDlqEntry(repo, 1);

    expect(result.success).toBe(true);
    expect(result.status).toBe("reprocessed");
    expect(result.eventMovedToRetry).toBe(true);
  });

  it("returns not_found when entry does not exist", async () => {
    const repo = createInMemoryRepo();

    const result = await reprocessCallbackDlqEntry(repo, 999);

    expect(result.success).toBe(false);
    expect(result.status).toBe("not_found");
  });
});

