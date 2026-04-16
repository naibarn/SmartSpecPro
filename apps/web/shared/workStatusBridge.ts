import type { TeamRun } from "../drizzle/schema";

export type WorkOsStateHint =
  | "planned"
  | "triaged"
  | "in_progress"
  | "waiting_for_choice"
  | "waiting_for_review"
  | "waiting_for_approval"
  | "waiting_for_input"
  | "blocked"
  | "escalated"
  | "completed"
  | "cancelled"
  | "failed"
  | "new";

export type TeamRunStatusHint = TeamRun["status"] | "cancelled" | "waiting_for_worker" | "waiting_for_poll" | "awaiting_human_approval" | "awaiting_human_choice" | "awaiting_final_review" | "awaiting_final_approval";

export interface StatusBridge {
  teamRunStatus: TeamRunStatusHint;
  workOsState: WorkOsStateHint;
  note: string;
}

export type StatusBridgeTone = "sky" | "amber" | "emerald" | "rose" | "slate";

export function mapTeamRunStatusToWorkOsState(
  status: TeamRun["status"],
  stopReason?: string | null,
): WorkOsStateHint {
  switch (status) {
    case "queued":
      return "planned";
    case "running":
      return "in_progress";
    case "paused":
      if (stopReason === "awaiting_human_choice") return "waiting_for_choice";
      if (stopReason === "awaiting_final_review") return "waiting_for_review";
      if (stopReason === "awaiting_final_approval") return "waiting_for_approval";
      if (stopReason === "awaiting_human_approval") return "waiting_for_approval";
      if (stopReason === "awaiting_external_member") return "in_progress";
      if (stopReason === "user_paused") return "waiting_for_input";
      return "blocked";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "stopped":
      return stopReason === "user_requested" ? "cancelled" : "blocked";
    default:
      return "blocked";
  }
}

export function mapWorkOsStateToTeamRunStatus(state: string | null | undefined): TeamRunStatusHint {
  switch (state) {
    case "planned":
    case "triaged":
      return "queued";
    case "in_progress":
      return "running";
    case "waiting_for_approval":
      return "awaiting_human_approval";
    case "waiting_for_review":
      return "awaiting_final_review";
    case "waiting_for_choice":
      return "awaiting_human_choice";
    case "waiting_for_input":
      return "waiting_for_poll";
    case "blocked":
    case "escalated":
      return "waiting_for_worker";
    case "completed":
      return "completed";
    case "cancelled":
    case "failed":
      return state;
    default:
      return "queued";
  }
}

export function describeStatusBridge(
  status: TeamRun["status"],
  stopReason?: string | null,
): StatusBridge {
  const workOsState = mapTeamRunStatusToWorkOsState(status, stopReason);
  return {
    teamRunStatus: status,
    workOsState,
    note: stopReason ? `Mapped from ${status} (${stopReason})` : `Mapped from ${status}`,
  };
}

export function getStatusBridgeTone(workOsState: WorkOsStateHint): StatusBridgeTone {
  switch (workOsState) {
    case "completed":
      return "emerald";
    case "in_progress":
    case "planned":
    case "triaged":
      return "sky";
    case "waiting_for_approval":
    case "waiting_for_choice":
    case "waiting_for_review":
    case "waiting_for_input":
      return "amber";
    case "blocked":
    case "escalated":
    case "failed":
      return "rose";
    case "cancelled":
      return "slate";
    default:
      return "slate";
  }
}

export function getStatusBridgeBadgeClass(workOsState: WorkOsStateHint): string {
  switch (getStatusBridgeTone(workOsState)) {
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "sky":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "rose":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "slate":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}
