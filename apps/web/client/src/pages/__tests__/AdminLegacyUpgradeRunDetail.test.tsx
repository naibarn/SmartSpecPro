/**
 * @vitest-environment jsdom
 */

import { createElement } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetLocation = vi.fn();
const mockUseRoute = vi.fn(() => [true, { runId: "901" }]);
const mockRetryMutation = vi.fn();
const mockRefetch = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/skills/runs/901", mockSetLocation],
  useRoute: (...args: any[]) => mockUseRoute(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { role: "admin", id: 1 },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    skills: {
      getLegacyUpgradeApplyRunDetail: {
        useQuery: () => ({
          data: {
            run: {
              id: 901,
              recommendationId: 201,
              skillId: 99,
              runType: "apply",
              status: "failed",
              summary: "Proposal generation failed",
              errorMessage: "Unknown proposal generation error",
              verificationJson: {},
              logsJson: {
                taskId: "task-detail-901",
                resultError: "Unknown proposal generation error",
                repoRoot: "/home/dev/projects/SmartSpecPro",
                workspaceRoot: "/home/dev/projects/SmartSpecPro/runs/workspaces/graph-assistant/20260423_010000",
                proposalRoot: "/home/dev/projects/SmartSpecPro/apps/web/skills/intelligence-skill-creator/runs/proposals/graph-assistant",
                proposalCount: 1,
                lineage: {
                  role: "orchestrator",
                  parentRunId: null,
                  childRunIds: ["902", "903"],
                  checkpointVersion: 3,
                  verificationState: "failed",
                  artifactRefs: ["out/plan.md", "logs/phase_verify.md"],
                  resumeCursor: "resume-verify",
                },
              },
              diffSummaryJson: {},
              scopeJson: {},
              startedAt: "2026-04-23T01:00:00.000Z",
              endedAt: "2026-04-23T01:05:00.000Z",
              createdAt: "2026-04-23T01:00:00.000Z",
              updatedAt: "2026-04-23T01:05:00.000Z",
              queueState: "failed",
              taskId: "task-detail-901",
              resolvedLlmModelId: "test-default-llm",
              resultMessage: null,
              resultError: "Unknown proposal generation error",
              sourceRunId: 801,
              retryReason: "Retry from apply run 801",
            },
            recommendation: {
              id: 201,
              recommendationType: "native-bundle-upgrade",
              status: "failed",
              title: "Upgrade bundle",
              summary: "Move the skill to the native bundle contract",
              rationale: null,
              riskLevel: "critical",
              compatibilityStatus: "blocked",
              qualityScore: 88,
              currentRuntime: "markdown-only",
              proposedRuntime: "native-bundle",
              proposedAction: "upgrade",
              isAutoApplySafe: false,
              recommendationJson: { affectedFiles: ["SKILL.md"] },
            },
            skill: {
              id: 99,
              slug: "graph-assistant",
              name: "Graph Assistant",
              description: "Legacy skill",
              executionMode: "markdown-only",
              folderPath: "/skills/graph-assistant",
            },
            snapshots: [
              {
                id: 1,
                snapshotType: "post_apply",
                capturedAt: "2026-04-23T01:04:00.000Z",
                manifestPath: "SKILL.md",
                contractHash: "abc123",
                compatibilityNotesJson: { status: "blocked" },
              },
            ],
            relatedRuns: [
              {
                id: 801,
                runType: "apply",
                status: "completed",
                summary: "Earlier retry",
                errorMessage: null,
                verificationJson: {},
                logsJson: {
                  taskId: "task-detail-801",
                  resolvedLlmModelId: "test-default-llm",
                  repoRoot: "/home/dev/projects/SmartSpecPro",
                  workspaceRoot: "/home/dev/projects/SmartSpecPro/runs/workspaces/graph-assistant/20260422_010000",
                  proposalRoot: "/home/dev/projects/SmartSpecPro/apps/web/skills/intelligence-skill-creator/runs/proposals/graph-assistant",
                  proposalCount: 0,
                  lineage: {
                    role: "child",
                    parentRunId: "801",
                    childRunIds: [],
                    checkpointVersion: 2,
                    verificationState: "passed",
                    artifactRefs: ["out/result.md"],
                    resumeCursor: "resume-finalize",
                  },
                },
                diffSummaryJson: {},
                scopeJson: {},
                startedAt: "2026-04-22T01:00:00.000Z",
                endedAt: "2026-04-22T01:05:00.000Z",
                createdAt: "2026-04-22T01:00:00.000Z",
                updatedAt: "2026-04-22T01:05:00.000Z",
                queueState: "completed",
                taskId: "task-detail-801",
                resolvedLlmModelId: "test-default-llm",
                resultMessage: "Applied successfully",
                resultError: null,
                sourceRunId: null,
                retryReason: null,
              },
            ],
          },
          isLoading: false,
          refetch: mockRefetch,
        }),
      },
      retryLegacyUpgradeApplyRuns: {
        useMutation: () => ({
          mutate: mockRetryMutation,
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ title, leading, children }: any) =>
    createElement("section", null, title ? createElement("h2", null, title) : null, leading, children),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => createElement("button", props, children),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => createElement("span", null, children),
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
    t: (key: string) => {
      const map: Record<string, string> = {
        "admin.skillsPage.legacyRunDetail.title": "Apply Run Detail",
        "admin.skillsPage.legacyRunDetail.subtitle": "Inspect status, lineage, snapshots, and retry history.",
        "admin.skillsPage.legacyRunDetail.back": "Back to run monitor",
        "admin.skillsPage.legacyRunDetail.refresh": "Refresh",
        "admin.skillsPage.legacyRunDetail.retry": "Retry run",
        "admin.skillsPage.legacyRunDetail.retrying": "Retrying...",
        "admin.skillsPage.legacyRunDetail.overview": "Overview",
        "admin.skillsPage.legacyRunDetail.result": "Result",
        "admin.skillsPage.legacyRunDetail.metadata": "Metadata",
        "admin.skillsPage.legacyRunDetail.timeline": "Run lineage",
        "admin.skillsPage.legacyRunDetail.snapshots": "Snapshots",
        "admin.skillsPage.legacyRunDetail.noSnapshots": "No snapshots recorded yet.",
        "admin.skillsPage.legacyRunDetail.fields.taskId": "Task ID",
        "admin.skillsPage.legacyRunDetail.fields.model": "Resolved model",
        "admin.skillsPage.legacyRunDetail.fields.sourceRun": "Source run",
        "admin.skillsPage.legacyRunDetail.fields.retryReason": "Retry reason",
        "admin.skillsPage.legacyRunDetail.fields.role": "Role",
        "admin.skillsPage.legacyRunDetail.fields.failureScope": "Failure scope",
        "admin.skillsPage.legacyRunDetail.fields.parentRun": "Parent run",
        "admin.skillsPage.legacyRunDetail.fields.childRuns": "Child runs",
        "admin.skillsPage.legacyRunDetail.fields.checkpointVersion": "Checkpoint version",
        "admin.skillsPage.legacyRunDetail.fields.verificationState": "Verification state",
        "admin.skillsPage.legacyRunDetail.fields.artifactRefs": "Artifact refs",
        "admin.skillsPage.legacyRunDetail.fields.resumeCursor": "Resume cursor",
        "admin.skillsPage.legacyRunDetail.fields.startedAt": "Started at",
        "admin.skillsPage.legacyRunDetail.fields.endedAt": "Ended at",
        "admin.skillsPage.legacyRunDetail.fields.applyStrategy": "Apply strategy",
        "admin.skillsPage.legacyRunDetail.fields.repoRoot": "Repo root",
        "admin.skillsPage.legacyRunDetail.fields.workspaceRoot": "Workspace root",
        "admin.skillsPage.legacyRunDetail.fields.proposalRoot": "Proposal root",
        "admin.skillsPage.legacyRunDetail.fields.proposalCount": "Proposal count",
        "admin.skillsPage.legacyRunDetail.noChangesRequired": "No changes required",
        "admin.skillsPage.legacyRunDetail.fields.summary": "Summary",
        "admin.skillsPage.legacyRunDetail.fields.error": "Error",
        "admin.skillsPage.legacyRunDetail.fields.runType": "Run type",
        "admin.skillsPage.legacyRunDetail.fields.status": "Status",
        "admin.skillsPage.legacyRunDetail.fields.createdAt": "Created at",
        "admin.skillsPage.legacyRunDetail.fields.updatedAt": "Updated at",
        "admin.skillsPage.legacyRunDetail.fields.recommendation": "Recommendation",
        "admin.skillsPage.legacyRunDetail.lineage": "Lineage",
        "admin.skillsPage.legacyRunDetail.roles.orchestrator": "Orchestrator",
        "admin.skillsPage.legacyRunDetail.roles.child": "Child subagent",
        "admin.skillsPage.legacyRunDetail.roles.handoff": "Handoff",
        "admin.skillsPage.legacyRunDetail.failureScopes.orchestrator": "Orchestrator failure",
        "admin.skillsPage.legacyRunDetail.failureScopes.child": "Child subagent failure",
        "admin.skillsPage.legacyRunDetail.failureScopes.handoff": "Handoff failure",
        "admin.skillsPage.legacyRunDetail.headers.id": "Run ID",
        "admin.skillsPage.legacyRunDetail.headers.state": "State",
        "admin.skillsPage.legacyRunDetail.headers.task": "Task",
        "admin.skillsPage.legacyRunDetail.headers.error": "Error",
        "admin.skillsPage.legacyRunDetail.headers.actions": "Actions",
        "admin.skillsPage.legacyRunDetail.open": "Open",
        "admin.skillsPage.legacyRunQueue.status.failed": "Failed",
        "admin.skillsPage.legacyRunQueue.status.completed": "Completed",
        "admin.skillsPage.legacyRunQueue.status.queued": "Queued",
        "admin.skillsPage.legacyRunQueue.status.running": "Running",
        "admin.skillsPage.legacyRunQueue.status.blocked": "Blocked",
        "admin.skillsPage.legacyRunQueue.status.canceled": "Canceled",
      };
      return map[key] || key;
    },
  }),
}));

describe("AdminLegacyUpgradeRunDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders run details and allows retrying the failed run", async () => {
    const { default: AdminLegacyUpgradeRunDetail } = await import("@/pages/AdminLegacyUpgradeRunDetail");
    render(createElement(AdminLegacyUpgradeRunDetail));

    await waitFor(() => {
      expect(screen.getByText("Apply Run Detail")).toBeTruthy();
      expect(screen.getByText("task-detail-901")).toBeTruthy();
      expect(screen.getByText("Unknown proposal generation error")).toBeTruthy();
      expect(screen.getByText("Run ID")).toBeTruthy();
      expect(screen.getByText("Orchestrator")).toBeTruthy();
      expect(screen.getByText("Orchestrator failure")).toBeTruthy();
      expect(screen.getByText("post_apply")).toBeTruthy();
      expect(screen.getByText("Repo root")).toBeTruthy();
      expect(screen.getByText("Workspace root")).toBeTruthy();
      expect(screen.getByText("Proposal root")).toBeTruthy();
      expect(screen.getByText("/home/dev/projects/SmartSpecPro/runs/workspaces/graph-assistant/20260423_010000")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry run" }));

    expect(mockRetryMutation).toHaveBeenCalledWith({ runIds: [901] });
  });
});
