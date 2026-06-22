import { describe, expect, it } from "vitest";
import {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  assertNoSensitiveDebugValue,
  filterAgentExperienceEventsForRenderer,
  type SmartSpecAgentEvent,
} from "../index";

function debugEvent(overrides: Partial<SmartSpecAgentEvent> = {}): SmartSpecAgentEvent {
  return {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    id: "debug-1",
    type: "debug.trace",
    source: "debug",
    surface: "admin_debug",
    visibility: "debug_only",
    redaction: "metadata_only",
    timestamp: "2026-06-22T00:00:00.000Z",
    tenantId: "tenant-1",
    traceId: "trace-1",
    payload: { kind: "debug", debug: { reason: "parse", fields: { token: "sk-secretvalue123456" } } },
    ...overrides,
  };
}

describe("Agent Experience redaction", () => {
  it("denies debug/private events by default", () => {
    const result = filterAgentExperienceEventsForRenderer([
      debugEvent(),
      debugEvent({ id: "private-1", visibility: "private_internal" }),
    ]);

    expect(result.events).toEqual([]);
    expect(result.dropped.map((item) => item.reason)).toEqual(["unauthorized_visibility", "private_internal"]);
  });

  it("allows authorized debug users to receive sanitized previews only", () => {
    const result = filterAgentExperienceEventsForRenderer([debugEvent()], {
      debugAllowed: true,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.payload).toMatchObject({
      kind: "debug",
      debug: { fields: { token: "[redacted]" } },
    });
  });

  it("truncates long metadata and detects secret-shaped values", () => {
    const result = filterAgentExperienceEventsForRenderer([
      debugEvent({ payload: { kind: "debug", debug: { fields: { note: "x".repeat(150) } } } }),
    ], { debugAllowed: true, maxMetadataValueLength: 8 });

    expect(result.events[0]?.payload).toMatchObject({
      kind: "debug",
      debug: { fields: { note: "xxxxxxxx..." } },
    });
    expect(assertNoSensitiveDebugValue({ value: "oauth_token=abc" })).toBe(false);
  });
});
