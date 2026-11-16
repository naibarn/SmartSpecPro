import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./0442_runner_harness_instances.sql", import.meta.url), "utf8");

describe("0442 native Harness projection migration", () => {
  it("uses stable server identities scoped to the enrolled Runner and adapter tool", () => {
    expect(migration).toContain('"id" uuid PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(migration).toContain('ON "runner_harness_instances" ("tenantId", "runnerId", "adapterId", "toolId")');
    expect(migration).toContain('ADD COLUMN "harnessInstanceId" uuid REFERENCES "runner_harness_instances"("id")');
  });

  it("projects only authorized workspace executions and preserves absent Mission as null", () => {
    expect(migration).toContain("public.assert_modular_chat_workspace_access(p_user_id, p_environment_tenant_id, p_workspace_id)");
    expect(migration).toContain("scoped_job.\"requestedByUserId\" = p_user_id");
    expect(migration).toContain("'attemptId', a.id");
    expect(migration).toContain("'eventCursor'");
    expect(migration).toContain("'missionId', NULL::varchar");
    expect(migration).toContain("h.\"workspaceIds\", 'unknown'::varchar");
    expect(migration).not.toContain("LEFT JOIN public.modular_chat_missions");
    expect(migration).not.toContain("m.\"conversation_id\"");
  });

  it("keeps the catalog callable only by the modular Core runtime principals", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.list_modular_chat_harness_projection(integer, varchar, varchar) FROM PUBLIC");
    expect(migration).toContain("TO modular_core_auth_dev");
    expect(migration).toContain("TO modular_core_auth_prod");
  });
});
