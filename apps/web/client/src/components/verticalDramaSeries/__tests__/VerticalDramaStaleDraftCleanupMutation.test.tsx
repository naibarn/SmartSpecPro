// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mutationCallbacks, toastSuccess, toastError } = vi.hoisted(() => ({
  mutationCallbacks: {
    current: null as null | {
      onSuccess: (data: { archivedCount: number }) => void;
      onError: (error: { message?: string }) => void;
    },
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    verticalDramaSeries: {
      archiveStaleDraftJobs: {
        useMutation: (callbacks: typeof mutationCallbacks.current) => {
          mutationCallbacks.current = callbacks;
          return { mutate: vi.fn(), isPending: false };
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { useVerticalDramaStaleDraftCleanupMutation } from "@/components/verticalDramaSeries/VerticalDramaStaleDraftCleanupDialog";

describe("useVerticalDramaStaleDraftCleanupMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationCallbacks.current = null;
  });

  it("reports the archived count and requests close/refetch after success", () => {
    const onCompleted = vi.fn();
    renderHook(() =>
      useVerticalDramaStaleDraftCleanupMutation({ lang: "th", onCompleted })
    );

    act(() => mutationCallbacks.current?.onSuccess({ archivedCount: 3 }));
    expect(toastSuccess).toHaveBeenCalledWith(
      "เก็บงาน Draft 3 งานเข้าประวัติแล้ว"
    );
    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it("treats a zero-row race as a safe completed cleanup", () => {
    const onCompleted = vi.fn();
    renderHook(() =>
      useVerticalDramaStaleDraftCleanupMutation({ lang: "en", onCompleted })
    );

    act(() => mutationCallbacks.current?.onSuccess({ archivedCount: 0 }));
    expect(toastSuccess).toHaveBeenCalledWith(
      "No Draft jobs are still eligible; they may have been updated."
    );
    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it("keeps the dialog flow retryable and reports a mutation error", () => {
    const onCompleted = vi.fn();
    renderHook(() =>
      useVerticalDramaStaleDraftCleanupMutation({ lang: "en", onCompleted })
    );

    act(() => mutationCallbacks.current?.onError({ message: "Database busy" }));
    expect(toastError).toHaveBeenCalledWith(
      "Could not archive Draft jobs. Please try again."
    );
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
