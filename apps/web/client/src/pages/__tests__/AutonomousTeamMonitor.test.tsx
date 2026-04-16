/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rosterMock = vi.fn();
const autonomySummaryMock = vi.fn();
const detailMock = vi.fn();
const stopDepartmentSliceMock = vi.fn();
const invalidateMock = vi.fn();

vi.mock("wouter", () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      roleMonitor: { roster: { invalidate: invalidateMock }, detail: { invalidate: invalidateMock } },
      monitoring: { getRoleAutonomySummary: { invalidate: invalidateMock } },
    }),
    roleMonitor: {
      roster: { useQuery: (...args: unknown[]) => rosterMock(...args) },
      detail: { useQuery: (...args: unknown[]) => detailMock(...args) },
      stopDepartmentSlice: { useMutation: (...args: unknown[]) => stopDepartmentSliceMock(...args) },
    },
    monitoring: {
      getRoleAutonomySummary: { useQuery: (...args: unknown[]) => autonomySummaryMock(...args) },
    },
  },
}));

import AutonomousTeamMonitor from "../AutonomousTeamMonitor";

describe("AutonomousTeamMonitor", () => {
  beforeEach(() => {
    rosterMock.mockReturnValue({
      data: [
        {
          roleId: "role_1",
          name: "Virtual CEO",
          departmentLabel: "Executive",
          lifecycleState: "active",
          healthState: "healthy",
          autonomyTier: "supervised",
          backlogDepth: 2,
          backlogAgeMinutes: 15,
          checkpointFreshnessMinutes: 12,
          checkpointFreshnessTier: "fresh",
          exceptionCount: 1,
          kpiTrend: 0.9,
          blockerCodes: [],
          gateResult: "ready",
          rolloutPhase: "supervised",
        },
      ],
      isLoading: false,
    });
    autonomySummaryMock.mockReturnValue({
      data: {
        telemetry: [
          {
            roleId: "role_1",
            tenantId: "tenant-1",
            departmentLabel: "Executive",
            routineId: "routine_1",
            throughput: 4,
            interventionRate: 0.1,
            exceptionRate: 0.05,
            backlogDepth: 2,
            backlogAgeMinutes: 15,
            slaHitRate: 0.95,
            qualityScore: 0.95,
            replayPassRate: 0.9,
            improvementVelocity: 1,
            autonomyTier: "supervised",
            promotionDecision: "unchanged",
            rolloutPhase: "supervised",
            gateResult: "ready",
            checkpointFreshnessMinutes: 12,
            recoveryChurn: 0,
            budgetBurn: 10,
            riskTier: "low",
            connectorFamilies: ["crm"],
            runtimeFamilies: ["workflow"],
            blockerCodes: [],
            updatedAt: "2026-04-10T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
    });
    detailMock.mockReturnValue({
      data: {
        role: {
          id: "role_1",
          name: "Virtual CEO",
          lifecycleState: "active",
          currentAutonomyTier: "supervised",
        },
        activeContract: {
          missionStatement: "Drive strategic execution",
        },
        currentRoutineRun: {
          id: "rrun_1",
          routineId: "routine_1",
          status: "running",
          currentObjectiveSummary: "Review KPI board",
          selectedWorkpackFamily: "wp_exec",
        },
        checkpointHealth: {
          freshnessTier: "fresh",
          ageMinutes: 12,
        },
        metric: {
          backlogDepth: 2,
          slaHitRate: 0.95,
        },
        gate: {
          gateResult: "ready",
          blockers: [],
        },
        workpackDependencies: [
          {
            workpackId: "wp_exec",
            readiness: {
              gateResult: "ready",
              nextAction: "Ready for supervised execution.",
            },
          },
        ],
        roleExceptions: [],
        improvementProposals: [
          {
            id: "proposal_1",
            targetType: "operator_guidance",
            expectedBenefit: "Reduce operator churn",
          },
        ],
        messages: [
          {
            id: "message_1",
            intentType: "status_summary",
            contentSummary: "Shift summary ready.",
            priority: "normal",
            dueState: "none",
            actionabilityState: "informational",
            visibilityClass: "redacted_summary",
            relatedRoutineId: "routine_1",
            relatedWorkpackFamily: "wp_exec",
            createdAt: "2026-04-10T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
    });
    stopDepartmentSliceMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders the roster, current activity, health rail, and internal comms surfaces", () => {
    render(<AutonomousTeamMonitor />);

    expect(screen.getByText("Persistent role operations center")).toBeInTheDocument();
    expect(screen.getByText("Role Roster")).toBeInTheDocument();
    expect(screen.getAllByText("Virtual CEO")).toHaveLength(2);
    expect(screen.getByText("Current Activity")).toBeInTheDocument();
    expect(screen.getByText(/Drive strategic execution/i)).toBeInTheDocument();
    expect(screen.getByText("Health Rail")).toBeInTheDocument();
    expect(screen.getByText("Internal Comms")).toBeInTheDocument();
    expect(screen.getByText(/Shift summary ready/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Replay" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Intake" }).some(
        (link) => link.getAttribute("href") === "/workpacks/intake?entrypoint=teams"
      )
    ).toBe(true);
    expect(
      screen.getAllByRole("link", { name: "Discovery" }).some(
        (link) => link.getAttribute("href") === "/workpacks/discovery?entrypoint=teams"
      )
    ).toBe(true);
    expect(
      screen.getAllByRole("link", { name: "ROI" }).some(
        (link) => link.getAttribute("href") === "/workpacks/roi?entrypoint=teams"
      )
    ).toBe(true);
    expect(
      screen.getAllByRole("link", { name: "Exceptions" }).some(
        (link) => link.getAttribute("href") === "/workpacks/exceptions?entrypoint=teams"
      )
    ).toBe(true);
  });
});
