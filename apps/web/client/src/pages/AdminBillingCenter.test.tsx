import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockSetLocation = vi.fn();
const sellerProfileData = {
  entityNameTh: "SmartSpecPro Co., Ltd.",
  country: "Thailand",
};
const taxPoliciesData = [
  {
    id: 1,
    stream: "domestic",
    taxName: "VAT",
    taxRatePercent: "7.0000",
    isEnabled: true,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    roundingPolicy: "half_up_2dp",
  },
  {
    id: 2,
    stream: "international",
    taxName: "International Tax",
    taxRatePercent: "0.0000",
    isEnabled: false,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    roundingPolicy: "half_up_2dp",
  },
] as const;
const invoicesData = [
  {
    id: 301,
    invoiceNumber: "TH-INV-2026-000301",
    status: "payment_pending",
    invoiceType: "subscription_renewal",
    totalAmount: "999.00",
    currency: "THB",
  },
] as const;
const selectedInvoiceData = {
  id: 301,
  userId: 42,
  subscriptionId: 77,
  invoiceNumber: "TH-INV-2026-000301",
  status: "payment_pending",
  invoiceType: "subscription_renewal",
  totalAmount: "999.00",
  currency: "THB",
  headerVersion: 2,
  issuedAt: "2026-03-30T00:00:00.000Z",
  dueAt: "2026-04-06T00:00:00.000Z",
  defaultDocumentLanguage: "th",
  invoiceStream: "domestic",
  billingCycleStart: "2026-04-01T00:00:00.000Z",
  billingCycleEnd: "2026-04-30T23:59:59.000Z",
  buyerSnapshotJson: { legalNameTh: "ลูกค้าทดสอบ" },
  sellerSnapshotJson: { entityNameTh: "SmartSpecPro Co., Ltd." },
};

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/billing", mockSetLocation],
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      adminBilling: {
        getInvoiceDocumentAccess: { fetch: vi.fn().mockResolvedValue(null) },
        getRecoveryEvidenceAccess: { fetch: vi.fn().mockResolvedValue(null) },
      },
    }),
    adminBilling: {
      getSellerProfile: {
        useQuery: () => ({
          data: sellerProfileData,
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listTaxPolicies: {
        useQuery: () => ({
          data: taxPoliciesData,
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listSellerProfileRevisions: {
        useQuery: () => ({
          data: [],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      previewInvoiceNumber: {
        useQuery: ({ stream }: { stream: string }) => ({
          data: {
            invoiceNumber: stream === "domestic" ? "TH-INV-2026-000321" : "INT-INV-2026-000044",
          },
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listInvoices: {
        useQuery: () => ({
          data: invoicesData,
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listRecoveryCases: {
        useQuery: () => ({
          data: [],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      getInvoice: {
        useQuery: () => ({
          data: selectedInvoiceData,
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listInvoiceDocuments: {
        useQuery: () => ({
          data: [],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listNotificationDispatches: {
        useQuery: () => ({
          data: [],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listInvoicePayments: {
        useQuery: () => ({
          data: [],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listInvoiceAuditLogs: {
        useQuery: () => ({
          data: [],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listInvoiceReconciliationRuns: {
        useQuery: () => ({
          data: [],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listInvoiceWebhookEvents: {
        useQuery: () => ({
          data: [],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listPaymentMethods: {
        useQuery: () => ({
          data: [
            {
              id: 501,
              brand: "Visa",
              last4: "4242",
              expMonth: 12,
              expYear: 2030,
              isDefault: true,
              status: "active",
              autoRenewEligible: true,
            },
          ],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      getSubscriptionPaymentSettings: {
        useQuery: () => ({
          data: {
            subscription: { id: 77 },
            settings: {
              renewalMode: "auto_charge",
              defaultPaymentMethodId: 501,
              autoRenewEnabled: true,
              consentWithdrawnAt: null,
            },
          },
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listRenewalAttempts: {
        useQuery: () => ({
          data: [
            {
              id: 700,
              attemptNo: 1,
              status: "retry_scheduled",
              scheduledAt: "2026-04-01T00:00:00.000Z",
              nextRetryAt: "2026-04-02T00:00:00.000Z",
              failureMessage: null,
            },
          ],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      getPhase2Metrics: {
        useQuery: () => ({
          data: {
            setupSessionsCreated: 1,
            autoRenewAttemptsCreated: 2,
            autoRenewSettled: 1,
            autoRenewRetryScheduled: 1,
            autoRenewManualFallbacks: 0,
            activeAutoRenewSubscriptions: 1,
            processCounters: {
              setupSessionsCreated: 1,
              autoRenewAttemptsCreated: 2,
              autoRenewSettled: 1,
              autoRenewRetryScheduled: 1,
              autoRenewManualFallbacks: 0,
            },
          },
        }),
      },
      getBeamProviderSettings: {
        useQuery: () => ({
          data: {
            apiBaseUrl: "https://beam.example",
            apiKeyConfigured: true,
            apiKeyMasked: "********",
            chargesPath: "/v1/charges",
            paymentLinksPath: "/v1/payment_links",
            chargeStatusPathTemplate: "/v1/charges/{id}",
            paymentLinkStatusPathTemplate: "/v1/payment_links/{id}",
            cancelPathSuffix: "/cancel",
            webhookSecretCurrentConfigured: true,
            webhookSecretCurrentMasked: "********",
            webhookSecretPreviousConfigured: false,
            paymentMethodSetupPath: "/v1/setup",
            paymentMethodSetupHostedUrlTemplate: "https://beam.example/setup?session={sessionId}",
            paymentMethodSetupReturnUrl: "https://app.example/billing",
            paymentMethodSetupCallbackSecretCurrentConfigured: true,
            paymentMethodSetupCallbackSecretCurrentMasked: "********",
            paymentMethodSetupCallbackSecretPreviousConfigured: false,
          },
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      testBeamProviderSettings: {
        useQuery: () => ({
          data: {
            configured: true,
            setupHostedConfigured: true,
            setupApiConfigured: true,
            webhookConfigured: true,
            paymentLinkConfigured: true,
            missing: [],
          },
          refetch: vi.fn().mockResolvedValue(undefined),
          isFetching: false,
        }),
      },
      getBillingRuntimeSettings: {
        useQuery: () => ({
          data: {
            PAYMENT_RECONCILIATION_ENABLED: true,
            FINAL_RECONCILIATION_BEFORE_DOWNGRADE: true,
            ADMIN_MANUAL_MARK_PAID_ENABLED: true,
            ADMIN_DOWNGRADE_REVERSAL_ENABLED: true,
            SUPPORT_RECOVERY_CASES_ENABLED: true,
            DOCUMENT_RECOVERY_ENABLED: true,
            INVOICE_HEADER_SYNC_ENABLED: true,
            PAID_INVOICE_REISSUE_ENABLED: true,
            AUTO_DOWNGRADE_AFTER_7_DAYS: true,
            BEAM_PAYMENT_LINK_FALLBACK: true,
            BILLING_PHASE2_SAVED_CARDS_ENABLED: true,
            BILLING_PHASE2_AUTO_RENEW_ENABLED: true,
            BILLING_PHASE2_DUNNING_ENABLED: true,
            BILLING_PHASE2_CARD_SETUP_ENABLED: true,
            BILLING_PHASE2_FORCE_MANUAL_FALLBACK_ENABLED: true,
            BILLING_EMAIL_NOTIFICATIONS_ENABLED: false,
            BILLING_PHASE2_REQUIRE_STEP_UP: false,
            BILLING_PHASE2_ALLOWED_COHORTS: "pilot-a",
            BILLING_PHASE2_DEFAULT_COHORT: "pilot-a",
            BILLING_PHASE2_SETUP_CALLBACK_TOLERANCE_SECONDS: "300",
            BILLING_PUBLIC_URL: "https://app.example",
            BILLING_PHASE2_STEP_UP_SECRETConfigured: true,
            BILLING_PHASE2_STEP_UP_SECRETMasked: "********",
          },
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      requestReconciliation: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      manualMarkPaid: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      reverseWrongDowngrade: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      sendInvoiceNotification: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      createSupportRecoveryCase: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      uploadRecoveryEvidence: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      regenerateInvoiceDocument: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      syncHeader: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      replacePaidInvoice: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      cancelInvoice: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      reopenInvoice: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      cancelStalePaymentAttempt: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      regeneratePaymentAttempt: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      applyMissingCredits: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      applyMissingSubscriptionRenewal: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      upsertSellerProfile: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      upsertTaxPolicy: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      reserveInvoiceNumber: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      createRenewalInvoice: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      pauseRenewalDunning: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      resumeRenewalDunning: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      fallbackInvoiceToManualCollection: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      forceRetryRenewalAttempt: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      revokePaymentMethod: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      forceDisableAutoRenew: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      updateBeamProviderSettings: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      updateBillingRuntimeSettings: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

import AdminBillingCenter from "./AdminBillingCenter";

describe("AdminBillingCenter", () => {
  it("renders invoice search, recovery case tools, renewal attempts, and payment method settings", () => {
    render(<AdminBillingCenter />);

    expect(screen.getByText("Invoices, recovery, and document operations")).toBeInTheDocument();
    expect(screen.getAllByText("Recent invoices").length).toBeGreaterThan(0);
    expect(screen.getByText("Support recovery cases")).toBeInTheDocument();
    expect(screen.getAllByText("TH-INV-2026-000301").length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Billing Settings" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Renewals" })).toBeInTheDocument();
  });
});
