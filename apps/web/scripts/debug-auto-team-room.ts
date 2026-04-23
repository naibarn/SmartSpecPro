#!/usr/bin/env tsx

import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { teamRooms } from "../drizzle/schema";
import { getAutoTeamDebugSnapshot } from "../server/services/autoTeamDebugSnapshotService";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(token.slice(2), next);
      i += 1;
    } else {
      args.set(token.slice(2), "true");
    }
  }
  return args;
}

async function resolveTenantId(roomId: string, tenantId?: string | null): Promise<string> {
  if (tenantId && tenantId.trim().length > 0) {
    return tenantId.trim();
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [room] = await db
    .select({ tenantId: teamRooms.tenantId })
    .from(teamRooms)
    .where(eq(teamRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new Error(`Room ${roomId} not found`);
  }

  return room.tenantId;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const roomId = args.get("room") ?? null;
  const runId = args.get("run") ?? null;
  const workRequestId = args.get("work-request") ?? args.get("workRequest") ?? null;
  const workCaseId = args.get("work-case") ?? args.get("workCase") ?? null;
  const tenantId = args.get("tenant") ?? null;
  const limitMessages = args.has("limit-messages")
    ? Number(args.get("limit-messages"))
    : undefined;

  if (!roomId && !runId && !workRequestId && !workCaseId) {
    throw new Error("Provide at least one of --room, --run, --work-request, or --work-case");
  }

  const resolvedTenantId = roomId
    ? await resolveTenantId(roomId, tenantId)
    : tenantId?.trim();

  if (!resolvedTenantId) {
    throw new Error("A tenant id is required when room id is not provided");
  }

  const snapshot = await getAutoTeamDebugSnapshot({
    tenantId: resolvedTenantId,
    caller: {
      tenantId: resolvedTenantId,
      userId: null,
      isTenantAdmin: true,
      isDebugUser: true,
    },
    roomId,
    runId,
    workRequestId,
    workCaseId,
    limitMessages,
  });

  const safeSnapshot = {
    ...snapshot,
    rawDiagnostics: null,
  };

  // Never print rawDiagnostics or any opaque provider payloads from the service output.
  console.log(JSON.stringify(safeSnapshot, null, 2));
}

main().catch((error) => {
  console.error(
    "[debug-auto-team-room] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
