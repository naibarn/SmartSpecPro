/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exceptionInboxMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workpack: {
      exceptionInbox: { useQuery: (...args: unknown[]) => exceptionInboxMock(...args) },
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
          reasonCode: "connector_scope_missing",
          title: "Connector scope missing",
          summary: "CRM scope is missing",
          riskClass: "high",
          nextAction: "Refresh connector auth",
        },
        {
          id: "ex_2",
          reasonCode: "connector_scope_missing",
          title: "Connector scope missing",
          summary: "CRM scope is still missing",
          riskClass: "high",
          nextAction: "Refresh connector auth",
        },
      ],
      isLoading: false,
    });
  });

  it("groups exceptions by reason code and exposes next actions", () => {
    render(<WorkpackExceptionInbox />);

    expect(screen.getByText("Open Exceptions")).toBeInTheDocument();
    expect(screen.getByText(/high • 2x/i)).toBeInTheDocument();
    expect(screen.getByText(/refresh connector auth/i)).toBeInTheDocument();
  });
});
