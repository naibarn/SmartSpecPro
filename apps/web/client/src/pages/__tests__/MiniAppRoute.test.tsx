/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MiniAppRoute from "../MiniAppRoute";

const mocks = vi.hoisted(() => ({
  params: { publicAppId: "research-notes" },
  miniAppParams: { appId: "" },
  appQuery: {
    data: { appId: "app_research_notes" },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  resolvePublicApp: vi.fn(),
  resolveMiniApp: vi.fn(),
}));

vi.mock("wouter", () => ({
  useRoute: (path: string) => [true, path === "/miniapp/:appId" ? mocks.miniAppParams : mocks.params],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    appIdentity: {
      resolvePublicApp: {
        useQuery: mocks.resolvePublicApp,
      },
      resolveMiniApp: {
        useQuery: mocks.resolveMiniApp,
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
    mocks.miniAppParams = { appId: "" };
    mocks.appQuery = {
      data: { appId: "app_research_notes" },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mocks.resolvePublicApp.mockImplementation(() => mocks.appQuery);
    mocks.resolveMiniApp.mockImplementation(() => mocks.appQuery);
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

  it("reports BUILDING when the canonical Mini App route has no runnable artifact", async () => {
    mocks.miniAppParams = { appId: "app_created" };
    mocks.appQuery.data = {
      appId: "app_created",
      deploymentVersion: 0,
      lastKnownGoodArtifactRef: null,
    };
    render(<MiniAppRoute />);
    expect(await screen.findByText("BUILDING")).toBeInTheDocument();
    expect(await screen.findByText("No runnable artifact is available yet. The Mini App will appear here after its build and deployment complete.")).toBeInTheDocument();
    expect(mocks.resolveMiniApp).toHaveBeenCalledWith({ appId: "app_created" }, { enabled: true, retry: false });
  });
});
