/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResearchNotesPage from "../ResearchNotesPage";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  archiveNote: vi.fn(),
  invalidate: vi.fn(),
  appQuery: { data: { appId: "app-research" }, isLoading: false, isError: false, refetch: vi.fn() },
  projectsQuery: { data: [{ projectId: "project-one", title: "Research project" }], isLoading: false, isError: false, refetch: vi.fn() },
  notesQuery: { data: [], isLoading: false, isError: false },
}));

vi.mock("wouter", () => ({ useRoute: () => [true, { publicAppId: "public-research" }] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ researchNotes: {
      listProjects: { invalidate: mocks.invalidate },
      listNotes: { invalidate: mocks.invalidate },
    } }),
    appIdentity: { resolvePublicApp: { useQuery: () => mocks.appQuery } },
    researchNotes: {
      listProjects: { useQuery: () => mocks.projectsQuery },
      listNotes: { useQuery: () => mocks.notesQuery },
      createProject: { useMutation: () => ({ mutate: mocks.createProject, isPending: false }) },
      createNote: { useMutation: () => ({ mutate: mocks.createNote, isPending: false }) },
      updateNote: { useMutation: () => ({ mutate: mocks.updateNote, isPending: false }) },
      archiveNote: { useMutation: () => ({ mutate: mocks.archiveNote, isPending: false }) },
    },
  },
}));

describe("ResearchNotesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appQuery = { data: { appId: "app-research" }, isLoading: false, isError: false, refetch: vi.fn() };
    mocks.projectsQuery = { data: [{ projectId: "project-one", title: "Research project" }], isLoading: false, isError: false, refetch: vi.fn() };
    mocks.notesQuery = { data: [], isLoading: false, isError: false };
  });

  it("creates a project-scoped note through the authenticated Mini App API", async () => {
    render(<ResearchNotesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Create first note" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Note title/ }), { target: { value: "Interview source" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Research note/ }), { target: { value: "Customer interviews start next week." } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(mocks.createNote).toHaveBeenCalledWith({
      appId: "app-research",
      projectId: "project-one",
      title: "Interview source",
      content: "Customer interviews start next week.",
    }));
  });

  it("shows a recoverable app access error and retry action", () => {
    mocks.appQuery = { data: null, isLoading: false, isError: true, refetch: vi.fn() };
    render(<ResearchNotesPage />);
    expect(screen.getByText("This App is unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.appQuery.refetch).toHaveBeenCalledOnce();
  });
});
