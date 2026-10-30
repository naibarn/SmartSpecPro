/** @vitest-environment jsdom */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  search: "",
  location: vi.fn(),
  jobs: [] as Array<Record<string, any>>,
  runners: [] as Array<Record<string, any>>,
  create: vi.fn(async () => ({ id: 902 })),
}));

vi.mock("wouter", () => ({
  useSearch: () => state.search,
  useLocation: () => ["/chat", state.location],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workerJobs: { observability: { useQuery: () => ({ data: { items: state.jobs }, isLoading: false, error: null }) } },
    runnerNodes: { list: { useQuery: () => ({ data: { runners: state.runners }, isLoading: false, error: null }) } },
    chat: {
      createConversation: { useMutation: () => ({ mutateAsync: state.create }) },
      getConversation: { useQuery: () => ({ data: { id: 901, title: "Saved session" } }) },
    },
  },
}));

vi.mock("@/lib/useTaskHarnessOutputEvents", () => ({
  useTaskHarnessOutputEvents: () => ({ events: [{ id: "event-1", text: "Running verified tests" }], eventsJobId: state.jobs[0]?.id, query: { isLoading: false, error: null } }),
}));

vi.mock("@/components/chat/ChatSidebar", () => ({ ChatSidebar: () => <nav aria-label="Saved sessions"><button type="button" onClick={() => undefined}>Saved session</button></nav> }));
vi.mock("@/components/chat/ChatView", () => ({ ChatView: () => <section aria-label="Conversation canvas">Conversation canvas</section> }));
vi.mock("@/components/chat/UnifiedWorkspaceInspector", () => ({ UnifiedWorkspaceInspector: () => <aside aria-label="Execution inspector">Inspector</aside> }));

import UnifiedWorkspace from "./UnifiedWorkspace";

const job = {
  id: "job-secret-id", jobType: "spec224.development", status: "running", stage: "IMPLEMENT", attempt: 1, maxAttempts: 2,
  heartbeatAt: "2026-10-30T02:00:00.000Z", createdAt: "2026-10-30T01:00:00.000Z", workerId: "agent-1", runnerId: "runner-1",
  threadId: "thread-1", conversationId: 901, conversationTitle: "Saved session", threadTitle: "Pilot implementation", projectId: "SmartAIHub Core", specId: null,
  executionIdentity: { runId: "run-1", agent: "Codex worker", harness: "Codex", model: "gpt-6.1-sol", reasoningEffort: "high" },
  operatorAttention: { required: false, reason: null }, recovery: { retryEligible: false, nextRetryAt: null },
};

describe("UnifiedWorkspace", () => {
  beforeEach(() => {
    state.search = "";
    state.location.mockClear();
    state.create.mockClear();
    state.jobs = [job];
    state.runners = [{ runnerId: "runner-1", displayName: "Debian Development Runner", displayState: "ready", status: "online", trustState: "trusted" }];
    window.localStorage.clear();
  });

  it("renders the full workspace navigation and persistent session/inspector panes", () => {
    render(<UnifiedWorkspace />);
    expect(screen.getByRole("navigation", { name: "SmartAIHub workspace navigation" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Task Control" })).toHaveAttribute("href", "/chat?mode=tasks");
    expect(screen.getByRole("link", { name: "Mission Control" })).toHaveAttribute("href", "/chat?mode=mission");
    expect(screen.getByRole("navigation", { name: "Saved sessions" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Conversation canvas" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Execution inspector" })).toBeTruthy();
  });

  it("organizes Task Control by project and reports absent lifecycle evidence honestly", () => {
    state.search = "mode=tasks";
    render(<UnifiedWorkspace />);
    expect(screen.getByRole("heading", { name: "Task Control" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "SmartAIHub Core" })).toBeTruthy();
    expect(screen.getByText("1 recorded item(s)")).toBeTruthy();
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "เปิดบทสนทนาและหลักฐาน" })).toBeTruthy();
  });

  it("groups Mission Control by recorded Harness, supports independent tabs, and displays real output", () => {
    state.search = "mode=mission";
    render(<UnifiedWorkspace />);
    expect(screen.getByRole("heading", { name: "Mission Control" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pilot implementation" }));
    expect(screen.getByRole("heading", { name: "Pilot implementation" })).toBeTruthy();
    expect(state.location).toHaveBeenCalledWith(expect.stringContaining("jobId=job-secret-id"));
    expect(state.location).toHaveBeenCalledWith(expect.stringContaining("jobIds=job-secret-id"));
    fireEvent.click(screen.getByRole("button", { name: "Developer" }));
    expect(screen.getByText("Running verified tests")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close view Pilot implementation" }));
    expect(screen.queryByRole("button", { name: "Close view Pilot implementation" })).toBeNull();
    expect(screen.getByText("Debian Development Runner")).toBeTruthy();
  });
});
