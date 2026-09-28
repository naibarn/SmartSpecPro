# Feature 162/163 Gap Closure Design

## Status

Approved design for implementation on 2026-08-25. The work closes the static
implementation gaps found in the seven-round completeness audit while keeping
existing Vertical Drama generation, legacy Worker routes, and published media
backward compatible.

## Outcome

The system must provide one usable path from a Series and local Worker root to
verified derived media, and one usable path from a nine-shot storyboard to a
Worker-owned generated shot. The server remains the authority for tenant,
Series, workflow policy, job admission, artifact publication, and indexing.
The Worker remains the authority for local paths, FFmpeg/GPU execution, MCP
transport, source privacy, and derived-output verification.

## Approach

Use compatibility-first implementation waves:

1. Shared contracts, access authority, migration additions, and workflow policy
   are added first and fail closed when the new evidence is absent.
2. Native MCP and local analysis are upgraded behind existing feature flags.
3. Storyboard dispatch uses the new typed Worker job path without removing the
   existing provider video path.
4. Worker navigation becomes canonical-screen based while old tab identifiers
   remain aliases.
5. Each wave has focused tests, typecheck, and a convergence review before the
   next wave.

This costs more implementation time than a UI-only patch, but avoids a false
success where controls exist without an executable, tenant-safe job path.

## Authority and data flow

```text
Web storyboard / Worker App
        |
        v
Server access + workflow policy + shot revision admission
        |
        v
worker_jobs (binding/policy/revision pinned)
        |
        v
Worker local root -> analysis/edit plan -> FFmpeg or GPU/MCP
        |
        v
derived artifact + checksum + QC + lineage
        |
        v
R2 publication -> Series media asset -> vector index -> B-roll/draft retrieval
```

Raw local paths, source bytes, provider credentials, arbitrary Comfy graphs,
and browser-supplied identity are never accepted as authority-bearing data.

## Server and persistence

- Replace the owner-only Worker principal shortcut with a durable connected
  device/Worker resolver. Private mode remains owner-only; group and tenant
  modes require explicit persisted policy and resolve owner before group before
  tenant policy. Hidden Series returns the same not-found shape.
- Add capability booleans to the safe Series projection and re-check them on
  list, detail, bind, process, and publish mutations.
- Add missing binding metadata and foreign keys additively. Existing rows are
  not deleted or rewritten; a dry-run reports unresolved owner/policy conflicts.
- Add versioned workflow registry and Admin operation policy records. A policy
  stores default workflow/version, allowlist, lock/override rule, capability
  requirements, fallback policy, and audit lineage.
- Resolve and persist immutable `WorkflowResolution` before job admission.
  Policy, probe, input, or revision changes mark it stale and block silent
  switching.
- Add a server shot-generation mutation that validates Series, episode, shot
  revision, start frame, ordered references, policy, capability probe, and
  idempotency before inserting `shot_video_generation`.

## Native Worker and MCP

- MCP startup must negotiate protocol version, inspect `tools/list`, validate
  the required `run_workflow` input schema, and expose only probed workflow IDs
  and capabilities in heartbeat metadata.
- The Worker must reject missing/old tool schemas, unavailable workflow IDs,
  unsupported frame roles, invalid output materialization, and unknown output
  paths. No production shot path uses direct ComfyUI HTTP.
- MCP execution persists a remote execution ID and supports bounded poll,
  cancellation, restart reconciliation, and idempotent output collection.
- Local media analysis produces a bounded manifest containing probe data,
  dead-air intervals, black/frozen/blur intervals, scene ranges, and subject
  focus candidates. AI may propose a plan, but policy and user approval decide
  keep/trim/reframe behavior.
- Batch processing is bounded by Worker concurrency and preserves source files;
  partial outputs are quarantined and ready artifacts are retained.

## Storyboard and Worker UI

- Add a compact per-shot generated-media control to the existing nine-shot
  storyboard. The Shot Inspector owns mode, workflow override, start frame,
  ordered reference pack, duration budget, and the resolved workflow preview.
- Submit is disabled until policy, revision, input, and capability checks pass.
  The UI shows stale, blocked, queued, running, QC, ready, failed, and revoked
  states with retry/cancel/re-resolve actions.
- Preserve the existing provider video action as a separate route and label it
  clearly; generated primary shot video and prepared B-roll remain different
  artifact types.
- Convert Worker navigation to a real sidebar and canonical screen registry:
  Overview, Series, Binding, Media Workspace, Queue, Published, AI/Workflows,
  Runtime/GPU, Connection/Access, and Settings. Legacy tabs route to these
  screens during migration.
- Media Workspace supports inventory selection, batch preprocessing, review/QC,
  publication, and safe lineage projections without showing absolute paths.

## Failure and security behavior

- Missing identity, access, binding, workflow, capability, frame revision,
  checksum, QC, or publication proof fails closed with stable error codes.
- A revoked binding drains queued authority-sensitive work and quarantines
  running local outputs; it never deletes source footage or prior published
  artifacts.
- Retry is idempotent and cannot create a second charge or duplicate published
  asset for the same source/shot revision.
- Admin policy changes affect new admissions only; already admitted jobs retain
  their immutable policy and workflow snapshot.

## Testing and rollout

- Contract tests cover access precedence, token-use separation, workflow
  resolution, frame roles, stale revisions, publication proof, and migration
  invariants.
- Rust tests cover MCP negotiation/schema rejection, manifest analysis,
  subject/reframe planning, batch bounds, cancellation, and restart recovery.
- Web tests cover storyboard dispatch, all shot states, workflow chooser rules,
  and Worker canonical route aliases.
- Browser proof covers the nine-shot flow and Worker screens at responsive
  viewports. Packaged Tauri and configured ComfyUI/MiniMax/R2/vector checks are
  reported separately when the environment is unavailable.
- Existing feature flags remain independent. New behavior is disabled when
  policy, capability, or runtime evidence is unavailable.

## Non-goals

- Do not delete or rewrite old B-roll bindings, generated provider tasks, or
  published assets.
- Do not expose raw local footage to the server before derived publication.
- Do not silently install models/custom nodes or accept arbitrary user graphs.
- Do not deploy, restart production services, or run paid provider/GPU work as
  part of local implementation verification.
