import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import AdminAuditLogs from "./AdminAuditLogs";

const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/audit-logs", setLocationMock],
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, role: "admin" },
    loading: false,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    audit: {
      search: {
        useQuery: vi.fn(() => ({
          data: {
            usageLogs: [],
            auditEvents: [
              {
                id: 1,
                eventType: "rollout_gate",
                createdAt: "2026-03-14T10:00:00.000Z",
                responsePayload: {
                  eventType: "mode_selected",
                  selectedMode: "long_form_block",
                  componentRecipeId: "timeline-report",
                },
              },
              {
                id: 2,
                eventType: "rollout_gate",
                createdAt: "2026-03-14T10:01:00.000Z",
                responsePayload: {
                  eventType: "quality_gate_result",
                  verdict: "warn",
                },
              },
              {
                id: 3,
                eventType: "rollout_gate",
                createdAt: "2026-03-14T10:02:00.000Z",
                responsePayload: {
                  eventType: "fallback_triggered",
                  fallbackHistory: [
                    { step: "switch_recipe" },
                  ],
                },
              },
            ],
          },
          isLoading: false,
          refetch: vi.fn(),
        })),
      },
      getPayload: {
        useQuery: vi.fn(() => ({
          data: { entries: [] },
          isLoading: false,
        })),
      },
    },
    presentation: {
      listCustomBlockGovernanceAudit: {
        useQuery: vi.fn(() => ({
          data: [{
            blockId: "901",
            blockLabel: "Team Promo Block",
            ownerUserId: 1,
            visibility: "team",
            eventType: "featured_changed",
            actorUserId: 3,
            actorRole: "admin",
            recordedAt: "2026-03-13T00:00:00.000Z",
            detail: "Block featured for team",
          }],
          isLoading: false,
        })),
      },
    },
  },
}));

describe("AdminAuditLogs", () => {
  it("renders presentation governance audit entries in the admin surface", () => {
    render(<AdminAuditLogs />);

    expect(screen.getByText("Routing Telemetry Summary")).toBeInTheDocument();
    expect(screen.getByText("long_form_block × 1")).toBeInTheDocument();
    expect(screen.getAllByText("timeline-report × 1")).toHaveLength(2);
    expect(screen.getByText("warn × 1")).toBeInTheDocument();
    expect(screen.getByText("switch_recipe × 1")).toBeInTheDocument();
    expect(screen.getByText("Fallback Rate")).toBeInTheDocument();
    expect(screen.getAllByText("100%")).toHaveLength(2);
    expect(screen.getByText("Top Recipe")).toBeInTheDocument();
    expect(screen.getByText("Presentation Governance Audit")).toBeInTheDocument();
    expect(screen.getByText("Team Promo Block")).toBeInTheDocument();
    expect(screen.getByText("featured_changed")).toBeInTheDocument();
    expect(screen.getByText("Block featured for team")).toBeInTheDocument();
  });
});
