import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const teamCreateMutateAsync = vi.fn();
const teamRoomCreateMutate = vi.fn();
const ownedWorkerBudgetMutate = vi.fn();
const teamRunStartMutate = vi.fn();
const teamRunStopMutate = vi.fn();
const {
  teamListDataRef,
  teamGetDataRef,
  teamRoomsRef,
  teamRunDetailRef,
  bindableWorkersRef,
  ownedWorkerBudgetRef,
  contextEngineHealthRef,
  routeParamsRef,
  locationRef,
} = vi.hoisted(() => ({
  teamListDataRef: { current: [] as any[] },
  teamGetDataRef: { current: undefined as any },
  teamRoomsRef: { current: [] as any[] },
  teamRunDetailRef: { current: undefined as any },
  bindableWorkersRef: { current: [] as any[] },
  ownedWorkerBudgetRef: { current: null as any },
  contextEngineHealthRef: { current: null as any },
  routeParamsRef: { current: null as any },
  locationRef: { current: "/teams" },
}));
const invalidateMocks = {
  teamList: vi.fn(),
  teamGet: vi.fn(),
  teamListBindableWorkers: vi.fn(),
  teamGetOwnedWorkerBudget: vi.fn(),
  teamRoomListByTeam: vi.fn(),
  teamRunGet: vi.fn(),
  teamWorkItemListByRoom: vi.fn(),
  personaList: vi.fn(),
};

function dispatchResize() {
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const setLocationMock = vi.fn((nextLocation: string) => {
  locationRef.current = nextLocation;
});

vi.mock("wouter", () => ({
  useLocation: () => [locationRef.current, setLocationMock],
  useRoute: () => [Boolean(routeParamsRef.current), routeParamsRef.current],
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const dictionary: Record<string, string> = {
        "teams.create.title": "New Team",
        "teams.create.createTeam": "Create Team",
        "teams.page.noTeamsYet": "No teams yet",
        "teams.page.selectTeam": "Select a team",
        "teams.rooms.createDialogTitle": "Create Room",
        "teams.rooms.createFirstRoom": "Create First Room",
        "teams.rooms.createRoom": "Create Room",
        "teams.rooms.legacyTypesNote":
          "Legacy room types are hidden from new room creation.",
        "teams.rooms.newRoom": "New Room",
        "teams.rooms.objectiveLabel": "Objective",
        "teams.rooms.objectivePlaceholder":
          "Describe what this team room should achieve.",
        "teams.rooms.roomTypeHelp":
          "Choose the room shape first and switch run mode later if needed.",
        "teams.rooms.roomTypeLabel": "Room type",
        "teams.rooms.title": "Rooms",
        "teams.roomType.autoTeam": "Auto Team",
        "teams.rooms.openRoomHint":
          "Pick a room from the compact switcher. The main view stays open.",
        "rooms.createdAtLabel": "Created at",
        "teams.rooms.backToRoomList": "Back to rooms",
        "teams.rooms.languageLabel": "Room language",
        "teams.rooms.languageHelp":
          "Choose the language used for room turns and prompts.",
        "teams.rooms.languageActive": "Default",
        "teams.rooms.sidebar.title": "Current room",
        "teams.rooms.sidebar.subtitle":
          "Room details stay visible even when the room rail is collapsed.",
        "teams.rooms.sidebar.roomId": "Room ID",
        "teams.rooms.sidebar.createdAt": "Created",
        "teams.rooms.sidebar.language": "Language",
        "teams.rooms.sidebar.autonomy": "Autonomy",
        "teams.rooms.sidebar.currentObjective": "Current objective",
        "teams.rooms.sidebar.runMode": "Run mode",
        "teams.rooms.sidebar.runStatus": "Run status",
        "teams.rooms.sidebar.currentPhase": "Current phase",
        "teams.rooms.sidebar.noCurrentPhase": "No active run yet",
        "teams.rooms.sidebar.noObjective": "No room objective yet",
        "teams.rooms.sidebar.collapseAll": "Collapse all",
        "teams.rooms.sidebar.expandAll": "Expand all",
        "teams.rooms.sidebar.workflowTitle": "Workflow",
        "teams.rooms.sidebar.workflowSubtitle":
          "Plan, approvals, and execution progress",
        "teams.rooms.sidebar.runMonitorTitle": "Run monitor",
        "teams.rooms.sidebar.runMonitorSubtitle":
          "Live job progress and checkpoints",
        "rooms.latestBadge": "Latest",
        "rooms.selectedBadge": "Selected",
        "teams.roomType.team": "Team room",
        "teams.run.stopAutomation": "Stop automation",
        "orchestrator.room.waitingForActivity": "Waiting for automation to continue...",
        "run.reason.repeatedWorkDetected":
          "Run paused because a repeated work pattern was detected.",
      };
      const template = dictionary[key] ?? key;
      if (!params) return template;
      return Object.entries(params).reduce(
        (acc, [paramKey, value]) =>
          acc.replaceAll(`{{${paramKey}}}`, String(value)),
        template
      );
    },
  }),
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlags: () => ({
    multiChannel: true,
    chatWidget: true,
    browserTool: true,
    canvas: true,
    voiceChat: true,
    webhookTriggers: true,
    costDisplay: true,
    personaSystem: true,
    crossAgency: true,
    channelRouter: true,
    automationCopilot: true,
    liveBrowser: true,
    responsesApi: true,
    taskPlannerEnabled: true,
    taskPlannerAgencyEscalation: true,
    chatBrowserSessionEntry: true,
    agencyBrowserSessionUi: true,
    workflowBrowserSessionNodes: true,
    publicApi: true,
    multimodalMemory: true,
    skillOrchestrator: true,
    orchestratorEnabled: true,
    notificationDedupEnabled: true,
    notificationPreferencesEnabled: true,
    notificationEscalationEnabled: true,
    notificationUnifiedCenter: true,
    notificationEmailDelivery: true,
    notificationWebhookDelivery: true,
    unifiedSkillExecution: true,
    agencyCustomTools: true,
    agencyGuardrails: true,
    agencyStreaming: true,
    agencyMcpBridge: true,
    agencyToolApi: true,
    agencyAgenticModeEnabled: true,
    agencyReactExecutorEnabled: true,
    agencyAutonomousAgentEnabled: true,
    agencyLongTermMemoryEnabled: true,
    META_CHANNELS_ENABLED: true,
    mcpServerRegistry: true,
    mcpStdio: true,
    mcpOAuth: true,
    UPLOAD_POST_GATEWAY_ENABLED: true,
    chatAutoModelSelection: true,
    localClientLlmMode: true,
    openClawExternalRuntime: true,
    desktopZeroClawWorker: true,
    nemoClawSecureWorkerPool: true,
    hiClawClusterRuntime: true,
    hermesAgentRuntime: true,
    desktopHostEnabled: true,
    desktopAdvancedLocalMode: true,
    desktopPackageSync: true,
    desktopAgencyRuntime: true,
    desktopWorkerProjection: true,
    agencyHybridAdk: true,
    agencyHybridAdkKillSwitch: true,
    workpacksEnabled: true,
    workpackAutonomousPilot: true,
    workpackOpsConsole: true,
    documentOcrExternalProcessing: true,
    hermesProfileExperience: true,
    hermesChannelWorkflowExpansion: true,
    hermesMemoryContextSync: true,
    hermesTaskModes: true,
    hermesVisibilitySummaries: true,
  }),
  useTenantFeatureFlag: () => true,
}));

vi.mock("@/components/orchestrator/TeamRoomView", () => ({
  TeamRoomView: () => <div data-testid="team-room-view" />,
}));

vi.mock("@/components/orchestrator/RunMonitorPanel", () => ({
  RunMonitorPanel: () => <div data-testid="run-monitor-panel" />,
}));

const workflowPanelPropsRef = vi.hoisted(() => ({ current: null as any }));

vi.mock("@/components/orchestrator/RoomWorkflowPanel", () => ({
  RoomWorkflowPanel: (props: any) => {
    workflowPanelPropsRef.current = props;
    return (
      <div
        data-testid="workflow-panel"
        data-runtime-phase={props.runtimeState?.currentPhase ?? ""}
      />
    );
  },
}));

vi.mock("@/components/settings/PersonaEditorFields", () => ({
  PersonaEditorFields: () => <div data-testid="persona-editor-fields" />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: ({ className }: { className?: string }) => (
    <div className={className} data-testid="locale-toggle" />
  ),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      team: {
        list: { invalidate: invalidateMocks.teamList },
        get: { invalidate: invalidateMocks.teamGet },
        listBindableWorkers: {
          invalidate: invalidateMocks.teamListBindableWorkers,
        },
        getOwnedWorkerBudget: {
          invalidate: invalidateMocks.teamGetOwnedWorkerBudget,
        },
      },
      teamRoom: {
        listByTeam: { invalidate: invalidateMocks.teamRoomListByTeam },
        getActiveRun: { invalidate: vi.fn() },
        getAutoTeamLedger: { invalidate: vi.fn() },
      },
      teamRun: {
        get: { invalidate: invalidateMocks.teamRunGet },
        chooseExplorationCandidate: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        rejectExplorationCandidates: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        approveFinalReview: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
        rejectFinalReview: {
          useMutation: () => ({ mutate: vi.fn(), isPending: false }),
        },
      },
      teamWorkItem: {
        listByRoom: { invalidate: invalidateMocks.teamWorkItemListByRoom },
      },
      persona: {
        list: { invalidate: invalidateMocks.personaList },
      },
    }),
    team: {
      list: {
        useQuery: () => ({ data: teamListDataRef.current, isLoading: false }),
      },
      get: {
        useQuery: () => ({ data: teamGetDataRef.current }),
      },
      listBindableWorkers: {
        useQuery: () => ({ data: bindableWorkersRef.current }),
      },
      getOwnedWorkerBudget: {
        useQuery: () => ({
          data: ownedWorkerBudgetRef.current,
          isLoading: false,
        }),
      },
      updateOwnedWorkerBudget: {
        useMutation: () => ({
          mutate: ownedWorkerBudgetMutate,
          isPending: false,
        }),
      },
      create: {
        useMutation: (opts?: any) => ({
          mutateAsync: async (input: any) => {
            teamCreateMutateAsync(input);
            const result = {
              teamId: "team-1",
              agencyId: "agency-1",
              members: [],
            };
            await opts?.onSuccess?.(result);
            return result;
          },
          isPending: false,
        }),
      },
      archive: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      addMember: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      updateMember: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
      teamRoom: {
        listByTeam: {
          useQuery: () => ({ data: teamRoomsRef.current }),
        },
        getActiveRun: {
          useQuery: () => ({ data: null }),
        },
        getAutoTeamLedger: {
          useQuery: () => ({ data: null }),
        },
        getContextEngineHealth: {
          useQuery: () => ({
            data: contextEngineHealthRef.current,
            isLoading: false,
            error: null,
          }),
        },
        create: {
          useMutation: (opts?: any) => ({
            mutate: (input: any) => {
              teamRoomCreateMutate(input);
              opts?.onSuccess?.({
                id: "room-1",
                roomType: input.roomType,
                goalPrompt: input.goalPrompt,
                language: input.language,
                teamId: input.teamId,
              });
            },
            isPending: false,
          }),
        },
        sendMessage: {
          useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
        },
      },
      teamRun: {
        get: {
          useQuery: () => ({ data: teamRunDetailRef.current }),
        },
        start: {
          useMutation: (opts?: any) => ({
            mutate: (input: any) => {
              teamRunStartMutate(input);
              opts?.onSuccess?.({ id: "run-1", status: "running" });
            },
            isPending: false,
          }),
        },
      stop: {
        useMutation: () => ({ mutate: teamRunStopMutate, isPending: false }),
      },
      pause: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      resume: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      advance: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      chooseExplorationCandidate: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      rejectExplorationCandidates: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      approveFinalReview: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      rejectFinalReview: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    teamWorkItem: {
      listByRoom: {
        useQuery: () => ({ data: [] }),
      },
    },
    persona: {
      create: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      list: {
        useQuery: () => ({
          data: [
            {
              id: "persona-graphic",
              name: "Graphic Reuse",
              sourceTemplateIds: ["graphic-designer", "marketing-strategist"],
              tone: "creative",
              systemPromptPrefix: "Existing graphic persona",
            },
          ],
        }),
      },
    },
    groups: {
      searchTenantUsers: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
  },
}));

import Teams from "../Teams";

describe("Teams preset creation flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "innerWidth", {
      value: 1440,
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      configurable: true,
    });
    teamListDataRef.current = [];
    teamGetDataRef.current = undefined;
    teamRoomsRef.current = [];
    bindableWorkersRef.current = [];
    contextEngineHealthRef.current = null;
    routeParamsRef.current = null;
    locationRef.current = "/teams";
  });

  it("loads a preset, shows reused personas, and submits blueprint references to backend", async () => {
    const user = userEvent.setup();
    render(<Teams />);

    await user.click(screen.getAllByRole("button", { name: /new team/i })[1]);
    await user.click(
      screen.getByRole("button", { name: /creative content studio/i })
    );

    expect(
      screen.getByDisplayValue("Creative Content Studio")
    ).toBeInTheDocument();
    expect(screen.getByText(/reuses graphic reuse/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/persona will be created/i).length
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /^create team$/i }));

    await waitFor(() => expect(teamCreateMutateAsync).toHaveBeenCalledTimes(1));

    const payload = teamCreateMutateAsync.mock.calls[0][0];
    expect(payload.name).toBe("Creative Content Studio");
    expect(payload.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Graphic Designer",
          personaId: "persona-graphic",
          blueprintId: "creative-content-studio",
          blueprintMemberId: "graphic-designer",
        }),
        expect.objectContaining({
          displayName: "Content Director",
          blueprintId: "creative-content-studio",
          blueprintMemberId: "content-director",
          personaId: undefined,
        }),
      ])
    );
  });

  it("shows bound worker status for external connector members when a worker binding exists", async () => {
    routeParamsRef.current = { teamId: "team-1" };
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Connected Team",
        description: null,
        category: "operations",
        status: "active",
        memberCount: 1,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Connected Team",
      members: [
        {
          id: "member-1",
          memberKind: "external_connector",
          memberRole: "reviewer",
          displayName: "OpenClaw Desk",
          externalRef: "openclaw://desk-1",
          externalWorkerId: "worker-1",
          roleTitle: "External Reviewer",
          isLead: false,
        },
      ],
    };
    bindableWorkersRef.current = [
      {
        id: "worker-1",
        displayName: "Gateway Alpha",
        status: "online",
        runtimeType: "openclaw_gateway",
        runtimeVersion: "1.2.3",
        externalReference: "openclaw://desk-1",
        teamId: "team-1",
        lastSeenAt: new Date().toISOString(),
        warningFlagsJson: [],
        boundProfileCount: 1,
        availableForBinding: true,
      },
    ];

    render(<Teams />);

    expect(
      await screen.findByText(/gateway alpha · online/i)
    ).toBeInTheDocument();
  });

  it("shows Hermes policy context for bound external connectors", async () => {
    routeParamsRef.current = { teamId: "team-1" };
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Hermes Team",
        description: null,
        category: "operations",
        status: "active",
        memberCount: 1,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Hermes Team",
      members: [
        {
          id: "member-1",
          memberKind: "external_connector",
          memberRole: "reviewer",
          displayName: "Hermes Operator",
          externalRef: "hermes://profiles/default",
          externalWorkerId: "worker-hermes-1",
          roleTitle: "External Reviewer",
          isLead: false,
        },
      ],
    };
    bindableWorkersRef.current = [
      {
        id: "worker-hermes-1",
        displayName: "Hermes Agent",
        status: "online",
        runtimeType: "hermes_agent_gateway",
        runtimeVersion: "0.3.0",
        externalReference: "hermes://profiles/default",
        teamId: "team-1",
        lastSeenAt: new Date().toISOString(),
        warningFlagsJson: [],
        boundProfileCount: 1,
        channelCompanionPlatforms: ["telegram"],
        remoteEndpointPolicy: "audited_exception_granted",
        profileName: "default",
        profileLabel: "Default Personal Assistant",
        profilePurpose: "Handle personal follow-up and coordination",
        personaDisplayLabel: "Default Personal Assistant",
        personaDisplayPurpose: "Handle personal follow-up and coordination",
        availableForBinding: true,
      },
    ];

    render(<Teams />);

    expect(
      await screen.findByText(
        /Hermes • Hermes Agent · online · Default Personal Assistant/i
      )
    ).toBeInTheDocument();
  });

  it("can return to room overview and open a room from the list", async () => {
    const user = userEvent.setup();
    routeParamsRef.current = { teamId: "team-1" };
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Creative Content 1",
        description: null,
        category: "creative",
        status: "active",
        memberCount: 6,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Creative Content 1",
      members: [],
    };
    teamRoomsRef.current = [
      {
        id: "room-1",
        roomType: "team",
        status: "active",
        createdAt: new Date("2026-04-16T01:00:00.000Z"),
        goalPrompt:
          "Plans, researches, creates, reviews, and publishes daily creative content across social channels.",
      },
    ];

    render(<Teams />);
    dispatchResize();

    expect(await screen.findByTestId("team-room-view")).toBeInTheDocument();

    await user.click(screen.getByTitle("Back to rooms"));

    await waitFor(() => {
      expect(screen.getByTestId("team-room-card-room-1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("team-room-card-room-1"));

    await waitFor(() => {
      expect(screen.getByTestId("team-room-view")).toBeInTheDocument();
    });
  });

  it("switches to another room even when the page was opened from a deep link", async () => {
    routeParamsRef.current = { teamId: "team-1" };
    locationRef.current = "/teams?roomId=room-1";
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Creative Content 1",
        description: null,
        category: "creative",
        status: "active",
        memberCount: 6,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Creative Content 1",
      members: [],
    };
    teamRoomsRef.current = [
      {
        id: "room-1",
        roomType: "team",
        status: "active",
        createdAt: new Date("2026-04-16T01:00:00.000Z"),
        goalPrompt: "First room objective",
      },
      {
        id: "room-2",
        roomType: "team",
        status: "active",
        createdAt: new Date("2026-04-17T01:00:00.000Z"),
        goalPrompt: "Second room objective",
      },
    ];

    render(<Teams />);

    expect(await screen.findByTestId("team-room-view")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByTitle("Back to rooms"));

    await waitFor(() => {
      expect(screen.getByTestId("team-room-card-room-1")).toBeVisible();
      expect(screen.getByTestId("team-room-card-room-2")).toBeVisible();
    });
  });

  it("shows created time and marks the newest room as latest", async () => {
    const user = userEvent.setup();
    routeParamsRef.current = { teamId: "team-1" };
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Creative Content 1",
        description: null,
        category: "creative",
        status: "active",
        memberCount: 6,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Creative Content 1",
      members: [],
    };
    teamRoomsRef.current = [
      {
        id: "room-old",
        roomType: "team",
        status: "active",
        createdAt: new Date("2026-04-16T01:00:00.000Z"),
        goalPrompt: "Old room objective",
      },
      {
        id: "room-new",
        roomType: "team",
        status: "active",
        createdAt: new Date("2026-04-17T01:00:00.000Z"),
        goalPrompt: "Newest room objective",
      },
    ];

    render(<Teams />);
    dispatchResize();

    expect(await screen.findByTestId("team-room-view")).toBeInTheDocument();

    await user.click(screen.getByTitle("Back to rooms"));

    const latestRoomCard = await screen.findByTestId("team-room-card-room-new");
    expect(latestRoomCard).toBeInTheDocument();
    expect(within(latestRoomCard).getByText("Latest")).toBeInTheDocument();
    expect(within(latestRoomCard).getByText(/Created at/i)).toBeInTheDocument();
  });

  it("returns to the room list when back to rooms is clicked", async () => {
    const user = userEvent.setup();
    routeParamsRef.current = { teamId: "team-1" };
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Creative Content 1",
        description: null,
        category: "creative",
        status: "active",
        memberCount: 6,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Creative Content 1",
      members: [],
    };
    teamRoomsRef.current = [
      {
        id: "room-old",
        roomType: "team",
        status: "active",
        createdAt: new Date("2026-04-16T01:00:00.000Z"),
        goalPrompt: "Old room objective",
      },
      {
        id: "room-new",
        roomType: "team",
        status: "active",
        createdAt: new Date("2026-04-17T01:00:00.000Z"),
        goalPrompt: "Newest room objective",
      },
    ];

    render(<Teams />);
    dispatchResize();

    expect(await screen.findByTestId("team-room-view")).toBeInTheDocument();

    await user.click(screen.getByTitle("Back to rooms"));

    await waitFor(() => {
      expect(screen.queryByTestId("team-room-view")).not.toBeInTheDocument();
    });
    expect(await screen.findByTestId("team-room-card-room-new")).toBeVisible();
    expect(screen.getByTestId("team-room-card-room-old")).toBeVisible();
  });

  it("shows a compact room switcher instead of a collapsible room rail", async () => {
    routeParamsRef.current = { teamId: "team-1" };
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Creative Content 1",
        description: null,
        category: "creative",
        status: "active",
        memberCount: 6,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Creative Content 1",
      members: [],
    };
    teamRoomsRef.current = [
      {
        id: "room-old",
        roomType: "team",
        status: "active",
        createdAt: new Date("2026-04-16T01:00:00.000Z"),
        goalPrompt: "Old room objective",
      },
      {
        id: "room-new",
        roomType: "team",
        status: "active",
        createdAt: new Date("2026-04-17T01:00:00.000Z"),
        goalPrompt: "Newest room objective",
      },
    ];

    render(<Teams />);
    dispatchResize();

    expect(await screen.findByTestId("team-room-view")).toBeInTheDocument();
    expect(screen.getByText(/pick a room from the compact switcher/i)).toBeInTheDocument();
    expect(screen.getByTitle("Back to rooms")).toBeInTheDocument();
    expect(screen.queryByText(/collapse rooms/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/room rail collapsed/i)).not.toBeInTheDocument();
  });

  it("can collapse and expand the right-side room sections", async () => {
    const user = userEvent.setup();
    routeParamsRef.current = { teamId: "team-1" };
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Creative Content 1",
        description: null,
        category: "creative",
        status: "active",
        memberCount: 6,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Creative Content 1",
      members: [],
    };
    teamRoomsRef.current = [
      {
        id: "room-active",
        roomType: "team",
        status: "active",
        lastRunId: "run-active",
        createdAt: new Date("2026-04-17T01:00:00.000Z"),
        goalPrompt: "Active room objective",
      },
    ];
    teamRunDetailRef.current = {
      id: "run-active",
      status: "running",
      stopReason: null,
      runtimeState: {
        currentPhase: "research",
      },
      statusBridge: null,
    };

    render(<Teams />);
    dispatchResize();

    expect(await screen.findByTestId("workflow-panel")).toBeInTheDocument();
    expect(screen.getByTestId("run-monitor-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /collapse all/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("workflow-panel")).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("run-monitor-panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand all/i }));

    await waitFor(() => {
      expect(screen.getByTestId("workflow-panel")).toBeInTheDocument();
      expect(screen.getByTestId("run-monitor-panel")).toBeInTheDocument();
    });
  });

  it("shows a prominent stop automation button when a run is active", async () => {
    const user = userEvent.setup();
    routeParamsRef.current = { teamId: "team-1" };
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Creative Content 1",
        description: null,
        category: "creative",
        status: "active",
        memberCount: 6,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Creative Content 1",
      members: [],
    };
    teamRoomsRef.current = [
      {
        id: "room-active",
        roomType: "team",
        status: "active",
        lastRunId: "run-active",
        createdAt: new Date("2026-04-17T01:00:00.000Z"),
        goalPrompt: "Active room objective",
      },
    ];
    teamRunDetailRef.current = {
      id: "run-active",
      status: "running",
      stopReason: null,
    };

    render(<Teams />);
    dispatchResize();

    const stopButton = await screen.findByRole("button", {
      name: /stop automation/i,
    });
    expect(stopButton).toBeInTheDocument();

    await user.click(stopButton);

    expect(teamRunStopMutate).toHaveBeenCalledWith({
      runId: "run-active",
      reason: "user_requested",
    });
  });

  it("creates a room with the selected language", async () => {
    const user = userEvent.setup();
    routeParamsRef.current = { teamId: "team-1" };
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Creative Content 1",
        description: null,
        category: "creative",
        status: "active",
        memberCount: 6,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Creative Content 1",
      members: [],
    };
    teamRoomsRef.current = [];

    render(<Teams />);
    dispatchResize();

    await user.click(
      (await screen.findAllByRole("button", { name: /new room/i }))[0]
    );

    expect(screen.getByRole("button", { name: /English/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(screen.getByRole("button", { name: /ไทย/i }));
    await user.type(
      screen.getByPlaceholderText(
        /Describe what this team room should achieve\./i
      ),
      "Plan the next launch."
    );
    await user.click(screen.getByRole("button", { name: /create room/i }));

    expect(teamRoomCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "team-1",
        roomType: "team",
        language: "th",
        goalPrompt: "Plan the next launch.",
      })
    );
  });

  it("auto-starts automation after creating an auto_team room", async () => {
    const user = userEvent.setup();
    routeParamsRef.current = { teamId: "team-1" };
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Creative Content 1",
        description: null,
        category: "creative",
        status: "active",
        memberCount: 6,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Creative Content 1",
      members: [],
    };
    teamRoomsRef.current = [];

    render(<Teams />);
    dispatchResize();

    await user.click(
      (await screen.findAllByRole("button", { name: /new room/i }))[0]
    );
    await user.click(screen.getByRole("button", { name: /auto team/i }));
    await user.type(
      screen.getByPlaceholderText(
        /Describe what this team room should achieve\./i
      ),
      "Plan the next launch automation."
    );
    await user.click(screen.getByRole("button", { name: /create room/i }));

    await waitFor(() => {
      expect(teamRoomCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: "team-1",
          roomType: "auto_team",
          goalPrompt: "Plan the next launch automation.",
        })
      );
    });

    expect(teamRunStartMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        executionMode: "auto_team",
        objective: "Plan the next launch automation.",
      })
    );
    expect(await screen.findByTestId("run-monitor-panel")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start run/i })
    ).not.toBeInTheDocument();
  });
});
