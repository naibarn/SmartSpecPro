import { describe, expect, it } from "vitest";
import { activeSchemaContract, postgresIdentifier } from "../schema-audit-policy";

describe("active schema audit boundary", () => {
  it("excludes retired stores while retaining active Studio, shared job control and unknown objects", () => {
    const source = { tables: {
      "public.agencies": { name: "agencies", columns: { state: { type: "retired_state" } } },
      "public.workflows": { name: "workflows" },
      "public.sandbox_jobs": { name: "sandbox_jobs" },
      "public.workflow_studio_runs": { name: "workflow_studio_runs", columns: { state: { type: "state" } } },
      "public.worker_jobs": { name: "worker_jobs", foreignKeys: { old_fk: { tableTo: "agencies" }, active_fk: { tableTo: "workflow_studio_runs" } } },
      "public.extension_data": { name: "extension_data" },
    }, enums: { "public.state": { name: "state" }, "public.retired_state": { name: "retired_state" } } };
    const result = activeSchemaContract(source);
    expect(Object.keys(result.contract.tables)).toEqual(["public.workflow_studio_runs", "public.worker_jobs", "public.extension_data"]);
    expect(result.retiredReferences).toEqual(["worker_jobs.old_fk"]);
    expect(result.contract.enums).toHaveProperty("public.state");
    expect(result.unusedEnums).toEqual(["retired_state"]);
    expect(source.tables["public.worker_jobs"].foreignKeys).toHaveProperty("old_fk");
  });

  it("matches PostgreSQL byte truncation without splitting a UTF-8 identifier", () => {
    expect(postgresIdentifier("a".repeat(70))).toBe("a".repeat(63));
    expect(Buffer.byteLength(postgresIdentifier("ก".repeat(22)))).toBe(63);
  });
});
