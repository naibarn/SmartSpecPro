/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockNavigate = vi.fn();
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);
const invalidateMyRequests = vi.fn();
let mockLanguage: "en" | "th" = "en";

vi.mock("wouter", () => ({
  useLocation: () => ["/work/requests", mockNavigate],
  Link: ({
    href,
    onClick,
    children,
  }: {
    href: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    children: React.ReactNode;
  }) => (
    <a
      href={href}
      onClick={event => {
        event.preventDefault();
        onClick?.(event);
        mockNavigate(href);
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 42, role: "admin" },
  }),
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: ({ className }: { className?: string }) => (
    <div data-testid="locale-toggle" className={className} />
  ),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (_key: string, defaultValue?: string | Record<string, unknown>) =>
      typeof defaultValue === "string" ? defaultValue : _key,
    locale: mockLanguage,
    i18n: {
      exists: () => true,
      resolvedLanguage: mockLanguage,
      language: mockLanguage,
      changeLanguage: vi.fn(),
    },
    setLocale: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      workOs: {
        listMyRequests: {
          invalidate: invalidateMyRequests,
        },
      },
    }),
    workOs: {
      listMyRequests: {
        useQuery: () => ({
          data: [
            {
              id: "req-1",
              title: "Review refund request",
              objective: "Check refund eligibility and prepare a response.",
              sourceType: "chat",
              currentState: "waiting_for_approval",
              businessDomain: "finance",
              urgency: "high",
              riskLevel: "medium",
              defaultOwnerType: "human",
              defaultOwnerId: "42",
              linkedCaseId: "case-1",
              executionTrail: {
                teamId: "team-1",
                roomId: "room-1",
                teamRunId: "team-run-1",
                teamRunStatus: "running",
                teamRunMode: "auto_team",
                workItemId: "task-1",
                workItemStatus: "in_progress",
              },
              createdAt: "2026-04-11T10:00:00.000Z",
            },
            {
              id: "req-2",
              title: "Prepare weekly report",
              sourceType: "manual",
              currentState: "completed",
              businessDomain: "operations",
              urgency: "normal",
              riskLevel: "low",
              defaultQueueId: "team-1",
              linkedCaseId: "case-2",
              createdAt: "2026-04-10T10:00:00.000Z",
            },
          ],
          isLoading: false,
        }),
      },
    },
  },
}));

import MyRequestsPage from "../MyRequests";

describe("MyRequestsPage", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockClipboardWriteText.mockClear();
    mockLanguage = "en";
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: mockClipboardWriteText,
      },
      configurable: true,
    });
  });

  it("shows a summary of the user's requests and routes to work creation", () => {
    render(<MyRequestsPage />);

    expect(
      screen.getByRole("button", { name: /dashboard/i })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { name: "My Requests" })[0]
    ).toBeInTheDocument();
    expect(screen.getByTestId("locale-toggle")).toBeInTheDocument();
    expect(screen.getByText("Total requests")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.getByText("Review refund request")).toBeInTheDocument();
    expect(screen.getByText("Prepare weekly report")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /start work/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/work/request");
  });

  it("returns to chat from the page header", () => {
    render(<MyRequestsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /open chat/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/chat");
  });

  it("opens the Work OS guide from the page header", () => {
    render(<MyRequestsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /open guide/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/help/work-os");
  });

  it("opens the work request page from a request row", () => {
    render(<MyRequestsPage />);

    fireEvent.click(screen.getAllByRole("link", { name: /edit request/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/work/request?requestId=req-1");
  });

  it("shows the execution trail for handed-off work", () => {
    render(<MyRequestsPage />);

    expect(screen.getByText("Execution trail")).toBeInTheDocument();
    expect(screen.getByText("team-1")).toBeInTheDocument();
    expect(screen.getByText("room-1")).toBeInTheDocument();
    expect(screen.getByText("team-run-1")).toBeInTheDocument();
    expect(screen.getByText("Auto team")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open room/i }));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/teams/team-1?roomId=room-1&panel=workflow"
    );
  });

  it("opens the request preflight review from a request row", () => {
    render(<MyRequestsPage />);

    fireEvent.click(
      screen.getAllByRole("link", {
        name: /review and approve automation/i,
      })[0]
    );

    expect(mockNavigate).toHaveBeenCalledWith("/work/request?requestId=req-1");
  });

  it("opens the linked work case in Work OS with a bookmarkable source filter", () => {
    render(<MyRequestsPage />);

    fireEvent.click(
      screen.getAllByRole("link", { name: /open linked work os console/i })[0]
    );

    expect(mockNavigate).toHaveBeenCalledWith(
      "/admin/work-os?caseId=case-1&timelineSource=work_os"
    );
  });

  it("opens source-specific Work OS shortcuts from a request row", () => {
    render(<MyRequestsPage />);

    fireEvent.click(
      screen.getAllByRole("button", { name: /role routine/i })[0]
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      "/admin/work-os?caseId=case-1&timelineSource=role_routine"
    );

    fireEvent.click(screen.getAllByRole("button", { name: /team run/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith(
      "/admin/work-os?caseId=case-1&timelineSource=team_run"
    );

    fireEvent.click(screen.getAllByRole("button", { name: /workpack/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith(
      "/admin/work-os?caseId=case-1&timelineSource=workpack_record"
    );
  });

  it("copies a bookmarkable Work OS link from a request row", () => {
    render(<MyRequestsPage />);

    fireEvent.click(
      screen.getAllByRole("button", { name: /copy permalink/i })[1]
    );

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-1&timelineSource=work_os`
    );
  });

  it("copies source-specific Work OS links from a request row", () => {
    render(<MyRequestsPage />);

    fireEvent.click(
      screen.getAllByRole("button", { name: /copy role evidence/i })[0]
    );
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-1&timelineSource=role_routine`
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /copy team evidence/i })[0]
    );
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-1&timelineSource=team_run`
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /copy workpack evidence/i })[0]
    );
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-1&timelineSource=workpack_record`
    );
  });

  it("copies the Work OS console link from the page header", () => {
    render(<MyRequestsPage />);

    fireEvent.click(
      screen.getAllByRole("button", { name: /copy permalink/i })[0]
    );

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?timelineSource=work_os`
    );
  });

  it("keeps the Thai page on the preflight review launch path", () => {
    mockLanguage = "th";
    render(<MyRequestsPage />);

    fireEvent.click(
      screen.getAllByRole("link", {
        name: /review and approve automation/i,
      })[0]
    );

    expect(mockNavigate).toHaveBeenCalledWith("/work/request?requestId=req-1");
  });
});
