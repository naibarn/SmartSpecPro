import type { Express, Request, Response } from "express";
import { z } from "zod";

import { compareCachedInternalToken } from "../services/appRuntimeConfig";
import { createJobControlPlane } from "../services/jobControlPlane";

const leaseSchema = z.object({
  jobId: z.string().min(1),
  attemptId: z.string().min(1),
  leaseToken: z.string().min(1),
  fencingVersion: z.number().int().nonnegative(),
  expiresAt: z.string().default(""),
});
const progressSchema = z.object({
  progress: z.number().finite().min(0).max(100),
  stage: z.string().trim().min(1).max(100),
  message: z.string().max(500).optional(),
  measured: z.record(z.union([z.number(), z.string().max(200), z.boolean()])).optional(),
});
const resultSchema = z.object({ resultRef: z.string().max(2000).optional(), output: z.record(z.unknown()).optional() });
const errorSchema = z.object({ code: z.string().trim().min(1).max(100), message: z.string().max(2000), class: z.enum(["retryable", "permanent", "unknown"]), operatorReviewRequired: z.boolean().optional() });

function internalAuth(req: Request, res: Response): boolean {
  if (compareCachedInternalToken(req.header("x-internal-token"))) return true;
  res.status(401).json({ error: "Invalid internal token" });
  return false;
}

function fail(res: Response, error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "JOB_CONTROL_PLANE_ERROR";
  const status = code === "JOB_STATE_CONFLICT" || code === "JOB_LEASE_STALE" ? 409 : 400;
  res.status(status).json({ error: code });
}

export function registerJobControlPlaneRoutes(app: Express): void {
  app.post("/api/internal/job-control-plane/context", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = z.object({ jobId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid context request" });
    try {
      const context = await createJobControlPlane().getContext(parsed.data.jobId);
      if (!context) return res.status(404).json({ error: "JOB_NOT_FOUND" });
      return res.json({ context });
    } catch (error) { return fail(res, error); }
  });

  app.post("/api/internal/job-control-plane/claim", async (req, res) => {
    if (!internalAuth(req, res)) return;
    const parsed = z.object({ jobId: z.string().min(1), runnerId: z.string().min(1).max(160), adapter: z.string().min(1).max(80) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid claim request" });
    try {
      const lease = await createJobControlPlane().claim(parsed.data);
      return res.json({ lease });
    } catch (error) { return fail(res, error); }
  });

  const leaseAction = (path: string, action: (lease: z.infer<typeof leaseSchema>, body: Record<string, unknown>) => Promise<void>) => {
    app.post(`/api/internal/job-control-plane/${path}`, async (req, res) => {
      if (!internalAuth(req, res)) return;
      const parsed = leaseSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid lease request" });
      try { await action(parsed.data, req.body as Record<string, unknown>); return res.json({ ok: true }); }
      catch (error) { return fail(res, error); }
    });
  };

  leaseAction("start", (lease) => createJobControlPlane().start(lease));
  leaseAction("heartbeat", (lease) => createJobControlPlane().heartbeat(lease));
  leaseAction("progress", (lease, body) => {
    const progress = progressSchema.parse(body.progress);
    return createJobControlPlane().progress(lease, progress);
  });
  leaseAction("complete", (lease, body) => createJobControlPlane().complete(lease, resultSchema.parse(body.result)));
  leaseAction("fail", (lease, body) => createJobControlPlane().fail(lease, errorSchema.parse(body.error)));
}
