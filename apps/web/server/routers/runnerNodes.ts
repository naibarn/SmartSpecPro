import { and, desc, eq, isNull, or } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { runnerNodes } from "../../drizzle/schema";

function tenantRequired(ctx: {
  tenantId?: unknown;
  user: { currentTenantId?: unknown };
}): string {
  const tenantId = ctx.tenantId ?? ctx.user.currentTenantId ?? null;
  if (tenantId == null || !String(tenantId).trim())
    throw new Error("Tenant context is required");
  return String(tenantId);
}

type SafeInventoryEntry = {
  id: string;
  label: string;
  kind: "tool" | "capability";
  version: string | null;
  status: string;
  availability: string;
  auth: string | null;
  health: string | null;
  policy: string | null;
  reasonCodes: string[];
};

function boundedText(value: unknown, max = 160): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

function safeInventory(
  input: unknown,
  kind: SafeInventoryEntry["kind"]
): SafeInventoryEntry[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 64).flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = item as Record<string, unknown>;
    const id = boundedText(raw[kind === "tool" ? "toolId" : "capabilityId"], 160);
    const label = boundedText(
      kind === "tool" ? raw.displayName ?? id : raw.implementationId ?? id,
      160
    );
    if (!id || !label) return [];
    const reasonCodes = Array.isArray(raw.reasonCodes)
      ? raw.reasonCodes
          .map(value => boundedText(value, 80))
          .filter((value): value is string => Boolean(value))
          .slice(0, 12)
      : [];
    return [
      {
        id,
        label,
        kind,
        version: boundedText(raw.version ?? raw.contractVersion, 80),
        status: boundedText(raw.trustState ?? raw.policyDecision, 80) ?? "unknown",
        availability: boundedText(raw.availabilityState, 80) ?? "unknown",
        auth: boundedText(raw.authState, 80),
        health: boundedText(raw.healthState, 80),
        policy: boundedText(raw.policyDecision, 80),
        reasonCodes,
      },
    ];
  });
}

export const runnerNodesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = tenantRequired(ctx);
    const db = getDb();
    const rows = await db
      .select()
      .from(runnerNodes)
      .where(
        and(
          eq(runnerNodes.tenantId, tenantId),
          or(
            isNull(runnerNodes.ownerUserId),
            eq(runnerNodes.ownerUserId, ctx.user.id)
          )
        )
      )
      .orderBy(desc(runnerNodes.updatedAt))
      .limit(100);
    return {
      runners: rows.map(row => {
        const snapshot = row.currentSnapshotJson as {
          toolInventory?: unknown[];
          capabilityInventory?: unknown[];
          platform?: {
            os: string;
            architecture: string;
            target: string;
          };
        } | null;
        const toolInventory = safeInventory(snapshot?.toolInventory, "tool");
        const capabilityInventory = safeInventory(
          snapshot?.capabilityInventory,
          "capability"
        );
        const snapshotExpired = Boolean(
          row.snapshotExpiresAt && row.snapshotExpiresAt.getTime() <= Date.now()
        );
        const displayState =
          row.trustState !== "trusted"
            ? "verification_pending"
            : row.status === "revoked"
              ? "revoked"
              : row.status === "offline"
                ? "runner_unavailable"
                : row.status === "degraded" || snapshotExpired
                  ? "reconciling"
                  : !row.currentSnapshotRevision
                    ? "waiting_for_compatible_runner"
                    : "ready";
        return {
          runnerId: row.runnerId,
          displayName: row.displayName,
          profile: row.profile,
          nodeKind: row.nodeKind,
          status: row.status,
          trustState: row.trustState,
          snapshotRevision: row.currentSnapshotRevision,
          snapshotExpiresAt: row.snapshotExpiresAt?.toISOString() ?? null,
          lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
          platform: snapshot?.platform ?? null,
          displayState,
          toolCount: toolInventory.length,
          capabilityCount: capabilityInventory.length,
          toolInventory,
          capabilityInventory,
        };
      }),
    };
  }),
});
