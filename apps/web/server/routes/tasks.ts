import { Router } from "express";

/**
 * Retired internal task route.
 *
 * Cloudflare consumers use the canonical job envelope and the guarded
 * control-plane APIs. Keeping this explicit 410 response prevents an old
 * scheduler or deployment from accidentally reactivating the removed Google
 * runtime by posting to the former endpoint.
 */
export function createTasksRouter(): Router {
  const router = Router();
  router.use((_req, res) => {
    res.status(410).json({
      error: "LEGACY_RUNTIME_RETIRED",
      target: "cloudflare",
      message: "Create or reconcile a canonical worker_jobs record instead.",
    });
  });
  return router;
}
