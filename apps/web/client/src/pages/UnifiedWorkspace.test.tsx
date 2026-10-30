/** @vitest-environment jsdom */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  search: "",
  location: vi.fn(),
  jobs: [] as Array<Record<string, any>>,
  goals: [] as Array<Record<string, any>>,
  runners: [] as Array<Record<string, any>>,
  recentThreads: [] as Array<Record<string, any>>,
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
          data: { pages: [{ items: state.recentThreads }] },
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
  Spec224WorkspacePanel: ({ conversationId, pilotMode, requestedHarnessAdapterId, initialPrompt, initialRequestKind }: { conversationId: number; pilotMode?: boolean; requestedHarnessAdapterId?: string | null; initialPrompt?: string; initialRequestKind?: string }) => (
    <>
      <section aria-label="First Run Pilot panel">Pilot {conversationId} · {String(Boolean(pilotMode))} · {requestedHarnessAdapterId ?? "auto"}</section>
      {initialPrompt ? <p data-testid="goal-review-prompt">{initialRequestKind}: {initialPrompt}</p> : null}
    </>
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
    composerPrompt,
  }: {
    showBrowserSessionEntry?: boolean;
    composerPrompt?: { id: number; text: string; autoSend?: boolean } | null;
  }) => (
    <section aria-label="Conversation canvas">
      Conversation canvas
      {composerPrompt ? <p role="status" data-auto-send={String(Boolean(composerPrompt.autoSend))}>{composerPrompt.text}</p> : null}
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
    state.recentThreads = [];
    state.user = { role: "admin" };
    window.localStorage.clear();
  });

  it("renders a usable first-use composer and neutral empty inspector", () => {
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
    expect(screen.getByRole("heading", { name: "ต้องการให้ AI ช่วยทำอะไร?" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "คำสั่งเริ่มต้น" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ส่งข้อความ" })).toBeTruthy();
    expect(screen.queryByText("No conversation selected")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Run inspector for session" })
    ).toBeTruthy();
  });

  it("creates one persisted session and auto-sends the first Chat message", async () => {
    const view = render(<UnifiedWorkspace />);
    fireEvent.change(screen.getByRole("textbox", { name: "คำสั่งเริ่มต้น" }), {
      target: { value: "Summarize this project" },
    });
    const send = screen.getByRole("button", { name: "ส่งข้อความ" });
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(1));
    act(() => { state.search = "c=902"; });
    view.rerender(<UnifiedWorkspace />);
    expect(await screen.findByText("Summarize this project")).toBeTruthy();
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.create).toHaveBeenCalledWith({ title: "Summarize this project" });
    expect(state.location).toHaveBeenCalledWith("/chat?c=902");
    expect(screen.getByText("Summarize this project").getAttribute("data-auto-send")).toBe("true");
  });

  it("lets an admin open a first-run pilot bound to a newly persisted chat session", async () => {
    render(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "ทดสอบการทำงานจริง" }));
    expect(await screen.findByRole("region", { name: "First Run Pilot panel" })).toBeTruthy();
    expect(screen.getByText("Pilot 902 · true · auto")).toBeTruthy();
    expect(state.location).toHaveBeenCalledWith("/chat?c=902&pilot=1");
  });

  it("restores the pilot review from its durable conversation URL after remount", async () => {
    state.search = "c=902&pilot=1&harness=microsoft-copilot.v1";
    render(<UnifiedWorkspace />);
    expect(await screen.findByRole("region", { name: "First Run Pilot panel" })).toBeTruthy();
    expect(screen.getByText("Pilot 902 · true · microsoft-copilot.v1")).toBeTruthy();
  });

  it("does not reopen the Pilot dialog while navigating to Task Control", () => {
    state.search = "mode=tasks&c=902&pilot=1";
    render(<UnifiedWorkspace />);
    expect(screen.queryByRole("region", { name: "First Run Pilot panel" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Task Control" })).toBeTruthy();
  });

  it("does not expose the first-run pilot entry point to non-admin users", () => {
    state.user = { role: "user" };
    render(<UnifiedWorkspace />);
    expect(screen.queryByRole("button", { name: "ทดสอบการทำงานจริง" })).toBeNull();
  });

  it("offers an obvious New Goal action in Task Control and opens the existing review route", async () => {
    state.search = "mode=tasks&projectId=SmartAIHub%20Core";
    render(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "สร้างงานใหม่ / New Goal" }));
    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(1));
    expect(state.create).toHaveBeenCalledWith({ title: "New Development Goal" });
    await waitFor(() => expect(state.location).toHaveBeenCalledWith("/chat?mode=tasks&c=902&newGoal=1"));
  });

  it("offers Mission Control an authorized New Agent Task action", async () => {
    state.search = "mode=mission";
    render(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New Agent Task" }));
    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(state.location).toHaveBeenCalledWith("/chat?mode=tasks&c=902&newGoal=1"));
  });

  it("routes Development intent to the existing Goal review instead of Chat", async () => {
    const view = render(<UnifiedWorkspace />);
    fireEvent.change(screen.getByRole("textbox", { name: "คำสั่งเริ่มต้น" }), {
      target: { value: "Create a small utility" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Development" }));
    fireEvent.click(screen.getByRole("button", { name: "ตรวจ Goal ก่อนเริ่มงาน" }));
    await waitFor(() => expect(state.location).toHaveBeenCalledWith("/chat?mode=tasks&c=902&newGoal=1"));
    expect(screen.queryByRole("region", { name: "Conversation canvas" })).toBeNull();
    act(() => { state.search = "mode=tasks&c=902&newGoal=1"; });
    view.rerender(<UnifiedWorkspace />);
    expect((await screen.findByTestId("goal-review-prompt")).textContent).toBe("development: Create a small utility");
  });

  it("binds a first Chat conversation to a project selected from authorized session context", async () => {
    state.recentThreads = [{ projectId: "project-1", projectTitle: "Project One" }];
    const view = render(<UnifiedWorkspace />);
    fireEvent.change(screen.getByRole("combobox", { name: "Project" }), { target: { value: "project-1" } });
    fireEvent.change(screen.getByRole("textbox", { name: "คำสั่งเริ่มต้น" }), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "ส่งข้อความ" }));
    await waitFor(() => expect(state.create).toHaveBeenCalledWith({ title: "Hello", projectId: "project-1" }));
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
