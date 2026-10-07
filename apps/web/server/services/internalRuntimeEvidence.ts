import type { DrizzleDB } from "../db";
import { getCloudflareCredentialCenterState } from "./cloudflareCredentialCenter";
import { getDrizzleMigrationEvidence } from "./drizzleMigrationEvidence";
import { collectRuntimeHealthEvidence } from "./runtimeHealthMonitor";

export async function getInternalRuntimeEvidence(input: {
  db: DrizzleDB;
  now?: Date;
  runtimeEnv?: NodeJS.ProcessEnv;
}) {
  const [migration, credentials] = await Promise.all([
    getDrizzleMigrationEvidence({ db: input.db, now: input.now }),
    getCloudflareCredentialCenterState(input.db),
  ]);
  const cloudflareConfigured = credentials.profiles.deployment.configured ||
    (credentials.runtime.workerUrlConfigured && credentials.runtime.runtimeTokenConfigured);
  return {
    scope: "INTERNAL_RUNTIME_ONLY" as const,
    observedAt: (input.now ?? new Date()).toISOString(),
    migration,
    runtime: collectRuntimeHealthEvidence({ now: input.now, env: input.runtimeEnv }),
    providerConfiguration: {
      cloudflareDeployment: {
        status: cloudflareConfigured ? "CONFIGURED" as const : "NOT_CONFIGURED" as const,
        source: "cloudflare_credential_center_and_secret_references" as const,
      },
    },
    externalRuntimeVerification: "NOT_VERIFIED" as const,
  };
}
