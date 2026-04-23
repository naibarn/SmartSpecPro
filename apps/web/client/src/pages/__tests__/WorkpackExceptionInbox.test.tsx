/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exceptionInboxMock = vi.fn();
const resolveExceptionMock = vi.fn();
const invalidateMock = vi.fn();

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      workpack: {
        exceptionInbox: { invalidate: invalidateMock },
        list: { invalidate: invalidateMock },
      },
    }),
    workpack: {
      exceptionInbox: { useQuery: (...args: unknown[]) => exceptionInboxMock(...args) },
      resolveException: { useMutation: (...args: unknown[]) => resolveExceptionMock(...args) },
    },
  },
}));

import WorkpackExceptionInbox from "../WorkpackExceptionInbox";

describe("WorkpackExceptionInbox", () => {
  beforeEach(() => {
    exceptionInboxMock.mockReturnValue({
      data: [
        {
          id: "ex_1",
          workpackId: "wp_1",
          reasonCategory: "connector_auth",
          reasonCode: "connector_scope_missing",
          title: "Connector scope missing",
          summary: "CRM scope is missing",
          riskClass: "high",
          nextAction: "Refresh connector auth",
          remediationPointer: "/workpacks/wp_1/connectors",
          allowedActions: ["retry", "remap_connector"],
        },
        {
          id: "ex_2",
          workpackId: "wp_2",
          reasonCategory: "connector_auth",
          reasonCode: "connector_scope_missing",
          title: "Connector scope missing",
          summary: "CRM scope is still missing",
          riskClass: "high",
          nextAction: "Refresh connector auth",
          remediationPointer: "/workpacks/wp_2/connectors",
          allowedActions: ["retry", "remap_connector"],
        },
      ],
      isLoading: false,
    });
    resolveExceptionMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("groups exceptions by reason code and exposes next actions", () => {
    render(<WorkpackExceptionInbox />);

    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText("Open Exceptions")).toBeInTheDocument();
    expect(screen.getAllByText(/connector scope missing/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/refresh connector auth/i).length).toBe(2);
  });
});
