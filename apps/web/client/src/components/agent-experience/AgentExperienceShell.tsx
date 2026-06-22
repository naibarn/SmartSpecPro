import type { AgentExperienceIntent, SmartSpecAgentEvent } from "@smartspec/agent-experience";
import { AgentApprovalCard } from "./AgentApprovalCard";
import { AgentArtifactPane } from "./AgentArtifactPane";
import { AgentTimeline } from "./AgentTimeline";

export interface AgentExperienceShellProps {
  events: SmartSpecAgentEvent[];
  loading?: boolean;
  disabled?: boolean;
  error?: string | null;
  locale?: "en" | "th";
  debugAllowed?: boolean;
  onIntent?: (intent: AgentExperienceIntent) => void;
}

const COPY = {
  en: {
    loading: "Loading fixture preview",
    empty: "No Agent Experience events",
    disabled: "Agent Experience preview is disabled",
    error: "Agent Experience preview could not render",
    debugDenied: "Debug details are unavailable",
  },
  th: {
    loading: "กำลังโหลดตัวอย่าง",
    empty: "ยังไม่มีเหตุการณ์ Agent Experience",
    disabled: "ปิดการแสดงตัวอย่าง Agent Experience อยู่",
    error: "ไม่สามารถแสดงตัวอย่าง Agent Experience ได้",
    debugDenied: "ไม่สามารถดูรายละเอียด debug ได้",
  },
} as const;

export function AgentExperienceShell({
  events,
  loading = false,
  disabled = false,
  error = null,
  locale = "en",
  debugAllowed = false,
  onIntent,
}: AgentExperienceShellProps) {
  const copy = COPY[locale];
  const approvalEvents = events.filter((event) => event.payload.kind === "approval");
  const artifactEvents = events.filter((event) => event.payload.kind === "artifact");
  const debugEvents = events.filter((event) => event.payload.kind === "debug");

  if (disabled) {
    return <section aria-label="Agent Experience preview">{copy.disabled}</section>;
  }

  if (loading) {
    return <section aria-label="Agent Experience preview" aria-busy="true">{copy.loading}</section>;
  }

  if (error) {
    return <section aria-label="Agent Experience preview" role="alert">{copy.error}: {error}</section>;
  }

  return (
    <section className="agent-experience-shell" aria-label="Agent Experience preview">
      <div className="agent-experience-shell__timeline">
        {events.length === 0 ? copy.empty : <AgentTimeline events={events} />}
      </div>
      <aside className="agent-experience-shell__side" aria-label="Agent Experience details">
        {approvalEvents.map((event) => (
          <AgentApprovalCard key={event.id} event={event} onIntent={onIntent} />
        ))}
        <AgentArtifactPane events={artifactEvents} onIntent={onIntent} />
        {debugEvents.length > 0 && (
          <details>
            <summary>{debugAllowed ? "Debug" : copy.debugDenied}</summary>
            {debugAllowed && (
              <ul>
                {debugEvents.map((event) => (
                  <li key={event.id}>{event.payload.kind === "debug" ? event.payload.debug.reason : event.type}</li>
                ))}
              </ul>
            )}
          </details>
        )}
      </aside>
    </section>
  );
}
