/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockNavigate = vi.fn();
const createRequestMutateAsync = vi.fn();
const regeneratePreflightPreviewMutateAsync = vi.fn();
const approvePreflightBundleMutateAsync = vi.fn();
const launchApprovedAutomationMutateAsync = vi.fn();
const resolvePreflightPreviewRefetch = vi.fn();
const invalidateMyRequests = vi.fn();
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);
const currentLocationRef = { current: "/work/request" };
let mockLanguage: "en" | "th" = "en";
const preflightPreviewStateByCaseId: Record<string, any> = {};

function makePreflightPreview(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    access: {
      allowed: true,
      redacted: false,
      view: "admin_diagnostic",
    },
    caseId: "case-2",
    requestId: "req-2",
    preflightBundleId: "bundle-2",
    state: "previewed",
    previewView: "admin_diagnostic",
    brief: {
      title: "Review refund request",
      objective: "Customer needs a refund checked.",
      summary: "Review the refund request and draft the next response.",
      sourceRefs: [
        {
          sourceType: "case",
          sourceId: "case-2",
          label: "Review refund request",
          required: true,
          trust: "trusted",
          freshness: "current",
        },
        {
          sourceType: "request",
          sourceId: "req-2",
          label: "Review refund request",
          required: true,
          trust: "trusted",
          freshness: "current",
        },
      ],
      approvalSnapshots: [],
      generatedAt: "2026-04-22T00:00:00.000Z",
    },
    capabilityCatalog: [
      {
        id: "skill",
        surface: "skill",
        action: null,
        title: "Skill",
        description: "Selected by policy",
        governance: {
          surface: "skill",
          action: null,
          plannerVisible: true,
          autoExecutableByDefault: true,
          approvalRequired: false,
          minimumGate: "manifest_risk_policy",
          requiredFeatureFlags: [],
          requiredPermissions: ["orchestrator.surface.skill"],
        },
        contractCompatibility: {
          state: "compatible",
          reasonCode: null,
          migrationRequired: false,
        },
        blockedReason: null,
        metadata: {
          selectedByPolicy: true,
        },
      },
    ],
    capabilityPlan: {
      id: "plan-2",
      version: "capability-plan.v1",
      selectedCapabilityIds: ["skill"],
      summary: "Research the request and prepare the response.",
      steps: [
        {
          stepId: "step-1",
          title: "Research refund eligibility",
          selectedCapabilityId: "skill",
          selectedSurface: "skill",
          blockedReasonCodes: [],
          alternativeCapabilityIds: [],
        },
      ],
      createdAt: "2026-04-22T00:00:00.000Z",
    },
    executionPlan: {
      id: "exec-2",
      version: "team-execution-plan.v1",
      brief: {
        title: "Review refund request",
        objective: "Customer needs a refund checked.",
        summary: "Review the refund request and draft the next response.",
        sourceRefs: [
          {
            sourceType: "case",
            sourceId: "case-2",
            label: "Review refund request",
            required: true,
            trust: "trusted",
            freshness: "current",
          },
          {
            sourceType: "request",
            sourceId: "req-2",
            label: "Review refund request",
            required: true,
            trust: "trusted",
            freshness: "current",
          },
        ],
        approvalSnapshots: [],
        generatedAt: "2026-04-22T00:00:00.000Z",
      },
      steps: [
        {
          id: "step-1",
          stepKey: "research",
          title: "Research refund eligibility",
          objective: "Gather the evidence needed for a response.",
          surface: "skill",
          action: null,
          capabilityId: "skill",
          governance: {
            surface: "skill",
            action: null,
            plannerVisible: true,
            autoExecutableByDefault: true,
            approvalRequired: false,
            minimumGate: "manifest_risk_policy",
            requiredFeatureFlags: [],
            requiredPermissions: ["orchestrator.surface.skill"],
          },
          contractCompatibility: {
            state: "compatible",
            reasonCode: null,
            migrationRequired: false,
          },
          expectedArtifacts: ["refund-summary"],
          optional: false,
          metadata: {},
        },
      ],
      budget: {
        maxRounds: 8,
        maxTokens: 8000,
        maxToolCalls: 6,
        maxDurationMinutes: 20,
        maxBudgetCredits: 250,
        maxRetries: 1,
        perSurfaceMaxAttempts: {
          skill: 2,
        },
        retryDisposition: "safe_retry",
        sideEffectRetryPolicy: "verify_then_retry",
        onExceeded: "pause_for_approval",
      },
      teamResolution: {
        status: "resolved",
        code: "resolved_request_default_queue",
        teamId: "team-1",
        source: "request_default_queue",
        reason: "Resolved from request default queue",
        diagnostics: {},
      },
      preflightRevision: {
        algorithm: "sha256-json-v1",
        fingerprint: "a".repeat(64),
        inputs: {
          requestTitle: "Review refund request",
          requestObjective: "Customer needs a refund checked.",
          linkedConversationIds: [],
          linkedWorkpackRunIds: [],
          linkedRoleRoutineRunIds: [],
          selectedSourceIds: ["case-2", "req-2"],
          policyDigest: null,
          explicitTeamId: "team-1",
        },
        generatedAt: "2026-04-22T00:00:00.000Z",
      },
      createdAt: "2026-04-22T00:00:00.000Z",
    },
    teamResolution: {
      status: "resolved",
      code: "resolved_request_default_queue",
      teamId: "team-1",
      source: "request_default_queue",
      reason: "Resolved from request default queue",
      diagnostics: {},
    },
    preflightRevision: {
      algorithm: "sha256-json-v1",
      fingerprint: "a".repeat(64),
      inputs: {
        requestTitle: "Review refund request",
        requestObjective: "Customer needs a refund checked.",
        linkedConversationIds: [],
        linkedWorkpackRunIds: [],
        linkedRoleRoutineRunIds: [],
        selectedSourceIds: ["case-2", "req-2"],
        policyDigest: null,
        explicitTeamId: "team-1",
      },
      generatedAt: "2026-04-22T00:00:00.000Z",
    },
    budget: {
      maxRounds: 8,
      maxTokens: 8000,
      maxToolCalls: 6,
      maxDurationMinutes: 20,
      maxBudgetCredits: 250,
      maxRetries: 1,
      perSurfaceMaxAttempts: {
        skill: 2,
      },
      retryDisposition: "safe_retry",
      sideEffectRetryPolicy: "verify_then_retry",
      onExceeded: "pause_for_approval",
    },
    approvalSnapshotStatus: {
      requiredCount: 2,
      capturedCount: 0,
    },
    launchReadiness: {
      ready: false,
      primaryReasonCode: "preflight_approval_required",
      blockedReasonCodes: ["preflight_approval_required"],
    },
    approvalSnapshots: [],
    diagnostics: {
      visibleReasonCodes: ["preflight_approval_required"],
    },
    ...overrides,
  };
}

vi.mock("wouter", () => ({
  useLocation: () => [currentLocationRef.current, mockNavigate],
  Link: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a
      href={href}
      onClick={event => {
        event.preventDefault();
        onClick?.(event);
        mockNavigate(href);
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 42, role: "admin" },
  }),
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: ({ className }: { className?: string }) => (
    <div data-testid="locale-toggle" className={className} />
  ),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (_key: string, defaultValue?: string | Record<string, unknown>) =>
      typeof defaultValue === "string" ? defaultValue : _key,
    locale: mockLanguage,
    i18n: {
      exists: () => true,
      resolvedLanguage: mockLanguage,
      language: mockLanguage,
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
              latestRoomId: "room-1",
              latestRoomType: "team",
            },
            {
              id: "team-2",
              name: "Creative Content 1",
              status: "draft",
              latestRoomId: "room-2",
              latestRoomType: "team",
            },
          ],
          isLoading: false,
        }),
      },
    },
    workOs: {
      getRequest: {
        useQuery: () => {
          if (currentLocationRef.current.includes("requestId=req-1")) {
            return {
              data: {
                request: {
                  id: "req-1",
                  title: "Review refund",
                  objective:
                    "Check the refund eligibility and draft a response.",
                  sourceType: "chat",
                  sourceRef: "chat-123",
                  businessDomain: "support",
                  urgency: "high",
                  riskLevel: "medium",
                  defaultOwnerType: "human",
                  defaultOwnerId: "42",
                  defaultQueueId: null,
                  linkedConversationIdsJson: ["conv-123"],
                },
                case: { id: "case-1" },
              },
              isLoading: false,
            };
          }
          return {
            data: null,
            isLoading: false,
          };
        },
      },
      resolvePreflightPreview: {
        useQuery: (input?: any) => ({
          data:
            input && typeof input === "object" && "caseId" in input
              ? (preflightPreviewStateByCaseId[input.caseId] ?? null)
              : null,
          isLoading: false,
          error: null,
          refetch: resolvePreflightPreviewRefetch,
        }),
      },
      regeneratePreflightPreview: {
        useMutation: (options?: {
          onSuccess?: (result: any) => void | Promise<void>;
        }) => ({
          mutateAsync: async (...args: unknown[]) => {
            const result = await regeneratePreflightPreviewMutateAsync(...args);
            await options?.onSuccess?.(result);
            return result;
          },
          isPending: false,
        }),
      },
      approvePreflightBundle: {
        useMutation: (options?: {
          onSuccess?: (result: any) => void | Promise<void>;
        }) => ({
          mutateAsync: async (...args: unknown[]) => {
            const result = await approvePreflightBundleMutateAsync(...args);
            await options?.onSuccess?.(result);
            return result;
          },
          isPending: false,
        }),
      },
      launchApprovedAutomation: {
        useMutation: (options?: {
          onSuccess?: (result: any) => void | Promise<void>;
        }) => ({
          mutateAsync: async (...args: unknown[]) => {
            const result = await launchApprovedAutomationMutateAsync(...args);
            await options?.onSuccess?.(result);
            return result;
          },
          isPending: false,
        }),
      },
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
      updateRequest: {
        useMutation: (options?: {
          onSuccess?: (result: any) => void | Promise<void>;
        }) => ({
          mutateAsync: async (...args: unknown[]) => {
            const result = await createRequestMutateAsync(...args);
            await options?.onSuccess?.(result);
            return result;
          },
          isPending: false,
        }),
      },
      createRequest: {
        useMutation: (options?: {
          onSuccess?: (result: any) => void | Promise<void>;
        }) => ({
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
    mockClipboardWriteText.mockClear();
    currentLocationRef.current = "/work/request";
    mockLanguage = "en";
    Object.keys(preflightPreviewStateByCaseId).forEach(key => {
      delete preflightPreviewStateByCaseId[key];
    });
    preflightPreviewStateByCaseId["case-1"] = makePreflightPreview({
      caseId: "case-1",
      requestId: "req-1",
      preflightBundleId: "bundle-1",
      brief: {
        title: "Review refund",
        objective: "Check the refund eligibility and draft a response.",
        summary: "Check the refund eligibility and draft a response.",
        sourceRefs: [
          {
            sourceType: "case",
            sourceId: "case-1",
            label: "Review refund",
            required: true,
            trust: "trusted",
            freshness: "current",
          },
          {
            sourceType: "request",
            sourceId: "req-1",
            label: "Review refund",
            required: true,
            trust: "trusted",
            freshness: "current",
          },
          {
            sourceType: "conversation",
            sourceId: "conv-123",
            label: "Conversation conv-123",
            required: true,
            trust: "derived",
            freshness: "recent",
          },
        ],
        approvalSnapshots: [],
        generatedAt: "2026-04-22T00:00:00.000Z",
      },
      preflightRevision: {
        algorithm: "sha256-json-v1",
        fingerprint: "c".repeat(64),
        inputs: {
          requestTitle: "Review refund",
          requestObjective:
            "Check the refund eligibility and draft a response.",
          linkedConversationIds: ["conv-123"],
          linkedWorkpackRunIds: [],
          linkedRoleRoutineRunIds: [],
          selectedSourceIds: ["case-1", "req-1", "conv-123"],
          policyDigest: null,
          explicitTeamId: "team-1",
        },
        generatedAt: "2026-04-22T00:00:00.000Z",
      },
      launchReadiness: {
        ready: false,
        primaryReasonCode: "preflight_approval_required",
        blockedReasonCodes: ["preflight_approval_required"],
      },
      diagnostics: {
        visibleReasonCodes: ["preflight_approval_required"],
      },
    });
    preflightPreviewStateByCaseId["case-2"] = makePreflightPreview();
    resolvePreflightPreviewRefetch.mockResolvedValue({
      data: preflightPreviewStateByCaseId["case-2"],
    });
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: mockClipboardWriteText,
      },
      configurable: true,
    });
    createRequestMutateAsync.mockResolvedValue({
      request: {
        id: "req-2",
        title: "Review refund request",
        objective: "Customer needs a refund checked.",
      },
      case: { id: "case-2" },
    });
    regeneratePreflightPreviewMutateAsync.mockImplementation(async (input: any) => {
      const currentPreview = preflightPreviewStateByCaseId[input.caseId];
      const regenerated = makePreflightPreview({
        ...currentPreview,
        caseId: input.caseId,
        requestId: currentPreview?.requestId ?? "req-2",
        preflightBundleId: `${currentPreview?.preflightBundleId ?? "bundle-2"}-regenerated`,
        preflightRevision: {
          ...currentPreview.preflightRevision,
          fingerprint: "b".repeat(64),
          generatedAt: "2026-04-22T01:00:00.000Z",
        },
      });
      preflightPreviewStateByCaseId[input.caseId] = regenerated;
      return {
        ...regenerated,
        supersededBundleIds: [input.previousPreflightBundleId],
      };
    });
    approvePreflightBundleMutateAsync.mockImplementation(async (input: any) => {
      const currentPreview = preflightPreviewStateByCaseId[input.caseId];
      preflightPreviewStateByCaseId[input.caseId] = {
        ...currentPreview,
        state: "approved",
        approvalSnapshotStatus: {
          ...currentPreview.approvalSnapshotStatus,
          capturedCount: currentPreview.approvalSnapshotStatus.requiredCount,
        },
        launchReadiness: {
          ready: true,
          primaryReasonCode: null,
          blockedReasonCodes: [],
        },
        diagnostics: {
          visibleReasonCodes: [],
        },
      };
      return {
        preflightBundleId: currentPreview.preflightBundleId,
        state: "approved",
        approvedAt: "2026-04-22T01:05:00.000Z",
        approvedByUserId: 42,
        preflightRevision: currentPreview.preflightRevision,
        approvalSnapshots: [],
        launchReadiness: {
          ready: true,
          primaryReasonCode: null,
          blockedReasonCodes: [],
        },
      };
    });
    launchApprovedAutomationMutateAsync.mockImplementation(async (input: any) => ({
      automationRunId: "run-2",
      preflightBundleId: input.preflightBundleId,
      state: "launched",
      teamId: "team-1",
      roomId: "room-1",
      teamRunId: "team-run-2",
      workItemId: "task-2",
      launchDiagnostics: {},
    }));
  });

  it("creates a work request for a regular user", async () => {
    render(<WorkRequestPage />);

    expect(
      screen.getByRole("button", { name: /dashboard/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("locale-toggle")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Review refund request" },
    });
    fireEvent.change(screen.getByLabelText("Details"), {
      target: { value: "Customer needs a refund checked." },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Create Work Request" })
    );

    await waitFor(() => {
      expect(createRequestMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Review refund request",
          objective: "Customer needs a refund checked.",
          sourceType: "manual",
          requesterId: "42",
          defaultOwnerType: "human",
          defaultOwnerId: "42",
        })
      );
    });

    await waitFor(() => {
      expect(invalidateMyRequests).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId("preflight-review-card")).toBeInTheDocument();
    });

    expect(screen.getByText("Automation review")).toBeInTheDocument();
    expect(screen.getByText("Review the refund request and draft the next response.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /review automation plan/i })
    ).toBeInTheDocument();
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

    fireEvent.click(
      screen.getByRole("button", { name: "Create Work Request" })
    );

    await waitFor(() => {
      expect(createRequestMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Prepare weekly report",
          defaultOwnerType: "queue",
          defaultQueueId: "team-1",
        })
      );
    });
  });

  it("prefills linked conversation context from the launch URL and submits it", async () => {
    currentLocationRef.current =
      "/work/request?sourceType=chat&sourceRef=conv-77&linkedConversationIds=conv-77";

    render(<WorkRequestPage />);

    expect(screen.getByTestId("linked-sources-panel")).toBeInTheDocument();
    expect(screen.getByText("Conversation conv-77")).toBeInTheDocument();
    expect(screen.getByLabelText("Source reference")).toHaveValue("conv-77");

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Follow up from chat" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Create Work Request" })
    );

    await waitFor(() => {
      expect(createRequestMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: "chat",
          sourceRef: "conv-77",
          linkedConversationIds: ["conv-77"],
        })
      );
    });
  });

  it("shows draft owned teams in the team selector", async () => {
    render(<WorkRequestPage />);

    fireEvent.click(screen.getByRole("button", { name: "Assign to my team" }));

    expect(
      screen.getByRole("option", { name: /operations team/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /creative content 1 \(draft\)/i })
    ).toBeInTheDocument();
  });

  it("loads a spec file into the details field", async () => {
    render(<WorkRequestPage />);

    const specFile = new File(
      ["# Weekly report\n\n- Keep it short\n- Add owners"],
      "spec.md",
      {
        type: "text/markdown",
      }
    );
    const fileInput = screen.getByLabelText(/upload spec file/i);
    Object.defineProperty(fileInput, "files", {
      value: [specFile],
      configurable: true,
    });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Details") as HTMLTextAreaElement).value
      ).toBe("# Weekly report\n\n- Keep it short\n- Add owners");
    });

    expect(screen.getByText("spec.md")).toBeInTheDocument();
  });

  it("accepts a spec file via drag and drop", async () => {
    render(<WorkRequestPage />);

    const specFile = new File(
      ["# Incident notes\n\n- Verify refund totals"],
      "brief.md",
      {
        type: "text/markdown",
      }
    );

    const dropzone = screen.getByTestId("details-dropzone");
    fireEvent.dragEnter(dropzone);
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [specFile],
      },
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Details") as HTMLTextAreaElement).value
      ).toBe("# Incident notes\n\n- Verify refund totals");
    });

    expect(screen.getByText("brief.md")).toBeInTheDocument();
  });

  it("opens the team detail page from a readiness card", () => {
    render(<WorkRequestPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open team Operations Team" })
    );

    expect(mockNavigate).toHaveBeenCalledWith("/teams/team-1");
  });

  it("shows the latest room type badge on a readiness card", () => {
    render(<WorkRequestPage />);

    const roomTypeLabel = screen.getAllByText("Team room")[0];
    const badge = roomTypeLabel.closest("span") ?? roomTypeLabel.parentElement;
    expect(roomTypeLabel).toHaveClass(
      "border-emerald-200",
      "bg-emerald-50",
      "text-emerald-700"
    );
    expect(badge?.querySelector("svg")).not.toBeNull();
  });

  it("shows a tooltip for the latest room type badge", async () => {
    render(<WorkRequestPage />);

    expect(screen.getAllByText("Team room")[0]).toHaveAttribute(
      "title",
      "A standard team room for ongoing work and collaboration."
    );
  });

  it("opens the latest team room from a readiness card", () => {
    render(<WorkRequestPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Open room" })[0]);

    expect(mockNavigate).toHaveBeenCalledWith("/teams/team-1?roomId=room-1");
  });

  it("opens the latest team queue from a readiness card", () => {
    render(<WorkRequestPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Open queue" })[0]);

    expect(mockNavigate).toHaveBeenCalledWith(
      "/teams/team-1?roomId=room-1&panel=workflow"
    );
  });

  it("opens Work OS with the work_os source filter after creation", async () => {
    render(<WorkRequestPage />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Review refund request" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create Work Request" })
    );

    await waitFor(() => {
      expect(
        screen.getAllByRole("link", { name: /open in work os console/i }).length
      ).toBeGreaterThan(1);
    });

    fireEvent.click(
      screen.getAllByRole("link", { name: /open in work os console/i })[1]
    );

    expect(mockNavigate).toHaveBeenCalledWith(
      "/admin/work-os?caseId=case-2&timelineSource=work_os"
    );
  });

  it("opens the Work OS guide from the page header", () => {
    render(<WorkRequestPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /open guide/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/help/work-os");
  });

  it("opens the Work OS guide from the helper card", () => {
    render(<WorkRequestPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /open guide/i })[1]);
    expect(mockNavigate).toHaveBeenCalledWith("/help/work-os");
  });

  it("copies a bookmarkable Work OS link after creation", async () => {
    render(<WorkRequestPage />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Review refund request" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create Work Request" })
    );

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /copy permalink/i }).length
      ).toBeGreaterThan(0);
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: /copy permalink/i })[1]
    );

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-2&timelineSource=work_os`
    );
  });

  it("copies the Work OS console permalink from the top bar after creation", async () => {
    render(<WorkRequestPage />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Review refund request" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create Work Request" })
    );

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /copy permalink/i }).length
      ).toBeGreaterThan(1);
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: /copy permalink/i })[0]
    );

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-2&timelineSource=work_os`
    );
  });

  it("approves and launches automation from the review card", async () => {
    render(<WorkRequestPage />);

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Review refund request" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create Work Request" })
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /approve preview/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /approve preview/i }));

    await waitFor(() => {
      expect(approvePreflightBundleMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: "case-2",
          preflightBundleId: "bundle-2",
          approvedRevisionHash: "a".repeat(64),
          selectedSourceIds: ["case-2", "req-2"],
        })
      );
    });

    const launchButton = screen.getByRole("button", {
      name: /launch approved automation/i,
    });
    expect(launchButton).toBeEnabled();
    fireEvent.click(launchButton);

    await waitFor(() => {
      expect(launchApprovedAutomationMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: "case-2",
          preflightBundleId: "bundle-2",
          approvedRevisionHash: "a".repeat(64),
        })
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        "/teams/team-1?roomId=room-1&panel=workflow",
        { replace: true }
      );
    });
  });

  it("shows an editing banner when opened with an existing request id", async () => {
    currentLocationRef.current = "/work/request?requestId=req-1";
    render(<WorkRequestPage />);

    expect(screen.getByText("Editing existing request")).toBeInTheDocument();
    expect(
      screen.getByText(/updating an existing request before automation starts/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /new request/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Review refund");
    expect(screen.getByLabelText("Details")).toHaveValue(
      "Check the refund eligibility and draft a response."
    );
    expect(screen.getByText("Automation review")).toBeInTheDocument();
    expect(screen.getByText("Conversation conv-123 · derived · recent")).toBeInTheDocument();
  });

  it("regenerates the automation preview when the review is stale", async () => {
    render(<WorkRequestPage />);

    preflightPreviewStateByCaseId["case-2"] = makePreflightPreview({
      state: "stale",
      launchReadiness: {
        ready: false,
        primaryReasonCode: "preflight_approval_required",
        blockedReasonCodes: ["preflight_approval_required"],
      },
      diagnostics: {
        visibleReasonCodes: ["preflight_approval_required"],
      },
    });

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Review refund request" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create Work Request" })
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /refresh preview/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /refresh preview/i }));

    await waitFor(() => {
      expect(regeneratePreflightPreviewMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: "case-2",
          previousPreflightBundleId: "bundle-2",
        })
      );
    });
  });
});
