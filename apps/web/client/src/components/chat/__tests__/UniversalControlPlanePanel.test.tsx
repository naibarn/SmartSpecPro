/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  summaryQuery: vi.fn(),
  taskGroupsQuery: vi.fn(),
  devicesQuery: vi.fn(),
  runnersQuery: vi.fn(),
  connectionsQuery: vi.fn(),
  cancelMutation: vi.fn(),
  developmentRunsQuery: vi.fn(),
  developmentRunQuery: vi.fn(),
  developmentEventsQuery: vi.fn(),
  developmentCommandMutation: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workerJobs: {
      dashboardSummary: {
        useQuery: (...args: unknown[]) => mocks.summaryQuery(...args),
      },
      taskGroups: {
        useQuery: (...args: unknown[]) => mocks.taskGroupsQuery(...args),
      },
      cancelQueued: {
        useMutation: (...args: unknown[]) => mocks.cancelMutation(...args),
      },
    },
    spec226DevelopmentControl: {
      list: {
        useQuery: (...args: unknown[]) => mocks.developmentRunsQuery(...args),
      },
      get: {
        useQuery: (...args: unknown[]) => mocks.developmentRunQuery(...args),
      },
      events: {
        useQuery: (...args: unknown[]) => mocks.developmentEventsQuery(...args),
      },
      command: {
        useMutation: (...args: unknown[]) =>
          mocks.developmentCommandMutation(...args),
      },
    },
    connectedDevices: {
      list: { useQuery: (...args: unknown[]) => mocks.devicesQuery(...args) },
    },
    runnerNodes: {
      list: { useQuery: (...args: unknown[]) => mocks.runnersQuery(...args) },
    },
    mcpConnections: {
      listConnections: {
        useQuery: (...args: unknown[]) => mocks.connectionsQuery(...args),
      },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { UniversalControlPlanePanel } from "../UniversalControlPlanePanel";

const emptyQuery = {
  data: undefined,
  isLoading: false,
  isFetching: false,
  error: null,
  refetch: mocks.refetch,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.summaryQuery.mockReturnValue(emptyQuery);
  mocks.taskGroupsQuery.mockReturnValue({
    ...emptyQuery,
    data: {
      groups: [],
      hasMore: false,
      nextOffset: 25,
      sourceTruncated: false,
    },
  });
  mocks.devicesQuery.mockReturnValue({ ...emptyQuery, data: { devices: [] } });
  mocks.runnersQuery.mockReturnValue({ ...emptyQuery, data: { runners: [] } });
  mocks.connectionsQuery.mockReturnValue({ ...emptyQuery, data: [] });
  mocks.cancelMutation.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  });
  mocks.developmentRunsQuery.mockReturnValue({
    ...emptyQuery,
    data: [],
  });
  mocks.developmentRunQuery.mockReturnValue(emptyQuery);
  mocks.developmentEventsQuery.mockReturnValue({
    ...emptyQuery,
    data: { events: [], nextCursor: 0 },
  });
  mocks.developmentCommandMutation.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  });
});

describe("UniversalControlPlanePanel", () => {
  it("renders loading and partial-error states without hiding the control surface", () => {
    mocks.summaryQuery.mockReturnValue({ ...emptyQuery, isLoading: true });
    mocks.connectionsQuery.mockReturnValue({
      ...emptyQuery,
      error: new Error("MCP unavailable"),
    });

    render(
      <UniversalControlPlanePanel
        conversationId={42}
        onClose={vi.fn()}
        onOpenPrompt={vi.fn()}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Task Control Center" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Checking execution readiness...")
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("MCP unavailable");
  });

  it("shows real job, runner, and MCP states and returns a task to Chat composer", () => {
    const onOpenPrompt = vi.fn();
    mocks.summaryQuery.mockReturnValue({
      ...emptyQuery,
      data: {
        counts: {
          pending: 1,
          queued: 2,
          active: 1,
          running: 1,
          waitingExternal: 0,
          retryScheduled: 0,
          succeeded: 4,
          failed: 0,
          canceled: 0,
          expired: 0,
          stale: 0,
        },
        capacity: {
          workersTotal: 1,
          workersOnline: 1,
          workersStale: 0,
          freeSlots: 2,
          capacityKnown: true,
        },
        outbox: { pending: 0, failed: 0, quarantined: 0 },
        alerts: {
          hasIncident: false,
          capacityExhausted: false,
          capacityUnknown: false,
        },
      },
    });
    mocks.taskGroupsQuery.mockReturnValue({
      ...emptyQuery,
      data: {
        groups: [
          {
            groupId: "job:job-1",
            groupKind: "single",
            title: "video.render",
            status: "running",
            progressPercent: 55,
            completedSteps: 0,
            totalSteps: 1,
            activeStepId: "job-1",
            metadataState: "clean",
            latestEvent: { message: "Rendering", phase: "rendering" },
            jobs: [
              {
                id: "job-1",
                jobType: "video.render",
                status: "running",
                progressPercent: 55,
                progressPhase: "rendering",
                canCancel: true,
                orchestration: {
                  stepId: null,
                  stepIndex: null,
                  totalSteps: null,
                  dependsOnJobIds: [],
                },
                latestEvent: { message: "Rendering", phase: "rendering" },
                worker: {
                  displayName: "Studio Worker",
                  machineName: null,
                },
              },
            ],
          },
        ],
        hasMore: false,
        nextOffset: 25,
        sourceTruncated: false,
      },
    });
    mocks.devicesQuery.mockReturnValue({
      ...emptyQuery,
      data: {
        devices: [
          {
            deviceId: "worker-device",
            displayName: "Studio Worker",
            authKind: "worker_executor",
            status: "active",
            effectiveScopes: ["jobs:execute"],
          },
        ],
      },
    });
    mocks.runnersQuery.mockReturnValue({
      ...emptyQuery,
      data: {
        runners: [
          {
            runnerId: "runner-1",
            displayName: "Mac Runner",
            profile: "local_device",
            nodeKind: "local_device",
            status: "online",
            trustState: "trusted",
            snapshotRevision: "1",
            snapshotExpiresAt: null,
            lastSeenAt: null,
            platform: {
              os: "macos",
              architecture: "aarch64",
              target: "aarch64-apple-darwin",
            },
            displayState: "ready",
            toolCount: 6,
            capabilityCount: 3,
            toolInventory: [
              {
                id: "codex-cli",
                label: "Codex CLI",
                kind: "tool",
                version: "1.2.3",
                status: "ready",
                availability: "available",
                auth: "authenticated",
                health: "healthy",
                policy: null,
                reasonCodes: [],
              },
            ],
            capabilityInventory: [
              {
                id: "code.edit",
                label: "codex-cli",
                kind: "capability",
                version: "sah-cap-v1",
                status: "allowed",
                availability: "available",
                auth: null,
                health: null,
                policy: "allowed",
                reasonCodes: [],
              },
            ],
          },
        ],
      },
    });
    mocks.connectionsQuery.mockReturnValue({
      ...emptyQuery,
      data: [
        {
          id: "mcp-1",
          displayName: "Media MCP",
          providerDisplayName: "Media MCP",
          status: "connected",
          connectionScope: "personal",
          allowedAssetTypes: ["image"],
        },
      ],
    });

    render(
      <UniversalControlPlanePanel
        conversationId={42}
        onClose={vi.fn()}
        onOpenPrompt={onOpenPrompt}
      />
    );

    expect(screen.getByText("video.render")).toBeInTheDocument();
    expect(screen.getByText("Mac Runner")).toBeInTheDocument();
    expect(screen.getByText(/Studio Worker/)).toBeInTheDocument();
    expect(screen.getByText("Media MCP")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Expand runner Mac Runner" })
    );
    expect(screen.getByText("Codex CLI · 1.2.3")).toBeInTheDocument();
    expect(screen.getByText("code.edit · codex-cli")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Safe inventory projection; paths and credentials are hidden."
      )
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Task to run"), {
      target: { value: "Create a storyboard" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add to chat composer" })
    );
    expect(onOpenPrompt).toHaveBeenCalledWith("Create a storyboard");
  });

  it("expands a multi-step task and exposes each step's progress and state", () => {
    mocks.taskGroupsQuery.mockReturnValue({
      ...emptyQuery,
      data: {
        groups: [
          {
            groupId: "plan:plan-42",
            groupKind: "plan",
            title: "Plan plan-42",
            status: "running",
            progressPercent: 42,
            completedSteps: 1,
            totalSteps: 3,
            activeStepId: "plan-42:step:2",
            metadataState: "clean",
            latestEvent: { message: "Generating images", phase: "image" },
            jobs: [
              {
                id: "step-job-1",
                jobType: "storyboard.plan",
                status: "succeeded",
                progressPercent: 100,
                progressPhase: "done",
                canCancel: false,
                orchestration: {
                  stepId: "plan-42:step:1",
                  stepIndex: 1,
                  totalSteps: 3,
                  dependsOnJobIds: [],
                },
                latestEvent: { message: "Plan ready", phase: "done" },
                worker: null,
              },
              {
                id: "step-job-2",
                jobType: "storyboard.images",
                status: "running",
                progressPercent: 26,
                progressPhase: "image",
                canCancel: true,
                orchestration: {
                  stepId: "plan-42:step:2",
                  stepIndex: 2,
                  totalSteps: 3,
                  dependsOnJobIds: ["step-job-1"],
                },
                latestEvent: { message: "Generating images", phase: "image" },
                worker: { displayName: "Image Worker", machineName: null },
              },
            ],
          },
        ],
        hasMore: false,
        nextOffset: 25,
        sourceTruncated: false,
      },
    });

    render(
      <UniversalControlPlanePanel
        conversationId={42}
        onClose={vi.fn()}
        onOpenPrompt={vi.fn()}
      />
    );

    expect(
      screen.getByText("1/3 steps · 42% · Active: plan-42:step:2")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Step 1/3 · storyboard.plan")
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Expand task Plan plan-42" })
    );

    expect(screen.getByText("Step 1/3 · storyboard.plan")).toBeInTheDocument();
    expect(
      screen.getByText("Step 2/3 · storyboard.images")
    ).toBeInTheDocument();
    expect(screen.getAllByText("Generating images")).toHaveLength(2);
    expect(
      screen.getByRole("progressbar", { name: "Step 2/3 progress" })
    ).toHaveAttribute("aria-valuenow", "26");
    expect(
      screen.getByRole("button", { name: "Cancel step 2/3" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse task Plan plan-42" })
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("shows canonical DevelopmentRun state and controls it with the returned fence", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ accepted: true });
    mocks.developmentRunsQuery.mockReturnValue({
      ...emptyQuery,
      data: [
        {
          bridgeVersion: "spec-226-development-control-v1",
          runId: "run-226-ui",
          state: "IMPLEMENT",
          phaseAttempt: 2,
          maxPhaseAttempts: 3,
          workerJobId: "job-226-ui",
          fencingVersion: 7,
          revision: 3,
          eventSequence: 9,
          nextSafeAction: { command: "RUN_PHASE", phase: "BUILD" },
          actions: { pause: true, cancel: true },
        },
      ],
    });
    mocks.developmentCommandMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

    render(
      <UniversalControlPlanePanel
        conversationId={42}
        onClose={vi.fn()}
        onOpenPrompt={vi.fn()}
      />
    );

    expect(screen.getByText("Development runs")).toBeInTheDocument();
    expect(screen.getByText("run-226-ui")).toBeInTheDocument();
    expect(screen.getByText("implement")).toBeInTheDocument();
    expect(
      screen.getByText("Next safe action: run phase · build")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pause run run-226-ui" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel run run-226-ui" })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Expand development run run-226-ui" })
    );
    expect(mocks.developmentRunQuery).toHaveBeenLastCalledWith(
      { runId: "run-226-ui" },
      expect.objectContaining({ enabled: true })
    );
    expect(mocks.developmentEventsQuery).toHaveBeenLastCalledWith(
      { runId: "run-226-ui", afterSequence: 0, limit: 50 },
      expect.objectContaining({ enabled: true })
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Pause run run-226-ui" })
    );
    await vi.waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        runId: "run-226-ui",
        action: "pause",
        expectedRevision: 3,
        expectedFencingVersion: 7,
        idempotencyKey: "spec226-ui:run-226-ui:pause:3:7",
      })
    );
  });

  it("does not render DevelopmentRun controls when the canonical view disallows them", () => {
    mocks.developmentRunsQuery.mockReturnValue({
      ...emptyQuery,
      data: [
        {
          bridgeVersion: "spec-226-development-control-v1",
          runId: "run-226-done",
          state: "COMPLETED",
          phaseAttempt: 1,
          maxPhaseAttempts: 1,
          workerJobId: null,
          fencingVersion: 4,
          revision: 8,
          eventSequence: 4,
          nextSafeAction: { command: "STOP", reason: "COMPLETED" },
          actions: { pause: false, cancel: false },
        },
      ],
    });

    render(
      <UniversalControlPlanePanel
        conversationId={42}
        onClose={vi.fn()}
        onOpenPrompt={vi.fn()}
      />
    );

    expect(screen.getByText("run-226-done")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pause run run-226-done" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel run run-226-done" })
    ).not.toBeInTheDocument();
  });
});
