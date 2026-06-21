import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { getDb } from "../server/db";
import { storagePut } from "../server/storage";
import type { MediaTask } from "../server/services/mediaGenerationService";
import { internalizeMcpProviderOutputUrls } from "../server/services/mcpMediaAdapter";
import type { MediaTaskTransportMetadata } from "../shared/mcpConnectTypes";

const DEFAULT_LIMIT = 50;
const DATABASE_URL = process.env.DATABASE_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

function parseLimit(): number {
  const raw = process.argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length);
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_LIMIT;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
}

function shouldPromoteLocalManagedUrls(): boolean {
  return process.argv.includes("--promote-local-managed");
}

function mediaUrlKey(mediaType: MediaTask["mediaType"]): "imageUrl" | "videoUrl" | "audioUrl" {
  if (mediaType === "video") return "videoUrl";
  if (mediaType === "audio") return "audioUrl";
  return "imageUrl";
}

function collectLegacyOutputUrls(resultData: Record<string, unknown>): string[] {
  const urls = Array.isArray(resultData.outputUrls)
    ? resultData.outputUrls
    : resultData.resultUrl
      ? [resultData.resultUrl]
      : [];
  return urls
    .filter((url): url is string => typeof url === "string")
    .filter((url, index, all) => /^https?:\/\//i.test(url) && all.indexOf(url) === index);
}

function collectLocalManagedOutputUrls(resultData: Record<string, unknown>): string[] {
  const urls = Array.isArray(resultData.outputUrls)
    ? resultData.outputUrls
    : resultData.resultUrl
      ? [resultData.resultUrl]
      : [];
  return urls
    .filter((url): url is string => typeof url === "string")
    .filter((url, index, all) => url.startsWith("/uploads/mcp-media/") && all.indexOf(url) === index);
}

function guessContentTypeFromKey(key: string, mediaType: MediaTask["mediaType"]): string {
  const ext = path.extname(key).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (mediaType === "video") return "video/mp4";
  if (mediaType === "audio") return "audio/mpeg";
  return "image/png";
}

async function promoteLocalManagedUrls(params: {
  urls: string[];
  mediaType: MediaTask["mediaType"];
}): Promise<{
  urls: string[];
  artifacts: Array<{
    storageKey: string;
    url: string;
    contentType: string;
    byteSize: number;
    sha256?: string;
  }>;
}> {
  const nextUrls: string[] = [];
  const artifacts: Array<{
    storageKey: string;
    url: string;
    contentType: string;
    byteSize: number;
    sha256?: string;
  }> = [];

  for (const url of params.urls) {
    if (!url.startsWith("/uploads/")) {
      nextUrls.push(url);
      continue;
    }
    const key = decodeURIComponent(url.slice("/uploads/".length));
    const sourcePath = path.resolve(UPLOADS_DIR, key);
    if (!sourcePath.startsWith(UPLOADS_DIR + path.sep)) {
      throw new Error(`Refusing to read unsafe uploads path for ${url}`);
    }
    const buffer = fs.readFileSync(sourcePath);
    const contentType = guessContentTypeFromKey(key, params.mediaType);
    const stored = await storagePut(key, buffer, contentType);
    nextUrls.push(stored.url);
    artifacts.push({
      storageKey: stored.key,
      url: stored.url,
      contentType,
      byteSize: buffer.length,
    });
  }

  return { urls: nextUrls, artifacts };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(DATABASE_URL, { max: 1 });
const limit = parseLimit();
const promoteLocalManaged = shouldPromoteLocalManagedUrls();
getDb();

try {
  const rows = await sql<{
    id: string;
    provider_task_id: string | null;
    user_id: number;
    media_type: MediaTask["mediaType"];
    status: MediaTask["status"];
    model: string;
    prompt: string;
    parameters: Record<string, unknown>;
    result_data: Record<string, unknown>;
    created_at: Date;
    started_at: Date | null;
    completed_at: Date | null;
  }[]>`
    select
      id,
      provider_task_id,
      user_id,
      media_type,
      status,
      model,
      prompt,
      parameters,
      result_data,
      created_at,
      started_at,
      completed_at
    from mcp_media_tasks
    where status = 'completed'
      and (
        result_data @? '$.outputUrls[*] ? (@ like_regex "^https?://")'
        or (${promoteLocalManaged} and result_data @? '$.outputUrls[*] ? (@ like_regex "^/uploads/mcp-media/")')
      )
    order by created_at desc
    limit ${limit}
  `;

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const resultData = asRecord(row.result_data);
    const urls = collectLegacyOutputUrls(resultData);
    const localManagedUrls = urls.length === 0 && promoteLocalManaged
      ? collectLocalManagedOutputUrls(resultData)
      : [];
    if (urls.length === 0 && localManagedUrls.length === 0) {
      skipped += 1;
      continue;
    }

    const metadata = (
      asRecord(row.parameters).transportMetadata ??
      resultData.transportMetadata
    ) as MediaTaskTransportMetadata | undefined;

    const task: MediaTask = {
      id: row.id,
      taskId: row.provider_task_id ?? undefined,
      userId: String(row.user_id),
      mediaType: row.media_type,
      status: row.status,
      model: row.model,
      prompt: row.prompt,
      parameters: row.parameters,
      resultData,
      creditsUsed: 0,
      createdAt: row.created_at.toISOString(),
      startedAt: row.started_at?.toISOString(),
      completedAt: row.completed_at?.toISOString(),
    };

    try {
      const currentOutputUrls = Array.isArray(resultData.outputUrls)
        ? resultData.outputUrls.filter((url): url is string => typeof url === "string")
        : urls.length > 0
          ? urls
          : localManagedUrls;
      const internalized = urls.length > 0
        ? await internalizeMcpProviderOutputUrls({ urls, task, metadata })
        : await promoteLocalManagedUrls({
          urls: currentOutputUrls,
          mediaType: row.media_type,
        });
      const primaryUrl = internalized.urls[0];
      const nextResultData = {
        ...resultData,
        ...(primaryUrl ? { resultUrl: primaryUrl, [mediaUrlKey(row.media_type)]: primaryUrl } : {}),
        outputUrls: internalized.urls,
        previewUrls: internalized.urls.slice(1),
        providerOutputArtifacts: internalized.artifacts,
        providerStatus: {
          redacted: true,
          backfilledFromLegacyProviderStatus: true,
        },
        providerSummary: {
          ...asRecord(resultData.providerSummary),
          outputCount: internalized.urls.length,
          outputsStored: internalized.urls.length > 0,
          outputBackfilledAt: new Date().toISOString(),
        },
      };

      await sql`
        update mcp_media_tasks
        set result_data = ${sql.json(nextResultData)},
            updated_at = now()
        where id = ${row.id}
      `;
      updated += 1;
      const sourceLabel = urls.length > 0
        ? `${urls.length} provider URL(s)`
        : `${localManagedUrls.length} local managed URL(s)`;
      console.log(`updated ${row.id}: ${sourceLabel} -> managed storage`);
    } catch (error) {
      failed += 1;
      console.warn(`failed ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(JSON.stringify({ scanned: rows.length, updated, skipped, failed }, null, 2));
} finally {
  await sql.end();
}
