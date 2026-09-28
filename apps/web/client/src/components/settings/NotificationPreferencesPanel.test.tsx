import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationPreferencesPanel } from "./NotificationPreferencesPanel";

vi.mock("./WebhookManagement", () => ({
  WebhookManagement: () => null,
}));

// ─── Mock tRPC ──────────────────────────────────────────────────────────────

const mockGetPreferences = vi.fn();
const mockUpsertMutate = vi.fn();
const mockSnoozeMutate = vi.fn();
const mockInvalidate = vi.fn();
const mockCancel = vi.fn().mockResolvedValue(undefined);
const mockSetData = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      notificationPreferences: {
        getPreferences: {
          cancel: mockCancel,
          getData: () => mockGetPreferences._data,
          setData: mockSetData,
          invalidate: mockInvalidate,
        },
      },
    }),
    notificationPreferences: {
      getPreferences: {
        useQuery: () => ({
          data: mockGetPreferences(),
          isLoading: mockGetPreferences._isLoading ?? false,
          isError: false,
        }),
      },
      upsertPreference: {
        useMutation: (opts: any) => ({
          mutate: (input: any) => {
            mockUpsertMutate(input);
            opts?.onSettled?.(null, null, input);
          },
          isPending: false,
        }),
      },
      snoozeCategory: {
        useMutation: (opts: any) => ({
          mutate: (input: any) => {
            mockSnoozeMutate(input);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
    notificationWebhooks: {
      listWebhooks: {
        useQuery: () => ({ data: [] }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (opts: any) => {
      // Mock the tenant feature flag query
      if (opts.queryKey?.[0] === "tenant") {
        return {
          data: {
            tenant: { featureFlags: { notificationPreferences: true } },
          },
        };
      }
      return { data: undefined };
    },
  };
});

const CATEGORIES = [
  "system_health", "credits", "media_jobs", "workflow", "skill",
  "feedback", "agency", "follow", "scheduled",
  "security", "business",
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPreferences._isLoading = false;
  mockGetPreferences._data = [];
  mockGetPreferences.mockReturnValue([]);
});

describe("NotificationPreferencesPanel", () => {
  it("renders a row for each of the 11 notification categories", () => {
    render(<NotificationPreferencesPanel />);
    for (const cat of CATEGORIES) {
      expect(screen.getByTestId(`category-row-${cat}`)).toBeInTheDocument();
    }
  });

  it("displays category labels", () => {
    render(<NotificationPreferencesPanel />);
    expect(screen.getByText("System Health")).toBeInTheDocument();
    expect(screen.getByText("Credits")).toBeInTheDocument();
    expect(screen.getByText("Media Jobs")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Business")).toBeInTheDocument();
  });

  it("defaults the Credits severity to High", () => {
    render(<NotificationPreferencesPanel />);

    expect(
      screen.getByLabelText("Minimum severity for Credits")
    ).toHaveTextContent("High");
  });

  it("renders In-App, Email, and Telegram toggle columns", () => {
    render(<NotificationPreferencesPanel />);
    // Check that each category has 3 toggles
    for (const cat of CATEGORIES) {
      expect(screen.getByTestId(`toggle-inApp-${cat}`)).toBeInTheDocument();
      expect(screen.getByTestId(`toggle-email-${cat}`)).toBeInTheDocument();
      expect(screen.getByTestId(`toggle-telegram-${cat}`)).toBeInTheDocument();
    }
  });

  it("populates toggles from getPreferences query data", () => {
    mockGetPreferences.mockReturnValue([
      {
        category: "security",
        inApp: true,
        email: true,
        telegram: false,
        minSeverity: "high",
        mutedUntil: null,
      },
    ]);

    render(<NotificationPreferencesPanel />);

    const inAppToggle = screen.getByTestId("toggle-inApp-security");
    const emailToggle = screen.getByTestId("toggle-email-security");
    const telegramToggle = screen.getByTestId("toggle-telegram-security");

    expect(inAppToggle).toHaveAttribute("data-state", "checked");
    expect(emailToggle).toHaveAttribute("data-state", "checked");
    expect(telegramToggle).toHaveAttribute("data-state", "unchecked");
  });

  it("defaults to inApp=true, email=false, telegram=false when no preference row exists", () => {
    mockGetPreferences.mockReturnValue([]);

    render(<NotificationPreferencesPanel />);

    const inApp = screen.getByTestId("toggle-inApp-workflow");
    const email = screen.getByTestId("toggle-email-workflow");
    const telegram = screen.getByTestId("toggle-telegram-workflow");

    expect(inApp).toHaveAttribute("data-state", "checked");
    expect(email).toHaveAttribute("data-state", "unchecked");
    expect(telegram).toHaveAttribute("data-state", "unchecked");
  });

  it("calls upsertPreference mutation when a toggle is changed", () => {
    mockGetPreferences.mockReturnValue([]);

    render(<NotificationPreferencesPanel />);

    const emailToggle = screen.getByTestId("toggle-email-feedback");
    fireEvent.click(emailToggle);

    expect(mockUpsertMutate).toHaveBeenCalledWith(
      expect.objectContaining({ category: "feedback", email: true }),
    );
  });

  it("shows loading skeleton while getPreferences is fetching", () => {
    mockGetPreferences._isLoading = true;
    mockGetPreferences.mockReturnValue(undefined);

    // Override the useQuery mock to return loading state
    const origMock = vi.mocked(mockGetPreferences);
    origMock._isLoading = true;

    render(<NotificationPreferencesPanel />);

    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });

  it("renders a Mute button per category row", () => {
    render(<NotificationPreferencesPanel />);
    for (const cat of CATEGORIES) {
      expect(screen.getByTestId(`mute-${cat}`)).toBeInTheDocument();
    }
  });

  it("calls snoozeCategory mutation when mute button is used", async () => {
    render(<NotificationPreferencesPanel />);

    const muteBtn = screen.getByTestId("mute-security");
    fireEvent.click(muteBtn);

    // Click "1 hour" option in the popover
    await waitFor(() => {
      const option = screen.getByTestId("snooze-1h-security");
      fireEvent.click(option);
    });

    expect(mockSnoozeMutate).toHaveBeenCalledWith(
      expect.objectContaining({ category: "security" }),
    );
    expect(mockSnoozeMutate.mock.calls[0][0].mutedUntil).toBeTruthy();
  });
});
