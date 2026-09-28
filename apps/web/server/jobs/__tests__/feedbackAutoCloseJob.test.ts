import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.fn();

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

import {
  closeStaleFeedbackTickets,
  FEEDBACK_AUTO_CLOSE_AFTER_MS,
} from "../feedbackAutoCloseJob";

describe("feedback auto-close job", () => {
  beforeEach(() => vi.clearAllMocks());

  it("closes stale tickets and returns the affected count", async () => {
    const execute = vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }]);
    mockGetDb.mockResolvedValue({ execute });
    const now = new Date("2026-08-27T00:00:00.000Z");

    await expect(closeStaleFeedbackTickets(now)).resolves.toBe(2);
    expect(execute).toHaveBeenCalledTimes(1);
    const query = execute.mock.calls[0]?.[0];
    const chunks = query.queryChunks as Array<unknown>;
    const textChunks = chunks
      .flatMap(chunk => (chunk as { value?: string[] }).value ?? [])
      .join("");
    expect(textChunks).toContain("status <>");
    expect(chunks).toContainEqual(
      new Date(now.getTime() - FEEDBACK_AUTO_CLOSE_AFTER_MS).toISOString()
    );
  });

  it("does not claim work when the database is unavailable", async () => {
    mockGetDb.mockResolvedValue(null);
    await expect(closeStaleFeedbackTickets()).resolves.toBe(0);
  });
});
