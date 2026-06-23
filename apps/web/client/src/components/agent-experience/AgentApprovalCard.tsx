import type { AgentExperienceIntent, SmartSpecAgentEvent } from "@smartspec/agent-experience";

export interface AgentApprovalCardProps {
  event: SmartSpecAgentEvent;
  onIntent?: (intent: AgentExperienceIntent) => void;
}

export function AgentApprovalCard({ event, onIntent }: AgentApprovalCardProps) {
  if (event.payload.kind !== "approval") return null;
  const approval = event.payload.approval;

  return (
    <article aria-label="Approval request" className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <h3 className="text-sm font-semibold text-amber-950">Approval</h3>
      <p className="mt-1 text-sm text-amber-900">{approval.risk ?? "Pending review"}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
          aria-label="Approve request"
          onClick={() => onIntent?.({ type: "approval.approve", eventId: event.id, tenantId: event.tenantId, runId: event.runId, approvalId: approval.approvalId })}
        >
          Approve
        </button>
        <button
          type="button"
          className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          aria-label="Deny request"
          onClick={() => onIntent?.({ type: "approval.deny", eventId: event.id, tenantId: event.tenantId, runId: event.runId, approvalId: approval.approvalId })}
        >
          Deny
        </button>
      </div>
    </article>
  );
}
