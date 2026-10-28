import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { Spec224WorkspacePanel } from "./Spec224WorkspacePanel";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), start: vi.fn(), resume: vi.fn(), bindWorkspace: vi.fn(), invalidateWorkspaceQuery: vi.fn(), info: vi.fn(), error: vi.fn(), readiness: undefined as any, role: "admin", workspace: { workspace: { runnerId: "runner-test", workspaceId: "workspace-test" }, availability: { available: true, status: "current" }, specSet: null }, workspaces: [{ runnerId: "runner-test", workspaceId: "workspace-test", displayName: "Test", status: "online", snapshotRevision: "1" }], featureSpecs: [{ id: "224-example-feature", title: "Example Feature", path: "specs/feature/224-example-feature/spec.md", summary: "Example implementation spec." }], featureSpecContext: { id: "224-example-feature", title: "Example Feature", path: "specs/feature/224-example-feature/spec.md", summary: "Example implementation spec.", digest: "a".repeat(64), handoff: { status: "CURRENT", nextReadyWorkunit: "WU-1", nextAction: "Implement the next ready unit.", resumePoint: "Continue at WU-1.", openRequirements: [{ id: "REQ-1", text: "Keep the API stable.", nextAction: "Add tests." }], integratedSha: "b".repeat(40) } }, ingestFeatureSpec: vi.fn(), ingestSpecSet: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => mocks.error(...args), info: (...args: unknown[]) => mocks.info(...args) } }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ spec226DevelopmentControl: { getConversationWorkspace: { invalidate: mocks.invalidateWorkspaceQuery } } }), runnerNodes: {
  list: { useQuery: () => ({ data: { runners: [{ runnerId: "runner-test", displayName: "Test Runner", status: "online", trustState: "trusted", displayState: "ready", readinessStatus: "online", lastSeenAt: new Date().toISOString(), capabilitySnapshotPersisted: true, capabilitySnapshotCurrent: true, capabilityAckState: "applied", snapshotRevision: "r1" }] } }) },
  workspaceReadiness: { useQuery: () => ({ data: mocks.readiness, isLoading: false, error: null }) },
}, spec226DevelopmentControl: {
  availableWorkspaces: { useQuery: () => ({ data: { workspaces: mocks.workspaces }, isLoading: false, error: null, refetch: vi.fn() }) },
  getConversationWorkspace: { useQuery: () => ({ data: mocks.workspace, refetch: vi.fn() }) },
  listFeatureSpecs: { useQuery: () => ({ data: { specs: mocks.featureSpecs }, isLoading: false, error: null }) },
  getFeatureSpecContext: { useQuery: () => ({ data: mocks.featureSpecContext, isLoading: false, error: null }) },
  ingestFeatureSpec: { useMutation: () => ({ mutateAsync: mocks.ingestFeatureSpec, isPending: false }) },
  workspaceRunnerReadiness: { useQuery: () => ({ data: mocks.readiness }) },
  bindConversationWorkspace: { useMutation: () => ({ mutateAsync: mocks.bindWorkspace, isPending: false }) },
  ingestSpecSet: { useMutation: () => ({ mutateAsync: mocks.ingestSpecSet }) },
  prepareWorkspaceRun: { useMutation: () => ({ mutateAsync: mocks.prepare, isPending: false }) },
  startWorkspaceRun: { useMutation: () => ({ mutateAsync: mocks.start, isPending: false }) },
  resumeWorkspaceRun: { useMutation: () => ({ mutateAsync: mocks.resume, isPending: false }) },
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
  mocks.bindWorkspace.mockResolvedValue({ conversationId: 47 });
  mocks.workspace = { workspace: { runnerId: "runner-test", workspaceId: "workspace-test" }, availability: { available: true, status: "current" }, specSet: null };
  mocks.role = "admin";
  mocks.workspaces = [{ runnerId: "runner-test", workspaceId: "workspace-test", displayName: "Test", status: "online", snapshotRevision: "1" }];
  mocks.featureSpecs = [{ id: "224-example-feature", title: "Example Feature", path: "specs/feature/224-example-feature/spec.md", summary: "Example implementation spec." }];
  mocks.featureSpecContext = { id: "224-example-feature", title: "Example Feature", path: "specs/feature/224-example-feature/spec.md", summary: "Example implementation spec.", digest: "a".repeat(64), handoff: { status: "CURRENT", nextReadyWorkunit: "WU-1", nextAction: "Implement the next ready unit.", resumePoint: "Continue at WU-1.", openRequirements: [{ id: "REQ-1", text: "Keep the API stable.", nextAction: "Add tests." }] }, integratedSha: "b".repeat(40) };
  mocks.prepare.mockResolvedValue(preparation(true));
  mocks.ingestSpecSet.mockResolvedValue({ revision: 2, files: [], requirementCount: 1 });
  mocks.start.mockResolvedValue({ runId: "unit-run", jobId: "unit-job", dispatchStatus: "PENDING_AUTHORIZATION",
    authorization: { reasons: ["SPEC224_NONPRODUCTION_POLICY_NOT_CONFIGURED"] } });
  mocks.resume.mockResolvedValue({ runId: "run-existing", jobId: "job-existing", dispatchStatus: "PENDING_AUTHORIZATION",
    authorization: { status: "APPROVAL_REQUIRED", reasons: ["APPROVAL_REQUIRED"] } });
});

async function preparePanel() {
  render(<Spec224WorkspacePanel conversationId={8} />);
  fireEvent.change(screen.getByLabelText("Spec 224 prompt"), { target: { value: "A scoped unit test goal" } });
  fireEvent.click(screen.getByRole("button", { name: "เตรียมแผนและตรวจความพร้อม" }));
  await screen.findByText(/ผลการเตรียม/);
}

describe("Core goal readiness feedback", () => {
  it("keeps continuation available without displaying internal run or package identifiers in simple mode", () => {
    mocks.workspace = { ...mocks.workspace, developmentRuns: [{ runId: "private-run-123", state: "BLOCKED_RECOVERABLE", workPackageId: "pkg", workPackageExternalId: "SPEC-internal-123", specSetRevision: 1, revision: 2 }] };
    render(<Spec224WorkspacePanel conversationId={8} simpleMode />);
    expect(screen.getByRole("button", { name: "ทำงานเดิมต่อ" })).toBeEnabled();
    expect(screen.queryByText(/private-run-123|SPEC-internal-123/)).not.toBeInTheDocument();
  });

  it("keeps the selected development source when switching presentation modes", () => {
    const { rerender } = render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "Canonical SPEC" }));
    expect(screen.getByLabelText("เลือกไฟล์ spec.md")).toBeInTheDocument();
    rerender(<Spec224WorkspacePanel conversationId={8} simpleMode />);
    expect(screen.getByLabelText("แนบไฟล์ Spec 224")).toBeInTheDocument();
    rerender(<Spec224WorkspacePanel conversationId={8} />);
    expect(screen.getByLabelText("เลือกไฟล์ spec.md")).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("shows the real-task probe action and disables Start without treating pending policy as denial", async () => {
    mocks.prepare.mockResolvedValue(preparation(false));
    await preparePanel();
    expect(screen.getAllByText(/CODEX_TASK_PROBE_NOT_RUN/).map(node => node.textContent).join(" ")).toContain("ทดสอบสั่งงานจริง");
    expect(screen.getAllByText(/CODEX_TASK_PROBE_NOT_RUN/).map(node => node.textContent).join(" ")).toContain("รอประเมินตามขอบเขตของ Start");
    expect(screen.getByRole("button", { name: "สั่งพัฒนา" })).toBeDisabled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("lets an Admin select a repository Feature Spec and imports it into the current Spec Set", async () => {
    mocks.ingestFeatureSpec.mockResolvedValue({ revision: 2, sourceSpec: { title: "Example Feature" } });
    render(<Spec224WorkspacePanel conversationId={8} />);

    fireEvent.click(screen.getByRole("radio", { name: "Canonical SPEC" }));
    expect(screen.getByRole("radio", { name: "เลือก Canonical SPEC จากระบบ" })).toBeInTheDocument();
    expect(screen.getByLabelText("เลือกไฟล์ spec.md")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("เลือกไฟล์ spec.md"), { target: { value: "224-example-feature" } });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่ม Spec ที่เลือกใน workspace" }));

    await waitFor(() => expect(mocks.ingestFeatureSpec).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 8,
      specId: "224-example-feature",
      idempotencyKey: expect.any(String),
    })));
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("exposes the repository catalog only to Admins and keeps manual Spec upload available", async () => {
    mocks.role = "user";
    render(<Spec224WorkspacePanel conversationId={8} />);

    fireEvent.click(screen.getByRole("radio", { name: "Canonical SPEC" }));

    expect(screen.queryByRole("radio", { name: "เลือก Canonical SPEC จากระบบ" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("แนบไฟล์ Spec 224")).toBeInTheDocument();
  });

  it("explains that selecting a workspace binds this conversation to that Runner", async () => {
    render(<Spec224WorkspacePanel conversationId={8} />);

    expect(screen.getByLabelText("1. เลือก Runner")).toBeInTheDocument();
    expect(screen.getByLabelText("2. เลือก Project Workspace")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Test" })).toBeInTheDocument();
    expect(screen.getByText(/Conversation นี้ผูกแล้ว: Test · สถานะ current/i)).toBeInTheDocument();
  });

  it("shows authorized workspace selection before conversation creation and keeps the draft in full-page Task Control", async () => {
    mocks.workspace = { workspace: null, availability: null, specSet: null };
    const createConversation = vi.fn().mockResolvedValue(47);
    const { rerender } = render(
      <Spec224WorkspacePanel conversationId={null} onCreateConversation={createConversation} />,
    );

    fireEvent.change(screen.getByLabelText("1. เลือก Runner"), { target: { value: "runner-test" } });
    expect(screen.getByRole("option", { name: "Test" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("2. เลือก Project Workspace"), {
      target: { value: '["runner-test","workspace-test"]' },
    });
    fireEvent.change(screen.getByLabelText("Spec 224 prompt"), {
      target: { value: "Create a tiny utility and tests" },
    });
    fireEvent.click(screen.getByRole("button", { name: "สร้างงานใหม่" }));

    await waitFor(() => expect(createConversation).toHaveBeenCalledWith("Create a tiny utility and tests"));
    expect(mocks.bindWorkspace).toHaveBeenCalledWith({
      conversationId: 47,
      runnerId: "runner-test",
      workspaceId: "workspace-test",
    });
    expect(screen.getByLabelText("Spec 224 prompt")).toHaveValue("Create a tiny utility and tests");

    rerender(<Spec224WorkspacePanel conversationId={47} onCreateConversation={createConversation} />);
    expect(screen.getByLabelText("Spec 224 prompt")).toHaveValue("Create a tiny utility and tests");
  });

  it("shows Goal approval, Runner readiness, cumulative budget and evidence in the shared workspace read model", () => {
    mocks.workspace = {
      workspace: { runnerId: "runner-test", workspaceId: "workspace-test" },
      availability: { available: true, status: "current" }, specSet: null,
      developmentRuns: [{ runId: "goal-run", state: "IMPLEMENT", goalApproval: { status: "pending", approvalRef: "approval-1" },
        runnerReadiness: { ready: true, code: "RUNNER_READY", ownerAction: null },
        budgetStatus: { limitMinorUnits: 500, heldMinorUnits: 100, capturedMinorUnits: 50, availableMinorUnits: 350, currency: "USD" },
        intermediateReceipts: ["receipt:phase-1"] }],
    };
    render(<Spec224WorkspacePanel conversationId={8} simpleMode />);
    expect(screen.getByText(/รออนุมัติ Goal/)).toBeInTheDocument();
    expect(screen.getByText(/Runner พร้อม/)).toBeInTheDocument();
    expect(screen.getByText(/งบ Goal USD 5\.00/)).toBeInTheDocument();
    expect(screen.getByText(/หลักฐาน 1/)).toBeInTheDocument();
  });

  it("shows a clear multi-image mock-up attachment control while developing from a Spec Set", async () => {
    render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "Canonical SPEC" }));

    const mockupInput = screen.getByLabelText("แนบภาพ Mock-up หลายภาพ");
    expect(screen.getByRole("button", { name: "เลือกภาพ Mock-up" })).toBeInTheDocument();
    fireEvent.change(mockupInput, { target: { files: [
      new File(["mockup"], "dashboard.png", { type: "image/png" }),
      new File(["mockup"], "mobile-mockup.jpg"),
    ] } });

    expect(await screen.findByText(/dashboard\.png/)).toBeInTheDocument();
    expect(screen.getByText(/mobile-mockup\.jpg/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ลบภาพ dashboard.png" })).toBeInTheDocument();
  });

  it("makes the multi-file Spec upload action visible and explains accepted files", async () => {
    render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "Canonical SPEC" }));
    fireEvent.click(screen.getByRole("radio", { name: "อัปโหลด Spec files" }));

    expect(screen.getByRole("button", { name: "เลือกไฟล์ Spec / JSON" })).toBeInTheDocument();
    expect(screen.getByText(/\.md, \.json หรือ \.zip/)).toBeInTheDocument();
  });

  it("keeps selected files queued and visible when the conversation has no bound workspace", async () => {
    mocks.workspace = { workspace: null, availability: null, specSet: null };
    render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "Canonical SPEC" }));
    fireEvent.click(screen.getByRole("radio", { name: "อัปโหลด Spec files" }));
    fireEvent.change(screen.getByLabelText("แนบไฟล์ Spec 224"), { target: { files: [new File(["# Feature"], "feature.md", { type: "text/markdown" })] } });

    expect(await screen.findByText("feature.md")).toBeInTheDocument();
    expect(screen.getByText(/เลือก Runner workspace.*ก่อน/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "บันทึกไฟล์ Spec เข้า workspace" })).toBeDisabled();
    expect(mocks.ingestSpecSet).not.toHaveBeenCalled();
  });

  it("saves multiple selected Markdown and JSON files into the bound Spec Set on explicit action", async () => {
    render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "Canonical SPEC" }));
    fireEvent.click(screen.getByRole("radio", { name: "อัปโหลด Spec files" }));
    fireEvent.change(screen.getByLabelText("แนบไฟล์ Spec 224"), { target: { files: [
      new File(["# Feature"], "feature.md", { type: "text/markdown" }),
      new File(["{}"], "requirements.json", { type: "application/json" }),
    ] } });
    fireEvent.click(await screen.findByRole("button", { name: "บันทึกไฟล์ Spec เข้า workspace" }));

    await waitFor(() => expect(mocks.ingestSpecSet).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 8,
      artifacts: expect.arrayContaining([
        expect.objectContaining({ path: "feature.md" }),
        expect.objectContaining({ path: "requirements.json" }),
      ]),
    })));
  });

  it("switches from Mini-App mode to Spec development instead of disabling Spec work", async () => {
    render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "สร้าง Mini App" }));
    const specMode = screen.getByRole("radio", { name: "Canonical SPEC" });
    expect(specMode).toBeEnabled();
    fireEvent.click(specMode);
    expect(screen.getByLabelText("เลือกไฟล์ spec.md")).toBeInTheDocument();
  });

  it("preserves the Start key for pending authorization and displays the precise setup reason", async () => {
    await preparePanel();
    expect(screen.getByLabelText("วงเงินสูงสุดสำหรับ DevelopmentRun เป็น USD")).toHaveValue("1.00");
    const start = screen.getByRole("button", { name: "สั่งพัฒนา" });
    fireEvent.click(start);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.start.mock.calls[0][0].budgetCapMinorUnits).toBe(100);
    await waitFor(() => expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining("SPEC224_NONPRODUCTION_POLICY_NOT_CONFIGURED")));
    fireEvent.click(start);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    expect(mocks.start.mock.calls[0][0].idempotencyKey).toBe(mocks.start.mock.calls[1][0].idempotencyKey);
  });

  it("reports a failed Start lookup as an error instead of claiming the run was saved", async () => {
    mocks.start.mockRejectedValueOnce(new Error("Development run not found"));
    await preparePanel();
    fireEvent.click(screen.getByRole("button", { name: "สั่งพัฒนา" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Development run not found"));
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it("offers a separate action to continue the exact existing DevelopmentRun", async () => {
    mocks.workspace = { ...mocks.workspace, developmentRuns: [{ runId: "run-existing", state: "BLOCKED_RECOVERABLE",
      workPackageId: "pkg", workPackageExternalId: "SPEC-224", specSetRevision: 1, revision: 2 }] };
    render(<Spec224WorkspacePanel conversationId={233} />);

    fireEvent.click(screen.getByRole("button", { name: "ทำงานเดิมต่อ" }));

    await waitFor(() => expect(mocks.resume).toHaveBeenCalledWith({ conversationId: 233, runId: "run-existing", budgetCapMinorUnits: 100 }));
    expect(mocks.start).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining("APPROVAL_REQUIRED")));
  });

  it("preselects the authorized Platform workspace and lets scoped preflight handle dirty files", async () => {
    mocks.role = "user";
    mocks.workspace = { workspace: null, availability: null, specSet: null };
    mocks.workspaces = [{ runnerId: "runner-test", workspaceId: "workspace-test", displayName: "SmartAIHub Platform Engineering", canonicalProjectTitle: "SmartAIHub Platform Engineering", scope: "PLATFORM_ENGINEERING", status: "online", snapshotRevision: "fresh", gitHead: "a".repeat(40), dirty: true, convergenceState: "NOT_REPORTED", convergenceCanonicalSha: null }];
    render(<Spec224WorkspacePanel conversationId={null} simpleMode onCreateConversation={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("1. เลือก Runner")).toHaveValue("runner-test"));
    expect(screen.getByLabelText("2. เลือก Project Workspace")).toHaveValue('["runner-test","workspace-test"]');
    expect(screen.getByRole("heading", { name: "พัฒนาระบบ SmartAIHub" })).toBeInTheDocument();
    expect(screen.getByText(/เปลี่ยนเป็น Developer view เพื่อกำหนด scope/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/runner-test|workspace-test/)).not.toBeInTheDocument();
  });

  it("creates and binds SPEC plus prompt through the existing preparation path", async () => {
    mocks.role = "user";
    mocks.workspace = { workspace: null, availability: null, specSet: null };
    mocks.workspaces = [{ runnerId: "runner-test", workspaceId: "workspace-test", displayName: "SmartAIHub Platform Engineering", canonicalProjectTitle: "SmartAIHub Platform Engineering", scope: "PLATFORM_ENGINEERING", status: "online", snapshotRevision: "fresh", gitHead: "a".repeat(40), dirty: false, convergenceState: "USER_WORKSPACE_CONVERGED", convergenceCanonicalSha: "a".repeat(40) }];
    const createConversation = vi.fn().mockResolvedValue(47);
    mocks.ingestFeatureSpec.mockResolvedValue({ revision: 2, sourceSpec: { title: "Example Feature" } });
    render(<Spec224WorkspacePanel conversationId={null} simpleMode onCreateConversation={createConversation} />);
    fireEvent.click(screen.getByRole("radio", { name: "SPEC + Prompt" }));
    fireEvent.change(screen.getByLabelText("คำสั่งเพิ่มเติมสำหรับ SPEC"), { target: { value: "Keep the public API backward compatible." } });
    fireEvent.change(screen.getByLabelText("เลือกไฟล์ spec.md"), { target: { value: "224-example-feature" } });
    fireEvent.click(screen.getByRole("button", { name: "เริ่มพัฒนา" }));
    await waitFor(() => expect(mocks.ingestFeatureSpec).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 47, specId: "224-example-feature" })));
    expect(createConversation).toHaveBeenCalledWith("Example Feature");
    expect(mocks.bindWorkspace).toHaveBeenCalledWith({ conversationId: 47, runnerId: "runner-test", workspaceId: "workspace-test" });
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 47, mode: "spec_set", additionalInstructions: "Keep the public API backward compatible." }));
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("blocks a canonical SPEC package that is not the next handoff WorkUnit", async () => {
    render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "Canonical SPEC" }));
    fireEvent.change(screen.getByLabelText("เลือกไฟล์ spec.md"), { target: { value: "224-example-feature" } });
    fireEvent.click(screen.getByRole("button", { name: "เตรียมแผนและตรวจความพร้อม" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/ไม่มี runnable package ที่ตรงกัน/));
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
