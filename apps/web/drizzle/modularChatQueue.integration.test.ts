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
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      application_name: "spec312-r124-single-owner-dev-admin",
    });
    await client.connect();
    try {
      const serverVersion = Number((await client.query("SELECT current_setting('server_version_num') AS version_num")).rows[0]?.version_num);
      expect(serverVersion).toBe(150017);
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
      const migrationHash = (tag: string) => createHash("sha256")
        .update(readFileSync(new URL(`./${tag}.sql`, import.meta.url))).digest("hex");
      const missionMigrationHash = migrationHash("0441_modular_chat_missions");
      const missionJobBindingMigrationHash = migrationHash("0443_modular_chat_explicit_mission_job_binding");
      const baselineHashes = [migrationHash("0439_modular_chat_output_artifacts"), migrationHash("0440_seedream_5_5_unified_model")];
      const appliedHashes = (await client.query("SELECT hash FROM drizzle.__drizzle_migrations")).rows.map((row) => row.hash);
      expect(appliedHashes).toEqual(expect.arrayContaining(baselineHashes));
      const missionMigrationApplied = appliedHashes.includes(missionMigrationHash);
      const missionTableExists = (await client.query("SELECT to_regclass('public.modular_chat_missions') AS table_name")).rows[0].table_name !== null;
      expect(missionTableExists).toBe(missionMigrationApplied);
      await client.query("BEGIN");
      const replayFunction = await client.query("SELECT to_regprocedure('public.list_modular_chat_job_events(integer,character varying,character varying,character varying,integer,integer)') AS procedure");
      expect(replayFunction.rows[0]?.procedure).not.toBeNull();
      expect((await client.query("SELECT to_regprocedure('public.list_modular_chat_conversation_execution(integer,character varying,character varying,integer)') AS procedure")).rows[0]?.procedure).not.toBeNull();
      expect((await client.query("SELECT to_regclass('public.worker_artifacts') AS table_name")).rows[0].table_name).not.toBeNull();
      if (!missionMigrationApplied) {
        await client.query(readFileSync(new URL("./0441_modular_chat_missions.sql", import.meta.url), "utf8"));
      }
      if (!appliedHashes.includes(missionJobBindingMigrationHash)) {
        await client.query(readFileSync(new URL("./0443_modular_chat_explicit_mission_job_binding.sql", import.meta.url), "utf8"));
      }
      const harnessProjection = (await client.query(`SELECT pg_get_functiondef(
        'public.list_modular_chat_harness_projection(integer,character varying,character varying)'::regprocedure
      ) AS definition`)).rows[0]?.definition as string;
      expect(harnessProjection).toContain("FROM public.modular_chat_mission_jobs binding");
      expect(harnessProjection).not.toContain("'missionId', NULL::varchar");
      const missionFunctions = (await client.query(`SELECT p.oid::regprocedure::text AS function_name,
          pg_get_userbyid(p.proowner) AS owner, p.proconfig,
          owner_role.rolcanlogin, owner_role.rolsuper, owner_role.rolcreatedb, owner_role.rolcreaterole,
          owner_role.rolbypassrls,
          has_schema_privilege(owner_role.oid, 'public', 'CREATE') AS owner_can_create_public,
          EXISTS (SELECT 1 FROM pg_auth_members membership WHERE membership.roleid = owner_role.oid) AS owner_has_members,
          EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
            WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS public_execute,
          has_function_privilege('modular_core_auth_dev', p.oid, 'EXECUTE') AS dev_execute
        FROM pg_proc p JOIN pg_roles owner_role ON owner_role.rolname = pg_get_userbyid(p.proowner)
        WHERE p.oid IN (
          to_regprocedure('public.create_modular_chat_mission(integer,character varying,character varying,integer)'),
          to_regprocedure('public.list_modular_chat_missions(integer,character varying,character varying,integer)'),
          to_regprocedure('public.list_modular_chat_task_control_projection(integer,character varying,character varying,integer)')
        ) ORDER BY p.proname`)).rows;
      expect(missionFunctions).toHaveLength(3);
      for (const fn of missionFunctions) {
        expect(fn).toMatchObject({ owner: "modular_chat_mission_owner", rolcanlogin: false, rolsuper: false,
          rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, owner_can_create_public: false,
          owner_has_members: false, public_execute: false, dev_execute: true,
          proconfig: ["search_path=pg_catalog, public"] });
      }
      expect((await client.query(`SELECT has_table_privilege('modular_core_auth_dev','public.modular_chat_missions','SELECT') AS can_select,
        has_table_privilege('modular_core_auth_dev','public.modular_chat_missions','INSERT') AS can_insert,
        has_table_privilege('modular_core_auth_dev','public.modular_chat_missions','UPDATE') AS can_update`)).rows[0])
        .toEqual({ can_select: false, can_insert: false, can_update: false });
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
      const began = await client.query("SELECT * FROM public.begin_modular_chat_turn_job($1,$2,$3,$4)", [first.job_id, lease, leaseHash, claim.fencing_version]);
      expect(began.rowCount).toBe(1);
      expect(began.rows[0]?.attempt_id).toEqual(expect.any(String));
      const complete = (await client.query("SELECT * FROM public.complete_modular_chat_turn_job($1,$2,$3,$4,$5,$6)", [first.job_id, lease, claim.fencing_version, "Diagnostic response", 1, 1])).rows[0];
      expect(complete.completed).toBe(true);
      const status = (await client.query("SELECT * FROM public.get_modular_chat_turn_job_status($1,$2,$3,$4)", [user.id, "modular-development", workspace.workspace_id, first.job_id])).rows[0];
      expect(status.job_status).toBe("succeeded");
      expect((await client.query("SELECT * FROM public.list_modular_chat_messages($1,$2,$3,$4)", [user.id, "modular-development", workspace.workspace_id, first.conversation_id])).rowCount).toBe(2);
      const execution = await client.query(
        "SELECT * FROM public.list_modular_chat_conversation_execution($1,$2,$3,$4)",
        [user.id, "modular-development", workspace.workspace_id, first.conversation_id],
      );
      expect(execution.rows).toHaveLength(2);
      const firstExecution = execution.rows.find((row) => row.job_id === first.job_id);
      expect(firstExecution).toMatchObject({ job_id: first.job_id, job_status: "succeeded", event_cursor: expect.any(Number) });
      const taskControl = await client.query(
        "SELECT * FROM public.list_modular_chat_task_control_projection($1,$2,$3,$4)",
        [user.id, "modular-development", workspace.workspace_id, first.conversation_id],
      );
      const firstTask = taskControl.rows.find((row) => row.job_id === first.job_id);
      expect(firstTask).toMatchObject({
        task_id: first.job_id, workspace_id: workspace.workspace_id, conversation_id: first.conversation_id,
        execution_status: "succeeded", attempt_id: expect.any(String), event_cursor: expect.any(Number),
      });
      const missionId = (await client.query(
        "SELECT public.create_modular_chat_mission($1,$2,$3,$4) AS mission_id",
        [user.id, "modular-development", workspace.workspace_id, first.conversation_id],
      )).rows[0].mission_id;
      const repeatedMissionId = (await client.query(
        "SELECT public.create_modular_chat_mission($1,$2,$3,$4) AS mission_id",
        [user.id, "modular-development", workspace.workspace_id, first.conversation_id],
      )).rows[0].mission_id;
      expect(repeatedMissionId).toBe(missionId);
      const mission = (await client.query(
        "SELECT * FROM public.list_modular_chat_missions($1,$2,$3,$4)",
        [user.id, "modular-development", workspace.workspace_id, first.conversation_id],
      )).rows[0];
      expect(mission).toMatchObject({ mission_id: missionId, tenant_id: "modular-development",
        workspace_id: workspace.workspace_id, conversation_id: first.conversation_id,
        status: "active", job_ids: [], event_cursor: 0, agent_ids: [] });
      const boundInput = [user.id, "modular-development", workspace.workspace_id, first.conversation_id,
        "Explicit Mission-bound DEV task", provider.provider_id, "diagnostic/free", randomUUID(), missionId];
      const boundJob = (await client.query(
        "SELECT * FROM public.create_modular_chat_turn_job_for_mission($1,$2,$3,$4,$5,$6,$7,$8,$9)", boundInput,
      )).rows[0];
      const boundRetry = (await client.query(
        "SELECT * FROM public.create_modular_chat_turn_job_for_mission($1,$2,$3,$4,$5,$6,$7,$8,$9)", boundInput,
      )).rows[0];
      expect(boundJob).toMatchObject({ created: true, conversation_id: first.conversation_id });
      expect(boundRetry).toMatchObject({ created: false, job_id: boundJob.job_id });
      const bindingRows = await client.query("SELECT mission_id, worker_job_id FROM public.modular_chat_mission_jobs");
      expect(bindingRows.rows).toEqual([{ mission_id: missionId, worker_job_id: boundJob.job_id }]);
      const boundOutbox = (await client.query(
        "SELECT * FROM public.prepare_modular_chat_turn_outbox($1,$2,$3)", ["modular-development", dispatchHash, boundJob.job_id],
      )).rows[0];
      expect((await client.query("SELECT public.mark_modular_chat_turn_outbox_published($1,$2,$3) AS ok",
        [boundOutbox.outbox_id, boundOutbox.dedupe_key, dispatchHash])).rows[0].ok).toBe(true);
      const boundLease = randomUUID();
      const boundLeaseHash = createHash("sha256").update(boundLease).digest("hex");
      const boundClaim = (await client.query("SELECT * FROM public.claim_modular_chat_turn_job($1,$2,$3)",
        [boundJob.job_id, boundLease, boundLeaseHash])).rows[0];
      const boundAttempt = (await client.query("SELECT * FROM public.begin_modular_chat_turn_job($1,$2,$3,$4)",
        [boundJob.job_id, boundLease, boundLeaseHash, boundClaim.fencing_version])).rows[0];
      expect(boundAttempt.attempt_id).toEqual(expect.any(String));
      expect((await client.query("SELECT * FROM public.complete_modular_chat_turn_job($1,$2,$3,$4,$5,$6)",
        [boundJob.job_id, boundLease, boundClaim.fencing_version, "Mission-bound diagnostic response", 1, 1])).rows[0].completed).toBe(true);
      const missionWithExplicitJob = (await client.query(
        "SELECT * FROM public.list_modular_chat_missions($1,$2,$3,$4)",
        [user.id, "modular-development", workspace.workspace_id, first.conversation_id],
      )).rows[0];
      expect(missionWithExplicitJob.job_ids).toEqual([boundJob.job_id]);
      await client.query("SAVEPOINT mission_binding_scope_check");
      await expect(client.query(
        "SELECT * FROM public.create_modular_chat_turn_job_for_mission($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [2147483647, "modular-development", workspace.workspace_id, first.conversation_id,
          "Unauthorized Mission-bound task", provider.provider_id, "diagnostic/free", randomUUID(), missionId],
      )).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK TO SAVEPOINT mission_binding_scope_check");
      const artifactId = randomUUID();
      const artifactMetadata = {
        schemaVersion: "smartaihub.chat-output-artifact.v1", contentType: "text/markdown; charset=utf-8",
        sizeBytes: 19, sha256: "a".repeat(64), expiresAt: new Date(Date.now() + 86400000).toISOString(),
        conversationId: first.conversation_id, workspaceId: workspace.workspace_id, userId: user.id,
        jobId: boundJob.job_id, attemptId: boundAttempt.attempt_id, attemptNumber: 1,
      };
      const storageRef = `chat-outputs/v1/modular-development/${workspace.workspace_id}/${boundJob.job_id}/attempt-1.md`;
      // Artifact persistence is an internal worker write, not a direct app-role capability.
      await client.query("RESET SESSION AUTHORIZATION");
      await client.query(`INSERT INTO public.worker_artifacts (id, "workerJobId", "artifactType", "storageRef", "metadataJson")
        VALUES ($1, $2, 'chat_output_markdown', $3, $4::jsonb)`, [artifactId, boundJob.job_id, storageRef, JSON.stringify(artifactMetadata)]);
      await client.query("SET LOCAL SESSION AUTHORIZATION modular_core_auth_dev");
      const artifacts = await client.query(
        "SELECT * FROM public.list_modular_chat_conversation_artifacts($1,$2,$3,$4)",
        [user.id, "modular-development", workspace.workspace_id, first.conversation_id],
      );
      expect(artifacts.rows).toHaveLength(1);
      expect(artifacts.rows[0]).toMatchObject({ artifact_id: artifactId, artifact_type: "chat_output_markdown", metadata_json: artifactMetadata });
      expect((await client.query(
        "SELECT * FROM public.get_modular_chat_output_artifact($1,$2,$3,$4)",
        [user.id, "modular-development", workspace.workspace_id, artifactId],
      )).rows[0]).toMatchObject({ storage_ref: storageRef, metadata_json: artifactMetadata });
      const missionWithArtifact = (await client.query(
        "SELECT * FROM public.list_modular_chat_missions($1,$2,$3,$4)",
        [user.id, "modular-development", workspace.workspace_id, first.conversation_id],
      )).rows[0];
      expect(missionWithArtifact.artifact_ids).toContain(artifactId);
      const events = (await client.query(
        "SELECT * FROM public.list_modular_chat_job_events($1,$2,$3,$4,0,100)",
        [user.id, "modular-development", workspace.workspace_id, first.job_id],
      )).rows;
      expect(events.length).toBeGreaterThanOrEqual(5);
      expect(events.map((event) => event.event_sequence)).toEqual([...events.map((event) => event.event_sequence)].sort((a, b) => a - b));
      expect(events.at(-1)?.event_type).toBe("SUCCEEDED");
      expect(JSON.stringify(events)).not.toMatch(/dedupeKey|outboxId|fencingVersion|leaseExpiresAt/i);
      await client.query("SAVEPOINT execution_scope_check");
      await expect(client.query(
        "SELECT * FROM public.list_modular_chat_conversation_execution($1,$2,$3,$4)",
        [2147483647, "modular-development", workspace.workspace_id, first.conversation_id],
      )).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK TO SAVEPOINT execution_scope_check");
      expect((await client.query(
        "SELECT * FROM public.list_modular_chat_job_events($1,$2,$3,$4,$5,100)",
        [user.id, "modular-development", workspace.workspace_id, first.job_id, events.at(-1)?.event_sequence],
      )).rowCount).toBe(0);
      expect((await client.query("SELECT * FROM public.get_modular_chat_provider_config($1,$2,$3,$4,$5)", [user.id, "modular-development", workspace.workspace_id, provider.provider_id, "x".repeat(101)])).rowCount).toBe(0);
      await client.query("SAVEPOINT scope_check");
      try {
        await expect(client.query("SELECT * FROM public.get_modular_chat_provider_config($1,$2,$3,$4,$5)", [2147483647, "modular-development", workspace.workspace_id, provider.provider_id, "diagnostic/free"])).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK TO SAVEPOINT scope_check");
        await client.query("SAVEPOINT event_scope_check");
        await expect(client.query("SELECT * FROM public.list_modular_chat_job_events($1,$2,$3,$4,0,100)", [2147483647, "modular-development", workspace.workspace_id, first.job_id])).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK TO SAVEPOINT event_scope_check");
        await client.query("SAVEPOINT artifact_scope_check");
        await expect(client.query("SELECT * FROM public.get_modular_chat_output_artifact($1,$2,$3,$4)", [2147483647, "modular-development", workspace.workspace_id, artifactId])).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK TO SAVEPOINT artifact_scope_check");
        await client.query("SAVEPOINT task_scope_check");
        await expect(client.query("SELECT * FROM public.list_modular_chat_task_control_projection($1,$2,$3,$4)", [2147483647, "modular-development", workspace.workspace_id, first.conversation_id])).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK TO SAVEPOINT task_scope_check");
        await client.query("SAVEPOINT mission_scope_check");
        await expect(client.query("SELECT * FROM public.list_modular_chat_missions($1,$2,$3,$4)", [2147483647, "modular-development", workspace.workspace_id, first.conversation_id])).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK TO SAVEPOINT mission_scope_check");
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT scope_check");
      }
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }
  }, 30000);
});
