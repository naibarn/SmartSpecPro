/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockNavigate = vi.fn();
const createRequestMutateAsync = vi.fn();
const invalidateMyRequests = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/work/request", mockNavigate],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 42, role: "user" },
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
});
