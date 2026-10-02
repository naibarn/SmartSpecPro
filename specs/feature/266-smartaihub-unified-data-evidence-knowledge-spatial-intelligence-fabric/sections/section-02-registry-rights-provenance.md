# Section 02 — Registry, Rights, Provenance, Evidence, Health

## Scope

Implement Phase A: provider/source/dataset authority, rights verdicts, versioned source contracts, immutable captures/evidence, temporal envelopes, lineage and source health. Preserve 260/262 as source authority until separately proven cutover.

## Spec coverage

Spec 266 §§5–9, 12–15, 33, 46.1–46.3, 46.8, 46.11.

## Implementation

- Add only additive shared Fabric entities/services; source activation requires approved rights, attribution, purpose, geography and retention.
- Keep secrets outside source records, logs, research prompts and artifact references.
- Make evidence provenance append-only and keep observed, derived, forecast, model-estimated and user-asserted classes distinct.
- Parse evidence into a detached, immutable snapshot; temporal and lineage structures cannot remain caller-owned mutable references after validation. Reject inverted effective-time bounds.
- Derived, forecast and model-estimated evidence must include parent lineage, an applicable rights-policy reference, and a versioned methodology reference before admission.
- Evaluate short-lived, server-resolved connectivity/schema/semantic/freshness/rights/placement/index health independently for an offer; quarantine only the offer bound to that source and dataset. Index health gates discovery only; it does not block deterministic queries. Durable health history and admin remediation remain persistence work.
- Reject malformed or ambiguous in-memory registry snapshots before resolution: bounded dense catalog lists, unique record IDs, per-entity field allow-lists (including secret-field rejection), recognized provider/source/dataset enums and dense bounded semantic capabilities. Invalid rights receipts fail closed; expired rights, geography/residency restrictions, cache TTL and retention/attribution controls travel with a successful resolution.
- An active source requires explicit geography/temporal coverage, refresh, execution-placement and commercial pricing references, plus reviewed rights, purpose and retention policy and attribution text when required. The pure resolver returns references; authoritative policy loading and coverage execution remain persistence/composition work.
- Geography, purpose, audience and residency restriction lists are positive allow-lists of canonical IDs. A populated list requires an exact request match; an omitted list adds no restriction for that dimension.

## Tests

- Rights unknown/expired, revoked sources, cross-tenant access and provenance mutation fail closed.
- Health dimensions remain independent; source drift quarantines only the affected offer.

## Acceptance

Spec 266 §§46.1–46.3 and security items 43–47.
