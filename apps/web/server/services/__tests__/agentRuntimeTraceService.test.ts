import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AgentRuntimeTraceEventSchema } from "../../../shared/agentRuntime/runtimeEvents";
import {
  persistAgentRuntimeTraceEvents,
  type AgentRuntimeTraceRepository,
} from "../agentRuntime/traceService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, "fixtures", "agentRuntime");

function readJsonFixture<T>(filename: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, filename), "utf8"),
  ) as T;
}

describe("persistAgentRuntimeTraceEvents", () => {
  it("shared fixtures parse as TypeScript runtime trace events", () => {
    const events = readJsonFixture<unknown[]>("duplicate-stream.json").map(event =>
      AgentRuntimeTraceEventSchema.parse(event),
    );

    expect(events).toHaveLength(2);
    expect(events[0]?.eventName).toBe("response.output_text.delta");
  });

  it("redacts trace metadata before persistence and deduplicates stable events", async () => {
    const traces: unknown[] = [];
    const teamEvents: unknown[] = [];
    const repository: AgentRuntimeTraceRepository = {
      async upsertRuntimeTrace(record) {
        traces.push(record);
      },
      async upsertTeamTraceEvent(record) {
        teamEvents.push(record);
      },
    };

    const result = await persistAgentRuntimeTraceEvents({
      tenantId: "tenant-1",
      runId: "run-1",
      roomId: "room-1",
      surface: "team",
      events: readJsonFixture("duplicate-stream.json"),
      repository,
    });

    expect(result).toEqual({
      persisted: 1,
      duplicatesSkipped: 1,
    });
    expect(traces).toHaveLength(1);
    expect(teamEvents).toHaveLength(1);
    expect(JSON.stringify(traces[0])).not.toContain("secret-token");
    expect(JSON.stringify(traces[0])).toContain("[REDACTED]");
  });
});
