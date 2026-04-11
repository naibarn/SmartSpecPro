import { RoleHealthBadge } from "./RoleHealthBadge";

interface RoleCommsMessage {
  id: string;
  intentType: string;
  contentSummary: string;
  priority?: string | null;
  dueState?: string | null;
  actionabilityState?: string | null;
  visibilityClass?: string | null;
  relatedRoutineId?: string | null;
  relatedWorkpackFamily?: string | null;
  createdAt: string;
}

function toneForIntent(intentType: string): "healthy" | "warning" | "danger" | "muted" {
  if (intentType === "handoff" || intentType === "approval_request") return "warning";
  if (intentType === "dependency_block" || intentType === "escalate") return "danger";
  if (intentType === "shared_finding" || intentType === "status_summary") return "healthy";
  return "muted";
}

export function RoleCommsStream({ messages }: { messages: RoleCommsMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-slate-500">No typed role communication yet.</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div key={message.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <RoleHealthBadge label={message.intentType.replace(/_/g, " ")} tone={toneForIntent(message.intentType)} />
            {message.priority ? <RoleHealthBadge label={`Priority ${message.priority}`} /> : null}
            {message.dueState ? <RoleHealthBadge label={`Due ${message.dueState}`} /> : null}
            {message.actionabilityState ? <RoleHealthBadge label={message.actionabilityState.replace(/_/g, " ")} /> : null}
          </div>
          <p className="mt-3 text-sm text-slate-800">{message.contentSummary}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
            <span>Visibility {message.visibilityClass ?? "n/a"}</span>
            <span>Routine {message.relatedRoutineId ?? "n/a"}</span>
            <span>Workpack {message.relatedWorkpackFamily ?? "n/a"}</span>
            <span>{new Date(message.createdAt).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
