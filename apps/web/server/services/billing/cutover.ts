import { TRPCError } from "@trpc/server";
import { getBillingRuntimeConfig } from "./runtimeConfig";

export const BILLING_SUBSCRIPTION_CUTOVER_READY_FLAG = "BILLING_SUBSCRIPTION_CUTOVER_READY";

export async function isBillingSubscriptionCutoverReady(): Promise<boolean> {
  const runtime = await getBillingRuntimeConfig();
  return Boolean(runtime.BILLING_SUBSCRIPTION_CUTOVER_READY);
}

export async function assertBillingSubscriptionCutoverReady(): Promise<void> {
  const ready = await isBillingSubscriptionCutoverReady();
  if (ready) {
    return;
  }

  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Billing subscription cutover is not ready",
  });
}
