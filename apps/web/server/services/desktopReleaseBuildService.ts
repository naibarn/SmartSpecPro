import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import { listDesktopReleaseCatalog, persistDesktopReleaseUpload } from "./desktopReleaseService";
import {
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
  normalizeDesktopReleaseVersion,
  suggestNextDesktopReleaseVersion,
  type DesktopReleaseBuildRequest,
  type DesktopReleaseBuildResponse,
  type DesktopReleaseBuildBundleMode,
  type DesktopReleaseBuildPlatform,
} from "../../shared/desktopReleaseBuilds";
import type { DesktopReleaseInstallerFormat, DesktopReleasePlatform } from "../../shared/desktopReleases";

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
  assets: GithubReleaseAsset[];
};

type DesktopReleaseBuildSyncContext = {
  repository: string;
  token: string;
  version: string;
  platform: DesktopReleaseBuildPlatform;
  bundleMode: DesktopReleaseBuildBundleMode;
  releaseNotes: string;
  requestedByUserId: number | null;
};

type DesktopReleasePortalSyncState = {
  status: (typeof desktopReleaseBuildPortalSyncValues)[number];
  updatedAt: string | null;
};

const desktopReleaseBuildContexts = new Map<string, DesktopReleaseBuildSyncContext>();
const desktopReleasePortalSyncStates = new Map<string, DesktopReleasePortalSyncState>();
const desktopReleasePortalSyncActiveRuns = new Set<string>();
const desktopReleasePortalSyncCompletedRuns = new Set<string>();
const desktopReleasePortalSyncUploadedPlatforms = new Map<string, Set<DesktopReleasePlatform>>();
const DESKTOP_RELEASE_PORTAL_SYNC_MAX_ATTEMPTS = 120;
const DESKTOP_RELEASE_PORTAL_SYNC_POLL_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
    throw new Error(body || `github_api_request_failed_${response.status}`);
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
  };
}

function setPortalSyncState(
  workflowRunId: string,
  status: DesktopReleasePortalSyncState["status"],
): void {
  desktopReleasePortalSyncStates.set(workflowRunId, {
    status,
    updatedAt: new Date().toISOString(),
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

async function fetchGithubRelease(repository: string, token: string, tag: string): Promise<GithubRelease> {
  const apiBase = getGithubApiBase(repository);
  return githubJson<GithubRelease>(`${apiBase}/releases/tags/${encodeURIComponent(tag)}`, {
    method: "GET",
    token,
  });
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

  const release = await fetchGithubRelease(context.repository, context.token, getGithubReleaseTag(context.version));
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
      await downloadGithubReleaseAsset(asset, context.token, tempFilePath);

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
    }

    if (uploadedPlatforms.size >= targetPlatforms.length) {
      desktopReleasePortalSyncCompletedRuns.add(workflowRunId);
      setPortalSyncState(workflowRunId, "completed");
    } else {
      setPortalSyncState(workflowRunId, "syncing");
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function startDesktopReleasePortalSync(
  workflowRunId: string,
): Promise<void> {
  if (desktopReleasePortalSyncCompletedRuns.has(workflowRunId)) {
    setPortalSyncState(workflowRunId, "completed");
    return;
  }
  if (desktopReleasePortalSyncActiveRuns.has(workflowRunId)) {
    return;
  }

  const context = desktopReleaseBuildContexts.get(workflowRunId);
  if (!context) {
    return;
  }

  desktopReleasePortalSyncActiveRuns.add(workflowRunId);
  setPortalSyncState(workflowRunId, "syncing");

  void (async () => {
    try {
      for (let attempt = 0; attempt < DESKTOP_RELEASE_PORTAL_SYNC_MAX_ATTEMPTS; attempt += 1) {
        try {
          await uploadGithubReleaseAssetsToPortal(workflowRunId, context);
          return;
        } catch (error) {
          console.warn("[desktop-release] Portal sync attempt failed", error);
        }
        await sleep(DESKTOP_RELEASE_PORTAL_SYNC_POLL_MS);
      }

      setPortalSyncState(workflowRunId, "failed");
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
      token: config.token,
      version,
      platform,
      bundleMode,
      releaseNotes,
      requestedByUserId: options.requestedByUserId ?? null,
    });
    setPortalSyncState(workflowRunId, "idle");
    if (process.env.NODE_ENV !== "test") {
      void startDesktopReleasePortalSync(workflowRunId);
    }
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

  if (normalizeWorkflowRunStatus(run.status) === "completed" && normalizeWorkflowRunConclusion(run.conclusion) === "success") {
    if (process.env.NODE_ENV !== "test") {
      void startDesktopReleasePortalSync(workflowRunId);
    }
  }

  const portalSyncState = getPortalSyncState(workflowRunId);

  return desktopReleaseBuildRunStatusSchema.parse({
    workflowRunId: String(run.id),
    workflowRunUrl: run.html_url || null,
    workflowRunStatus: normalizeWorkflowRunStatus(run.status),
    workflowRunConclusion: normalizeWorkflowRunConclusion(run.conclusion),
    workflowRunUpdatedAt: toIsoDateString(run.updated_at),
    portalSyncStatus: portalSyncState.status,
    portalSyncUpdatedAt: portalSyncState.updatedAt,
  });
}
