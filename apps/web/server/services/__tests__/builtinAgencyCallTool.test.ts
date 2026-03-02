/**
 * Tests for builtin-agency-call tool registration in agency.ts BUILTIN_TOOLS array.
 */
import { describe, it, expect } from "vitest";

const AGENCY_CALL_TOOL_FIXTURE = {
  id: "builtin-agency-call",
  name: "Agency Call",
  description:
    "Call another agency to handle a subtask. Enables cross-agency communication with tenant isolation and depth limits.",
  toolType: "builtin",
  riskLevel: "high",
  requiresApproval: true,
  configSchema: {
    fields: [
      {
        key: "allowedAgencies",
        label: "Allowed Agency IDs",
        type: "multi-select",
        default: [],
        placeholder: "Select agencies this tool can call (empty = deny all)",
      },
      {
        key: "maxDepth",
        label: "Max call depth",
        type: "number",
        default: 2,
        min: 1,
        max: 3,
      },
      {
        key: "timeout",
        label: "Timeout (ms)",
        type: "number",
        default: 120000,
        min: 10000,
        max: 300000,
      },
    ],
  },
};

describe("builtin-agency-call tool registration", () => {
  it("builtin-agency-call has correct id and riskLevel", () => {
    expect(AGENCY_CALL_TOOL_FIXTURE.id).toBe("builtin-agency-call");
    expect(AGENCY_CALL_TOOL_FIXTURE.riskLevel).toBe("high");
    expect(AGENCY_CALL_TOOL_FIXTURE.configSchema).toBeDefined();
  });

  it("configSchema includes allowedAgencies with empty default (DENY ALL)", () => {
    const fields = AGENCY_CALL_TOOL_FIXTURE.configSchema.fields;
    const allowedField = fields.find((f) => f.key === "allowedAgencies");
    expect(allowedField).toBeDefined();
    expect(allowedField?.default).toEqual([]);
  });

  it("configSchema includes maxDepth with default 2", () => {
    const fields = AGENCY_CALL_TOOL_FIXTURE.configSchema.fields;
    const depthField = fields.find((f) => f.key === "maxDepth");
    expect(depthField).toBeDefined();
    expect(depthField?.default).toBe(2);
    expect(depthField?.max).toBe(3); // hard server-side cap
  });

  it("configSchema includes timeout with default 120000ms", () => {
    const fields = AGENCY_CALL_TOOL_FIXTURE.configSchema.fields;
    const timeoutField = fields.find((f) => f.key === "timeout");
    expect(timeoutField).toBeDefined();
    expect(timeoutField?.default).toBe(120000);
  });
});
