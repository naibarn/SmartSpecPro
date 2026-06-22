import type { SmartSpecAgentEvent } from "@smartspec/agent-experience";

export interface AgentTimelineProps {
  events: SmartSpecAgentEvent[];
}

function eventLabel(event: SmartSpecAgentEvent): string {
  switch (event.payload.kind) {
    case "message":
      return event.payload.message.delta ?? event.payload.message.text ?? event.type;
    case "tool":
      return event.payload.tool.summary ?? event.payload.tool.toolName ?? event.type;
    case "workflow":
      return event.payload.workflow.label ?? event.type;
    case "approval":
      return `Approval ${event.payload.approval.status}`;
    case "artifact":
      return event.payload.artifact.title ?? event.payload.artifact.artifactId;
    case "cost":
      return event.payload.cost.approximate ? "Approximate cost" : "Cost";
    case "debug":
      return event.payload.debug.reason ?? event.type;
    case "empty":
      return event.type;
  }
}

export function AgentTimeline({ events }: AgentTimelineProps) {
  return (
    <ol aria-label="Agent event timeline">
      {events.map((event) => (
        <li key={event.id}>
          <span>{event.type}</span>
          <p>{eventLabel(event)}</p>
        </li>
      ))}
    </ol>
  );
}
