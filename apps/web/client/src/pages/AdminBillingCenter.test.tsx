import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
    customerEmail: "customer@example.com",
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
  createdAt: "2026-03-30T00:00:00.000Z",
  paidAt: null,
  defaultDocumentLanguage: "th",
  invoiceStream: "domestic",
  billingCycleStart: "2026-04-01T00:00:00.000Z",
  billingCycleEnd: "2026-04-30T23:59:59.000Z",
  buyerSnapshotJson: { legalNameTh: "ลูกค้าทดสอบ" },
  sellerSnapshotJson: { entityNameTh: "SmartSpecPro Co., Ltd." },
};
const selectedInvoiceAuditData = {
  invoice: selectedInvoiceData,
  customer: { id: 42, name: "ลูกค้าทดสอบ", email: "customer@example.com" },
  lineItems: [
    {
      id: 1,
      invoiceId: 301,
      itemType: "credit_package",
      description: "<div class=\"space-y-2\"><p class=\"font-medium text-primary\">Most Popular - Best value for regular users</p><ul><li>10,000 credits</li><li>Priority support</li></ul></div>",
      quantity: "1.00",
      unitPrice: "10.00",
      amount: "10.00",
      metadataJson: { packageName: "Standard", packageCode: "starter", credits: 1000 },
      createdAt: "2026-03-30T00:00:00.000Z",
    },
  ],
  payments: [
    {
      id: 901,
      invoiceId: 301,
      provider: "promptpay",
      paymentChannel: "promptpay_direct_manual",
      status: "paid",
      amount: "417.41",
      currency: "THB",
      expectedAmount: "417.41",
      expectedCurrency: "THB",
      sourceAmountUsd: "10.00",
      sourceCurrency: "USD",
      paidAt: "2026-03-30T01:00:00.000Z",
      businessEffectStatus: "applied",
      createdAt: "2026-03-30T00:10:00.000Z",
      slips: [
        {
          id: 77,
          paymentId: 901,
          invoiceId: 301,
          userId: 42,
          tenantId: null,
          originalFileName: "promptpay-slip.png",
          mimeType: "image/png",
          fileSizeBytes: 102400,
          status: "accepted",
          customerNote: null,
          rejectionReason: null,
          uploadedAt: "2026-03-30T00:20:00.000Z",
          reviewedAt: "2026-03-30T01:05:00.000Z",
          reviewedBy: 1,
          reviewer: { id: 1, name: "Billing Admin", email: "admin@example.com" },
          createdAt: "2026-03-30T00:20:00.000Z",
          updatedAt: "2026-03-30T01:05:00.000Z",
        },
      ],
      attempts: [],
      rawResponseJson: null,
    },
  ],
  auditLogs: [
    {
      id: 1,
      invoiceId: 301,
      action: "promptpay_payment_approved",
      actorId: 1,
      reason: "Slip verified",
      beforeJson: { paymentId: 901, status: "manual_review_required" },
      afterJson: { paymentId: 901, status: "paid" },
      createdAt: "2026-03-30T01:05:00.000Z",
      actor: { id: 1, name: "Billing Admin", email: "admin@example.com" },
    },
  ],
};
const promptPayReviewQueueData = [
  {
    payment: {
      id: 902,
      invoiceId: 302,
      paymentChannel: "promptpay_direct_manual",
      status: "manual_review_required",
      expectedAmount: "413.01",
    },
    invoice: { id: 302, invoiceNumber: "TH-INV-2026-000302", userId: 42 },
    user: { email: "customer@example.com" },
  },
];
const promptPayReviewData = {
  payment: promptPayReviewQueueData[0].payment,
  invoice: promptPayReviewQueueData[0].invoice,
  user: promptPayReviewQueueData[0].user,
  slips: [
    {
      id: 78,
      originalFileName: "review-slip.png",
      mimeType: "image/png",
      status: "submitted",
      uploadedAt: "2026-03-30T00:20:00.000Z",
    },
  ],
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
        getPromptPaySlipAccess: { fetch: vi.fn().mockResolvedValue({ url: "https://cdn.example/slip.png" }) },
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
      listPromptPayReviewQueue: {
        useQuery: () => ({
          data: promptPayReviewQueueData,
          refetch: vi.fn().mockResolvedValue(undefined),
          isFetching: false,
        }),
      },
      getPromptPayReview: {
        useQuery: ({ paymentId }: { paymentId: number }) => ({
          data: paymentId ? promptPayReviewData : null,
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listRecoveryCases: {
        useQuery: () => ({
          data: [],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      getInvoiceAuditDetails: {
        useQuery: () => ({
          data: selectedInvoiceAuditData,
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
            BILLING_TOPUP_PENDING_RETENTION_DAYS: "15",
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
      approvePromptPayPayment: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      rejectPromptPayPayment: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      clearStaleTopupInvoices: {
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
  it("renders invoice search, recovery case tools, renewal attempts, and payment method settings", async () => {
    render(<AdminBillingCenter />);

    expect(screen.getByText("Invoices, recovery, and document operations")).toBeInTheDocument();
    expect(screen.getAllByText("Invoices").length).toBeGreaterThan(0);
    expect(screen.getByText("Support recovery cases")).toBeInTheDocument();
    expect(screen.getAllByText("TH-INV-2026-000301").length).toBeGreaterThan(0);
    expect(screen.getAllByText("customer@example.com").length).toBeGreaterThan(1);
    expect(screen.getByText("Standard credit package")).toBeInTheDocument();
    expect(screen.getByText("Most Popular - Best value for regular users")).toBeInTheDocument();
    expect(screen.queryByText(/<div class=/)).not.toBeInTheDocument();
    expect(screen.getByText("Source amount (USD)")).toBeInTheDocument();
    expect(screen.getByText("promptpay-slip.png")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getAllByText(/admin@example\.com/).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Billing Settings" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Renewals" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("promptpay-slip.png").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Expand invoice slip preview" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Approve & add credits" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Expand invoice slip preview" }));
    expect(screen.getByRole("dialog", { name: "Full-screen invoice slip preview: promptpay-slip.png" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Full-screen invoice slip preview: promptpay-slip.png" })).not.toBeInTheDocument();
  });
});
