import type { DrizzleDB } from "../db";
import { getCloudflareCredentialCenterState } from "./cloudflareCredentialCenter";
import { drizzleMigrationEvidenceSource, type MigrationEvidenceSource } from "./drizzleMigrationEvidence";
import { collectRuntimeHealthEvidence } from "./runtimeHealthMonitor";
import { evaluateApplicationReadiness } from "./applicationReadiness";

export async function getInternalRuntimeEvidence(input: {
  db: DrizzleDB;
  now?: Date;
  runtimeEnv?: NodeJS.ProcessEnv;
  migrationSource?: MigrationEvidenceSource;
}) {
  const migrationSource = input.migrationSource ?? drizzleMigrationEvidenceSource;
  const [migration, credentials, readiness] = await Promise.all([
    migrationSource.observe({ db: input.db, now: input.now }),
    getCloudflareCredentialCenterState(input.db),
    evaluateApplicationReadiness({ db: input.db, now: input.now }),
  ]);
  const cloudflareConfigured = credentials.profiles.deployment.configured ||
    (credentials.runtime.workerUrlConfigured && credentials.runtime.runtimeTokenConfigured);
  return {
    scope: "INTERNAL_RUNTIME_ONLY" as const,
    observedAt: (input.now ?? new Date()).toISOString(),
    migration,
    runtime: {
      ...collectRuntimeHealthEvidence({ now: input.now, env: input.runtimeEnv }),
      readiness: {
        status: readiness.status === "ready" ? "READY" as const : "NOT_READY" as const,
        health: readiness.status === "ready" ? "HEALTHY" as const : "DEGRADED" as const,
        freshness: "FRESH" as const,
        observedAt: readiness.observedAt,
        evidenceSource: readiness.evidenceSource,
        checks: readiness.checks,
      },
    },
    providerConfiguration: {
      cloudflareDeployment: {
        status: cloudflareConfigured ? "CONFIGURED" as const : "NOT_CONFIGURED" as const,
        source: "cloudflare_credential_center_and_secret_references" as const,
      },
    },
    externalRuntimeVerification: "NOT_VERIFIED" as const,
  };
}
