/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import MiniAppRoute from "../MiniAppRoute";

const mocks = vi.hoisted(() => ({
  params: { publicAppId: "research-notes" },
  miniAppParams: { appId: "" },
  routeMode: "legacy",
  setLocation: vi.fn(),
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
  adoptionMutation: { mutate: vi.fn(), isPending: false, isSuccess: false, error: null, data: null },
  runtimeMutation: { mutateAsync: vi.fn(async () => ({ appId: "app_private", deploymentVersion: 1, storageToken: "test-scoped-storage-token", imported: 0, preserved: 0, verified: 0, migrationStatus: "VERIFIED" })), isPending: false },
  confirmMigrationMutation: { mutate: vi.fn(), isPending: false, isSuccess: false, error: null },
  provisionRepositoryMutation: { mutate: vi.fn(), isPending: false, isSuccess: false, error: null },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/miniapp/test", mocks.setLocation],
  useRoute: (path: string) => {
    const hasMiniApp = Boolean(mocks.miniAppParams.appId);
    const workspace = hasMiniApp && mocks.routeMode !== "canonical";
    if (path === "/miniapp/:appId/status") return [workspace && mocks.routeMode !== "downloads" && mocks.routeMode !== "settings", mocks.miniAppParams];
    if (path === "/miniapp/:appId/downloads") return [workspace && mocks.routeMode === "downloads", mocks.miniAppParams];
    if (path === "/miniapp/:appId/settings") return [workspace && mocks.routeMode === "settings", mocks.miniAppParams];
    if (path === "/miniapp/:appId") return [hasMiniApp && !workspace, mocks.miniAppParams];
    return [!hasMiniApp, mocks.params];
  },
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
      prepareMiniAppRuntime: {
        useMutation: () => mocks.runtimeMutation,
      },
      confirmRuntimeDataMigration: {
        useMutation: () => mocks.confirmMigrationMutation,
      },
      provisionMiniAppRepository: {
        useMutation: () => mocks.provisionRepositoryMutation,
      },
    },
    spec226DevelopmentControl: {
      retryMiniAppFactoryStage: { useMutation: () => mocks.retryMutation },
      startWorkspaceRun: { useMutation: () => mocks.continuationMutation },
      adoptPreparedMiniAppCandidate: { useMutation: () => mocks.adoptionMutation },
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
    mocks.routeMode = "legacy";
    mocks.setLocation = vi.fn();
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
    mocks.adoptionMutation = { mutate: vi.fn(), isPending: false, isSuccess: false, error: null, data: null };
    mocks.runtimeMutation = { mutateAsync: vi.fn(async () => ({ appId: "app_private", deploymentVersion: 1, storageToken: "test-scoped-storage-token", imported: 0, preserved: 0, verified: 0, migrationStatus: "VERIFIED" })), isPending: false };
    mocks.confirmMigrationMutation = { mutate: vi.fn(), isPending: false, isSuccess: false, error: null };
    mocks.provisionRepositoryMutation = { mutate: vi.fn(), isPending: false, isSuccess: false, error: null };
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
    expect(await screen.findByText("Building")).toBeInTheDocument();
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
    expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-forms");
    expect(frame).toHaveAttribute("srcdoc", "<!doctype html><main>Expense tracker</main>");
    expect(screen.queryByText("BUILDING")).not.toBeInTheDocument();
  });

  it("redirects the canonical entry to the development workspace when no usable artifact exists", async () => {
    mocks.routeMode = "canonical";
    mocks.miniAppParams = { appId: "app_no_preview" };
    mocks.appQuery.data = {
      app: { appId: "app_no_preview", visibility: "private", deploymentVersion: 0, lastKnownGoodArtifactRef: null },
      html: null,
      factory: { milestone: "BUILD_FAILED", jobState: "failed" },
    };
    render(<MiniAppRoute />);
    await waitFor(() => expect(mocks.setLocation).toHaveBeenCalledWith("/miniapp/app_no_preview/status"));
  });

  it("keeps the status workspace separate and exposes full-page runtime and settings actions", async () => {
    mocks.routeMode = "status";
    mocks.miniAppParams = { appId: "app_private" };
    mocks.appQuery.data = {
      app: {
        appId: "app_private",
        visibility: "private",
        deploymentVersion: 1,
        lastKnownGoodArtifactRef: "r2://mini-app-previews/tenant-owner/app_private/sha256/" + "a".repeat(64),
      },
      html: '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'">',
      artifactDigest: "a".repeat(64),
      factory: null,
    };
    render(<MiniAppRoute />);
    expect(await screen.findByRole("button", { name: "Open App" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(mocks.runtimeMutation.mutateAsync).toHaveBeenCalledWith({ appId: "app_private", legacyEntries: [] });
    expect(screen.getByTestId("miniapp-preview-frame")).toBeInTheDocument();
  });

  it("shows project settings as the primary content instead of the Progress workspace", async () => {
    mocks.routeMode = "settings";
    mocks.miniAppParams = { appId: "app_private_settings" };
    mocks.appQuery.data = {
      app: {
        appId: "app_private_settings",
        visibility: "private",
        deploymentVersion: 1,
        lastKnownGoodArtifactRef: "r2://mini-app-previews/tenant-owner/app_private_settings/sha256/" + "c".repeat(64),
      },
      html: "<!doctype html><main>Expense tracker</main>",
      artifactDigest: "c".repeat(64),
      factory: { repositoryState: "BOUND", repository: { owner: "owner", name: "expense-tracker", url: "https://github.com/owner/expense-tracker" } },
    };

    render(<MiniAppRoute />);

    expect(await screen.findByRole("heading", { name: "Project settings" })).toBeInTheDocument();
    expect(screen.getByText("App ID · app_private_settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "owner/expense-tracker" })).toHaveAttribute("href", "https://github.com/owner/expense-tracker");
    expect(screen.getByRole("button", { name: "Open App" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Back to Development" })).toBeEnabled();
    expect(screen.queryByRole("tab", { name: "Progress" })).not.toBeInTheDocument();
    expect(screen.queryByText("Development timeline")).not.toBeInTheDocument();
    expect(screen.queryByTestId("miniapp-progress-card")).not.toBeInTheDocument();
  });

  it("offers the pinned V2 adoption action only on the existing App Home and keeps prompt continuation separate", async () => {
    mocks.routeMode = "status";
    mocks.miniAppParams = { appId: "app_e6f0be051fd22e09bc4c5dff" };
    mocks.appQuery.data = {
      app: { appId: "app_e6f0be051fd22e09bc4c5dff", visibility: "private", deploymentVersion: 1, lastKnownGoodArtifactRef: "r2://mini-app-previews/tenant-owner/app_e6f0be051fd22e09bc4c5dff/sha256/" + "a".repeat(64), runtimeDataMigrationStatus: "OWNER_CONFIRMED" },
      html: "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'\">",
      artifactDigest: "a".repeat(64),
      factory: { conversationId: 1, milestone: "PREVIEW_AVAILABLE", isInProgress: false, completedStages: ["ui_implementation", "package", "deploy", "smoke"], remainingStages: [], artifacts: [] },
      deploymentVersions: [{ deploymentVersion: 1, artifactDigest: "a".repeat(64), developmentRunId: "run-v1" }],
    };
    render(<MiniAppRoute />);
    const button = await screen.findByRole("button", { name: "Use prepared V2 candidate" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mocks.adoptionMutation.mutate).toHaveBeenCalledWith({ appId: "app_e6f0be051fd22e09bc4c5dff" });
    expect(screen.getByRole("textbox", { name: "Continue development" })).toBeInTheDocument();
    expect(mocks.continuationMutation.mutate).not.toHaveBeenCalled();
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
        applicationTitle: "Personal Expense Tracker",
        goal: "Adopt the verified prepared Thai and THB candidate for the existing Mini-App",
        repositoryState: "AUTH_REQUIRED",
        remainingStages: ["package", "deploy"],
      },
    };

    render(<MiniAppRoute />);

    expect(await screen.findByTestId("miniapp-preview-frame")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Personal Expense Tracker" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open App" })).toBeEnabled();
    fireEvent.click(screen.getByRole("tab", { name: "Progress" }));
    expect(screen.getByText("Current Development Goal")).toBeInTheDocument();
    expect(screen.getByText("Adopt the verified prepared Thai and THB candidate for the existing Mini-App")).toBeInTheDocument();
    expect(screen.getByText(/Connect GitHub in Settings → Integrations/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Provision private repository from saved source" }));
    expect(mocks.provisionRepositoryMutation.mutate).toHaveBeenCalledWith({ appId: "app_private_progress" });
    expect(screen.getByText("Package app files")).toBeInTheDocument();
    expect(screen.getByText("Publish private preview")).toBeInTheDocument();
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

  it("keeps the App Home visible after a failed build and expands technical diagnostics", async () => {
    mocks.miniAppParams = { appId: "app_failed" };
    mocks.appQuery.data = {
      app: { appId: "app_failed", visibility: "private", deploymentVersion: 0, lastKnownGoodArtifactRef: null },
      html: null,
      factory: {
        milestone: "BUILD_FAILED",
        jobState: "failed",
        currentStage: "ui_implementation",
        latestStageJobId: "job-stage-1",
        retryable: true,
        isInProgress: false,
        remainingStages: ["ui_implementation", "package"],
        error: { code: "LLMStructuredOutputError", message: "The app generation response was incomplete." },
      },
    };

    render(<MiniAppRoute />);

    expect(await screen.findByRole("heading", { name: "app_failed" })).toBeInTheDocument();
    expect(screen.getByText("The app generation response was incomplete.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry / Repair" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
    expect(screen.getByText("Code: LLMStructuredOutputError")).toBeInTheDocument();
    expect(screen.getByText("Job: job-stage-1")).toBeInTheDocument();
  });

  it("shows a cancelled run as terminal instead of polling forever as BUILDING", async () => {
    mocks.miniAppParams = { appId: "app_cancelled" };
    mocks.appQuery.data = {
      app: { appId: "app_cancelled", visibility: "private", deploymentVersion: 0, lastKnownGoodArtifactRef: null },
      html: null,
      factory: { milestone: "BUILDING", jobState: "cancelled", isInProgress: false, remainingStages: ["ui_implementation"] },
    };
    render(<MiniAppRoute />);

    expect(await screen.findByRole("heading", { name: "Cancelled" })).toBeInTheDocument();
    const options = mocks.resolveMiniApp.mock.calls[0]?.[1] as { refetchInterval?: (query: any) => number | false };
    expect(options.refetchInterval?.({ state: { data: mocks.appQuery.data } })).toBe(false);
  });

  it("submits feedback as a continuation of the same App Workspace", async () => {
    mocks.miniAppParams = { appId: "app_existing" };
    mocks.appQuery.data = {
      app: { appId: "app_existing", visibility: "private", deploymentVersion: 1, lastKnownGoodArtifactRef: "r2://preview", runtimeDataMigrationStatus: "OWNER_CONFIRMED" },
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
