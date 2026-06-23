import { useMemo, useState } from "react";
import {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  agencyStreamToAgentEvents,
  runStreamToAgentEvents,
  type AgencyStreamLikeEvent,
  type AgentExperienceDroppedEvent,
  type AgentExperienceIntent,
  type AgentExperienceParseResult,
  type RunStreamLikeEvent,
  type SmartSpecAgentEvent,
} from "@smartspec/agent-experience";
import { AgentExperienceShell } from "@/components/agent-experience/AgentExperienceShell";

type PreviewFixture = {
  id: string;
  label: string;
  surface: string;
  source: "agency" | "team" | "fixture";
  description: string;
  build: (includeDebug: boolean) => AgentExperienceParseResult;
};

const TENANT_ID = "tenant-demo";
const RUN_ID = "run-demo";

function emptyResult(): AgentExperienceParseResult {
  return { events: [], dropped: [] };
}

function manualEvent(
  id: string,
  type: SmartSpecAgentEvent["type"],
  payload: SmartSpecAgentEvent["payload"],
  overrides: Partial<SmartSpecAgentEvent> = {},
): SmartSpecAgentEvent {
  return {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    id,
    type,
    source: "fixture",
    surface: "fixture_preview",
    visibility: "tenant",
    redaction: "summary",
    timestamp: "2026-06-22T00:08:00.000Z",
    tenantId: TENANT_ID,
    runId: RUN_ID,
    payload,
    ...overrides,
  };
}

const agencyHappyPath: AgencyStreamLikeEvent[] = [
  { event: "meta", id: "1", ts: "2026-06-22T00:00:00.000Z", data: { runId: RUN_ID, agencyId: "agency-demo" } },
  { event: "text_delta", id: "2", ts: "2026-06-22T00:00:01.000Z", data: { agentName: "Researcher", delta: "Synthetic summary" } },
  { event: "tool_start", id: "3", ts: "2026-06-22T00:00:02.000Z", data: { agentName: "Researcher", toolName: "synthetic-search", toolCallId: "tc-demo" } },
  { event: "tool_progress", id: "4", ts: "2026-06-22T00:00:03.000Z", data: { toolCallId: "tc-demo", message: "Searching synthetic index" } },
  { event: "tool_end", id: "5", ts: "2026-06-22T00:00:04.000Z", data: { toolCallId: "tc-demo", status: "success", result: "Synthetic result" } },
  { event: "run_complete", id: "6", ts: "2026-06-22T00:00:05.000Z", data: { runId: RUN_ID } },
];

const agencyApprovalPath: AgencyStreamLikeEvent[] = [
  {
    event: "approval_required",
    id: "approval-evt-1",
    ts: "2026-06-22T00:02:00.000Z",
    data: {
      approvalKey: "approval-demo",
      step: "Review",
      risk: "Synthetic approval request",
      agentName: "Reviewer",
    },
  },
];

const agencyArtifactPath: AgencyStreamLikeEvent[] = [
  {
    event: "preview_ready",
    id: "artifact-event-1",
    ts: "2026-06-22T00:06:00.000Z",
    data: { artifactId: "artifact-demo", title: "Synthetic preview", summary: "Pointer only" },
  },
];

const agencyMalformedPath: AgencyStreamLikeEvent[] = [
  { event: "unknown_event", id: "bad-1", ts: "2026-06-22T00:03:00.000Z", data: {} },
  { event: "text_delta", id: "bad-2", ts: "2026-06-22T00:03:01.000Z", data: null as unknown as Record<string, unknown> },
];

const teamRunPath: RunStreamLikeEvent[] = [
  {
    eventId: "team-1",
    eventType: "workflow.step.started",
    tenantId: TENANT_ID,
    teamId: "team-demo",
    roomId: "room-demo",
    runId: RUN_ID,
    ts: "2026-06-22T00:04:00.000Z",
    actorType: "assistant",
    actorId: "agent-demo",
    visibility: "transparent",
    data: { stepId: "research", label: "Research" },
  },
  {
    eventId: "team-2",
    eventType: "message_delta",
    tenantId: TENANT_ID,
    teamId: "team-demo",
    roomId: "room-demo",
    runId: RUN_ID,
    ts: "2026-06-22T00:04:01.000Z",
    actorType: "assistant",
    actorId: "agent-demo",
    visibility: "transparent",
    data: { delta: "Synthetic update" },
  },
  {
    eventId: "team-3",
    eventType: "tool_start",
    tenantId: TENANT_ID,
    teamId: "team-demo",
    roomId: "room-demo",
    runId: RUN_ID,
    ts: "2026-06-22T00:04:02.000Z",
    actorType: "assistant",
    actorId: "agent-demo",
    visibility: "transparent",
    data: { toolCallId: "tc-team", toolName: "planner" },
  },
  {
    eventId: "team-private",
    eventType: "workflow.step.started",
    tenantId: TENANT_ID,
    teamId: "team-demo",
    roomId: "room-demo",
    runId: RUN_ID,
    ts: "2026-06-22T00:04:03.000Z",
    actorType: "system",
    actorId: "system",
    visibility: "private_internal",
    data: { stepId: "private", label: "Hidden internal step" },
  },
  {
    eventId: "team-debug",
    eventType: "opaque.debug",
    tenantId: TENANT_ID,
    teamId: "team-demo",
    roomId: "room-demo",
    runId: RUN_ID,
    ts: "2026-06-22T00:04:04.000Z",
    actorType: "system",
    actorId: "system",
    visibility: "debug_only",
    data: { code: "synthetic_debug" },
  },
];

const PREVIEW_FIXTURES: PreviewFixture[] = [
  {
    id: "agency-happy-path",
    label: "Agency happy path",
    surface: "Agency Chat",
    source: "agency",
    description: "Streaming message, tool activity, and completed workflow.",
    build: () => agencyStreamToAgentEvents(agencyHappyPath, { tenantId: TENANT_ID, runId: RUN_ID, surface: "fixture_preview" }),
  },
  {
    id: "agency-approval-path",
    label: "Approval request",
    surface: "Agency Chat",
    source: "agency",
    description: "Pending approval card and intent-only approve/deny actions.",
    build: () => agencyStreamToAgentEvents(agencyApprovalPath, { tenantId: TENANT_ID, runId: RUN_ID, surface: "fixture_preview" }),
  },
  {
    id: "artifact-pointer-path",
    label: "Artifact pointer",
    surface: "Artifact Panel",
    source: "agency",
    description: "Pointer-only artifact preview without privileged content.",
    build: () => agencyStreamToAgentEvents(agencyArtifactPath, { tenantId: TENANT_ID, runId: RUN_ID, surface: "fixture_preview" }),
  },
  {
    id: "team-run-path",
    label: "Team run path",
    surface: "Team Room",
    source: "team",
    description: "Team workflow, message, tool event, and visibility filtering.",
    build: (includeDebug) => runStreamToAgentEvents(teamRunPath, { surface: "fixture_preview", includeDebugEvents: includeDebug }),
  },
  {
    id: "malformed-path",
    label: "Malformed input",
    surface: "Adapter Guard",
    source: "agency",
    description: "Unsupported and malformed events stay out of the renderer.",
    build: () => agencyStreamToAgentEvents(agencyMalformedPath, { tenantId: TENANT_ID, runId: RUN_ID, surface: "fixture_preview" }),
  },
  {
    id: "flags-off",
    label: "Flags off rollback",
    surface: "Rollback",
    source: "fixture",
    description: "Empty event set used to verify fallback rendering.",
    build: emptyResult,
  },
  {
    id: "composite",
    label: "Composite preview",
    surface: "Developer Preview",
    source: "fixture",
    description: "Combined workflow, approval, artifact, cost, and debug trace.",
    build: () => ({
      events: [
        ...agencyStreamToAgentEvents(agencyHappyPath.slice(0, 3), { tenantId: TENANT_ID, runId: RUN_ID, surface: "fixture_preview" }).events,
        manualEvent("fixture:approval", "approval.request", {
          kind: "approval",
          approval: { approvalId: "approval-composite", status: "pending", risk: "Synthetic spend approval" },
        }),
        manualEvent("fixture:artifact", "artifact.created", {
          kind: "artifact",
          artifact: { artifactId: "artifact-composite", title: "Composite draft", format: "markdown", preview: "Pointer only" },
        }),
        manualEvent("fixture:cost", "cost.estimate", {
          kind: "cost",
          cost: { amount: 0.42, currency: "USD", approximate: true, source: "estimate" },
        }),
        manualEvent("fixture:debug", "debug.trace", {
          kind: "debug",
          debug: { reason: "synthetic_debug", fields: { fixture: true } },
        }, { visibility: "debug_only", redaction: "metadata_only" }),
      ],
      dropped: [],
    }),
  },
];

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function DroppedEvents({ dropped }: { dropped: AgentExperienceDroppedEvent[] }) {
  if (dropped.length === 0) {
    return <p className="text-sm text-emerald-700">No dropped events for this scenario.</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {dropped.map((event, index) => (
        <li className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900" key={`${event.reason}-${event.sourceEventId ?? index}`}>
          <span className="font-medium">{event.reason}</span>
          <span className="text-amber-800">: {event.message}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminAgentExperiencePreview() {
  const [fixtureId, setFixtureId] = useState(PREVIEW_FIXTURES[0]!.id);
  const [debugAllowed, setDebugAllowed] = useState(false);
  const [intentLog, setIntentLog] = useState<AgentExperienceIntent[]>([]);

  const fixture = PREVIEW_FIXTURES.find((item) => item.id === fixtureId) ?? PREVIEW_FIXTURES[0]!;
  const result = useMemo(() => fixture.build(debugAllowed), [debugAllowed, fixture]);
  const eventTypes = useMemo(() => countBy(result.events.map((event) => event.type)), [result.events]);
  const visibilityCounts = useMemo(() => countBy(result.events.map((event) => event.visibility)), [result.events]);

  const handleIntent = (intent: AgentExperienceIntent) => {
    setIntentLog((current) => [intent, ...current].slice(0, 8));
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Admin / Developer Preview</p>
            <h1 className="text-2xl font-semibold">Agent Experience Preview</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Fixture-only preview for adapter output, renderer states, visibility filtering, and intent wiring.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(220px,320px)_auto] sm:items-end">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Scenario
              <select
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm"
                value={fixtureId}
                onChange={(event) => {
                  setFixtureId(event.target.value);
                  setIntentLog([]);
                }}
              >
                {PREVIEW_FIXTURES.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
              <input
                type="checkbox"
                checked={debugAllowed}
                onChange={(event) => setDebugAllowed(event.target.checked)}
              />
              Debug
            </label>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <Stat label="Rendered events" value={result.events.length} />
          <Stat label="Dropped events" value={result.dropped.length} />
          <Stat label="Source" value={fixture.source} />
          <Stat label="Surface" value={fixture.surface} />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{fixture.label}</h2>
                <p className="text-sm text-slate-600">{fixture.description}</p>
              </div>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                schema {AGENT_EXPERIENCE_SCHEMA_VERSION}
              </span>
            </div>
            <AgentExperienceShell
              events={result.events}
              debugAllowed={debugAllowed}
              locale="en"
              onIntent={handleIntent}
            />
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Event Breakdown</h2>
              <div className="mt-3 space-y-2 text-sm">
                {Object.keys(eventTypes).length === 0 ? (
                  <p className="text-slate-500">No renderer events.</p>
                ) : (
                  Object.entries(eventTypes).map(([type, count]) => (
                    <div className="flex items-center justify-between gap-3" key={type}>
                      <span className="text-slate-600">{type}</span>
                      <span className="font-semibold text-slate-950">{count}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3 text-sm">
                {Object.entries(visibilityCounts).map(([visibility, count]) => (
                  <div className="flex items-center justify-between gap-3" key={visibility}>
                    <span className="text-slate-600">{visibility}</span>
                    <span className="font-semibold text-slate-950">{count}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Dropped Events</h2>
              <div className="mt-3">
                <DroppedEvents dropped={result.dropped} />
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Intent Log</h2>
              <div className="mt-3 space-y-2 text-sm">
                {intentLog.length === 0 ? (
                  <p className="text-slate-500">No preview intents captured.</p>
                ) : (
                  intentLog.map((intent, index) => (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2" key={`${intent.type}-${intent.eventId}-${index}`}>
                      <div className="font-medium text-slate-900">{intent.type}</div>
                      <div className="mt-1 break-all text-xs text-slate-500">{intent.eventId}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
