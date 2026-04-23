/**
 * @vitest-environment jsdom
 */

import { createElement } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockLocation = "/settings/skills?skillId=99";
let mockSearch = "?skillId=99";
const mockSetLocation = vi.fn((nextLocation: string) => {
  mockLocation = nextLocation;
  const searchIndex = nextLocation.indexOf("?");
  mockSearch = searchIndex >= 0 ? nextLocation.slice(searchIndex) : "";
});
const mockUseSearch = vi.fn(() => mockSearch);
const mockClipboardWriteText = vi.fn();

const mockUseQuery = vi.fn(() => ({
  data: [],
  isLoading: false,
}));
const mockLegacyUpgradeQueueUseQuery = vi.fn(() => ({
  data: [],
  isLoading: false,
}));
const mockMaintenanceRecommendationsUseQuery = vi.fn(() => ({
  data: [],
  isLoading: false,
}));
const makeQuery = (data: any = []) => ({ data, isLoading: false });
const makeMutation = () => ({ mutateAsync: vi.fn(), isPending: false });

vi.mock("wouter", () => ({
  useLocation: () => [mockLocation, mockSetLocation],
  useSearch: (...args: any[]) => mockUseSearch(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isLoading: false,
    user: { role: "admin", id: 1 },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    skills: new Proxy(
      {
        listFromDb: { useQuery: (...args: any[]) => mockUseQuery(...args) },
        getCategories: { useQuery: () => makeQuery([]) },
        getVisionModels: { useQuery: () => makeQuery({ models: [] }) },
        getSkillGroups: { useQuery: () => makeQuery([]) },
        listPending: { useQuery: () => makeQuery([]) },
        listIscProposals: { useQuery: () => makeQuery({ proposals: [] }) },
        getIscProposalContent: { useQuery: () => makeQuery(null) },
        getUpgradeRecommendations: { useQuery: (...args: any[]) => mockMaintenanceRecommendationsUseQuery(...args) },
        getUpgradeRecommendationDetail: { useQuery: () => makeQuery(null) },
        listMaintenanceSchedules: { useQuery: () => makeQuery([]) },
        getLegacyUpgradeQueue: { useQuery: (...args: any[]) => mockLegacyUpgradeQueueUseQuery(...args) },
        getLegacyUpgradeQueueSummary: { useQuery: () => makeQuery({ count: 0 }) },
        scanFolders: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
        create: { useMutation: () => makeMutation() },
        update: { useMutation: () => makeMutation() },
        delete: { useMutation: () => makeMutation() },
        regenerateMarketplaceContent: { useMutation: () => makeMutation() },
        importFolder: { useMutation: () => makeMutation() },
        importZip: { useMutation: () => makeMutation() },
        dismissUpgradeRecommendation: { useMutation: () => makeMutation() },
        applyUpgradeRecommendation: { useMutation: () => makeMutation() },
        applyMaintenanceRecommendations: { useMutation: () => makeMutation() },
        runMaintenanceSweep: { useMutation: () => makeMutation() },
        createMaintenanceSchedule: { useMutation: () => makeMutation() },
        updateMaintenanceSchedule: { useMutation: () => makeMutation() },
        analyzeUpgrade: { useMutation: () => makeMutation() },
        applyIscProposal: { useMutation: () => makeMutation() },
        rejectSkill: { useMutation: () => makeMutation() },
        approveSkill: { useMutation: () => makeMutation() },
        shareWithGroups: { useMutation: () => makeMutation() },
        unshareGroup: { useMutation: () => makeMutation() },
      },
      {
        get: (target, prop) => {
          if (prop in target) return (target as any)[prop as keyof typeof target];
          return { useQuery: () => makeQuery([]), useMutation: () => makeMutation() };
        },
      },
    ),
    groups: {
      list: { useQuery: () => ({ data: [] }) },
    },
    llmProviders: {
      list: { useQuery: () => ({ data: [] }) },
    },
    mediaModels: {
      list: { useQuery: () => ({ data: [] }) },
    },
    sandbox: {
      getProfiles: { useQuery: () => ({ data: [] }) },
    },
    useUtils: () => ({
      skills: {
        listFromDb: { invalidate: vi.fn() },
        listPending: { invalidate: vi.fn() },
        listIscProposals: { invalidate: vi.fn() },
        getUpgradeRecommendations: { invalidate: vi.fn() },
      },
    }),
  },
}));

vi.mock("@/components/skills/SkillStudioDialog", () => ({
  SkillStudioDialog: () => null,
}));

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ children }: any) => createElement("div", null, children),
}));

vi.mock("@/components/chat/settings/SkillModelPreviewPanel", () => ({
  SkillModelPreviewPanel: () => null,
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => null,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => createElement("div", null, children),
  TabsContent: ({ children }: any) => createElement("div", null, children),
  TabsList: ({ children }: any) => createElement("div", null, children),
  TabsTrigger: ({ children, ...props }: any) => createElement("button", props, children),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: any) => createElement("div", null, children),
  DialogContent: ({ children }: any) => createElement("div", null, children),
  DialogDescription: ({ children }: any) => createElement("div", null, children),
  DialogFooter: ({ children }: any) => createElement("div", null, children),
  DialogHeader: ({ children }: any) => createElement("div", null, children),
  DialogTitle: ({ children }: any) => createElement("div", null, children),
}));

vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: any) => createElement("table", null, children),
  TableBody: ({ children }: any) => createElement("tbody", null, children),
  TableCell: ({ children }: any) => createElement("td", null, children),
  TableHead: ({ children }: any) => createElement("th", null, children),
  TableHeader: ({ children }: any) => createElement("thead", null, children),
  TableRow: ({ children }: any) => createElement("tr", null, children),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === "admin.skillsPage.title") return "Skills";
      if (key === "admin.skillsPage.subtitle") return "Manage skills";
      if (key === "admin.skillsPage.backToDashboard") return "Back";
      if (key === "admin.skillsPage.actions.skillStudio") return "Skill Studio";
      if (key === "admin.skillsPage.actions.importZip") return "Import ZIP";
      if (key === "admin.skillsPage.actions.createSkill") return "Create Skill";
      if (key === "admin.skillsPage.tabs.skills") return `Skills (${values?.count ?? 0})`;
      if (key === "admin.skillsPage.tabs.importFolders") return "Import";
      if (key === "admin.skillsPage.tabs.iscProposals") return "Proposals";
      if (key === "admin.skillsPage.tabs.maintenance") return "Maintenance";
      if (key === "admin.skillsPage.tabs.pendingApproval") return "Pending";
      return key;
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

describe("AdminSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = "/settings/skills?skillId=99";
    mockSearch = "?skillId=99";
    window.localStorage.clear();
    Object.assign(navigator, {
      clipboard: {
        writeText: mockClipboardWriteText,
      },
    });
    mockUseSearch.mockReturnValue("?skillId=99");
    mockUseQuery.mockReturnValue({
      data: [
        {
          id: 99,
          slug: "graph-assistant",
          name: "Graph Assistant",
          description: "Exported from agency.",
          category: "chat_assistant",
          version: "1.0.0",
          author: null,
          icon: "package",
          tags: [],
          folderPath: null,
          isAutoTrigger: false,
          triggerPatterns: [],
          isEnabled: true,
          enabledByDefault: true,
          visibleByDefault: true,
          creditMultiplier: 1,
          priority: 50,
          availableModels: null,
          defaultModel: null,
          llmModelId: null,
          preferredProviderId: null,
          strictProviderPin: false,
          systemPrompt: null,
          skillContent: null,
          knowledgebase: null,
          configJson: {
            source: "agency_export",
            sourceAgencyId: "agency-123",
            sourceAgencyName: "Ops Agency",
          },
          executionMode: "llm-only",
          sandboxProfileSlug: null,
          requiresNetwork: null,
          requiresBrowser: null,
          maxRuntimeSeconds: null,
          maxInputMb: null,
          importSource: "manual",
          importedFromZip: null,
          createdBy: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          visibility: "private",
          tenantId: null,
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null,
          ownerName: null,
        },
      ],
      isLoading: false,
    });
    mockLegacyUpgradeQueueUseQuery.mockReturnValue({
      data: [
        {
          id: 201,
          skillId: 99,
          status: "pending_review",
          upgradePriorityScore: 95,
          upgradePriorityTier: "critical",
          parallelUpgradeEligible: true,
          legacyUpgradeSignals: {
            hasRunScript: true,
            hasVerifyScript: true,
          },
        },
        {
          id: 202,
          skillId: 100,
          status: "pending_review",
          upgradePriorityScore: 72,
          upgradePriorityTier: "high",
          parallelUpgradeEligible: false,
          legacyUpgradeSignals: {
            hasRunScript: true,
            hasVerifyScript: false,
          },
        },
      ],
      isLoading: false,
    });
    mockMaintenanceRecommendationsUseQuery.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  it("opens a deep-linked exported skill and lets you jump back to the source graph", async () => {
    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getByText("Exported from Agency Builder")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Open source graph"));

    expect(mockSetLocation).toHaveBeenCalledWith("/agencies/agency-123/edit");
  });

  it("duplicates an exported skill back into the source graph with presets", async () => {
    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getByText("Duplicate from source graph")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Duplicate from source graph"));

    const params = new URLSearchParams({
      autoExport: "1",
      duplicateSkillName: "Graph Assistant",
      duplicateSkillDescription: "Exported from agency.",
      duplicateSkillCategory: "chat_assistant",
    });

    expect(mockSetLocation).toHaveBeenCalledWith(`/agencies/agency-123/edit?${params.toString()}`);
  });

  it("copies the duplicate permalink for an exported skill", async () => {
    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getByText("Copy duplicate link")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Copy duplicate link"));

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/agencies/agency-123/edit?autoExport=1&duplicateSkillName=Graph+Assistant&duplicateSkillDescription=Exported+from+agency.&duplicateSkillCategory=chat_assistant`,
    );
  });

  it("persists the legacy queue filter in the URL and shows priority badges on the maintenance tab", async () => {
    mockUseSearch.mockReturnValue("?skillId=99&legacyQueueFilter=high");

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getByText("High 1")).toBeTruthy();
      expect(screen.getByText("Critical 1")).toBeTruthy();
    });

    const allFilterButton = screen
      .getAllByRole("button", { name: /all/i })
      .find((button) => button.textContent?.startsWith("All"));

    expect(allFilterButton).toBeTruthy();
    fireEvent.click(allFilterButton!);

    expect(mockSetLocation).toHaveBeenCalledWith("/settings/skills?skillId=99");
  });

  it("restores the legacy queue filter from localStorage when the URL is missing it", async () => {
    window.localStorage.setItem("admin.skills.legacyQueueFilter", "critical");
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(mockLocation).toContain("legacyQueueFilter=critical");
      expect(screen.getByText("Loaded from saved preference")).toBeTruthy();
      expect(screen.getByText("Critical 1")).toBeTruthy();
    });
  });

  it("groups maintenance recommendations by skill and allows bulk applying them", async () => {
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");
    mockMaintenanceRecommendationsUseQuery.mockReturnValue({
      data: [
        {
          id: 301,
          skillId: 99,
          recommendationType: "native-bundle-upgrade",
          title: "Upgrade bundle",
          summary: null,
          status: "pending_review",
          riskLevel: "critical",
          compatibilityStatus: "blocked",
          qualityScore: 90,
          currentRuntime: "markdown-only",
          proposedRuntime: "agents_python",
          proposedAction: "migrate-to-native-bundle",
          isAutoApplySafe: false,
          isGenjsCandidate: false,
          recommendationJson: { affectedFiles: ["SKILL.md"] },
          analyzedAt: new Date(),
          updatedAt: new Date(),
          skill: {
            id: 99,
            slug: "graph-assistant",
            name: "Graph Assistant",
            category: "chat_assistant",
            executionMode: "llm-only",
            sandboxProfileSlug: null,
          },
        },
        {
          id: 302,
          skillId: 99,
          recommendationType: "tests-missing",
          title: "Add tests",
          summary: null,
          status: "pending_review",
          riskLevel: "medium",
          compatibilityStatus: "warning",
          qualityScore: 65,
          currentRuntime: "markdown-only",
          proposedRuntime: null,
          proposedAction: "add-tests",
          isAutoApplySafe: false,
          isGenjsCandidate: false,
          recommendationJson: { affectedFiles: ["tests"] },
          analyzedAt: new Date(),
          updatedAt: new Date(),
          skill: {
            id: 99,
            slug: "graph-assistant",
            name: "Graph Assistant",
            category: "chat_assistant",
            executionMode: "llm-only",
            sandboxProfileSlug: null,
          },
        },
        {
          id: 303,
          skillId: 99,
          recommendationType: "ui-schema-missing",
          title: "Add UI schema",
          summary: null,
          status: "pending_review",
          riskLevel: "low",
          compatibilityStatus: "compatible",
          qualityScore: 80,
          currentRuntime: "markdown-only",
          proposedRuntime: null,
          proposedAction: "add-ui-schema",
          isAutoApplySafe: true,
          isGenjsCandidate: false,
          recommendationJson: { affectedFiles: ["schemas/ui.schema.json"] },
          analyzedAt: new Date(),
          updatedAt: new Date(),
          skill: {
            id: 99,
            slug: "graph-assistant",
            name: "Graph Assistant",
            category: "chat_assistant",
            executionMode: "llm-only",
            sandboxProfileSlug: null,
          },
        },
      ],
      isLoading: false,
    });

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getAllByText("Graph Assistant").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /apply all \(3\)/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /apply eligible \(1\)/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /apply eligible across view \(1\)/i })).toBeTruthy();
      expect(screen.getByText("Highest priority")).toBeTruthy();
    });
  });
});
