import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, sql } from "drizzle-orm";
import yauzl from "yauzl";
import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  compareDesktopReleaseVersions,
  ensureDesktopReleaseSchema,
  listDesktopReleaseCatalog,
  persistDesktopReleaseUpload,
} from "./desktopReleaseService";
import { getDesktopReleaseConfig } from "./desktopReleaseSettings";

const CATEGORY = "worker_app_release_build";
const WORKFLOW = "worker-app-windows-release.yml";
const ARTIFACT = "smart-ai-hub-worker-app-windows-x64";
const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024;
const MAX_INSTALLER_BYTES = 600 * 1024 * 1024;
const active = new Set<string>();

type Build = {
  id: string;
  repository: string;
  version: string;
  sourceSha: string;
  requestedBy: number;
  createdAt: string;
  status: "queued" | "building" | "syncing" | "published" | "failed";
  runId: string | null;
  runUrl: string | null;
  error: string | null;
};

type Run = {
  id: number;
  html_url: string;
  status: string;
  conclusion: string | null;
  display_title: string;
  event: string;
  head_branch: string;
};
type Artifact = {
  id: number;
  name: string;
  expired: boolean;
  size_in_bytes: number;
  digest?: string;
};

function api(repository: string, suffix: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw new Error("worker_build_repository_invalid");
  return `https://api.github.com/repos/${repository}/${suffix}`;
}
async function github(
  url: string,
  token: string,
  init: RequestInit = {}
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok)
    throw new Error(`worker_build_github_http_${response.status}`);
  return response;
}
async function config() {
  const value = await getDesktopReleaseConfig();
  if (
    !value.githubRepository ||
    !value.githubTokenConfigured ||
    !value.githubToken
  )
    throw new Error("worker_build_github_not_configured");
  return { repository: value.githubRepository, token: value.githubToken };
}
async function save(
  build: Build,
  database?: ReturnType<typeof getDb>
): Promise<void> {
  const db = database ?? getDb();
  const rows = await db
    .select({ id: systemSettings.id })
    .from(systemSettings)
    .where(
      and(
        eq(systemSettings.category, CATEGORY),
        eq(systemSettings.key, build.id)
      )
    )
    .limit(1);
  if (rows[0])
    await db
      .update(systemSettings)
      .set({ valueJson: build, updatedAt: new Date() })
      .where(eq(systemSettings.id, rows[0].id));
  else
    await db
      .insert(systemSettings)
      .values({
        category: CATEGORY,
        key: build.id,
        valueJson: build,
        updatedBy: build.requestedBy,
      });
}
export async function listWorkerAppBuilds(
  database?: ReturnType<typeof getDb>
): Promise<Build[]> {
  const rows = await (database ?? getDb())
    .select({ value: systemSettings.valueJson })
    .from(systemSettings)
    .where(eq(systemSettings.category, CATEGORY))
    .orderBy(desc(systemSettings.createdAt))
    .limit(25);
  return rows
    .map(row => row.value as Build)
    .filter(
      build =>
        build &&
        typeof build.id === "string" &&
        typeof build.version === "string"
    );
}
function nextVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error("worker_build_version_invalid");
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}
export async function startWorkerAppBuild(
  requestedBy: number,
  latestVersion: string | null
): Promise<Build> {
  const { repository, token } = await config();
  const prepared = await getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(57194282)`);
    const database = tx as unknown as ReturnType<typeof getDb>;
    const existing = (await listWorkerAppBuilds(database)).find(item =>
      ["queued", "building", "syncing"].includes(item.status)
    );
    if (existing) return { build: existing, dispatch: false };
    const ref = (await (
      await github(api(repository, "git/ref/heads/main"), token)
    ).json()) as { object?: { sha?: string } };
    const sourceSha = ref.object?.sha ?? "";
    if (!/^[a-f0-9]{40}$/i.test(sourceSha))
      throw new Error("worker_build_source_invalid");
    const content = (await (
      await github(
        api(
          repository,
          `contents/apps/worker-app/package.json?ref=${sourceSha}`
        ),
        token
      )
    ).json()) as { content?: string; encoding?: string };
    if (content.encoding !== "base64" || !content.content)
      throw new Error("worker_build_package_invalid");
    const pkg = JSON.parse(
      Buffer.from(content.content, "base64").toString("utf8")
    ) as { version?: string };
    if (!pkg.version || !/^\d+\.\d+\.\d+$/.test(pkg.version))
      throw new Error("worker_build_version_invalid");
    const base =
      latestVersion &&
      compareDesktopReleaseVersions(latestVersion, pkg.version) > 0
        ? latestVersion
        : pkg.version;
    const build: Build = {
      id: crypto.randomUUID(),
      repository,
      version: nextVersion(base),
      sourceSha,
      requestedBy,
      createdAt: new Date().toISOString(),
      status: "queued",
      runId: null,
      runUrl: null,
      error: null,
    };
    await save(build, database);
    return { build, dispatch: true };
  });
  const { build } = prepared;
  if (!prepared.dispatch) return build;
  try {
    await github(
      api(repository, `actions/workflows/${WORKFLOW}/dispatches`),
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            release_version: build.version,
            build_id: build.id,
            source_sha: build.sourceSha,
            publish_direct: "false",
          },
        }),
      }
    );
  } catch (error) {
    build.status = "failed";
    build.error = "worker_build_dispatch_failed";
    await save(build);
    throw error;
  }
  return build;
}

async function downloadArtifact(
  repository: string,
  token: string,
  artifact: Artifact,
  destination: string
): Promise<void> {
  if (
    !artifact.digest?.match(/^sha256:[a-f0-9]{64}$/i) ||
    artifact.size_in_bytes > MAX_ARCHIVE_BYTES
  )
    throw new Error("worker_build_artifact_metadata_invalid");
  const response = await github(
    api(repository, `actions/artifacts/${artifact.id}/zip`),
    token,
    { signal: AbortSignal.timeout(300_000) }
  );
  if (!response.body) throw new Error("worker_build_artifact_empty");
  const hash = crypto.createHash("sha256");
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > MAX_ARCHIVE_BYTES)
        return callback(new Error("worker_build_artifact_too_large"));
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as any),
    limiter,
    fs.createWriteStream(destination)
  );
  if (`sha256:${hash.digest("hex")}` !== artifact.digest.toLowerCase())
    throw new Error("worker_build_artifact_digest_mismatch");
}
async function extractArtifact(
  zipPath: string,
  build: Build,
  installerPath: string
): Promise<string> {
  const expectedName = `smart-ai-hub-worker-app-${build.version}-x64-setup.exe`;
  const zip = await yauzl.openPromise(zipPath, {
    autoClose: false,
    decodeStrings: true,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  let manifest: any = null;
  let installerSha = "";
  let installerSize = 0;
  const names = new Set<string>();
  try {
    for await (const entry of zip.eachEntry()) {
      if (
        names.has(entry.fileName) ||
        ![expectedName, "worker-release-manifest.json"].includes(entry.fileName)
      )
        throw new Error("worker_build_archive_entries_invalid");
      names.add(entry.fileName);
      if (entry.fileName === "worker-release-manifest.json") {
        if (entry.uncompressedSize > 16384)
          throw new Error("worker_build_manifest_too_large");
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of await zip.openReadStreamPromise(entry)) {
          size += chunk.length;
          if (size > 16384) throw new Error("worker_build_manifest_too_large");
          chunks.push(Buffer.from(chunk));
        }
        manifest = JSON.parse(
          Buffer.concat(chunks)
            .toString("utf8")
            .replace(/^\uFEFF/, "")
        );
      } else {
        if (
          entry.uncompressedSize < 2 ||
          entry.uncompressedSize > MAX_INSTALLER_BYTES
        )
          throw new Error("worker_build_installer_size_invalid");
        const hash = crypto.createHash("sha256");
        let head = Buffer.alloc(0);
        const inspect = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            installerSize += chunk.length;
            if (installerSize > MAX_INSTALLER_BYTES)
              return callback(new Error("worker_build_installer_too_large"));
            if (head.length < 2)
              head = Buffer.concat([head, chunk]).subarray(0, 2);
            hash.update(chunk);
            callback(null, chunk);
          },
        });
        await pipeline(
          await zip.openReadStreamPromise(entry),
          inspect,
          fs.createWriteStream(installerPath)
        );
        if (head[0] !== 0x4d || head[1] !== 0x5a)
          throw new Error("worker_build_installer_not_windows");
        installerSha = hash.digest("hex");
      }
    }
  } finally {
    zip.close();
  }
  if (
    names.size !== 2 ||
    !manifest ||
    manifest.product !== "smart-ai-hub-worker-app" ||
    manifest.platform !== "windows-x64" ||
    manifest.version !== build.version ||
    manifest.fileName !== expectedName ||
    manifest.sizeBytes !== installerSize ||
    manifest.sha256 !== installerSha ||
    manifest.sourceCommit !== build.sourceSha ||
    String(manifest.workflowRunId) !== build.runId ||
    manifest.buildId !== build.id
  )
    throw new Error("worker_build_manifest_mismatch");
  return installerSha;
}
async function publishArtifact(build: Build, token: string): Promise<void> {
  const artifacts = (await (
    await github(
      api(
        build.repository,
        `actions/runs/${build.runId}/artifacts?per_page=100`
      ),
      token
    )
  ).json()) as { artifacts?: Artifact[] };
  const matches = (artifacts.artifacts ?? []).filter(
    item => item.name === ARTIFACT && !item.expired
  );
  if (matches.length !== 1) throw new Error("worker_build_artifact_missing");
  const dir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "worker-app-release-")
  );
  const zipPath = path.join(dir, "artifact.zip");
  const filePath = path.join(dir, "installer.exe");
  try {
    await downloadArtifact(build.repository, token, matches[0], zipPath);
    const hash = await extractArtifact(zipPath, build, filePath);
    // Serialize promotions across web processes; a retry must not create duplicates.
    await ensureDesktopReleaseSchema();
    await getDb().transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(57194283)`);
      const database = tx as unknown as ReturnType<typeof getDb>;
      const catalog = await listDesktopReleaseCatalog(
        { includeUnpublished: true, platform: "windows", product: "worker" },
        database
      );
      const existing = catalog.releases.find(
        item => item.version === build.version
      );
      if (existing) {
        if (existing.fileSha256 !== hash || !existing.isPublished)
          throw new Error("worker_build_version_conflict");
        return;
      }
      const latest = catalog.releases.find(item => item.isPublished);
      if (
        latest &&
        compareDesktopReleaseVersions(build.version, latest.version) <= 0
      )
        throw new Error("worker_build_version_not_newer");
      await persistDesktopReleaseUpload(
        {
          version: build.version,
          platform: "windows",
          channel: "stable",
          installerFormat: "exe",
          publish: true,
          uploadedByUserId: build.requestedBy,
          filePath,
          fileName: `smart-ai-hub-worker-app-${build.version}-x64-setup.exe`,
          contentType: "application/vnd.microsoft.portable-executable",
        },
        database
      );
    });
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}
export async function reconcileWorkerAppBuild(id: string): Promise<Build> {
  const build = (await listWorkerAppBuilds()).find(item => item.id === id);
  if (!build) throw new Error("worker_build_not_found");
  if (build.status === "published" || active.has(id)) return build;
  active.add(id);
  try {
    const { repository, token } = await config();
    if (repository !== build.repository)
      throw new Error("worker_build_repository_changed");
    const payload = (await (
      await github(
        api(
          repository,
          `actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=100`
        ),
        token
      )
    ).json()) as { workflow_runs?: Run[] };
    const run = (payload.workflow_runs ?? []).find(
      item =>
        item.event === "workflow_dispatch" &&
        item.head_branch === "main" &&
        item.display_title.endsWith(` · ${build.id}`)
    );
    if (!run) {
      if (Date.now() - Date.parse(build.createdAt) > 15 * 60_000)
        throw new Error("worker_build_run_not_found");
      return build;
    }
    build.runId = String(run.id);
    build.runUrl = run.html_url;
    if (run.status !== "completed") {
      build.status = "building";
      build.error = null;
      await save(build);
      return build;
    }
    if (run.conclusion !== "success")
      throw new Error("worker_build_workflow_failed");
    build.status = "syncing";
    build.error = null;
    await save(build);
    await publishArtifact(build, token);
    build.status = "published";
    build.error = null;
    await save(build);
    return build;
  } catch (error) {
    build.status = "failed";
    build.error =
      error instanceof Error && /^worker_build_[a-z0-9_]+$/.test(error.message)
        ? error.message
        : "worker_build_sync_failed";
    await save(build);
    return build;
  } finally {
    active.delete(id);
  }
}
let reconcilerStarted = false;
export function startWorkerAppBuildReconciler(): void {
  if (
    reconcilerStarted ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST
  )
    return;
  reconcilerStarted = true;
  const reconcile = async () => {
    try {
      for (const build of await listWorkerAppBuilds())
        if (["queued", "building", "syncing"].includes(build.status))
          void reconcileWorkerAppBuild(build.id);
    } catch (error) {
      console.warn("[worker-app-build] Reconciliation failed", error);
    }
  };
  void reconcile();
  const timer = setInterval(() => void reconcile(), 60_000);
  timer.unref();
}
