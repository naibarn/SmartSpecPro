/**
 * Report-first repair for persisted Grok video native-audio metadata.
 *
 * Default: read-only report. Mutations require --apply and always write a
 * timestamped JSON backup before the transaction starts.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { isGrokVideoFamily } from "../server/services/modelRegistry";

export interface MediaModelAudioRow {
  modelId: string;
  modelType: "image" | "video" | "audio" | string;
  configJson: Record<string, unknown> | null;
}

export interface GrokNativeAudioRepair {
  modelId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export function planGrokNativeAudioBackfill(
  rows: MediaModelAudioRow[],
): GrokNativeAudioRepair[] {
  return rows.flatMap(row => {
    const configJson = row.configJson ?? {};
    if (
      !isGrokVideoFamily(row.modelId, {
        type: row.modelType as "video",
        configJson,
      }) ||
      (configJson.hasAudio === true && configJson.nativeAudio === true)
    ) {
      return [];
    }
    return [
      {
        modelId: row.modelId,
        before: configJson,
        after: { ...configJson, hasAudio: true, nativeAudio: true },
      },
    ];
  });
}

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

export async function runGrokNativeAudioBackfill(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const check = process.argv.includes("--check");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql<MediaModelAudioRow[]>`
      SELECT
        "modelId" AS "modelId",
        "modelType" AS "modelType",
        COALESCE("configJson"::jsonb, '{}'::jsonb) AS "configJson"
      FROM media_models
      ORDER BY "modelId"
    `;
    const repairs = planGrokNativeAudioBackfill(rows);
    console.log(
      JSON.stringify(
        {
          mode: apply ? "apply" : check ? "check" : "report",
          scanned: rows.length,
          grokVideoRowsNeedingRepair: repairs.length,
          modelIds: repairs.map(repair => repair.modelId),
        },
        null,
        2,
      ),
    );

    if (!apply) {
      if (check && repairs.length > 0) process.exitCode = 1;
      return;
    }
    if (repairs.length === 0) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = resolve(
      argValue("--backup") ?? `backups/grok-native-audio-${timestamp}.json`,
    );
    await mkdir(dirname(backupPath), { recursive: true });
    await writeFile(
      backupPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          purpose: "restore media_models.configJson before Grok native-audio backfill",
          rows: repairs.map(({ modelId, before }) => ({ modelId, configJson: before })),
        },
        null,
        2,
      ),
      "utf8",
    );

    await sql.begin(async tx => {
      for (const repair of repairs) {
        await tx`
          UPDATE media_models
          SET "configJson" = ${tx.json(repair.after)}, "updatedAt" = now()
          WHERE "modelId" = ${repair.modelId}
        `;
      }
    });

    const verificationRows = await sql<MediaModelAudioRow[]>`
      SELECT "modelId", "modelType", "configJson"
      FROM media_models
      WHERE "modelId" IN ${sql(repairs.map(repair => repair.modelId))}
    `;
    const remaining = planGrokNativeAudioBackfill(verificationRows);
    if (remaining.length > 0) {
      throw new Error(`Backfill verification failed for: ${remaining.map(row => row.modelId).join(", ")}`);
    }
    console.log(`Applied ${repairs.length} repair(s). Backup: ${backupPath}`);
    console.log(
      "Restore: read backup.rows and update each media_models row's configJson by modelId inside one transaction.",
    );
  } finally {
    await sql.end();
  }
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  runGrokNativeAudioBackfill().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
