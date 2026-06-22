import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AGENT_EXPERIENCE_SCHEMA_VERSION, type SmartSpecAgentEvent } from "@smartspec/agent-experience";
import { AgentExperienceShell } from "../AgentExperienceShell";

function event(overrides: Partial<SmartSpecAgentEvent> = {}): SmartSpecAgentEvent {
  return {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    id: "evt-1",
    type: "approval.request",
    source: "agency",
    surface: "fixture_preview",
    visibility: "tenant",
    redaction: "summary",
    timestamp: "2026-06-22T00:00:00.000Z",
    tenantId: "tenant-1",
    runId: "run-1",
    payload: { kind: "approval", approval: { approvalId: "approval-1", status: "pending" } },
    ...overrides,
  };
}

describe("AgentExperienceShell", () => {
  it("renders loading, empty, error, and disabled states", () => {
    const { rerender } = render(<AgentExperienceShell events={[]} loading />);
    expect(screen.getByText("Loading fixture preview")).toBeInTheDocument();

    rerender(<AgentExperienceShell events={[]} />);
    expect(screen.getByText("No Agent Experience events")).toBeInTheDocument();

    rerender(<AgentExperienceShell events={[]} error="Bad fixture" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Bad fixture");

    rerender(<AgentExperienceShell events={[]} disabled locale="th" />);
    expect(screen.getByText("ปิดการแสดงตัวอย่าง Agent Experience อยู่")).toBeInTheDocument();
  });

  it("emits approval and artifact typed intents without mutation calls", () => {
    const onIntent = vi.fn();
    render(
      <AgentExperienceShell
        events={[
          event(),
          event({
            id: "artifact-event",
            type: "artifact.created",
            payload: { kind: "artifact", artifact: { artifactId: "artifact-1", format: "markdown", title: "Draft" } },
          }),
        ]}
        onIntent={onIntent}
      />
    );

    fireEvent.click(screen.getByLabelText("Approve request"));
    fireEvent.click(screen.getByLabelText("Open artifact"));

    expect(onIntent).toHaveBeenCalledWith(expect.objectContaining({ type: "approval.approve", approvalId: "approval-1" }));
    expect(onIntent).toHaveBeenCalledWith(expect.objectContaining({ type: "artifact.open", artifactId: "artifact-1" }));
  });

  it("keeps debug details denied unless allowed", () => {
    render(
      <AgentExperienceShell
        events={[event({ id: "debug-event", type: "debug.trace", payload: { kind: "debug", debug: { reason: "dropped" } } })]}
        debugAllowed={false}
      />
    );

    expect(screen.getByText("Debug details are unavailable")).toBeInTheDocument();
  });
});
