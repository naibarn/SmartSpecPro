/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getFeatureFlagsMock = vi.fn();
const getWorkpackRolloutStateMock = vi.fn();
const useUtilsMock = vi.fn(() => ({
  tenantFeatureFlags: {
    getFeatureFlags: {
      cancel: vi.fn(),
      getData: vi.fn(),
      setData: vi.fn(),
      invalidate: vi.fn(),
    },
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => useUtilsMock(),
    tenantFeatureFlags: {
      getFeatureFlags: { useQuery: (...args: unknown[]) => getFeatureFlagsMock(...args) },
      getWorkpackRolloutState: { useQuery: (...args: unknown[]) => getWorkpackRolloutStateMock(...args) },
      updateFeatureFlags: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }) },
    },
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/ops", vi.fn()] as const,
}));

import { OpsEarlyWarningPanel } from "../OpsEarlyWarningPanel";
import { TenantFeatureFlagsPanel } from "../TenantFeatureFlagsPanel";

describe("workpack rollout admin panels", () => {
  beforeEach(() => {
    getFeatureFlagsMock.mockReturnValue({
      data: {
        workpacksEnabled: true,
        workpackAutonomousPilot: false,
        workpackOpsConsole: true,
      },
      isLoading: false,
    });
    getWorkpackRolloutStateMock.mockReturnValue({
      data: {
        tenantId: "tenant-1",
        workpacksEnabled: true,
        workpackAutonomousPilot: false,
        workpackOpsConsole: true,
        rolloutPhase: "supervised",
      },
      isLoading: false,
    });
  });

  it("renders workpack rollout posture inside the tenant flags panel", () => {
    render(<TenantFeatureFlagsPanel tenantId="tenant-1" canEdit={false} />);

    expect(screen.getByText(/workpacks: supervised/i)).toBeInTheDocument();
    expect(screen.getByText(/tenant rollout posture/i)).toBeInTheDocument();
  });

  it("shows workpack blockers in the ops early warning panel", () => {
    render(
      <OpsEarlyWarningPanel
        overview={{
          health: "warning",
          anomalies: [],
          summary: {
            totalAnomalies: 1,
            criticalCount: 0,
            warningCount: 1,
            resourceCount: 0,
            serviceCount: 0,
            monitoringCount: 0,
            auditCount: 0,
            orchestrationCount: 0,
          },
          leadingSignals: {
            memoryPercent: null,
            cpuPercent: null,
            diskPercent: null,
            maxRestartDelta: null,
            llmErrorRate: null,
            mediaErrorRate: null,
            llmP95LatencyMs: null,
            mediaP95LatencyMs: null,
            fallbackRate: null,
            qualityRiskRate: null,
          },
          windows: {
            metricsHours: 24,
            auditHours: 24,
            orchestrationHours: 24,
          },
          updatedAt: new Date().toISOString(),
        }}
        workpackRollout={{
          blockedCount: 2,
          readyCount: 5,
          stagedCount: 1,
          reviewCount: 3,
          topReasonCodes: ["connector_blocked"],
        }}
      />,
    );

    expect(screen.getByText("Workpacks Blocked")).toBeInTheDocument();
    expect(screen.getByText(/workpack blocker: connector_blocked/i)).toBeInTheDocument();
  });
});
