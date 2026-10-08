/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useOverview, useBySkill, useStaleList, useCostBreakdown } = vi.hoisted(() => ({
  useOverview: vi.fn(),
  useBySkill: vi.fn(),
  useStaleList: vi.fn(),
  useCostBreakdown: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    contentQuality: {
      getOverview: { useQuery: useOverview },
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
});
