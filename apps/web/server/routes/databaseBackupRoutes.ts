import express, { type Express } from "express";
import { createReadStream } from "node:fs";
import { authorizeRequest } from "../_core/authz";
import {
  databaseBackupArtifactSchema,
  type DatabaseBackupArtifact,
} from "../services/databaseBackupContracts";
import {
  getDatabaseBackupJob,
  resolveDatabaseBackupArtifactPath,
} from "../services/databaseBackupService";

function sendError(
  res: express.Response,
  status: number,
  message: string
): void {
  res.status(status).json({
    error: { code: status === 404 ? "not_found" : "forbidden", message },
  });
}

export function registerDatabaseBackupRoutes(app: Express): void {
  const router = express.Router();
  router.get("/:jobId/:artifact/download", async (req, res) => {
    const auth = await authorizeRequest(req, {
      allowBearer: false,
      allowSession: true,
    });
    if (!auth.ok || auth.mode !== "session" || auth.user?.role !== "admin") {
      sendError(res, 403, "Admin access required");
      return;
    }
    const parsedArtifact = databaseBackupArtifactSchema.safeParse(
      req.params.artifact
    );
    if (!parsedArtifact.success) {
      sendError(res, 404, "Backup artifact not found");
      return;
    }
    const artifact = parsedArtifact.data as DatabaseBackupArtifact;
    const job = await getDatabaseBackupJob(req.params.jobId);
    if (!job) {
      sendError(res, 404, "Backup job not found");
      return;
    }
    const filePath = await resolveDatabaseBackupArtifactPath(job, artifact);
    if (!filePath) {
      sendError(res, 404, "Backup artifact is not available");
      return;
    }

    const filename =
      artifact === "database"
        ? `database-dump-${job.id}.zip`
        : `application-data-${job.mode}-${job.id}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const stream = createReadStream(filePath);
    stream.on("error", error => {
      if (!res.headersSent)
        sendError(res, 404, "Backup artifact is not available");
      else res.destroy(error);
    });
    stream.pipe(res);
  });
  app.use("/api/admin/database-backups", router);
}
