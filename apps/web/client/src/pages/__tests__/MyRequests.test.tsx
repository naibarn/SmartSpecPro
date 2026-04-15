/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockNavigate = vi.fn();
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);

vi.mock("wouter", () => ({
  useLocation: () => ["/work/requests", mockNavigate],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 42, role: "admin" },
  }),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (_key: string, defaultValue?: string | Record<string, unknown>) =>
      typeof defaultValue === "string" ? defaultValue : _key,
    locale: "en",
    i18n: {
      exists: () => true,
      resolvedLanguage: "en",
      language: "en",
      changeLanguage: vi.fn(),
    },
    setLocale: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workOs: {
      listMyRequests: {
        useQuery: () => ({
          data: [
            {
              id: "req-1",
              title: "Review refund request",
              sourceType: "chat",
              currentState: "waiting_for_approval",
              businessDomain: "finance",
              urgency: "high",
              riskLevel: "medium",
              defaultOwnerType: "human",
              defaultOwnerId: "42",
              linkedCaseId: "case-1",
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
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: mockClipboardWriteText,
      },
      configurable: true,
    });
  });

  it("shows a summary of the user's requests and routes to work creation", () => {
    render(<MyRequestsPage />);

    expect(screen.getAllByRole("heading", { name: "My Requests" })[0]).toBeInTheDocument();
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

  it("opens the linked work case in Work OS with a bookmarkable source filter", () => {
    render(<MyRequestsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /open work os console/i })[1]);

    expect(mockNavigate).toHaveBeenCalledWith("/admin/work-os?caseId=case-1&timelineSource=work_os");
  });

  it("opens source-specific Work OS shortcuts from a request row", () => {
    render(<MyRequestsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /role routine/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/admin/work-os?caseId=case-1&timelineSource=role_routine");

    fireEvent.click(screen.getAllByRole("button", { name: /team run/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/admin/work-os?caseId=case-1&timelineSource=team_run");

    fireEvent.click(screen.getAllByRole("button", { name: /workpack/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/admin/work-os?caseId=case-1&timelineSource=workpack_record");
  });

  it("copies a bookmarkable Work OS link from a request row", () => {
    render(<MyRequestsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /copy permalink/i })[1]);

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-1&timelineSource=work_os`,
    );
  });

  it("copies source-specific Work OS links from a request row", () => {
    render(<MyRequestsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /copy role evidence/i })[0]);
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-1&timelineSource=role_routine`,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /copy team evidence/i })[0]);
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-1&timelineSource=team_run`,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /copy workpack evidence/i })[0]);
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-1&timelineSource=workpack_record`,
    );
  });

  it("copies the Work OS console link from the page header", () => {
    render(<MyRequestsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /copy permalink/i })[0]);

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?timelineSource=work_os`,
    );
  });
});
