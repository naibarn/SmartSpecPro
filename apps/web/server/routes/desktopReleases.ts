import { Router } from "express";
import fs from "fs";
import os from "os";
import path from "path";

import multer from "multer";

import { hasScope, verifyBearerToken } from "../_core/tokens";
import { sdk } from "../_core/sdk";
import { getUploadsDir, storageGet, storageResolveUrl, storageStreamFile } from "../storage";
import {
  deleteDesktopReleaseRecord,
  getDesktopReleaseStorageInfo,
  listDesktopReleaseCatalog,
  persistDesktopReleaseUpload,
  updateDesktopReleaseRecord,
} from "../services/desktopReleaseService";
import {
  desktopReleaseAssetSchema,
  desktopReleaseCatalogResponseSchema,
  desktopReleaseUploadRequestSchema,
} from "../../shared/desktopReleases";
import {
  desktopReleaseBuildRequestSchema,
  desktopReleaseBuildRunStatusSchema,
  desktopReleaseBuildResponseSchema,
} from "../../shared/desktopReleaseBuilds";
import {
  buildDesktopReleaseFromGithubAction,
  getDesktopReleaseBuildRunStatus,
  suggestDesktopReleaseBuildVersion,
} from "../services/desktopReleaseBuildService";

const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), "smartspec-desktop-releases");
const MAX_RELEASE_FILE_SIZE_BYTES = 600 * 1024 * 1024;

fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });

function sanitizeUploadFileName(value: string): string {
  return path.basename(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 180) || "installer.bin";
}

function isDesktopReleaseAdminRole(role?: string | null): boolean {
  return role === "admin" || role === "domain_admin" || role === "system_agent";
}

function readDesktopReleaseToken(req: any): string {
  const headerToken = req.headers["x-desktop-release-token"] ?? req.headers["x-desktop-release-token".toLowerCase()];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }

  const authorization = req.headers.authorization;
  if (typeof authorization === "string") {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

async function isValidDesktopReleaseToken(token: string): Promise<boolean> {
  if (!token) {
    return false;
  }

  try {
    const claims = await verifyBearerToken(token);
    const audience = claims.aud;
    const hasExpectedAudience =
      audience === "desktop-release-portal"
      || (Array.isArray(audience) && audience.includes("desktop-release-portal"));

    return claims.type === "desktop_release_upload"
      && hasExpectedAudience
      && hasScope(claims.scopes, "desktop_release:upload");
  } catch {
    return false;
  }
}

async function authenticateDesktopReleaseUser(req: any): Promise<{
  userId: number;
  role: string | null;
  email: string | null;
  name: string | null;
} | null> {
  const user = await sdk.authenticateRequest(req).catch(() => null);
  if (!user) {
    return null;
  }

  return {
    userId: Number(user.id),
    role: typeof user.role === "string" ? user.role : null,
    email: user.email ?? null,
    name: user.name ?? null,
  };
}

async function authenticateDesktopReleaseUploader(req: any): Promise<{
  userId: number | null;
  role: string | null;
  email: string | null;
  name: string | null;
} | null> {
  const viewer = await authenticateDesktopReleaseUser(req);
  if (viewer && isDesktopReleaseAdminRole(viewer.role)) {
    return viewer;
  }

  const token = readDesktopReleaseToken(req);
  if (await isValidDesktopReleaseToken(token)) {
    return {
      userId: null,
      role: "system_agent",
      email: null,
      name: "SmartAIHub Desktop Release Pipeline",
    };
  }

  return null;
}

function ensureUploadTempFile(req: any, res: any): string | null {
  const file = (req as any).file as any | undefined;
  if (!file?.path) {
    res.status(400).json({ error: "desktop_release_file_missing" });
    return null;
  }
  return file.path;
}

function cleanupUploadTempFile(req: any): void {
  const file = (req as any).file as any | undefined;
  if (file?.path) {
    fs.unlink(file.path, () => undefined);
  }
}

function buildDownloadDisposition(fileName: string): string {
  return `attachment; filename="${fileName.replace(/"/g, '\\"')}"`;
}

function determineRangeHeader(req: any): string | undefined {
  const range = req.headers.range;
  return typeof range === "string" && range.trim().length > 0 ? range : undefined;
}

function detectPlatformQuery(value: unknown): "windows" | "macos" | "linux" | null {
  if (value === "windows" || value === "macos" || value === "linux") {
    return value;
  }
  return null;
}

export function createDesktopReleaseRouter(): Router {
  const router = Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: TEMP_UPLOAD_DIR,
      filename: (_req, file, callback) => {
        callback(null, `${Date.now()}-${sanitizeUploadFileName(file.originalname)}`);
      },
    }),
    limits: {
      fileSize: MAX_RELEASE_FILE_SIZE_BYTES,
    },
  });

  router.get("/", async (req, res) => {
    try {
      const viewer = await authenticateDesktopReleaseUser(req);
      if (!viewer) {
        res.status(401).json({ error: "desktop_release_unauthorized" });
        return;
      }

      const includeUnpublished = isDesktopReleaseAdminRole(viewer.role);
      const platform = detectPlatformQuery(req.query.platform);

      const catalog = await listDesktopReleaseCatalog({
        includeUnpublished,
        platform,
      });

      res.json(desktopReleaseCatalogResponseSchema.parse(catalog));
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "failed_to_list_desktop_releases",
      });
    }
  });

  router.get("/latest", async (req, res) => {
    try {
      const viewer = await authenticateDesktopReleaseUser(req);
      if (!viewer) {
        res.status(401).json({ error: "desktop_release_unauthorized" });
        return;
      }

      const platform = detectPlatformQuery(req.query.platform);
      const catalog = await listDesktopReleaseCatalog({
        includeUnpublished: isDesktopReleaseAdminRole(viewer.role),
        platform,
      });

      res.json({
        generatedAt: catalog.generatedAt,
        latest: platform ? catalog.latestByPlatform[platform] : catalog.latestByPlatform,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "failed_to_resolve_latest_desktop_release",
      });
    }
  });

  router.post("/builds", async (req, res) => {
    try {
      const viewer = await authenticateDesktopReleaseUser(req);
      if (!viewer) {
        res.status(401).json({ error: "desktop_release_unauthorized" });
        return;
      }
      if (viewer.role !== "admin") {
        res.status(403).json({ error: "desktop_release_forbidden" });
        return;
      }

      const parsed = desktopReleaseBuildRequestSchema.parse(req.body ?? {});
      const buildRequest = {
        ...parsed,
        version: parsed.version ?? (await suggestDesktopReleaseBuildVersion()),
      };

      const build = await buildDesktopReleaseFromGithubAction(buildRequest, {
        requestedByUserId: viewer.userId,
      });
      res.status(202).json({
        build: desktopReleaseBuildResponseSchema.parse(build),
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "failed_to_dispatch_desktop_release_build",
      });
    }
  });

  router.get("/builds/:runId/status", async (req, res) => {
    try {
      const viewer = await authenticateDesktopReleaseUser(req);
      if (!viewer) {
        res.status(401).json({ error: "desktop_release_unauthorized" });
        return;
      }
      if (viewer.role !== "admin") {
        res.status(403).json({ error: "desktop_release_forbidden" });
        return;
      }

      const runId = String(req.params.runId ?? "").trim();
      if (!runId) {
        res.status(400).json({ error: "desktop_release_invalid_run_id" });
        return;
      }

      const status = await getDesktopReleaseBuildRunStatus(runId);
      res.json({
        buildRun: desktopReleaseBuildRunStatusSchema.parse(status),
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "failed_to_fetch_desktop_release_build_status",
      });
    }
  });

  router.get("/:id/download", async (req, res) => {
    try {
      const viewer = await authenticateDesktopReleaseUser(req);
      if (!viewer) {
        res.status(401).json({ error: "desktop_release_unauthorized" });
        return;
      }

      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "desktop_release_invalid_id" });
        return;
      }

      const release = await getDesktopReleaseStorageInfo(id);
      if (!release) {
        res.status(404).json({ error: "desktop_release_not_found" });
        return;
      }
      if (!release.isPublished && !isDesktopReleaseAdminRole(viewer.role)) {
        res.status(404).json({ error: "desktop_release_not_found" });
        return;
      }

      const storageUrl = await storageResolveUrl(release.storageKey);
      if (storageUrl?.startsWith("/uploads/")) {
        const filePath = path.join(getUploadsDir(), storageUrl.replace("/uploads/", ""));
        if (!fs.existsSync(filePath)) {
          res.status(404).json({ error: "desktop_release_not_found" });
          return;
        }

        res.setHeader("Content-Disposition", buildDownloadDisposition(release.fileName));
        res.setHeader("Content-Type", release.contentType);
        res.setHeader("Cache-Control", "private, max-age=300");
        res.setHeader("X-Content-Type-Options", "nosniff");
        const stream = fs.createReadStream(filePath);
        stream.on("error", () => {
          if (!res.headersSent) {
            res.status(500).json({ error: "desktop_release_download_failed" });
          }
        });
        stream.pipe(res);
        return;
      }

      if (storageUrl?.startsWith("/api/storage/files/")) {
        const result = await storageStreamFile(release.storageKey, determineRangeHeader(req));
        if (!result) {
          res.status(404).json({ error: "desktop_release_not_found" });
          return;
        }

        res.setHeader("Content-Disposition", buildDownloadDisposition(release.fileName));
        res.setHeader("Content-Type", release.contentType || result.contentType);
        res.setHeader("Cache-Control", "private, max-age=300");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("X-Content-Type-Options", "nosniff");

        if (result.isPartial && result.rangeStart !== undefined && result.rangeEnd !== undefined) {
          res.status(206);
          const total = result.totalLength ?? "*";
          res.setHeader("Content-Range", `bytes ${result.rangeStart}-${result.rangeEnd}/${total}`);
          if (result.contentLength) {
            res.setHeader("Content-Length", String(result.contentLength));
          }
        } else if (result.contentLength) {
          res.setHeader("Content-Length", String(result.contentLength));
        }

        const nodeStream = result.stream as NodeJS.ReadableStream;
        if (typeof (nodeStream as any).pipe === "function") {
          (nodeStream as any).pipe(res);
        } else {
          const reader = (result.stream as ReadableStream).getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              break;
            }
            res.write(value);
          }
        }
        return;
      }

      const fallback = await storageGet(release.storageKey).catch(() => null);
      if (fallback?.url) {
        res.redirect(fallback.url);
        return;
      }

      res.status(500).json({ error: "desktop_release_download_unavailable" });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "failed_to_download_desktop_release",
      });
    }
  });

  router.post(
    "/upload",
    async (req: any, res: any, next: any) => {
      const viewer = await authenticateDesktopReleaseUploader(req);
      if (!viewer) {
        res.status(401).json({ error: "desktop_release_unauthorized" });
        return;
      }
      if (!isDesktopReleaseAdminRole(viewer.role)) {
        res.status(403).json({ error: "desktop_release_forbidden" });
        return;
      }
      res.locals.desktopReleaseViewer = viewer;
      next();
    },
    upload.single("file") as any,
    async (req, res) => {
      try {
        const viewer = res.locals.desktopReleaseViewer as {
          userId: number | null;
          role: string | null;
          email: string | null;
          name: string | null;
        } | null;
        if (!viewer) {
          res.status(401).json({ error: "desktop_release_unauthorized" });
          return;
        }
        const filePath = ensureUploadTempFile(req, res);
        if (!filePath) {
          return;
        }

        const file = (req as any).file as any;
        const parsed = desktopReleaseUploadRequestSchema.parse({
          version: req.body?.version,
          platform: req.body?.platform,
          channel: req.body?.channel,
          installerFormat: req.body?.installerFormat,
          releaseNotes: req.body?.releaseNotes,
          publish: req.body?.publish,
        });

        const release = await persistDesktopReleaseUpload({
          ...parsed,
          uploadedByUserId: viewer.userId,
          filePath,
          fileName: file.originalname,
          contentType: file.mimetype || "application/octet-stream",
        });

        res.status(201).json({
          release: desktopReleaseAssetSchema.parse(release),
        });
      } catch (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : "failed_to_upload_desktop_release",
        });
      } finally {
        cleanupUploadTempFile(req);
      }
    },
  );

  router.patch("/:id", async (req, res) => {
    try {
      const viewer = await authenticateDesktopReleaseUser(req);
      if (!viewer) {
        res.status(401).json({ error: "desktop_release_unauthorized" });
        return;
      }
      if (!isDesktopReleaseAdminRole(viewer.role)) {
        res.status(403).json({ error: "desktop_release_forbidden" });
        return;
      }

      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "desktop_release_invalid_id" });
        return;
      }

      const release = await updateDesktopReleaseRecord(id, req.body ?? {});
      if (!release) {
        res.status(404).json({ error: "desktop_release_not_found" });
        return;
      }

      res.json({ release: desktopReleaseAssetSchema.parse(release) });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "failed_to_update_desktop_release",
      });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      const viewer = await authenticateDesktopReleaseUser(req);
      if (!viewer) {
        res.status(401).json({ error: "desktop_release_unauthorized" });
        return;
      }
      if (!isDesktopReleaseAdminRole(viewer.role)) {
        res.status(403).json({ error: "desktop_release_forbidden" });
        return;
      }

      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "desktop_release_invalid_id" });
        return;
      }

      const deleted = await deleteDesktopReleaseRecord(id);
      if (!deleted) {
        res.status(404).json({ error: "desktop_release_not_found" });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "failed_to_delete_desktop_release",
      });
    }
  });

  router.use((error: any, _req: any, res: any, _next: any) => {
    cleanupUploadTempFile(_req);
    if (error?.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error: `File too large. Maximum ${(MAX_RELEASE_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB.`,
      });
      return;
    }
    if (error?.message?.includes("Unexpected field")) {
      res.status(400).json({ error: "desktop_release_file_field_invalid" });
      return;
    }
    res.status(500).json({
      error: error instanceof Error ? error.message : "desktop_release_upload_failed",
    });
  });

  return router;
}

export function registerDesktopReleaseRoutes(app: any): void {
  app.use("/api/desktop-releases", createDesktopReleaseRouter());
}
