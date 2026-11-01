# Section 04: Application APIs and browser feature parity

## Requirements

REQ-311-07, REQ-311-09, REQ-311-15.

## Prerequisites

section-02, section-03. Reconcile current canonical source, handoff and existing implementation before changing code.

## Touched scope

Active domain routers/services discovered in section 01; Worker handler registration and existing UI DTOs/storage/upload interfaces.

## Implementation tasks

Port inventory groups incrementally: dashboard/admin/settings; project/Mini App/Runner; media/library/assets; vertical drama series/episodes/characters and editing; search/memory; credits/payments/webhooks and every additional active group. Retain current schemas, features, immutable IDs, tenant policies and transactional effects. No aggregate catch-all classification may stand in for actual handlers.

Move uploads/downloads to approved storage boundaries with signed/direct handoff and ownership checks. Validate every inventory entry against existing contracts and a real browser flow. Route UI errors to actionable sanitized text without exposing platform-internal identity. Update coverage as implementation progresses; unresolved entries block final acceptance.

## Focused verification

Per-inventory positive/negative authorization and DTO parity; actual series/episode edit and existing record reads; credit/billing webhook duplicate and invalid signatures; storage authorization, signed URL expiry, size limits and upload cancellation; no feature hidden to make parity green.

## Observable deliverable

Verified implementation for the mapped behavior with exact-source evidence and explicit remaining inventory/requirement gaps. Preserve every unrelated dirty change. A completed section does not close runtime acceptance without its required live proof.

## Known gaps and next action

Runtime behavior is unverified at planning time. Start by inspecting the named source and actual capability, add the scoped failing test/proof, implement the smallest compatible slice, integrate promptly, and update the existing canonical requirement handoff. Do not allocate new infrastructure or claim provider access based on a source stub.
