// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mutationOptions,
  listInvalidate,
  getInvalidate,
  toastSuccess,
  toastError,
} = vi.hoisted(() => ({
  mutationOptions: {
    current: null as null | {
      onSuccess: () => Promise<void>;
      onError: (error: { message?: string }) => void;
    },
  },
  listInvalidate: vi.fn<() => Promise<void>>(),
  getInvalidate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: {
        list: { invalidate: listInvalidate },
        get: { invalidate: getInvalidate },
      },
    }),
    verticalDramaSeries: {
      deleteSeries: {
        useMutation: (options: typeof mutationOptions.current) => {
          mutationOptions.current = options;
          return { mutate: vi.fn(), isPending: false, error: null };
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { VerticalDramaDeleteSeriesDialog } from "../VerticalDramaDeleteSeriesDialog";

describe("VerticalDramaDeleteSeriesDialog delete synchronization", () => {
  beforeEach(() => {
    mutationOptions.current = null;
    listInvalidate.mockReset();
    getInvalidate.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("waits for list invalidation before closing and navigating", async () => {
    let resolveListInvalidation!: () => void;
    listInvalidate.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveListInvalidation = resolve;
        })
    );

    const onOpenChange = vi.fn();
    const onDeleted = vi.fn();
    render(
      <VerticalDramaDeleteSeriesDialog
        lang="th"
        open={false}
        onOpenChange={onOpenChange}
        seriesId="33"
        seriesTitle="เรื่องที่ลบ"
        onDeleted={onDeleted}
      />
    );

    let successPromise!: Promise<void>;
    act(() => {
      successPromise = mutationOptions.current!.onSuccess();
    });

    expect(listInvalidate).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();

    await act(async () => {
      resolveListInvalidation();
      await successPromise;
    });

    expect(getInvalidate).toHaveBeenCalledWith({ seriesId: "33" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDeleted).toHaveBeenCalledOnce();
  });
});
