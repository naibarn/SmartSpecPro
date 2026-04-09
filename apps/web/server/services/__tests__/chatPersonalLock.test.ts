import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  const selectFrom = vi.fn(() => ({ where: vi.fn(() => ({ limit: selectLimit })) }));
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
  updateConversation,
} from "../chatService";

const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockResolvedValue(dbMocks.mockDb as any);
  dbMocks.resetInsertedRowValues();
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
});
