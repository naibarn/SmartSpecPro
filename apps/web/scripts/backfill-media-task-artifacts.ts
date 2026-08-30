import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../server/db";
import {
  ensureMediaTaskArtifactsDurable,
  extractMediaTaskOutputUrls,
  type MediaTaskArtifactSourceKind,
} from "../server/services/mediaTaskArtifactService";
import type { MediaTask } from "../server/services/mediaGenerationService";

type RawTaskRow = Record<string, unknown>;

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find(value => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return {};
}

function asIsoDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

function asMediaType(value: unknown): MediaTask["mediaType"] {
  return value === "video" || value === "audio" ? value : "image";
}

function toMediaTask(row: RawTaskRow): MediaTask {
  const id = String(row.id ?? "");
  return {
    id,
    taskId: typeof row.task_id === "string" ? row.task_id : undefined,
    celeryTaskId:
      typeof row.celery_task_id === "string" ? row.celery_task_id : undefined,
    userId: String(row.user_id ?? ""),
    mediaType: asMediaType(row.media_type),
    status: "completed",
    model: String(row.model ?? "unknown"),
    prompt: String(row.prompt ?? ""),
    parameters: asRecord(row.parameters),
    resultUrl: typeof row.result_url === "string" ? row.result_url : undefined,
    resultData: asRecord(row.result_data),
    errorMessage:
      typeof row.error_message === "string" ? row.error_message : undefined,
    createdAt: asIsoDate(row.created_at),
    startedAt: row.started_at ? asIsoDate(row.started_at) : undefined,
    completedAt: row.completed_at ? asIsoDate(row.completed_at) : undefined,
  };
}

function parseLimit(): number {
  const value = Number(readArg("limit") ?? 100);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1000) : 100;
}

function buildScope(
  column: "tenant_id" | "user_id",
  value: string | undefined
) {
  return value
    ? sql` AND ${sql.raw(column)} = ${column === "user_id" ? Number(value) : value}`
    : sql``;
}

async function loadPythonTasks(params: {
  tenantId?: string;
  userId?: string;
  limit: number;
  after?: string;
}): Promise<RawTaskRow[]> {
  const db = getDb();
  const tenantScope = buildScope("tenant_id", params.tenantId);
  const userScope = buildScope("user_id", params.userId);
  const afterScope = params.after
    ? sql` AND created_at > ${new Date(params.after)}`
    : sql``;
  const result = await db.execute(sql`
    SELECT id, task_id, celery_task_id, user_id, tenant_id, media_type, status,
           model, prompt, parameters, result_url, result_data, error_message,
           created_at, started_at, completed_at
    FROM media_tasks
    WHERE status = 'completed'
      ${tenantScope}${userScope}${afterScope}
    ORDER BY created_at ASC, id ASC
    LIMIT ${params.limit}
  `);
  return Array.from(result as unknown as Iterable<RawTaskRow>);
}

async function loadMcpTasks(params: {
  tenantId?: string;
  userId?: string;
  limit: number;
  after?: string;
}): Promise<RawTaskRow[]> {
  const db = getDb();
  const tenantScope = buildScope("tenant_id", params.tenantId);
  const userScope = buildScope("user_id", params.userId);
  const afterScope = params.after
    ? sql` AND created_at > ${new Date(params.after)}`
    : sql``;
  const result = await db.execute(sql`
    SELECT id, user_id, tenant_id, media_type, status, model, prompt,
           parameters, result_data, created_at, started_at, completed_at
    FROM mcp_media_tasks
    WHERE status = 'completed'
      ${tenantScope}${userScope}${afterScope}
    ORDER BY created_at ASC, id ASC
    LIMIT ${params.limit}
  `);
  return Array.from(result as unknown as Iterable<RawTaskRow>);
}

async function main(): Promise<void> {
  const tenantId = readArg("tenant") ?? process.env.TENANT_ID;
  const userId = readArg("user") ?? process.env.USER_ID;
  if (userId && (!Number.isInteger(Number(userId)) || Number(userId) <= 0)) {
    throw new Error("--user must be a positive integer");
  }
  const source = readArg("source") ?? "all";
  if (source !== "all" && source !== "provider" && source !== "mcp") {
    throw new Error("--source must be all, provider, or mcp");
  }
  const apply = process.argv.includes("--apply");
  const limit = parseLimit();
  const after = readArg("after");
  const common = { tenantId, userId, limit, after };
  const rows = [
    ...(source === "mcp"
      ? []
      : (await loadPythonTasks(common)).map(row => ({
          row,
          sourceKind: "provider" as const,
        }))),
    ...(source === "provider"
      ? []
      : (await loadMcpTasks(common)).map(row => ({
          row,
          sourceKind: "mcp" as const,
        }))),
  ];

  const report = {
    apply,
    tenantId: tenantId ?? null,
    userId: userId ? Number(userId) : null,
    source,
    scanned: rows.length,
    withProviderOutput: 0,
    copied: 0,
    failed: 0,
    missingTenant: 0,
    failures: [] as Array<{
      sourceKind: string;
      taskId: string;
      error: string;
    }>,
  };

  const processItem = async (item: (typeof rows)[number]) => {
    const task = toMediaTask(item.row);
    const urls = extractMediaTaskOutputUrls(task);
    if (urls.length > 0) report.withProviderOutput += 1;
    const rowTenantId = String(item.row.tenant_id ?? tenantId ?? "");
    const rowUserId = Number(item.row.user_id ?? userId);
    if (!rowTenantId || !Number.isInteger(rowUserId) || rowUserId <= 0) {
      if (urls.length > 0) report.missingTenant += 1;
      return;
    }
    if (!apply || urls.length === 0) return;
    try {
      await ensureMediaTaskArtifactsDurable({
        task,
        tenantId: rowTenantId,
        userId: rowUserId,
        sourceKind: item.sourceKind as MediaTaskArtifactSourceKind,
      });
      report.copied += 1;
    } catch (error) {
      report.failed += 1;
      report.failures.push({
        sourceKind: item.sourceKind,
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Provider downloads can wait on expired URLs. Keep the migration bounded
  // while allowing independent tenant-scoped rows to progress concurrently;
  // artifact writes are idempotent under the unique owner/source/output key.
  const concurrency = apply ? 8 : 1;
  for (let index = 0; index < rows.length; index += concurrency) {
    await Promise.all(rows.slice(index, index + concurrency).map(processItem));
  }

  console.log(JSON.stringify(report, null, 2));
  if (!apply) {
    console.log(
      "Dry run only. Add --apply after migration and R2 configuration are verified."
    );
  }
  if (report.failed > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
