import { TRPCError } from "@trpc/server";
import { desc } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conversations, messages } from "../../../drizzle/schema";

const dbMocks = vi.hoisted(() => {
  let selectedRows: Array<Record<string, unknown>> = [];
  let insertedRowValues: Record<string, unknown> | null = null;

  const insertReturning = vi.fn(async () => [
    {
      id: 77,
      ...(insertedRowValues ?? {}),
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    },
  ]);
  const insertValues = vi.fn((values: Record<string, unknown>) => {
    insertedRowValues = values;
    return { returning: insertReturning };
  });
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const selectLimit = vi.fn(async () => selectedRows);
  const selectQuery: any = { limit: selectLimit };
  let lastOrderByArguments: unknown[] = [];
  selectQuery.orderBy = vi.fn((...args: unknown[]) => {
    lastOrderByArguments = args;
    return selectQuery;
  });
  const selectFrom = vi.fn(() => ({ where: vi.fn(() => selectQuery) }));
  const select = vi.fn(() => ({ from: selectFrom }));

  return {
    mockDb: {
      insert,
      update,
      select,
    },
    setSelectedRows(rows: Array<Record<string, unknown>>) {
      selectedRows = rows;
    },
    getInsertedRowValues() {
      return insertedRowValues;
    },
    getLastOrderByArguments() {
      return lastOrderByArguments;
    },
    resetLastOrderByArguments() {
      lastOrderByArguments = [];
    },
    resetInsertedRowValues() {
      insertedRowValues = null;
    },
  };
});

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../enabledLlmModels", () => ({
  resolveEnabledLlmModelId: vi.fn(async (models: Array<string | null | undefined>) =>
    models.find((model) => Boolean(model)) ?? null,
  ),
}));

import { getDb } from "../../db";

import {
  createConversation,
  createPersonalConversation,
  getConversations,
  getMessages,
  getPersonalConversation,
  updateConversation,
} from "../chatService";

const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(dbMocks.mockDb as any);
  dbMocks.resetInsertedRowValues();
  dbMocks.resetLastOrderByArguments();
  dbMocks.setSelectedRows([]);
});

describe("chatService personal lock", () => {
  it("rejects reserved personal project creation through the generic createConversation path", async () => {
    await expect(
      createConversation({
        userId: 7,
        title: "Should fail",
        projectId: "personal",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: "BAD_REQUEST",
      message: "Use the personal chat creation flow to create a personal conversation",
    });

    expect(dbMocks.mockDb.insert).not.toHaveBeenCalled();
  });

  it("creates a locked personal conversation with the reserved project id", async () => {
    const result = await createPersonalConversation({
      userId: 7,
      title: "Personal Chat",
      tenantId: "tenant-1",
    });

    expect(result.id).toBe(77);
    expect(dbMocks.mockDb.insert).toHaveBeenCalledTimes(1);
    expect(dbMocks.getInsertedRowValues()).toMatchObject({
      userId: 7,
      title: "Personal Chat",
      projectId: "personal",
      tenantId: "tenant-1",
    });
  });

  it("rejects retargeting a personal conversation to a work project", async () => {
    dbMocks.setSelectedRows([
      {
        id: 42,
        projectId: "personal",
      },
    ]);

    await expect(
      updateConversation(42, 7, {
        projectId: "work-1",
      } as any),
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: "FORBIDDEN",
      message: "Personal chat projectId is locked",
    });

    expect(dbMocks.mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects converting a work conversation into personal", async () => {
    dbMocks.setSelectedRows([
      {
        id: 43,
        projectId: "work-1",
      },
    ]);

    await expect(
      updateConversation(43, 7, {
        projectId: "personal",
      } as any),
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: "FORBIDDEN",
      message: "Use the personal chat creation flow to create a personal conversation",
    });

    expect(dbMocks.mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects retargeting an existing work conversation to preserve history provenance", async () => {
    dbMocks.setSelectedRows([
      {
        id: 44,
        projectId: "project-a",
      },
    ]);

    await expect(
      updateConversation(44, 7, {
        projectId: "project-b",
      } as any),
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: "FORBIDDEN",
      message: "Conversation project binding is immutable; create a new conversation to change projects",
    });

    expect(dbMocks.mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects assigning an unscoped existing conversation to a project", async () => {
    dbMocks.setSelectedRows([
      {
        id: 45,
        projectId: null,
      },
    ]);

    await expect(
      updateConversation(45, 7, {
        projectId: "project-b",
      } as any),
    ).rejects.toMatchObject<Partial<TRPCError>>({
      code: "FORBIDDEN",
      message: "Conversation project binding is immutable; create a new conversation to change projects",
    });

    expect(dbMocks.mockDb.update).not.toHaveBeenCalled();
  });

  it("resolves the active personal conversation directly for the tenant", async () => {
    dbMocks.setSelectedRows([
      {
        id: 88,
        title: "Personal Finance",
        projectId: "personal",
        tenantId: "tenant-1",
        userId: 7,
      },
    ]);

    const result = await getPersonalConversation({
      userId: 7,
      tenantId: "tenant-1",
    });

    expect(result).toMatchObject({
      id: 88,
      projectId: "personal",
      tenantId: "tenant-1",
    });
  });

  it("opens long chat sessions at the latest messages and pages backwards", async () => {
    const olderMessage = {
      id: 10,
      conversationId: 42,
      role: "user",
      content: "earlier",
      createdAt: new Date("2026-10-27T10:00:00.000Z"),
    };
    const recentMessage = {
      id: 11,
      conversationId: 42,
      role: "assistant",
      content: "latest",
      createdAt: new Date("2026-10-28T10:00:00.000Z"),
    };
    dbMocks.setSelectedRows([recentMessage, olderMessage]);

    const latestPage = await getMessages(42, { limit: 2 });

    expect(latestPage.map(message => message.id)).toEqual([10, 11]);
    expect(dbMocks.getLastOrderByArguments()).toHaveLength(2);

    dbMocks.setSelectedRows([olderMessage]);
    const previousPage = await getMessages(42, { limit: 100, beforeId: 11 });

    expect(previousPage.map(message => message.id)).toEqual([10]);
    expect(dbMocks.getLastOrderByArguments()).toHaveLength(2);
  });

  it("orders chat sessions by recent activity before pin state", async () => {
    await getConversations({ userId: 7, limit: 50 });

    expect(dbMocks.getLastOrderByArguments()).toEqual([
      desc(conversations.updatedAt),
      desc(conversations.isPinned),
      desc(conversations.id),
    ]);

    dbMocks.resetLastOrderByArguments();
    await getMessages(42, { limit: 20 });

    expect(dbMocks.getLastOrderByArguments()).toEqual([
      desc(messages.createdAt),
      desc(messages.id),
    ]);
  });
});
