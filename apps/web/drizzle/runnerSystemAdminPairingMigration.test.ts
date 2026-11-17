import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("./0447_modular_runner_system_admin_pairing.sql", import.meta.url), "utf8");

describe("0447 DEV system-admin Runner pairing scope", () => {
  it("limits the reserved system scope to enabled global admins on the DEV Core principal", () => {
    expect(migration).toContain("session_user='modular_core_auth_dev'");
    expect(migration).toContain("p_environment_tenant_id='modular-development'");
    expect(migration).toContain("p_tenant_id='__system__'");
    expect(migration).toContain("account.\"role\"::text='admin'");
    expect(migration).toContain('account."isDisabled" IS FALSE');
    expect(migration).toContain("tenant.id='__system__' AND tenant.\"isActive\" IS TRUE");
    expect(migration).toContain("p_environment_tenant_id='modular-development' AND EXISTS");
  });

  it("keeps ordinary tenant pairing membership-scoped and separate from Chat workspace authorization", () => {
    expect(migration).toContain("membership.user_id=p_user_id AND membership.tenant_id=p_tenant_id");
    expect(migration).toContain("membership.is_active IS TRUE");
    expect(migration).toContain("public.assert_modular_runner_pairing_access");
    expect(migration).not.toContain("assert_modular_chat_workspace_access");
    expect(migration).toContain("v_expires:=now()+interval '60 minutes'");
  });

  it("keeps the new authorization helper private to the restricted function owner", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.assert_modular_runner_pairing_access(integer,varchar,varchar) FROM PUBLIC");
    expect(migration).toContain("ALTER FUNCTION public.assert_modular_runner_pairing_access(integer,varchar,varchar) OWNER TO modular_chat_mission_owner");
  });
});
