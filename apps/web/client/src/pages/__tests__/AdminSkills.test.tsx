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
const mockRetryLegacyApplyRunsMutation = vi.fn();
const mockApplyLegacyUpgradeRecommendationsMutation = vi.fn();
const mockRecoverStaleLegacyApplyRunsMutation = vi.fn();

const mockUseQuery = vi.fn(() => ({
  data: [],
  isLoading: false,
}));
const mockLegacyUpgradeQueueUseQuery = vi.fn(() => ({
  data: [],
  isLoading: false,
}));
const mockNormalizeLegacyApplyRunsMutation = vi.fn();
const mockLegacyApplyRunsUseQuery = vi.fn(() => ({
  data: {
    counts: {
      total: 0,
      queued: 0,
      running: 0,
      failed: 0,
      completed: 0,
      blocked: 0,
      canceled: 0,
    },
    items: [],
  },
  isLoading: false,
}));
const mockMaintenanceRecommendationsUseQuery = vi.fn(() => ({
  data: [],
  isLoading: false,
}));
const mockRecommendationDetailUseQuery = vi.fn(() => ({
  data: null,
  isLoading: false,
}));
const makeQuery = (data: any = []) => ({ data, isLoading: false });
const makeMutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });

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
        getUpgradeRecommendationDetail: { useQuery: (...args: any[]) => mockRecommendationDetailUseQuery(...args) },
        listMaintenanceSchedules: { useQuery: () => makeQuery([]) },
        getLegacyUpgradeQueue: { useQuery: (...args: any[]) => mockLegacyUpgradeQueueUseQuery(...args) },
        getLegacyUpgradeQueueSummary: { useQuery: () => makeQuery({ count: 0 }) },
        getLegacyUpgradeApplyRuns: { useQuery: (...args: any[]) => mockLegacyApplyRunsUseQuery(...args) },
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
        applyLegacyUpgradeRecommendations: {
          useMutation: () => ({
            mutate: mockApplyLegacyUpgradeRecommendationsMutation,
            mutateAsync: vi.fn(),
            isPending: false,
          }),
        },
        retryLegacyUpgradeApplyRuns: { useMutation: () => ({ mutate: mockRetryLegacyApplyRunsMutation, mutateAsync: vi.fn(), isPending: false }) },
        normalizeLegacyUpgradeApplyRuns: { useMutation: () => ({ mutate: mockNormalizeLegacyApplyRunsMutation, mutateAsync: vi.fn(), isPending: false }) },
        recoverStaleLegacyUpgradeApplyRuns: { useMutation: () => ({ mutate: mockRecoverStaleLegacyApplyRunsMutation, mutateAsync: vi.fn(), isPending: false }) },
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
        getLegacyUpgradeQueue: { invalidate: vi.fn() },
        getLegacyUpgradeQueueSummary: { invalidate: vi.fn() },
        getLegacyUpgradeApplyRuns: { invalidate: vi.fn() },
        getUpgradeRecommendationDetail: { invalidate: vi.fn() },
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
      if (key === "admin.skillsPage.editDialog.exportedFromAgencyBuilder") return "Exported from Agency Builder";
      if (key === "admin.skillsPage.editDialog.openSourceGraph") return "Open source graph";
      if (key === "admin.skillsPage.editDialog.duplicateFromSourceGraph") return "Duplicate from source graph";
      if (key === "admin.skillsPage.editDialog.copyDuplicateLink") return "Copy duplicate link";
      if (key === "admin.skillsPage.legacyQueue.loadedFromPreference") return "Loaded from saved preference";
      if (key === "admin.skillsPage.legacyQueue.autopilot.title") return "Automatic backlog cleanup is active";
      if (key === "admin.skillsPage.legacyQueue.autopilot.description") return "The system queues every actionable pending upgrade automatically.";
      if (key === "admin.skillsPage.legacyQueue.autopilot.backlogCount") return `${values?.count ?? 0} actionable item(s)`;
      if (key === "admin.skillsPage.legacyQueue.autopilot.running") return "Queuing now";
      if (key === "admin.skillsPage.legacyQueue.autopilot.ready") return "Watching";
      if (key === "admin.skillsPage.legacyQueue.autopilot.more") return `+${values?.count ?? 0} more`;
      if (key === "admin.skillsPage.legacyQueue.autopilot.empty") return "No actionable backlog is left in this view.";
      if (key === "admin.skillsPage.legacyQueue.viewReasoning") return "View Reasoning";
      if (key === "admin.skillsPage.legacyQueue.filters.all") return "All";
      if (key === "admin.skillsPage.legacyQueue.filters.critical") return "Critical";
      if (key === "admin.skillsPage.legacyQueue.filters.high") return "High";
      if (key === "admin.skillsPage.legacyQueue.filters.parallel") return "Parallel";
      if (key === "admin.skillsPage.legacyQueue.filters.eligible") return "Eligible";
      if (key === "admin.skillsPage.legacyQueue.headers.nextAction") return "Next step";
      if (key === "admin.skillsPage.legacyQueue.noActionNeeded") return "No action needed";
      if (key === "admin.skillsPage.legacyQueue.nextAction.wait.label") return "Wait for current run";
      if (key === "admin.skillsPage.legacyQueue.nextAction.wait.description") return "The latest apply run is still queued or running. Refresh before starting another action.";
      if (key === "admin.skillsPage.legacyQueue.nextAction.noChange.label") return "No action needed";
      if (key === "admin.skillsPage.legacyQueue.nextAction.noChange.description") return "The latest run produced no patch or code change. Leave this item as history unless you want to inspect details.";
      if (key === "admin.skillsPage.legacyQueue.nextAction.proposalReady.label") return "Review generated proposal";
      if (key === "admin.skillsPage.legacyQueue.nextAction.proposalReady.description") return "The system already generated a proposal for this item. Review the proposal queue instead of starting another run.";
      if (key === "admin.skillsPage.legacyQueue.nextAction.done.label") return "Done";
      if (key === "admin.skillsPage.legacyQueue.nextAction.done.description") return "This recommendation has already been applied.";
      if (key === "admin.skillsPage.legacyQueue.nextAction.retry.label") return "Inspect, then retry";
      if (key === "admin.skillsPage.legacyQueue.nextAction.retry.description") return "Read the failure reason. If it is still valid after the fix, rerun this recommendation.";
      if (key === "admin.skillsPage.legacyQueue.nextAction.apply.label") return "Apply upgrade";
      if (key === "admin.skillsPage.legacyQueue.nextAction.apply.description") return "This item is approved and marked safe for direct apply.";
      if (key === "admin.skillsPage.legacyQueue.nextAction.generate.label") return "Generate proposal";
      if (key === "admin.skillsPage.legacyQueue.nextAction.generate.description") return "This item is approved but not auto-safe. Generate an ISC proposal and review it before applying.";
      if (key === "admin.skillsPage.legacyQueue.nextAction.review.label") return "Review advice";
      if (key === "admin.skillsPage.legacyQueue.nextAction.review.description") return "Open the advice first, then approve or select the item when ready.";
      if (key === "admin.skillsPage.legacyQueue.stats.blocked") return "Blocked";
      if (key === "admin.skillsPage.legacyQueue.stats.failed") return "Failed";
      if (key === "admin.skillsPage.legacyQueue.summary.blocked") return `${values?.count ?? 0} blocked`;
      if (key === "admin.skillsPage.legacyQueue.summary.failed") return `${values?.count ?? 0} failed`;
      if (key === "admin.skillsPage.legacyQueue.outcomeSummary") return "Outcome";
      if (key === "admin.skillsPage.legacyQueue.latestRun") return "Latest run";
      if (key === "admin.skillsPage.legacyQueue.blockedStatus") return "Blocked";
      if (key === "admin.skillsPage.legacyQueue.failedStatus") return "Failed";
      if (key === "admin.skillsPage.legacyQueue.appliedStatus") return "Applied";
      if (key === "admin.skillsPage.legacyQueue.approvedStatus") return "Approved";
      if (key === "admin.skillsPage.legacyQueue.blockedReasonLabel") return "Blocked reason";
      if (key === "admin.skillsPage.legacyQueue.failedReasonLabel") return "Failure reason";
      if (key === "admin.skillsPage.legacyQueue.blockedReasonFallback") return "The compatibility gate blocked this upgrade.";
      if (key === "admin.skillsPage.legacyQueue.failedReasonFallback") return "The upgrade attempt failed.";
      if (key === "admin.skillsPage.legacyQueue.appliedReasonFallback") return "The upgrade was applied successfully.";
      if (key === "admin.skillsPage.legacyQueue.approvedReasonFallback") return "The recommendation is approved and waiting for execution.";
      if (key === "admin.skillsPage.legacyQueue.noReason") return "No detailed reason was recorded.";
      if (key === "admin.skillsPage.legacyQueue.reasoningTitle") return "Legacy Upgrade Reasoning";
      if (key === "admin.skillsPage.legacyQueue.reasoningFocus") return "Reasoning focus";
      if (key === "admin.skillsPage.legacyQueue.lineageTitle") return "Lineage";
      if (key === "admin.skillsPage.legacyRunQueue.title") return "Queued Apply Runs";
      if (key === "admin.skillsPage.legacyRunQueue.description") return "Monitor apply runs, queued tasks, and failure reasons directly from the latest run records.";
      if (key === "admin.skillsPage.legacyRunQueue.autopilot.title") return "Automatic recovery is active";
      if (key === "admin.skillsPage.legacyRunQueue.autopilot.description") return "The system fixes safe maintenance states automatically: no-change runs are normalized, and known workspace-root failures are retried after the path fix.";
      if (key === "admin.skillsPage.legacyRunQueue.autopilot.normalizeCount") return `${values?.count ?? 0} no-change fix(es)`;
      if (key === "admin.skillsPage.legacyRunQueue.autopilot.retryCount") return `${values?.count ?? 0} path retry item(s)`;
      if (key === "admin.skillsPage.legacyRunQueue.autopilot.staleCount") return `${values?.count ?? 0} stale item(s)`;
      if (key === "admin.skillsPage.legacyRunQueue.autopilot.running") return "Repairing";
      if (key === "admin.skillsPage.legacyRunQueue.refresh") return "Refresh Run Monitor";
      if (key === "admin.skillsPage.legacyRunQueue.refreshing") return "Refreshing...";
      if (key === "admin.skillsPage.legacyRunQueue.empty") return "No apply runs match this filter yet.";
      if (key === "admin.skillsPage.legacyRunQueue.emptyQueued") return "No queued apply runs are waiting right now.";
      if (key === "admin.skillsPage.legacyRunQueue.loading") return "Loading apply runs...";
      if (key === "admin.skillsPage.legacyRunQueue.filters.all") return "All";
      if (key === "admin.skillsPage.legacyRunQueue.filters.queued") return "Queued";
      if (key === "admin.skillsPage.legacyRunQueue.filters.failed") return "Failed";
      if (key === "admin.skillsPage.legacyRunQueue.filters.completed") return "Completed";
      if (key === "admin.skillsPage.legacyRunQueue.filters.blocked") return "Blocked";
      if (key === "admin.skillsPage.legacyRunQueue.filters.canceled") return "Canceled";
      if (key === "admin.skillsPage.legacyRunQueue.summary.total") return "Total";
      if (key === "admin.skillsPage.legacyRunQueue.summary.queued") return "Queued";
      if (key === "admin.skillsPage.legacyRunQueue.summary.failed") return "Failed";
      if (key === "admin.skillsPage.legacyRunQueue.summary.blocked") return "Blocked";
      if (key === "admin.skillsPage.legacyRunQueue.summary.completed") return "Completed";
      if (key === "admin.skillsPage.legacyRunQueue.summary.canceled") return "Canceled";
      if (key === "admin.skillsPage.legacyRunQueue.summary.visible") return `${values?.count ?? 0} visible`;
      if (key === "admin.skillsPage.legacyRunQueue.summary.taskIds") return `${values?.count ?? 0} with task IDs`;
      if (key === "admin.skillsPage.legacyRunQueue.summary.withError") return `${values?.count ?? 0} with errors`;
      if (key === "admin.skillsPage.legacyRunQueue.headers.skill") return "Skill";
      if (key === "admin.skillsPage.legacyRunQueue.headers.time") return "Date & time";
      if (key === "admin.skillsPage.legacyRunQueue.headers.task") return "Task";
      if (key === "admin.skillsPage.legacyRunQueue.headers.status") return "Status";
      if (key === "admin.skillsPage.legacyRunQueue.headers.result") return "Result";
      if (key === "admin.skillsPage.legacyRunQueue.headers.actions") return "Actions";
      if (key === "admin.skillsPage.legacyRunQueue.time.updated") return "Updated";
      if (key === "admin.skillsPage.legacyRunQueue.time.started") return "Started";
      if (key === "admin.skillsPage.legacyRunQueue.latestRun") return "Latest run";
      if (key === "admin.skillsPage.legacyRunQueue.noTaskId") return "No task ID recorded";
      if (key === "admin.skillsPage.legacyRunQueue.noSummary") return "No summary recorded";
      if (key === "admin.skillsPage.legacyRunQueue.errorMessageLabel") return "Error message";
      if (key === "admin.skillsPage.legacyRunQueue.viewAdvice") return "View Advice";
      if (key === "admin.skillsPage.legacyRunQueue.viewReasoning") return "View Reasoning";
      if (key === "admin.skillsPage.legacyRunQueue.openDetail") return "Open Detail";
      if (key === "admin.skillsPage.legacyRunQueue.applyStrategy") return `Strategy: ${values?.strategy ?? ""}`;
      if (key === "admin.skillsPage.legacyRunQueue.status.queued") return "Queued";
      if (key === "admin.skillsPage.legacyRunQueue.status.running") return "Running";
      if (key === "admin.skillsPage.legacyRunQueue.status.failed") return "Failed";
      if (key === "admin.skillsPage.legacyRunQueue.status.completed") return "Completed";
      if (key === "admin.skillsPage.legacyRunQueue.status.blocked") return "Blocked";
      if (key === "admin.skillsPage.legacyRunQueue.status.canceled") return "Canceled";
      if (key === "admin.skillsPage.legacyRunQueue.retry") return "Retry";
      if (key === "admin.skillsPage.legacyRunQueue.retrying") return "Retrying...";
      if (key === "admin.skillsPage.legacyRunQueue.retryFailed") return `Retry failed (${values?.count ?? 0})`;
      if (key === "admin.skillsPage.legacyRunQueue.normalizeNoChange") return "Normalize no-change";
      if (key === "admin.skillsPage.legacyRunQueue.normalizeNoChangePending") return "Normalizing...";
      if (key === "admin.skillsPage.legacyRunQueue.normalizeNoChangeTitle") return "No-change failures normalized";
      if (key === "admin.skillsPage.legacyRunQueue.normalizeNoChangeDescription") return `${values?.count ?? 0} run(s) normalized after scanning ${values?.scanned ?? 0} run(s).`;
      if (key === "admin.skillsPage.legacyRunQueue.normalizeNoChangeFailedTitle") return "Normalization failed";
      if (key === "admin.skillsPage.legacyRunQueue.normalizeNoChangeFailedDescription") return "Failed to normalize legacy apply runs.";
      if (key === "admin.skillsPage.legacyRunQueue.recoverStale") return `Recover stale runs (${values?.count ?? 0})`;
      if (key === "admin.skillsPage.legacyRunQueue.recoverStalePending") return "Recovering stale runs...";
      if (key === "admin.skillsPage.legacyRunQueue.recoverStaleTitle") return "Stale runs recovered";
      if (key === "admin.skillsPage.legacyRunQueue.recoverStaleDescription") return `${values?.recovered ?? 0} recovered, ${values?.retried ?? 0} retried.`;
      if (key === "admin.skillsPage.legacyRunQueue.recoverStaleFailedTitle") return "Stale recovery failed";
      if (key === "admin.skillsPage.legacyRunQueue.recoverStaleFailedDescription") return "Failed to recover stale legacy apply runs.";
      if (key === "admin.skillsPage.legacyRunQueue.resolvedModel") return "Resolved model";
      if (key === "admin.skillsPage.legacyRunQueue.resultMessage") return "Result message";
      if (key === "admin.skillsPage.legacyRunQueue.resultError") return "Result error";
      if (key === "admin.skillsPage.legacyRunQueue.sourceRun") return "Source run";
      if (key === "admin.skillsPage.legacyRunQueue.retryReason") return "Retry reason";
      if (key === "admin.skillsPage.legacyRunQueue.noModel") return "No model recorded";
      if (key === "admin.skillsPage.legacyRunQueue.noResultError") return "No error recorded";
      if (key === "admin.skillsPage.legacyRunQueue.noSourceRun") return "No source run recorded";
      if (key === "admin.skillsPage.legacyRunQueue.noRetryReason") return "No retry reason recorded";
      if (key === "admin.skillsPage.legacyRunQueue.roles.orchestrator") return "Orchestrator";
      if (key === "admin.skillsPage.legacyRunQueue.roles.child") return "Child subagent";
      if (key === "admin.skillsPage.legacyRunQueue.roles.handoff") return "Handoff";
      if (key === "admin.skillsPage.legacyRunQueue.failureScopes.orchestrator") return "Orchestrator failure";
      if (key === "admin.skillsPage.legacyRunQueue.failureScopes.child") return "Child subagent failure";
      if (key === "admin.skillsPage.legacyRunQueue.failureScopes.handoff") return "Handoff failure";
      if (key === "admin.skillsPage.legacyRunQueue.lineage.role") return "Role";
      if (key === "admin.skillsPage.legacyRunQueue.lineage.failureScope") return "Failure scope";
      if (key === "admin.skillsPage.legacyRunQueue.lineage.parentRun") return "Parent run";
      if (key === "admin.skillsPage.legacyRunQueue.lineage.childRuns") return "Child runs";
      if (key === "admin.skillsPage.legacyRunQueue.lineage.checkpoint") return "Checkpoint";
      if (key === "admin.skillsPage.legacyRunQueue.lineage.verification") return "Verification";
      if (key === "admin.skillsPage.legacyRunQueue.lineage.artifactRefs") return "Artifact refs";
      if (key === "admin.skillsPage.legacyRunQueue.lineage.resumeCursor") return "Resume cursor";
      if (key === "admin.skillsPage.legacyRunQueue.diagnostics.workspaceRootIssue") return "Workspace root issue";
      if (key === "admin.skillsPage.legacyRunQueue.diagnostics.workspaceRootIssueDescription") return "This run launched from a copied ISC workspace. Retry after the path fix is deployed.";
      if (key === "admin.skillsPage.legacyRunQueue.diagnostics.workspaceRoot") return "Workspace root";
      if (key === "admin.skillsPage.legacyRunQueue.diagnostics.proposalRoot") return "Proposal root";
      if (key === "admin.skillsPage.legacyRunQueue.diagnostics.entrypointRoot") return "Entrypoint root";
      if (key === "admin.skillsPage.legacyRunQueue.diagnostics.canonicalIscRoot") return "Canonical ISC root";
      if (key === "admin.skillsPage.legacyRunQueue.summary.running") return "Running";
      if (key === "admin.skillsPage.legacyRunQueue.filters.running") return "Running";
      if (key === "admin.skillsPage.maintenance.applyAll") return `Apply all (${values?.count ?? 0})`;
      if (key === "admin.skillsPage.maintenance.applyEligible") return `Apply eligible (${values?.count ?? 0})`;
      if (key === "admin.skillsPage.maintenance.applyEligibleAcrossView") return `Apply eligible across view (${values?.count ?? 0})`;
      if (key === "admin.skillsPage.maintenance.highestPriority") return "Highest priority";
      if (key === "admin.skillsPage.maintenance.headers.status") return "Status";
      if (key === "admin.skillsPage.maintenance.headers.updated") return "Last analyzed";
      if (key === "admin.skillsPage.maintenance.timestamps.none") return "No timestamp";
      if (key === "admin.skillsPage.maintenance.timestamps.unknownAge") return "Unknown age";
      if (key === "admin.skillsPage.maintenance.timestamps.updated") return "Updated";
      if (key === "admin.skillsPage.maintenance.overview.pendingSkills") return "Skills pending review";
      if (key === "admin.skillsPage.maintenance.overview.pendingSkillsHelp") return "Skill groups with pending or approved maintenance advice.";
      if (key === "admin.skillsPage.maintenance.overview.pendingRecommendations") return "Safe actions ready";
      if (key === "admin.skillsPage.maintenance.overview.eligibleHelp") return "Auto-safe recommendations visible in this view.";
      if (key === "admin.skillsPage.maintenance.overview.runningApply") return "Queued or running";
      if (key === "admin.skillsPage.maintenance.overview.runningApplyHelp") return "Apply runs that are not finished yet.";
      if (key === "admin.skillsPage.maintenance.overview.needsAttention") return "Needs attention";
      if (key === "admin.skillsPage.maintenance.overview.needsAttentionHelp") return "Failed, blocked, or incompatible maintenance items.";
      if (key === "admin.skillsPage.maintenance.overview.latestActivity") return "Latest activity";
      if (key === "admin.skillsPage.maintenance.status.pendingReview") return "Pending Review";
      if (key === "admin.skillsPage.maintenance.status.applied") return "Applied";
      if (key === "admin.skillsPage.maintenance.status.blocked") return "Blocked";
      if (key === "admin.skillsPage.maintenance.status.failed") return "Failed";
      if (key === "admin.skillsPage.maintenance.status.dismissed") return "Dismissed";
      if (key === "admin.skillsPage.maintenance.status.approved") return "Approved";
      if (key === "admin.skillsPage.maintenance.status.unknown") return "Unknown";
      if (key === "admin.skillsPage.maintenance.runStatus.queued") return "Queued";
      if (key === "admin.skillsPage.maintenance.runStatus.running") return "Running";
      if (key === "admin.skillsPage.maintenance.runStatus.completed") return "Completed";
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
    mockRecommendationDetailUseQuery.mockImplementation(() => ({
      data: null,
      isLoading: false,
    }));
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
    mockLegacyApplyRunsUseQuery.mockReturnValue({
      data: {
        counts: {
          total: 0,
          queued: 0,
          failed: 0,
          completed: 0,
          blocked: 0,
          canceled: 0,
        },
        items: [],
      },
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

    expect(mockSetLocation).toHaveBeenCalledWith("/settings/skills?skillId=99&legacyQueueFilter=high");
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

  it("automatically queues actionable legacy upgrade backlog on the maintenance tab", async () => {
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getByText("Automatic backlog cleanup is active")).toBeTruthy();
      expect(mockApplyLegacyUpgradeRecommendationsMutation).toHaveBeenCalledWith({
        recommendationIds: [201, 202],
      });
    });
  });

  it("hides completed proposal history from the legacy upgrade monitor by default", async () => {
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");
    mockLegacyUpgradeQueueUseQuery.mockReturnValue({
      data: [
        {
          id: 301,
          skillId: 99,
          status: "approved",
          title: "Proposal generated",
          recommendationType: "native-bundle-upgrade",
          upgradePriorityScore: 95,
          upgradePriorityTier: "critical",
          parallelUpgradeEligible: true,
          legacyUpgradeSignals: { hasRunScript: true },
          latestRun: {
            id: 9301,
            runType: "apply",
            status: "completed",
            summary: "Proposal generated and ready for admin review",
            errorMessage: null,
            verificationJson: {},
            logsJson: { applyStrategy: "proposal" },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
          },
          skill: { id: 99, slug: "proposal-ready", name: "Proposal Ready" },
        },
        {
          id: 302,
          skillId: 100,
          status: "pending_review",
          title: "Still pending",
          recommendationType: "native-bundle-upgrade",
          upgradePriorityScore: 90,
          upgradePriorityTier: "high",
          parallelUpgradeEligible: true,
          legacyUpgradeSignals: { hasRunScript: false },
          latestRun: null,
          skill: { id: 100, slug: "still-pending", name: "Still Pending" },
        },
      ],
      isLoading: false,
    });

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.queryByText("Proposal Ready")).toBeNull();
      expect(screen.getAllByText("Still Pending").length).toBeGreaterThan(0);
      expect(mockApplyLegacyUpgradeRecommendationsMutation).toHaveBeenCalledWith({
        recommendationIds: [302],
      });
    });
  });

  it("automatically normalizes no-change legacy apply runs", async () => {
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");
    mockLegacyApplyRunsUseQuery.mockReturnValue({
      data: {
        counts: {
          total: 1,
          queued: 0,
          running: 0,
          failed: 1,
          completed: 0,
          blocked: 0,
          canceled: 0,
        },
        items: [
          {
            id: 901,
            skillId: 99,
            queueState: "failed",
            taskId: "task-901",
            latestRun: {
              id: 901,
              runType: "apply",
              status: "failed",
              summary: "ISC improve complete — no patches generated",
              errorMessage: "Unknown proposal generation error",
              logsJson: {
                completionMode: "no_changes",
                resultMessage: "ISC improve complete — no patches generated",
                resultError: "Unknown proposal generation error",
              },
            },
            resultMessage: "ISC improve complete — no patches generated",
            resultError: "Unknown proposal generation error",
            recommendation: null,
            skill: {
              id: 99,
              slug: "graph-assistant",
              name: "Graph Assistant",
              executionMode: "markdown-only",
            },
          },
        ],
      },
      isLoading: false,
    });

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getByText("Automatic recovery is active")).toBeTruthy();
      expect(screen.getByText("Normalize no-change")).toBeTruthy();
      expect(mockNormalizeLegacyApplyRunsMutation).toHaveBeenCalledTimes(1);
    });
  });

  it("shows clear reasons for blocked and failed legacy upgrades", async () => {
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");
    mockLegacyUpgradeQueueUseQuery.mockReturnValue({
      data: [
        {
          id: 401,
          skillId: 99,
          status: "blocked",
          upgradePriorityScore: 88,
          upgradePriorityTier: "critical",
          parallelUpgradeEligible: false,
          legacyUpgradeSignals: { hasRunScript: true, hasVerifyScript: false },
          latestRun: {
            id: 501,
            runType: "apply",
            status: "failed",
            summary: "Compatibility gate blocked this upgrade.",
            errorMessage: "Missing verify.sh required for native bundle contract.",
            verificationJson: {
              status: "blocked",
              issues: [{ message: "Missing verify.sh required for native bundle contract." }],
            },
            logsJson: {
              lineage: {
                role: "orchestrator",
                parentRunId: null,
                childRunIds: ["502"],
                checkpointVersion: 2,
                verificationState: "blocked",
                artifactRefs: ["logs/phase_verify.md"],
                resumeCursor: "resume-verify",
              },
            },
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        {
          id: 402,
          skillId: 100,
          status: "failed",
          upgradePriorityScore: 70,
          upgradePriorityTier: "high",
          parallelUpgradeEligible: false,
          legacyUpgradeSignals: { hasRunScript: true, hasVerifyScript: true },
          latestRun: {
            id: 502,
            runType: "apply",
            status: "failed",
            summary: "Upgrade task failed for skill-100",
            errorMessage: "Skill Studio returned an error while generating the proposal.",
            verificationJson: {},
            logsJson: {},
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ],
      isLoading: false,
    });

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getByText("Blocked reason:")).toBeTruthy();
      expect(screen.getAllByText("Missing verify.sh required for native bundle contract.").length).toBeGreaterThan(0);
      expect(screen.getByText("Failure reason:")).toBeTruthy();
      expect(screen.getAllByText("Skill Studio returned an error while generating the proposal.").length).toBeGreaterThan(0);
      expect(screen.getByText("Lineage")).toBeTruthy();
      expect(screen.getAllByText(/Orchestrator failure/i).length).toBeGreaterThan(0);
    });
  });

  it("hides approved legacy upgrades that already produced no code changes", async () => {
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");
    mockLegacyUpgradeQueueUseQuery.mockReturnValue({
      data: [
        {
          id: 601,
          skillId: 99,
          recommendationType: "native-bundle-upgrade",
          title: "Upgrade native bundle",
          summary: null,
          status: "approved",
          riskLevel: "critical",
          compatibilityStatus: "compatible",
          qualityScore: 100,
          currentRuntime: "markdown-only",
          proposedRuntime: "agents_python",
          proposedAction: "upgrade",
          isAutoApplySafe: false,
          isGenjsCandidate: false,
          recommendationJson: {},
          analyzedAt: new Date(),
          updatedAt: new Date(),
          upgradePriorityScore: 100,
          upgradePriorityTier: "critical",
          parallelUpgradeEligible: true,
          legacyUpgradeSignals: { hasTests: true },
          latestRun: {
            id: 61,
            runType: "apply",
            status: "completed",
            summary: "Proposal generation completed without code changes",
            errorMessage: null,
            verificationJson: {},
            logsJson: {
              resultMessage: "No patches generated",
              completionMode: "no_changes",
            },
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          skill: {
            id: 99,
            slug: "unified-payin-slip-parser",
            name: "unified-payin-slip-parser",
            category: "document_processing",
            executionMode: "markdown-only",
            sandboxProfileSlug: null,
          },
        },
      ],
      isLoading: false,
    });

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getByText("Next step")).toBeTruthy();
      expect(screen.queryByText("unified-payin-slip-parser")).toBeNull();
      expect(screen.queryByText("No action needed")).toBeNull();
      expect(mockApplyLegacyUpgradeRecommendationsMutation).not.toHaveBeenCalled();
    });
  });

  it("automatically recovers stale running legacy apply runs", async () => {
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");
    const staleTime = new Date(Date.now() - 61 * 60 * 1000).toISOString();
    mockLegacyApplyRunsUseQuery.mockReturnValue({
      data: {
        counts: {
          total: 1,
          queued: 0,
          running: 1,
          failed: 0,
          completed: 0,
          blocked: 0,
          canceled: 0,
        },
        items: [
          {
            id: 981,
            recommendationId: 401,
            skillId: 99,
            runType: "apply",
            status: "running",
            summary: "Upgrade task queued for graph-assistant",
            errorMessage: null,
            verificationJson: {},
            logsJson: { taskId: "task-stale-981", applyStrategy: "proposal" },
            startedAt: staleTime,
            endedAt: null,
            createdAt: staleTime,
            updatedAt: staleTime,
            queueState: "running",
            taskId: "task-stale-981",
            resolvedLlmModelId: "gpt-4o-mini",
            resultMessage: "Upgrade task queued for graph-assistant",
            resultError: null,
            sourceRunId: null,
            retryReason: null,
            latestRun: {
              id: 981,
              runType: "apply",
              status: "running",
              summary: "Upgrade task queued for graph-assistant",
              errorMessage: null,
              verificationJson: {},
              logsJson: { taskId: "task-stale-981", applyStrategy: "proposal" },
              startedAt: staleTime,
              endedAt: null,
              createdAt: staleTime,
              updatedAt: staleTime,
            },
            recommendation: {
              id: 401,
              recommendationType: "native-bundle-upgrade",
              status: "approved",
              title: "Upgrade bundle",
              riskLevel: "high",
              compatibilityStatus: "warning",
              qualityScore: 80,
              currentRuntime: "markdown-only",
              proposedRuntime: "native-bundle",
              proposedAction: "upgrade",
              isAutoApplySafe: false,
              recommendationJson: {},
            },
            skill: {
              id: 99,
              slug: "graph-assistant",
              name: "Graph Assistant",
              executionMode: "markdown-only",
            },
          },
        ],
      },
      isLoading: false,
      isFetching: false,
    });

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(mockRecoverStaleLegacyApplyRunsMutation).toHaveBeenCalledWith({
        runIds: [981],
      });
    });
  });

  it("shows queued apply runs with task ids and failure messages", async () => {
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");
    mockLegacyApplyRunsUseQuery.mockReturnValue({
      data: {
        counts: {
          total: 2,
          queued: 0,
          running: 1,
          failed: 1,
          completed: 0,
          blocked: 0,
          canceled: 0,
        },
        items: [
          {
            id: 701,
            recommendationId: 201,
            skillId: 99,
            runType: "apply",
            status: "running",
            summary: "Queued for execution",
            errorMessage: null,
            verificationJson: {},
            logsJson: {
              taskId: "task-queue-123",
              applyStrategy: "proposal",
              resolvedLlmModelId: "test-default-llm",
              lineage: {
                role: "orchestrator",
                parentRunId: null,
                childRunIds: ["702"],
                checkpointVersion: 4,
                verificationState: "running",
                artifactRefs: ["out/plan.md"],
                resumeCursor: "resume-plan",
              },
            },
            startedAt: new Date().toISOString(),
            endedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            queueState: "running",
            taskId: "task-queue-123",
            resolvedLlmModelId: "test-default-llm",
            resultMessage: null,
            resultError: null,
            sourceRunId: null,
            retryReason: null,
            latestRun: {
              id: 701,
              runType: "apply",
              status: "running",
              summary: "Queued for execution",
              errorMessage: null,
              verificationJson: {},
              logsJson: {
                taskId: "task-queue-123",
                applyStrategy: "proposal",
                resolvedLlmModelId: "test-default-llm",
                lineage: {
                  role: "orchestrator",
                  parentRunId: null,
                  childRunIds: ["702"],
                  checkpointVersion: 4,
                  verificationState: "running",
                  artifactRefs: ["out/plan.md"],
                  resumeCursor: "resume-plan",
                },
              },
              startedAt: new Date().toISOString(),
              endedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            recommendation: {
              id: 201,
              recommendationType: "native-bundle-upgrade",
              status: "approved",
              title: "Upgrade bundle",
              riskLevel: "critical",
              compatibilityStatus: "blocked",
              qualityScore: 88,
              currentRuntime: "markdown-only",
              proposedRuntime: "native-bundle",
              proposedAction: "upgrade",
              isAutoApplySafe: false,
              recommendationJson: {},
            },
            skill: {
              id: 99,
              slug: "graph-assistant",
              name: "Graph Assistant",
              executionMode: "markdown-only",
            },
          },
          {
            id: 702,
            recommendationId: 202,
            skillId: 100,
            runType: "apply",
            status: "failed",
            summary: "Proposal generation failed",
            errorMessage: "Unknown proposal generation error",
            verificationJson: {},
            logsJson: {
              resultError: "Unknown proposal generation error",
              lineage: {
                role: "child",
                parentRunId: "701",
                childRunIds: [],
                checkpointVersion: 5,
                verificationState: "failed",
                artifactRefs: ["logs/phase_verify.md"],
                resumeCursor: "resume-verify",
              },
            },
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            queueState: "failed",
            taskId: null,
            resolvedLlmModelId: null,
            resultMessage: null,
            resultError: "Unknown proposal generation error",
            sourceRunId: 701,
            retryReason: "Retry from apply run 701",
            latestRun: {
              id: 702,
              runType: "apply",
              status: "failed",
              summary: "Proposal generation failed",
              errorMessage: "Unknown proposal generation error",
              verificationJson: {},
              logsJson: {
                resultError: "Unknown proposal generation error",
                lineage: {
                  role: "child",
                  parentRunId: "701",
                  childRunIds: [],
                  checkpointVersion: 5,
                  verificationState: "failed",
                  artifactRefs: ["logs/phase_verify.md"],
                  resumeCursor: "resume-verify",
                },
              },
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            recommendation: {
              id: 202,
              recommendationType: "native-bundle-upgrade",
              status: "failed",
              title: "Upgrade bundle",
              riskLevel: "high",
              compatibilityStatus: "warning",
              qualityScore: 70,
              currentRuntime: "markdown-only",
              proposedRuntime: "native-bundle",
              proposedAction: "upgrade",
              isAutoApplySafe: false,
              recommendationJson: {},
            },
            skill: {
              id: 100,
              slug: "failure-skill",
              name: "Failure Skill",
              executionMode: "python",
            },
          },
        ],
      },
      isLoading: false,
    });

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getByText("Refresh Run Monitor")).toBeTruthy();
      expect(screen.getByText("2 visible")).toBeTruthy();
      expect(screen.getByText("task-queue-123")).toBeTruthy();
      expect(screen.getByText("Unknown proposal generation error")).toBeTruthy();
      expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
      expect(screen.getByText(/Resolved model/i)).toBeTruthy();
      expect(screen.getByText(/test-default-llm/i)).toBeTruthy();
      expect(screen.getAllByText(/Role: Orchestrator/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Role: Child subagent/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Failure scope: Orchestrator failure/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Failure scope: Child subagent failure/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Date & time")).toBeTruthy();
      expect(screen.getAllByText(/Updated:/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Retry")).toBeTruthy();
    });
  });

  it("distinguishes workspace-root apply failures from no-change normalization candidates", async () => {
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");
    mockLegacyApplyRunsUseQuery.mockReturnValue({
      data: {
        counts: {
          total: 1,
          queued: 0,
          running: 0,
          failed: 1,
          completed: 0,
          blocked: 0,
          canceled: 0,
        },
        items: [
          {
            id: 801,
            recommendationId: 301,
            skillId: 99,
            runType: "apply",
            status: "failed",
            summary: "Proposal generation failed",
            errorMessage: "Improvement failed from copied workspace",
            verificationJson: {},
            logsJson: {
              failureCode: "isc_workspace_root_pollution",
              workspaceRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123",
              proposalRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/proposals/intelligence-skill-creator",
              entrypointRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123/skills/intelligence-skill-creator",
              canonicalIscRoot: "/repo/apps/web/skills/intelligence-skill-creator",
              resultError: "Improvement failed from copied workspace",
            },
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            queueState: "failed",
            taskId: null,
            resolvedLlmModelId: null,
            resultMessage: null,
            resultError: "Improvement failed from copied workspace",
            diagnosticCode: "isc_workspace_root_pollution",
            workspaceRootIssue: true,
            workspaceRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123",
            proposalRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/proposals/intelligence-skill-creator",
            entrypointRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123/skills/intelligence-skill-creator",
            canonicalIscRoot: "/repo/apps/web/skills/intelligence-skill-creator",
            sourceRunId: null,
            retryReason: null,
            latestRun: {
              id: 801,
              runType: "apply",
              status: "failed",
              summary: "Proposal generation failed",
              errorMessage: "Improvement failed from copied workspace",
              verificationJson: {},
              logsJson: {
                failureCode: "isc_workspace_root_pollution",
                workspaceRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123",
                proposalRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/proposals/intelligence-skill-creator",
                entrypointRoot: "/repo/apps/web/skills/intelligence-skill-creator/runs/workspaces/demo/123/skills/intelligence-skill-creator",
                canonicalIscRoot: "/repo/apps/web/skills/intelligence-skill-creator",
              },
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            recommendation: {
              id: 301,
              recommendationType: "migrate-to-genjs",
              status: "failed",
              title: "Upgrade ISC",
              riskLevel: "high",
              compatibilityStatus: "warning",
              qualityScore: 70,
              currentRuntime: "python",
              proposedRuntime: "native-bundle",
              proposedAction: "migrate-to-genjs",
              isAutoApplySafe: false,
              recommendationJson: {},
            },
            skill: {
              id: 99,
              slug: "intelligence-skill-creator",
              name: "Intelligence Skill Creator",
              executionMode: "python",
            },
          },
        ],
      },
      isLoading: false,
    });

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getAllByText("Workspace root issue").length).toBeGreaterThan(0);
      expect(screen.getByText("Date & time")).toBeTruthy();
      expect(screen.getByText("Workspace root")).toBeTruthy();
      expect(screen.getAllByText(/runs\/workspaces\/demo\/123/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Retry")).toBeTruthy();
      expect(mockNormalizeLegacyApplyRunsMutation).not.toHaveBeenCalled();
      expect(mockRetryLegacyApplyRunsMutation).toHaveBeenCalledWith({ runIds: [801] });
    });
  });

  it("opens a dedicated run detail page from the queued apply runs monitor", async () => {
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");
    mockLegacyApplyRunsUseQuery.mockReturnValue({
      data: {
        counts: {
          total: 1,
          queued: 0,
          running: 1,
          failed: 0,
          completed: 0,
          blocked: 0,
          canceled: 0,
        },
        items: [
          {
            id: 901,
            recommendationId: 201,
            skillId: 99,
            runType: "apply",
            status: "running",
            summary: "Queued for execution",
            errorMessage: null,
            verificationJson: {},
            logsJson: { taskId: "task-detail-901", applyStrategy: "proposal" },
            startedAt: new Date().toISOString(),
            endedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            queueState: "running",
            taskId: "task-detail-901",
            resolvedLlmModelId: null,
            resultMessage: null,
            resultError: null,
            sourceRunId: null,
            retryReason: null,
            latestRun: {
              id: 901,
              runType: "apply",
              status: "running",
              summary: "Queued for execution",
              errorMessage: null,
              verificationJson: {},
              logsJson: { taskId: "task-detail-901", applyStrategy: "proposal" },
              startedAt: new Date().toISOString(),
              endedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            recommendation: {
              id: 201,
              recommendationType: "native-bundle-upgrade",
              status: "approved",
              title: "Upgrade bundle",
              riskLevel: "critical",
              compatibilityStatus: "blocked",
              qualityScore: 88,
              currentRuntime: "markdown-only",
              proposedRuntime: "native-bundle",
              proposedAction: "upgrade",
              isAutoApplySafe: false,
              recommendationJson: {},
            },
            skill: {
              id: 99,
              slug: "graph-assistant",
              name: "Graph Assistant",
              executionMode: "markdown-only",
            },
          },
        ],
      },
      isLoading: false,
    });

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open detail/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /open detail/i }));

    expect(mockSetLocation).toHaveBeenCalledWith("/admin/skills/runs/901");
  });

  it("opens a dedicated reasoning view for a legacy upgrade", async () => {
    mockUseSearch.mockReturnValue("?tab=maintenance&skillId=99");
    mockLegacyUpgradeQueueUseQuery.mockReturnValue({
      data: [
        {
          id: 201,
          skillId: 99,
          status: "blocked",
          upgradePriorityScore: 88,
          upgradePriorityTier: "critical",
          parallelUpgradeEligible: false,
          legacyUpgradeSignals: { hasRunScript: true, hasVerifyScript: false },
          latestRun: {
            id: 501,
            runType: "apply",
            status: "failed",
            summary: "Compatibility gate blocked this upgrade.",
            errorMessage: "Missing verify.sh required for native bundle contract.",
            verificationJson: {
              status: "blocked",
              issues: [{ message: "Missing verify.sh required for native bundle contract." }],
            },
            logsJson: {},
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ],
      isLoading: false,
    });
    mockRecommendationDetailUseQuery.mockImplementation((input: any) => {
      if (input?.recommendationId !== 201) {
        return { data: null, isLoading: false };
      }

      return {
        data: {
          recommendation: {
            id: 201,
            skillId: 99,
            recommendationType: "native-bundle-upgrade",
            title: "Upgrade bundle",
            summary: null,
            status: "blocked",
            riskLevel: "critical",
            compatibilityStatus: "blocked",
            qualityScore: 88,
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
          skill: {
            id: 99,
            slug: "graph-assistant",
            name: "Graph Assistant",
            category: "chat_assistant",
            executionMode: "llm-only",
            sandboxProfileSlug: null,
          },
          snapshots: [],
          runs: [
            {
              id: 501,
              runType: "apply",
              status: "failed",
              summary: "Compatibility gate blocked this upgrade.",
              errorMessage: "Missing verify.sh required for native bundle contract.",
              verificationJson: {
                status: "blocked",
                issues: [{ message: "Missing verify.sh required for native bundle contract." }],
              },
              logsJson: {},
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
        isLoading: false,
      };
    });

    const { default: AdminSkills } = await import("@/pages/AdminSkills");
    render(createElement(AdminSkills));

    await waitFor(() => {
      expect(screen.getAllByText("View Reasoning").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText("View Reasoning")[0].closest("button") as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText("Legacy Upgrade Reasoning")).toBeTruthy();
      expect(screen.getByText("Reasoning focus")).toBeTruthy();
      expect(screen.getByText("Blocked reason:")).toBeTruthy();
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
      expect(screen.getAllByText("Status").length).toBeGreaterThan(1);
      expect(screen.getByText("Pending Review (3)")).toBeTruthy();
      expect(screen.getByText("Skills pending review")).toBeTruthy();
      expect(screen.getByText("Safe actions ready")).toBeTruthy();
      expect(screen.getByText("Latest activity")).toBeTruthy();
      expect(screen.getByText("Last analyzed")).toBeTruthy();
    });
  });
});
