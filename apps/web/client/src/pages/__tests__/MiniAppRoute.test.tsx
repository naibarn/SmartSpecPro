/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MiniAppRoute from "../MiniAppRoute";

const mocks = vi.hoisted(() => ({
  params: { publicAppId: "research-notes" },
  appQuery: {
    data: { appId: "app_research_notes" },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  resolvePublicApp: vi.fn(),
}));

vi.mock("wouter", () => ({
  useRoute: () => [true, mocks.params],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    appIdentity: {
      resolvePublicApp: {
        useQuery: mocks.resolvePublicApp,
      },
    },
  },
}));

vi.mock("@/pages/ResearchNotesPage", () => ({
  default: () => "Research Notes runtime",
}));

vi.mock("@/pages/ProjectWikiPagesPage", () => ({
  default: ({ appId }: { appId: string }) => `Project Wiki runtime ${appId}`,
}));

describe("MiniAppRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.params = { publicAppId: "research-notes" };
    mocks.appQuery = {
      data: { appId: "app_research_notes" },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mocks.resolvePublicApp.mockImplementation(() => mocks.appQuery);
  });

  it("renders Research Notes only for its canonical App identity", async () => {
    render(<MiniAppRoute />);

    expect(await screen.findByText("Research Notes runtime")).toBeInTheDocument();
    expect(mocks.resolvePublicApp).toHaveBeenCalledWith(
      { publicAppId: "research-notes" },
      { enabled: true, retry: false },
    );
  });

  it("renders the Project Wiki runtime for its canonical App identity", async () => {
    mocks.appQuery.data = { appId: "app_project_wiki_pages" };

    render(<MiniAppRoute />);

    expect(await screen.findByText("Project Wiki runtime app_project_wiki_pages")).toBeInTheDocument();
  });

  it("does not route an unrelated active App into Research Notes", async () => {
    mocks.appQuery.data = { appId: "app_unimplemented" };

    render(<MiniAppRoute />);

    expect(await screen.findByText("This App is not supported yet")).toBeInTheDocument();
    expect(screen.queryByText("Research Notes runtime")).not.toBeInTheDocument();
  });
});
