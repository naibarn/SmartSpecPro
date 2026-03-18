/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PersonasPanel } from "./PersonasPanel";

const { invalidateList, trackPersonaTemplateApplied } = vi.hoisted(() => ({
  invalidateList: vi.fn(),
  trackPersonaTemplateApplied: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      persona: {
        list: {
          invalidate: invalidateList,
        },
      },
    }),
    persona: {
      list: {
        useQuery: () => ({
          data: [],
          isLoading: false,
        }),
      },
      create: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      update: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      delete: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      setUserDefault: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@/lib/analytics/personaEvents", () => ({
  trackPersonaTemplateApplied,
}));

describe("PersonasPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads reviewed persona templates into the form", async () => {
    const user = userEvent.setup();

    render(<PersonasPanel />);

    await user.click(screen.getByRole("button", { name: /new persona/i }));
    await user.click(screen.getByRole("button", { name: /templates/i }));
    await user.click(screen.getByRole("button", { name: /financial analyst/i }));

    expect(screen.getByDisplayValue("Financial Analyst")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/a financial analyst who evaluates budgets/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("State clearly that the analysis is informational and not regulated investment advice."),
    ).toBeInTheDocument();
    expect(trackPersonaTemplateApplied).toHaveBeenCalledWith(
      expect.objectContaining({
        applyMode: "single",
        templateIds: ["financial-analyst"],
      }),
    );
  });

  it("supports mixing templates for multi-role personas", async () => {
    const user = userEvent.setup();

    render(<PersonasPanel />);

    await user.click(screen.getByRole("button", { name: /new persona/i }));
    await user.click(screen.getByRole("button", { name: /templates/i }));
    await user.click(screen.getByRole("button", { name: /mix templates/i }));
    await user.click(screen.getByRole("button", { name: /marketing strategist/i }));
    await user.click(screen.getByRole("button", { name: /financial analyst/i }));
    await user.click(screen.getByRole("button", { name: /apply combined template \(2\/3\)/i }));

    expect(screen.getByDisplayValue("Marketing Strategist + Financial Analyst")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/cross-functional AI copilot combining these professional perspectives/i),
    ).toBeInTheDocument();
    expect(trackPersonaTemplateApplied).toHaveBeenCalledWith(
      expect.objectContaining({
        applyMode: "mixed",
        templateCount: 2,
        templateIds: ["marketing-strategist", "financial-analyst"],
      }),
    );
  });
});
