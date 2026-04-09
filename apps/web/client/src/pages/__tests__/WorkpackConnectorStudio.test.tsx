/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useRouteMock = vi.fn();
const detailMock = vi.fn();
const connectorsMock = vi.fn();

vi.mock("wouter", () => ({
  useRoute: (...args: unknown[]) => useRouteMock(...args),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workpack: {
      getDetail: { useQuery: (...args: unknown[]) => detailMock(...args) },
      connectors: { useQuery: (...args: unknown[]) => connectorsMock(...args) },
    },
  },
}));

import WorkpackConnectorStudio from "../WorkpackConnectorStudio";

describe("WorkpackConnectorStudio", () => {
  beforeEach(() => {
    useRouteMock.mockReturnValue([true, { workpackId: "wp_1" }]);
    detailMock.mockReturnValue({
      data: {
        workpack: { id: "wp_1", title: "Connector Review", lifecycleState: "needs_review", autonomyMode: "draft", promotionState: "blocked" },
        readiness: { gateResult: "blocked", nextAction: "Fix connector scopes" },
      },
      isLoading: false,
    });
    connectorsMock.mockReturnValue({
      data: {
        connectorMaps: [
          {
            id: "conn_1",
            connectorFamily: "crm",
            validationStatus: "blocked",
            scopePosture: "missing",
            requiredScopes: ["crm:read", "crm:write"],
            grantedScopes: ["crm:read"],
            missingFields: [],
            driftedFields: [],
          },
        ],
      },
      isLoading: false,
    });
  });

  it("renders connector matrix and boundary blockers", () => {
    render(<WorkpackConnectorStudio />);

    expect(screen.getByText("Connector Matrix")).toBeInTheDocument();
    expect(screen.getByText("crm")).toBeInTheDocument();
    expect(screen.getByText(/missing/i)).toBeInTheDocument();
  });
});
