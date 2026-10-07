import { describe, expect, it } from "vitest";

import {
  isPostgresNodeJobType,
  POSTGRES_NODE_JOB_TYPES,
} from "../feature186JobTypes";
import { defaultJobExecutorRegistry } from "../../services/jobExecutorRegistry";

describe("Feature 195 PostgreSQL node worker admission", () => {
  it("admits external_agent_task through the canonical worker path", () => {
    expect(POSTGRES_NODE_JOB_TYPES.has("external_agent_task")).toBe(true);
    expect(isPostgresNodeJobType("external_agent_task")).toBe(true);
  });

  it("admits the registered Google Drive cleanup job through the canonical worker path", () => {
    expect(POSTGRES_NODE_JOB_TYPES.has("gdrive.edit_session_cleanup")).toBe(true);
    expect(isPostgresNodeJobType("gdrive.edit_session_cleanup")).toBe(true);
  });

  it("routes Research Notes summaries to the server-owned canonical worker executor", () => {
    expect(isPostgresNodeJobType("research_notes.summarize")).toBe(true);
    expect(defaultJobExecutorRegistry.resolve("research_notes.summarize", "mini-app-research-v1")).toBeDefined();
  });

  it("does not register the retired workflow-node executor in the canonical worker", () => {
    expect(isPostgresNodeJobType("workflow.node.execute")).toBe(false);
    expect(defaultJobExecutorRegistry.resolve("workflow.node.execute", "feature-186-v1")).toBeUndefined();
  });

  it("does not broaden admission to arbitrary external job types", () => {
    expect(isPostgresNodeJobType("external_agent_task:arbitrary")).toBe(false);
    expect(isPostgresNodeJobType("runner.exec")).toBe(false);
  });
});
