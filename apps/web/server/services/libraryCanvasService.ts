import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { libraryChunks } from "../../drizzle/schema";
import type { LibraryActor } from "./libraryService";
import {
  createLibraryItem,
  getLibraryItemById,
  getUserEffectivePermission,
  updateLibraryItem,
} from "./libraryService";
import {
  libraryCanvasBoardSchema,
  type CreateLibraryCanvasInput,
  type GetLibraryCanvasInput,
  type LibraryCanvasBoard,
  type LibraryCanvasResult,
  type UpdateLibraryCanvasInput,
} from "../../shared/libraryCanvas";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const CANVAS_ITEM_TYPE = "canvas_board";

function normalizeTenantId(tenantId: string | number): string {
  const normalized = String(tenantId).trim();
  if (!normalized) {
    throw new Error("Invalid tenant ID");
  }
  return normalized;
}

async function readCanvasBoard(
  itemId: number,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryCanvasBoard> {
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  const rows = await db
    .select({
      content: libraryChunks.content,
    })
    .from(libraryChunks)
    .where(
      and(
        eq(libraryChunks.tenantId, tenantId),
        eq(libraryChunks.libraryItemId, itemId),
        eq(libraryChunks.chunkIndex, 0),
        eq(libraryChunks.contentType, "canvas_json"),
      ),
    )
    .limit(1);

  const content = rows[0]?.content ?? '{"version":"v1","nodes":[],"edges":[]}';
  try {
    return libraryCanvasBoardSchema.parse(JSON.parse(content));
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Canvas board data is corrupted",
    });
  }
}

async function writeCanvasBoard(
  itemId: number,
  actor: LibraryActor,
  board: LibraryCanvasBoard,
  dbClient?: DbClient,
): Promise<void> {
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  const now = new Date();
  await db
    .insert(libraryChunks)
    .values({
      tenantId,
      libraryItemId: itemId,
      chunkIndex: 0,
      content: JSON.stringify(board),
      contentType: "canvas_json",
      tokenCount: null,
      vectorRefId: null,
      vectorIndexName: null,
      metadata: {
        source: "library_canvas",
      },
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [libraryChunks.libraryItemId, libraryChunks.chunkIndex],
      set: {
        content: JSON.stringify(board),
        contentType: "canvas_json",
        tokenCount: null,
        vectorRefId: null,
        vectorIndexName: null,
        metadata: {
          source: "library_canvas",
        },
      },
    });
}

export async function createLibraryCanvasBoard(
  input: CreateLibraryCanvasInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryCanvasResult> {
  const db = dbClient ?? await getDb();
  const created = await createLibraryItem(
    {
      itemType: CANVAS_ITEM_TYPE,
      source: "document_management",
      title: input.title,
      description: input.description ?? null,
      visibility: input.visibility,
      status: "ready",
      metadata: {
        canvas_version: "v1",
      },
    },
    actor,
    db,
  );

  await writeCanvasBoard(created.item.id, actor, input.board, db);
  return getLibraryCanvasBoard({ itemId: created.item.id }, actor, db);
}

export async function getLibraryCanvasBoard(
  input: GetLibraryCanvasInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryCanvasResult> {
  const db = dbClient ?? await getDb();
  const item = await getLibraryItemById(input.itemId, actor, db);
  if (!item || item.itemType !== CANVAS_ITEM_TYPE) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Canvas board not found",
    });
  }

  const board = await readCanvasBoard(input.itemId, actor, db);
  return {
    itemId: item.id,
    title: item.title,
    description: item.description ?? null,
    visibility: item.visibility,
    board,
    updatedAt: item.updatedAt,
  };
}

export async function updateLibraryCanvasBoard(
  input: UpdateLibraryCanvasInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryCanvasResult> {
  const db = dbClient ?? await getDb();
  const existing = await getLibraryItemById(input.itemId, actor, db);
  if (!existing || existing.itemType !== CANVAS_ITEM_TYPE) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Canvas board not found",
    });
  }

  const permission = await getUserEffectivePermission(input.itemId, actor, db);
  const effectivePermissionLevel = permission.effectivePermissionLevel ?? "none";
  if (!["write", "delete", "owner"].includes(effectivePermissionLevel)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to update this canvas board",
    });
  }

  if (
    input.title !== undefined
    || input.description !== undefined
    || input.visibility !== undefined
  ) {
    await updateLibraryItem(
      input.itemId,
      {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        metadata: {
          ...(existing.metadata ?? {}),
          canvas_version: "v1",
        },
      },
      actor,
      db,
    );
  }

  await writeCanvasBoard(input.itemId, actor, input.board, db);
  return getLibraryCanvasBoard({ itemId: input.itemId }, actor, db);
}
