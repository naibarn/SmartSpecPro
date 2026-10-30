/** @vitest-environment jsdom */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  search: "",
  location: vi.fn(),
  jobs: [] as Array<Record<string, any>>,
  goals: [] as Array<Record<string, any>>,
  runners: [] as Array<Record<string, any>>,
  create: vi.fn(async () => ({ id: 902 })),
  user: { role: "admin" } as { role: string } | null,
}));

vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useSearch: () => state.search,
  useLocation: () => ["/chat", state.location],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workerJobs: {
      observability: {
        useQuery: () => ({
          data: { items: state.jobs },
          isLoading: false,
          error: null,
        }),
      },
      taskGroups: {
        useQuery: () => ({
          data: { groups: [] },
          isLoading: false,
          error: null,
        }),
      },
    },
    spec226DevelopmentControl: {
      list: {
        useQuery: () => ({ data: state.goals, isLoading: false, error: null }),
      },
    },
    runnerNodes: {
      list: {
        useQuery: () => ({
          data: { runners: state.runners },
          isLoading: false,
          error: null,
        }),
      },
    },
    chat: {
      createConversation: {
        useMutation: () => ({ mutateAsync: state.create }),
      },
      getConversation: {
        useQuery: () => ({ data: { id: 901, title: "Saved session" } }),
      },
      listRecentConversationThreads: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: [] }] },
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: state.user }),
}));

vi.mock("@/components/chat/Spec224WorkspacePanel", () => ({
  Spec224WorkspacePanel: ({ conversationId, pilotMode }: { conversationId: number; pilotMode?: boolean }) => (
    <section aria-label="First Run Pilot panel">Pilot {conversationId} · {String(Boolean(pilotMode))}</section>
  ),
}));

vi.mock("@/lib/useTaskHarnessOutputEvents", () => ({
  useTaskHarnessOutputEvents: () => ({
    events: [{ id: "event-1", text: "Running verified tests" }],
    eventsJobId: state.jobs[0]?.id,
    query: { isLoading: false, error: null },
  }),
}));

vi.mock("@/components/chat/ChatSidebar", () => ({
  ChatSidebar: () => (
    <nav aria-label="Saved sessions">
      <button type="button" onClick={() => undefined}>
        Saved session
      </button>
    </nav>
  ),
}));
vi.mock("@/components/chat/ChatView", () => ({
  ChatView: ({
    showBrowserSessionEntry,
  }: {
    showBrowserSessionEntry?: boolean;
  }) => (
    <section aria-label="Conversation canvas">
      Conversation canvas
      {showBrowserSessionEntry ? (
        <button type="button">Browser control</button>
      ) : null}
    </section>
  ),
}));
vi.mock("@/components/chat/UnifiedWorkspaceInspector", () => ({
  UnifiedWorkspaceInspector: ({ jobId }: { jobId?: string | null }) => (
    <section aria-label={`Run inspector for ${jobId ?? "session"}`}>
      Inspector {jobId}
    </section>
  ),
}));

import UnifiedWorkspace from "./UnifiedWorkspace";

const job = {
  id: "job-secret-id",
  jobType: "spec224.development",
  status: "running",
  stage: "IMPLEMENT",
  attempt: 1,
  maxAttempts: 2,
  heartbeatAt: "2026-10-30T02:00:00.000Z",
  createdAt: "2026-10-30T01:00:00.000Z",
  workerId: "agent-1",
  runnerId: "runner-1",
  threadId: "thread-1",
  conversationId: 901,
  conversationTitle: "Saved session",
  threadTitle: "Pilot implementation",
  projectId: "SmartAIHub Core",
  specId: null,
  executionIdentity: {
    runId: "run-1",
    agent: "Codex worker",
    harness: "Codex",
    model: "gpt-6.1-sol",
    reasoningEffort: "high",
  },
  operatorAttention: { required: false, reason: null },
  recovery: { retryEligible: false, nextRetryAt: null },
};

describe("UnifiedWorkspace", () => {
  beforeEach(() => {
    state.search = "";
    state.location.mockClear();
    state.create.mockClear();
    state.jobs = [job];
    state.goals = [];
    state.runners = [
      {
        runnerId: "runner-1",
        displayName: "Debian Development Runner",
        displayState: "ready",
        status: "online",
        trustState: "trusted",
      },
    ];
    state.user = { role: "admin" };
    window.localStorage.clear();
  });

  it("renders the full workspace navigation and persistent session/inspector panes", () => {
    render(<UnifiedWorkspace />);
    expect(
      screen.getByRole("navigation", {
        name: "SmartAIHub workspace navigation",
      })
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Task Control" })
        .some(link => link.getAttribute("href") === "/chat?mode=tasks")
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: "Mission Control" })
        .some(link => link.getAttribute("href") === "/chat?mode=mission")
    ).toBe(true);
    expect(
      screen.getByRole("navigation", { name: "Saved sessions" })
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Conversation canvas" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Browser control" })
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Run inspector for session" })
    ).toBeTruthy();
  });

  it("lets an admin open a first-run pilot bound to a newly persisted chat session", async () => {
    render(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "ทดสอบการทำงานจริง" }));
    expect(await screen.findByRole("region", { name: "First Run Pilot panel" })).toBeTruthy();
    expect(screen.getByText("Pilot 902 · true")).toBeTruthy();
    expect(state.location).toHaveBeenCalledWith("/chat?c=902&pilot=1");
  });

  it("restores the pilot review from its durable conversation URL after remount", async () => {
    state.search = "c=902&pilot=1";
    render(<UnifiedWorkspace />);
    expect(await screen.findByRole("region", { name: "First Run Pilot panel" })).toBeTruthy();
    expect(screen.getByText("Pilot 902 · true")).toBeTruthy();
  });

  it("does not expose the first-run pilot entry point to non-admin users", () => {
    state.user = { role: "user" };
    render(<UnifiedWorkspace />);
    expect(screen.queryByRole("button", { name: "ทดสอบการทำงานจริง" })).toBeNull();
  });

  it("organizes Task Control by project and reports absent lifecycle evidence honestly", () => {
    state.search = "mode=tasks";
    render(<UnifiedWorkspace />);
    expect(screen.getByRole("heading", { name: "Task Control" })).toBeTruthy();
    expect(
      screen.getAllByRole("heading", { name: "SmartAIHub Core" }).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/linked work records/).length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText("ยังไม่มีหลักฐาน").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "เปิด Session" })).toBeTruthy();
  });

  it("keeps Goal names visible and gives Developer mode additional diagnostics", () => {
    state.search = "mode=tasks";
    state.goals = [
      {
        goalId: "goal-visible-123",
        goal: "",
        state: "DISCOVERY",
        workerJobId: job.id,
        runId: "run-1",
        evidenceRefs: ["artifact:plan.md"],
        nextSafeAction: { command: "run", phase: "discovery" },
      },
    ];
    render(<UnifiedWorkspace />);
    const goalRow = screen.getByRole("button", { name: "เป้าหมาย goal-vis" });
    expect(goalRow.className).toContain("text-foreground");
    fireEvent.click(goalRow);
    expect(goalRow.className).toContain("bg-primary/10");
    expect(
      screen.queryByRole("region", { name: "Developer execution details" })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Developer" }));
    expect(
      screen.getByRole("region", { name: "Developer execution details" })
    ).toBeTruthy();
    expect(screen.getByText("goal-visible-123")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Simple" }));
    expect(
      screen.queryByRole("region", { name: "Developer execution details" })
    ).toBeNull();
  });

  it("groups Mission Control by Harness, supports independent tabs, and opens the exact selected Run inspector", () => {
    state.search = "mode=mission";
    render(<UnifiedWorkspace />);
    expect(
      screen.getByRole("heading", { name: "Mission Control" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(
      screen.getByRole("heading", { name: "Pilot implementation" })
    ).toBeTruthy();
    expect(state.location).toHaveBeenCalledWith(
      expect.stringContaining("jobId=job-secret-id")
    );
    expect(state.location).toHaveBeenCalledWith(
      expect.stringContaining("jobIds=job-secret-id")
    );
    fireEvent.click(screen.getByRole("button", { name: "Developer" }));
    expect(window.localStorage.getItem("smartaihub-workspace-mode")).toBe(
      "developer"
    );
    expect(
      screen.getByRole("region", { name: "Run inspector for job-secret-id" })
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Close Pilot implementation" })
    );
    expect(
      screen.queryByRole("button", { name: "Close Pilot implementation" })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Runners/ }));
    expect(screen.getByRole("heading", { name: "Runners" })).toBeTruthy();
  });

  it("routes legacy Task Control URLs into the full-page workspace", () => {
    state.search = "panel=control-plane&view=full&c=901";
    render(<UnifiedWorkspace />);
    expect(state.location).toHaveBeenCalledWith(
      "/chat?view=full&c=901&mode=tasks"
    );
  });

  it("persists the selected Project in the URL while retaining its conversation and thread", () => {
    state.search = "mode=tasks&c=901&t=thread-1";
    state.jobs = [
      job,
      {
        ...job,
        id: "job-2",
        projectId: "Other project",
        threadTitle: "Other project task",
        conversationId: null,
      },
    ];
    render(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /Other project/ }));
    expect(state.location).toHaveBeenCalledWith(
      "/chat?mode=tasks&projectId=Other+project&c=901&t=thread-1"
    );
  });

  it("filters mission executions by harness, agent, and runner", () => {
    state.search = "mode=mission";
    render(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Developer" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter by runner" }),
      { target: { value: "runner-1" } }
    );
    expect(screen.getByRole("button", { name: "Inspect" })).toBeTruthy();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter by agent" }),
      { target: { value: "Codex worker" } }
    );
    expect(screen.getByRole("button", { name: "Inspect" })).toBeTruthy();
  });
});
