import { describe, expect, it } from "vitest";
import {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  validateSmartSpecAgentEvent,
  type SmartSpecAgentEvent,
} from "../index";

function validEvent(overrides: Partial<SmartSpecAgentEvent> = {}): SmartSpecAgentEvent {
  return {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    id: "evt-1",
    type: "message.delta",
    source: "agency",
    surface: "agency_chat",
    visibility: "tenant",
    redaction: "summary",
    timestamp: "2026-06-22T00:00:00.000Z",
    tenantId: "tenant-1",
    payload: {
      kind: "message",
      message: { delta: "Hello" },
    },
    ...overrides,
  };
}

describe("Agent Experience schemas", () => {
  it("exports the expected schema version", () => {
    expect(AGENT_EXPERIENCE_SCHEMA_VERSION).toBe("2026-06-22-v1");
  });

  it("accepts a valid event envelope", () => {
    const result = validateSmartSpecAgentEvent(validEvent());
    expect(result.events).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("fails closed on unsupported future schema versions", () => {
    const result = validateSmartSpecAgentEvent({
      ...validEvent(),
      schemaVersion: "2099-01-01-v1",
    });
    expect(result.events).toHaveLength(0);
    expect(result.dropped[0]?.reason).toBe("unsupported_schema");
  });

  it("rejects unknown event, source, surface, visibility, and redaction values", () => {
    for (const override of [
      { type: "unknown" },
      { source: "unknown" },
      { surface: "unknown_surface" },
      { visibility: "everyone" },
      { redaction: "raw" },
    ]) {
      const result = validateSmartSpecAgentEvent({ ...validEvent(), ...override });
      expect(result.events).toHaveLength(0);
      expect(result.dropped).toHaveLength(1);
    }
  });

  it("reports malformed and missing identity diagnostics", () => {
    expect(validateSmartSpecAgentEvent(null).dropped[0]?.reason).toBe("malformed");
    expect(validateSmartSpecAgentEvent(validEvent({ tenantId: undefined })).dropped[0]?.reason)
      .toBe("missing_identity");
  });
});
