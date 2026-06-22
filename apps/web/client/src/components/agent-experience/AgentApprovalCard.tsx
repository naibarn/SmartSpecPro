import type { AgentExperienceIntent, SmartSpecAgentEvent } from "@smartspec/agent-experience";

export interface AgentApprovalCardProps {
  event: SmartSpecAgentEvent;
  onIntent?: (intent: AgentExperienceIntent) => void;
}

export function AgentApprovalCard({ event, onIntent }: AgentApprovalCardProps) {
  if (event.payload.kind !== "approval") return null;
  const approval = event.payload.approval;

  return (
    <article aria-label="Approval request">
      <h3>Approval</h3>
      <p>{approval.risk ?? "Pending review"}</p>
      <button
        type="button"
        aria-label="Approve request"
        onClick={() => onIntent?.({ type: "approval.approve", eventId: event.id, tenantId: event.tenantId, runId: event.runId, approvalId: approval.approvalId })}
      >
        Approve
      </button>
      <button
        type="button"
        aria-label="Deny request"
        onClick={() => onIntent?.({ type: "approval.deny", eventId: event.id, tenantId: event.tenantId, runId: event.runId, approvalId: approval.approvalId })}
      >
        Deny
      </button>
    </article>
  );
}
