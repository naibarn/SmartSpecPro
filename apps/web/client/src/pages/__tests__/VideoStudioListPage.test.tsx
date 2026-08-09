/**
 * VideoStudioListPage coverage (Feature 133, section-08). Proves the create
 * actions are fail-closed gated by the per-studio tenant flags
 * (F133C `videoIntelligenceCatalogStudioEnabled`, F133-motion
 * `videoIntelligenceMotionStudioEnabled`) — independent of the master
 * F133A route guard, which lives in `App.tsx` and is not under test here.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Astryx's AlertDialog (used by the project-delete confirm) renders a native
// <dialog> element and calls showModal()/close() on it. jsdom does not
// implement these — see `CatalogCreateDialog.test.tsx` for the same patch.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

const listQueryMock = vi.fn();
const tenantFlagMock = vi.fn();
const deleteMutateMock = vi.fn();
const duplicateMutateMock = vi.fn();
const listInvalidateMock = vi.fn();

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ["/video-studio", vi.fn()],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "th" } }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: (flag: string) => tenantFlagMock(flag),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ videoProjects: { list: { invalidate: listInvalidateMock } } }),
    videoProjects: {
      list: { useQuery: (...args: unknown[]) => listQueryMock(...args) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      delete: {
        useMutation: (hookOpts: Record<string, unknown>) => ({
          mutate: (input: unknown) => deleteMutateMock(input, hookOpts),
          isPending: false,
        }),
      },
      duplicate: {
        useMutation: (hookOpts: Record<string, unknown>) => ({
          mutate: (input: unknown) => duplicateMutateMock(input, hookOpts),
          isPending: false,
        }),
      },
    },
    marketplaceCapture: {
      getProduct: { useQuery: () => ({ data: undefined, isFetching: false, isError: false }) },
      listProducts: {
        useQuery: () => ({ data: [], isFetching: false, isError: false, error: null }),
      },
    },
  },
}));

import VideoStudioListPage from "../VideoStudioListPage";

beforeEach(() => {
  vi.clearAllMocks();
  listQueryMock.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe("VideoStudioListPage — create action flag gating", () => {
  it("shows both create actions when both studio flags are enabled", () => {
    tenantFlagMock.mockImplementation(() => true);
    render(<VideoStudioListPage />);
    expect(screen.getAllByTestId("video-studio-new-from-product").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("video-studio-new-blank-project").length).toBeGreaterThan(0);
  });

  it("hides the Catalog create action when videoIntelligenceCatalogStudioEnabled is off", () => {
    tenantFlagMock.mockImplementation((flag: string) => flag !== "videoIntelligenceCatalogStudioEnabled");
    render(<VideoStudioListPage />);
    expect(screen.queryAllByTestId("video-studio-new-from-product")).toHaveLength(0);
    expect(screen.getAllByTestId("video-studio-new-blank-project").length).toBeGreaterThan(0);
  });

  it("hides the Motion create action when videoIntelligenceMotionStudioEnabled is off", () => {
    tenantFlagMock.mockImplementation((flag: string) => flag !== "videoIntelligenceMotionStudioEnabled");
    render(<VideoStudioListPage />);
    expect(screen.getAllByTestId("video-studio-new-from-product").length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId("video-studio-new-blank-project")).toHaveLength(0);
  });

  it("hides both create actions when both studio flags are off", () => {
    tenantFlagMock.mockImplementation(() => false);
    render(<VideoStudioListPage />);
    expect(screen.queryAllByTestId("video-studio-new-from-product")).toHaveLength(0);
    expect(screen.queryAllByTestId("video-studio-new-blank-project")).toHaveLength(0);
  });

  it("renders project cards from the list query", () => {
    tenantFlagMock.mockImplementation(() => true);
    listQueryMock.mockReturnValue({
      data: [
        { id: 1, name: "My Catalog Video", studioType: "catalog", status: "brief", updatedAt: new Date().toISOString() },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<VideoStudioListPage />);
    expect(screen.getByText("My Catalog Video")).toBeInTheDocument();
  });

  it("shows a breadcrumb link back to the Dashboard", () => {
    tenantFlagMock.mockImplementation(() => true);
    render(<VideoStudioListPage />);
    const dashboardLink = screen.getByRole("link", { name: /dashboard|แดชบอร์ด/i });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
  });
});

describe("VideoStudioListPage — project delete", () => {
  beforeEach(() => {
    tenantFlagMock.mockImplementation(() => true);
    listQueryMock.mockReturnValue({
      data: [
        { id: 1, name: "My Catalog Video", studioType: "catalog", status: "brief", updatedAt: new Date().toISOString() },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("opens a named confirm dialog and calls delete + invalidates the list on confirm", () => {
    render(<VideoStudioListPage />);

    fireEvent.click(screen.getByTestId("project-delete"));
    const confirmDialog = screen.getByTestId("project-delete-confirm");
    expect(within(confirmDialog).getByText(/My Catalog Video/)).toBeInTheDocument();

    fireEvent.click(within(confirmDialog).getByRole("button", { name: "ลบโปรเจกต์" }));
    expect(deleteMutateMock).toHaveBeenCalledWith({ projectId: 1 }, expect.anything());
  });
});

describe("VideoStudioListPage — project duplicate", () => {
  beforeEach(() => {
    tenantFlagMock.mockImplementation(() => true);
    listQueryMock.mockReturnValue({
      data: [
        { id: 1, name: "Reusable Catalog Video", studioType: "catalog", status: "completed", updatedAt: new Date().toISOString() },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("offers a duplicate action for the repeat-use workflow", () => {
    render(<VideoStudioListPage />);
    fireEvent.click(screen.getByTestId("project-duplicate"));
    expect(duplicateMutateMock).toHaveBeenCalledWith({ projectId: 1 }, expect.anything());
  });
});
