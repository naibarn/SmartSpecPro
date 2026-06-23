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
    <ol aria-label="Agent event timeline" className="space-y-3">
      {events.map((event) => (
        <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" key={event.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase text-slate-500">{event.type}</span>
            <span className="text-xs text-slate-500">{new Date(event.timestamp).toLocaleTimeString()}</span>
          </div>
          <p className="mt-1 text-sm text-slate-900">{eventLabel(event)}</p>
        </li>
      ))}
    </ol>
  );
}
