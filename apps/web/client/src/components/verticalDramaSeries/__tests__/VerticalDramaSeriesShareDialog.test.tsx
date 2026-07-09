/**
 * VerticalDramaSeriesShareDialog coverage (task #32, Collab-lite L1,
 * F131AA). Same hand-rolled `@/lib/trpc` mock + `mutate` synchronously
 * invoking the captured `onSuccess`/`onError` convention as
 * `VerticalDramaSeriesDetailPage.deepStoryDrafts.test.tsx`.
 *
 * Covers: flag gating (`enabled` prop, mirrors `deepDraftsFlagEnabled`'s own
 * prop-driven testing convention — no `useTenantFeatureFlag` mock needed),
 * create -> reveal-once -> copy, the existing-links list + status labels,
 * the ≤5 cap hint, and revoke-with-confirm.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateMutate = vi.fn();
const mockRevokeMutate = vi.fn();
const mockInvalidate = vi.fn();

let createShouldFail = false;
let createResult: { id: string; token: string; expiresAt: Date } = {
  id: "1",
  token: "RAW_TOKEN_VALUE_123",
  expiresAt: new Date("2026-07-16T00:00:00Z"),
};
let listData: { links: Array<{ id: string; createdAt: Date; expiresAt: Date; revokedAt: Date | null; accessCount: number; active: boolean }> } = {
  links: [],
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: {
        listSeriesShareLinks: { invalidate: mockInvalidate },
      },
    }),
    verticalDramaSeries: {
      listSeriesShareLinks: {
        useQuery: () => ({ data: listData, isLoading: false }),
      },
      createSeriesShareLink: {
        useMutation: (opts: { onSuccess?: (r: unknown) => void; onError?: (e: { message?: string }) => void }) => ({
          mutate: (input: unknown) => {
            mockCreateMutate(input);
            if (createShouldFail) {
              opts?.onError?.({ message: "create boom" });
            } else {
              opts?.onSuccess?.(createResult);
            }
          },
          isPending: false,
        }),
      },
      revokeSeriesShareLink: {
        useMutation: (opts: { onSuccess?: () => void; onError?: (e: { message?: string }) => void }) => ({
          mutate: (input: unknown) => {
            mockRevokeMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { VerticalDramaSeriesShareDialog } from "@/components/verticalDramaSeries/VerticalDramaSeriesShareDialog";

beforeEach(() => {
  vi.clearAllMocks();
  createShouldFail = false;
  listData = { links: [] };
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("flag gating", () => {
  it("renders nothing at all when enabled is false", () => {
    const { container } = render(
      <VerticalDramaSeriesShareDialog lang="th" enabled={false} seriesId="10" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when enabled is omitted (defaults to false)", () => {
    const { container } = render(<VerticalDramaSeriesShareDialog lang="th" seriesId="10" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the trigger button when enabled is true", () => {
    render(<VerticalDramaSeriesShareDialog lang="th" enabled seriesId="10" />);
    expect(screen.getByTestId("vd-share-trigger-button")).toBeInTheDocument();
  });
});

describe("create -> reveal-once -> copy", () => {
  it("opens the dialog, creates a link with the selected expiry, and shows the URL exactly once", async () => {
    render(<VerticalDramaSeriesShareDialog lang="th" enabled seriesId="10" />);

    fireEvent.click(screen.getByTestId("vd-share-trigger-button"));
    fireEvent.click(screen.getByTestId("vd-share-create-button"));

    expect(mockCreateMutate).toHaveBeenCalledWith({ seriesId: "10", expiresInDays: 7 });

    await waitFor(() => expect(screen.getByTestId("vd-share-reveal")).toBeInTheDocument());

    const urlInput = screen.getByTestId("vd-share-url-input") as HTMLInputElement;
    expect(urlInput.value).toContain("/share/vd/RAW_TOKEN_VALUE_123");
    expect(toast.success).toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalledWith({ seriesId: "10" });
  });

  it("creates a 30-day link when that radio option is selected", async () => {
    render(<VerticalDramaSeriesShareDialog lang="th" enabled seriesId="10" />);

    fireEvent.click(screen.getByTestId("vd-share-trigger-button"));
    fireEvent.click(screen.getByLabelText("30 วัน"));
    fireEvent.click(screen.getByTestId("vd-share-create-button"));

    expect(mockCreateMutate).toHaveBeenCalledWith({ seriesId: "10", expiresInDays: 30 });
  });

  it("copies the URL to the clipboard when the copy button is clicked", async () => {
    render(<VerticalDramaSeriesShareDialog lang="th" enabled seriesId="10" />);
    fireEvent.click(screen.getByTestId("vd-share-trigger-button"));
    fireEvent.click(screen.getByTestId("vd-share-create-button"));
    await waitFor(() => expect(screen.getByTestId("vd-share-reveal")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("vd-share-copy-button"));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("/share/vd/RAW_TOKEN_VALUE_123"),
      ),
    );
  });

  it("shows an error toast and does NOT reveal a URL when creation fails", async () => {
    createShouldFail = true;
    render(<VerticalDramaSeriesShareDialog lang="th" enabled seriesId="10" />);

    fireEvent.click(screen.getByTestId("vd-share-trigger-button"));
    fireEvent.click(screen.getByTestId("vd-share-create-button"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("create boom"));
    expect(screen.queryByTestId("vd-share-reveal")).not.toBeInTheDocument();
  });

  it("clears the revealed token when the dialog is closed and reopened", async () => {
    render(<VerticalDramaSeriesShareDialog lang="th" enabled seriesId="10" />);
    fireEvent.click(screen.getByTestId("vd-share-trigger-button"));
    fireEvent.click(screen.getByTestId("vd-share-create-button"));
    await waitFor(() => expect(screen.getByTestId("vd-share-reveal")).toBeInTheDocument());

    fireEvent.click(screen.getByText("ปิด"));
    fireEvent.click(screen.getByTestId("vd-share-trigger-button"));

    expect(screen.queryByTestId("vd-share-reveal")).not.toBeInTheDocument();
  });
});

describe("existing links list", () => {
  it("shows the empty state when there are no links", () => {
    render(<VerticalDramaSeriesShareDialog lang="th" enabled seriesId="10" />);
    fireEvent.click(screen.getByTestId("vd-share-trigger-button"));
    expect(screen.getByTestId("vd-share-list-empty")).toBeInTheDocument();
  });

  it("renders status + accessCount for each link, and only shows revoke for ACTIVE links", () => {
    listData = {
      links: [
        {
          id: "1",
          createdAt: new Date("2026-07-01"),
          expiresAt: new Date("2026-07-08"),
          revokedAt: null,
          accessCount: 4,
          active: true,
        } as any,
        {
          id: "2",
          createdAt: new Date("2026-06-01"),
          expiresAt: new Date("2026-06-08"),
          revokedAt: new Date("2026-06-02"),
          accessCount: 1,
          active: false,
        } as any,
      ],
    };

    render(<VerticalDramaSeriesShareDialog lang="th" enabled seriesId="10" />);
    fireEvent.click(screen.getByTestId("vd-share-trigger-button"));

    const row1 = screen.getByTestId("vd-share-link-row-1");
    expect(within(row1).getByText("ใช้งานอยู่")).toBeInTheDocument();
    expect(within(row1).getByText("4")).toBeInTheDocument();
    expect(screen.getByTestId("vd-share-revoke-button-1")).toBeInTheDocument();

    const row2 = screen.getByTestId("vd-share-link-row-2");
    expect(within(row2).getByText("เพิกถอนแล้ว")).toBeInTheDocument();
    expect(screen.queryByTestId("vd-share-revoke-button-2")).not.toBeInTheDocument();
  });

  it("disables create and shows the cap hint once 5 active links exist", () => {
    listData = {
      links: Array.from({ length: 5 }, (_, i) => ({
        id: String(i + 1),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
        accessCount: 0,
        active: true,
      })) as any,
    };

    render(<VerticalDramaSeriesShareDialog lang="th" enabled seriesId="10" />);
    fireEvent.click(screen.getByTestId("vd-share-trigger-button"));

    expect(screen.getByTestId("vd-share-cap-hint")).toBeInTheDocument();
    expect(screen.getByTestId("vd-share-create-button")).toBeDisabled();
  });
});

describe("revoke with confirm", () => {
  it("requires confirmation before calling the mutation", async () => {
    listData = {
      links: [
        {
          id: "1",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86_400_000),
          revokedAt: null,
          accessCount: 0,
          active: true,
        } as any,
      ],
    };

    render(<VerticalDramaSeriesShareDialog lang="th" enabled seriesId="10" />);
    fireEvent.click(screen.getByTestId("vd-share-trigger-button"));
    fireEvent.click(screen.getByTestId("vd-share-revoke-button-1"));

    // Not yet called — only the confirm dialog is open.
    expect(mockRevokeMutate).not.toHaveBeenCalled();
    expect(screen.getByText("เพิกถอนลิงก์นี้?")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vd-share-revoke-confirm-button"));

    await waitFor(() =>
      expect(mockRevokeMutate).toHaveBeenCalledWith({ seriesId: "10", linkId: "1" }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("does not call the mutation when the user cancels", () => {
    listData = {
      links: [
        {
          id: "1",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86_400_000),
          revokedAt: null,
          accessCount: 0,
          active: true,
        } as any,
      ],
    };

    render(<VerticalDramaSeriesShareDialog lang="th" enabled seriesId="10" />);
    fireEvent.click(screen.getByTestId("vd-share-trigger-button"));
    fireEvent.click(screen.getByTestId("vd-share-revoke-button-1"));
    fireEvent.click(screen.getByText("ยกเลิก"));

    expect(mockRevokeMutate).not.toHaveBeenCalled();
  });
});
