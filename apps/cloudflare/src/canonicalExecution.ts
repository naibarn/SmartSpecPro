import { executeCanonicalMediaProbe } from "./canonicalMediaProbe";
import type { CanonicalWorkerExecution } from "./contracts";
import { executeCanonicalPlatformJob } from "./canonicalControlPlaneProxy";
import { executeHyperdriveEmergencyIntake } from "./emergencyHyperdriveIntake";
import { withHyperdrivePostgres } from "./postgresClient";

export const executeCanonicalJob: CanonicalWorkerExecution = async delivery => {
  if (delivery.job?.jobType === "python.legacy_task") return executeCanonicalMediaProbe(delivery);
  const mode = delivery.env.CLOUDFLARE_WORKFLOW_DATABASE;
  if (!mode) return executeCanonicalPlatformJob(delivery);
  if (mode !== "hyperdrive-intake") throw new Error("CLOUDFLARE_DATABASE_EXECUTION_MODE_DENIED");
  // Never fall back after an uncertain database commit. Canonical retry and
  // domain idempotency own recovery, using the same job/attempt/dispatch.
  return withHyperdrivePostgres(delivery.env.HYPERDRIVE, client => executeHyperdriveEmergencyIntake(delivery, client));
};
