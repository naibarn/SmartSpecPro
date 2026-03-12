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

type LiveReconnectState = "connected" | "reconnecting" | "stream_unavailable";

interface LiveBrowserWorkspaceProps {
  session: LiveBrowserSession;
  events: LiveBrowserEventEnvelope[];
  reconnectState: LiveReconnectState;
  compactViewport: boolean;
  commandDraft: string;
  busyAction: string | null;
  onCommandDraftChange: (value: string) => void;
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

function buildAnnouncement(
  session: LiveBrowserSession,
  reconnectState: LiveReconnectState,
): string {
  if (reconnectState === "stream_unavailable") {
    return "Live stream unavailable. Refresh before continuing.";
  }
  if (session.pendingApprovalRequestId) {
    return "Approval requested. Agent is waiting for human input.";
  }
  if (session.pendingAssistRequestId) {
    return "Assist request received. Agent is waiting for your response.";
  }
  if (session.status === "human_controlling") {
    return "You have browser control.";
  }
  if (session.status === "waiting_for_human") {
    return "Live session is waiting for you.";
  }
  if (session.status === "expired") {
    return "Live session expired.";
  }
  if (reconnectState === "reconnecting") {
    return "Reconnecting to live session.";
  }
  return "Live session connected.";
}

export function LiveBrowserWorkspace({
  session,
  events,
  reconnectState,
  compactViewport,
  commandDraft,
  busyAction,
  onCommandDraftChange,
  onSendCommand,
  onRefresh,
  onTakeControl,
  onReturnControl,
  onApprove,
  onReject,
  onResolveAssist,
  onCancelSession,
}: LiveBrowserWorkspaceProps) {
  const takeoverDisabled =
    compactViewport ||
    reconnectState !== "connected" ||
    session.status === "expired" ||
    session.status === "failed" ||
    session.status === "failed_recovery_required";

  return (
    <div className="space-y-4" data-testid="live-browser-workspace">
      <div className="sr-only" aria-live="polite">
        {buildAnnouncement(session, reconnectState)}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-slate-50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MonitorPlay className="h-5 w-5 text-cyan-300" />
              <h3 className="text-sm font-semibold">Live Browser Workspace</h3>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-2 py-1 font-medium ${statusTone(session.status)}`}>
                {session.status.replaceAll("_", " ")}
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-1 font-medium text-slate-200">
                {session.controlMode.replaceAll("_", " ")}
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
              <div className="mt-6 space-y-2 text-xs text-slate-400">
                <p>URL</p>
                <p className="truncate text-sm text-slate-100">
                  {String(session.browserContextRef?.url ?? "Awaiting navigation")}
                </p>
              </div>
              <div className="mt-6 rounded-lg bg-slate-950/70 p-3 text-xs text-slate-300">
                Timeline and controls remain outside the remote canvas so ownership, reconnect,
                and approval states stay explicit.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Command Rail</p>
              <textarea
                value={commandDraft}
                onChange={(event) => onCommandDraftChange(event.target.value)}
                placeholder="Ask the live agent to continue on this browser session."
                className="mt-3 min-h-[110px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={onSendCommand}
                disabled={!commandDraft.trim() || busyAction === "sendCommand"}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {busyAction === "sendCommand" ? "Queuing..." : "Queue Command"}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Human Controls</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onTakeControl}
                  disabled={takeoverDisabled || busyAction === "takeControl"}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Hand className="h-4 w-4" />
                  {compactViewport ? "Takeover unavailable on mobile" : "Take Control"}
                </button>
                <button
                  type="button"
                  onClick={onReturnControl}
                  disabled={session.status !== "human_controlling" || busyAction === "returnControl"}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Return Control
                </button>
              </div>
              {compactViewport ? (
                <p className="mt-2 text-xs text-slate-500">
                  Mobile and small tablet layouts keep the session read-only for manual control.
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
                        <p className="text-sm font-medium text-amber-900">Approval requested</p>
                        <p className="mt-1 text-xs text-amber-800">
                          Request {session.pendingApprovalRequestId} is waiting on you.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={onApprove}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={onReject}
                        className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ) : null}

                {session.pendingAssistRequestId ? (
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-cyan-700" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-cyan-900">Assist requested</p>
                        <p className="mt-1 text-xs text-cyan-800">
                          Request {session.pendingAssistRequestId} is waiting for your response.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onResolveAssist}
                      className="mt-3 rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-800"
                    >
                      Send Assist Response
                    </button>
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
              <dd>{session.sourceType}</dd>
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
            End Live Session
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
