import { describe, expect, it } from "vitest";

import {
  isPostgresNodeJobType,
  POSTGRES_NODE_JOB_TYPES,
} from "../feature186JobTypes";

describe("Feature 195 PostgreSQL node worker admission", () => {
  it("admits external_agent_task through the canonical worker path", () => {
    expect(POSTGRES_NODE_JOB_TYPES.has("external_agent_task")).toBe(true);
    expect(isPostgresNodeJobType("external_agent_task")).toBe(true);
  });

  it("admits the registered Google Drive cleanup job through the canonical worker path", () => {
    expect(POSTGRES_NODE_JOB_TYPES.has("gdrive.edit_session_cleanup")).toBe(true);
    expect(isPostgresNodeJobType("gdrive.edit_session_cleanup")).toBe(true);
  });

  it("does not broaden admission to arbitrary external job types", () => {
    expect(isPostgresNodeJobType("external_agent_task:arbitrary")).toBe(false);
    expect(isPostgresNodeJobType("runner.exec")).toBe(false);
  });
});
