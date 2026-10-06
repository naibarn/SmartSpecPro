# Feature 162/163 implementation closeout

Date: 2026-08-25

This review covers the implementation waves recorded in
`specs/feature/162-163-gap-closure/sections/` and the code paths for the
Worker-first media pipeline, ComfyUI MCP shot dispatch, and the Worker App
canonical shell.

## Five-round gap review

### Round 1 — contract and persistence boundary

- Series workflow policy is stored additively under the existing `policy`
  JSONB column; no migration or destructive rewrite is required.
- The browser receives only `workerMediaWorkflowPolicy`, not the complete
  free-form policy JSONB.
- Media artifacts carry bounded intelligence metadata, focus-track points,
  transform provenance, QC, checksum, and derived-only materialization paths.
- Start/reference frame schemas accept a Worker-local `materializedPath` while
  preserving the server `storageKey` as provenance.
- Result: closed for the implemented contract boundary.

### Round 2 — tenant, Series, Worker, and binding authority

- Series discovery and media workspace queries are tenant scoped and then
  projected through the Worker Series policy.
- Explicit user, group, and tenant policy access is fail-closed across read,
  bind, process, publish, and revoke paths.
- Frame materialization verifies Worker assignment, active binding, Series ID,
  job input membership, tenant asset ownership, image format, and SHA-256.
- Quick Actions query and mutate only jobs/assets/index records belonging to
  the authenticated Worker and Series; unsupported actions return a blocked
  result instead of a false acceptance.
- Result: closed for the reviewed server authority paths.

### Round 3 — UI and user intent

- Series Settings now exposes Worker/ComfyUI MCP default workflow, allowlist,
  and user-override policy with a save boundary and policy revision.
- Shot inspector now exposes only live Worker-advertised compatible workflows;
  the selected workflow is sent as `requestedWorkflowId` and re-resolved by the
  server before dispatch.
- Shot details show start-frame provenance, reference roles, focus/reframe
  state, QC state, preview, resolved workflow, and selected Worker.
- Worker App has sidebar routes, top context/status bar, Quick Actions, local
  Series selection, and route-specific guidance without inventing a second
  navigation system.
- Result: closed for the implemented UI contracts.

### Round 4 — local media and MCP lifecycle

- Local source files remain on the Worker machine; derived outputs are created
  under the bounded `derived` workspace and uploaded only after QC.
- Dead-air policy, duration budget, still motion, 9:16 output, smooth keyframe
  interpolation, output scope, and checksum/QC paths are implemented.
- Shot generation uses MCP tool discovery plus submit/status/cancel lifecycle
  reconciliation; no direct ComfyUI HTTP fallback is used.
- Start/reference frames are downloaded through the authenticated control-plane
  materialization route and passed to the MCP workflow only as Worker-local
  paths.
- Automated 9:16 editing fails closed when no real AI subject track is
  available; it does not silently label a center crop as subject-aware. Guided
  mode remains available for explicit user focus/keyframes.
- Result: no silent-processing gap remains; live ComfyUI workflow/model proof
  is an external environment check, not a code acceptance claim.

### Round 5 — verification and delivery safety

- Deep-plan section checker: 7/7 sections complete; UI contract checker passed.
- Rust Worker tests: 166 unit tests, runtime manifest tests 10, executor tests
  21 — all passed.
- Worker App TypeScript typecheck passed.
- Web focused tests passed: 4 files / 20 tests, plus Settings UI tests under
  jsdom: 3 files / 20 tests.
- Web workspace typecheck passed after the final projection/type fixes.
- `git diff --check` passed.
- No migration, production deploy, browser E2E, live GPU, live ComfyUI MCP,
  R2 upload, or vector-provider smoke was run in this closeout; those require
  the corresponding live environment and are not represented as completed.
- Result: implementation review complete with external-runtime evidence
  explicitly separated from repository proof.

## Final disposition

No additional repository code blocker was found in the five rounds. The
implementation is additive and migration-safe. The only intentionally blocked
path is automated subject-aware 9:16 processing without a real AI focus track;
the Worker reports a typed failure/review condition instead of producing a
misleading crop.
