// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudflareLiveMissionStatus } from "./CloudflareLiveMissionStatus";
const state = vi.hoisted(() => ({ job: null as any, error: false, refetch: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "th" } }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { infrastructure: {
  getCloudflareHttpCandidatePreparation: { useQuery: () => ({ data: { job: { jobId: "candidate", status: "succeeded" } }, isError: false }) },
  getCloudflareHttpRuntimeOperation: { useQuery: () => ({ data: { job: state.job }, isError: state.error, dataUpdatedAt: Date.now(), refetch: state.refetch }) },
} } }));
beforeEach(() => { state.error = false; state.refetch.mockReset(); state.job = { jobId: "job-123", status: "running", attempt: 1, maxAttempts: 1,
  heartbeatAt: new Date(), startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000), progressStage: "NATIVE_RUNTIME_TESTING", checkpoint: { stage: "DEPLOYED", probes: [{ status: 200 }] } }; });
describe("live mission panel", () => {
  it("shows authoritative active job and does not offer another submission", () => {
    render(<CloudflareLiveMissionStatus tenantId="tenant" projectId="project" />);
    expect(screen.getByText(/job-123/)).toHaveTextContent("กำลังทำงาน");
    expect(screen.getByText(/DEPLOYED/)).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่ต้องดำเนินการ/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /อนุมัติ/ })).not.toBeInTheDocument();
  });
  it("marks failed polling as stale and provides read-only retry", async () => {
    state.error = true;
    render(<CloudflareLiveMissionStatus tenantId="tenant" projectId="project" />);
    expect(screen.getByRole("alert")).toHaveTextContent("ข้อมูลที่แสดงอาจเก่า");
    await userEvent.click(screen.getByRole("button", { name: "ตรวจสถานะแบบอ่านอย่างเดียวอีกครั้ง" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("shows successful application evidence while preserving remaining gates", () => {
    state.job = { ...state.job, status: "succeeded", finishedAt: new Date(), receipt: { authenticatedApplicationAcceptance: true }, checkpoint: { stage: "TESTED_AND_COMPENSATED", cleanup: { candidateRestored: true } } };
    render(<CloudflareLiveMissionStatus tenantId="tenant" projectId="project" />);
    expect(screen.getByText(/M3 ยังไม่ผ่าน/)).toBeInTheDocument();
    expect(screen.getByText(/คืน Candidate แล้ว/)).toBeInTheDocument();
  });
});
