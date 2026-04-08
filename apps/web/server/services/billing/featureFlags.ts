import { TRPCError } from "@trpc/server";

import { getBillingRuntimeConfig } from "./runtimeConfig";

export async function isBillingFeatureEnabled(flagName: keyof Awaited<ReturnType<typeof getBillingRuntimeConfig>>) {
  const config = await getBillingRuntimeConfig();
  const value = config[flagName];
  return typeof value === "boolean" ? value : Boolean(value);
}

export async function assertBillingFeatureEnabled(
  flagName: keyof Awaited<ReturnType<typeof getBillingRuntimeConfig>>,
  message?: string,
) {
  if (await isBillingFeatureEnabled(flagName)) {
    return;
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: message ?? `Billing feature disabled: ${flagName}`,
  });
}

export async function getAllowedBillingPhase2Cohorts() {
  const config = await getBillingRuntimeConfig();
  const raw = String(config.BILLING_PHASE2_ALLOWED_COHORTS ?? "").trim();
  if (!raw) {
    return null;
  }
  return new Set(raw.split(",").map((value) => value.trim()).filter(Boolean));
}

export async function getDefaultBillingPhase2Cohort() {
  const config = await getBillingRuntimeConfig();
  return String(config.BILLING_PHASE2_DEFAULT_COHORT ?? "").trim() || null;
}

export async function isBillingPhase2CohortEnabled(cohort: string | null | undefined) {
  const allowed = await getAllowedBillingPhase2Cohorts();
  if (!allowed || allowed.size === 0) {
    return true;
  }
  if (!cohort) {
    return false;
  }
  return allowed.has(cohort);
}
