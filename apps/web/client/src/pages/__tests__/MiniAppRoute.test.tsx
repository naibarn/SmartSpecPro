/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  retryMutation: { mutate: vi.fn(), isPending: false, isSuccess: false, error: null },
  continuationMutation: { mutate: vi.fn(), isPending: false, isSuccess: false, error: null },
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
    spec226DevelopmentControl: {
      retryMiniAppFactoryStage: { useMutation: () => mocks.retryMutation },
      startWorkspaceRun: { useMutation: () => mocks.continuationMutation },
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
    mocks.retryMutation = { mutate: vi.fn(), isPending: false, isSuccess: false, error: null };
    mocks.continuationMutation = { mutate: vi.fn(), isPending: false, isSuccess: false, error: null };
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
      app: {
        appId: "app_created",
        deploymentVersion: 0,
        lastKnownGoodArtifactRef: null,
      },
      html: null,
      factory: null,
    };
    render(<MiniAppRoute />);
    expect(await screen.findByText("BUILDING")).toBeInTheDocument();
    expect(await screen.findByText("Generation failed before a source snapshot was created.")).toBeInTheDocument();
    expect(mocks.resolveMiniApp).toHaveBeenCalledWith({ appId: "app_created" }, expect.objectContaining({ enabled: true, retry: false }));
  });

  it("renders a private last-known-good artifact in a script-only sandbox", async () => {
    mocks.miniAppParams = { appId: "app_private" };
    mocks.appQuery.data = {
      app: {
        appId: "app_private",
        visibility: "private",
        deploymentVersion: 1,
        lastKnownGoodArtifactRef: "r2://mini-app-previews/tenant-owner/app_private/sha256/" + "a".repeat(64),
      },
      html: "<!doctype html><main>Expense tracker</main>",
      artifactDigest: "a".repeat(64),
      factory: null,
    };
    render(<MiniAppRoute />);
    const frame = await screen.findByTestId("miniapp-preview-frame");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).toHaveAttribute("srcdoc", "<!doctype html><main>Expense tracker</main>");
    expect(screen.queryByText("BUILDING")).not.toBeInTheDocument();
  });

  it("keeps refreshing progress and displays repository setup while a preview is already usable", async () => {
    mocks.miniAppParams = { appId: "app_private_progress" };
    mocks.appQuery.data = {
      app: {
        appId: "app_private_progress",
        visibility: "private",
        deploymentVersion: 1,
        lastKnownGoodArtifactRef: "r2://mini-app-previews/tenant-owner/app_private_progress/sha256/" + "b".repeat(64),
      },
      html: "<!doctype html><main>Expense tracker</main>",
      artifactDigest: "b".repeat(64),
      factory: {
        milestone: "BUILDING",
        isInProgress: true,
        repositoryState: "AUTH_REQUIRED",
        remainingStages: ["package", "deploy"],
      },
    };

    render(<MiniAppRoute />);

    expect(await screen.findByTestId("miniapp-preview-frame")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Progress" }));
    expect(screen.getByText(/Connect GitHub in Settings → Integrations/)).toBeInTheDocument();
    expect(screen.getByText("Next stages: package → deploy")).toBeInTheDocument();
    const options = mocks.resolveMiniApp.mock.calls[0]?.[1] as { refetchInterval?: (query: any) => number | false };
    expect(options.refetchInterval?.({ state: { data: mocks.appQuery.data } })).toBe(2_000);
  });

  it("starts Retry / Repair for the same private App ID", async () => {
    mocks.miniAppParams = { appId: "app_failed" };
    mocks.appQuery.data = {
      app: { appId: "app_failed", visibility: "private", deploymentVersion: 0, lastKnownGoodArtifactRef: null },
      html: null,
      factory: { milestone: "BUILD_FAILED", jobState: "failed", currentStage: "ui_implementation", retryable: true, isInProgress: false, remainingStages: ["ui_implementation"] },
    };
    render(<MiniAppRoute />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry / Repair" }));
    expect(mocks.retryMutation.mutate).toHaveBeenCalledWith({ appId: "app_failed" });
  });

  it("submits feedback as a continuation of the same App Workspace", async () => {
    mocks.miniAppParams = { appId: "app_existing" };
    mocks.appQuery.data = {
      app: { appId: "app_existing", visibility: "private", deploymentVersion: 1, lastKnownGoodArtifactRef: "r2://preview" },
      html: "<main>existing</main>",
      factory: { milestone: "PREVIEW_AVAILABLE", conversationId: 73, isInProgress: false, remainingStages: [] },
    };
    render(<MiniAppRoute />);
    fireEvent.click(screen.getByRole("tab", { name: "Progress" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Continue development" }), { target: { value: "Add category filters" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue Development" }));
    expect(mocks.continuationMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({
      appId: "app_existing",
      conversationId: 73,
      prompt: "Add category filters",
      factoryMode: true,
    }));
  });
});
