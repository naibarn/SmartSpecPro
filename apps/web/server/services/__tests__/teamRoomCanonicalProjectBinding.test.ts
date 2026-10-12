import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));
vi.mock("../../db", () => ({ getDb: mockGetDb }));

import { teamRooms } from "../../../drizzle/schema";
import { createRoom } from "../roomService";

const input = {
  teamId: "team-1",
  tenantId: "tenant-1",
  orchestratorUserId: 42,
  roomType: "team" as const,
  goalPrompt: "Review this project",
  canonicalProjectId: "7a7d3b4e-2971-41c0-b982-670e1cc6c020",
};

function selectQuery(rows: unknown[]) {
  const query: any = {};
  query.from = vi.fn(() => query);
  query.innerJoin = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(async () => rows);
  return query;
}

function createRoomDatabase(projectRows: unknown[]) {
  const roomInsertValues = vi.fn();
  const db: any = {
    select: vi.fn()
      .mockImplementationOnce(() => selectQuery([{ id: input.teamId, status: "active" }]))
      .mockImplementationOnce(() => selectQuery(projectRows))
      .mockImplementationOnce(() => {
        const query: any = {};
        query.from = vi.fn(() => query);
        query.where = vi.fn(async () => []);
        return query;
      }),
    transaction: vi.fn(async (callback: (tx: any) => Promise<void>) => {
      const tx = {
        insert: vi.fn((table: unknown) => ({
          values: vi.fn((values: unknown) => {
            if (table === teamRooms) {
              roomInsertValues(values);
              return { returning: vi.fn(async () => [{ ...values as object, id: "room-1" }]) };
            }
            return Promise.resolve([]);
          }),
        })),
      };
      await callback(tx);
    }),
  };
  mockGetDb.mockResolvedValue(db);
  return { db, roomInsertValues };
}

describe("team room canonical Project binding", () => {
  beforeEach(() => mockGetDb.mockReset());

  it("persists a canonical Project only after tenant membership is verified", async () => {
    const { roomInsertValues } = createRoomDatabase([{ projectId: input.canonicalProjectId }]);

    await createRoom(input);

    expect(roomInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: input.tenantId,
        canonicalProjectId: input.canonicalProjectId,
        projectId: null,
      }),
    );
  });

  it("rejects missing or foreign canonical Project membership before creating the room", async () => {
    const { db, roomInsertValues } = createRoomDatabase([]);

    await expect(createRoom(input)).rejects.toThrow(
      "Canonical project not found or inaccessible",
    );

    expect(db.transaction).not.toHaveBeenCalled();
    expect(roomInsertValues).not.toHaveBeenCalled();
  });

  it("does not combine an unverified legacy Project ID with a canonical identity", async () => {
    createRoomDatabase([{ projectId: input.canonicalProjectId }]);

    await expect(createRoom({ ...input, projectId: 17 })).rejects.toThrow(
      "Canonical and legacy project bindings cannot be combined",
    );
  });
});
