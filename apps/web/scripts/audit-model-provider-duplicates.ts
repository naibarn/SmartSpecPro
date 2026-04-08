/**
 * Audit duplicate upstream model mappings before applying the dedupe migration.
 *
 * Usage:
 *   npm --prefix apps/web exec tsx scripts/audit-model-provider-duplicates.ts
 */

import { llmProviders, modelProviderMap } from "../drizzle/schema";
import { getDb } from "../server/db";
import { asc, eq } from "drizzle-orm";

type MappingRow = {
  id: number;
  providerId: number;
  providerName: string;
  providerModelId: string;
  modelId: string;
  isEnabled: boolean;
  priorityLocked: boolean | null;
  priority: number;
};

function rankMappings(left: MappingRow, right: MappingRow) {
  if (left.isEnabled !== right.isEnabled) {
    return left.isEnabled ? -1 : 1;
  }
  if ((left.priorityLocked ?? false) !== (right.priorityLocked ?? false)) {
    return left.priorityLocked ? -1 : 1;
  }
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  return left.id - right.id;
}

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    process.exit(1);
  }

  const rows = await db
    .select({
      id: modelProviderMap.id,
      providerId: modelProviderMap.providerId,
      providerName: llmProviders.providerName,
      providerModelId: modelProviderMap.providerModelId,
      modelId: modelProviderMap.modelId,
      isEnabled: modelProviderMap.isEnabled,
      priorityLocked: modelProviderMap.priorityLocked,
      priority: modelProviderMap.priority,
    })
    .from(modelProviderMap)
    .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .orderBy(
      asc(modelProviderMap.providerId),
      asc(modelProviderMap.providerModelId),
      asc(modelProviderMap.id),
    );

  const grouped = new Map<string, MappingRow[]>();
  for (const row of rows) {
    const key = `${row.providerId}:${row.providerModelId}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  }

  const duplicates = Array.from(grouped.values())
    .filter((group) => group.length > 1)
    .map((group) => group.sort(rankMappings));

  if (duplicates.length === 0) {
    console.log("No duplicate providerId + providerModelId groups found.");
    return;
  }

  console.log(`Found ${duplicates.length} duplicate upstream mapping group(s):\n`);
  for (const group of duplicates) {
    const [survivor, ...duplicatesToDelete] = group;
    const aliases = duplicatesToDelete.map((row) => row.modelId);

    console.log(`${survivor.providerName} (${survivor.providerId}) :: ${survivor.providerModelId}`);
    console.log(`  survivor: #${survivor.id} modelId=${survivor.modelId} enabled=${survivor.isEnabled} priority=${survivor.priority} locked=${survivor.priorityLocked ?? false}`);
    if (aliases.length > 0) {
      console.log(`  aliases: ${aliases.join(", ")}`);
    }
    for (const row of duplicatesToDelete) {
      console.log(`  drop: #${row.id} modelId=${row.modelId} enabled=${row.isEnabled} priority=${row.priority} locked=${row.priorityLocked ?? false}`);
    }
    console.log("");
  }
}

main().catch((error) => {
  console.error("Failed to audit duplicate upstream mappings:", error);
  process.exit(1);
});
