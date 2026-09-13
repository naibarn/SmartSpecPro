import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

import { Router } from "express";
import multer from "multer";

import { sdk } from "../_core/sdk";
import { enforceJsonBodyMaxBytes, rateLimit } from "../_core/limits";
import {
  finalizeWorkerRuntimeReleaseUpload,
  importLocalWorkerRuntimeRelease,
  listWorkerRuntimeReleaseCatalog,
  persistWorkerRuntimeReleaseUploadFromPath,
  presignWorkerRuntimeReleaseUpload,
  publishWorkerRuntimeRelease,
  withdrawWorkerRuntimeRelease,
  WorkerRuntimeReleaseError,
  MAX_WORKER_RUNTIME_RELEASE_BYTES,
} from "../services/workerRuntimeReleaseService";
import {
  listWorkerRuntimeRunnerArtifacts,
  MAX_WORKER_RUNTIME_RUNNER_BYTES,
  finalizeWorkerRuntimeRunnerArtifactUpload,
  presignWorkerRuntimeRunnerArtifactUpload,
  persistWorkerRuntimeRunnerArtifactFromPath,
  streamWorkerRuntimeRunnerArtifact,
  WorkerRuntimeRunnerArtifactError,
} from "../services/workerRuntimeRunnerArtifactService";
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
  workerRuntimeReleaseLocalImportSchema,
  workerRuntimeReleaseUploadSchema,
  workerRuntimeRunnerArtifactCatalogSchema,
  workerRuntimeRunnerArtifactFinalizeSchema,
  workerRuntimeRunnerArtifactSchema,
  workerRuntimeRunnerArtifactUploadSchema,
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
const TEMP_RUNNER_UPLOAD_DIR = path.join(
  os.tmpdir(),
  "smartspec-worker-runtime-runner-uploads"
);
fs.mkdirSync(TEMP_RUNNER_UPLOAD_DIR, { recursive: true });

type LocalImportOperation = {
  id: string;
  key: string;
  status: "running" | "succeeded" | "failed";
  createdAt: string;
  updatedAt: string;
  release: Awaited<ReturnType<typeof importLocalWorkerRuntimeRelease>> | null;
  error: { code: string; message: string; details?: unknown } | null;
};

const localImportOperations = new Map<string, LocalImportOperation>();
const localImportOperationIdsByKey = new Map<string, string>();
const LOCAL_IMPORT_OPERATION_TTL_MS = 24 * 60 * 60 * 1000;

function publicLocalImportOperation(operation: LocalImportOperation) {
  return {
    id: operation.id,
    status: operation.status,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    release: operation.release,
    error: operation.error,
  };
}

function pruneLocalImportOperations(now = Date.now()): void {
  for (const [id, operation] of localImportOperations) {
    if (now - Date.parse(operation.updatedAt) <= LOCAL_IMPORT_OPERATION_TTL_MS)
      continue;
    localImportOperations.delete(id);
    if (localImportOperationIdsByKey.get(operation.key) === id)
      localImportOperationIdsByKey.delete(operation.key);
  }
}

function startLocalImportOperation(input: {
  release: Parameters<typeof importLocalWorkerRuntimeRelease>[0]["release"];
  uploadedByUserId: number;
}): LocalImportOperation {
  pruneLocalImportOperations();
  const key = `${input.release.runtimeId}:${input.release.version}:${input.release.channel}`;
  const activeId = localImportOperationIdsByKey.get(key);
  const active = activeId ? localImportOperations.get(activeId) : null;
  if (active?.status === "running") return active;

  const now = new Date().toISOString();
  const operation: LocalImportOperation = {
    id: crypto.randomUUID(),
    key,
    status: "running",
    createdAt: now,
    updatedAt: now,
    release: null,
    error: null,
  };
  localImportOperations.set(operation.id, operation);
  localImportOperationIdsByKey.set(key, operation.id);

  setImmediate(() => {
    void importLocalWorkerRuntimeRelease(input)
      .then(release => {
        operation.status = "succeeded";
        operation.release = release;
        operation.updatedAt = new Date().toISOString();
      })
      .catch(error => {
        operation.status = "failed";
        operation.error = {
          code:
            error instanceof WorkerRuntimeReleaseError
              ? error.code
              : "worker_runtime_release_failed",
          message:
            error instanceof Error
              ? error.message
              : "Worker runtime release operation failed",
          details:
            error instanceof WorkerRuntimeReleaseError
              ? error.details
              : undefined,
        };
        operation.updatedAt = new Date().toISOString();
        console.error("[WorkerRuntime] Server artifact import failed", {
          operationId: operation.id,
          key: operation.key,
          error: operation.error,
        });
      });
  });
  return operation;
}

function sendError(res: any, error: unknown): void {
  const databaseError = error as { code?: string; message?: string } | null;
  if (
    databaseError?.code === "42P01" ||
    databaseError?.message?.includes(
      'relation "worker_runtime_releases" does not exist'
    ) ||
    databaseError?.message?.includes(
      'relation "worker_runtime_runner_artifacts" does not exist'
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
    error instanceof WorkerRuntimeSigningKeyError ||
    error instanceof WorkerRuntimeRunnerArtifactError
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
  const runnerUpload = multer({
    storage: multer.diskStorage({
      destination: TEMP_RUNNER_UPLOAD_DIR,
      filename: (_req, file, callback) =>
        callback(
          null,
          `${Date.now()}-${path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]+/g, "-")}`
        ),
    }),
    limits: { fileSize: MAX_WORKER_RUNTIME_RUNNER_BYTES },
  });
  const runnerUploadMiddleware = (req: any, res: any, next: any) =>
    runnerUpload.single("file")(req, res, (error: unknown) => {
      if (error) {
        res.status((error as any)?.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
          error: {
            code:
              (error as any)?.code === "LIMIT_FILE_SIZE"
                ? "worker_runtime_runner_too_large"
                : "worker_runtime_runner_upload_failed",
            message:
              error instanceof Error ? error.message : "Runner upload failed.",
          },
        });
        return;
      }
      next();
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

  router.get("/runner-artifacts", async (req, res) => {
    if ((await requireSystemAdmin(req, res)) === null) return;
    try {
      res.json(
        workerRuntimeRunnerArtifactCatalogSchema.parse(
          await listWorkerRuntimeRunnerArtifacts()
        )
      );
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post(
    "/runner-artifacts/upload-url",
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      if ((await requireSystemAdmin(req, res)) === null) return;
      try {
        const input = workerRuntimeRunnerArtifactUploadSchema.parse(req.body ?? {});
        const result = await presignWorkerRuntimeRunnerArtifactUpload(input);
        res.json(result
          ? { uploadUrl: result.uploadUrl, storageKey: result.storageKey, fallback: null }
          : { uploadUrl: null, storageKey: null, fallback: "multipart" });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/runner-artifacts/upload/complete",
    enforceJsonBodyMaxBytes(128 * 1024),
    async (req, res) => {
      const userId = await requireSystemAdmin(req, res);
      if (userId === null) return;
      try {
        const input = workerRuntimeRunnerArtifactFinalizeSchema.parse(req.body ?? {});
        const artifact = await finalizeWorkerRuntimeRunnerArtifactUpload({
          upload: input,
          uploadedByUserId: userId,
        });
        res.status(201).json({ artifact: workerRuntimeRunnerArtifactSchema.parse(artifact) });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.post(
    "/runner-artifacts/upload",
    runnerUploadMiddleware,
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
              code: "worker_runtime_runner_file_missing",
              message: "Choose a speaker-aware runner .exe file.",
            },
          });
          return;
        }
        const artifact = await persistWorkerRuntimeRunnerArtifactFromPath({
          filePath: req.file.path,
          fileName: req.file.originalname,
          contentType: req.file.mimetype,
          uploadedByUserId: userId,
        });
        res.status(201).json({
          artifact: workerRuntimeRunnerArtifactSchema.parse(artifact),
        });
      } catch (error) {
        sendError(res, error);
      } finally {
        cleanupFile(req);
      }
    }
  );

  router.get("/runner-artifacts/:id/download", async (req, res) => {
    if ((await requireSystemAdmin(req, res)) === null) return;
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({
          error: { code: "worker_runtime_runner_id_invalid", message: "Invalid runner artifact id." },
        });
        return;
      }
      const result = await streamWorkerRuntimeRunnerArtifact(id);
      if (!result) {
        res.status(404).json({
          error: { code: "worker_runtime_runner_not_found", message: "Runner artifact was not found." },
        });
        return;
      }
      res.setHeader("Content-Type", result.row.contentType);
      res.setHeader("Content-Length", String(result.stored.contentLength ?? result.row.fileSizeBytes));
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(result.row.fileName).replace(/"/g, "")}"`);
      const stream: any = result.stored.stream;
      if (typeof stream.pipe === "function") stream.pipe(res);
      else res.send(Buffer.from(await new Response(stream).arrayBuffer()));
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
    "/releases/import-local",
    enforceJsonBodyMaxBytes(16 * 1024),
    async (req, res) => {
      const userId = await requireSystemAdmin(req, res);
      if (userId === null) return;
      try {
        const release = workerRuntimeReleaseLocalImportSchema.parse(
          req.body ?? {}
        );
        const operation = startLocalImportOperation({
          release,
          uploadedByUserId: userId,
        });
        res.status(202).json({
          operation: publicLocalImportOperation(operation),
        });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  router.get("/releases/import-local/:operationId", async (req, res) => {
    if ((await requireSystemAdmin(req, res)) === null) return;
    pruneLocalImportOperations();
    const operation = localImportOperations.get(
      String(req.params.operationId || "")
    );
    if (!operation) {
      res.status(404).json({
        error: {
          code: "worker_runtime_import_operation_not_found",
          message: "Runtime import operation was not found or has expired.",
        },
      });
      return;
    }
    res.json({ operation: publicLocalImportOperation(operation) });
  });

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
