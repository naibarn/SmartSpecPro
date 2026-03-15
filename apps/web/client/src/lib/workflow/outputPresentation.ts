import type {
  BrowserSessionArtifact,
  BrowserSessionLaunchContext,
} from "@shared/browserSession";
import {
  buildBrowserSessionSummary,
  parseBrowserSessionArtifact,
} from "@shared/browserSession";
import type { LiveBrowserSession } from "@shared/liveBrowser";
import {
  normalizeAgencyComparisonPayload,
  type AgencyComparisonPayload,
} from "@shared/agencyComparison";

export interface WorkflowComparisonPreviewState {
  lifecycleState: "preview_generated" | "expired_preview" | "commit_pending" | "committed" | "commit_failed";
  summaryText: string;
  data: AgencyComparisonPayload;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

function normalizeLifecycleState(
  value: unknown,
): WorkflowComparisonPreviewState["lifecycleState"] {
  switch (value) {
    case "expired_preview":
    case "commit_pending":
    case "committed":
    case "commit_failed":
      return value;
    default:
      return "preview_generated";
  }
}

export function buildWorkflowBrowserSessionLaunchContext(
  workflowId: string | null | undefined,
  sessionId: string,
): BrowserSessionLaunchContext | null {
  if (!workflowId) {
    return null;
  }

  return {
    originSurface: "workflow",
    originLabel: "Workflow",
    sourceId: String(workflowId),
    returnContext: {
      path: `/workflows/editor/${encodeURIComponent(workflowId)}?browserSessionId=${encodeURIComponent(sessionId)}`,
      label: "Return to Workflow",
    },
  };
}

export function buildWorkflowBrowserSessionArtifact(
  session: LiveBrowserSession,
  workflowId: string | null | undefined,
): BrowserSessionArtifact {
  const launchContext = buildWorkflowBrowserSessionLaunchContext(workflowId, session.sessionId);

  return {
    sessionId: session.sessionId,
    summary: buildBrowserSessionSummary(session, { launchContext }),
    launchContext: launchContext ?? undefined,
    updatedAt: session.lastActivityAt,
  };
}

export function getWorkflowBrowserSessionId(output: unknown): string | null {
  const record = toRecord(output);
  const browserSessionId = readFirstString(record, ["browserSessionId", "browser_session_id"]);
  return browserSessionId ?? null;
}

export function getWorkflowBrowserSessionArtifact(output: unknown): BrowserSessionArtifact | null {
  const record = toRecord(output);
  return parseBrowserSessionArtifact(record.browserSessionArtifact);
}

export function normalizeWorkflowComparisonPreview(
  output: unknown,
): WorkflowComparisonPreviewState | null {
  const record = toRecord(output);
  const explicitPreview = toRecord(record.comparisonPreview);
  const explicitPreviewData = explicitPreview.data;

  const payload = normalizeAgencyComparisonPayload(
    explicitPreviewData ?? record.comparisonPayload ?? record.comparison ?? output,
  );
  if (!payload) {
    return null;
  }

  const summaryText = readFirstString(explicitPreview, ["summaryText", "summary_text"])
    ?? readFirstString(record, ["summaryText", "summary_text"])
    ?? payload.summary
    ?? `${payload.title} preview is ready.`;

  return {
    lifecycleState: normalizeLifecycleState(explicitPreview.lifecycleState ?? record.lifecycleState),
    summaryText,
    data: payload,
  };
}

export function stripWorkflowPresentationFields(
  output: Record<string, unknown>,
): Record<string, unknown> | null {
  const next = { ...output };
  const hadBrowserSessionArtifact = "browserSessionArtifact" in next;
  const hadComparisonPreview = "comparisonPreview" in next;

  delete next.browserSessionArtifact;
  delete next.comparisonPreview;

  if (hadBrowserSessionArtifact) {
    delete next.browserSessionId;
    delete next.browser_session_id;
    delete next.browserSessionSummary;
    delete next.sessionStatus;
    delete next.reviewState;
    delete next.pendingUserStep;
    delete next.outcome;
  }

  if (hadComparisonPreview) {
    delete next.comparisonPayload;
    delete next.comparison;
    delete next.lifecycleState;
    delete next.summaryText;
    delete next.summary_text;
  }

  return Object.keys(next).length > 0 ? next : null;
}
