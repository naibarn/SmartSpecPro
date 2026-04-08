import crypto from "crypto";
import type { Request } from "express";
import { TRPCError } from "@trpc/server";
import { getBillingRuntimeConfig } from "./runtimeConfig";

const HIGH_RISK_ACTIONS = new Set([
  "manage_payment_method",
  "set_default_payment_method",
  "enable_auto_renew",
  "revoke_payment_method",
  "manage_renewal_attempt",
]);

export async function assertBillingStepUpIfRequired(params: {
  req: Request;
  action: string;
  actorUserId?: number | null;
}) {
  const runtime = await getBillingRuntimeConfig();
  if (!runtime.BILLING_PHASE2_REQUIRE_STEP_UP) {
    return;
  }
  if (!HIGH_RISK_ACTIONS.has(params.action)) {
    return;
  }

  const signedSecret = runtime.BILLING_PHASE2_STEP_UP_SECRET?.trim();
  if (signedSecret) {
    const userIdHeader = String(params.req.headers["x-billing-step-up-user"] ?? "").trim();
    const actionHeader = String(params.req.headers["x-billing-step-up-action"] ?? "").trim();
    const expiresAtHeader = String(params.req.headers["x-billing-step-up-exp"] ?? "").trim();
    const signatureHeader = String(params.req.headers["x-billing-step-up-sig"] ?? "").trim();
    const expectedUserId = params.actorUserId != null ? String(params.actorUserId) : "";
    const expiresAtMs = expiresAtHeader ? Number.parseInt(expiresAtHeader, 10) : Number.NaN;

    if (userIdHeader && actionHeader && expiresAtHeader && signatureHeader && expectedUserId) {
      const material = `${userIdHeader}:${actionHeader}:${expiresAtHeader}`;
      const expectedSignature = crypto.createHmac("sha256", signedSecret).update(material).digest("hex");
      const signatureValid =
        signatureHeader.length === expectedSignature.length
        && crypto.timingSafeEqual(Buffer.from(signatureHeader, "hex"), Buffer.from(expectedSignature, "hex"));
      const actionValid = actionHeader === params.action;
      const userValid = userIdHeader === expectedUserId;
      const withinWindow = Number.isFinite(expiresAtMs) && expiresAtMs >= Date.now();

      if (signatureValid && actionValid && userValid && withinWindow) {
        return;
      }
    }
  }

  const confirmed = String(params.req.headers["x-billing-step-up"] ?? "").toLowerCase() === "confirmed";
  const confirmedAtHeader = String(params.req.headers["x-billing-step-up-at"] ?? "");
  const confirmedAt = confirmedAtHeader ? Date.parse(confirmedAtHeader) : Number.NaN;
  const stepUpWindowMinutes = Number.parseInt(runtime.BILLING_PHASE2_STEP_UP_WINDOW_MINUTES ?? "15", 10);
  const stepUpWindowMs = (Number.isFinite(stepUpWindowMinutes) ? stepUpWindowMinutes : 15) * 60 * 1000;
  const withinWindow = Number.isFinite(confirmedAt) && Date.now() - confirmedAt < stepUpWindowMs;

  if (!confirmed || !withinWindow) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Recent step-up authentication required for this billing action",
    });
  }
}
