import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const teamCreateMutateAsync = vi.fn();
const ownedWorkerBudgetMutate = vi.fn();
const {
  teamListDataRef,
  teamGetDataRef,
  bindableWorkersRef,
  ownedWorkerBudgetRef,
  routeParamsRef,
} = vi.hoisted(() => ({
  teamListDataRef: { current: [] as any[] },
  teamGetDataRef: { current: undefined as any },
  bindableWorkersRef: { current: [] as any[] },
  ownedWorkerBudgetRef: { current: null as any },
  routeParamsRef: { current: null as any },
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

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/teams", setLocationMock],
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
      };
      const template = dictionary[key] ?? key;
      if (!params) return template;
      return Object.entries(params).reduce(
        (acc, [paramKey, value]) => acc.replaceAll(`{{${paramKey}}}`, String(value)),
        template,
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

vi.mock("@/components/orchestrator/RoomWorkflowPanel", () => ({
  RoomWorkflowPanel: () => <div data-testid="workflow-panel" />,
}));

vi.mock("@/components/settings/PersonaEditorFields", () => ({
  PersonaEditorFields: () => <div data-testid="persona-editor-fields" />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
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
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      team: {
        list: { invalidate: invalidateMocks.teamList },
        get: { invalidate: invalidateMocks.teamGet },
        listBindableWorkers: { invalidate: invalidateMocks.teamListBindableWorkers },
        getOwnedWorkerBudget: { invalidate: invalidateMocks.teamGetOwnedWorkerBudget },
      },
      teamRoom: {
        listByTeam: { invalidate: invalidateMocks.teamRoomListByTeam },
      },
      teamRun: {
        get: { invalidate: invalidateMocks.teamRunGet },
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
        useQuery: () => ({ data: ownedWorkerBudgetRef.current, isLoading: false }),
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
            const result = { teamId: "team-1", agencyId: "agency-1", members: [] };
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
        useQuery: () => ({ data: [] }),
      },
      create: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      sendMessage: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
    teamRun: {
      get: {
        useQuery: () => ({ data: undefined }),
      },
      start: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      stop: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
    teamListDataRef.current = [];
    teamGetDataRef.current = undefined;
    bindableWorkersRef.current = [];
    routeParamsRef.current = null;
  });

  it("loads a preset, shows reused personas, and submits blueprint references to backend", async () => {
    const user = userEvent.setup();
    render(<Teams />);

    await user.click(screen.getAllByRole("button", { name: /new team/i })[1]);
    await user.click(screen.getByRole("button", { name: /creative content studio/i }));

    expect(screen.getByDisplayValue("Creative Content Studio")).toBeInTheDocument();
    expect(screen.getByText(/reuses graphic reuse/i)).toBeInTheDocument();
    expect(screen.getAllByText(/persona will be created/i).length).toBeGreaterThan(0);

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
      ]),
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

    expect(await screen.findByText(/gateway alpha · online/i)).toBeInTheDocument();
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

    expect(await screen.findByText(/Hermes • Hermes Agent · online · Default Personal Assistant/i)).toBeInTheDocument();
  });
});
