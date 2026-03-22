import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const teamCreateMutateAsync = vi.fn();
const invalidateMocks = {
  teamList: vi.fn(),
  teamGet: vi.fn(),
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
  useRoute: () => [false, null],
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const dictionary: Record<string, string> = {
        "teams.create.title": "New Team",
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
        useQuery: () => ({ data: [], isLoading: false }),
      },
      get: {
        useQuery: () => ({ data: undefined }),
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
});
