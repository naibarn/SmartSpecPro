import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AgentRuntimeCheckpointSchema } from "../../../shared/agentRuntime/runtimeEvents";
import { persistAgentRuntimeCheckpoint } from "../agentRuntime/checkpointService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, "fixtures", "agentRuntime");

function readJsonFixture<T>(filename: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, filename), "utf8"),
  ) as T;
}

describe("persistAgentRuntimeCheckpoint", () => {
  it("checkpoint fixture parses in TypeScript", () => {
    const checkpoint = AgentRuntimeCheckpointSchema.parse(
      readJsonFixture("checkpoint.json"),
    );

    expect(checkpoint.checkpointId).toBe("checkpoint-1");
  });

  it("writes Chat checkpoints to the generic checkpoint store", async () => {
    const generic: unknown[] = [];
    const workOs: unknown[] = [];
    const checkpoint = AgentRuntimeCheckpointSchema.parse({
      ...readJsonFixture<Record<string, unknown>>("checkpoint.json"),
      surface: "chat",
      checkpointPayload: {
        authorization: "Bearer secret-token",
        state: "awaiting_human_review",
      },
    });

    const result = await persistAgentRuntimeCheckpoint({
      checkpoint,
      repository: {
        async upsertGenericCheckpoint(record) {
          generic.push(record);
        },
        async upsertWorkOsCheckpoint(record) {
          workOs.push(record);
        },
      },
    });

    expect(result.storage).toBe("generic");
    expect(generic).toHaveLength(1);
    expect(workOs).toHaveLength(0);
    expect(JSON.stringify(generic[0])).not.toContain("secret-token");
    expect(JSON.stringify(generic[0])).toContain("[REDACTED]");
  });

  it("uses Work OS checkpoint persistence for work-backed Team approvals", async () => {
    const generic: unknown[] = [];
    const workOs: unknown[] = [];
    const checkpoint = AgentRuntimeCheckpointSchema.parse(
      readJsonFixture("checkpoint.json"),
    );

    const result = await persistAgentRuntimeCheckpoint({
      checkpoint,
      workApprovalId: "approval-1",
      workAutomationRunId: "work-run-1",
      repository: {
        async upsertGenericCheckpoint(record) {
          generic.push(record);
        },
        async upsertWorkOsCheckpoint(record) {
          workOs.push(record);
        },
      },
    });

    expect(result.storage).toBe("work_os");
    expect(workOs).toHaveLength(1);
    expect(generic).toHaveLength(0);
  });
});
