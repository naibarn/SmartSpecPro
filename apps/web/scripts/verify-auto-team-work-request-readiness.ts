/**
 * Production-readiness preflight for Work Request -> Auto Team automation.
 *
 * Usage:
 *   npm --prefix apps/web run verify:auto-team-work-request
 *   npm --prefix apps/web exec tsx scripts/verify-auto-team-work-request-readiness.ts --json
 *
 * The command does not call external media providers. It validates that the
 * local deployment has the database/configuration/runtime prerequisites needed
 * for the already-tested automation flow to complete in production.
 */

import "dotenv/config";
import { pathToFileURL } from "url";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  autoTeamArtifactRefs,
  autoTeamFinalResults,
  mediaModels,
  mediaProviders,
  teamRooms,
  teamRuns,
  userNotifications,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { getAppRuntimeConfig } from "../server/services/appRuntimeConfig";
import { getActiveStorageConfig } from "../server/storage";

export type CheckStatus = "pass" | "warn" | "fail";

export type ReadinessCheck = {
  key: string;
  status: CheckStatus;
  summary: string;
  detail?: Record<string, unknown>;
};

export type ReadinessReport = {
  status: CheckStatus;
  generatedAt: string;
  checks: ReadinessCheck[];
};

export type ReadinessOptions = {
  allowMissingDb?: boolean;
};

export type ReadinessCliOptions = ReadinessOptions & {
  outputJson: boolean;
};

export function parseReadinessCliArgs(argv: string[]): ReadinessCliOptions {
  const args = new Set(argv);
  return {
    allowMissingDb: args.has("--allow-missing-db"),
    outputJson: args.has("--json"),
  };
}

function worstStatus(checks: ReadinessCheck[]): CheckStatus {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

function check(
  key: string,
  status: CheckStatus,
  summary: string,
  detail?: Record<string, unknown>,
): ReadinessCheck {
  return { key, status, summary, ...(detail ? { detail } : {}) };
}

function nonLocalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return !["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function publicResultUrlReady(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && nonLocalUrl(value);
  } catch {
    return false;
  }
}

async function getCount(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  query: PromiseLike<Array<{ count: number | string | bigint | null }>>,
): Promise<number> {
  const [row] = await query;
  const value = row?.count;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function buildReadinessReport(
  options: ReadinessOptions = {},
): Promise<ReadinessReport> {
  const checks: ReadinessCheck[] = [];
  const allowMissingDb = options.allowMissingDb === true;
  const runtime = await getAppRuntimeConfig();
  const db = (() => {
    try {
      return getDb();
    } catch {
      return null;
    }
  })();

  checks.push(
    check(
      "runtime.python_backend_url",
      runtime.pythonBackendUrl ? "pass" : "fail",
      runtime.pythonBackendUrl
        ? "Python/media backend URL is configured."
        : "Python/media backend URL is missing.",
      { pythonBackendUrl: runtime.pythonBackendUrl || null },
    ),
  );
  checks.push(
    check(
      "runtime.public_url",
      runtime.publicUrl || runtime.appPublicUrl || runtime.appUrl
        ? "pass"
        : process.env.NODE_ENV === "production"
          ? "fail"
          : "warn",
      runtime.publicUrl || runtime.appPublicUrl || runtime.appUrl
        ? "Public application URL is configured."
        : "Public application URL is missing; managed media links may not be usable outside localhost.",
      {
        publicUrl: runtime.publicUrl || null,
        appPublicUrl: runtime.appPublicUrl || null,
        appUrl: runtime.appUrl || null,
      },
    ),
  );
  const configuredPublicUrl = runtime.publicUrl || runtime.appPublicUrl || runtime.appUrl || "";
  if (process.env.NODE_ENV === "production" && configuredPublicUrl) {
    checks.push(
      check(
        "runtime.public_result_url",
        publicResultUrlReady(configuredPublicUrl) ? "pass" : "fail",
        publicResultUrlReady(configuredPublicUrl)
          ? "Production public URL can be used for requester result links."
          : "Production public URL must be an https, non-local URL so requester result links and managed media links work.",
        { configuredPublicUrl },
      ),
    );
  }
  checks.push(
    check(
      "workers.auto_team_recovery",
      process.env.WORK_OS_DISABLE_AUTO_TEAM_RECOVERY === "true" ||
        process.env.WORK_OS_DISABLE_AUTO_TEAM_MEDIA_SWEEPER === "true"
        ? "fail"
        : "pass",
      process.env.WORK_OS_DISABLE_AUTO_TEAM_RECOVERY === "true" ||
        process.env.WORK_OS_DISABLE_AUTO_TEAM_MEDIA_SWEEPER === "true"
        ? "Auto Team recovery/media sweepers are disabled by environment."
        : "Auto Team recovery and media sweeper startup are not disabled.",
      {
        recoveryDisabled: process.env.WORK_OS_DISABLE_AUTO_TEAM_RECOVERY === "true",
        mediaSweeperDisabled: process.env.WORK_OS_DISABLE_AUTO_TEAM_MEDIA_SWEEPER === "true",
      },
    ),
  );
  checks.push(
    check(
      "runtime.internal_token",
      runtime.webGatewayToken || runtime.proxyToken ? "pass" : "fail",
      runtime.webGatewayToken || runtime.proxyToken
        ? "Internal media job token is configured."
        : "Internal media job token is missing.",
    ),
  );
  if (process.env.NODE_ENV === "production" && !nonLocalUrl(runtime.pythonBackendUrl)) {
    checks.push(
      check(
        "runtime.production_backend_url",
        "fail",
        "Production runtime cannot point the Python/media backend at localhost.",
        { pythonBackendUrl: runtime.pythonBackendUrl },
      ),
    );
  }

  try {
    const storage = await getActiveStorageConfig();
    const provider = storage.provider;
    const storageReady =
      provider === "s3"
        ? Boolean((storage as { bucket?: string }).bucket)
        : provider === "forge"
          ? Boolean((storage as { baseUrl?: string; apiKey?: string }).baseUrl && (storage as { apiKey?: string }).apiKey)
          : process.env.NODE_ENV === "production"
            ? false
            : true;
    checks.push(
      check(
        "storage.managed_media_provider",
        storageReady ? (provider === "local" ? "warn" : "pass") : "fail",
        storageReady
          ? provider === "local"
            ? "Local storage is active; acceptable for development but not for production final media."
            : "Managed media storage provider is configured."
          : "Managed media storage provider is not production-ready for final media.",
        {
          provider,
          ...(provider === "s3" ? { bucketConfigured: Boolean((storage as { bucket?: string }).bucket) } : {}),
        },
      ),
    );
  } catch (error) {
    checks.push(
      check(
        "storage.managed_media_provider",
        "fail",
        "Managed media storage provider could not be resolved.",
        { error: error instanceof Error ? error.message : String(error) },
      ),
    );
  }

  if (!db) {
    checks.push(
      check(
        "database.connection",
        allowMissingDb ? "warn" : "fail",
        allowMissingDb
          ? "Database is unavailable; DB-backed readiness checks were skipped."
          : "Database is unavailable.",
      ),
    );
    return {
      status: worstStatus(checks),
      generatedAt: new Date().toISOString(),
      checks,
    };
  }

  checks.push(check("database.connection", "pass", "Database connection is available."));

  await getCount(
    db,
    db.select({ count: sql<number>`count(*)::int` }).from(autoTeamFinalResults),
  )
    .then(count =>
      checks.push(
        check(
          "database.auto_team_final_results",
          "pass",
          "Auto Team final result table is accessible.",
          { rowCount: count },
        ),
      )
    )
    .catch(error =>
      checks.push(
        check(
          "database.auto_team_final_results",
          "fail",
          "Auto Team final result table is not accessible.",
          { error: error instanceof Error ? error.message : String(error) },
        ),
      )
    );

  await getCount(
    db,
    db.select({ count: sql<number>`count(*)::int` }).from(autoTeamArtifactRefs),
  )
    .then(count =>
      checks.push(
        check(
          "database.auto_team_artifact_refs",
          "pass",
          "Auto Team artifact evidence table is accessible.",
          { rowCount: count },
        ),
      )
    )
    .catch(error =>
      checks.push(
        check(
          "database.auto_team_artifact_refs",
          "fail",
          "Auto Team artifact evidence table is not accessible.",
          { error: error instanceof Error ? error.message : String(error) },
        ),
      )
    );

  await getCount(
    db,
    db.select({ count: sql<number>`count(*)::int` }).from(userNotifications),
  )
    .then(count =>
      checks.push(
        check(
          "database.notifications",
          "pass",
          "Notification table is accessible for requester completion alerts.",
          { rowCount: count },
        ),
      )
    )
    .catch(error =>
      checks.push(
        check(
          "database.notifications",
          "fail",
          "Notification table is not accessible for requester completion alerts.",
          { error: error instanceof Error ? error.message : String(error) },
        ),
      )
    );

  const enabledMultimodalProviderCount = await getCount(
    db,
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaProviders)
      .where(
        and(
          eq(mediaProviders.isEnabled, true),
          eq(mediaProviders.hasApiKey, true),
          inArray(mediaProviders.providerType, ["multimodal", "video"]),
        ),
      ),
  );
  checks.push(
    check(
      "media.enabled_provider",
      enabledMultimodalProviderCount > 0 ? "pass" : "fail",
      enabledMultimodalProviderCount > 0
        ? "At least one enabled media/video provider has an API key."
        : "No enabled media/video provider with API key was found.",
      { enabledMultimodalProviderCount },
    ),
  );

  const enabledImageModelCount = await getCount(
    db,
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaModels)
      .where(and(eq(mediaModels.isEnabled, true), eq(mediaModels.modelType, "image"))),
  );
  const enabledVideoModelCount = await getCount(
    db,
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaModels)
      .where(and(eq(mediaModels.isEnabled, true), eq(mediaModels.modelType, "video"))),
  );
  checks.push(
    check(
      "media.image_models",
      enabledImageModelCount > 0 ? "pass" : "fail",
      enabledImageModelCount > 0
        ? "At least one enabled image model is available for storyboard/keyframe generation."
        : "No enabled image model is available for storyboard/keyframe generation.",
      { enabledImageModelCount },
    ),
  );
  checks.push(
    check(
      "media.video_models",
      enabledVideoModelCount > 0 ? "pass" : "fail",
      enabledVideoModelCount > 0
        ? "At least one enabled video model is available for clip generation."
        : "No enabled video model is available for clip generation.",
      { enabledVideoModelCount },
    ),
  );

  const activeAsyncMediaRuns = await db
    .select({
      id: teamRuns.id,
      tenantId: teamRooms.tenantId,
      status: teamRuns.status,
      stopReason: teamRuns.stopReason,
      startedAt: teamRuns.startedAt,
      mediaPipelineStatus:
        sql<string | null>`${teamRuns.runtimeStateJson}->'autoTeamMediaPipeline'->>'status'`,
    })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(
      and(
        eq(teamRuns.executionMode, "auto_team"),
        inArray(teamRuns.status, ["running", "paused"]),
        sql`${teamRuns.runtimeStateJson}->'autoTeamMediaPipeline'->>'status' IN ('collecting_assets', 'waiting_for_video_tasks', 'rendering_final_video', 'probing_final_video', 'finalizing_evidence')`,
      ),
    )
    .orderBy(asc(teamRuns.startedAt), asc(teamRuns.id))
    .limit(20);
  checks.push(
    check(
      "media.active_async_pipelines",
      activeAsyncMediaRuns.length > 0 ? "warn" : "pass",
      activeAsyncMediaRuns.length > 0
        ? "Active async media pipelines exist; ensure the recovery sweep and media workers are running before deploy/restart."
        : "No active async media pipeline is currently mid-flight.",
      {
        activeAsyncMediaRunCount: activeAsyncMediaRuns.length,
        samples: activeAsyncMediaRuns.slice(0, 5),
      },
    ),
  );

  const stuckMissingPipelineRuns = await db
    .select({
      id: teamRuns.id,
      tenantId: teamRooms.tenantId,
      status: teamRuns.status,
      stopReason: teamRuns.stopReason,
      runtimeTerminalReason: teamRuns.runtimeTerminalReason,
    })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(
      and(
        eq(teamRuns.executionMode, "auto_team"),
        inArray(teamRuns.status, ["running", "paused"]),
        inArray(teamRuns.stopReason, [
          "awaiting_async_media_pipeline",
          "auto_team_media_pipeline_state_missing",
        ]),
        sql`NOT (${teamRuns.runtimeStateJson}->'autoTeamMediaPipeline'->>'status' IN ('collecting_assets', 'waiting_for_video_tasks', 'rendering_final_video', 'probing_final_video', 'finalizing_evidence'))`,
      ),
    )
    .orderBy(asc(teamRuns.startedAt), asc(teamRuns.id))
    .limit(20);
  checks.push(
    check(
      "media.missing_pipeline_state",
      stuckMissingPipelineRuns.length === 0 ? "pass" : "fail",
      stuckMissingPipelineRuns.length === 0
        ? "No paused async media run is missing its pipeline state."
        : "One or more async media runs are paused without recoverable pipeline state.",
      {
        stuckRunCount: stuckMissingPipelineRuns.length,
        samples: stuckMissingPipelineRuns.slice(0, 5),
      },
    ),
  );

  return {
    status: worstStatus(checks),
    generatedAt: new Date().toISOString(),
    checks,
  };
}

export function printHuman(report: ReadinessReport): void {
  console.log(`Auto Team Work Request readiness: ${report.status.toUpperCase()}`);
  for (const item of report.checks) {
    const icon = item.status === "pass" ? "PASS" : item.status === "warn" ? "WARN" : "FAIL";
    console.log(`[${icon}] ${item.key}: ${item.summary}`);
    if (item.detail && item.status !== "pass") {
      console.log(JSON.stringify(item.detail, null, 2));
    }
  }
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { allowMissingDb, outputJson } = parseReadinessCliArgs(argv);
  try {
    const report = await buildReadinessReport({ allowMissingDb });
    if (outputJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    return report.status === "fail" ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const report: ReadinessReport = {
      status: "fail",
      generatedAt: new Date().toISOString(),
      checks: [
        check("readiness.unhandled_error", "fail", message),
      ],
    };
    if (outputJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    return 1;
  }
}

const invokedAsCli =
  process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (invokedAsCli) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
