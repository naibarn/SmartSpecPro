/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { useOverview, useStructuredDataIssues, useBySkill, useStaleList, useCostBreakdown } = vi.hoisted(() => ({
  useOverview: vi.fn(),
  useStructuredDataIssues: vi.fn(),
  useBySkill: vi.fn(),
  useStaleList: vi.fn(),
  useCostBreakdown: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    contentQuality: {
      getOverview: { useQuery: useOverview },
      getStructuredDataIssues: { useQuery: useStructuredDataIssues },
      getBySkill: { useQuery: useBySkill },
      getStaleList: { useQuery: useStaleList },
      getCostBreakdown: { useQuery: useCostBreakdown },
    },
    contentArtifacts: {
      refresh: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import ContentQualityDashboard from "../ContentQualityDashboard";

describe("ContentQualityDashboard structured data KPIs", () => {
  beforeEach(() => {
    useStructuredDataIssues.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useOverview.mockReturnValue({
      data: {
        total_artifacts: 3,
        active: 2,
        stale: 1,
        archived: 0,
        avg_citation_coverage: 0.8,
        structured_data_valid_count: 2,
        structured_data_invalid_count: 1,
      },
      refetch: vi.fn(),
    });
    useBySkill.mockReturnValue({ data: [] });
    useStaleList.mockReturnValue({ data: [], refetch: vi.fn() });
    useCostBreakdown.mockReturnValue({ data: [] });
  });

  it("shows counts for valid and invalid structured data", () => {
    render(<ContentQualityDashboard />);

    const validLabel = screen.getByText("Structured Data Valid");
    const invalidLabel = screen.getByText("Structured Data Invalid");

    expect(validLabel.parentElement?.parentElement?.textContent).toContain("2");
    expect(invalidLabel.parentElement?.parentElement?.textContent).toContain("1");
  });

  it("shows actionable validation failures for affected CMS artifacts", () => {
    useStructuredDataIssues.mockReturnValue({
      data: [{
        id: 42,
        title: "Review: Example Product",
        skill_slug: "product-reviewer",
        output_format: "cms_review",
        created_at: new Date("2026-10-08T10:00:00Z"),
        structured_data_errors: ["Missing required field: author", "Invalid @type"],
      }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ContentQualityDashboard />);

    expect(screen.getByText("Review: Example Product")).toBeInTheDocument();
    expect(screen.getByText("product-reviewer")).toBeInTheDocument();
    expect(screen.getByText("Missing required field: author")).toBeInTheDocument();
    expect(screen.getByText("Invalid @type")).toBeInTheDocument();
  });

  it("shows an explicit empty state when every artifact passes", () => {
    render(<ContentQualityDashboard />);

    expect(screen.getByText(/No structured data validation failures/)).toBeInTheDocument();
  });

  it("shows a loading state while validation failures are being fetched", () => {
    useStructuredDataIssues.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ContentQualityDashboard />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading structured data validation issues");
  });

  it("shows an error state and allows retrying the issues query", () => {
    const refetch = vi.fn();
    useStructuredDataIssues.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<ContentQualityDashboard />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load structured data validation issues");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("uses a clear fallback when a failed validation has no stored detail", () => {
    useStructuredDataIssues.mockReturnValue({
      data: [{
        id: 43,
        title: null,
        skill_slug: "article-writer",
        output_format: "cms_article",
        created_at: new Date("2026-10-08T10:00:00Z"),
        structured_data_errors: [],
      }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ContentQualityDashboard />);

    expect(screen.getByText("Artifact #43")).toBeInTheDocument();
    expect(screen.getByText("Validation failed; no detail was recorded.")).toBeInTheDocument();
  });
});
