# Section 01: Inventory, portability and resource proof

## Requirements

REQ-311-01, REQ-311-02, REQ-311-15, REQ-311-17.

## Prerequisites

None; first development section. Reconcile current canonical source, handoff and existing implementation before changing code.

## Touched scope

`apps/web/server/routers.ts`, mounted routes in `apps/web/server/_core/index.ts`, active router exports and job registry; `apps/cloudflare/src/apiRouteManifest.ts`, contracts, postgresClient and existing deployment receipts.

## Implementation tasks

Inventory every active route/procedure/batch, browser flow, scheduled callback, stream and job type; reconcile dynamic registration and real usage. For each, map source, auth/tenant, DB operations, process/filesystem/native dependencies and target runtime. Exclude prohibited retired code by existing authoritative policy, not by label guessing. Identify the approved Python agent runtime and native media dependencies explicitly.

Prove a minimal Worker -> reviewed existing database connection and rollback-safe test-tenant read/write without Node/Python application Container or Debian app calls. Verify credential/log permissions, current pinned runtime limits and actual existing resources. Freeze measured latency/error/timeout and load baselines before feature ports. Produce a complete inventory with explicit unresolved entries, not a numeric percentage from guessed totals.

## Focused verification

Inventory detects an added unregistered route/procedure/job and a dynamic registration; retired boundaries remain excluded. Native dependency graph and live binding proof reveal Container/legacy-origin calls. Measure baseline and unsupported dependencies without claiming live success from source.

## Observable deliverable

Verified implementation for the mapped behavior with exact-source evidence and explicit remaining inventory/requirement gaps. Preserve every unrelated dirty change. A completed section does not close runtime acceptance without its required live proof.

## Known gaps and next action

Runtime behavior is unverified at planning time. Start by inspecting the named source and actual capability, add the scoped failing test/proof, implement the smallest compatible slice, integrate promptly, and update the existing canonical requirement handoff. Do not allocate new infrastructure or claim provider access based on a source stub.
