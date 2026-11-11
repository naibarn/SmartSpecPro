import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const enabled = process.env.RUN_MODULAR_CHAT_DB_INTEGRATION === "true";
const suite = enabled ? describe : describe.skip;

suite("Modular Chat queue database contract", () => {
  it("creates, retries, dispatches and completes a scoped turn in a rolled-back transaction", async () => {
    const connectionString = process.env.MODULAR_CHAT_TEST_DATABASE_URL;
    const email = process.env.MODULAR_CHAT_TEST_EMAIL;
    if (!connectionString || !email) throw new Error("MODULAR_CHAT_TEST_DATABASE_URL and MODULAR_CHAT_TEST_EMAIL are required");
    const client = new Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
    await client.connect();
    try {
      const user = (await client.query("SELECT id FROM public.users WHERE lower(email) = lower($1) LIMIT 1", [email])).rows[0];
      expect(user).toBeDefined();
      const workspace = (await client.query(`SELECT member.workspace_id FROM public.modular_workspace_members AS member
        JOIN public.modular_workspaces AS workspace ON workspace.id = member.workspace_id
          AND workspace.environment_tenant_id = member.environment_tenant_id
        WHERE member.user_id = $1 AND member.environment_tenant_id = $2
          AND member.is_active AND workspace.is_active ORDER BY workspace.is_default DESC LIMIT 1`,
      [user.id, "modular-development"])).rows[0];
      const provider = (await client.query("SELECT provider_id FROM public.modular_chat_llm_model_catalog WHERE provider_name = 'openrouter' LIMIT 1")).rows[0];
      expect(workspace).toBeDefined();
      expect(provider).toBeDefined();
      await client.query("BEGIN");
      await client.query(readFileSync(new URL("./0427_modular_chat_queue_sql_fix.sql", import.meta.url), "utf8"));
      await client.query("SET LOCAL SESSION AUTHORIZATION modular_core_auth_dev");
      const input = [user.id, "modular-development", workspace.workspace_id, null, "Diagnostic request", provider.provider_id, "diagnostic/free", randomUUID()];
      const create = "SELECT * FROM public.create_modular_chat_turn_job($1,$2,$3,$4,$5,$6,$7,$8)";
      const first = (await client.query(create, input)).rows[0];
      const retry = (await client.query(create, input)).rows[0];
      const followup = (await client.query(create, [...input.slice(0, 3), first.conversation_id, ...input.slice(4, 7), randomUUID()])).rows[0];
      expect(first.created).toBe(true);
      expect(first.conversation_id).toBeGreaterThan(0);
      expect(retry.created).toBe(false);
      expect(retry.job_id).toBe(first.job_id);
      expect(followup.conversation_id).toBe(first.conversation_id);

      const dispatchHash = "a".repeat(64);
      const outbox = (await client.query("SELECT * FROM public.prepare_modular_chat_turn_outbox($1,$2,$3)", ["modular-development", dispatchHash, first.job_id])).rows[0];
      expect(outbox).toBeDefined();
      const published = (await client.query("SELECT public.mark_modular_chat_turn_outbox_published($1,$2,$3) AS ok", [outbox.outbox_id, outbox.dedupe_key, dispatchHash])).rows[0];
      expect(published.ok).toBe(true);
      const lease = randomUUID();
      const leaseHash = createHash("sha256").update(lease).digest("hex");
      const claim = (await client.query("SELECT * FROM public.claim_modular_chat_turn_job($1,$2,$3)", [first.job_id, lease, leaseHash])).rows[0];
      expect(claim.claim_status).toBe("claimed");
      expect((await client.query("SELECT * FROM public.begin_modular_chat_turn_job($1,$2,$3,$4)", [first.job_id, lease, leaseHash, claim.fencing_version])).rowCount).toBe(1);
      const complete = (await client.query("SELECT * FROM public.complete_modular_chat_turn_job($1,$2,$3,$4,$5,$6)", [first.job_id, lease, claim.fencing_version, "Diagnostic response", 1, 1])).rows[0];
      expect(complete.completed).toBe(true);
      const status = (await client.query("SELECT * FROM public.get_modular_chat_turn_job_status($1,$2,$3,$4)", [user.id, "modular-development", workspace.workspace_id, first.job_id])).rows[0];
      expect(status.job_status).toBe("succeeded");
      expect((await client.query("SELECT * FROM public.list_modular_chat_messages($1,$2,$3,$4)", [user.id, "modular-development", workspace.workspace_id, first.conversation_id])).rowCount).toBe(2);
      expect((await client.query("SELECT * FROM public.get_modular_chat_provider_config($1,$2,$3,$4,$5)", [user.id, "modular-development", workspace.workspace_id, provider.provider_id, "x".repeat(101)])).rowCount).toBe(0);
      await client.query("SAVEPOINT scope_check");
      try {
        await expect(client.query("SELECT * FROM public.get_modular_chat_provider_config($1,$2,$3,$4,$5)", [2147483647, "modular-development", workspace.workspace_id, provider.provider_id, "diagnostic/free"])).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT scope_check");
      }
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }
  }, 30000);
});
