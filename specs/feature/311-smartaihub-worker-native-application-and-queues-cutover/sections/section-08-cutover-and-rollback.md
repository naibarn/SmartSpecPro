# Section 08: Controlled cutover and rollback

## Requirements

REQ-311-13, REQ-311-19, REQ-311-20.

## Prerequisites

section-07. Reconcile current canonical source, handoff and existing implementation before changing code.

## Touched scope

Existing authorized build/release/deployment/traffic controllers, rollback baseline and database backup/recovery procedures; canonical integration and acceptance evidence.

## Implementation tasks

Prepare exact integrated release SHA, immutable configuration and complete inventory/requirements proof. Verify backup restore, schema/session compatibility, Queue ownership transitions and in-flight replay prevention. Existing server-side cutover interlock rejects every unresolved runtime gate. Planning/development integration does not authorize DNS changes.

Only through existing production authorization: stage a controlled traffic shift, verify real smartaihub.app requests execute on Cloudflare without Debian application fallback, and prove aimarkethubs.com remains dev with its own tenant in smartspec. Correlate live traces and read/write results, retain Debian rollback capability, rehearse routing/version reversal with Queue fencing, then document separate runtime/database hosting and stabilization metrics.

## Focused verification

Exact-SHA/config/coverage mismatch blocks cutover; backup restore rehearsal, session/schema compatibility, in-flight Queue drain/fence and rollback; real smartaihub.app Cloudflare execution plus aimarkethubs.com dev isolation; absent production authority leaves traffic unchanged.

## Observable deliverable

Verified implementation for the mapped behavior with exact-source evidence and explicit remaining inventory/requirement gaps. Preserve every unrelated dirty change. A completed section does not close runtime acceptance without its required live proof.

## Known gaps and next action

Runtime behavior is unverified at planning time. Start by inspecting the named source and actual capability, add the scoped failing test/proof, implement the smallest compatible slice, integrate promptly, and update the existing canonical requirement handoff. Do not allocate new infrastructure or claim provider access based on a source stub.
