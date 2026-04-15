/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useRouteMock = vi.fn();
const detailMock = vi.fn();
const connectorsMock = vi.fn();
const discoverMock = vi.fn();
const refreshMock = vi.fn();
const validateMock = vi.fn();
const updateMapMock = vi.fn();
const invalidateMock = vi.fn();

vi.mock("wouter", () => ({
  useRoute: (...args: unknown[]) => useRouteMock(...args),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      workpack: {
        connectors: { invalidate: invalidateMock },
        getDetail: { invalidate: invalidateMock },
      },
    }),
    workpack: {
      getDetail: { useQuery: (...args: unknown[]) => detailMock(...args) },
      connectors: { useQuery: (...args: unknown[]) => connectorsMock(...args) },
      discoverConnectors: { useMutation: (...args: unknown[]) => discoverMock(...args) },
      refreshConnectorIntrospections: { useMutation: (...args: unknown[]) => refreshMock(...args) },
      validateConnectors: { useMutation: (...args: unknown[]) => validateMock(...args) },
      updateConnectorMap: { useMutation: (...args: unknown[]) => updateMapMock(...args) },
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
            fieldMappings: [{ sourceField: "record_id", targetField: "record_id", required: true, sideEffectClass: "read_only" }],
            samplePayload: {},
            missingFields: [],
            driftedFields: [],
          },
        ],
        introspections: [],
      },
      isLoading: false,
    });
    discoverMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    refreshMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    validateMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    updateMapMock.mockReturnValue({ mutate: vi.fn(), isPending: false, variables: null });
  });

  it("renders connector matrix and boundary blockers", () => {
    render(<WorkpackConnectorStudio />);

    expect(screen.getByText("Connector Matrix")).toBeInTheDocument();
    expect(screen.getByText("crm")).toBeInTheDocument();
    expect(screen.getByText(/missing/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /auto-discover/i })).toBeInTheDocument();
  });
});
