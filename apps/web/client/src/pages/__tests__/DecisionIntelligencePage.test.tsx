/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DecisionIntelligencePage from "../DecisionIntelligencePage";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), invalidate: vi.fn(), refetch: vi.fn(),
  query: { data: [] as any[], isLoading: false, isFetching: false, isError: false, error: null as any },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ decisionIntelligence: { listProjects: { invalidate: mocks.invalidate } } }),
    decisionIntelligence: {
      listProjects: { useQuery: () => ({ ...mocks.query, refetch: mocks.refetch }) },
      listAnalysisRuns: { useQuery: () => ({ data: [], isLoading: false, isError: false, error: null }) },
      createProject: { useMutation: () => ({ mutateAsync: mocks.create, isPending: false }) },
    },
  },
}));

vi.mock("@/i18n", () => ({ i18n: { language: "en" } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("DecisionIntelligencePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query = { data: [], isLoading: false, isFetching: false, isError: false, error: null };
  });

  it("shows an actionable empty state and submits bounded project scope to the API", async () => {
    mocks.create.mockResolvedValue({ id: "project-1" });
    render(<DecisionIntelligencePage />);

    expect(screen.getByText("No projects yet")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "New project" })[0]!);
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Compare locations" } });
    fireEvent.change(screen.getByLabelText("Decision goal"), { target: { value: "Choose a safe site" } });
    fireEvent.change(screen.getByLabelText("Data domains (comma separated)"), { target: { value: "domain:flood, domain:access" } });
    fireEvent.change(screen.getByLabelText("Geographies (optional)"), { target: { value: "geo:TH-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      title: "Compare locations",
      projectJson: {
        version: "decision-project-v1",
        domainRefs: ["domain:flood", "domain:access"],
        geographyRefs: ["geo:TH-10"],
        goal: "Choose a safe site",
      },
    }));
  });

  it("exposes a retry action when the project API fails", () => {
    mocks.query = { data: [], isLoading: false, isFetching: false, isError: true, error: new Error("unavailable") };
    render(<DecisionIntelligencePage />);
    expect(screen.getByText("Could not load projects")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("opens a saved project and keeps lifecycle status read-only until an execution receipt exists", () => {
    mocks.query = {
      data: [{
        id: "project-7", title: "Warehouse site", status: "draft",
        projectJson: { goal: "Choose a safe location" },
      }],
      isLoading: false, isFetching: false, isError: false, error: null,
    };
    render(<DecisionIntelligencePage />);

    fireEvent.click(screen.getByRole("button", { name: "Open project" }));
    expect(screen.getByText(/Choose a safe location/)).toBeTruthy();
    expect(screen.getByText("No analysis result has been recorded yet")).toBeTruthy();
    expect(screen.getByLabelText("Status").textContent).toContain("Draft");
    expect(screen.queryByRole("combobox", { name: "Status" })).toBeNull();
  });
});
