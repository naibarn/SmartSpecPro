/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockNavigate = vi.fn();
const createRequestMutateAsync = vi.fn();
const invalidateMyRequests = vi.fn();
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);

vi.mock("wouter", () => ({
  useLocation: () => ["/work/request", mockNavigate],
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
    useUtils: () => ({
      workOs: {
        listMyRequests: {
          invalidate: invalidateMyRequests,
        },
      },
    }),
    team: {
      list: {
        useQuery: () => ({
          data: [
            {
              id: "team-1",
              name: "Operations Team",
              status: "active",
              latestRoomId: "room-1",
              latestRoomType: "team",
            },
          ],
          isLoading: false,
        }),
      },
    },
    workOs: {
      listMyRequests: {
        useQuery: () => ({
          data: [
            {
              id: "req-1",
              title: "Review refund",
              currentState: "new",
              sourceType: "chat",
              defaultOwnerType: "human",
              defaultOwnerId: "42",
              linkedCaseId: "case-1",
              createdAt: "2026-04-11T10:00:00.000Z",
            },
          ],
          isLoading: false,
        }),
      },
      createRequest: {
        useMutation: (options?: { onSuccess?: (result: any) => void | Promise<void> }) => ({
          mutateAsync: async (...args: unknown[]) => {
            const result = await createRequestMutateAsync(...args);
            await options?.onSuccess?.(result);
            return result;
          },
          isPending: false,
        }),
      },
    },
  },
}));

import WorkRequestPage from "../WorkRequest";

describe("WorkRequestPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClipboardWriteText.mockClear();
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: mockClipboardWriteText,
      },
      configurable: true,
    });
    createRequestMutateAsync.mockResolvedValue({
      request: { id: "req-2" },
      case: { id: "case-2" },
    });
  });

  it("creates a work request for a regular user", async () => {
    render(<WorkRequestPage />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Review refund request" },
    });
    fireEvent.change(screen.getByLabelText("Details"), {
      target: { value: "Customer needs a refund checked." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Work Request" }));

    await waitFor(() => {
      expect(createRequestMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        title: "Review refund request",
        objective: "Customer needs a refund checked.",
        sourceType: "manual",
        requesterId: "42",
        defaultOwnerType: "human",
        defaultOwnerId: "42",
      }));
    });

    await waitFor(() => {
      expect(invalidateMyRequests).toHaveBeenCalled();
    });
  });

  it("routes a request to one of the user's teams", async () => {
    render(<WorkRequestPage />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Prepare weekly report" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Assign to my team" }));
    fireEvent.change(screen.getByLabelText("Team"), {
      target: { value: "team-1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Work Request" }));

    await waitFor(() => {
      expect(createRequestMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        title: "Prepare weekly report",
        defaultOwnerType: "queue",
        defaultQueueId: "team-1",
      }));
    });
  });

  it("loads a spec file into the details field", async () => {
    render(<WorkRequestPage />);

    const specFile = new File(["# Weekly report\n\n- Keep it short\n- Add owners"], "spec.md", {
      type: "text/markdown",
    });
    const fileInput = screen.getByLabelText(/upload spec file/i);
    Object.defineProperty(fileInput, "files", {
      value: [specFile],
      configurable: true,
    });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect((screen.getByLabelText("Details") as HTMLTextAreaElement).value).toBe(
        "# Weekly report\n\n- Keep it short\n- Add owners",
      );
    });

    expect(screen.getByText("spec.md")).toBeInTheDocument();
  });

  it("accepts a spec file via drag and drop", async () => {
    render(<WorkRequestPage />);

    const specFile = new File(["# Incident notes\n\n- Verify refund totals"], "brief.md", {
      type: "text/markdown",
    });

    const dropzone = screen.getByTestId("details-dropzone");
    fireEvent.dragEnter(dropzone);
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [specFile],
      },
    });

    await waitFor(() => {
      expect((screen.getByLabelText("Details") as HTMLTextAreaElement).value).toBe(
        "# Incident notes\n\n- Verify refund totals",
      );
    });

    expect(screen.getByText("brief.md")).toBeInTheDocument();
  });

  it("opens the team detail page from a readiness card", () => {
    render(<WorkRequestPage />);

    fireEvent.click(screen.getByRole("button", { name: "Open team Operations Team" }));

    expect(mockNavigate).toHaveBeenCalledWith("/teams/team-1");
  });

  it("shows the latest room type badge on a readiness card", () => {
    render(<WorkRequestPage />);

    const badge = screen.getByText("Team room").closest("span") ?? screen.getByText("Team room").parentElement;
    expect(screen.getByText("Team room")).toHaveClass("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    expect(badge?.querySelector("svg")).not.toBeNull();
  });

  it("shows a tooltip for the latest room type badge", async () => {
    render(<WorkRequestPage />);

    expect(screen.getByText("Team room")).toHaveAttribute(
      "title",
      "A standard team room for ongoing work and collaboration.",
    );
  });

  it("opens the latest team room from a readiness card", () => {
    render(<WorkRequestPage />);

    fireEvent.click(screen.getByRole("button", { name: "Open room" }));

    expect(mockNavigate).toHaveBeenCalledWith("/teams/team-1?roomId=room-1");
  });

  it("opens the latest team queue from a readiness card", () => {
    render(<WorkRequestPage />);

    fireEvent.click(screen.getByRole("button", { name: "Open queue" }));

    expect(mockNavigate).toHaveBeenCalledWith("/teams/team-1?roomId=room-1&panel=workflow");
  });

  it("opens Work OS with the work_os source filter after creation", async () => {
    render(<WorkRequestPage />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Review refund request" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Work Request" }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /open in work os console/i }).length).toBeGreaterThan(1);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /open in work os console/i })[1]);

    expect(mockNavigate).toHaveBeenCalledWith("/admin/work-os?caseId=case-2&timelineSource=work_os");
  });

  it("opens the Work OS guide from the page header", () => {
    render(<WorkRequestPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /open guide/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/help/work-os");
  });

  it("opens the Work OS guide from the helper card", () => {
    render(<WorkRequestPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /open guide/i })[1]);
    expect(mockNavigate).toHaveBeenCalledWith("/help/work-os");
  });

  it("copies a bookmarkable Work OS link after creation", async () => {
    render(<WorkRequestPage />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Review refund request" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Work Request" }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /copy permalink/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /copy permalink/i })[1]);

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-2&timelineSource=work_os`,
    );
  });

  it("copies the Work OS console permalink from the top bar after creation", async () => {
    render(<WorkRequestPage />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Review refund request" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Work Request" }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /copy permalink/i }).length).toBeGreaterThan(1);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /copy permalink/i })[0]);

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-2&timelineSource=work_os`,
    );
  });
});
