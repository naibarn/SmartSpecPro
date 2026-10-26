import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { Spec224WorkspacePanel } from "./Spec224WorkspacePanel";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), start: vi.fn(), info: vi.fn(), readiness: undefined as any, role: "admin", workspace: { workspace: { runnerId: "runner-test", workspaceId: "workspace-test" }, availability: { available: true, status: "current" }, specSet: null }, featureSpecs: [{ id: "224-example-feature", title: "Example Feature", path: "specs/feature/224-example-feature/spec.md", summary: "Example implementation spec." }], ingestFeatureSpec: vi.fn(), ingestSpecSet: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: (...args: unknown[]) => mocks.info(...args) } }));
vi.mock("@/lib/trpc", () => ({ trpc: { spec226DevelopmentControl: {
  availableWorkspaces: { useQuery: () => ({ data: { workspaces: [{ runnerId: "runner-test", workspaceId: "workspace-test", displayName: "Test", status: "online", snapshotRevision: "1" }] } }) },
  getConversationWorkspace: { useQuery: () => ({ data: mocks.workspace, refetch: vi.fn() }) },
  listFeatureSpecs: { useQuery: () => ({ data: { specs: mocks.featureSpecs }, isLoading: false, error: null }) },
  ingestFeatureSpec: { useMutation: () => ({ mutateAsync: mocks.ingestFeatureSpec, isPending: false }) },
  workspaceRunnerReadiness: { useQuery: () => ({ data: mocks.readiness }) },
  bindConversationWorkspace: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  ingestSpecSet: { useMutation: () => ({ mutateAsync: mocks.ingestSpecSet }) },
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
  mocks.workspace = { workspace: { runnerId: "runner-test", workspaceId: "workspace-test" }, availability: { available: true, status: "current" }, specSet: null };
  mocks.role = "admin";
  mocks.featureSpecs = [{ id: "224-example-feature", title: "Example Feature", path: "specs/feature/224-example-feature/spec.md", summary: "Example implementation spec." }];
  mocks.prepare.mockResolvedValue(preparation(true));
  mocks.ingestSpecSet.mockResolvedValue({ revision: 2, files: [], requirementCount: 1 });
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

  it("lets an Admin select a repository Feature Spec and imports it into the current Spec Set", async () => {
    mocks.ingestFeatureSpec.mockResolvedValue({ revision: 2, sourceSpec: { title: "Example Feature" } });
    render(<Spec224WorkspacePanel conversationId={8} />);

    fireEvent.click(screen.getByRole("radio", { name: "พัฒนาตาม Spec file" }));
    expect(screen.getByRole("radio", { name: "เลือก Feature Spec จากระบบ (specs/feature)" })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("radio", { name: "พัฒนาตาม Spec file" }));

    expect(screen.queryByRole("radio", { name: "เลือก Feature Spec จากระบบ (specs/feature)" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("แนบไฟล์ Spec 224")).toBeInTheDocument();
  });

  it("explains that selecting a workspace binds this conversation to that Runner", async () => {
    render(<Spec224WorkspacePanel conversationId={8} />);

    expect(screen.getByLabelText("1. เลือก Runner และ project workspace")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Runner runner-test · Test · workspace-test/ })).toBeInTheDocument();
    expect(screen.getByText(/conversation นี้จะใช้ Runner\/workspace เดียวกัน/i)).toBeInTheDocument();
  });

  it("shows a clear multi-image mock-up attachment control while developing from a Spec Set", async () => {
    render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "พัฒนาตาม Spec file" }));

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
    fireEvent.click(screen.getByRole("radio", { name: "พัฒนาตาม Spec file" }));
    fireEvent.click(screen.getByRole("radio", { name: "อัปโหลด Spec files" }));

    expect(screen.getByRole("button", { name: "เลือกไฟล์ Spec / JSON" })).toBeInTheDocument();
    expect(screen.getByText(/\.md, \.json หรือ \.zip/)).toBeInTheDocument();
  });

  it("keeps selected files queued and visible when the conversation has no bound workspace", async () => {
    mocks.workspace = { workspace: null, availability: null, specSet: null };
    render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "พัฒนาตาม Spec file" }));
    fireEvent.click(screen.getByRole("radio", { name: "อัปโหลด Spec files" }));
    fireEvent.change(screen.getByLabelText("แนบไฟล์ Spec 224"), { target: { files: [new File(["# Feature"], "feature.md", { type: "text/markdown" })] } });

    expect(await screen.findByText("feature.md")).toBeInTheDocument();
    expect(screen.getByText(/เลือก Runner workspace.*ก่อน/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "บันทึกไฟล์ Spec เข้า workspace" })).toBeDisabled();
    expect(mocks.ingestSpecSet).not.toHaveBeenCalled();
  });

  it("saves multiple selected Markdown and JSON files into the bound Spec Set on explicit action", async () => {
    render(<Spec224WorkspacePanel conversationId={8} />);
    fireEvent.click(screen.getByRole("radio", { name: "พัฒนาตาม Spec file" }));
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
    const specMode = screen.getByRole("radio", { name: "พัฒนาตาม Spec file" });
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
});
