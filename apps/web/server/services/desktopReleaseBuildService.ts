import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { and, desc, eq, like } from "drizzle-orm";

import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { listDesktopReleaseCatalog, persistDesktopReleaseUpload } from "./desktopReleaseService";
import {
  DESKTOP_RELEASE_SETTINGS_CATEGORY,
  getDesktopReleaseConfig,
} from "./desktopReleaseSettings";
import {
  desktopReleaseBuildBundleModeSchema,
  desktopReleaseBuildConclusionValues,
  desktopReleaseBuildPortalSyncValues,
  desktopReleaseBuildRunStatusSchema,
  desktopReleaseBuildRunStatusValues,
  desktopReleaseBuildPlatformSchema,
  desktopReleaseBuildRequestSchema,
  desktopReleaseBuildResponseSchema,
  desktopReleaseBuildHistoryItemSchema,
  normalizeDesktopReleaseVersion,
  suggestNextDesktopReleaseVersion,
  type DesktopReleaseBuildRequest,
  type DesktopReleaseBuildHistoryItem,
  type DesktopReleaseBuildRunStatus,
  type DesktopReleaseBuildResponse,
  type DesktopReleaseBuildBundleMode,
  type DesktopReleaseBuildPlatform,
} from "../../shared/desktopReleaseBuilds";
import {
  desktopReleasePlatformValues,
  type DesktopReleaseInstallerFormat,
  type DesktopReleasePlatform,
} from "../../shared/desktopReleases";

const DEFAULT_GITHUB_WORKFLOW = "desktop-release.yml";
const DEFAULT_GITHUB_REF = "main";

type GithubWorkflowConfig = {
  repository: string;
  workflow: string;
  ref: string;
  token: string;
};

type GithubRun = {
  id: number;
  html_url: string;
  created_at: string;
  head_branch: string | null;
  event: string;
};

type GithubWorkflowRun = {
  id: number;
  html_url: string;
  status: string | null;
  conclusion: string | null;
  updated_at: string;
};

type GithubReleaseAsset = {
  id: number;
  name: string;
  content_type: string | null;
  browser_download_url: string;
  url: string;
  size: number;
};

type GithubRelease = {
  id: number;
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  body: string | null;
  created_at?: string;
  updated_at?: string;
  assets: GithubReleaseAsset[];
};

type DesktopReleaseBuildSyncContext = {
  repository: string;
  workflow: string;
  ref: string;
  version: string;
  platform: DesktopReleaseBuildPlatform;
  bundleMode: DesktopReleaseBuildBundleMode;
  releaseNotes: string;
  queuedAt: string;
  workflowRunUrl: string | null;
  requestedByUserId: number | null;
};

type PersistedDesktopReleaseBuildJobState = {
  workflowRunId: string;
  repository: string;
  workflow: string;
  ref: string;
  queuedAt: string;
  workflowRunUrl: string | null;
  workflowRunStatus: DesktopReleaseBuildRunStatus["workflowRunStatus"];
  workflowRunConclusion: DesktopReleaseBuildRunStatus["workflowRunConclusion"];
  workflowRunUpdatedAt: string | null;
  version: string;
  platform: DesktopReleaseBuildPlatform;
  bundleMode: DesktopReleaseBuildBundleMode;
  releaseNotes: string;
  requestedByUserId: number | null;
  uploadedPlatforms: DesktopReleasePlatform[];
  portalSyncStatus: DesktopReleasePortalSyncState["status"];
  portalSyncUpdatedAt: string | null;
  portalSyncError: string | null;
  portalSyncAttempts: number | null;
};

type DesktopReleasePortalSyncState = {
  status: (typeof desktopReleaseBuildPortalSyncValues)[number];
  updatedAt: string | null;
  lastError: string | null;
  attempts: number | null;
};

const desktopReleaseBuildContexts = new Map<string, DesktopReleaseBuildSyncContext>();
const desktopReleaseWorkflowRunStates = new Map<string, {
  workflowRunUrl: string | null;
  workflowRunStatus: DesktopReleaseBuildRunStatus["workflowRunStatus"];
  workflowRunConclusion: DesktopReleaseBuildRunStatus["workflowRunConclusion"];
  workflowRunUpdatedAt: string | null;
  queuedAt: string;
}>();
const desktopReleasePortalSyncStates = new Map<string, DesktopReleasePortalSyncState>();
const desktopReleasePortalSyncActiveRuns = new Set<string>();
const desktopReleasePortalSyncCompletedRuns = new Set<string>();
const desktopReleasePortalSyncUploadedPlatforms = new Map<string, Set<DesktopReleasePlatform>>();
const DESKTOP_RELEASE_PORTAL_SYNC_RECONCILE_INTERVAL_MS = 60_000;
const DESKTOP_RELEASE_BUILD_JOB_KEY_PREFIX = "build_job:";
const DESKTOP_RELEASE_PORTAL_SYNC_MAX_ATTEMPTS = 120;
const DESKTOP_RELEASE_PORTAL_SYNC_POLL_MS = 15_000;
let desktopReleasePortalSyncReconcilerStarted = false;
let desktopReleasePortalSyncReconcilerBusy = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTestRuntime(): boolean {
  return Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID || process.env.NODE_ENV === "test");
}

function normalizeGithubRepository(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.split("/").length !== 2) {
    throw new Error("desktop_release_github_repository_not_configured");
  }
  return trimmed;
}

function normalizeWorkflowName(value: string): string {
  const trimmed = value.trim();
  return trimmed || DEFAULT_GITHUB_WORKFLOW;
}

function normalizeWorkflowRef(value: string): string {
  const trimmed = value.trim();
  return trimmed || DEFAULT_GITHUB_REF;
}

function getGithubApiBase(repository: string): string {
  const [owner, repo] = repository.split("/");
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function getGithubWorkflowPageUrl(repository: string, workflow: string): string {
  return `https://github.com/${repository}/actions/workflows/${encodeURIComponent(workflow)}`;
}

function parseVersionOrSuggestion(version: string | null | undefined): string {
  const normalized = normalizeDesktopReleaseVersion(version);
  if (normalized) {
    return normalized;
  }

  return "0.1.0";
}

function normalizeWorkflowRunStatus(value: string | null | undefined): (typeof desktopReleaseBuildRunStatusValues)[number] | null {
  if (typeof value !== "string") {
    return null;
  }

  return desktopReleaseBuildRunStatusValues.includes(value as (typeof desktopReleaseBuildRunStatusValues)[number])
    ? (value as (typeof desktopReleaseBuildRunStatusValues)[number])
    : null;
}

function normalizeWorkflowRunConclusion(value: string | null | undefined): (typeof desktopReleaseBuildConclusionValues)[number] | null {
  if (typeof value !== "string") {
    return null;
  }

  return desktopReleaseBuildConclusionValues.includes(value as (typeof desktopReleaseBuildConclusionValues)[number])
    ? (value as (typeof desktopReleaseBuildConclusionValues)[number])
    : null;
}

async function githubJson<T>(url: string, init: RequestInit & { token: string }): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${init.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(body || `github_api_request_failed_${response.status}`) as Error & {
      statusCode?: number;
    };
    error.statusCode = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}

function toIsoDateString(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function inferInstallerFormat(fileName: string): DesktopReleaseInstallerFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar_gz";
  if (lower.endsWith(".exe")) return "exe";
  if (lower.endsWith(".msi")) return "msi";
  if (lower.endsWith(".dmg")) return "dmg";
  if (lower.endsWith(".pkg")) return "pkg";
  if (lower.endsWith(".deb")) return "deb";
  if (lower.endsWith(".rpm")) return "rpm";
  if (lower.endsWith(".appimage")) return "appimage";
  if (lower.endsWith(".zip")) return "zip";
  return "other";
}

function sanitizeTempFileName(value: string): string {
  return path.basename(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 180) || "installer.bin";
}

function getPortalSyncState(workflowRunId: string): DesktopReleasePortalSyncState {
  return desktopReleasePortalSyncStates.get(workflowRunId) ?? {
    status: "idle",
    updatedAt: null,
    lastError: null,
    attempts: null,
  };
}

function getDesktopReleaseBuildJobSettingKey(workflowRunId: string): string {
  return `${DESKTOP_RELEASE_BUILD_JOB_KEY_PREFIX}${workflowRunId}`;
}

function normalizePersistedUploadedPlatforms(value: unknown): DesktopReleasePlatform[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((candidate): candidate is DesktopReleasePlatform => (
    typeof candidate === "string" && desktopReleasePlatformValues.includes(candidate as DesktopReleasePlatform)
  ));
}

function parsePersistedDesktopReleaseBuildJobState(value: unknown): PersistedDesktopReleaseBuildJobState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<Record<keyof PersistedDesktopReleaseBuildJobState, unknown>>;
  const workflowRunId = typeof candidate.workflowRunId === "string" ? candidate.workflowRunId.trim() : "";
  const repository = typeof candidate.repository === "string" ? candidate.repository.trim() : "";
  const workflow = typeof candidate.workflow === "string" ? candidate.workflow.trim() : DEFAULT_GITHUB_WORKFLOW;
  const ref = typeof candidate.ref === "string" ? candidate.ref.trim() : DEFAULT_GITHUB_REF;
  const version = typeof candidate.version === "string" ? candidate.version.trim() : "";
  const queuedAt = typeof candidate.queuedAt === "string" ? candidate.queuedAt : "";
  const workflowRunUrl = typeof candidate.workflowRunUrl === "string" ? candidate.workflowRunUrl : null;
  const platform = candidate.platform;
  const bundleMode = candidate.bundleMode;
  const releaseNotes = typeof candidate.releaseNotes === "string" ? candidate.releaseNotes : "";

  if (!workflowRunId || !repository || !version) {
    return null;
  }
  if (!desktopReleaseBuildPlatformSchema.safeParse(platform).success) {
    return null;
  }
  if (!desktopReleaseBuildBundleModeSchema.safeParse(bundleMode).success) {
    return null;
  }

  return {
    workflowRunId,
    repository,
    workflow: workflow || DEFAULT_GITHUB_WORKFLOW,
    ref: ref || DEFAULT_GITHUB_REF,
    queuedAt,
    workflowRunUrl,
    workflowRunStatus: desktopReleaseBuildRunStatusValues.includes(
      candidate.workflowRunStatus as (typeof desktopReleaseBuildRunStatusValues)[number],
    )
      ? (candidate.workflowRunStatus as DesktopReleaseBuildRunStatus["workflowRunStatus"])
      : "queued",
    workflowRunConclusion: desktopReleaseBuildConclusionValues.includes(
      candidate.workflowRunConclusion as (typeof desktopReleaseBuildConclusionValues)[number],
    )
      ? (candidate.workflowRunConclusion as DesktopReleaseBuildRunStatus["workflowRunConclusion"])
      : null,
    workflowRunUpdatedAt: typeof candidate.workflowRunUpdatedAt === "string" ? candidate.workflowRunUpdatedAt : null,
    version,
    platform: platform as DesktopReleaseBuildPlatform,
    bundleMode: bundleMode as DesktopReleaseBuildBundleMode,
    releaseNotes,
    requestedByUserId: typeof candidate.requestedByUserId === "number" ? candidate.requestedByUserId : null,
    uploadedPlatforms: normalizePersistedUploadedPlatforms(candidate.uploadedPlatforms),
    portalSyncStatus: desktopReleaseBuildPortalSyncValues.includes(
      candidate.portalSyncStatus as (typeof desktopReleaseBuildPortalSyncValues)[number],
    )
      ? (candidate.portalSyncStatus as DesktopReleasePortalSyncState["status"])
      : "idle",
    portalSyncUpdatedAt: typeof candidate.portalSyncUpdatedAt === "string" ? candidate.portalSyncUpdatedAt : null,
    portalSyncError: typeof candidate.portalSyncError === "string" ? candidate.portalSyncError : null,
    portalSyncAttempts: typeof candidate.portalSyncAttempts === "number" ? candidate.portalSyncAttempts : null,
  };
}

function buildPersistedDesktopReleaseBuildJobState(
  workflowRunId: string,
): PersistedDesktopReleaseBuildJobState | null {
  const context = desktopReleaseBuildContexts.get(workflowRunId);
  if (!context) {
    return null;
  }
  const workflowRunState = desktopReleaseWorkflowRunStates.get(workflowRunId) ?? {
    workflowRunUrl: context.workflowRunUrl,
    workflowRunStatus: "queued" as const,
    workflowRunConclusion: null,
    workflowRunUpdatedAt: null,
    queuedAt: context.queuedAt,
  };

  const portalSyncState = getPortalSyncState(workflowRunId);
  return {
    workflowRunId,
    repository: context.repository,
    workflow: context.workflow,
    ref: context.ref,
    queuedAt: workflowRunState.queuedAt,
    workflowRunUrl: workflowRunState.workflowRunUrl,
    workflowRunStatus: workflowRunState.workflowRunStatus,
    workflowRunConclusion: workflowRunState.workflowRunConclusion,
    workflowRunUpdatedAt: workflowRunState.workflowRunUpdatedAt,
    version: context.version,
    platform: context.platform,
    bundleMode: context.bundleMode,
    releaseNotes: context.releaseNotes,
    requestedByUserId: context.requestedByUserId,
    uploadedPlatforms: Array.from(desktopReleasePortalSyncUploadedPlatforms.get(workflowRunId) ?? []),
    portalSyncStatus: portalSyncState.status,
    portalSyncUpdatedAt: portalSyncState.updatedAt,
    portalSyncError: portalSyncState.lastError,
    portalSyncAttempts: portalSyncState.attempts,
  };
}

function mapPersistedDesktopReleaseBuildHistoryItem(
  state: PersistedDesktopReleaseBuildJobState,
  recordUpdatedAt: string,
): DesktopReleaseBuildHistoryItem {
  return desktopReleaseBuildHistoryItemSchema.parse({
    workflowRunId: state.workflowRunId,
    repository: state.repository,
    workflow: state.workflow,
    workflowUrl: getGithubWorkflowPageUrl(state.repository, state.workflow),
    ref: state.ref,
    version: state.version,
    platform: state.platform,
    bundleMode: state.bundleMode,
    releaseNotes: state.releaseNotes || null,
    queuedAt: state.queuedAt || recordUpdatedAt,
    workflowRunUrl: state.workflowRunUrl,
    workflowRunStatus: state.workflowRunStatus,
    workflowRunConclusion: state.workflowRunConclusion,
    workflowRunUpdatedAt: state.workflowRunUpdatedAt,
    portalSyncStatus: state.portalSyncStatus,
    portalSyncUpdatedAt: state.portalSyncUpdatedAt,
    portalSyncError: state.portalSyncError,
    portalSyncAttempts: state.portalSyncAttempts,
    uploadedPlatforms: state.uploadedPlatforms,
    recordUpdatedAt,
  });
}

function shouldLogDesktopReleaseBuildJobPersistenceError(error: unknown): boolean {
  if (isTestRuntime()) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return !/Database not configured|Database not available/i.test(message);
}

async function readPersistedDesktopReleaseBuildJobState(
  workflowRunId: string,
): Promise<PersistedDesktopReleaseBuildJobState | null> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(systemSettings)
      .where(and(
        eq(systemSettings.category, DESKTOP_RELEASE_SETTINGS_CATEGORY),
        eq(systemSettings.key, getDesktopReleaseBuildJobSettingKey(workflowRunId)),
      ))
      .limit(1);

    const valueJson = rows[0]?.valueJson;
    return parsePersistedDesktopReleaseBuildJobState(valueJson);
  } catch {
    return null;
  }
}

export function buildPersistedDesktopReleaseBuildJobStateFromRow(row: {
  valueJson: unknown;
  updatedAt: Date | string;
}): DesktopReleaseBuildHistoryItem | null {
  const state = parsePersistedDesktopReleaseBuildJobState(row.valueJson);
  if (!state) {
    return null;
  }

  try {
    return mapPersistedDesktopReleaseBuildHistoryItem(
      state,
      toIsoDateString(row.updatedAt) ?? new Date().toISOString(),
    );
  } catch {
    return null;
  }
}

async function persistDesktopReleaseBuildJobState(workflowRunId: string): Promise<void> {
  const state = buildPersistedDesktopReleaseBuildJobState(workflowRunId);
  if (!state) {
    return;
  }

  const db = getDb();
  const settingKey = getDesktopReleaseBuildJobSettingKey(workflowRunId);
  const existing = await db
    .select({ id: systemSettings.id })
    .from(systemSettings)
    .where(and(
      eq(systemSettings.category, DESKTOP_RELEASE_SETTINGS_CATEGORY),
      eq(systemSettings.key, settingKey),
    ))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(systemSettings)
      .set({
        valueJson: state as Record<string, any>,
        updatedBy: state.requestedByUserId,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, existing[0].id));
    return;
  }

  await db.insert(systemSettings).values({
    category: DESKTOP_RELEASE_SETTINGS_CATEGORY,
    key: settingKey,
    valueJson: state as Record<string, any>,
    isSensitive: false,
    updatedBy: state.requestedByUserId,
  });
}

export async function listDesktopReleaseBuildHistory(options?: { limit?: number }): Promise<DesktopReleaseBuildHistoryItem[]> {
  const db = getDb();
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 25));

  try {
    const rows = await db
      .select({
        key: systemSettings.key,
        valueJson: systemSettings.valueJson,
        updatedAt: systemSettings.updatedAt,
      })
      .from(systemSettings)
      .where(and(
        eq(systemSettings.category, DESKTOP_RELEASE_SETTINGS_CATEGORY),
        like(systemSettings.key, `${DESKTOP_RELEASE_BUILD_JOB_KEY_PREFIX}%`),
      ))
      .orderBy(desc(systemSettings.updatedAt), desc(systemSettings.id))
      .limit(limit);

    const items: DesktopReleaseBuildHistoryItem[] = [];
    const seenWorkflowRunIds = new Set<string>();
    for (const row of rows) {
      const item = buildPersistedDesktopReleaseBuildJobStateFromRow(row);
      if (item && !seenWorkflowRunIds.has(item.workflowRunId)) {
        seenWorkflowRunIds.add(item.workflowRunId);
        items.push(item);
      }
    }

    return items;
  } catch {
    return [];
  }
}

async function reconcileDesktopReleasePortalSyncJobs(): Promise<void> {
  if (desktopReleasePortalSyncReconcilerBusy) {
    return;
  }

  desktopReleasePortalSyncReconcilerBusy = true;
  try {
    const builds = await listDesktopReleaseBuildHistory({ limit: 25 });
    for (const build of builds) {
      const workflowFinishedSuccessfully =
        build.workflowRunStatus === "completed"
        && build.workflowRunConclusion === "success";
      const portalSyncFinished =
        build.portalSyncStatus === "completed" || build.portalSyncStatus === "failed";

      if (workflowFinishedSuccessfully && !portalSyncFinished) {
        void startDesktopReleasePortalSync(build.workflowRunId);
      }
    }
  } catch (error) {
    if (shouldLogDesktopReleaseBuildJobPersistenceError(error)) {
      console.warn("[desktop-release] Failed to reconcile portal sync jobs", error);
    }
  } finally {
    desktopReleasePortalSyncReconcilerBusy = false;
  }
}

function ensureDesktopReleasePortalSyncReconciler(): void {
  if (desktopReleasePortalSyncReconcilerStarted || isTestRuntime()) {
    return;
  }

  desktopReleasePortalSyncReconcilerStarted = true;
  void reconcileDesktopReleasePortalSyncJobs();
  const timer = setInterval(() => {
    void reconcileDesktopReleasePortalSyncJobs();
  }, DESKTOP_RELEASE_PORTAL_SYNC_RECONCILE_INTERVAL_MS);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

function updateDesktopReleaseWorkflowRunState(
  workflowRunId: string,
  state: {
    workflowRunUrl: string | null;
    workflowRunStatus: DesktopReleaseBuildRunStatus["workflowRunStatus"];
    workflowRunConclusion: DesktopReleaseBuildRunStatus["workflowRunConclusion"];
    workflowRunUpdatedAt: string | null;
    queuedAt?: string;
  },
): void {
  const existing = desktopReleaseWorkflowRunStates.get(workflowRunId) ?? {
    queuedAt: state.queuedAt ?? new Date().toISOString(),
    workflowRunUrl: null,
    workflowRunStatus: "queued" as const,
    workflowRunConclusion: null,
    workflowRunUpdatedAt: null,
  };
  desktopReleaseWorkflowRunStates.set(workflowRunId, {
    queuedAt: state.queuedAt ?? existing.queuedAt,
    workflowRunUrl: state.workflowRunUrl ?? existing.workflowRunUrl,
    workflowRunStatus: state.workflowRunStatus ?? existing.workflowRunStatus,
    workflowRunConclusion: state.workflowRunConclusion ?? existing.workflowRunConclusion,
    workflowRunUpdatedAt: state.workflowRunUpdatedAt ?? existing.workflowRunUpdatedAt,
  });
  void persistDesktopReleaseBuildJobState(workflowRunId).catch((error) => {
    if (shouldLogDesktopReleaseBuildJobPersistenceError(error)) {
      console.warn("[desktop-release] Failed to persist build job state", error);
    }
  });
}

async function hydrateDesktopReleaseBuildContext(workflowRunId: string): Promise<DesktopReleaseBuildSyncContext | null> {
  const inMemoryContext = desktopReleaseBuildContexts.get(workflowRunId);
  if (inMemoryContext) {
    return inMemoryContext;
  }

  const persistedState = await readPersistedDesktopReleaseBuildJobState(workflowRunId);
  if (!persistedState) {
    return null;
  }

  const context: DesktopReleaseBuildSyncContext = {
    repository: persistedState.repository,
    workflow: persistedState.workflow,
    ref: persistedState.ref,
    version: persistedState.version,
    platform: persistedState.platform,
    bundleMode: persistedState.bundleMode,
    releaseNotes: persistedState.releaseNotes,
    queuedAt: persistedState.queuedAt,
    workflowRunUrl: persistedState.workflowRunUrl,
    requestedByUserId: persistedState.requestedByUserId,
  };

  desktopReleaseBuildContexts.set(workflowRunId, context);
  desktopReleaseWorkflowRunStates.set(workflowRunId, {
    queuedAt: persistedState.queuedAt,
    workflowRunUrl: persistedState.workflowRunUrl,
    workflowRunStatus: persistedState.workflowRunStatus,
    workflowRunConclusion: persistedState.workflowRunConclusion,
    workflowRunUpdatedAt: persistedState.workflowRunUpdatedAt,
  });
  desktopReleasePortalSyncUploadedPlatforms.set(
    workflowRunId,
    new Set(persistedState.uploadedPlatforms),
  );
  desktopReleasePortalSyncStates.set(workflowRunId, {
    status: persistedState.portalSyncStatus,
    updatedAt: persistedState.portalSyncUpdatedAt,
    lastError: persistedState.portalSyncError,
    attempts: persistedState.portalSyncAttempts,
  });
  if (persistedState.portalSyncStatus === "completed") {
    desktopReleasePortalSyncCompletedRuns.add(workflowRunId);
  }

  return context;
}

function setPortalSyncState(
  workflowRunId: string,
  status: DesktopReleasePortalSyncState["status"],
  details?: {
    lastError?: string | null;
    attempts?: number | null;
  },
): void {
  const existingState = getPortalSyncState(workflowRunId);
  const hasLastErrorOverride = details && Object.prototype.hasOwnProperty.call(details, "lastError");
  const hasAttemptsOverride = details && Object.prototype.hasOwnProperty.call(details, "attempts");
  desktopReleasePortalSyncStates.set(workflowRunId, {
    status,
    updatedAt: new Date().toISOString(),
    lastError: hasLastErrorOverride ? (details?.lastError ?? null) : existingState.lastError,
    attempts: hasAttemptsOverride ? (details?.attempts ?? null) : existingState.attempts,
  });
  void persistDesktopReleaseBuildJobState(workflowRunId).catch((error) => {
    if (shouldLogDesktopReleaseBuildJobPersistenceError(error)) {
      console.warn("[desktop-release] Failed to persist build job state", error);
    }
  });
}

async function dispatchGithubWorkflowRun(
  config: GithubWorkflowConfig,
  input: {
    platform: DesktopReleaseBuildPlatform;
    bundleMode: DesktopReleaseBuildBundleMode;
    version: string;
    webUrl: string;
    releaseNotes: string;
  },
): Promise<{ workflowRunId: string | null; workflowRunUrl: string | null }> {
  const apiBase = getGithubApiBase(config.repository);
  const workflowPath = encodeURIComponent(config.workflow);
  const dispatchUrl = `${apiBase}/actions/workflows/${workflowPath}/dispatches`;

  const dispatchResponse = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      ref: config.ref,
      inputs: {
        tag: `v${input.version}`,
        platform: input.platform,
        bundle_mode: input.bundleMode,
        web_url: input.webUrl,
        release_notes: input.releaseNotes,
      },
    }),
  });

  if (!dispatchResponse.ok) {
    const body = await dispatchResponse.text().catch(() => "");
    throw new Error(body || `desktop_release_github_dispatch_failed_${dispatchResponse.status}`);
  }

  const workflowPageUrl = getGithubWorkflowPageUrl(config.repository, config.workflow);
  const startedAt = Date.now() - 1000;
  const branch = config.ref.replace(/^refs\/heads\//, "");

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const runsUrl = new URL(`${apiBase}/actions/workflows/${workflowPath}/runs`);
    runsUrl.searchParams.set("event", "workflow_dispatch");
    runsUrl.searchParams.set("branch", branch);
    runsUrl.searchParams.set("per_page", "20");

    try {
      const payload = await githubJson<{ workflow_runs?: GithubRun[] }>(runsUrl.toString(), {
        method: "GET",
        token: config.token,
      });

      const run = (payload.workflow_runs ?? []).find((candidate) => {
        const createdAt = Date.parse(candidate.created_at || "");
        return candidate.event === "workflow_dispatch"
          && candidate.head_branch === branch
          && Number.isFinite(createdAt)
          && createdAt >= startedAt;
      });

      if (run) {
        return {
          workflowRunId: String(run.id),
          workflowRunUrl: run.html_url,
        };
      }
    } catch {
      // Ignore transient discovery failures and keep polling.
    }

    await sleep(3000);
  }

  return {
    workflowRunId: null,
    workflowRunUrl: workflowPageUrl,
  };
}

function getGithubReleaseTag(version: string): string {
  return `v${version}`;
}

function isGithubNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { statusCode?: number; message?: string };
  if (candidate.statusCode === 404) {
    return true;
  }

  return typeof candidate.message === "string" && /404|not found/i.test(candidate.message);
}

function selectGithubReleaseByTag(
  releases: GithubRelease[],
  tag: string,
): GithubRelease | null {
  return releases
    .filter((release) => release.tag_name === tag)
    .sort((left, right) => {
      const leftUpdatedAt = Date.parse(left.updated_at ?? left.created_at ?? "");
      const rightUpdatedAt = Date.parse(right.updated_at ?? right.created_at ?? "");
      return (Number.isFinite(rightUpdatedAt) ? rightUpdatedAt : 0)
        - (Number.isFinite(leftUpdatedAt) ? leftUpdatedAt : 0);
    })[0] ?? null;
}

function selectGithubReleaseAsset(
  assets: GithubReleaseAsset[],
  platform: DesktopReleasePlatform,
): GithubReleaseAsset | null {
  const priorities: Record<DesktopReleasePlatform, string[]> = {
    windows: [".exe", ".msi"],
    macos: [".dmg", ".pkg"],
    linux: [".deb", ".appimage", ".rpm"],
  };

  for (const extension of priorities[platform]) {
    const match = assets
      .filter((asset) => asset.name.toLowerCase().endsWith(extension))
      .sort((left, right) => left.name.localeCompare(right.name))[0];
    if (match) {
      return match;
    }
  }

  return null;
}

async function downloadGithubReleaseAsset(
  asset: GithubReleaseAsset,
  token: string,
  destinationPath: string,
): Promise<void> {
  const response = await fetch(asset.url, {
    method: "GET",
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `github_release_asset_download_failed_${response.status}`);
  }

  if (!response.body) {
    throw new Error("github_release_asset_empty_body");
  }

  await pipeline(Readable.fromWeb(response.body as any), fs.createWriteStream(destinationPath));
}

export async function fetchGithubRelease(repository: string, token: string, tag: string): Promise<GithubRelease> {
  const apiBase = getGithubApiBase(repository);

  try {
    return await githubJson<GithubRelease>(`${apiBase}/releases/tags/${encodeURIComponent(tag)}`, {
      method: "GET",
      token,
    });
  } catch (error) {
    if (!isGithubNotFoundError(error)) {
      throw error;
    }
  }

  const releases = await githubJson<GithubRelease[]>(`${apiBase}/releases?per_page=50`, {
    method: "GET",
    token,
  });
  const fallbackRelease = selectGithubReleaseByTag(releases, tag);
  if (fallbackRelease) {
    return fallbackRelease;
  }

  throw new Error("desktop_release_github_release_not_ready");
}

async function uploadGithubReleaseAssetsToPortal(
  workflowRunId: string,
  context: DesktopReleaseBuildSyncContext,
): Promise<void> {
  const existingState = getPortalSyncState(workflowRunId);
  if (existingState.status === "completed") {
    return;
  }

  const uploadedPlatforms = desktopReleasePortalSyncUploadedPlatforms.get(workflowRunId) ?? new Set<DesktopReleasePlatform>();
  const targetPlatforms: DesktopReleasePlatform[] = context.platform === "all"
    ? ["windows", "macos", "linux"]
    : [context.platform];

  const settings = await getDesktopReleaseConfig();
  const githubToken = settings.githubToken.trim();
  if (!githubToken) {
    throw new Error("desktop_release_github_token_not_configured");
  }

  const release = await fetchGithubRelease(context.repository, githubToken, getGithubReleaseTag(context.version));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "smartaihub-desktop-release-"));

  try {
    for (const platform of targetPlatforms) {
      if (uploadedPlatforms.has(platform)) {
        continue;
      }

      const asset = selectGithubReleaseAsset(release.assets ?? [], platform);
      if (!asset) {
        throw new Error(`desktop_release_github_asset_not_found_${platform}`);
      }

      const tempFilePath = path.join(tempRoot, sanitizeTempFileName(asset.name));
      await downloadGithubReleaseAsset(asset, githubToken, tempFilePath);

      await persistDesktopReleaseUpload({
        version: context.version,
        platform,
        channel: "stable",
        installerFormat: inferInstallerFormat(asset.name),
        releaseNotes: context.releaseNotes || null,
        publish: true,
        uploadedByUserId: context.requestedByUserId,
        filePath: tempFilePath,
        fileName: asset.name,
        contentType: asset.content_type || "application/octet-stream",
      });

      uploadedPlatforms.add(platform);
      desktopReleasePortalSyncUploadedPlatforms.set(workflowRunId, uploadedPlatforms);
      void persistDesktopReleaseBuildJobState(workflowRunId).catch((error) => {
        if (shouldLogDesktopReleaseBuildJobPersistenceError(error)) {
          console.warn("[desktop-release] Failed to persist build job state", error);
        }
      });
    }

    if (uploadedPlatforms.size >= targetPlatforms.length) {
      desktopReleasePortalSyncCompletedRuns.add(workflowRunId);
      setPortalSyncState(workflowRunId, "completed", {
        lastError: null,
      });
    } else {
      setPortalSyncState(workflowRunId, "syncing", {
        lastError: null,
      });
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function startDesktopReleasePortalSync(
  workflowRunId: string,
): Promise<void> {
  const context = await hydrateDesktopReleaseBuildContext(workflowRunId);
  if (!context) {
    return;
  }

  if (desktopReleasePortalSyncCompletedRuns.has(workflowRunId)) {
    setPortalSyncState(workflowRunId, "completed");
    return;
  }
  if (desktopReleasePortalSyncActiveRuns.has(workflowRunId)) {
    return;
  }

  desktopReleasePortalSyncActiveRuns.add(workflowRunId);
  setPortalSyncState(workflowRunId, "syncing", {
    lastError: null,
  });

  void (async () => {
    let lastErrorMessage: string | null = null;
    try {
      for (let attempt = 0; attempt < DESKTOP_RELEASE_PORTAL_SYNC_MAX_ATTEMPTS; attempt += 1) {
        try {
          await uploadGithubReleaseAssetsToPortal(workflowRunId, context);
          return;
        } catch (error) {
          lastErrorMessage = error instanceof Error ? error.message : "desktop_release_portal_sync_failed";
          setPortalSyncState(workflowRunId, "syncing", {
            lastError: lastErrorMessage,
            attempts: attempt + 1,
          });
          console.warn("[desktop-release] Portal sync attempt failed", error);
        }
        await sleep(DESKTOP_RELEASE_PORTAL_SYNC_POLL_MS);
      }

      setPortalSyncState(workflowRunId, "failed", {
        lastError: lastErrorMessage ?? "desktop_release_portal_sync_failed",
        attempts: DESKTOP_RELEASE_PORTAL_SYNC_MAX_ATTEMPTS,
      });
    } finally {
      desktopReleasePortalSyncActiveRuns.delete(workflowRunId);
    }
  })();
}

export async function suggestDesktopReleaseBuildVersion(): Promise<string> {
  const catalog = await listDesktopReleaseCatalog({ includeUnpublished: true });
  return suggestNextDesktopReleaseVersion(catalog.releases[0]?.version ?? null);
}

export async function buildDesktopReleaseFromGithubAction(
  input: DesktopReleaseBuildRequest,
  options: { requestedByUserId?: number | null } = {},
): Promise<DesktopReleaseBuildResponse> {
  const parsedInput = desktopReleaseBuildRequestSchema.parse(input);
  const suggestedVersion = await suggestDesktopReleaseBuildVersion();
  const version = parseVersionOrSuggestion(parsedInput.version ?? suggestedVersion);
  const platform = desktopReleaseBuildPlatformSchema.parse(parsedInput.platform);
  const bundleMode = desktopReleaseBuildBundleModeSchema.parse(parsedInput.bundleMode);
  const releaseNotes = parsedInput.releaseNotes?.trim() ?? "";
  const settings = await getDesktopReleaseConfig();
  const repository = normalizeGithubRepository(settings.githubRepository);
  const workflow = normalizeWorkflowName(settings.githubWorkflow);
  const ref = normalizeWorkflowRef(settings.githubRef);
  const token = settings.githubToken.trim();

  if (!token) {
    throw new Error("desktop_release_github_token_not_configured");
  }

  const config: GithubWorkflowConfig = {
    repository,
    workflow,
    ref,
    token,
  };

  const { workflowRunId, workflowRunUrl } = await dispatchGithubWorkflowRun(config, {
    platform,
    bundleMode,
    version,
    webUrl: settings.webUrl,
    releaseNotes,
  });

  if (workflowRunId) {
    desktopReleaseBuildContexts.set(workflowRunId, {
      repository: config.repository,
      workflow: config.workflow,
      ref: config.ref,
      version,
      platform,
      bundleMode,
      releaseNotes,
      queuedAt: new Date().toISOString(),
      workflowRunUrl,
      requestedByUserId: options.requestedByUserId ?? null,
    });
    desktopReleasePortalSyncUploadedPlatforms.set(workflowRunId, new Set());
    updateDesktopReleaseWorkflowRunState(workflowRunId, {
      workflowRunUrl,
      workflowRunStatus: "queued",
      workflowRunConclusion: null,
      workflowRunUpdatedAt: null,
      queuedAt: desktopReleaseBuildContexts.get(workflowRunId)?.queuedAt ?? new Date().toISOString(),
    });
    setPortalSyncState(workflowRunId, "idle");
  }

  return desktopReleaseBuildResponseSchema.parse({
    repository: config.repository,
    workflow: config.workflow,
    ref: config.ref,
    version,
    platform,
    bundleMode,
    releaseNotes: releaseNotes || null,
    queuedAt: new Date().toISOString(),
    workflowRunId,
    workflowRunUrl,
    workflowUrl: getGithubWorkflowPageUrl(config.repository, config.workflow),
  });
}

export async function getDesktopReleaseBuildRunStatus(workflowRunId: string) {
  await hydrateDesktopReleaseBuildContext(workflowRunId);

  const settings = await getDesktopReleaseConfig();
  const repository = normalizeGithubRepository(settings.githubRepository);
  const token = settings.githubToken.trim();

  if (!token) {
    throw new Error("desktop_release_github_token_not_configured");
  }

  const apiBase = getGithubApiBase(repository);
  const run = await githubJson<GithubWorkflowRun>(`${apiBase}/actions/runs/${encodeURIComponent(workflowRunId)}`, {
    method: "GET",
    token,
  });

  updateDesktopReleaseWorkflowRunState(workflowRunId, {
    workflowRunUrl: run.html_url || null,
    workflowRunStatus: normalizeWorkflowRunStatus(run.status),
    workflowRunConclusion: normalizeWorkflowRunConclusion(run.conclusion),
    workflowRunUpdatedAt: toIsoDateString(run.updated_at),
  });

  const normalizedWorkflowStatus = normalizeWorkflowRunStatus(run.status);
  const normalizedWorkflowConclusion = normalizeWorkflowRunConclusion(run.conclusion);

  if (normalizedWorkflowStatus === "completed" && normalizedWorkflowConclusion === "success") {
    if (!isTestRuntime()) {
      void startDesktopReleasePortalSync(workflowRunId);
    }
  } else {
    const portalSyncState = getPortalSyncState(workflowRunId);
    if (portalSyncState.status !== "idle" || portalSyncState.lastError || portalSyncState.attempts) {
      setPortalSyncState(workflowRunId, "idle", {
        lastError: null,
        attempts: null,
      });
    }
  }

  const portalSyncState = getPortalSyncState(workflowRunId);
  if (portalSyncState.status === "completed" && portalSyncState.lastError) {
    setPortalSyncState(workflowRunId, "completed", {
      lastError: null,
      attempts: portalSyncState.attempts,
    });
  }
  const normalizedPortalSyncState = getPortalSyncState(workflowRunId);

  return desktopReleaseBuildRunStatusSchema.parse({
    workflowRunId: String(run.id),
    workflowRunUrl: run.html_url || null,
    workflowRunStatus: normalizedWorkflowStatus,
    workflowRunConclusion: normalizedWorkflowConclusion,
    workflowRunUpdatedAt: toIsoDateString(run.updated_at),
    portalSyncStatus: normalizedPortalSyncState.status,
    portalSyncUpdatedAt: normalizedPortalSyncState.updatedAt,
    portalSyncError: normalizedPortalSyncState.lastError,
    portalSyncAttempts: normalizedPortalSyncState.attempts,
  });
}

if (!isTestRuntime()) {
  void Promise.resolve().then(() => {
    ensureDesktopReleasePortalSyncReconciler();
  });
}
