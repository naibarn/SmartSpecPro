import { createBeamProvider, type BillingPaymentProvider } from "./beamProvider";
import { createInvoiceChargeFlow } from "./orchestration";
import { getBeamProviderRuntimeConfig, testBeamProviderAdminSettings } from "./providerConfig";
import { getPromptPayDirectAvailability } from "./promptpayDirectService";
import { getBillingRuntimeConfig } from "./runtimeConfig";
import { getDb } from "../../db";
import { creditPackages } from "../../../drizzle/schema";
import { and, eq } from "drizzle-orm";

export interface CreateTopupCheckoutParams {
  tenantId: string | null;
  userId: number;
  actorUserId: number;
  packageId?: number;
  /** @deprecated only retained for direct internal callers during migration; router no longer accepts these values. */
  packageCode?: string | null;
  /** @deprecated only retained for direct internal callers during migration. */
  credits?: number;
  /** @deprecated only retained for direct internal callers during migration. */
  basePrice?: number;
  currency?: string;
  description?: string | null;
  paymentMethod?: "promptpay" | "card";
  provider?: BillingPaymentProvider;
}

export const TOPUP_PAYMENT_CHANNELS = [
  "beam_promptpay",
  "beam_card",
  "promptpay_direct_manual",
] as const;

export type TopupPaymentChannel = typeof TOPUP_PAYMENT_CHANNELS[number];

/**
 * Returns the server-authoritative payment methods for the credit top-up flow.
 * The same result is used to guard checkout creation, so a hidden/disabled
 * method cannot still be invoked by a stale client or a crafted request.
 */
export async function getTopupPaymentOptions() {
  const [runtime, beamHealth, beamConfig, directAvailability] = await Promise.all([
    getBillingRuntimeConfig(),
    testBeamProviderAdminSettings(),
    getBeamProviderRuntimeConfig(),
    getPromptPayDirectAvailability(),
  ]);

  const availableChannels: TopupPaymentChannel[] = [];
  const beamAvailable = runtime.BILLING_BEAM_ENABLED && beamHealth.configured;
  if (beamAvailable && beamConfig.chargesPath?.trim()) {
    availableChannels.push("beam_promptpay");
  }
  if (beamAvailable && beamHealth.paymentLinkConfigured) {
    availableChannels.push("beam_card");
  }
  if (directAvailability.enabled && directAvailability.configured) {
    availableChannels.push("promptpay_direct_manual");
  }

  const preferredChannel: TopupPaymentChannel | null = runtime.BILLING_ACTIVE_PROVIDER === "promptpay_direct"
    ? "promptpay_direct_manual"
    : runtime.BILLING_ACTIVE_PROVIDER === "beam"
      ? "beam_promptpay"
      : null;
  const defaultPaymentChannel = preferredChannel && availableChannels.includes(preferredChannel)
    ? preferredChannel
    : availableChannels[0] ?? null;

  return {
    activeProvider: runtime.BILLING_ACTIVE_PROVIDER,
    defaultPaymentChannel,
    availableChannels,
    beamAvailable,
    directAvailable: availableChannels.includes("promptpay_direct_manual"),
  };
}

export async function createTopupCheckout(params: CreateTopupCheckoutParams) {
  const providerHealth = await testBeamProviderAdminSettings();
  const providerConfig = await getBeamProviderRuntimeConfig();
  const paymentMethod = params.paymentMethod ?? "promptpay";
  let packageCode = params.packageCode ?? null;
  let credits = params.credits ?? 0;
  let basePrice = params.basePrice ?? 0;
  if (params.packageId) {
    const db = getDb();
    const [pkg] = await db
      .select()
      .from(creditPackages)
      .where(and(eq(creditPackages.id, params.packageId), eq(creditPackages.isActive, true)))
      .limit(1);
    if (!pkg) throw new Error("PAYMENT_PACKAGE_NOT_AVAILABLE");
    packageCode = `credit-package-${pkg.id}`;
    credits = pkg.credits;
    basePrice = Number(pkg.priceUsd);
  }
  if (!Number.isInteger(credits) || credits <= 0 || !Number.isFinite(basePrice) || basePrice <= 0) {
    throw new Error("PAYMENT_PACKAGE_NOT_AVAILABLE");
  }

  if (!providerHealth.configured) {
    throw new Error(
      `Beam gateway is not configured yet. Missing: ${providerHealth.missing.join(", ")}. Go to Platform Settings > Payments > Beam.`,
    );
  }

  if (paymentMethod === "card" && !providerHealth.paymentLinkConfigured) {
    throw new Error("Beam card checkout is not configured yet. Set Payment Links paths in Platform Settings > Payments > Beam.");
  }

  if (paymentMethod === "promptpay" && !providerConfig.chargesPath?.trim()) {
    throw new Error("Beam PromptPay charge path is not configured yet. Go to Platform Settings > Payments > Beam.");
  }

  const provider = params.provider ?? await createBeamProvider();
  const description = params.description?.trim() || `Credit top-up (${credits} credits)`;

  return createInvoiceChargeFlow({
    tenantId: params.tenantId,
    userId: params.userId,
    actorUserId: params.actorUserId,
    invoiceType: "topup",
    currency: params.currency ?? "THB",
    documentLanguage: "th",
    provider,
    providerPaymentType: paymentMethod === "card" ? "payment_link" : "charge",
    lineItems: [
      {
        itemType: "credit_package",
        description,
        quantity: 1,
        unitPrice: basePrice,
        metadataJson: {
          credits,
          packageCode,
        },
      },
    ],
    chargePayload: {
      packageCode,
      credits,
      description,
      checkoutMethod: paymentMethod,
    },
  });
}
