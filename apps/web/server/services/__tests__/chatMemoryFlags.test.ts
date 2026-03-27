import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../../db";
import { clearChatMemoryFlagCache } from "../chatMemoryFlags";

const mockGetDb = vi.mocked(getDb);

function makeDb(rows: Array<{ key: string; value: string | null }>) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from, where });

  return {
    select,
    from,
    where,
  } as any;
}

describe("chatMemoryFlags", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T00:00:00Z"));
    vi.clearAllMocks();
    mockGetDb.mockReset();
    clearChatMemoryFlagCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns defaults when no DB rows exist", async () => {
    mockGetDb.mockResolvedValue(makeDb([]));

    const { getChatMemoryFlag, clearChatMemoryFlagCache } = await import("../chatMemoryFlags");
    clearChatMemoryFlagCache();

    await expect(getChatMemoryFlag("chat_archive_enabled", "tenant-a")).resolves.toBe(true);
    await expect(getChatMemoryFlag("chat_fact_extraction_enabled", "tenant-a")).resolves.toBe(false);
  });

  it("reads a global row from system_settings", async () => {
    mockGetDb.mockResolvedValue(
      makeDb([{ key: "chat_archive_enabled", value: "false" }]),
    );

    const { getChatMemoryFlag, clearChatMemoryFlagCache } = await import("../chatMemoryFlags");
    clearChatMemoryFlagCache();

    await expect(getChatMemoryFlag("chat_archive_enabled", "tenant-a")).resolves.toBe(false);
  });

  it("prefers tenant-specific row over global", async () => {
    mockGetDb.mockResolvedValue(
      makeDb([
        { key: "tenant_tenant-a_chat_archive_enabled", value: "false" },
        { key: "chat_archive_enabled", value: "true" },
      ]),
    );

    const { getChatMemoryFlag, clearChatMemoryFlagCache } = await import("../chatMemoryFlags");
    clearChatMemoryFlagCache();

    await expect(getChatMemoryFlag("chat_archive_enabled", "tenant-a")).resolves.toBe(false);
  });

  it("returns defaults when DB is unavailable", async () => {
    mockGetDb.mockResolvedValue(null);

    const { getChatMemoryFlag, clearChatMemoryFlagCache } = await import("../chatMemoryFlags");
    clearChatMemoryFlagCache();

    await expect(getChatMemoryFlag("chat_vector_memory_enabled", "tenant-a")).resolves.toBe(false);
  });

  it("returns all flags in a single DB call", async () => {
    const db = makeDb([
      { key: "tenant_tenant-a_chat_archive_enabled", value: "false" },
      { key: "chat_fact_extraction_enabled", value: "true" },
    ]);
    mockGetDb.mockResolvedValue(db);

    const { getAllChatMemoryFlags, clearChatMemoryFlagCache } = await import("../chatMemoryFlags");
    clearChatMemoryFlagCache();
    const flags = await getAllChatMemoryFlags("tenant-a");

    expect(flags).toMatchObject({
      chat_archive_enabled: false,
      chat_fact_extraction_enabled: true,
      chat_chunk_index_enabled: false,
      chat_vector_memory_enabled: false,
      chat_smart_summarize_enabled: false,
    });

    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("returns cached value within TTL", async () => {
    const firstDb = makeDb([{ key: "chat_archive_enabled", value: "true" }]);
    mockGetDb.mockResolvedValue(firstDb);

    const { getChatMemoryFlag, clearChatMemoryFlagCache } = await import("../chatMemoryFlags");
    clearChatMemoryFlagCache();
    await expect(getChatMemoryFlag("chat_archive_enabled", "tenant-a")).resolves.toBe(true);
    await expect(getChatMemoryFlag("chat_archive_enabled", "tenant-a")).resolves.toBe(true);
    expect(firstDb.select).toHaveBeenCalledTimes(1);
  });

  it("clearChatMemoryFlagCache forces a re-read", async () => {
    const firstDb = makeDb([{ key: "chat_chunk_index_enabled", value: "false" }]);
    const secondDb = makeDb([{ key: "chat_chunk_index_enabled", value: "true" }]);
    mockGetDb
      .mockResolvedValueOnce(firstDb)
      .mockResolvedValueOnce(firstDb)
      .mockResolvedValueOnce(secondDb)
      .mockResolvedValueOnce(secondDb);

    const { getChatMemoryFlag, clearChatMemoryFlagCache } = await import("../chatMemoryFlags");
    clearChatMemoryFlagCache();
    await expect(getChatMemoryFlag("chat_chunk_index_enabled", "tenant-a")).resolves.toBe(false);
    clearChatMemoryFlagCache();
    await expect(getChatMemoryFlag("chat_chunk_index_enabled", "tenant-a")).resolves.toBe(true);
    expect(firstDb.select).toHaveBeenCalledTimes(1);
    expect(secondDb.select).toHaveBeenCalledTimes(1);
  });

  it("keeps tenant caches isolated", async () => {
    const db = makeDb([
      { key: "tenant_tenant-a_chat_vector_memory_enabled", value: "true" },
      { key: "tenant_tenant-b_chat_vector_memory_enabled", value: "false" },
    ]);
    mockGetDb.mockResolvedValue(db);

    const { getChatMemoryFlag, clearChatMemoryFlagCache } = await import("../chatMemoryFlags");
    clearChatMemoryFlagCache();

    await expect(getChatMemoryFlag("chat_vector_memory_enabled", "tenant-a")).resolves.toBe(true);
    await expect(getChatMemoryFlag("chat_vector_memory_enabled", "tenant-b")).resolves.toBe(false);
  });
});
