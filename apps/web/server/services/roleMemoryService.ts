import { buildDefaultRoleContextGovernance, type RoleMemoryItem } from "../../shared/roleAgentContracts";
import { createRoleId, listRoleMemoryItemsForRole, saveRoleMemoryItem, updateRoleMemoryItem } from "./rolePersistence";

function nowIso(): string {
  return new Date().toISOString();
}

export async function addRoleMemoryItem(input: {
  tenantId: string;
  roleId: string;
  routineId?: string | null;
  routineRunId?: string | null;
  memoryClass: RoleMemoryItem["memoryClass"];
  title: string;
  summary: string;
  relatedRefs?: string[];
  confidence?: number;
  governance?: Partial<RoleMemoryItem["governance"]>;
}): Promise<RoleMemoryItem> {
  const timestamp = nowIso();
  return saveRoleMemoryItem({
    id: createRoleId("mem"),
    tenantId: input.tenantId,
    roleId: input.roleId,
    routineId: input.routineId ?? null,
    routineRunId: input.routineRunId ?? null,
    memoryClass: input.memoryClass,
    title: input.title,
    summary: input.summary,
    relatedRefs: input.relatedRefs ?? [],
    confidence: input.confidence ?? 1,
    governance: buildDefaultRoleContextGovernance(input.governance),
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function archiveRoleMemory(input: {
  roleId: string;
  olderThanMinutes?: number;
}): Promise<RoleMemoryItem[]> {
  const olderThanMs = (input.olderThanMinutes ?? 240) * 60_000;
  const now = Date.now();
  const items = await listRoleMemoryItemsForRole(input.roleId);
  const archived: RoleMemoryItem[] = [];

  for (const item of items) {
    if (item.archivedAt) continue;
    const createdAt = Date.parse(item.createdAt);
    if (Number.isFinite(createdAt) && now - createdAt < olderThanMs) continue;
    const updated = await updateRoleMemoryItem(item.id, (current) => ({
      ...current,
      memoryClass: current.memoryClass === "shared_org_memory" ? current.memoryClass : "archived_context",
      archivedAt: nowIso(),
      updatedAt: nowIso(),
    }));
    if (updated) archived.push(updated);
  }

  return archived;
}

export async function rehydrateRoleMemoryItem(input: {
  itemId: string;
}): Promise<RoleMemoryItem | null> {
  return updateRoleMemoryItem(input.itemId, (current) => ({
    ...current,
    archivedAt: null,
    memoryClass: current.memoryClass === "archived_context" ? "operational_memory" : current.memoryClass,
    updatedAt: nowIso(),
  }));
}

export async function purgeRoleMemory(input: {
  roleId: string;
  includeLegalHold?: boolean;
}): Promise<string[]> {
  const items = await listRoleMemoryItemsForRole(input.roleId);
  const purgedIds: string[] = [];
  for (const item of items) {
    if (item.governance.legalHold && !input.includeLegalHold) continue;
    const updated = await updateRoleMemoryItem(item.id, (current) => ({
      ...current,
      summary: "[Purged]",
      relatedRefs: [],
      archivedAt: current.archivedAt ?? nowIso(),
      updatedAt: nowIso(),
      governance: {
        ...current.governance,
        redactionState: "redacted",
      },
    }));
    if (updated) {
      purgedIds.push(updated.id);
    }
  }
  return purgedIds;
}

export async function getRoleMemorySummary(roleId: string): Promise<{
  roleId: string;
  hotCount: number;
  archivedCount: number;
  classes: Record<RoleMemoryItem["memoryClass"], number>;
}> {
  const items = await listRoleMemoryItemsForRole(roleId);
  const summary = {
    roleId,
    hotCount: 0,
    archivedCount: 0,
    classes: {
      role_memory: 0,
      operational_memory: 0,
      shared_org_memory: 0,
      archived_context: 0,
    } as Record<RoleMemoryItem["memoryClass"], number>,
  };

  for (const item of items) {
    summary.classes[item.memoryClass] += 1;
    if (item.archivedAt || item.memoryClass === "archived_context") {
      summary.archivedCount += 1;
    } else {
      summary.hotCount += 1;
    }
  }

  return summary;
}

