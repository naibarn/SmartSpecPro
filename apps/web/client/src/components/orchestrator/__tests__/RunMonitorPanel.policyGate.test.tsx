/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseRunStream = vi.fn();
let emittedPolicyGateEvent = false;

vi.mock("@/hooks/useRunStream", () => ({
  useRunStream: (options: any) => mockUseRunStream(options),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../../shared/workStatusBridge", () => ({
  getStatusBridgeBadgeClass: () => "bg-slate-100 text-slate-700",
}));

import { RunMonitorPanel } from "../RunMonitorPanel";

describe("RunMonitorPanel policy gate visibility", () => {
beforeEach(() => {
    emittedPolicyGateEvent = false;
    mockUseRunStream.mockImplementation((options: any) => {
      React.useEffect(() => {
        if (emittedPolicyGateEvent) return;
        emittedPolicyGateEvent = true;
        options.onEvent?.({
          eventId: "event-1",
          eventType: "automation_step_blocked",
          tenantId: "tenant-1",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          ts: "2026-04-15T10:30:00.000Z",
          actorType: "system",
          actorId: "system",
          visibility: "milestone",
          data: {
            verificationGate: {
              status: "blocked",
              reason: "Verification evidence is required before the step can succeed (artifact link)",
            },
          },
        });
      }, []);
      return { connected: true };
    });
  });

  it("shows policy gate reasons in the live event timeline", async () => {
    render(
      <RunMonitorPanel
        runId="run-1"
        runStatus="running"
        agents={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/policy gate:/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Verification evidence is required before the step can succeed/i)).toBeInTheDocument();
  });
});
