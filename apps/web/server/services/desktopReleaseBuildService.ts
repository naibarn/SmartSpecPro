import { getCachedPublicAppUrl } from "./appRuntimeConfig";
import { listDesktopReleaseCatalog } from "./desktopReleaseService";
import {
  desktopReleaseBuildBundleModeSchema,
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

const DEFAULT_GITHUB_WORKFLOW = "desktop-release.yml";
const DEFAULT_GITHUB_REF = "main";
const DEFAULT_GITHUB_REPOSITORY = "";

type GithubWorkflowConfig = {
  repository: string;
  workflow: string;
  ref: string;
  token: string;
  webUrl: string;
};

type GithubRun = {
  id: number;
  html_url: string;
  created_at: string;
  head_branch: string | null;
  event: string;
};

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

function resolveGithubToken(): string {
  return (
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_TOKEN
    || process.env.DESKTOP_RELEASE_GITHUB_TOKEN
    || process.env.GITHUB_TOKEN
    || process.env.GH_TOKEN
    || ""
  ).trim();
}

function resolveGithubRepository(): string {
  return normalizeGithubRepository(
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REPOSITORY
    || process.env.DESKTOP_RELEASE_GITHUB_REPOSITORY
    || process.env.GITHUB_REPOSITORY
    || DEFAULT_GITHUB_REPOSITORY,
  );
}

function resolveGithubWorkflow(): string {
  return normalizeWorkflowName(
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_WORKFLOW
    || process.env.DESKTOP_RELEASE_GITHUB_WORKFLOW
    || DEFAULT_GITHUB_WORKFLOW,
  );
}

function resolveGithubRef(): string {
  return normalizeWorkflowRef(
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REF
    || process.env.DESKTOP_RELEASE_GITHUB_REF
    || DEFAULT_GITHUB_REF,
  );
}

function resolveDesktopReleaseWebUrl(): string {
  const candidate =
    getCachedPublicAppUrl()
    || process.env.SMARTAIHUB_DESKTOP_PUBLIC_URL
    || process.env.VITE_SMARTAIHUB_WEB_URL
    || process.env.SMARTSPEC_DESKTOP_PUBLIC_URL
    || process.env.VITE_SMARTSPEC_WEB_URL
    || process.env.APP_PUBLIC_URL
    || process.env.PUBLIC_URL
    || "https://smartaihub.app";

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("desktop_release_invalid_web_url");
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("desktop_release_invalid_web_url");
  }
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

async function dispatchGithubWorkflowRun(
  config: GithubWorkflowConfig,
  input: {
    version: string;
    platform: DesktopReleaseBuildPlatform;
    bundleMode: DesktopReleaseBuildBundleMode;
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
        version: input.version,
        tag: `v${input.version}`,
        platform: input.platform,
        bundle_mode: input.bundleMode,
        web_url: config.webUrl,
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

export async function suggestDesktopReleaseBuildVersion(): Promise<string> {
  const catalog = await listDesktopReleaseCatalog({ includeUnpublished: true });
  return suggestNextDesktopReleaseVersion(catalog.releases[0]?.version ?? null);
}

export async function buildDesktopReleaseFromGithubAction(
  input: DesktopReleaseBuildRequest,
): Promise<DesktopReleaseBuildResponse> {
  const parsedInput = desktopReleaseBuildRequestSchema.parse(input);
  const config: GithubWorkflowConfig = {
    repository: resolveGithubRepository(),
    workflow: resolveGithubWorkflow(),
    ref: resolveGithubRef(),
    token: resolveGithubToken(),
    webUrl: resolveDesktopReleaseWebUrl(),
  };

  if (!config.token) {
    throw new Error("desktop_release_github_token_not_configured");
  }

  const suggestedVersion = await suggestDesktopReleaseBuildVersion();
  const version = parseVersionOrSuggestion(parsedInput.version ?? suggestedVersion);
  const platform = desktopReleaseBuildPlatformSchema.parse(parsedInput.platform);
  const bundleMode = desktopReleaseBuildBundleModeSchema.parse(parsedInput.bundleMode);
  const releaseNotes = parsedInput.releaseNotes?.trim() ?? "";

  const { workflowRunId, workflowRunUrl } = await dispatchGithubWorkflowRun(config, {
    version,
    platform,
    bundleMode,
    releaseNotes,
  });

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
