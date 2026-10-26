import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { Spec224WorkspacePanel } from "./Spec224WorkspacePanel";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), start: vi.fn(), info: vi.fn(), readiness: undefined as any }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: (...args: unknown[]) => mocks.info(...args) } }));
vi.mock("@/lib/trpc", () => ({ trpc: { spec226DevelopmentControl: {
  availableWorkspaces: { useQuery: () => ({ data: { workspaces: [{ runnerId: "runner-test", workspaceId: "workspace-test", displayName: "Test", status: "online", snapshotRevision: "1" }] } }) },
  getConversationWorkspace: { useQuery: () => ({ data: { workspace: { runnerId: "runner-test", workspaceId: "workspace-test" }, availability: { available: true, status: "current" } }, refetch: vi.fn() }) },
  workspaceRunnerReadiness: { useQuery: () => ({ data: mocks.readiness }) },
  bindConversationWorkspace: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  ingestSpecSet: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  prepareWorkspaceRun: { useMutation: () => ({ mutateAsync: mocks.prepare, isPending: false }) },
  startWorkspaceRun: { useMutation: () => ({ mutateAsync: mocks.start, isPending: false }) },
} } }));

function preparation(ready: boolean) {
  return { planRevision: 1, requirementCount: 0, blockers: [], runnableWorkPackageIds: ["prompt"],
    workPackages: [{ id: "prompt", externalId: "prompt", readiness: "READY", blockers: [] }],
    runnerReadiness: { ready, code: ready ? "RUNNER_READY" : "CODEX_TASK_PROBE_NOT_RUN", policyDecision: "pending",
      ownerAction: ready ? null : "Runner → Tools → Codex → ทดสอบสั่งงานจริง" } };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.readiness = undefined;
  mocks.prepare.mockResolvedValue(preparation(true));
  mocks.start.mockResolvedValue({ runId: "unit-run", jobId: "unit-job", dispatchStatus: "PENDING_AUTHORIZATION",
    authorization: { reasons: ["SPEC224_NONPRODUCTION_POLICY_NOT_CONFIGURED"] } });
});

async function preparePanel() {
  render(<Spec224WorkspacePanel conversationId={8} />);
  fireEvent.change(screen.getByLabelText("Spec 224 prompt"), { target: { value: "A scoped unit test goal" } });
  fireEvent.click(screen.getByRole("button", { name: "เตรียมแผนและตรวจความพร้อม" }));
  await screen.findByText(/ผลการเตรียม/);
}

describe("Core goal readiness feedback", () => {
  it("shows the real-task probe action and disables Start without treating pending policy as denial", async () => {
    mocks.prepare.mockResolvedValue(preparation(false));
    await preparePanel();
    expect(screen.getByText(/CODEX_TASK_PROBE_NOT_RUN/).textContent).toContain("ทดสอบสั่งงานจริง");
    expect(screen.getByText(/CODEX_TASK_PROBE_NOT_RUN/).textContent).toContain("รอประเมินตามขอบเขตของ Start");
    expect(screen.getByRole("button", { name: "สั่งพัฒนา" })).toBeDisabled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("preserves the Start key for pending authorization and displays the precise setup reason", async () => {
    await preparePanel();
    const start = screen.getByRole("button", { name: "สั่งพัฒนา" });
    fireEvent.click(start);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining("SPEC224_NONPRODUCTION_POLICY_NOT_CONFIGURED")));
    fireEvent.click(start);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    expect(mocks.start.mock.calls[0][0].idempotencyKey).toBe(mocks.start.mock.calls[1][0].idempotencyKey);
  });
});
