import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { and, eq, desc } from "drizzle-orm";

import { runnerReleaseBuilds } from "../../drizzle/schema";
import { runnerReleaseBuildRequestSchema, type RunnerReleaseBuildRequest } from "../../shared/runnerReleaseBuilds";
import { getDb } from "../db";
import { getDesktopReleaseConfig } from "./desktopReleaseSettings";
import { persistRunnerReleaseAssetFromPath, RunnerReleaseError } from "./runnerReleaseService";

export class RunnerReleaseBuildError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 400) {
    super(code);
    this.name = "RunnerReleaseBuildError";
  }
}

function iso(value: Date): string { return value.toISOString(); }

function mapBuild(row: typeof runnerReleaseBuilds.$inferSelect) {
  return {
    id: row.id,
    version: row.version,
    releaseId: row.releaseId,
    repository: row.repository,
    workflow: row.workflow,
    ref: row.ref,
    publish: row.publish,
    status: row.status,
    syncStatus: row.syncStatus,
    workflowRunId: row.workflowRunId,
    workflowRunUrl: row.workflowRunUrl,
    syncError: row.syncError,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function githubFetch(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new RunnerReleaseBuildError(`github_request_failed_${response.status}`, response.status >= 500 ? 503 : 502);
  return response;
}

function githubApiUrl(repository: string, suffix: string): string {
  return `https://api.github.com/repos/${repository}/${suffix.replace(/^\//, "")}`;
}

export async function startRunnerReleaseBuild(input: RunnerReleaseBuildRequest, requestedBy: number) {
  const request = runnerReleaseBuildRequestSchema.parse(input);
  const config = await getDesktopReleaseConfig();
  if (!config.githubRepository || !config.githubTokenConfigured) throw new RunnerReleaseBuildError("runner_release_github_not_configured", 503);
  const workflow = config.runnerGithubWorkflow || "runner-release.yml";
  const db = getDb();
  const [existing] = await db.select().from(runnerReleaseBuilds).where(and(
    eq(runnerReleaseBuilds.repository, config.githubRepository),
    eq(runnerReleaseBuilds.releaseId, request.releaseId),
  )).limit(1);
  if (existing && ["queued", "in_progress"].includes(existing.status)) return mapBuild(existing);
  if (existing && existing.status !== "failed") {
    throw new RunnerReleaseBuildError("runner_release_build_exists", 409);
  }

  const buildId = existing?.id ?? crypto.randomUUID();
  const [build] = existing
    ? await db.update(runnerReleaseBuilds).set({
      workflow,
      ref: request.ref,
      version: request.version,
      platform: request.platform,
      profile: request.profile,
      releaseNotes: request.releaseNotes,
      publish: request.publish,
      requestedBy,
      status: "queued",
      syncStatus: "idle",
      syncError: null,
      workflowRunId: null,
      workflowRunUrl: null,
      updatedAt: new Date(),
    }).where(eq(runnerReleaseBuilds.id, existing.id)).returning()
    : await db.insert(runnerReleaseBuilds).values({
      id: buildId,
      repository: config.githubRepository,
      workflow,
      ref: request.ref,
      version: request.version,
      platform: request.platform,
      profile: request.profile,
      releaseId: request.releaseId,
      releaseNotes: request.releaseNotes,
      publish: request.publish,
      requestedBy,
      status: "queued",
      syncStatus: "idle",
    }).returning();
  try {
    await githubFetch(githubApiUrl(config.githubRepository, `actions/workflows/${encodeURIComponent(workflow)}/dispatches`), config.githubToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: request.ref, inputs: {
        ref: request.ref,
        version: request.version,
        platform: request.platform,
        profile: request.profile,
        publish: String(request.publish),
        release_id: request.releaseId,
        release_notes: request.releaseNotes,
        signing_mode: request.signingMode,
      } }),
    });
    return mapBuild(build);
  } catch (error) {
    await db.update(runnerReleaseBuilds).set({ status: "failed", syncError: "github_dispatch_failed", updatedAt: new Date() }).where(eq(runnerReleaseBuilds.id, buildId));
    throw error;
  }
}

export async function getRunnerReleaseBuildStatus(id: string) {
  const db = getDb();
  const [build] = await db.select().from(runnerReleaseBuilds).where(eq(runnerReleaseBuilds.id, id)).limit(1);
  if (!build) throw new RunnerReleaseBuildError("runner_release_build_not_found", 404);
  const config = await getDesktopReleaseConfig();
  if (config.githubTokenConfigured && build.repository === config.githubRepository) {
    try {
      const response = await githubFetch(githubApiUrl(build.repository, `actions/workflows/${encodeURIComponent(build.workflow)}/runs?event=workflow_dispatch&per_page=20`), config.githubToken);
      const payload = await response.json() as { workflow_runs?: Array<{ id: number; html_url: string; status: string; conclusion: string | null; head_sha: string }> };
      const run = payload.workflow_runs?.find(candidate => candidate.head_sha && candidate.id >= Number(build.workflowRunId ?? 0)) ?? payload.workflow_runs?.[0];
      if (run && (!build.workflowRunId || String(run.id) !== build.workflowRunId || build.status !== run.status)) {
        const [updated] = await db.update(runnerReleaseBuilds).set({
          workflowRunId: String(run.id),
          workflowRunUrl: run.html_url,
          status: run.status === "completed" ? (run.conclusion === "success" ? "completed" : "failed") : "in_progress",
          updatedAt: new Date(),
        }).where(eq(runnerReleaseBuilds.id, id)).returning();
        return mapBuild(updated);
      }
    } catch {
      // Keep the last durable state; the next bounded poll can retry GitHub.
    }
  }
  return mapBuild(build);
}

function assetTarget(fileName: string): { platform: "windows" | "macos" | "linux"; architecture: "x64" | "arm64"; kind: "package" | "update_binary" | "checksums" } | null {
  const lower = fileName.toLowerCase();
  const target = lower.includes("windows-x86_64") ? { platform: "windows" as const, architecture: "x64" as const } : lower.includes("macos-x86_64") ? { platform: "macos" as const, architecture: "x64" as const } : (lower.includes("macos-arm64") || lower.includes("macos-aarch64")) ? { platform: "macos" as const, architecture: "arm64" as const } : lower.includes("linux-x86_64") ? { platform: "linux" as const, architecture: "x64" as const } : null;
  if (!target) return null;
  const kind = lower.endsWith(".zip") || lower.endsWith(".tar.gz") ? "package" : lower.includes("sha256sums") ? "checksums" : lower.includes("manifest") ? null : "update_binary";
  return kind ? { ...target, kind } : null;
}

export async function syncRunnerReleaseBuild(id: string) {
  const db = getDb();
  const [build] = await db.select().from(runnerReleaseBuilds).where(eq(runnerReleaseBuilds.id, id)).limit(1);
  if (!build) throw new RunnerReleaseBuildError("runner_release_build_not_found", 404);
  if (!build.publish) throw new RunnerReleaseBuildError("runner_release_catalog_sync_not_requested", 409);
  const config = await getDesktopReleaseConfig();
  if (!config.githubTokenConfigured) throw new RunnerReleaseBuildError("runner_release_github_not_configured", 503);
  await db.update(runnerReleaseBuilds).set({ syncStatus: "syncing", syncError: null, updatedAt: new Date() }).where(eq(runnerReleaseBuilds.id, id));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sah-runner-sync-"));
  try {
    const releaseResponse = await githubFetch(githubApiUrl(build.repository, `releases/tags/runner-v${build.releaseId}`), config.githubToken);
    const release = await releaseResponse.json() as { tag_name: string; target_commitish: string; assets?: Array<{ name: string; url: string; browser_download_url: string }> };
    const assets = release.assets ?? [];
    const signatures = new Map<string, string>();
    for (const signatureAsset of assets.filter(asset => asset.name.endsWith(".sig"))) {
      const signatureResponse = await githubFetch(signatureAsset.url, config.githubToken, { headers: { Accept: "application/octet-stream" } });
      signatures.set(signatureAsset.name.slice(0, -4), (await signatureResponse.text()).trim());
    }
    const imported: string[] = [];
    for (const githubAsset of assets) {
      if (githubAsset.name.endsWith(".sig")) continue;
      if (githubAsset.name === "smartaihub-runner-container-manifest.json") {
        const download = await githubFetch(githubAsset.url, config.githubToken, { headers: { Accept: "application/octet-stream" } });
        const filePath = path.join(tempDir, "smartaihub-runner-container-manifest.json");
        const bytes = Buffer.from(await download.arrayBuffer());
        await fs.writeFile(filePath, bytes);
        let manifest: { sourceCommit?: string } = {};
        try { manifest = JSON.parse(bytes.toString("utf8")) as { sourceCommit?: string }; } catch { /* persist hash even if the JSON is legacy */ }
        try {
          await persistRunnerReleaseAssetFromPath({
            identity: { version: build.version, platform: "container", architecture: "multi", profile: "shared_container", channel: "stable", assetKind: "manifest" },
            filePath,
            fileName: githubAsset.name,
            contentType: "application/json",
            provenance: { sourceCommit: manifest.sourceCommit || release.target_commitish || "unknown", releaseTag: release.tag_name, workflowRunId: build.workflowRunId, signatureAlgorithm: null },
            contractVersion: "sah-runner-v1",
            manifest,
            releaseNotes: build.releaseNotes,
            uploadedByUserId: build.requestedBy,
            publish: build.publish,
          });
        } catch (error) {
          if (!(error instanceof RunnerReleaseError) || error.code !== "runner_release_identity_exists") throw error;
        }
        imported.push("shared_container:manifest");
        continue;
      }
      const target = assetTarget(githubAsset.name);
      if (!target) continue;
      if (target.kind === "update_binary" && !signatures.has(githubAsset.name)) {
        throw new RunnerReleaseBuildError("runner_release_update_signature_missing", 502);
      }
      const download = await githubFetch(githubAsset.url, config.githubToken, { headers: { Accept: "application/octet-stream" } });
      const filePath = path.join(tempDir, githubAsset.name.replace(/[^a-zA-Z0-9._-]/g, "-"));
      await fs.writeFile(filePath, Buffer.from(await download.arrayBuffer()));
      try {
        await persistRunnerReleaseAssetFromPath({
          identity: { version: build.version, platform: target.platform, architecture: target.architecture, profile: "local_device", channel: "stable", assetKind: target.kind },
          filePath,
          fileName: githubAsset.name,
          provenance: { sourceCommit: release.target_commitish || "unknown", releaseTag: release.tag_name, workflowRunId: build.workflowRunId, signatureAlgorithm: signatures.has(githubAsset.name) ? "rsa-sha256" : null },
          contractVersion: "sah-runner-v1",
          signature: signatures.get(githubAsset.name) ?? null,
          releaseNotes: build.releaseNotes,
          uploadedByUserId: build.requestedBy,
          publish: build.publish,
        });
      } catch (error) {
        if (!(error instanceof RunnerReleaseError) || error.code !== "runner_release_identity_exists") throw error;
      }
      imported.push(`${target.platform}:${target.architecture}:${target.kind}`);
    }
    const expected = new Set<string>();
    if (build.profile === "all" || build.profile === "local_device") {
      const targets = build.platform === "all"
        ? [["windows", "x64"], ["macos", "x64"], ["macos", "arm64"], ["linux", "x64"]]
        : build.platform === "windows" ? [["windows", "x64"]]
          : build.platform === "macos-intel" ? [["macos", "x64"]]
          : build.platform === "macos-arm64" ? [["macos", "arm64"]]
              : [["linux", "x64"]];
      for (const [platform, architecture] of targets) {
        expected.add(`${platform}:${architecture}:package`);
        expected.add(`${platform}:${architecture}:update_binary`);
        expected.add(`${platform}:${architecture}:checksums`);
      }
    }
    if (build.profile === "all" || build.profile === "shared_container") expected.add("shared_container:manifest");
    if (imported.length === 0 || [...expected].some(key => !imported.includes(key))) throw new RunnerReleaseBuildError("runner_release_partial_assets", 502);
    const [updated] = await db.update(runnerReleaseBuilds).set({ status: "completed", syncStatus: "completed", updatedAt: new Date() }).where(eq(runnerReleaseBuilds.id, id)).returning();
    return mapBuild(updated);
  } catch (error) {
    await db.update(runnerReleaseBuilds).set({ syncStatus: "failed", syncError: error instanceof RunnerReleaseBuildError ? error.code : "runner_release_sync_failed", updatedAt: new Date() }).where(eq(runnerReleaseBuilds.id, id));
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function listRunnerReleaseBuilds(limit = 20) {
  const rows = await getDb().select().from(runnerReleaseBuilds).orderBy(desc(runnerReleaseBuilds.updatedAt)).limit(Math.min(Math.max(limit, 1), 100));
  return rows.map(mapBuild);
}
