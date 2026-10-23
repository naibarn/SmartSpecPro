
MISSION: SPEC-224 — CLOSE ACTUAL DELIVERY GAPS
NO MORE REPEATED CERTIFICATION LOOPS

Repository: naibarn/SmartSpecPro
Canonical: latest origin/main

OBJECTIVE

Complete the already integrated Personal Mini-App
implementation and make it genuinely usable.

Do not restart SPEC-224 planning.
Do not redo PostgreSQL acceptance.
Do not repeat completed architecture work.
Do not regenerate handoff as the primary output.

FIX 1 — TRIAL MILESTONE

Inspect:
- miniAppFactoryRunExecutor.ts
- miniAppFactoryRuntime.ts
- factory-pipeline.v1.json

Fix the missing PERSONAL_MINIAPP trial milestone
transition.

Distinguish:
- BUILDING
- PREVIEW_AVAILABLE
- USER_TRIAL_READY
- VERIFICATION_PENDING
- BUILD_FAILED

An available preview must be immediately visible
even when independent browser verification is
not yet available.

Do not manufacture a browser PASS.

FIX 2 — APP REPOSITORY OWNERSHIP

Every generated app requires its own dedicated
GitHub repository.

Modes:
- SmartAIHub-managed repository
- User-owned GitHub repository

Never use the SmartAIHub or SmartSpecPro core
repository for generated application source.

Replace placeholder repository references with
durable actual repository bindings.

Do not identify app source using the Core
runtime Git SHA.

Persist generated source snapshots independently
while repository provisioning is pending.

Do not lose partial work.

FIX 3 — ALWAYS ACCESSIBLE APP HOME

/miniapp/{appId} must work from App creation.

Render the latest available information:
- App identity and owner
- Source/workspace state
- Development progress
- Active job and stage
- Latest errors
- Build history
- Source snapshot
- Latest artifact
- Preview or download
- Continue / feedback

A failed build must not hide the App Home.

Do not require USER_TRIAL_READY before showing
partial project results.

FIX 4 — CORRECT THE TWO DEVELOPMENT PATHS

CORE_DEVELOPMENT:
- Authorized SmartAIHub/SmartSpecPro core repo
- Branch/worktree integration
- Merge into core main
- Core build/release

ISOLATED_APP_DEVELOPMENT:
- Dedicated per-app GitHub repo
- App-specific workspace
- App-specific build and artifacts
- No core repo modifications
- No core release for individual app updates

Use one shared SPEC-224 orchestrator.
Preserve SPEC-310 harness boundaries.

FIX 5 — RESUME WITHOUT RESTART

New feedback must reuse:
- Existing appId
- Repository
- Workspace
- Source revision
- Artifacts
- Build history
- Development checkpoints

A failed stage must not create a new App.

Repair and retry within the original bounded
authorization where eligible.

FIX 6 — VERIFY HOSTED JOB EXECUTION

Prove the actual path:

Authenticated Start
-> App Identity
-> Durable Factory Job
-> Hosted Gateway Generation
-> App Source Snapshot
-> Artifact Storage
-> Artifact Binding
-> Private Preview
-> User-visible App Home

Use actual model execution for the final trial.
Do not rely only on mocked tests.

Check worker registration, outbox dispatch,
stage continuation and persisted receipts.

FIX 7 — DEPLOY CORE ONCE

After integrating code fixes:

1. Identify the exact release candidate SHA.
2. Complete focused verification.
3. Prepare its immutable release artifact.
4. Check whether an authorized release mechanism
   already exists for the Linux web service.
5. Use the existing authorized deployment path.
6. Verify the deployed revision and HTTPS route.

Do not bypass sudo, forge release permission or
weaken production service protections.

If promotion requires a human release operator,
produce one exact actionable release request.

Do not classify normal code development as
blocked by that release operation.

Avoid re-running the entire canonical build
merely because unrelated documentation advanced
main, unless the existing release contract
genuinely requires a new build.

FIX 8 — ACTUAL USER ACCEPTANCE

Create one Personal Expense Tracker from
an authenticated non-production user account.

Verify:
- App ID is created
- App Home opens immediately
- Source is retained
- Preview becomes available
- Primary functions work
- User can reload and continue
- Build failure retains prior source/artifact
- Unauthorized users cannot read private data

Record the actual URL and execution evidence.

SUCCESS CRITERIA

Do not return only "tests passed".

Return:
1. Exact integrated source SHA
2. Exact deployed Core runtime SHA, if deployed
3. Real App ID and URL, if created
4. Actual execution result
5. Latest source and artifact references
6. Whether owner can open the preview
7. Any single genuinely external action remaining

If deployment authority is unavailable,
retain all implementation and source snapshots.

Do not restart development and do not create
additional certification blockers.

The product goal is continuous, inspectable,
resumable development — not 100% certification
before the user may see their app.

EXECUTE THE MISSING IMPLEMENTATION.
