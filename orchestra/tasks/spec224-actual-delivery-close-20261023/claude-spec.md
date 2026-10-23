# SPEC-224 Actual Delivery Closure

## Objective

Deliver an inspectable, resumable Personal Mini-App from authenticated prompt to hosted private preview, then verify one real expense-tracker journey in a browser and deploy the integrated Core change through the repository's existing release path.

## Accepted requirements

The user supplied concrete requirements in `mission.md`. This task resumes at `origin/main` SHA `cb3ca17b2d88a9126e57dcd27af15b4191400b0d`; it must not restart already integrated architecture work. The acceptance prompt is: “Create a mobile-friendly personal expense tracker with income, expenses and a monthly summary chart.”

The result must:

1. Keep BUILDING, PREVIEW_AVAILABLE, USER_TRIAL_READY, VERIFICATION_PENDING and BUILD_FAILED distinct. Show a usable private preview as soon as its artifact is bound. USER_TRIAL_READY requires independent browser journey evidence.
2. Bind every generated app to its own durable SmartAIHub-managed or user-owned GitHub repository. Retain source snapshots while repository setup waits. Never use the Core repository or Core runtime SHA as app source identity.
3. Keep `/miniapp/{appId}` owner-scoped and useful during build, after failure and while continuing work. Show identity, source, job/stage, errors, build history, artifacts and preview where available.
4. Preserve separate CORE_DEVELOPMENT and ISOLATED_APP_DEVELOPMENT behavior, same-app resumption and the existing protected Runner boundary.
5. Prove authenticated Start -> durable `worker_jobs`/outbox -> hosted Gateway generation -> source snapshot -> artifact storage/binding -> owner preview -> private Home.
6. Verify add-income, add-expense, totals/chart, reload persistence, mobile usability and unauthorized-read denial in a real browser. Never turn mocked or local-only evidence into deployed/user acceptance.
7. Build and deploy the exact integrated Core candidate once through `build:canonical` and `release:web:linux`; verify the runtime SHA and HTTPS journey.

## Constraints

- Use a disposable non-production PostgreSQL database and authorized non-production provider/GitHub configuration. Never substitute production data, credentials, databases or processes.
- Reuse existing policy and approval records. Do not add another approval framework or weaken source trust, tenant isolation, audit, billing, Worker admission, deployment or sudo controls.
- Do not use retired Agency, workpacks, workflows, OpenSandbox or `sandbox_jobs`.
- Preserve unrelated dirty workspaces and unknown worktrees. Do not force-push, edit production databases, or bypass release authorization.
- Keep Development Acceptance distinct from Production Release Acceptance.

## Current evidence and known gaps

- Canonical code is at `cb3ca17b2d88a9126e57dcd27af15b4191400b0d`; production release status reports runtime SHA `26640e87162576a1505e02a026cc35a846eb8517`.
- Focused Mini-App tests pass 52/52 after updating stale `MiniAppRoute` response fixtures.
- The disposable Mini-App baseline migration succeeded and has two existing pilot users and one tenant. A development server passed health/readiness once, but its broad background services queried tables absent from that focused schema; a later start blocked in uninterruptible I/O. No app identity or worker job was created.
- An unauthenticated probe for a nonexistent Mini-App returned no app data (404). No actual App ID, Gateway receipt, browser journey or deployed feature acceptance exists.
- Root storage is nearly full (about 5.8 GB free); current I/O pressure has fluctuated substantially. `sudo -n -v` reports that an interactive password is required.
- Existing implementation exposes a milestone transition hook, but the personal profile does not wire a trusted trial-verification transition. Repository provisioning currently has a managed-repository implementation; user-owned binding and its verified lifecycle need reconciliation.

## Definition of Done

All code and tests in sections 01–02 are integrated. An authenticated non-production run creates one real app and a durable Gateway job, binds a model-generated artifact and dedicated repository, renders the private app for its owner, resumes under the same appId, preserves prior source/artifact after a failed attempt, and denies another user. Independent browser evidence records USER_TRIAL_READY only after the specified mobile/browser journey passes. The exact candidate is built and released through the standard Linux release controller, and the deployed revision and HTTPS behavior are verified. Anything missing remains explicitly pending; no partial result is called full E2E PASS.
