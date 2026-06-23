import type { AgentExperienceIntent, SmartSpecAgentEvent } from "@smartspec/agent-experience";

export interface AgentArtifactPaneProps {
  events: SmartSpecAgentEvent[];
  onIntent?: (intent: AgentExperienceIntent) => void;
}

export function AgentArtifactPane({ events, onIntent }: AgentArtifactPaneProps) {
  const artifactEvents = events.filter((event) => event.payload.kind === "artifact");
  if (artifactEvents.length === 0) return null;

  return (
    <section aria-label="Artifacts" className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-semibold text-slate-900">Artifacts</h3>
      <ul className="mt-2 space-y-2">
        {artifactEvents.map((event) => {
          const artifact = event.payload.kind === "artifact" ? event.payload.artifact : null;
          if (!artifact) return null;
          return (
            <li className="rounded-md bg-slate-50 p-2" key={event.id}>
              <div className="text-sm font-medium text-slate-900">{artifact.title ?? artifact.artifactId}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  aria-label="Open artifact"
                  onClick={() => onIntent?.({ type: "artifact.open", eventId: event.id, tenantId: event.tenantId, runId: event.runId, artifactId: artifact.artifactId })}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  aria-label="Copy artifact link"
                  onClick={() => onIntent?.({ type: "artifact.copy_link", eventId: event.id, tenantId: event.tenantId, runId: event.runId, artifactId: artifact.artifactId })}
                >
                  Copy
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
