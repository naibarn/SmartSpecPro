import crypto from "crypto";
import { and, eq } from "drizzle-orm";

import { systemSettings } from "../../drizzle/schema";
import { signBearerToken } from "../_core/tokens";
import { getDb } from "../db";
import { decrypt, encrypt } from "./crypto";
import type {
  DesktopReleaseBuildBundleMode,
  DesktopReleaseBuildPlatform,
} from "../../shared/desktopReleaseBuilds";

export const DESKTOP_RELEASE_SETTINGS_CATEGORY = "desktop_release" as const;

const DEFAULT_GITHUB_WORKFLOW = "desktop-release.yml";
const DEFAULT_GITHUB_REF = "main";
const DEFAULT_WEB_URL = "https://smartaihub.app";

export type DesktopReleaseSettingSource = "db" | "env" | "none";

export type DesktopReleaseConfig = {
  githubRepository: string;
  githubRepositorySource: DesktopReleaseSettingSource;
  githubWorkflow: string;
  githubWorkflowSource: DesktopReleaseSettingSource;
  githubRef: string;
  githubRefSource: DesktopReleaseSettingSource;
  webUrl: string;
  webUrlSource: DesktopReleaseSettingSource;
  githubToken: string;
  githubTokenConfigured: boolean;
  githubTokenSource: DesktopReleaseSettingSource;
};

export type DesktopReleaseConfigUpdateInput = {
  githubRepository: string;
  githubWorkflow: string;
  githubRef: string;
  webUrl: string;
  githubToken?: string | null;
};

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

function normalizeDesktopReleaseWebUrl(value: string): string {
  const candidate = value.trim() || DEFAULT_WEB_URL;
  const url = new URL(candidate);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("desktop_release_invalid_web_url");
  }
  return url.toString().replace(/\/+$/, "");
}

function readRowValue(row?: { value: string | null; isSensitive: boolean | null }): string {
  if (!row?.value) return "";
  return row.isSensitive ? (decrypt(row.value) || "") : row.value;
}

function resolveField(
  row: { value: string | null; isSensitive: boolean | null } | undefined,
  envFallback: string,
  fallback: string,
): { value: string; source: DesktopReleaseSettingSource } {
  const dbValue = readRowValue(row);
  if (dbValue) {
    return { value: dbValue, source: "db" };
  }
  if (envFallback.trim()) {
    return { value: envFallback.trim(), source: "env" };
  }
  return { value: fallback, source: "none" };
}

async function readDesktopReleaseRows() {
  const db = await getDb();
  if (!db) {
    return [];
  }

  return db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.category, DESKTOP_RELEASE_SETTINGS_CATEGORY));
}

async function upsertDesktopReleaseSetting(params: {
  key: string;
  value: string;
  sensitive?: boolean;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const existing = await db
    .select()
    .from(systemSettings)
    .where(and(
      eq(systemSettings.category, DESKTOP_RELEASE_SETTINGS_CATEGORY),
      eq(systemSettings.key, params.key),
    ))
    .limit(1);

  const storedValue = params.sensitive ? encrypt(params.value) : params.value;

  if (existing.length > 0) {
    await db
      .update(systemSettings)
      .set({
        value: storedValue,
        isSensitive: params.sensitive ?? existing[0].isSensitive,
        updatedBy: params.userId,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.id, existing[0].id));
    return;
  }

  await db.insert(systemSettings).values({
    category: DESKTOP_RELEASE_SETTINGS_CATEGORY,
    key: params.key,
    value: storedValue,
    isSensitive: params.sensitive ?? false,
    updatedBy: params.userId,
  });
}

export async function getDesktopReleaseConfig(): Promise<DesktopReleaseConfig> {
  const rows = await readDesktopReleaseRows();
  const rowMap = new Map(rows.map((row) => [row.key, row]));

  const githubRepositoryEnv = (
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REPOSITORY
    || process.env.DESKTOP_RELEASE_GITHUB_REPOSITORY
    || process.env.GITHUB_REPOSITORY
    || ""
  );
  const githubWorkflowEnv = (
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_WORKFLOW
    || process.env.DESKTOP_RELEASE_GITHUB_WORKFLOW
    || ""
  );
  const githubRefEnv = (
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REF
    || process.env.DESKTOP_RELEASE_GITHUB_REF
    || ""
  );
  const webUrlEnv = (
    process.env.SMARTAIHUB_DESKTOP_PUBLIC_URL
    || process.env.VITE_SMARTAIHUB_WEB_URL
    || process.env.SMARTSPEC_DESKTOP_PUBLIC_URL
    || process.env.VITE_SMARTSPEC_WEB_URL
    || process.env.APP_PUBLIC_URL
    || process.env.PUBLIC_URL
    || ""
  );
  const githubTokenEnv = (
    process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_TOKEN
    || process.env.DESKTOP_RELEASE_GITHUB_TOKEN
    || process.env.GITHUB_TOKEN
    || process.env.GH_TOKEN
    || ""
  );

  const githubRepository = resolveField(
    rowMap.get("github_repository") as { value: string | null; isSensitive: boolean | null } | undefined,
    githubRepositoryEnv,
    "",
  );
  const githubWorkflow = resolveField(
    rowMap.get("github_workflow") as { value: string | null; isSensitive: boolean | null } | undefined,
    githubWorkflowEnv,
    DEFAULT_GITHUB_WORKFLOW,
  );
  const githubRef = resolveField(
    rowMap.get("github_ref") as { value: string | null; isSensitive: boolean | null } | undefined,
    githubRefEnv,
    DEFAULT_GITHUB_REF,
  );
  const webUrl = resolveField(
    rowMap.get("web_url") as { value: string | null; isSensitive: boolean | null } | undefined,
    webUrlEnv,
    DEFAULT_WEB_URL,
  );
  const githubTokenRow = rowMap.get("github_token") as { value: string | null; isSensitive: boolean | null } | undefined;
  const githubTokenValue = readRowValue(githubTokenRow);

  if (githubTokenValue) {
    return {
      githubRepository: githubRepository.value.trim(),
      githubRepositorySource: githubRepository.source,
      githubWorkflow: githubWorkflow.value.trim() || DEFAULT_GITHUB_WORKFLOW,
      githubWorkflowSource: githubWorkflow.source,
      githubRef: githubRef.value.trim() || DEFAULT_GITHUB_REF,
      githubRefSource: githubRef.source,
      webUrl: webUrl.value.trim() || DEFAULT_WEB_URL,
      webUrlSource: webUrl.source,
      githubToken: githubTokenValue,
      githubTokenConfigured: true,
      githubTokenSource: "db",
    };
  }

  if (githubTokenEnv.trim()) {
    return {
      githubRepository: githubRepository.value.trim(),
      githubRepositorySource: githubRepository.source,
      githubWorkflow: githubWorkflow.value.trim() || DEFAULT_GITHUB_WORKFLOW,
      githubWorkflowSource: githubWorkflow.source,
      githubRef: githubRef.value.trim() || DEFAULT_GITHUB_REF,
      githubRefSource: githubRef.source,
      webUrl: webUrl.value.trim() || DEFAULT_WEB_URL,
      webUrlSource: webUrl.source,
      githubToken: githubTokenEnv.trim(),
      githubTokenConfigured: true,
      githubTokenSource: "env",
    };
  }

  return {
    githubRepository: githubRepository.value.trim(),
    githubRepositorySource: githubRepository.source,
    githubWorkflow: githubWorkflow.value.trim() || DEFAULT_GITHUB_WORKFLOW,
    githubWorkflowSource: githubWorkflow.source,
    githubRef: githubRef.value.trim() || DEFAULT_GITHUB_REF,
    githubRefSource: githubRef.source,
    webUrl: webUrl.value.trim() || DEFAULT_WEB_URL,
    webUrlSource: webUrl.source,
    githubToken: "",
    githubTokenConfigured: false,
    githubTokenSource: githubTokenRow ? "db" : "none",
  };
}

export async function updateDesktopReleaseConfig(
  input: DesktopReleaseConfigUpdateInput,
  userId?: number,
): Promise<DesktopReleaseConfig> {
  const githubRepository = normalizeGithubRepository(input.githubRepository);
  const githubWorkflow = normalizeWorkflowName(input.githubWorkflow);
  const githubRef = normalizeWorkflowRef(input.githubRef);
  const webUrl = normalizeDesktopReleaseWebUrl(input.webUrl);

  await upsertDesktopReleaseSetting({
    key: "github_repository",
    value: githubRepository,
    userId,
  });
  await upsertDesktopReleaseSetting({
    key: "github_workflow",
    value: githubWorkflow,
    userId,
  });
  await upsertDesktopReleaseSetting({
    key: "github_ref",
    value: githubRef,
    userId,
  });
  await upsertDesktopReleaseSetting({
    key: "web_url",
    value: webUrl,
    userId,
  });

  if (typeof input.githubToken === "string") {
    const token = input.githubToken.trim();
    if (token) {
      await upsertDesktopReleaseSetting({
        key: "github_token",
        value: token,
        userId,
        sensitive: true,
      });
    }
  }

  return getDesktopReleaseConfig();
}

export function createDesktopReleaseUploadToken(input: {
  version: string;
  platform: DesktopReleaseBuildPlatform;
  bundleMode: DesktopReleaseBuildBundleMode;
  expiresIn?: Parameters<typeof signBearerToken>[1];
}): string {
  return signBearerToken(
    {
      sub: `desktop-release-upload:${input.version}:${input.platform}:${input.bundleMode}`,
      type: "desktop_release_upload",
      aud: "desktop-release-portal",
      scopes: ["desktop_release:upload"],
      jti: `desktop_release_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`,
    },
    input.expiresIn ?? "8h",
  );
}
