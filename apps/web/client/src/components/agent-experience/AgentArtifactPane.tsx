import type { AgentExperienceIntent, SmartSpecAgentEvent } from "@smartspec/agent-experience";

export interface AgentArtifactPaneProps {
  events: SmartSpecAgentEvent[];
  onIntent?: (intent: AgentExperienceIntent) => void;
}

export function AgentArtifactPane({ events, onIntent }: AgentArtifactPaneProps) {
  const artifactEvents = events.filter((event) => event.payload.kind === "artifact");
  if (artifactEvents.length === 0) return null;

  return (
    <section aria-label="Artifacts">
      <h3>Artifacts</h3>
      <ul>
        {artifactEvents.map((event) => {
          const artifact = event.payload.kind === "artifact" ? event.payload.artifact : null;
          if (!artifact) return null;
          return (
            <li key={event.id}>
              <span>{artifact.title ?? artifact.artifactId}</span>
              <button
                type="button"
                aria-label="Open artifact"
                onClick={() => onIntent?.({ type: "artifact.open", eventId: event.id, tenantId: event.tenantId, runId: event.runId, artifactId: artifact.artifactId })}
              >
                Open
              </button>
              <button
                type="button"
                aria-label="Copy artifact link"
                onClick={() => onIntent?.({ type: "artifact.copy_link", eventId: event.id, tenantId: event.tenantId, runId: event.runId, artifactId: artifact.artifactId })}
              >
                Copy
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
