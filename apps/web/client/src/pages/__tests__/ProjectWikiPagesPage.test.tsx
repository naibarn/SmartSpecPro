/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProjectWikiPagesPage from "../ProjectWikiPagesPage";

const mocks = vi.hoisted(() => ({
  createPage: vi.fn(),
  updatePage: vi.fn(),
  archivePage: vi.fn(),
  invalidate: vi.fn(),
  projectsQuery: { data: [{ projectId: "project-one", title: "Operations" }], isLoading: false, isError: false, refetch: vi.fn() },
  pagesQuery: { data: [], isLoading: false, isError: false, refetch: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ projectWikiPages: { listPages: { invalidate: mocks.invalidate } } }),
    projectWikiPages: {
      listProjects: { useQuery: () => mocks.projectsQuery },
      listPages: { useQuery: () => mocks.pagesQuery },
      createPage: { useMutation: () => ({ mutate: mocks.createPage, isPending: false }) },
      updatePage: { useMutation: () => ({ mutate: mocks.updatePage, isPending: false }) },
      archivePage: { useMutation: () => ({ mutate: mocks.archivePage, isPending: false }) },
    },
  },
}));

describe("ProjectWikiPagesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectsQuery = { data: [{ projectId: "project-one", title: "Operations" }], isLoading: false, isError: false, refetch: vi.fn() };
    mocks.pagesQuery = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  });

  it("creates a project-scoped wiki page through the authenticated Mini App API", async () => {
    render(<ProjectWikiPagesPage appId="app_project_wiki_pages" />);
    fireEvent.change(screen.getByRole("textbox", { name: /Page title/ }), { target: { value: "On-call guide" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Page path/ }), { target: { value: "operations/on-call" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Page content/ }), { target: { value: "Escalation steps." } });
    fireEvent.click(screen.getByRole("button", { name: "Create page" }));

    await waitFor(() => expect(mocks.createPage).toHaveBeenCalledWith({
      appId: "app_project_wiki_pages",
      projectId: "project-one",
      title: "On-call guide",
      path: "operations/on-call",
      content: "Escalation steps.",
    }));
  });

  it("requires an explicit confirmation before archiving a page", () => {
    mocks.pagesQuery = {
      data: [{ pageId: "page-one", title: "Start here", path: "start-here", content: "Intro", contentHash: "a".repeat(64) }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    render(<ProjectWikiPagesPage appId="app_project_wiki_pages" />);
    fireEvent.click(screen.getByRole("button", { name: "Start here/start-here" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive page" }));
    expect(mocks.archivePage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    expect(mocks.archivePage).toHaveBeenCalledWith({ appId: "app_project_wiki_pages", projectId: "project-one", pageId: "page-one" });
  });
});
