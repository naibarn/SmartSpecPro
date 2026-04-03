import { createBeamProvider, type BillingPaymentProvider } from "./beamProvider";
import { createInvoiceChargeFlow } from "./orchestration";
import { getBeamProviderRuntimeConfig, testBeamProviderAdminSettings } from "./providerConfig";

export interface CreateTopupCheckoutParams {
  tenantId: string | null;
  userId: number;
  actorUserId: number;
  packageCode?: string | null;
  credits: number;
  basePrice: number;
  currency?: string;
  description?: string | null;
  paymentMethod?: "promptpay" | "card";
  provider?: BillingPaymentProvider;
}

export async function createTopupCheckout(params: CreateTopupCheckoutParams) {
  const providerHealth = await testBeamProviderAdminSettings();
  const providerConfig = await getBeamProviderRuntimeConfig();
  const paymentMethod = params.paymentMethod ?? "promptpay";

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
  const description = params.description?.trim() || `Credit top-up (${params.credits} credits)`;

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
        unitPrice: params.basePrice,
        metadataJson: {
          credits: params.credits,
          packageCode: params.packageCode ?? null,
        },
      },
    ],
    chargePayload: {
      packageCode: params.packageCode ?? null,
      credits: params.credits,
      description,
      checkoutMethod: paymentMethod,
    },
  });
}
