import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRefetch = vi.fn();
const mockUseQuery = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    credits: {
      seriesUsageSummary: {
        useQuery: (input: unknown, options: unknown) => {
          mockUseQuery(input, options);
          return {
            data: {
              seriesId: 42,
              seriesTitle: "เรื่องทดสอบ",
              hasContext: true,
              coverage: "complete",
              creditsPerUsd: 1000,
              chargedCredits: 1500,
              refundedCredits: 250,
              netActualCredits: 1250,
              usdEstimate: 1.25,
              usageTransactionCount: 3,
              refundTransactionCount: 1,
              adjustmentTransactionCount: 0,
              transactionCount: 4,
              integrityExceptionTransactionCount: 0,
              integrityExceptionCredits: 0,
              firstUsedAt: null,
              lastUsedAt: null,
              asOfTransactionId: 99,
              refreshedAt: "2026-08-27T10:00:00.000Z",
            },
            isLoading: false,
            isError: false,
            isFetching: false,
            refetch: mockRefetch,
          };
        },
      },
    },
  },
}));

import { VerticalDramaSeriesCreditSummary } from "../VerticalDramaSeriesCreditSummary";

describe("VerticalDramaSeriesCreditSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows net credits and the 1000-credit USD estimate", () => {
    render(<VerticalDramaSeriesCreditSummary seriesId="42" lang="th" />);

    expect(screen.getByTestId("vd-series-credit-summary")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "แสดงหรือซ่อนรายละเอียดค่าใช้จ่ายของเรื่องนี้",
      })
    );
    expect(screen.getByText("1,250")).toBeInTheDocument();
    expect(screen.getByText("$1.2500")).toBeInTheDocument();
    expect(screen.getByText(/1,000 เครดิต = \$1/)).toBeInTheDocument();
    expect(screen.getByText("ข้อมูลครบ")).toBeInTheDocument();
  });

  it("starts collapsed and reveals the detailed cost metrics when opened", () => {
    const { unmount } = render(
      <VerticalDramaSeriesCreditSummary seriesId="42" lang="en" />
    );

    const toggle = screen.getByRole("button", {
      name: "Show or hide series cost details",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("1,250")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("1,250")).toBeVisible();
    expect(screen.getByText("Complete")).toBeVisible();

    unmount();
    render(<VerticalDramaSeriesCreditSummary seriesId="42" lang="en" />);
    expect(
      screen.getByRole("button", { name: "Show or hide series cost details" })
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("configures live refresh and supports an immediate manual refresh", () => {
    render(<VerticalDramaSeriesCreditSummary seriesId="42" lang="en" />);

    const [, options] = mockUseQuery.mock.calls[0] as [
      unknown,
      {
        retry: boolean;
        refetchInterval: (query: {
          state: { status: string };
        }) => number | false;
        refetchOnWindowFocus: boolean;
        refetchOnReconnect: boolean;
      },
    ];
    expect(options.retry).toBe(false);
    expect(options.refetchInterval({ state: { status: "success" } })).toBe(
      15_000
    );
    expect(options.refetchInterval({ state: { status: "error" } })).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(true);
    expect(options.refetchOnReconnect).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Refresh series cost" })
    );
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
