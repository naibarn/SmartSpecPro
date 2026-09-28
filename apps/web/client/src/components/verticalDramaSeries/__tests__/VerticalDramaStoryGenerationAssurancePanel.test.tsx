import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerticalDramaStoryGenerationAssurancePanel } from "../VerticalDramaStoryGenerationAssurancePanel";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ verticalDramaSeries: { getStoryGenerationRun: { invalidate: vi.fn() } } }),
    verticalDramaSeries: {
      getStoryGenerationRun: { useQuery: () => ({ data: { status: "partial", stage: "generation", eventCursor: 2, resumable: true, report: null } }) },
      resumeStoryGeneration: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      repairStoryGeneration: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      cancelStoryGeneration: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      approveStoryGenerationRepair: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

describe("VerticalDramaStoryGenerationAssurancePanel", () => {
  it("shows a partial run as resumable rather than successful", () => {
    render(<VerticalDramaStoryGenerationAssurancePanel lang="th" seriesId="1" runId="run-1" />);
    expect(screen.getByTestId("vd-story-generation-assurance-status")).toHaveTextContent("สร้างได้บางส่วน");
    expect(screen.getByRole("button", { name: /ทำต่อจาก checkpoint/ })).toBeInTheDocument();
  });
});
