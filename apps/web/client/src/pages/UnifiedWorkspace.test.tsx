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
  conversationProjectId: null as string | null,
  goalPrompt: "fix login",
  create: vi.fn(async () => ({ id: 902 })),
  user: { id: "user-1", role: "admin" } as { id: string; role: string } | null,
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
    useUtils: () => ({
      workerJobs: { observability: { invalidate: vi.fn() } },
      spec226DevelopmentControl: { list: { invalidate: vi.fn() } },
    }),
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
      cancelQueued: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    spec226DevelopmentControl: {
      list: {
        useQuery: () => ({ data: state.goals, isLoading: false, error: null }),
      },
      getConversationWorkspace: {
        useQuery: () => ({ data: { workspace: null, developmentRuns: [] }, isLoading: false, isSuccess: true, refetch: vi.fn() }),
      },
      cancelUnclaimedLegacyPlatformRun: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      resumeWorkspaceRun: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      modularSaasProjectMissionControl: { useQuery: () => ({ data: { sourceStatus: "not_ready", ingestionStatus: "not_imported", deployment: { status: "pending" }, specs: [], packages: [], linkedRuns: [] }, isLoading: false, error: null, refetch: vi.fn() }) },
      listPlatformWorkspaceBindingCandidates: { useQuery: () => ({ data: { workspaces: [], projects: [] }, isLoading: false, error: null, refetch: vi.fn() }) },
      bindPlatformWorkspace: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      createAndBindModularCoreWorkspace: { useMutation: () => ({ mutateAsync: vi.fn() }) },
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
        useQuery: () => ({ data: { id: 901, title: "Saved session", projectId: state.conversationProjectId } }),
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
  Spec224WorkspacePanel: ({ conversationId, threadId, pilotMode, requestedHarnessAdapterId, initialPrompt, initialRequestKind, resumeSpecId }: { conversationId: number; threadId?: string | null; pilotMode?: boolean; requestedHarnessAdapterId?: string | null; initialPrompt?: string; initialRequestKind?: string; resumeSpecId?: string }) => (
    <>
      <section aria-label="First Run Pilot panel">Pilot {conversationId} · {String(Boolean(pilotMode))} · {requestedHarnessAdapterId ?? "auto"}</section>
      {threadId ? <p data-testid="goal-review-thread">{threadId}</p> : null}
      {initialPrompt ? <p data-testid="goal-review-prompt">{initialRequestKind}: {initialPrompt}</p> : null}
      {resumeSpecId ? <p data-testid="goal-review-resume-spec">{resumeSpecId}</p> : null}
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
  ChatSidebar: ({ onSelectConversation }: { onSelectConversation: (id: number) => void }) => (
    <nav aria-label="Saved sessions">
      <button type="button" onClick={() => onSelectConversation(902)}>
        Saved session
      </button>
    </nav>
  ),
}));
vi.mock("@/components/chat/ChatView", () => ({
  ChatView: ({
    showBrowserSessionEntry,
    composerPrompt,
    workspaceCommandMode,
    onWorkspaceCommandModeChange,
    onWorkspaceGoalSubmit,
  }: {
    showBrowserSessionEntry?: boolean;
    composerPrompt?: { id: number; text: string; autoSend?: boolean } | null;
    workspaceCommandMode?: string;
    onWorkspaceCommandModeChange?: (mode: string) => void;
    onWorkspaceGoalSubmit?: (prompt: string, intent: string) => void;
  }) => (
    <section aria-label="Conversation canvas">
      Conversation canvas
      {composerPrompt ? <p role="status" data-auto-send={String(Boolean(composerPrompt.autoSend))}>{composerPrompt.text}</p> : null}
      {workspaceCommandMode ? (
        <div aria-label="Chat command mode">
          <button type="button" onClick={() => onWorkspaceCommandModeChange?.("development")}>Development task mode</button>
          <button type="button" onClick={() => onWorkspaceGoalSubmit?.(state.goalPrompt, workspaceCommandMode)}>Review current chat as Goal</button>
        </div>
      ) : null}
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
    state.conversationProjectId = null;
    state.goalPrompt = "fix login";
    state.user = { id: "user-1", role: "admin" };
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("opens the full Chat composer on first entry and explains the empty inspector", async () => {
    const view = render(<UnifiedWorkspace />);
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
    await waitFor(() => expect(state.create).toHaveBeenCalledWith({ title: "New chat" }));
    act(() => { state.search = "c=902"; });
    view.rerender(<UnifiedWorkspace />);
    expect(await screen.findByRole("region", { name: "Conversation canvas" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Browser control" })).toBeNull();
    expect(screen.queryByText("No conversation selected")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Run inspector for session" })
    ).toBeTruthy();
  });

  it("reuses the same empty starter session after reopening Chat in the same tab", async () => {
    const firstView = render(<UnifiedWorkspace />);
    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(1));
    expect(window.sessionStorage.getItem("smartaihub-empty-chat:v1:personal:user-1")).toBe("902");
    firstView.unmount();
    state.location.mockClear();

    render(<UnifiedWorkspace />);
    await waitFor(() => expect(state.location).toHaveBeenCalledWith("/chat?c=902"));
    expect(state.create).toHaveBeenCalledTimes(1);
  });

  it("clears a stale Run when switching to another saved session", () => {
    state.search = "c=901&jobId=stale-run";
    render(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Saved session" }));
    expect(state.location).toHaveBeenCalledWith("/chat?c=902");
  });

  it("opens First Run Pilot in the standard Task Control Goal review", async () => {
    const view = render(<UnifiedWorkspace />);
    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(1));
    act(() => { state.search = "c=902"; });
    view.rerender(<UnifiedWorkspace />);
    expect(screen.queryByRole("button", { name: "First Run Pilot · Task Control" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Developer" }));
    fireEvent.click(screen.getByRole("button", { name: "First Run Pilot · Task Control" }));
    await waitFor(() => expect(state.location).toHaveBeenCalledWith("/chat?mode=tasks&c=902&newGoal=1"));
    expect(JSON.parse(window.sessionStorage.getItem("workspace-goal-draft:902") ?? "{}")).toMatchObject({ intent: "development", pilotMode: true });
    act(() => { state.search = "mode=tasks&c=902&newGoal=1"; });
    view.rerender(<UnifiedWorkspace />);
    expect(await screen.findByRole("heading", { name: "ตรวจสอบ First Run Pilot ก่อนส่งอนุมัติ" })).toBeTruthy();
    expect(screen.getByText("Pilot 902 · true · auto")).toBeTruthy();
  });

  it("migrates legacy Pilot URLs into the standard Goal review after remount", async () => {
    state.search = "c=902&pilot=1&harness=microsoft-copilot.v1";
    render(<UnifiedWorkspace />);
    await waitFor(() => expect(state.location).toHaveBeenCalledWith("/chat?c=902&mode=tasks&newGoal=1"));
    expect(JSON.parse(window.sessionStorage.getItem("workspace-goal-draft:902") ?? "{}")).toMatchObject({
      intent: "development", pilotMode: true, requestedHarnessAdapterId: "microsoft-copilot.v1",
    });
  });

  it("routes a legacy Pilot query from Task Control to the normal Goal review", async () => {
    state.search = "mode=tasks&c=902&pilot=1";
    render(<UnifiedWorkspace />);
    await waitFor(() => expect(state.location).toHaveBeenCalledWith("/chat?mode=tasks&c=902&newGoal=1"));
    expect(screen.getByRole("heading", { name: "Task Control" })).toBeTruthy();
  });

  it("does not expose the first-run pilot entry point to non-admin users", () => {
    state.user = { id: "user-1", role: "user" };
    render(<UnifiedWorkspace />);
    expect(screen.queryByRole("button", { name: "First Run Pilot · Task Control" })).toBeNull();
  });

  it("offers an obvious New Goal action in Task Control and opens the existing review route", async () => {
    state.search = "mode=tasks&projectId=SmartAIHub%20Core";
    render(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "สร้างงานใหม่ / New Goal" }));
    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(1));
    expect(state.create).toHaveBeenCalledWith({ title: "New Development Goal" });
    await waitFor(() => expect(state.location).toHaveBeenCalledWith("/chat?mode=tasks&c=902&newGoal=1"));
  });

  it("sizes the Goal review for phone, tablet, and desktop without horizontal scrolling", async () => {
    state.search = "mode=tasks&c=901&newGoal=1";
    render(<UnifiedWorkspace />);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("w-[calc(100vw-1rem)]");
    expect(dialog.className).toContain("sm:max-w-2xl");
    expect(dialog.className).toContain("md:max-w-4xl");
    expect(dialog.className).toContain("xl:max-w-6xl");
    expect(dialog.className).toContain("overflow-x-hidden");
  });

  it("does not offer the unsupported New Agent Task action in Mission Control", () => {
    state.search = "mode=mission";
    render(<UnifiedWorkspace />);
    expect(screen.queryByRole("button", { name: "New Agent Task" })).toBeNull();
  });

  it("routes a Development Goal review from the active Chat without creating another chat", async () => {
    const view = render(<UnifiedWorkspace />);
    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(1));
    act(() => { state.search = "c=902"; });
    view.rerender(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Development task mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Review current chat as Goal" }));
    await waitFor(() => expect(state.location).toHaveBeenCalledWith("/chat?mode=tasks&c=902&newGoal=1"));
    expect(state.create).toHaveBeenCalledTimes(1);
    act(() => { state.search = "mode=tasks&c=902&newGoal=1"; });
    view.rerender(<UnifiedWorkspace />);
    expect((await screen.findByTestId("goal-review-prompt")).textContent).toContain("development: fix login");
    expect(screen.getByTestId("goal-review-prompt").textContent).toContain("แนวทาง Skill-first");
  });

  it("opens a skill-first Goal review from the active Chat without creating another conversation", async () => {
    state.search = "c=901&t=thread-55&projectId=project-1";
    const view = render(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Development task mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Review current chat as Goal" }));

    await waitFor(() => expect(state.location).toHaveBeenCalledWith(
      "/chat?mode=tasks&c=901&t=thread-55&projectId=project-1&newGoal=1",
    ));
    expect(state.create).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("workspace-goal-draft:901") ?? "{}"))
      .toMatchObject({ intent: "development", returnToChat: true, originalPrompt: "fix login" });
    expect(JSON.parse(sessionStorage.getItem("workspace-goal-draft:901") ?? "{}").prompt)
      .toContain("แนวทาง Skill-first");
    act(() => { state.search = "mode=tasks&c=901&t=thread-55&projectId=project-1&newGoal=1"; });
    view.rerender(<UnifiedWorkspace />);
    expect((await screen.findByTestId("goal-review-thread")).textContent).toBe("thread-55");
  });

  it("opens the saved SPEC project context from a Chat continuation command", async () => {
    state.search = "c=901&t=thread-55&projectId=project-1";
    state.goalPrompt = "ให้ทำงานพัฒนา spec 312 ต่อจากเดิม";
    const view = render(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Development task mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Review current chat as Goal" }));

    await waitFor(() => expect(state.location).toHaveBeenCalledWith(
      "/chat?mode=tasks&c=901&t=thread-55&projectId=project-1&newGoal=1",
    ));
    const savedDraft = JSON.parse(sessionStorage.getItem("workspace-goal-draft:901") ?? "{}");
    expect(savedDraft).toMatchObject({ intent: "development", resumeSpecId: "312", returnToChat: true });
    expect(savedDraft.prompt).toBeUndefined();

    act(() => { state.search = "mode=tasks&c=901&t=thread-55&projectId=project-1&newGoal=1"; });
    view.rerender(<UnifiedWorkspace />);
    expect(await screen.findByTestId("goal-review-resume-spec")).toHaveTextContent("312");
  });

  it("recovers the saved project id from the conversation when the Chat URL has no project id", async () => {
    state.search = "c=901&t=thread-55";
    state.conversationProjectId = "project-1";
    state.goalPrompt = "ให้ทำงานพัฒนา spec 312 ต่อจากเดิม";
    render(<UnifiedWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Development task mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Review current chat as Goal" }));

    await waitFor(() => expect(state.location).toHaveBeenCalledWith(
      "/chat?mode=tasks&c=901&t=thread-55&projectId=project-1&newGoal=1",
    ));
  });

  it("keeps an authorized project context when opening the starter Chat", async () => {
    state.recentThreads = [{ projectId: "project-1", projectTitle: "Project One" }];
    state.search = "projectId=project-1";
    render(<UnifiedWorkspace />);
    await waitFor(() => expect(state.create).toHaveBeenCalledWith({ title: "New chat", projectId: "project-1" }));
    expect(state.location).toHaveBeenCalledWith("/chat?c=902&projectId=project-1");
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
    expect(screen.getAllByText("goal-visible-123").length).toBeGreaterThan(0);
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
