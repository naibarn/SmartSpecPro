# Mini App fresh runtime baseline

This is a disposable acceptance projection for the Research Notes and Project Wiki Pages reference apps. It includes tenant/user identity, stable App and canonical Project authority, the two Mini App data tables, and the existing `worker_jobs`/outbox tables. It does not create a second job queue or a full application schema.

The projection deliberately excludes the retired Agency, legacy custom workflow, workpacks, and OpenSandbox schemas. `workflow_templates` remains present in the broad `drizzle/schema.ts` projection, while migration `0015_naive_franklin_richards` assumes it already exists and no earlier journaled migration creates it. For this Mini App acceptance baseline, that is a historical migration-chain assumption, not a Mini App dependency; no compatibility table is created.

The Mini App tables and selected worker control-plane tables do not require pgvector. A fresh projection was migrated and validated without the `vector` extension. The broader full-application schema has separate vector consumers, so this result does not claim that the entire SmartSpecPro application can run without pgvector.

## Run

```sh
pnpm --filter @smartspec/web run test:mini-app-runtime-baseline
```

The script creates a disposable PostgreSQL cluster bound to loopback when no target is supplied, runs only this projection's migration journal, checks required and excluded tables, exercises tenant/project constraints, note/page limits and active-path reuse, and inserts a synthetic `worker_jobs` plus outbox pair inside a rolled-back transaction. It stops and removes only the temporary cluster it created.

An externally provisioned test target may be supplied with `MINI_APP_BASELINE_DATABASE_URL`; the configuration accepts only `localhost`/`127.0.0.1` and a database named `miniapp_*_test`. The script refuses to run when `DATABASE_URL` is set. It never calls the historical full-schema migration journal or `db:push`.

This baseline validates schema/bootstrap and database contracts only. It does not establish an authenticated web session, start the app runtime, deploy a package, or pass API/UI UAT.

## Migration maintenance

The baseline migration defers foreign-key `ALTER TABLE` statements until after its unique indexes. PostgreSQL requires composite referenced indexes to exist before those FKs are added. When regenerating the projection migration, preserve that ordering before using the guarded migrate/test script.
