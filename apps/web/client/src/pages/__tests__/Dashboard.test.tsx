import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const setLocationMock = vi.fn();
const authState = {
  role: "user",
};
const tenantFeatureFlagsState = {
  desktopHostEnabled: false,
};
const desktopGovernanceStatusState = {
  status: {
    generatedAt: "2026-04-09T10:00:00.000Z",
    devices: [
      {
        deviceId: "desktop-1",
        displayName: "Ops Desktop",
        machineName: "ops-desktop",
        healthStatus: "online",
        accessState: "active",
        platform: {
          os: "windows",
          osVersion: "11",
          arch: "x64",
          appVersion: "0.1.0",
        },
        enrolledAt: "2026-04-09T09:00:00.000Z",
        lastSeenAt: "2026-04-09T10:00:00.000Z",
        owner: {
          userId: "42",
          name: "Ops Admin",
          email: "ops@example.com",
        },
        presence: {
          status: "online",
          staleAfterSeconds: 300,
          lastSeenAgeSeconds: 15,
          reportedAt: "2026-04-09T10:00:00.000Z",
        },
        workerProjectionEnabled: true,
        projectedWorkerRuntimeType: "desktop_zeroclaw_managed",
        warningFlags: [],
        capabilities: {},
        localRoots: [
          {
            rootId: "root-1",
            displayName: "Quotes",
            normalizedPath: "/quotes",
            trustScope: "user_selected",
            consentState: "granted",
            indexingMode: "metadata_full_text",
            writebackMode: "output_only",
            lastIndexedAt: null,
            lastIndexError: null,
            fileCountEstimate: null,
          },
        ],
        packageCachePaths: [],
        packageSyncState: {
          syncStatus: "ready",
          lastSyncAt: null,
          lastError: null,
          syncedPackageIds: [],
          packageCount: 0,
          lastRevocationCheckAt: null,
        },
        pendingActions: [],
        currentWorkspaceProfile: null,
        lastRunSummary: null,
        policyVersion: null,
        policyExpiresAt: null,
        policyOverrides: {},
      },
      {
        deviceId: "desktop-2",
        displayName: "Finance Laptop",
        machineName: "finance-laptop",
        healthStatus: "offline",
        accessState: "quarantined",
        platform: {
          os: "macos",
          osVersion: "14",
          arch: "arm64",
          appVersion: "0.1.0",
        },
        enrolledAt: "2026-04-08T09:00:00.000Z",
        lastSeenAt: "2026-04-09T09:50:00.000Z",
        owner: {
          userId: "84",
          name: "Finance Lead",
          email: "finance@example.com",
        },
        presence: {
          status: "stale",
          staleAfterSeconds: 300,
          lastSeenAgeSeconds: 600,
          reportedAt: "2026-04-09T10:00:00.000Z",
        },
        workerProjectionEnabled: false,
        projectedWorkerRuntimeType: null,
        warningFlags: ["quarantined"],
        capabilities: {},
        localRoots: [],
        packageCachePaths: [],
        packageSyncState: {
          syncStatus: "ready",
          lastSyncAt: null,
          lastError: null,
          syncedPackageIds: [],
          packageCount: 0,
          lastRevocationCheckAt: null,
        },
        pendingActions: [],
        currentWorkspaceProfile: null,
        lastRunSummary: null,
        policyVersion: null,
        policyExpiresAt: null,
        policyOverrides: {},
      },
    ],
  },
  isLoading: false,
  error: null as string | null,
  refresh: vi.fn(),
};
const changeLanguageMock = vi.fn();
const financeMutationMock = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
const financeInvalidateMock = () => ({ invalidate: vi.fn() });

const translationMap: Record<string, string> = {
  "common:admin": "Admin",
  "dashboard:signOut": "Sign Out",
  "dashboard:prioritySnapshot.title": "Priority Snapshot",
  "dashboard:trendHealth.title": "Trend & Health",
  "dashboard:quickActions.subtitle": "Workspace Shortcuts",
  "dashboard:nextBestActions.title": "Next Best Actions",
  "dashboard:review.improvementLoop": "Tenant-wide improvement loop",
  "dashboard:filterByAgency": "Filter by agency",
  "dashboard:review.open": "Open Review",
  "dashboard:review.appliedChanges": "Applied Changes",
  "dashboard:review.recentReviews": "Recent Reviews",
  "dashboard:review.agencies": "Agencies",
  "dashboard:review.center": "Open Review Center",
  "dashboard:allAgencies": "All Agencies",
  "dashboard:sections.documents": "Documents",
  "dashboard:review.coverage": "{{percent}}% coverage",
  "dashboard:review.metrics.agencies": "Agencies",
  "dashboard:review.metrics.reviewed": "Reviewed",
  "dashboard:review.metrics.averageRating": "Avg rating",
  "dashboard:review.metrics.averageAlignment": "Avg alignment",
  "dashboard:socialMenu.channels": "Channels",
  "dashboard:socialMenu.inbox": "Inbox",
  "dashboard:socialMenu.publishing": "Publishing",
  "dashboard:socialMenu.moderation": "Moderation",
  "dashboard:socialMenu.automation": "Social Automation",
  "dashboard:review.eyebrow": "Agency Review Center",
  "dashboard:review.description": "Track the latest agency feedback and rollout improvements.",
  "dashboard:nextBestActions.manageDesktopReleases": "Manage desktop releases",
  "dashboard:admin.systemMonitoring": "System Monitoring",
  "dashboard:admin.tools": "Admin Tools",
  "dashboard:admin.desktopGovernance": "Desktop Governance",
  "dashboard:admin.desktopGovernanceEyebrow": "Managed Desktop",
  "dashboard:admin.desktopGovernanceDescription": "Review enrolled desktop devices, last contact, root posture, and managed access controls from the web.",
  "dashboard:admin.desktopGovernanceOpen": "Open governance console",
  "dashboard:admin.desktopGovernanceDevices": "Enrolled devices",
  "dashboard:admin.desktopGovernanceDevicesDescription": "Desktop installs that enrolled into the managed control plane.",
  "dashboard:admin.desktopGovernanceConnected": "Connected now",
  "dashboard:admin.desktopGovernanceConnectedDescription": "Devices with a recent heartbeat inside the tenant policy window.",
  "dashboard:admin.desktopGovernanceRestricted": "Restricted devices",
  "dashboard:admin.desktopGovernanceRestrictedDescription": "Devices currently in re-auth, quarantine, or disabled state.",
  "dashboard:admin.desktopGovernanceRoots": "Devices with roots",
  "dashboard:admin.desktopGovernanceRootsDescription": "Managed desktops that currently expose at least one approved local root.",
  "dashboard:admin.desktopGovernanceUnavailable": "Desktop governance status is temporarily unavailable.",
  "dashboard:finance.actions.confirm": "Confirm",
  "dashboard:finance.actions.pause": "Pause",
  "dashboard:finance.actions.resume": "Resume",
  "dashboard:finance.actions.void": "Void",
  "dashboard:finance.description": "A private, user-scoped finance workspace for chat drafts, OCR receipts, recurring rules, and reports.",
  "dashboard:finance.drafts.empty": "No open drafts yet.",
  "dashboard:finance.drafts.title": "Drafts",
  "dashboard:finance.eyebrow": "Private Finance",
  "dashboard:finance.labels.needsAttention": "Needs attention",
  "dashboard:finance.locked.createPersonal": "Create Personal Chat",
  "dashboard:finance.locked.description": "Open a personal chat to keep receipts, drafts, and reports isolated from work conversations.",
  "dashboard:finance.locked.openPanel": "Open Finance Panel",
  "dashboard:finance.locked.title": "Personal finance is locked",
  "dashboard:finance.openPanel": "Open Finance Panel",
  "dashboard:finance.quick.description": "Type a note or upload a receipt to turn it into a draft transaction.",
  "dashboard:finance.quick.parseText": "Parse Text",
  "dashboard:finance.quick.textPlaceholder": "Example: Lunch with client, 120 THB",
  "dashboard:finance.quick.title": "Quick Draft",
  "dashboard:finance.quick.upload": "Upload Receipt",
  "dashboard:finance.recurring.empty": "No active recurring rules yet.",
  "dashboard:finance.recurring.title": "Recurring Rules",
  "dashboard:finance.summary.monthBalance": "Month balance",
  "dashboard:finance.summary.openDrafts": "Open drafts",
  "dashboard:finance.summary.todayExpense": "Today expense",
  "dashboard:finance.summary.todayIncome": "Today income",
  "dashboard:finance.title": "Personal Finance",
  "dashboard:finance.transactions.empty": "No confirmed transactions yet.",
  "dashboard:finance.transactions.title": "Recent Transactions",
};

function translate(key: string, params?: Record<string, string | number>) {
  if (key === "dashboard:welcome") {
    return `Welcome, ${params?.name ?? "User"}`;
  }

  if (key === "dashboard:meta.updated") {
    return `Updated ${params?.time ?? "just now"}`;
  }

  if (key === "dashboard:meta.analyticsWindow") {
    return `${params?.days ?? 30}-day window`;
  }

  if (key === "dashboard:meta.latestChat") {
    return `Latest chat ${params?.time ?? "just now"}`;
  }

  if (key === "dashboard:meta.latestCredit") {
    return `Latest credit ${params?.time ?? "just now"}`;
  }

  if (key === "dashboard:stats.datapoints") {
    return `${params?.count ?? 0} datapoints`;
  }

  if (key === "dashboard:notices.pendingApprovals") {
    return `${params?.count ?? 0} approvals pending`;
  }

  if (key === "dashboard:notices.failedGenerations") {
    return `${params?.count ?? 0} failed generations need review`;
  }

  if (key === "dashboard:review.coverage") {
    return `${params?.percent ?? 0}% coverage`;
  }

  if (key === "dashboard:admin.monitoringToolsGrouped") {
    return "Monitoring tools are grouped inside the command center.";
  }

  if (key === "dashboard:admin.monitoringToolsGroupedInside") {
    return "Monitoring tools are grouped inside the command center.";
  }

  if (key === "dashboard:admin.desktopGovernanceLastCheck") {
    return `Last check ${params?.time ?? "just now"}`;
  }

  if (key === "dashboard:admin.desktopGovernanceStale") {
    return `${params?.count ?? 0} stale`;
  }

  if (key === "dashboard:quickActions.finance") {
    return "Finance";
  }

  return translationMap[key] ?? key;
}

vi.mock("wouter", () => ({
  useLocation: () => ["/dashboard", setLocationMock] as const,
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: translate,
    i18n: {
      exists: () => true,
      resolvedLanguage: "en",
      language: "en",
      changeLanguage: changeLanguageMock,
    },
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      role: authState.role,
      name: "Test User",
      email: "test@example.com",
      credits: 0,
      plan: "free",
    },
    isLoading: false,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: { name: "SmartAIHub" },
    isLoading: false,
  }),
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => React.createElement("div", null, "Locale"),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: "div",
    section: "section",
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((options: any) => {
    const key = Array.isArray(options?.queryKey) ? options.queryKey[0] : null;

    if (key === "dashboard-analytics-summary") {
      return {
        data: {
          period: {
            start: "2026-03-17T00:00:00.000Z",
            end: "2026-03-24T12:00:00.000Z",
            days: 30,
          },
          usage: {
            total_requests: 42,
            total_credits: 2100,
            total_cost_usd: 2.1,
            avg_credits_per_request: 50,
            avg_cost_per_request_usd: 0.05,
          },
          payments: {
            total_paid_usd: 10,
            total_credits_purchased: 10000,
            payment_count: 1,
          },
          by_provider: {
            openai: { requests: 30, credits: 1500, cost_usd: 1.5 },
          },
          by_model: {},
          by_day: {},
        },
        isLoading: false,
      };
    }

    if (key === "dashboard-analytics-time-series") {
      return {
        data: {
          granularity: "day",
          period_days: 7,
          data_points: 7,
          data: [
            { timestamp: "2026-03-18", requests: 3, credits: 80, cost_usd: 0.08 },
            { timestamp: "2026-03-19", requests: 4, credits: 100, cost_usd: 0.1 },
            { timestamp: "2026-03-20", requests: 5, credits: 120, cost_usd: 0.12 },
            { timestamp: "2026-03-21", requests: 4, credits: 90, cost_usd: 0.09 },
            { timestamp: "2026-03-22", requests: 6, credits: 140, cost_usd: 0.14 },
            { timestamp: "2026-03-23", requests: 8, credits: 210, cost_usd: 0.21 },
            { timestamp: "2026-03-24", requests: 12, credits: 300, cost_usd: 0.3 },
          ],
        },
        isLoading: false,
      };
    }

    return { data: undefined, isLoading: false };
  }),
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlags: () => tenantFeatureFlagsState,
}));

vi.mock("@/features/desktop-host/useDesktopHostStatus", () => ({
  useDesktopHostStatus: () => desktopGovernanceStatusState,
}));

vi.mock("@/hooks/useAgencyQuery", () => ({
  useAgencyList: () => ({
    data: {
      agencies: [
        { id: "agency-1", name: "Growth Agency" },
        { id: "agency-2", name: "Support Agency" },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useMenuItems", () => ({
  getResolvedMenuItems: (_role: string, group: string) => {
    if (group === "admin") {
      return authState.role === "admin"
        ? [
            {
              id: "admin-overview",
              label: "Admin Command Center",
              path: "/admin/dashboard",
              external: false,
              IconComponent: () => React.createElement("span", null, "A"),
            },
            {
              id: "admin-services",
              label: "Services",
              path: "/admin/services",
              external: false,
              IconComponent: () => React.createElement("span", null, "S"),
            },
            {
              id: "admin-users",
              label: "Users",
              path: "/admin/users",
              external: false,
              IconComponent: () => React.createElement("span", null, "U"),
            },
          ]
        : [];
    }

    if (group === "domain-admin") {
      return [];
    }

    return [
      {
        id: "dashboard",
        label: "Dashboard",
        path: "/dashboard",
        external: false,
        IconComponent: () => React.createElement("span", null, "D"),
      },
      {
        id: "document-management",
        label: "Library",
        path: "/document-management",
        external: false,
        section: "documents",
        IconComponent: () => React.createElement("span", null, "L"),
      },
      {
        id: "private-files",
        label: "Private Files",
        path: "/document-management?scope=private_vault&sort=updated_desc",
        external: false,
        parentId: "document-management",
        IconComponent: () => React.createElement("span", null, "P"),
      },
      {
        id: "settings",
        label: "Settings",
        path: "/settings",
        external: false,
        IconComponent: () => React.createElement("span", null, "S"),
      },
    ];
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      finance: {
        listDrafts: financeInvalidateMock(),
        getDailySummary: financeInvalidateMock(),
        getMonthlySummary: financeInvalidateMock(),
        listTransactions: financeInvalidateMock(),
        listRecurringRules: financeInvalidateMock(),
      },
    }),
    media: {
      listTasks: {
        useQuery: vi.fn(() => ({ data: { tasks: [], total: 0 }, isLoading: false })),
      },
    },
    credits: {
      stats: {
        useQuery: vi.fn(() => ({ data: { totalUsage: 0 }, isLoading: false })),
      },
      history: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
    },
    chat: {
      listConversations: {
        useQuery: vi.fn(() => ({
          data: {
            conversations: [
              {
                id: 1,
                title: "Weekly Ops",
                messageCount: 4,
                totalCreditsUsed: 12,
                updatedAt: "2026-04-09T09:00:00.000Z",
                projectId: "ops",
              },
              {
                id: 2,
                title: "Personal Finance",
                messageCount: 3,
                totalCreditsUsed: 0,
                updatedAt: "2026-04-09T10:00:00.000Z",
                projectId: "personal",
              },
            ],
            total: 2,
          },
          isLoading: false,
        })),
      },
      getConversation: {
        useQuery: vi.fn(() => ({
          data: {
            id: 2,
            projectId: "personal",
          },
          isLoading: false,
        })),
      },
    },
    finance: {
      getDailySummary: {
        useQuery: vi.fn(() => ({
          data: {
            incomeMinor: 125000,
            expenseMinor: 42000,
            balanceMinor: 83000,
          },
          isLoading: false,
        })),
      },
      getMonthlySummary: {
        useQuery: vi.fn(() => ({
          data: {
            incomeMinor: 510000,
            expenseMinor: 210000,
            transferMinor: 0,
            balanceMinor: 300000,
          },
          isLoading: false,
        })),
      },
      listDrafts: {
        useQuery: vi.fn(() => ({
          data: [
            {
              id: 501,
              type: "expense",
              amountMinor: 12000,
              currency: "THB",
              merchantName: "Lunch",
              categoryCode: "food",
              confidence: 0.88,
              needsClarification: false,
              createdAt: "2026-04-09T08:30:00.000Z",
              status: "draft",
            },
          ],
          isLoading: false,
        })),
      },
      listTransactions: {
        useQuery: vi.fn(() => ({
          data: [
            {
              id: 601,
              type: "expense",
              amountMinor: 12000,
              currency: "THB",
              merchantName: "Cafe",
              categoryCode: "food",
              status: "confirmed",
              occurredAt: "2026-04-09T07:45:00.000Z",
            },
          ],
          isLoading: false,
        })),
      },
      listRecurringRules: {
        useQuery: vi.fn(() => ({
          data: [
            {
              id: 701,
              amountMinor: 21900,
              currency: "THB",
              categoryCode: "subscription",
              merchantName: "Netflix",
              rrule: JSON.stringify({ frequency: "monthly", interval: 1, dayOfMonth: 5 }),
              timezone: "Asia/Bangkok",
              nextRunAt: "2026-05-05T00:00:00.000Z",
              status: "active",
              autoConfirm: false,
            },
          ],
          isLoading: false,
        })),
      },
      parseTextToDraft: {
        useMutation: vi.fn(() => financeMutationMock()),
      },
      confirmDraft: {
        useMutation: vi.fn(() => financeMutationMock()),
      },
      voidTransaction: {
        useMutation: vi.fn(() => financeMutationMock()),
      },
      pauseRecurringRule: {
        useMutation: vi.fn(() => financeMutationMock()),
      },
      resumeRecurringRule: {
        useMutation: vi.fn(() => financeMutationMock()),
      },
      ingestFinanceDocument: {
        useMutation: vi.fn(() => financeMutationMock()),
      },
    },
    library: {
      uploadFile: {
        useMutation: vi.fn(() => financeMutationMock()),
      },
    },
    workflow: {
      list: {
        useQuery: vi.fn(() => ({ data: { workflows: [] }, isLoading: false })),
      },
    },
    approvals: {
      getPending: {
        useQuery: vi.fn(() => ({ data: { requests: [] }, isLoading: false })),
      },
      submitDecision: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
    },
    agency: {
      reviewDashboard: {
        useQuery: vi.fn(() => ({
          data: {
            overview: {
              totalAgencies: 4,
              reviewedAgencies: 3,
              reviewCount: 6,
              averageRating: 4.3,
              averageObjectiveAlignment: 0.82,
              reviewCoverage: 0.75,
            },
            recentReviews: [
              {
                id: 11,
                agencyId: "agency-1",
                agencyName: "Growth Agency",
                rating: 5,
                suggestionsCount: 2,
                overallAssessment: "Strong output quality and good instruction coverage.",
                createdAt: "2026-03-23T12:00:00.000Z",
              },
              {
                id: 12,
                agencyId: "agency-2",
                agencyName: "Support Agency",
                rating: 3,
                suggestionsCount: 1,
                overallAssessment: "Needs more model diversity.",
                createdAt: "2026-03-23T11:00:00.000Z",
              },
            ],
            recentImprovements: [
              {
                id: 21,
                agencyId: "agency-1",
                agencyName: "Growth Agency",
                changeType: "node_instructions",
                description: "Applied: tightened the content brief.",
                createdAt: "2026-03-23T13:00:00.000Z",
              },
              {
                id: 22,
                agencyId: "agency-2",
                agencyName: "Support Agency",
                changeType: "model_selection",
                description: "Dismissed: keep the current model.",
                createdAt: "2026-03-23T09:00:00.000Z",
              },
            ],
          },
          isLoading: false,
        })),
      },
    },
    systemSettings: {
      getMenuVisibility: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
    },
  },
}));

import Dashboard from "../Dashboard";

describe("Dashboard", () => {
  beforeEach(() => {
    setLocationMock.mockClear();
    changeLanguageMock.mockClear();
    authState.role = "user";
    tenantFeatureFlagsState.desktopHostEnabled = false;
  });

  it("shows Private Files in the sidebar", () => {
    render(<Dashboard />);

    expect(screen.getByText("Documents")).toBeInTheDocument();

    const privateFilesButtons = screen.getAllByRole("button", { name: /private files/i });
    expect(privateFilesButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(privateFilesButtons[0]);
    expect(setLocationMock).toHaveBeenCalledWith("/document-management?scope=private_vault&sort=updated_desc");
  });

  it("shows Social Automation in the sidebar when the menu item is unavailable", () => {
    render(<Dashboard />);

    const socialAutomationButton = screen.getByRole("button", { name: /social automation/i });
    fireEvent.click(socialAutomationButton);

    expect(setLocationMock).toHaveBeenCalledWith("/social/automation");
  });

  it("shows agency review summary on the dashboard", () => {
    render(<Dashboard />);

    expect(screen.getByText("Tenant-wide improvement loop")).toBeInTheDocument();
    expect(screen.getByText("75% coverage")).toBeInTheDocument();
    expect(screen.getByText("Avg rating")).toBeInTheDocument();
    expect(screen.getByText("4.3")).toBeInTheDocument();
    expect(screen.getByText("Avg alignment")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getAllByText("Growth Agency").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("node_instructions")).toBeInTheDocument();
  });

  it("filters the review center by agency and opens the selected review center", () => {
    render(<Dashboard />);

    fireEvent.change(screen.getByLabelText(/filter by agency/i), {
      target: { value: "agency-1" },
    });

    expect(screen.getByText("Strong output quality and good instruction coverage.")).toBeInTheDocument();
    expect(screen.queryByText("Needs more model diversity.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^open review$/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/agencies/agency-1/review");

    setLocationMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /open review center/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/agencies/agency-1/review");
  });

  it("shows the priority snapshot and trend sections", () => {
    render(<Dashboard />);

    expect(screen.getByText("Priority Snapshot")).toBeInTheDocument();
    expect(screen.getByText("Trend & Health")).toBeInTheDocument();
    expect(screen.getAllByText("Workspace Shortcuts").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Next Best Actions")).toBeInTheDocument();
  });

  it("shows the personal finance report surface and shortcut", () => {
    render(<Dashboard />);

    expect(screen.getByRole("heading", { name: "Personal Finance" })).toBeInTheDocument();
    expect(screen.getByText("Today income")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent Transactions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Finance$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open Finance Panel/i })).toBeInTheDocument();
  });

  it("keeps non-monitoring admin tools visible while grouping monitoring pages into the command center", () => {
    authState.role = "admin";

    render(<Dashboard />);

    expect(screen.getAllByText("System Monitoring").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Admin Tools").length).toBeGreaterThanOrEqual(1);
    const commandCenterButton = screen.getByRole("button", { name: /admin command center/i });
    expect(commandCenterButton).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^services$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /users$/i })).toBeInTheDocument();
    expect(screen.getByText(/monitoring tools are grouped inside/i)).toBeInTheDocument();

    fireEvent.click(commandCenterButton);
    expect(setLocationMock).toHaveBeenCalledWith("/admin/dashboard");
  });

  it("shows desktop governance in next-best actions for admins when desktop host is enabled", () => {
    authState.role = "admin";
    tenantFeatureFlagsState.desktopHostEnabled = true;

    render(<Dashboard />);

    const desktopReleasesButton = screen.getByRole("button", { name: /desktop governance/i });
    expect(desktopReleasesButton).toBeInTheDocument();

    fireEvent.click(desktopReleasesButton);
    expect(setLocationMock).toHaveBeenCalledWith("/admin/desktop-host");
  });

  it("shows a dedicated desktop governance panel on the dashboard for admins", () => {
    authState.role = "admin";
    tenantFeatureFlagsState.desktopHostEnabled = true;

    render(<Dashboard />);

    expect(
      screen.getByRole("heading", { name: /desktop governance/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Enrolled devices")).toBeInTheDocument();
    expect(screen.getByText("Connected now")).toBeInTheDocument();
    expect(screen.getByText("Restricted devices")).toBeInTheDocument();
    expect(screen.getByText("Devices with roots")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /open governance console/i })
    );
    expect(setLocationMock).toHaveBeenCalledWith("/admin/desktop-host");
  });
});
