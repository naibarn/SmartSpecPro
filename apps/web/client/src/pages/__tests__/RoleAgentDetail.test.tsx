/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useRouteMock = vi.fn();
const detailMock = vi.fn();
const timelineMock = vi.fn();
const telemetryMock = vi.fn();
const rosterMock = vi.fn();
const getRoleMessagesMock = vi.fn();
const sendRoleMessageMock = vi.fn();
const invalidateMock = vi.fn();

vi.mock("wouter", () => ({
  useRoute: (...args: unknown[]) => useRouteMock(...args),
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      teamRoom: { getRoleMessages: { invalidate: invalidateMock } },
      roleMonitor: { detail: { invalidate: invalidateMock } },
    }),
    roleMonitor: {
      detail: { useQuery: (...args: unknown[]) => detailMock(...args) },
      timeline: { useQuery: (...args: unknown[]) => timelineMock(...args) },
      telemetry: { useQuery: (...args: unknown[]) => telemetryMock(...args) },
      roster: { useQuery: (...args: unknown[]) => rosterMock(...args) },
    },
    teamRoom: {
      getRoleMessages: { useQuery: (...args: unknown[]) => getRoleMessagesMock(...args) },
      sendRoleMessage: { useMutation: (...args: unknown[]) => sendRoleMessageMock(...args) },
    },
  },
}));

import RoleAgentDetail from "../RoleAgentDetail";

describe("RoleAgentDetail", () => {
  beforeEach(() => {
    useRouteMock.mockReturnValue([true, { roleId: "role_1" }]);
    detailMock.mockReturnValue({
      data: {
        role: {
          id: "role_1",
          name: "Virtual HR",
          lifecycleState: "active",
          currentAutonomyTier: "guided",
        },
        activeContract: {
          id: "rc_1",
          missionStatement: "Keep HR operations moving safely.",
        },
        contracts: [{ id: "rc_1" }],
        checkpointHealth: { ageMinutes: 5 },
        gate: { gateResult: "ready" },
        workpackDependencies: [
          {
            workpackId: "wp_hr",
            readiness: {
              gateResult: "ready",
              nextAction: "Ready for execution.",
            },
          },
        ],
        roleExceptions: [
          {
            id: "reb_1",
            workpackExceptionId: "exc_1",
            triageOwnerRoleId: "role_1",
            nextAction: "review",
            source: "routine_execution",
          },
        ],
        handoffs: [
          {
            id: "handoff_1",
            purpose: "Take over employee onboarding",
            status: "pending",
            recipientRoleId: "role_2",
          },
        ],
        improvementProposals: [
          {
            id: "proposal_1",
            targetType: "connector_map",
            riskClass: "medium",
            expectedBenefit: "Reduce onboarding retries",
          },
        ],
        promotionGates: [
          {
            id: "gate_1",
            recommendedDecision: "unchanged",
            reasonCodes: ["steady_state"],
          },
        ],
        messages: [
          {
            id: "message_1",
            intentType: "handoff",
            contentSummary: "Please review onboarding packet.",
            priority: "high",
            dueState: "pending",
            actionabilityState: "pending",
            visibilityClass: "delegated_minimum",
            relatedRoutineId: "routine_1",
            relatedWorkpackFamily: "wp_hr",
            createdAt: "2026-04-10T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
    });
    timelineMock.mockReturnValue({
      data: [
        {
          id: "rrun_1",
          routineId: "routine_1",
          status: "running",
          triggerSource: "schedule",
          selectedWorkpackFamily: "wp_hr",
          resolvedWorkpackVersionId: "wpv_1",
          recoveryState: "fresh",
        },
      ],
      isLoading: false,
    });
    telemetryMock.mockReturnValue({
      data: {
        qualityScore: 0.95,
        replayPassRate: 0.92,
      },
      isLoading: false,
    });
    rosterMock.mockReturnValue({
      data: [
        { roleId: "role_1", name: "Virtual HR" },
        { roleId: "role_2", name: "Virtual Recruiter" },
      ],
      isLoading: false,
    });
    getRoleMessagesMock.mockReturnValue({
      data: [
        {
          id: "message_1",
          intentType: "handoff",
          contentSummary: "Please review onboarding packet.",
          priority: "high",
          dueState: "pending",
          actionabilityState: "pending",
          visibilityClass: "delegated_minimum",
          relatedRoutineId: "routine_1",
          relatedWorkpackFamily: "wp_hr",
          createdAt: "2026-04-10T00:00:00.000Z",
        },
      ],
      isLoading: false,
    });
    sendRoleMessageMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders role detail, routine cycles, workpack links, exceptions, and comms", () => {
    render(<RoleAgentDetail />);

    expect(screen.getByText("Virtual HR")).toBeInTheDocument();
    expect(screen.getByText("Routine Cycles")).toBeInTheDocument();
    expect(screen.getByText(/Keep HR operations moving safely/i)).toBeInTheDocument();
    expect(screen.getByText("Internal Comms Stream")).toBeInTheDocument();
    expect(screen.getByText(/Please review onboarding packet/i)).toBeInTheDocument();
    expect(screen.getByText("Exceptions and Handoffs")).toBeInTheDocument();
    expect(screen.getByText(/Take over employee onboarding/i)).toBeInTheDocument();
    expect(screen.getByText("Improvement and Promotion")).toBeInTheDocument();
    expect(screen.getAllByText(/Replay/i).length).toBeGreaterThan(0);
  });
});
