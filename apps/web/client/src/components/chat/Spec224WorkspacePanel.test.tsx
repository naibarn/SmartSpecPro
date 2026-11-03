import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { Spec224WorkspacePanel, readinessMessage } from "./Spec224WorkspacePanel";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), start: vi.fn(), resume: vi.fn(), approve: vi.fn(), cancelUnclaimed: vi.fn(), cancelLegacyJob: vi.fn(), pendingApprovals: { requests: [] as any[] }, bindWorkspace: vi.fn(), invalidateWorkspaceQuery: vi.fn(), invalidatePendingApprovals: vi.fn(), invalidateLedgerAccounts: vi.fn(), refetchWorkspaceBinding: vi.fn(), ledgerAccounts: { accounts: [] as any[], configured: null as any }, configureLedger: vi.fn(), provisionLedger: vi.fn(), refetchWorkspaces: vi.fn(), availableWorkspacesQueryOptions: undefined as any, info: vi.fn(), error: vi.fn(), readiness: undefined as any, role: "admin", workspace: { workspace: { runnerId: "runner-test", workspaceId: "workspace-test" }, availability: { available: true, status: "current" }, specSet: null }, workspaces: [{ runnerId: "runner-test", workspaceId: "workspace-test", displayName: "Test", status: "online", snapshotRevision: "1", modelCatalog: null as any }], featureSpecs: [{ id: "224-example-feature", title: "Example Feature", path: "specs/feature/224-example-feature/spec.md", summary: "Example implementation spec." }], featureSpecContext: { id: "224-example-feature", title: "Example Feature", path: "specs/feature/224-example-feature/spec.md", summary: "Example implementation spec.", digest: "a".repeat(64), handoff: { status: "CURRENT", nextReadyWorkunit: "WU-1", nextAction: "Implement the next ready unit.", resumePoint: "Continue at WU-1.", openRequirements: [{ id: "REQ-1", text: "Keep the API stable.", nextAction: "Add tests." }], integratedSha: "b".repeat(40) } }, ingestFeatureSpec: vi.fn(), ingestSpecSet: vi.fn() }));
vi.mock("@/i18n/useScopedTranslation", () => ({ useScopedTranslation: () => ({
  t: (key: string) => ({
    "taskControl.singleHarnessGoal": "เลือก Harness หนึ่งรายการสำหรับ Goal นี้จาก capability ที่ Runner ยืนยัน งานจะไม่ถูกส่งไปหลาย Harness โดยอัตโนมัติ",
    "taskControl.runnerOnline": "ออนไลน์",
    "taskControl.runnerWaiting": "ออฟไลน์ / รอตรวจสอบ",
  }[key] ?? key),
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-test", currentTenantId: "tenant-test", role: mocks.role } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => mocks.error(...args), info: (...args: unknown[]) => mocks.info(...args) } }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ spec226DevelopmentControl: { getConversationWorkspace: { invalidate: mocks.invalidateWorkspaceQuery } }, approvals: { getPending: { invalidate: mocks.invalidatePendingApprovals } }, economicControlPlane: { listSpec224LedgerAccounts: { invalidate: mocks.invalidateLedgerAccounts } } }), economicControlPlane: {
  listSpec224LedgerAccounts: { useQuery: () => ({ data: mocks.ledgerAccounts, isLoading: false, error: null }) },
  ensureSpec224LedgerAccounts: { useMutation: (options: any) => ({ isPending: false, mutate: async (input: any) => { await mocks.configureLedger(input); await options?.onSuccess?.({ initialized: true }); } }) },
  configureSpec224LedgerAccounts: { useMutation: (options: any) => ({ isPending: false, mutate: async (input: any) => { await mocks.configureLedger(input); await options?.onSuccess?.(); } }) },
  provisionLedgerAccount: { useMutation: (options: any) => ({ isPending: false, mutate: async (input: any) => { await mocks.provisionLedger(input); await options?.onSuccess?.(); } }) },
}, approvals: {
  getPending: { useQuery: () => ({ data: mocks.pendingApprovals }) },
  submitDecision: { useMutation: (options: any) => ({ isPending: false, mutate: async (input: any) => { await mocks.approve(input); await options?.onSuccess?.(); } }) },
}, runnerNodes: {
  list: { useQuery: () => ({ data: { runners: [{ runnerId: "runner-test", displayName: "Test Runner", status: "online", trustState: "trusted", displayState: "ready", readinessStatus: "online", lastSeenAt: new Date().toISOString(), capabilitySnapshotPersisted: true, capabilitySnapshotCurrent: true, capabilityAckState: "applied", snapshotRevision: "r1", platform: { os: "windows", architecture: "x86_64", target: "x86_64-pc-windows-msvc", machineName: "DEV-PC-01" } }] } }) },
  workspaceReadiness: { useQuery: () => ({ data: mocks.readiness, isLoading: false, error: null }) },
}, spec226DevelopmentControl: {
  availableWorkspaces: { useQuery: (_input: unknown, options: unknown) => { mocks.availableWorkspacesQueryOptions = options; return { data: { workspaces: mocks.workspaces }, isLoading: false, isFetching: false, error: null, refetch: mocks.refetchWorkspaces }; } },
  getConversationWorkspace: { useQuery: () => ({ data: mocks.workspace, refetch: mocks.refetchWorkspaceBinding }) },
  listFeatureSpecs: { useQuery: () => ({ data: { specs: mocks.featureSpecs }, isLoading: false, error: null }) },
  listPlatformWorkspaceBindingCandidates: { useQuery: () => ({ data: { workspaces: [] }, isLoading: false, error: null }) },
  getFeatureSpecContext: { useQuery: () => ({ data: mocks.featureSpecContext, isLoading: false, error: null }) },
  ingestFeatureSpec: { useMutation: () => ({ mutateAsync: mocks.ingestFeatureSpec, isPending: false }) },
  ingestModularSaasProject: { useMutation: () => ({ mutateAsync: mocks.ingestSpecSet, isPending: false }) },
  workspaceRunnerReadiness: { useQuery: () => ({ data: mocks.readiness }) },
  bindConversationWorkspace: { useMutation: () => ({ mutateAsync: mocks.bindWorkspace, isPending: false }) },
  createAndBindModularCoreWorkspace: { useMutation: () => ({ mutateAsync: mocks.bindWorkspace, isPending: false }) },
  ingestSpecSet: { useMutation: () => ({ mutateAsync: mocks.ingestSpecSet }) },
  prepareWorkspaceRun: { useMutation: () => ({ mutateAsync: mocks.prepare, isPending: false }) },
  startWorkspaceRun: { useMutation: () => ({ mutateAsync: mocks.start, isPending: false }) },
  resumeWorkspaceRun: { useMutation: () => ({ mutateAsync: mocks.resume, isPending: false }) },
  cancelUnclaimedLegacyPlatformRun: { useMutation: () => ({ mutateAsync: mocks.cancelUnclaimed, isPending: false }) },
}, workerJobs: { cancelQueued: { useMutation: () => ({ mutateAsync: mocks.cancelLegacyJob, isPending: false }) } } } }));

function preparation(ready: boolean) {
  return { planRevision: 1, requirementCount: 0, blockers: [], runnableWorkPackageIds: ["prompt"],
    workPackages: [{ id: "prompt", externalId: "prompt", readiness: "READY", blockers: [] }],
    runnerReadiness: { ready, code: ready ? "RUNNER_READY" : "CODEX_TASK_PROBE_NOT_RUN", policyDecision: "pending",
      ownerAction: ready ? null : "Runner → Tools → Codex → ทดสอบสั่งงานจริง" } };
}

function discoveredModelCatalog() {
  return {
    state: "discovered", adapterId: "codex.v1", cliVersion: "1.2.3", observedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(), accountProviderFingerprint: "account-fingerprint",
    revision: "catalog-rev-1", models: [{ id: "test-model", displayName: "Test Model", isDefault: true, reasoningEfforts: ["low", "medium", "high"], defaultReasoningEffort: "medium" }],
  };
}

function usePlatformSourceWorkspace() {
  mocks.workspaces = [
    { runnerId: "runner-test", workspaceId: "workspace-test", displayName: "Test", status: "online", snapshotRevision: "1", modelCatalog: discoveredModelCatalog() },
    { runnerId: "runner-test", workspaceId: "platform-source", displayName: "SmartAIHub Development Workspace", canonicalProjectTitle: "SmartAIHub Development Workspace", scope: "PLATFORM_ENGINEERING", status: "online", snapshotRevision: "fresh", gitHead: "a".repeat(40), dirty: false, convergenceState: "USER_WORKSPACE_CONVERGED", convergenceCanonicalSha: "a".repeat(40), modelCatalog: discoveredModelCatalog() },
  ];
}

beforeEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.clearAllMocks();
  mocks.readiness = undefined;
  mocks.ledgerAccounts = { accounts: [], configured: { debitAccountId: "test-debit", creditAccountId: "test-credit" } };
  mocks.pendingApprovals = { requests: [] };
  mocks.bindWorkspace.mockResolvedValue({ conversationId: 47 });
  mocks.workspace = { workspace: { runnerId: "runner-test", workspaceId: "workspace-test" }, availability: { available: true, status: "current" }, specSet: null };
  mocks.role = "admin";
  mocks.workspaces = [{ runnerId: "runner-test", workspaceId: "workspace-test", displayName: "Test", status: "online", snapshotRevision: "1", modelCatalog: discoveredModelCatalog() }];
  mocks.featureSpecs = [{ id: "224-example-feature", title: "Example Feature", path: "specs/feature/224-example-feature/spec.md", summary: "Example implementation spec." }];
  mocks.featureSpecContext = { id: "224-example-feature", title: "Example Feature", path: "specs/feature/224-example-feature/spec.md", summary: "Example implementation spec.", digest: "a".repeat(64), handoff: { status: "CURRENT", nextReadyWorkunit: "WU-1", nextAction: "Implement the next ready unit.", resumePoint: "Continue at WU-1.", openRequirements: [{ id: "REQ-1", text: "Keep the API stable.", nextAction: "Add tests." }] }, integratedSha: "b".repeat(40) };
  mocks.refetchWorkspaces.mockResolvedValue({});
  mocks.refetchWorkspaceBinding.mockResolvedValue({});
  mocks.prepare.mockResolvedValue(preparation(true));
  mocks.ingestSpecSet.mockResolvedValue({ revision: 2, files: [], requirementCount: 1 });
  mocks.start.mockResolvedValue({ runId: "unit-run", jobId: "unit-job", dispatchStatus: "PENDING_AUTHORIZATION",
    authorization: { reasons: ["SPEC224_NONPRODUCTION_POLICY_NOT_CONFIGURED"] } });
  mocks.resume.mockResolvedValue({ runId: "run-existing", jobId: "job-existing", dispatchStatus: "PENDING_AUTHORIZATION",
    authorization: { status: "APPROVAL_REQUIRED", reasons: ["APPROVAL_REQUIRED"] } });
  mocks.cancelUnclaimed.mockReset().mockResolvedValue({ canceled: true, jobId: "job-old" });
  mocks.cancelLegacyJob.mockReset().mockResolvedValue({ canceled: true });
  mocks.approve.mockResolvedValue({ status: "approved" });
});

async function preparePanel(simpleMode = false) {
  render(<Spec224WorkspacePanel conversationId={8} simpleMode={simpleMode} />);
  fireEvent.change(screen.getByLabelText("Spec 224 prompt"), { target: { value: "A scoped unit test goal" } });
  fireEvent.click(screen.getByRole("button", { name: "เตรียมแผนและตรวจความพร้อม" }));
  await screen.findByText(/ผลการเตรียม/);
}

describe("Core goal readiness feedback", () => {
  it("preselects a Mission Control Harness target only when the selected Runner catalog confirms it", async () => {
    render(<Spec224WorkspacePanel conversationId={8} requestedHarnessAdapterId="codex.v1" />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Harness" })).toHaveTextContent("Codex"));
    expect(screen.getByRole("combobox", { name: "Harness" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("prepares and starts the bounded Pilot through the existing Goal/Run mutations", async () => {
    usePlatformSourceWorkspace();
    mocks.readiness = { ready: true, code: "RUNNER_READY", policyDecision: "pending", ownerAction: null };
    mocks.workspace = { workspace: { runnerId: "runner-test", workspaceId: "platform-source" }, availability: { available: true, status: "current" }, specSet: null };
    mocks.prepare.mockResolvedValue({
      ...preparation(true),
      workPackages: [{ id: "prompt", externalId: "prompt", readiness: "READY", blockers: [], sourceAdmission: { status: "SAFE_CLEAN" } }],
    });
    render(<Spec224WorkspacePanel conversationId={47} simpleMode pilotMode />);

    expect(await screen.findByRole("region", { name: "First Run Pilot goal review" })).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveTextContent("Implement:");
    expect(screen.getByRole("list")).toHaveTextContent("Review & edge cases");
    expect(screen.getByText(/apps\/runner-app\/tests\/spec224-live-pilot/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Project Workspace" })).toHaveTextContent("SmartAIHub Development Workspace");
    const goalReview = screen.getByRole("region", { name: "ขอบเขต Goal ที่จะอนุมัติ" });
    expect(goalReview).toHaveTextContent("Harness: Codex");
    expect(goalReview).toHaveTextContent("Model: Test Model");
    expect(goalReview).toHaveTextContent("Budget cap: USD 1.00");
    expect(screen.queryByRole("radio", { name: /อนุญาตทุกไฟล์/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ตรวจสอบความพร้อมและแผน Pilot" }));
    await screen.findByRole("region", { name: "ผลการตรวจความพร้อม Pilot" });
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 47,
      mode: "prompt",
      writeScope: ["apps/runner-app/tests/spec224-live-pilot/**"],
    }));

    fireEvent.click(screen.getByRole("button", { name: "ส่ง Goal เพื่ออนุมัติและเริ่ม Pilot" }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 47,
      mode: "prompt",
      writeScope: ["apps/runner-app/tests/spec224-live-pilot/**"],
      budgetCapMinorUnits: 100,
    })));
  });

  it("locks a submitted Pilot Run and keeps its returned identity visible while the persisted view refreshes", async () => {
    usePlatformSourceWorkspace();
    mocks.readiness = { ready: true, code: "RUNNER_READY", policyDecision: "pending", ownerAction: null };
    mocks.workspace = { workspace: { runnerId: "runner-test", workspaceId: "platform-source" }, availability: { available: true, status: "current" }, specSet: null };
    mocks.prepare.mockResolvedValue({
      ...preparation(true),
      workPackages: [{ id: "prompt", externalId: "prompt", readiness: "READY", blockers: [], sourceAdmission: { status: "SAFE_CLEAN" } }],
    });
    mocks.start.mockResolvedValueOnce({
      runId: "pilot-live-run",
      jobId: "pilot-live-job",
      dispatchStatus: "ENQUEUED",
      goalAdmissionStatus: "READY_FOR_LIVE",
      authorization: { status: "READY_FOR_LIVE", approvalRef: "approval-live-1" },
    });
    render(<Spec224WorkspacePanel conversationId={47} simpleMode pilotMode />);

    fireEvent.click(await screen.findByRole("button", { name: "ตรวจสอบความพร้อมและแผน Pilot" }));
    const start = await screen.findByRole("button", { name: "ส่ง Goal เพื่ออนุมัติและเริ่ม Pilot" });
    fireEvent.click(start);

    expect(await screen.findByRole("status", { name: "บันทึก First Run แล้ว" })).toHaveTextContent("pilot-live-run");
    expect(screen.getByRole("status", { name: "บันทึก First Run แล้ว" })).toHaveTextContent("approval-live-1");
    expect(start).toBeDisabled();
    fireEvent.click(start);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateWorkspaceQuery).toHaveBeenCalledWith({ conversationId: 47 });
  });

  it("restores a persisted Pilot result and prevents starting a duplicate Goal", async () => {
    usePlatformSourceWorkspace();
    mocks.readiness = { ready: true, code: "RUNNER_READY", policyDecision: "pending", ownerAction: null };
    mocks.workspace = {
      workspace: { runnerId: "runner-test", workspaceId: "platform-source" },
      availability: { available: true, status: "current" }, specSet: null,
      developmentRuns: [{
        runId: "pilot-run-1", jobId: "pilot-job-1", isFirstRunPilot: true, conversationId: 46, threadId: "thread-origin", state: "IMPLEMENT", finalVerifyStatus: "pending",
        goalApproval: { status: "approved", approvalRef: "approval-1" },
        budgetStatus: { limitMinorUnits: 500, heldMinorUnits: 100, capturedMinorUnits: 25, availableMinorUnits: 375, currency: "USD" },
        intermediateReceipts: ["evidence-ref-1"],
      }],
    };

    render(<Spec224WorkspacePanel conversationId={47} simpleMode pilotMode />);

    expect(await screen.findByText(/Goal \/ Run ของ First Run Pilot ที่บันทึกไว้/)).toBeInTheDocument();
    expect(screen.getByText("pilot-run-1")).toBeInTheDocument();
    expect(screen.getByText("approval-1")).toBeInTheDocument();
    expect(screen.getByText(/Final Verify: pending/)).toBeInTheDocument();
    expect(screen.getByText(/execution evidence refs 1/)).toBeInTheDocument();
    expect(screen.getByText(/captured 0\.25 · held 1\.00/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat session" })).toHaveAttribute("href", "/chat?c=46&t=thread-origin");
    expect(screen.getByRole("link", { name: "Task Control" })).toHaveAttribute("href", "/chat?mode=tasks&c=46&t=thread-origin&jobId=pilot-job-1");
    expect(screen.getByRole("link", { name: "Mission Control" })).toHaveAttribute("href", "/chat?mode=mission&c=46&t=thread-origin&jobId=pilot-job-1");
    expect(screen.getByRole("button", { name: "ตรวจสอบความพร้อมและแผน Pilot" })).toBeDisabled();
  });

  it("lets an authorized approver act on the canonical pending Goal request", async () => {
    usePlatformSourceWorkspace();
    mocks.workspace = {
      workspace: { runnerId: "runner-test", workspaceId: "platform-source" },
      availability: { available: true, status: "current" }, specSet: null,
      developmentRuns: [{ runId: "pilot-run-approval", isFirstRunPilot: true, conversationId: 47, state: "IMPLEMENT",
        goalApproval: { status: "pending", approvalRef: "approval-uuid" } }],
    };
    mocks.pendingApprovals = { requests: [{ id: "approval-uuid", title: "Approve bounded First Run Goal" }] };
    render(<Spec224WorkspacePanel conversationId={47} simpleMode pilotMode />);

    expect(await screen.findByText("Approve bounded First Run Goal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "อนุมัติ Goal" }));
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith({
      requestId: "approval-uuid", decision: "approved", comment: "Approved bounded SPEC-224 First Run Goal.",
    }));
    expect(mocks.invalidatePendingApprovals).toHaveBeenCalled();
  });

  it("resumes the same persisted Pilot DevelopmentRun after approval without creating a new Goal", async () => {
    usePlatformSourceWorkspace();
    mocks.workspace = {
      workspace: { runnerId: "runner-test", workspaceId: "platform-source" },
      availability: { available: true, status: "current" }, specSet: null,
      developmentRuns: [{
        runId: "pilot-run-resume", jobId: "pilot-job-resume", isFirstRunPilot: true, conversationId: 46, state: "IMPLEMENT",
        goalApproval: { status: "approved", approvalRef: "approval-resume" },
        finalVerifyStatus: "pending", intermediateReceipts: [],
      }],
    };

    render(<Spec224WorkspacePanel conversationId={47} simpleMode pilotMode />);

    fireEvent.click(await screen.findByRole("button", { name: "ทำงานเดิมต่อ" }));
    await waitFor(() => expect(mocks.resume).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 46,
      runId: "pilot-run-resume",
    })));
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("explains Runner source and online state without exposing machine name in Simple mode", () => {
    render(<Spec224WorkspacePanel conversationId={8} simpleMode />);
    expect(screen.getByRole("option", { name: "Test Runner · Windows · ออนไลน์" })).toBeInTheDocument();
    expect(screen.queryByText(/DEV-PC-01/)).not.toBeInTheDocument();
  });

  it("restores the unsubmitted Task Control draft after the panel remounts in the same tab", async () => {
    const first = render(<Spec224WorkspacePanel conversationId={9} simpleMode />);
    fireEvent.change(screen.getByLabelText("Spec 224 prompt"), { target: { value: "Resume this bounded pilot after switching apps" } });
    fireEvent.click(screen.getByRole("radio", { name: /อนุญาตทุกไฟล์ใน Workspace/ }));

    await waitFor(() => expect(window.sessionStorage.getItem("spec224-task-draft:v1:tenant-test:user-test:9:main")).toContain("Resume this bounded pilot"));
    first.unmount();

    render(<Spec224WorkspacePanel conversationId={9} simpleMode />);
    expect(await screen.findByLabelText("Spec 224 prompt")).toHaveValue("Resume this bounded pilot after switching apps");
    expect(screen.getByRole("radio", { name: /อนุญาตทุกไฟล์ใน Workspace/ })).toBeChecked();
  });

  it("remembers the latest Runner, Workspace, Model and reasoning choice for the user's next Goal", async () => {
    mocks.workspace = { workspace: null, availability: null, specSet: null };
    mocks.workspaces[0].modelCatalog = {
      ...discoveredModelCatalog(),
      models: [
        { id: "model-a", displayName: "Model A", isDefault: true, reasoningEfforts: ["low", "medium", "high"] },
        { id: "model-b", displayName: "Model B", isDefault: false, reasoningEfforts: ["high"] },
      ],
    };
    const key = "spec224-task-preferences:v1:tenant-test:user-test";
    window.localStorage.setItem(key, JSON.stringify({
      selectedRunnerId: "runner-test",
      selectedWorkspace: '["runner-test","workspace-test"]',
      harnessPolicy: "auto",
      selectedHarnessAdapterId: "",
      modelPolicy: "explicit",
      selectedModelId: "model-b",
      reasoningEffort: "high",
    }));

    const first = render(<Spec224WorkspacePanel conversationId={null} simpleMode onCreateConversation={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByLabelText("1. เลือก Runner")).toHaveValue("runner-test");
      expect(screen.getByLabelText("2. เลือก Project Workspace")).toHaveValue('["runner-test","workspace-test"]');
    });
    expect(screen.getByRole("combobox", { name: "AI Model" })).toHaveTextContent("Model B");
    expect(screen.getByRole("radio", { name: "High" })).toBeChecked();

    const modelSelector = screen.getByRole("combobox", { name: "AI Model" });
    fireEvent.click(modelSelector);
    fireEvent.click(screen.getByRole("option", { name: "Model A · Default" }));
    fireEvent.click(screen.getByRole("radio", { name: "Low" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(key) ?? "{}")).toMatchObject({
      selectedRunnerId: "runner-test",
      selectedWorkspace: '["runner-test","workspace-test"]',
      modelPolicy: "explicit",
      selectedModelId: "model-a",
      reasoningEffort: "low",
    }));

    first.unmount();
    render(<Spec224WorkspacePanel conversationId={null} simpleMode onCreateConversation={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "AI Model" })).toHaveTextContent("Model A");
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
  });

  it("explains stale probe publication and missing workspace source facts separately", () => {
    expect(readinessMessage("CODEX_TASK_PROBE_EXPIRED", "stale")).toMatch(/ยังไม่ถูกรับรอง.*ACK/);
    expect(readinessMessage("WORKSPACE_SOURCE_FINGERPRINT_UNAVAILABLE", "applied")).toMatch(/เป็น Git repository.*เข้าถึงได้/);
  });

  it("renders only Runner-discovered models and sends the chosen model and supported effort with Start", async () => {
    mocks.workspaces[0].modelCatalog = {
      state: "discovered", adapterId: "codex.v1", cliVersion: "1.2.3", observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(), accountProviderFingerprint: "account-fingerprint",
      revision: "catalog-rev-1", models: [
        { id: "dynamic-model-a", displayName: "Dynamic Model A", isDefault: true, reasoningEfforts: ["low", "medium"] },
        { id: "dynamic-model-b", displayName: "Dynamic Model B", isDefault: false, reasoningEfforts: ["high"] },
      ],
    };
    mocks.readiness = { ready: true, code: "RUNNER_READY", policyDecision: "pending", ownerAction: null };
    await preparePanel();

    fireEvent.click(screen.getByRole("button", { name: "ตรวจสอบ Model ล่าสุด" }));
    expect(mocks.refetchWorkspaces).toHaveBeenCalled();
    const harnessSelector = screen.getByRole("combobox", { name: "Harness" });
    expect(harnessSelector).toHaveTextContent("Auto · Codex");
    fireEvent.click(harnessSelector);
    expect(screen.getByRole("option", { name: "Codex" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Codex" }));
    const modelSelector = screen.getByRole("combobox", { name: "AI Model" });
    expect(modelSelector).toHaveTextContent(/Auto/);
    fireEvent.click(modelSelector);
    expect(screen.getByRole("option", { name: "Dynamic Model A · Default" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dynamic Model B" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /gpt-|claude|o[0-9]/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Dynamic Model B" }));
    expect(await screen.findByRole("radio", { name: "High" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "สั่งพัฒนา" }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      provider: "codex",
      modelSelection: { policy: "explicit", modelId: "dynamic-model-b", reasoningEffort: "high" },
    })));
  });

  it("keeps Start disabled when the selected Runner has no current discovered model catalog", async () => {
    mocks.workspaces[0].modelCatalog = null;
    await preparePanel();
    expect(screen.getByRole("button", { name: "สั่งพัฒนา" })).toBeDisabled();
    expect(screen.getByText(/ยังไม่มี Model catalog/)).toBeInTheDocument();
  });

  it("recovers an expired catalog from fresh authorized Runner snapshots without reloading the page", async () => {
    mocks.workspaces[0].modelCatalog = {
      ...discoveredModelCatalog(),
      observedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    await preparePanel();

    expect(mocks.availableWorkspacesQueryOptions).toMatchObject({
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    });
    expect(screen.getByText(/Model catalog หมดอายุแล้ว.*snapshot ใหม่จาก Runner/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Harness" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "ตรวจสอบ Model ล่าสุด" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "ตรวจสอบ Model ล่าสุด" }));
    expect(mocks.refetchWorkspaces).toHaveBeenCalled();
    expect(screen.getByLabelText("Spec 224 prompt")).toHaveValue("A scoped unit test goal");
  });

  it("lets Simple Mode choose a Runner-reported Harness and model while keeping Auto as the default", async () => {
    mocks.workspaces[0].modelCatalog = {
      ...discoveredModelCatalog(),
      models: [
        { id: "dynamic-model-a", displayName: "Dynamic Model A", isDefault: true, reasoningEfforts: ["low", "medium"], defaultReasoningEffort: "medium" },
        { id: "dynamic-model-b", displayName: "Dynamic Model B", isDefault: false, reasoningEfforts: ["high"], defaultReasoningEffort: "high" },
      ],
    };
    mocks.readiness = { ready: true, code: "RUNNER_READY", policyDecision: "pending", ownerAction: null };
    await preparePanel(true);

    const harnessSelector = screen.getByRole("combobox", { name: "Harness" });
    expect(harnessSelector).toHaveTextContent("Auto · Codex");
    fireEvent.click(harnessSelector);
    expect(screen.getByRole("option", { name: "Codex" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Codex" }));

    const modelSelector = screen.getByRole("combobox", { name: "AI Model" });
    expect(modelSelector).toHaveTextContent("Auto · Dynamic Model A");
    fireEvent.click(modelSelector);
    expect(screen.getByRole("option", { name: "Dynamic Model A · Default" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dynamic Model B" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /gpt-|claude|o[0-9]/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Dynamic Model B" }));
    expect(screen.getByRole("radiogroup", { name: "Reasoning Effort" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "สั่งพัฒนา" }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      provider: "codex",
      modelSelection: { policy: "explicit", modelId: "dynamic-model-b", reasoningEffort: "high" },
    })));
  });

  it("offers automatic internal run-budget setup without exposing ledger account selection", async () => {
    mocks.ledgerAccounts = { accounts: [], configured: null };
    mocks.workspace = { ...mocks.workspace, developmentRuns: [{ runId: "private-run-123", state: "BLOCKED_RECOVERABLE", workPackageId: "pkg", workPackageExternalId: "SPEC-internal-123", specSetRevision: 1, revision: 2 }] };
    render(<Spec224WorkspacePanel conversationId={8} simpleMode />);
    fireEvent.click(screen.getByRole("radio", { name: "สร้าง Mini App" }));
    expect(screen.getByRole("region", { name: "SPEC-224 run budget accounting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ตั้งค่าบัญชีระบบอัตโนมัติ" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /บัญชีต้นทาง|บัญชีปลายทาง/ })).not.toBeInTheDocument();
    expect(screen.getByText(/ไม่ใช่กระเป๋าเครดิตผู้ใช้/)).toBeInTheDocument();
    expect(screen.queryByText(/private-run-123|SPEC-internal-123/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่าบัญชีระบบอัตโนมัติ" }));
    await waitFor(() => expect(mocks.configureLedger).toHaveBeenCalledWith({ currency: "USD" }));
    expect(mocks.invalidateLedgerAccounts).toHaveBeenCalled();
  });

  it("shows the missing ledger setup beside an existing run that cannot be resumed", async () => {
    mocks.ledgerAccounts = { accounts: [], configured: null };
    mocks.workspace = { ...mocks.workspace, developmentRuns: [{ runId: "run-ledger-blocked", state: "BLOCKED_RECOVERABLE", workPackageId: "pkg", revision: 2 }] };
    render(<Spec224WorkspacePanel conversationId={8} />);

    expect(screen.getByRole("button", { name: "ตั้งค่าบัญชีระบบอัตโนมัติ" })).toBeInTheDocument();
    expect(screen.getByText(/ทำงานเดิมต่อไม่ได้.*ตั้งค่าบัญชีบันทึกงบภายใน/)).toBeInTheDocument();
    expect(screen.getByText(/ปุ่ม “ทำงานเดิมต่อ” จะกดได้/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ตั้งค่าบัญชีระบบอัตโนมัติ" }));
    await waitFor(() => expect(mocks.configureLedger).toHaveBeenCalledWith({ currency: "USD" }));
  });

  it("keeps the selected development source when switching presentation modes", () => {
    usePlatformSourceWorkspace();
    const { rerender } = render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "Canonical SPEC" }));
    expect(screen.getByLabelText("เลือกไฟล์ spec.md")).toBeInTheDocument();
    rerender(<Spec224WorkspacePanel conversationId={8} simpleMode />);
    expect(screen.getByLabelText("เลือกไฟล์ spec.md")).toBeInTheDocument();
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
    usePlatformSourceWorkspace();
    mocks.ingestFeatureSpec.mockResolvedValue({ revision: 2, sourceSpec: { title: "Example Feature" } });
    render(<Spec224WorkspacePanel conversationId={8} />);

    fireEvent.click(screen.getByRole("radio", { name: "Canonical SPEC" }));
    expect(mocks.bindWorkspace).toHaveBeenCalledWith({ conversationId: 8, runnerId: "runner-test", workspaceId: "platform-source" });
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

  it("restores a Chat-requested SPEC and resumes the matching existing WorkUnit", async () => {
    usePlatformSourceWorkspace();
    mocks.workspace = {
      workspace: { runnerId: "runner-test", workspaceId: "platform-source" },
      availability: { available: true, status: "current" },
      specSet: null,
      developmentRuns: [{
        runId: "run-spec-312",
        conversationId: 8,
        state: "DISCOVERY",
        workPackageId: "pkg-r14-core-p1-first-slice",
        workPackageExternalId: "r14-core-p1-first-slice",
        specSetRevision: 2,
        revision: 1,
        economicsMode: "provider_managed",
      }],
    };
    mocks.featureSpecs = [{ id: "312-smartaihub-modular-saas-rebuild-master-plan", title: "SPEC-312 · Modular SaaS Rebuild", path: "specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/spec.md", summary: "Continue the modular platform." }];
    mocks.featureSpecContext = {
      id: "312-smartaihub-modular-saas-rebuild-master-plan",
      title: "SPEC-312 · Modular SaaS Rebuild",
      path: "specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/spec.md",
      summary: "Continue the modular platform.",
      digest: "c".repeat(64),
      handoff: { status: "CURRENT", nextReadyWorkunit: "r14-core-p1-first-slice", nextAction: "Continue the existing WorkUnit.", resumePoint: "Continue the existing WorkUnit.", openRequirements: [] },
    };
    mocks.resume.mockResolvedValue({ runId: "run-spec-312", jobId: "job-existing", dispatchStatus: "ENQUEUED" });

    render(<Spec224WorkspacePanel conversationId={8} simpleMode resumeSpecId="312" />);

    await waitFor(() => expect(mocks.resume).toHaveBeenCalledWith({ conversationId: 8, runId: "run-spec-312" }));
    expect(screen.getByText(/ส่ง DevelopmentRun เดิมใน Project นี้เข้าคิวแล้ว/)).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("refreshes a stale conversation workspace binding after cancel and before preparing the Provider replacement Run", async () => {
    usePlatformSourceWorkspace();
    const order: string[] = [];
    const platformWorkspace = mocks.workspaces.find(workspace => workspace.scope === "PLATFORM_ENGINEERING")!;
    platformWorkspace.canonicalProjectId = "smarthub-core";
    mocks.workspace = {
      workspace: { runnerId: platformWorkspace.runnerId, workspaceId: platformWorkspace.workspaceId },
      availability: { available: true, status: "current" }, specSet: { revision: 3, files: [], requirementCount: 1 },
      developmentRuns: [{
        runId: "legacy-run-312", jobId: "legacy-job-312", state: "DISCOVERY",
        specId: "312-smartaihub-modular-saas-rebuild-master-plan", specTitle: "SPEC-312",
        workPackageId: "pkg-r14-core-p1-first-slice", workPackageExternalId: "r14-core-p1-first-slice",
        specSetRevision: 3, workPackagePrerequisites: [], economicsMode: "tenant_budget", workerJobStatus: "pending",
        workerJobCanCancelAsUnclaimed: true,
      }],
    };
    mocks.featureSpecs = [{ id: "312-smartaihub-modular-saas-rebuild-master-plan", title: "SPEC-312", path: "specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/spec.md", summary: "Continue SPEC-312." }];
    mocks.featureSpecContext = { ...mocks.featureSpecContext, id: "312-smartaihub-modular-saas-rebuild-master-plan", handoff: { ...mocks.featureSpecContext.handoff, nextReadyWorkunit: "r14-core-p1-first-slice" } };
    mocks.refetchWorkspaces.mockReset().mockImplementation(async () => { order.push("refresh-authorized-workspaces"); return { data: { workspaces: mocks.workspaces } }; });
    mocks.refetchWorkspaceBinding.mockReset().mockImplementation(async () => { order.push("refresh-conversation-binding"); return { data: mocks.workspace }; });
    mocks.cancelUnclaimed.mockReset().mockImplementation(async () => { order.push("cancel"); return { canceled: true, jobId: "legacy-job-312" }; });
    mocks.bindWorkspace.mockReset().mockImplementation(async () => { order.push("bind-latest-snapshot"); return { conversationId: 8 }; });
    mocks.prepare.mockReset();
    mocks.prepare.mockImplementation(async () => {
      order.push("prepare");
      return {
        ...preparation(true), planRevision: 4, runnableWorkPackageIds: ["pkg-r14-core-p1-first-slice"],
        workPackages: [{ id: "pkg-r14-core-p1-first-slice", externalId: "r14-core-p1-first-slice", readiness: "READY", blockers: [], sourceAdmission: { status: "SAFE_CLEAN" } }],
      };
    });
    mocks.start.mockReset().mockImplementation(async () => { order.push("start-provider-run"); return { runId: "replacement-run", jobId: "replacement-job", dispatchStatus: "ENQUEUED" }; });

    render(<Spec224WorkspacePanel conversationId={8} simpleMode />);
    await screen.findByRole("button", { name: /เริ่ม Run ใหม่แบบ Provider quota สำหรับ/ });
    mocks.bindWorkspace.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /เริ่ม Run ใหม่แบบ Provider quota สำหรับ/ }));

    await waitFor(() => expect(order).toEqual(["cancel", "refresh-authorized-workspaces", "bind-latest-snapshot", "refresh-conversation-binding", "prepare", "start-provider-run"]));
    expect(mocks.bindWorkspace).toHaveBeenCalledWith({ conversationId: 8, runnerId: "runner-test", workspaceId: "platform-source" });
  });

  it("binds an existing conversation to the authoritative SmartAIHub source workspace when selected", async () => {
    usePlatformSourceWorkspace();
    render(<Spec224WorkspacePanel conversationId={8} />);

    fireEvent.click(screen.getByRole("button", { name: "ใช้ SmartAIHub Source Workspace" }));

    await waitFor(() => expect(mocks.bindWorkspace).toHaveBeenCalledWith({
      conversationId: 8,
      runnerId: "runner-test",
      workspaceId: "platform-source",
    }));
    expect(screen.getByLabelText("2. เลือก Project Workspace")).toHaveValue('["runner-test","platform-source"]');
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
    fireEvent.change(screen.getByLabelText("1. เลือก Runner"), { target: { value: "runner-test" } });
    expect(screen.getByLabelText("สถานะ Runner ที่เลือก").textContent).toContain("Windows · DEV-PC-01");
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
    fireEvent.click(screen.getByRole("button", { name: "เริ่มพัฒนา" }));

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
    usePlatformSourceWorkspace();
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
    expect(screen.getByLabelText("แนบไฟล์ Spec 224")).toBeInTheDocument();
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

    await waitFor(() => expect(mocks.resume).toHaveBeenCalledWith({ conversationId: 233, runId: "run-existing" }));
    expect(mocks.start).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining("APPROVAL_REQUIRED")));
  });

  it("explains that a terminally failed Run needs a new Goal instead of claiming approval is pending", async () => {
    mocks.workspace = { ...mocks.workspace, developmentRuns: [{ runId: "run-failed", state: "IMPLEMENT",
      workPackageId: "pkg", workPackageExternalId: "SPEC-312", specSetRevision: 2, revision: 3 }] };
    mocks.resume.mockResolvedValueOnce({ runId: "run-failed", dispatchStatus: "BLOCKED",
      goalAdmissionStatus: "RUN_TERMINAL_FAILED", workerJobStatus: "failed", terminal: true,
      authorization: { status: "RUN_TERMINAL_FAILED", ownerAction: "Run เดิมปิดถาวรแล้ว ให้สร้าง Goal ใหม่" } });
    render(<Spec224WorkspacePanel conversationId={235} />);

    fireEvent.click(screen.getByRole("button", { name: "ทำงานเดิมต่อ" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("ให้สร้าง Goal ใหม่")));
    expect(mocks.info).not.toHaveBeenCalledWith(expect.stringContaining("รอ authorization"));
  });

  it("shows recoverable Goal approval errors when the response has no authorization reasons", async () => {
    mocks.workspace = { ...mocks.workspace, developmentRuns: [{ runId: "run-approval-retry", state: "BLOCKED_RECOVERABLE" }] };
    mocks.resume.mockResolvedValueOnce({ runId: "run-approval-retry", dispatchStatus: "BLOCKED",
      goalAdmissionStatus: "GOAL_APPROVAL_REQUEST_RETRY_REQUIRED",
      authorization: { status: "GOAL_APPROVAL_REQUEST_RETRY_REQUIRED", errorCode: "APPROVAL_AUTHORITY_UNAVAILABLE" } });
    render(<Spec224WorkspacePanel conversationId={234} />);

    fireEvent.click(screen.getByRole("button", { name: "ทำงานเดิมต่อ" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("APPROVAL_AUTHORITY_UNAVAILABLE")));
    expect(mocks.error).not.toHaveBeenCalledWith(expect.stringContaining("join"));
  });

  it("preselects the authorized Platform workspace and exposes workspace-level access controls", async () => {
    mocks.role = "user";
    mocks.workspace = { workspace: null, availability: null, specSet: null };
    mocks.workspaces = [{ runnerId: "runner-test", workspaceId: "workspace-test", displayName: "SmartAIHub Platform Engineering", canonicalProjectTitle: "SmartAIHub Platform Engineering", scope: "PLATFORM_ENGINEERING", status: "online", snapshotRevision: "fresh", gitHead: "a".repeat(40), dirty: true, convergenceState: "NOT_REPORTED", convergenceCanonicalSha: null }];
    render(<Spec224WorkspacePanel conversationId={null} simpleMode onCreateConversation={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("1. เลือก Runner")).toHaveValue("runner-test"));
    expect(screen.getByLabelText("2. เลือก Project Workspace")).toHaveValue('["runner-test","workspace-test"]');
    expect(screen.getByRole("heading", { name: "พัฒนาระบบ SmartAIHub" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /อนุญาตทุกไฟล์ ยกเว้นรายการเสี่ยง/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /ขออนุญาตก่อนแก้แต่ละรายการ/ })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/runner-test|workspace-test/)).not.toBeInTheDocument();
  });

  it("creates and binds SPEC plus prompt, then starts exactly once from the primary development action", async () => {
    mocks.role = "user";
    mocks.workspace = { workspace: null, availability: null, specSet: null };
    mocks.workspaces = [{ runnerId: "runner-test", workspaceId: "workspace-test", displayName: "SmartAIHub Platform Engineering", canonicalProjectId: "platform-project", canonicalProjectTitle: "SmartAIHub Platform Engineering", scope: "PLATFORM_ENGINEERING", status: "online", snapshotRevision: "fresh", gitHead: "a".repeat(40), dirty: false, convergenceState: "USER_WORKSPACE_CONVERGED", convergenceCanonicalSha: "a".repeat(40), modelCatalog: discoveredModelCatalog() }];
    mocks.prepare.mockResolvedValueOnce({ ...preparation(true), runnableWorkPackageIds: ["WU-1"], workPackages: [{ id: "WU-1", externalId: "WU-1", readiness: "READY", blockers: [], sourceAdmission: { status: "SAFE_CLEAN" } }] });
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
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 47,
      mode: "spec_set",
      workPackageId: "WU-1",
      idempotencyKey: expect.any(String),
    }));
  });

  it("starts Platform prompt work with the selected workspace-level permission", async () => {
    mocks.role = "user";
    mocks.workspace = { workspace: null, availability: null, specSet: null };
    mocks.workspaces = [{ runnerId: "runner-test", workspaceId: "workspace-test", displayName: "SmartAIHub Platform Engineering", canonicalProjectId: "platform-project", canonicalProjectTitle: "SmartAIHub Platform Engineering", scope: "PLATFORM_ENGINEERING", status: "online", snapshotRevision: "fresh", gitHead: "a".repeat(40), dirty: false, convergenceState: "USER_WORKSPACE_CONVERGED", convergenceCanonicalSha: "a".repeat(40), modelCatalog: discoveredModelCatalog() }];
    mocks.prepare.mockResolvedValueOnce({ ...preparation(true), workPackages: [{ id: "prompt", externalId: "prompt", readiness: "READY", blockers: [], sourceAdmission: { status: "SAFE_CLEAN" } }] });
    const createConversation = vi.fn().mockResolvedValue(48);
    render(<Spec224WorkspacePanel conversationId={null} simpleMode onCreateConversation={createConversation} />);
    fireEvent.change(screen.getByLabelText("Spec 224 prompt"), { target: { value: "Create bounded tests" } });
    expect(screen.getByRole("button", { name: "เริ่มพัฒนา" })).toBeEnabled();
    fireEvent.click(screen.getByRole("radio", { name: /อนุญาตทุกไฟล์ใน Workspace/ }));
    fireEvent.click(screen.getByRole("button", { name: "เริ่มพัฒนา" }));
    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 48, mode: "prompt", workspaceAccessMode: "workspace" })));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 48,
      mode: "prompt",
      prompt: "Create bounded tests",
      workspaceAccessMode: "workspace",
    }));
    expect(mocks.start.mock.calls[0]?.[0]).not.toHaveProperty("budgetCapMinorUnits");
    expect(screen.queryByLabelText("วงเงินสูงสุดสำหรับ DevelopmentRun เป็น USD")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Provider managed development usage" })).toHaveTextContent("ใช้โควต้าของบัญชี Codex/Provider");
    expect(screen.queryByText("บัญชี Ledger สำหรับรับงบ Development Run (USD)")).not.toBeInTheDocument();
  });

  it("blocks a canonical SPEC package that is not the next handoff WorkUnit", async () => {
    usePlatformSourceWorkspace();
    render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "Canonical SPEC" }));
    fireEvent.change(screen.getByLabelText("เลือกไฟล์ spec.md"), { target: { value: "224-example-feature" } });
    fireEvent.click(screen.getByRole("button", { name: "เตรียมแผนและตรวจความพร้อม" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/ไม่มี runnable package ที่ตรงกัน/));
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
