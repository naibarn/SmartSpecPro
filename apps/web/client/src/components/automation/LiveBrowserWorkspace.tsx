import { useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Hand,
  MonitorPlay,
  RefreshCw,
  Send,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";

import type {
  LiveBrowserEventEnvelope,
  LiveBrowserSession,
} from "@shared/liveBrowser";
import {
  BROWSER_SESSION_COPY,
  buildBrowserSessionSummary,
  getBrowserSessionAnnouncement,
} from "@shared/browserSession";
import {
  BROWSER_SKILL_PRESETS,
  inferBrowserSkillId,
  type BrowserSkillId,
} from "@shared/browserSkills";
import { trackBrowserSessionMobileObserveOnlySeen } from "@/lib/analytics/browserSessionEvents";
import type { LiveReconnectState } from "@/lib/liveBrowserStream";
import { LiveBrowserStreamRenderer } from "./LiveBrowserStreamRenderer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LiveBrowserWorkspaceProps {
  session: LiveBrowserSession;
  events: LiveBrowserEventEnvelope[];
  reconnectState: LiveReconnectState;
  compactViewport: boolean;
  commandDraft: string;
  commandSkillId: BrowserSkillId;
  busyAction: string | null;
  noticeMessage?: string | null;
  stepUpCode?: string;
  showStepUpCodeInput?: boolean;
  onCommandDraftChange: (value: string) => void;
  onCommandSkillIdChange: (value: BrowserSkillId) => void;
  onStepUpCodeChange: (value: string) => void;
  onSendCommand: () => void;
  onRefresh: () => void;
  onTakeControl: () => void;
  onReturnControl: () => void;
  onApprove: () => void;
  onReject: () => void;
  onResolveAssist: () => void;
  onCancelSession: () => void;
}

function statusTone(status: LiveBrowserSession["status"]): string {
  if (status === "agent_running" || status === "ready") return "bg-emerald-50 text-emerald-700";
  if (status === "waiting_for_human" || status === "human_controlling") {
    return "bg-amber-50 text-amber-700";
  }
  if (status === "expired" || status === "failed" || status === "failed_recovery_required") {
    return "bg-rose-50 text-rose-700";
  }
  return "bg-slate-100 text-slate-700";
}

function reconnectLabel(reconnectState: LiveReconnectState): string {
  if (reconnectState === "stream_unavailable") return "Stream unavailable";
  if (reconnectState === "reconnecting") return "Reconnecting";
  return "Connected";
}

function getBarrierPrompt(session: LiveBrowserSession): string | null {
  const activeBarrier = session.policyContext?.activeBarrier;
  if (!activeBarrier || typeof activeBarrier !== "object") {
    return null;
  }
  return typeof (activeBarrier as { prompt?: unknown }).prompt === "string"
    ? (activeBarrier as { prompt: string }).prompt
    : null;
}

function resolveBarrierType(session: LiveBrowserSession): LiveBrowserSession["barrierType"] | null {
  if (session.barrierType) {
    return session.barrierType;
  }
  const activeBarrier = session.policyContext?.activeBarrier;
  if (!activeBarrier || typeof activeBarrier !== "object") {
    return null;
  }
  return typeof (activeBarrier as { type?: unknown }).type === "string"
    ? ((activeBarrier as { type: LiveBrowserSession["barrierType"] }).type ?? null)
    : null;
}

function getAssistBarrierNotice(session: LiveBrowserSession): string | null {
  const barrierType = resolveBarrierType(session);
  if (barrierType === "login_required") {
    return "Take control to complete login, then return control to AI.";
  }
  if (barrierType === "captcha_required") {
    return "Captcha must be completed by a person before AI can continue.";
  }
  return null;
}

function getSkillDraftStatus(session: LiveBrowserSession): {
  status: "building" | "ready" | "failed";
  note: string;
  skillId: BrowserSkillId;
  syncedSkillSlug?: string | null;
  failureReason?: string | null;
} | null {
  const rawSkillDraft = session.policyContext?.skillDraft;
  if (!rawSkillDraft || typeof rawSkillDraft !== "object") {
    return null;
  }
  const status = typeof (rawSkillDraft as { status?: unknown }).status === "string"
    && ["building", "ready", "failed"].includes((rawSkillDraft as { status: string }).status)
    ? ((rawSkillDraft as { status: "building" | "ready" | "failed" }).status)
    : "building";
  const note = typeof (rawSkillDraft as { note?: unknown }).note === "string"
    ? (rawSkillDraft as { note: string }).note
    : "";
  const skillId = typeof (rawSkillDraft as { skillId?: unknown }).skillId === "string"
    ? ((rawSkillDraft as { skillId: BrowserSkillId }).skillId ?? inferBrowserSkillId(note))
    : inferBrowserSkillId(note);
  const syncedSkillSlug = typeof (rawSkillDraft as { syncedSkillSlug?: unknown }).syncedSkillSlug === "string"
    ? (rawSkillDraft as { syncedSkillSlug: string }).syncedSkillSlug
    : null;
  const failureReason = typeof (rawSkillDraft as { failureReason?: unknown }).failureReason === "string"
    ? (rawSkillDraft as { failureReason: string }).failureReason
    : null;
  if (!note.trim()) {
    return null;
  }
  return { status, note, skillId, syncedSkillSlug, failureReason };
}

function getSiteDiscovery(session: LiveBrowserSession): {
  summary: string;
  candidates: Array<{ label: string; url: string; reason: string }>;
} | null {
  const rawDiscovery = session.policyContext?.siteDiscovery;
  if (!rawDiscovery || typeof rawDiscovery !== "object") {
    return null;
  }
  const summary = typeof (rawDiscovery as { summary?: unknown }).summary === "string"
    ? (rawDiscovery as { summary: string }).summary
    : "";
  const rawCandidates = Array.isArray((rawDiscovery as { candidates?: unknown[] }).candidates)
    ? (rawDiscovery as { candidates: Array<Record<string, unknown>> }).candidates
    : [];
  const candidates = rawCandidates.flatMap((candidate) => {
    if (
      typeof candidate?.label !== "string"
      || typeof candidate?.url !== "string"
      || typeof candidate?.reason !== "string"
    ) {
      return [];
    }
    return [{
      label: candidate.label,
      url: candidate.url,
      reason: candidate.reason,
    }];
  });
  if (!summary.trim() && candidates.length === 0) {
    return null;
  }
  return { summary, candidates };
}

function getApprovalLabels(session: LiveBrowserSession): {
  approve: string;
  reject: string;
} {
  const barrierType = resolveBarrierType(session);
  if (barrierType === "payment_review_required") {
    return { approve: "Approve Payment", reject: "Reject Payment" };
  }
  if (barrierType === "booking_confirmation_required") {
    return { approve: "Approve Booking", reject: "Reject Booking" };
  }
  return { approve: "Approve", reject: "Reject" };
}

export function LiveBrowserWorkspace({
  session,
  events,
  reconnectState,
  compactViewport,
  commandDraft,
  commandSkillId,
  busyAction,
  noticeMessage,
  stepUpCode = "",
  showStepUpCodeInput = false,
  onCommandDraftChange,
  onCommandSkillIdChange,
  onStepUpCodeChange,
  onSendCommand,
  onRefresh,
  onTakeControl,
  onReturnControl,
  onApprove,
  onReject,
  onResolveAssist,
  onCancelSession,
}: LiveBrowserWorkspaceProps) {
  const browserSessionSummary = buildBrowserSessionSummary(session, {
    reconnectState,
    compactViewport,
  });
  const barrierPrompt = getBarrierPrompt(session);
  const assistBarrierNotice = getAssistBarrierNotice(session);
  const approvalLabels = getApprovalLabels(session);
  const skillDraftStatus = getSkillDraftStatus(session);
  const siteDiscovery = getSiteDiscovery(session);
  const takeoverDisabled =
    compactViewport ||
    reconnectState !== "connected" ||
    session.status === "expired" ||
    session.status === "failed" ||
    session.status === "failed_recovery_required";

  useEffect(() => {
    if (!compactViewport) {
      return;
    }

    trackBrowserSessionMobileObserveOnlySeen({
      origin_surface: session.sourceType,
      compact_layout: true,
    });
  }, [compactViewport, session.sourceType]);

  return (
    <div className="space-y-4" data-testid="live-browser-workspace">
      <div className="sr-only" aria-live="polite">
        {getBrowserSessionAnnouncement(session, {
          reconnectState,
          compactViewport,
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-slate-50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MonitorPlay className="h-5 w-5 text-cyan-300" />
              <h3 className="text-sm font-semibold">Browser Session</h3>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-2 py-1 font-medium ${statusTone(session.status)}`}>
                {browserSessionSummary.badgeLabel}
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-1 font-medium text-slate-200">
                {browserSessionSummary.sourceLabel}
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-1 font-medium text-slate-200">
                v{session.sessionVersion}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Viewport</p>
                <p className="mt-1 text-sm font-medium text-slate-100">
                  {String(session.browserContextRef?.pageTitle ?? "Remote browser attached")}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                {reconnectState === "connected" ? (
                  <Wifi className="h-3.5 w-3.5 text-emerald-300" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-amber-300" />
                )}
                {reconnectLabel(reconnectState)}
              </span>
            </div>
            <div className="mt-4 rounded-lg border border-dashed border-slate-700 bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.16),_transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.2),rgba(2,6,23,0.88))] p-5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Active tab</span>
                <span>{String(session.browserContextRef?.activeTabId ?? "tab_1")}</span>
              </div>
              <div className="mt-4">
                <LiveBrowserStreamRenderer
                  session={session}
                  reconnectState={reconnectState}
                  compactViewport={compactViewport}
                />
              </div>
              <div className="mt-6 space-y-2 text-xs text-slate-400">
                <p>URL</p>
                <p className="truncate text-sm text-slate-100">
                  {String(session.browserContextRef?.url ?? "Awaiting navigation")}
                </p>
              </div>
              <div className="mt-6 rounded-lg bg-slate-950/70 p-3 text-xs text-slate-300">
                {browserSessionSummary.statusLine}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {BROWSER_SESSION_COPY.browserInstruction}
              </p>
              {skillDraftStatus ? (
                <div className={`mt-3 rounded-lg border p-3 text-xs ${
                  skillDraftStatus.status === "failed"
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : skillDraftStatus.status === "ready"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-cyan-200 bg-cyan-50 text-cyan-900"
                }`}>
                  <p className="font-semibold">
                    {skillDraftStatus.status === "ready"
                      ? "Browser Skill Draft Ready"
                      : skillDraftStatus.status === "failed"
                        ? "Browser Skill Draft Failed"
                        : "Building Browser Skill Draft"}
                  </p>
                  <p className="mt-1">{skillDraftStatus.note}</p>
                  {skillDraftStatus.syncedSkillSlug ? (
                    <p className="mt-1 font-medium">Skill: {skillDraftStatus.syncedSkillSlug}</p>
                  ) : null}
                  {skillDraftStatus.failureReason ? (
                    <p className="mt-1">{skillDraftStatus.failureReason}</p>
                  ) : null}
                </div>
              ) : null}
              {siteDiscovery ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Suggested Sites</p>
                  {siteDiscovery.summary ? (
                    <p className="mt-1">{siteDiscovery.summary}</p>
                  ) : null}
                  {siteDiscovery.candidates.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {siteDiscovery.candidates.slice(0, 3).map((candidate) => (
                        <div key={candidate.url} className="rounded border border-slate-200 bg-white p-2">
                          <p className="font-medium text-slate-900">{candidate.label}</p>
                          <p className="truncate text-[11px] text-slate-500">{candidate.url}</p>
                          <p className="mt-1 text-[11px] text-slate-600">{candidate.reason}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3">
                <Select value={commandSkillId} onValueChange={(value) => onCommandSkillIdChange(value as BrowserSkillId)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a browser skill" />
                  </SelectTrigger>
                  <SelectContent>
                    {BROWSER_SKILL_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <textarea
                value={commandDraft}
                onChange={(event) => onCommandDraftChange(event.target.value)}
                placeholder="Tell the AI what to do next in this Browser Session."
                className="mt-3 min-h-[110px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={onSendCommand}
                disabled={!commandDraft.trim() || busyAction === "sendCommand"}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {busyAction === "sendCommand" ? "Queuing..." : "Send Browser Instruction"}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Human Controls</p>
              {noticeMessage ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {noticeMessage}
                </div>
              ) : null}
              {showStepUpCodeInput ? (
                <div className="mt-3 space-y-2">
                  <label
                    htmlFor="live-browser-step-up-code"
                    className="block text-xs font-medium uppercase tracking-[0.14em] text-slate-500"
                  >
                    MFA Or Recovery Code
                  </label>
                  <input
                    id="live-browser-step-up-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={stepUpCode}
                    onChange={(event) => onStepUpCodeChange(event.target.value)}
                    placeholder="Enter your 2FA or recovery code"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-cyan-500"
                  />
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onTakeControl}
                  disabled={takeoverDisabled || busyAction === "takeControl"}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Hand className="h-4 w-4" />
                  {compactViewport ? BROWSER_SESSION_COPY.manualControlUnavailable : BROWSER_SESSION_COPY.takeControl}
                </button>
                <button
                  type="button"
                  onClick={onReturnControl}
                  disabled={session.status !== "human_controlling" || busyAction === "returnControl"}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {BROWSER_SESSION_COPY.returnToAi}
                </button>
              </div>
              {compactViewport ? (
                <p className="mt-2 text-xs text-slate-500">
                  {browserSessionSummary.compactNotice}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Approval And Assist
              </p>
              <div className="mt-3 space-y-3">
                {session.pendingApprovalRequestId ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900">{BROWSER_SESSION_COPY.reviewRequired}</p>
                        <p className="mt-1 text-xs text-amber-800">
                          Request {session.pendingApprovalRequestId} is waiting on you.
                        </p>
                        {barrierPrompt ? (
                          <p className="mt-2 text-xs text-amber-900">{barrierPrompt}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={onApprove}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        {approvalLabels.approve}
                      </button>
                      <button
                        type="button"
                        onClick={onReject}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                      >
                        {approvalLabels.reject}
                      </button>
                    </div>
                  </div>
                ) : null}

                {session.pendingAssistRequestId ? (
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-cyan-700" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-cyan-900">{BROWSER_SESSION_COPY.needsYourInput}</p>
                        <p className="mt-1 text-xs text-cyan-800">
                          Request {session.pendingAssistRequestId} is waiting for your response.
                        </p>
                        {barrierPrompt ? (
                          <p className="mt-2 text-xs text-cyan-900">{barrierPrompt}</p>
                        ) : null}
                        {assistBarrierNotice ? (
                          <p className="mt-2 text-xs text-cyan-900">{assistBarrierNotice}</p>
                        ) : null}
                      </div>
                    </div>
                    {assistBarrierNotice ? null : (
                      <button
                        type="button"
                        onClick={onResolveAssist}
                        className="mt-3 rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-800"
                      >
                        Send Assist Response
                      </button>
                    )}
                  </div>
                ) : null}

                {!session.pendingApprovalRequestId && !session.pendingAssistRequestId ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    No approval or assist blockers are currently pending.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Session Details</p>
          <dl className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <dt>Session</dt>
              <dd className="truncate font-mono text-xs text-slate-500">{session.sessionId}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Source</dt>
              <dd>{browserSessionSummary.sourceLabel}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Tabs</dt>
              <dd>{session.activeTabCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Reconnect</dt>
              <dd>{reconnectLabel(reconnectState)}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={onCancelSession}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
          >
            <XCircle className="h-4 w-4" />
            End Browser Session
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Timeline</p>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {events.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No live events yet.
              </div>
            ) : (
              events.map((event) => (
                <div
                  key={event.eventId}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">
                      {event.type.replaceAll("_", " ")}
                    </p>
                    <span className="text-[11px] text-slate-500">v{event.sessionVersion}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{event.timestamp}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
