import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Express, Request, Response } from "express";
import multer from "multer";

import { sdk } from "../_core/sdk";
import {
  getLatestRunnerRelease,
  listRunnerReleaseCatalog,
  persistRunnerReleaseAssetFromPath,
  RunnerReleaseError,
  streamRunnerReleaseAsset,
  updateRunnerReleasePublication,
} from "../services/runnerReleaseService";
import {
  getRunnerReleaseBuildStatus,
  listRunnerReleaseBuilds,
  RunnerReleaseBuildError,
  startRunnerReleaseBuild,
  syncRunnerReleaseBuild,
} from "../services/runnerReleaseBuildService";
import { runnerReleaseBuildRequestSchema } from "../../shared/runnerReleaseBuilds";
import {
  runnerReleaseCatalogQuerySchema,
  runnerReleaseIdentitySchema,
} from "../../shared/runnerReleases";

const uploadDirectory = path.join(os.tmpdir(), "smartspec-runner-release-uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({
  dest: uploadDirectory,
  limits: { fileSize: 750 * 1024 * 1024 },
});

function sendError(res: Response, error: unknown): void {
  if (error instanceof RunnerReleaseError) {
    res.status(error.statusCode).json({ error: error.code });
    return;
  }
  if (error instanceof RunnerReleaseBuildError) {
    res.status(error.statusCode).json({ error: error.code });
    return;
  }
  if (error && typeof error === "object" && "issues" in error) {
    res.status(400).json({ error: "runner_release_request_invalid" });
    return;
  }
  res.status(500).json({ error: "runner_release_request_failed" });
}

async function requireAdmin(req: Request, res: Response): Promise<{ id: number; role: string } | null> {
  const user = await sdk.authenticateRequest(req).catch(() => null);
  const id = Number((user as any)?.id);
  const role = String((user as any)?.role ?? "");
  if (!user) {
    res.status(401).json({ error: "runner_release_admin_auth_required" });
    return null;
  }
  if (!['admin', 'domain_admin', 'system_agent'].includes(role)) {
    res.status(403).json({ error: "runner_release_admin_forbidden" });
    return null;
  }
  if (!Number.isInteger(id) || id <= 0) {
    res.status(401).json({ error: "runner_release_admin_identity_invalid" });
    return null;
  }
  return { id, role };
}

function parseId(value: string): number | null {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function rangeHeader(req: Request): string | undefined {
  const value = req.headers.range;
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function sendAsset(res: Response, req: Request, id: number): Promise<void> {
  const result = await streamRunnerReleaseAsset(id, rangeHeader(req));
  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${result.fileName.replace(/"/g, "\\\"")}"`);
  if (result.contentLength !== undefined) res.setHeader("Content-Length", String(result.contentLength));
  if (result.totalLength !== undefined) res.setHeader("Accept-Ranges", "bytes");
  if (result.etag) res.setHeader("ETag", result.etag);
  if (result.lastModified) res.setHeader("Last-Modified", result.lastModified.toUTCString());
  if (result.isPartial) {
    res.status(206);
    if (result.rangeStart !== undefined && result.rangeEnd !== undefined && result.totalLength !== undefined) {
      res.setHeader("Content-Range", `bytes ${result.rangeStart}-${result.rangeEnd}/${result.totalLength}`);
    }
  }
  const stream = result.stream as any;
  if (typeof stream.pipe === "function") {
    stream.on("error", () => {
      if (!res.headersSent) res.status(500).json({ error: "runner_release_download_failed" });
    });
    stream.pipe(res);
    return;
  }
  const reader = stream.getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    res.write(Buffer.from(chunk.value));
  }
  res.end();
}

export function registerRunnerReleaseRoutes(app: Express): void {
  app.get("/api/runner-releases", async (req, res) => {
    try {
      const query = runnerReleaseCatalogQuerySchema.parse({
        platform: typeof req.query.platform === "string" ? req.query.platform : undefined,
        architecture: typeof req.query.architecture === "string" ? req.query.architecture : undefined,
        profile: typeof req.query.profile === "string" ? req.query.profile : undefined,
        channel: typeof req.query.channel === "string" ? req.query.channel : undefined,
      });
      return res.json(await listRunnerReleaseCatalog(query));
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get("/api/runner-releases/latest", async (req, res) => {
    try {
      const query = runnerReleaseCatalogQuerySchema.parse(req.query);
      if (!query.platform || !query.architecture || !query.profile) {
        return res.status(400).json({ error: "runner_release_target_required" });
      }
      return res.json(await getLatestRunnerRelease(query));
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get("/api/runner-releases/:id/download", async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "runner_release_id_invalid" });
    try {
      await sendAsset(res, req, id);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/runner-releases/admin/assets", upload.single("file"), async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const tempPath = req.file?.path;
    if (!tempPath) return res.status(400).json({ error: "runner_release_file_missing" });
    try {
      const identity = runnerReleaseIdentitySchema.parse(JSON.parse(String(req.body.identity ?? "{}")));
      const release = await persistRunnerReleaseAssetFromPath({
        identity,
        filePath: tempPath,
        fileName: req.file.originalname,
        contentType: req.file.mimetype,
        signature: typeof req.body.signature === "string" ? req.body.signature : null,
        provenance: JSON.parse(String(req.body.provenance ?? "{}")),
        releaseNotes: typeof req.body.releaseNotes === "string" ? req.body.releaseNotes : null,
        uploadedByUserId: admin.id,
        publish: req.body.publish === "true",
      });
      return res.status(201).json(release);
    } catch (error) {
      return sendError(res, error);
    } finally {
      fs.rm(tempPath, { force: true }, () => undefined);
    }
  });

  app.post("/api/runner-releases/admin/builds", async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      const input = runnerReleaseBuildRequestSchema.parse(req.body);
      return res.status(202).json(await startRunnerReleaseBuild(input, admin.id));
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get("/api/runner-releases/admin/builds", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      return res.json({ builds: await listRunnerReleaseBuilds() });
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get("/api/runner-releases/admin/builds/:buildId", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      return res.json(await getRunnerReleaseBuildStatus(req.params.buildId));
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post("/api/runner-releases/admin/builds/:buildId/sync", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      return res.json(await syncRunnerReleaseBuild(req.params.buildId));
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post("/api/runner-releases/admin/:id/publish", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "runner_release_id_invalid" });
    try {
      return res.json(await updateRunnerReleasePublication(id, { publish: true }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post("/api/runner-releases/admin/:id/withdraw", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "runner_release_id_invalid" });
    try {
      return res.json(await updateRunnerReleasePublication(id, { withdraw: true }));
    } catch (error) {
      return sendError(res, error);
    }
  });
}
