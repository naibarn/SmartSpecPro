/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const updateSettingMutateAsyncMock = vi.fn().mockResolvedValue(undefined);
const refetchMock = vi.fn().mockResolvedValue(undefined);
const mockFinanceSettings = [
  {
    key: "slip_mapping_presets",
    value: JSON.stringify({
      version: 1,
      presets: [
        {
          id: "internal-transfer",
          enabled: true,
          label: "Internal transfer",
          matchText: "transfer|โอนเงิน",
          transactionType: "transfer",
          categoryCode: "transfer.internal",
          counterpartyName: null,
          merchantName: null,
          note: "Internal transfer between bank accounts",
          priority: 110,
        },
      ],
    }),
  },
  {
    key: "pinned_merchant_presets",
    value: JSON.stringify({
      version: 1,
      presets: [],
    }),
  },
] as const;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      role: "admin",
      currentTenantId: "tenant-1",
    },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    systemSettings: {
      getSettingsByCategory: {
        useQuery: (input?: { category?: string }) => ({
          data: input?.category === "finance" ? mockFinanceSettings : [],
          isLoading: false,
          refetch: refetchMock,
        }),
      },
      updateSetting: {
        useMutation: () => ({
          mutateAsync: updateSettingMutateAsyncMock,
          isPending: false,
        }),
      },
    },
    finance: {
      listMerchantPinCandidates: {
        useQuery: () => ({
          data: [
            {
              id: 501,
              displayName: "Charge Point",
              normalizedName: "charge point",
              usageCount: 6,
              lastSeenAt: "2026-04-10T10:00:00.000Z",
              aliases: ["ChargePoint", "EV Charge Point"],
            },
            {
              id: 502,
              displayName: "Airport Cafe",
              normalizedName: "airport cafe",
              usageCount: 2,
              lastSeenAt: "2026-04-11T10:00:00.000Z",
              aliases: ["Airport", "Cafe Airport"],
            },
            {
              id: 503,
              displayName: "Charge Lane",
              normalizedName: "charge lane",
              usageCount: 1,
              lastSeenAt: "2026-04-09T10:00:00.000Z",
              aliases: ["ChargeLane", "Charge Line"],
            },
          ],
          isLoading: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ title, description, children }: any) => (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));

import FinanceSlipRulesPanel from "../FinanceSlipRulesPanel";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FinanceSlipRulesPanel", () => {
  it("lets admins pin a merchant from existing system candidates", async () => {
    render(<FinanceSlipRulesPanel />);

    expect(screen.getByText("Finance Rules")).toBeInTheDocument();
    expect(screen.getByText("Merchant pins")).toBeInTheDocument();
    expect(screen.getAllByText("Charge Point")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Pinned now").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /Pin merchant/i })[0]);

    await waitFor(() => {
      expect(screen.getByText("Pinned merchant 1")).toBeInTheDocument();
      expect(screen.getAllByDisplayValue("Charge Point").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Pinned now").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Charge Point").length).toBeGreaterThan(1);
      expect(screen.getByText("Save merchant pins")).toBeInTheDocument();
    });
  });

  it("can collapse and expand the pinned merchant drawer", async () => {
    render(<FinanceSlipRulesPanel />);

    expect(screen.getAllByText("Pinned now").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));

    await waitFor(() => {
      expect(screen.getByText(/Pinned merchants collapsed/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    await waitFor(() => {
      expect(screen.getAllByText("Pinned now").length).toBeGreaterThan(0);
      expect(screen.queryByText(/Pinned merchants collapsed/i)).not.toBeInTheDocument();
    });
  });

  it("keeps slip presets collapsed by default and can expand them on demand", async () => {
    render(<FinanceSlipRulesPanel />);

    expect(screen.getByText("Slip mapping presets")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show presets/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add preset/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show presets/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Hide presets/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Add preset/i })).toBeInTheDocument();
    });
  });

  it("ranks merchant suggestions by fuzzy search relevance", async () => {
    render(<FinanceSlipRulesPanel />);

    fireEvent.change(screen.getByLabelText(/Search existing merchants/i), {
      target: { value: "air" },
    });

    await waitFor(() => {
      const pinButtons = screen.getAllByRole("button", { name: /Pin merchant/i });
      expect(pinButtons.length).toBeGreaterThan(1);

      const firstCard = pinButtons[0].closest("div.rounded-2xl");
      expect(firstCard?.textContent).toContain("Airport Cafe");
      expect(firstCard?.textContent).not.toContain("Charge Point");
    });
  });

  it("filters merchant candidates with the pinned-only quick filter", async () => {
    render(<FinanceSlipRulesPanel />);

    fireEvent.click(screen.getAllByRole("button", { name: /Pin merchant/i })[0]);

    await waitFor(() => {
      expect(screen.getByText("Pinned merchant 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Pinned only/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Charge Point").length).toBeGreaterThan(1);
      expect(screen.queryByText("Airport Cafe")).not.toBeInTheDocument();
    });
  });

  it("auto-selects pinned-only when a search matches a pinned merchant", async () => {
    render(<FinanceSlipRulesPanel />);

    fireEvent.click(screen.getAllByRole("button", { name: /Pin merchant/i })[0]);

    await waitFor(() => {
      expect(screen.getByText("Pinned merchant 1")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Search existing merchants/i), {
      target: { value: "char" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Pinned only/i })).toHaveClass("bg-primary");
      expect(screen.getByText("Charge Point")).toBeInTheDocument();
      expect(screen.queryByText("Charge Lane")).not.toBeInTheDocument();
    });
  });
});
