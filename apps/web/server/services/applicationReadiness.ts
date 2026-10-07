import type { DrizzleDB } from "../db";
import { sql } from "drizzle-orm";
import { cloudflareRuntimeStatus } from "./cloudflareRuntimeTarget";

type ReadinessDb = Pick<DrizzleDB, "execute">;

export type ApplicationReadiness = {
  status: "ready" | "not_ready" | "draining";
  checks: Record<string, string>;
  observedAt: string;
  evidenceSource: "application_readiness_probe";
};

/** Shared readiness decision for /readyz and internal runtime evidence. */
export async function evaluateApplicationReadiness(input: {
  db: ReadinessDb | null;
  draining?: boolean;
  now?: Date;
}): Promise<ApplicationReadiness> {
  const checks: Record<string, string> = {};
  let allHealthy = true;
  if (input.draining) {
    return {
      status: "draining",
      checks: { lifecycle: "draining" },
      observedAt: (input.now ?? new Date()).toISOString(),
      evidenceSource: "application_readiness_probe",
    };
  }

  try {
    if (!input.db) {
      checks.db = "unavailable";
      allHealthy = false;
    } else {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 2000);
      });
      try {
        await Promise.race([input.db.execute(sql`SELECT 1`), timeout]);
        checks.db = "ok";
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  } catch (error) {
    checks.db = error instanceof Error && error.message === "timeout" ? "timeout" : "error";
    allHealthy = false;
  }

  // Redis is optional; PostgreSQL remains the canonical application store.
  checks.redis = "not_required";
  const feature186 = cloudflareRuntimeStatus();
  checks.feature186 = feature186.hardCutover
    ? feature186.runtimeReady
      ? `ok:${feature186.runtimeMode}`
      : `error:${feature186.runtimeReason ?? "runtime_not_ready"}`
    : "disabled";
  if (feature186.hardCutover && !feature186.runtimeReady) allHealthy = false;

  return {
    status: allHealthy ? "ready" : "not_ready",
    checks,
    observedAt: (input.now ?? new Date()).toISOString(),
    evidenceSource: "application_readiness_probe",
  };
}
