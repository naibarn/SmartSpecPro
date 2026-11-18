import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./0450_modular_runner_system_admin_approval.sql", import.meta.url), "utf8");

describe("0450 system-admin Runner approval scope", () => {
  it("authorizes through the Runner-specific environment and tenant boundary", () => {
    expect(migration).toContain("session_user WHEN 'modular_core_auth_dev' THEN 'modular-development'");
    expect(migration).toContain("public.assert_modular_runner_pairing_access((v->>'userId')::integer,v_environment,v->>'tenantId')");
    expect(migration).not.toContain("assert_modular_chat_workspace_access");
  });

  it("preserves pairing proof, expiry, locking, and idempotent same-owner approval", () => {
    expect(migration).toContain("user_code_hash=v->>'userCodeHash'");
    expect(migration).toContain("environment_tenant_id=v_environment FOR UPDATE");
    expect(migration).toContain("v_pair.expires_at<=now()");
    expect(migration).toContain("v_pair.status IN ('consumed','denied')");
    expect(migration).toContain("v_pair.tenant_id=v->>'tenantId'");
    expect(migration).toContain("v_pair.approved_by=(v->>'userId')::integer");
    expect(migration).toContain("SET status='approved',tenant_id=v->>'tenantId'");
  });

  it("keeps the function under the restricted owner and the registered migration preflight", () => {
    expect(migration).toContain("current_database() <> 'smartspec'");
    expect(migration).toContain("SET LOCAL ROLE modular_chat_mission_owner");
    expect(migration).toContain("SECURITY DEFINER SET search_path=pg_catalog,public");
    expect(migration).toContain("RESET ROLE");
  });
});
