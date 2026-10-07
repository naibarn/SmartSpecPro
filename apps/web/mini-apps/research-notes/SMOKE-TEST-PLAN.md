# Research Notes deployment smoke and UAT plan

Status: prepared only. No deployment, migration, provider call, or live UAT has been performed.

## Preconditions

1. Select and register a non-production environment through the existing SPEC-295 deployment authority; do not infer an environment from `.development-repository.toml`.
2. Bind the deploy candidate to the SPAAS package digest emitted by `pnpm --filter @smartspec/web exec tsx scripts/build-research-notes-package.ts`.
3. Apply migration 0393 only to the selected disposable database through the approved migration lifecycle; capture the existing migration receipt and rollback evidence.
4. Prepare two authenticated tenant principals, two projects, and an active Research Notes App binding. Keep note content synthetic.

## Smoke sequence

Run the non-provider CRUD/readiness portion with an authenticated non-production target:

```sh
RESEARCH_NOTES_ENVIRONMENT=development \
RESEARCH_NOTES_BASE_URL=https://<registered-target> \
RESEARCH_NOTES_APP_ID=<public-app-id> \
RESEARCH_NOTES_PROJECT_ID=<authorized-project-id> \
RESEARCH_NOTES_AUTH_BEARER=<platform-issued-user-token> \
pnpm --filter @smartspec/web exec tsx scripts/research-notes-smoke.ts
```

Run the summary job scenario only in a cost-approved non-production environment by adding `--with-summary` and setting `RESEARCH_NOTES_ALLOW_PROVIDER_COST=true`. The runner refuses the production environment and never prints the credential.

1. `GET /healthz` returns HTTP 200 with `{"status":"ok"}`.
2. Open `/apps/{publicAppId}` using principal A; the Research Notes shell renders without client errors.
3. Call `researchNotes.listProjects` for the app and verify only A's authorized projects are returned.
4. Create a project and note, read them back, edit the note, then archive it. Confirm an edited note has no stale AI summary.
5. Call the same `researchNotes.createNote` and `researchNotes.listNotes` procedures from a headless tRPC client with A's authenticated platform session. Verify the persisted result matches the UI view.
6. As principal B, attempt to read A's project/note and poll A's summary job. Each call must fail closed without disclosing note content or job details.
7. As an authorized editor, request a summary. Verify the request returns a canonical job ID, `worker_jobs` plus outbox accept the job once, retries do not duplicate an already saved summary, and terminal status is visible in the UI and machine query.
8. Change the note after requesting its summary; verify the stale result is rejected and cannot overwrite the current note summary.
9. Capture package digest, integrated source SHA, migration receipt, target/environment identity, job ID, sanitized request/response evidence, and screenshots. Mark runtime/deployment/acceptance separately in SPEC-295/SPEC-302.

## Stop conditions

- Stop the run if the environment/tenant/App binding is ambiguous, the migration target is not disposable, credentials are unavailable, or the selected target is production without its normal release approval.
- Provider errors are recorded as retryable job outcomes; they do not become UAT PASS. Do not replay a paid summary request without the test owner's explicit authorization.
- Report `NOT_RUN` for every step not actually executed. Package build or local tests do not establish deployment or runtime readiness.
