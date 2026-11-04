/** @vitest-environment jsdom */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { detailQuery, outputState } = vi.hoisted(() => ({
  detailQuery: { current: { data: { timeline: [] }, isLoading: false, error: null } as Record<string, unknown> },
  outputState: { current: { events: [], hasMore: false, query: { isLoading: false, error: null } } as Record<string, unknown> },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: { workerJobs: { observabilityDetail: { useQuery: () => detailQuery.current } } },
}));

vi.mock("@/lib/useTaskHarnessOutputEvents", () => ({
  useTaskHarnessOutputEvents: () => outputState.current,
}));

import { GoalExecutionEvidencePanel, goalExecutionNotice } from "../GoalExecutionEvidencePanel";

describe("GoalExecutionEvidencePanel", () => {
  beforeEach(() => {
    detailQuery.current = { data: { timeline: [] }, isLoading: false, error: null };
    outputState.current = { events: [], hasMore: false, query: { isLoading: false, error: null } };
  });

  it("distinguishes an execution source block from waiting for Runner claim", () => {
    expect(goalExecutionNotice({
      jobStatus: "pending",
      approvalStatus: "approved",
      admissionStatus: "source_changed",
      admissionErrorCode: "EXECUTION_SOURCE_CHANGED",
    })).toMatchObject({ status: "warning", title: "หยุดก่อนส่งให้ Runner เพราะ source เปลี่ยน" });

    expect(goalExecutionNotice({ jobStatus: "queued" })).toMatchObject({
      title: "งานอยู่ใน queue แล้ว",
      description: expect.stringContaining("Runner ยังไม่ claim งาน"),
    });
  });

  it("shows why a pending Goal has no Codex output", () => {
    render(<GoalExecutionEvidencePanel
      job={{ id: "job-source-changed", status: "pending" }}
      approvalStatus="approved"
      admissionStatus="source_changed"
      admissionErrorCode="EXECUTION_SOURCE_CHANGED"
      presentationMode="developer"
    />);

    expect(screen.getByText("หยุดก่อนส่งให้ Runner เพราะ source เปลี่ยน")).toBeTruthy();
    expect(screen.getByText("ยังไม่มี Codex output เพราะ source เปลี่ยนก่อน Job เข้า queue")).toBeTruthy();
  });

  it("keeps the Developer output link available in Simple mode without exposing raw events", () => {
    outputState.current = {
      events: [{ id: "event-1", sequence: 1, at: "2026-11-04T15:40:00.000Z", kind: "tool_call", text: "private command" }],
      hasMore: false,
      query: { isLoading: false, error: null },
    };

    render(<GoalExecutionEvidencePanel
      job={{ id: "job-completed", status: "completed" }}
      presentationMode="simple"
    />);

    expect(screen.getByRole("link", { name: "ดูผลจาก Runner และ Timeline" })).toHaveAttribute(
      "href",
      "/agent-monitor?jobId=job-completed&view=developer",
    );
    expect(screen.queryByText("private command")).toBeNull();
  });

  it("renders recorded Codex output and lifecycle events in Developer mode", () => {
    outputState.current = {
      events: [{ id: "event-1", sequence: 1, at: "2026-11-04T15:40:00.000Z", kind: "assistant_message", text: "I inspected the task." }],
      hasMore: false,
      query: { isLoading: false, error: null },
    };
    detailQuery.current = {
      data: { timeline: [{ id: "timeline-1", at: "2026-11-04T15:39:00.000Z", type: "QUEUED", attempt: 1, phase: null, reasonCode: null }] },
      isLoading: false,
      error: null,
    };

    render(<GoalExecutionEvidencePanel
      job={{ id: "job-running", status: "running" }}
      presentationMode="developer"
    />);

    expect(screen.getByText("I inspected the task.")).toBeTruthy();
    expect(screen.getByText(/QUEUED · attempt 1/)).toBeTruthy();
  });
});
