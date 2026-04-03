import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockSetLocation = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/billing", mockSetLocation],
  useRoute: () => [false, null],
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: 42,
      plan: "starter",
      credits: 120,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      billing: {
        listDocuments: { fetch: vi.fn().mockResolvedValue([]) },
        getDocumentAccess: { fetch: vi.fn().mockResolvedValue(null) },
      },
    }),
    billing: {
      getProfile: {
        useQuery: () => ({ data: null, refetch: vi.fn().mockResolvedValue(undefined) }),
      },
      listInvoices: {
        useQuery: () => ({
          data: [
            {
              id: 901,
              invoiceNumber: "TH-INV-2026-000901",
              status: "manual_review_required",
              invoiceType: "subscription_renewal",
              totalAmount: "999.00",
              currency: "THB",
            },
          ],
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      getCurrentSubscription: {
        useQuery: () => ({
          data: {
            id: 77,
            planCode: "starter",
            status: "active",
            renewalMode: "auto_charge",
            currentPeriodStart: "2026-04-01T00:00:00.000Z",
            currentPeriodEnd: "2026-04-30T23:59:59.000Z",
            nextInvoiceAt: "2026-04-30T00:00:00.000Z",
            nextRetryAt: "2026-04-29T00:00:00.000Z",
            downgradedAt: null,
            downgradeReason: null,
          },
        }),
      },
      listPaymentMethods: {
        useQuery: () => ({
          data: [
            {
              id: 12,
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
              defaultPaymentMethodId: 12,
              autoRenewEnabled: true,
              consentWithdrawnAt: null,
            },
          },
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      getPaymentMethodCapabilities: {
        useQuery: () => ({
          data: {
            setupEnabled: true,
            hostedSetupTemplateConfigured: true,
            apiSetupConfigured: false,
            offSessionChargeEnabled: true,
          },
        }),
      },
      getPaymentMethodSetupSession: {
        useQuery: () => ({
          data: null,
        }),
      },
      listRenewalAttempts: {
        useQuery: () => ({
          data: [
            {
              id: 500,
              attemptNo: 1,
              status: "retry_scheduled",
              scheduledAt: "2026-04-25T00:00:00.000Z",
              nextRetryAt: "2026-04-26T00:00:00.000Z",
              failureMessage: null,
            },
          ],
        }),
      },
      getInvoice: {
        useQuery: () => ({
          data: {
            id: 901,
            invoiceNumber: "TH-INV-2026-000901",
            status: "manual_review_required",
            invoiceType: "subscription_renewal",
            totalAmount: "999.00",
            currency: "THB",
            issuedAt: "2026-04-01T00:00:00.000Z",
            dueAt: "2026-04-08T00:00:00.000Z",
            headerVersion: 2,
            defaultDocumentLanguage: "th",
          },
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
      listDocuments: {
        useQuery: () => ({
          data: [
            {
              id: 1,
              invoiceId: 901,
              documentLanguage: "th",
              documentVersion: 1,
              isLatestForLanguage: true,
              renderReason: "initial_issue",
              createdAt: "2026-04-01T00:00:00.000Z",
            },
          ],
        }),
      },
      listRecoveryCases: {
        useQuery: () => ({
          data: [
            {
              id: 1,
              invoiceId: 901,
              issueType: "payment_not_applied",
              status: "open",
              customerReportedAt: "2026-04-01T10:00:00.000Z",
              resolutionNote: "Investigating provider settlement.",
            },
          ],
        }),
      },
      upsertProfile: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      createTopupCheckout: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, data: null }),
      },
      refreshInvoiceStatus: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      createPaymentMethodSetupIntent: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      confirmPaymentMethodSetup: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      setDefaultPaymentMethod: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      removePaymentMethod: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      enableAutoRenew: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      disableAutoRenew: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

import BillingCenter from "./BillingCenter";

describe("BillingCenter", () => {
  it("renders subscription, payment methods, document variants, and recovery visibility", () => {
    render(<BillingCenter />);

    expect(screen.getByText("Invoices, profile, and Beam checkout")).toBeInTheDocument();
    expect(screen.getByText("Current billing subscription")).toBeInTheDocument();
    expect(screen.getByText("Saved payment methods")).toBeInTheDocument();
    expect(screen.getByText("Auto-renew")).toBeInTheDocument();
    expect(screen.getByText("Document variants")).toBeInTheDocument();
    expect(screen.getByText("Renewal attempts")).toBeInTheDocument();
    expect(screen.getByText("Recovery and investigation status")).toBeInTheDocument();
    expect(screen.getAllByText("TH-INV-2026-000901").length).toBeGreaterThan(0);
  });
});
