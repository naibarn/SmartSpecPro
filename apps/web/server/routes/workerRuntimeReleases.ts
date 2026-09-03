import fs from "fs";
import os from "os";
import path from "path";

import { Router } from "express";
import multer from "multer";

import { sdk } from "../_core/sdk";
import { enforceJsonBodyMaxBytes, rateLimit } from "../_core/limits";
import {
  finalizeWorkerRuntimeReleaseUpload,
  listWorkerRuntimeReleaseCatalog,
  persistWorkerRuntimeReleaseUploadFromPath,
  presignWorkerRuntimeReleaseUpload,
  publishWorkerRuntimeRelease,
  withdrawWorkerRuntimeRelease,
  WorkerRuntimeReleaseError,
  MAX_WORKER_RUNTIME_RELEASE_BYTES,
} from "../services/workerRuntimeReleaseService";
import {
  getWorkerRuntimeSigningKey,
  setWorkerRuntimeSigningPublicKey,
  WorkerRuntimeSigningKeyError,
} from "../services/workerRuntimeSigningKeyService";
import {
  workerRuntimeReleaseActionSchema,
  workerRuntimeReleaseAssetSchema,
  workerRuntimeReleaseCatalogSchema,
  workerRuntimeReleaseFinalizeSchema,
  workerRuntimeReleaseUploadSchema,
  workerRuntimeSigningKeyCatalogSchema,
  workerRuntimeSigningKeyUpdateSchema,
  type WorkerRuntimeReleaseFinalize,
  type WorkerRuntimeReleaseUpload,
} from "../../shared/workerRuntimeReleases";

const TEMP_UPLOAD_DIR = path.join(
  os.tmpdir(),
  "smartspec-worker-runtime-release-uploads"
);
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });

function sendError(res: any, error: unknown): void {
  const databaseError = error as { code?: string; message?: string } | null;
  if (
    databaseError?.code === "42P01" ||
    databaseError?.message?.includes(
      'relation "worker_runtime_releases" does not exist'
    )
  ) {
    res.status(503).json({
      error: {
        code: "worker_runtime_database_not_ready",
        message:
          "Worker Runtime release database is not ready. Apply the Worker Runtime migration before using release history or upload.",
      },
    });
    return;
  }
  if (
    error instanceof WorkerRuntimeReleaseError ||
    error instanceof WorkerRuntimeSigningKeyError
  ) {
    const details =
      error instanceof WorkerRuntimeReleaseError
        ? (error.details ?? null)
        : null;
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details,
      },
    });
    return;
  }
  if (error && typeof error === "object" && "issues" in error) {
    const issues = Array.isArray((error as any).issues)
      ? (error as any).issues
      : [];
    res.status(400).json({
      error: {
        code: "invalid_request",
        message:
          issues
            .map((issue: any) => issue?.message)
            .filter(Boolean)
            .join("; ") || "Invalid request",
      },
    });
    return;
  }
  res.status(500).json({
    error: {
      code: "worker_runtime_release_failed",
      message:
        error instanceof Error
          ? error.message
          : "Worker runtime release operation failed",
    },
  });
}

async function requireSystemAdmin(req: any, res: any): Promise<number | null> {
  const user = await sdk.authenticateRequest(req).catch(() => null);
  const userId = Number((user as any)?.id);
  if (!user) {
    res.status(401).json({
      error: {
        code: "worker_runtime_admin_unauthorized",
        message: "Sign in as a system administrator.",
      },
    });
    return null;
  }
  if ((user as any).role !== "admin") {
    res.status(403).json({
      error: {
        code: "worker_runtime_admin_forbidden",
        message: "Only system administrators may manage Worker App runtimes.",
      },
    });
    return null;
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(401).json({
      error: {
        code: "worker_runtime_admin_identity_invalid",
        message: "Administrator identity is invalid.",
      },
    });
    return null;
  }
  return userId;
}

function cleanupFile(req: any): void {
  const filePath = req.file?.path;
  if (typeof filePath === "string")
    fs.rm(filePath, { force: true }, () => undefined);
}

function uploadMiddleware(upload: multer.Multer): any {
  return (req: any, res: any, next: any) =>
    upload.single("file")(req, res, (error: unknown) => {
      if (error) {
        const code =
          (error as any)?.code === "LIMIT_FILE_SIZE"
            ? "worker_runtime_archive_too_large"
            : "worker_runtime_upload_failed";
        res
          .status(code === "worker_runtime_archive_too_large" ? 413 : 400)
          .json({
            error: {
              code,
              message:
                error instanceof Error
                  ? error.message
                  : "Runtime upload failed",
            },
          });
        return;
      }
      next();
    });
}

export function createWorkerRuntimeReleaseRouter(): Router {
  const router = Router();
  const limiter = rateLimit("worker-runtime-release-admin", { rpm: 30 });
  const upload = multer({
    storage: multer.diskStorage({
      destination: TEMP_UPLOAD_DIR,
      filename: (_req, file, callback) =>
        callback(
          null,
          `${Date.now()}-${path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]+/g, "-")}`
        ),
    }),
    limits: { fileSize: MAX_WORKER_RUNTIME_RELEASE_BYTES },
  });

  router.use(limiter);

  router.get("/signing-key", async (req, res) => {
    if ((await requireSystemAdmin(req, res)) === null) return;
    try {
      res.json(
        workerRuntimeSigningKeyCatalogSchema.parse(
          await getWorkerRuntimeSigningKey()
        )
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  router.put(
    "/signing-key",
    enforceJsonBodyMaxBytes(32 * 1024),
    async (req, res) => {
      const userId = await requireSystemAdmin(req, res);
      if (userId === null) return;
      try {
        const input = workerRuntimeSigningKeyUpdateSchema.parse(req.body ?? {});
        res.json(
          workerRuntimeSigningKeyCatalogSchema.parse(
            await setWorkerRuntimeSigningPublicKey({
              publicKey: input.publicKey,
              updatedBy: userId,
            })
          )
        );
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get("/releases", async (req, res) => {
    if ((await requireSystemAdmin(req, res)) === null) return;
    try {
      res.json(
        workerRuntimeReleaseCatalogSchema.parse(
          await listWorkerRuntimeReleaseCatalog({ includeUnpublished: true })
        )
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post(
    "/releases/upload-url",
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      if ((await requireSystemAdmin(req, res)) === null) return;
      try {
        const input = workerRuntimeReleaseUploadSchema.parse(
          req.body ?? {}
        ) as WorkerRuntimeReleaseUpload;
        const result = await presignWorkerRuntimeReleaseUpload(input);
        if (!result) {
          res.json({
            uploadUrl: null,
            storageKey: null,
            fallback: "multipart",
          });
          return;
        }
        res.json({
          uploadUrl: result.uploadUrl,
          storageKey: result.storageKey,
          fallback: null,
        });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/releases/upload/complete",
    enforceJsonBodyMaxBytes(128 * 1024),
    async (req, res) => {
      const userId = await requireSystemAdmin(req, res);
      if (userId === null) return;
      try {
        const parsed = workerRuntimeReleaseFinalizeSchema.parse(
          req.body ?? {}
        ) as WorkerRuntimeReleaseFinalize;
        const release = await finalizeWorkerRuntimeReleaseUpload({
          upload: parsed,
          uploadedByUserId: userId,
        });
        res
          .status(201)
          .json({ release: workerRuntimeReleaseAssetSchema.parse(release) });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/releases/upload",
    uploadMiddleware(upload),
    async (req: any, res) => {
      const userId = await requireSystemAdmin(req, res);
      if (userId === null) {
        cleanupFile(req);
        return;
      }
      try {
        if (!req.file?.path) {
          res.status(400).json({
            error: {
              code: "worker_runtime_file_missing",
              message: "Choose a runtime ZIP file.",
            },
          });
          return;
        }
        const parsed = workerRuntimeReleaseUploadSchema.parse({
          version: req.body?.version,
          runtimeId: req.body?.runtimeId,
          platform: req.body?.platform,
          channel: req.body?.channel,
          fileName: req.file.originalname,
          contentType: req.file.mimetype || "application/zip",
          fileSizeBytes: req.file.size,
        }) as WorkerRuntimeReleaseUpload;
        const release = await persistWorkerRuntimeReleaseUploadFromPath({
          upload: parsed,
          filePath: req.file.path,
          uploadedByUserId: userId,
        });
        res
          .status(201)
          .json({ release: workerRuntimeReleaseAssetSchema.parse(release) });
      } catch (error) {
        sendError(res, error);
      } finally {
        cleanupFile(req);
      }
    }
  );

  router.post(
    "/releases/:id/publish",
    enforceJsonBodyMaxBytes(16 * 1024),
    async (req, res) => {
      if ((await requireSystemAdmin(req, res)) === null) return;
      try {
        const { id } = workerRuntimeReleaseActionSchema.parse({
          id: Number(req.params.id),
        });
        const release = await publishWorkerRuntimeRelease(id);
        if (!release) {
          res.status(404).json({
            error: {
              code: "worker_runtime_release_not_found",
              message: "Runtime release was not found.",
            },
          });
          return;
        }
        res.json({ release: workerRuntimeReleaseAssetSchema.parse(release) });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/releases/:id/withdraw",
    enforceJsonBodyMaxBytes(16 * 1024),
    async (req, res) => {
      if ((await requireSystemAdmin(req, res)) === null) return;
      try {
        const { id } = workerRuntimeReleaseActionSchema.parse({
          id: Number(req.params.id),
        });
        const release = await withdrawWorkerRuntimeRelease(id);
        if (!release) {
          res.status(404).json({
            error: {
              code: "worker_runtime_release_not_found",
              message: "Runtime release was not found.",
            },
          });
          return;
        }
        res.json({ release: workerRuntimeReleaseAssetSchema.parse(release) });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  return router;
}

export function registerWorkerRuntimeReleaseRoutes(app: any): void {
  app.use("/api/admin/worker-runtime", createWorkerRuntimeReleaseRouter());
}
