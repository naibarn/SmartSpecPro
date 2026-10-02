# Section 07 — Deterministic Triage and Safety Protocols

**Dependencies:** Sections 04–05. **Owner:** conductor with shared contracts as the stable domain boundary. **Status:** In progress (deterministic advisory and versioned hazard safety packs now constrain task creation/assignment; durable verification/reassessment/no-response review items and explicit human reasons are implemented; golden hazard decision flows, case brief/timeline projection, and escalation delivery remain open).

## Scope

Create versioned hazard/protocol packs, deterministic triage and reassessment rules, need revision/delta handling, Case Brief and timeline projections, no-response/escalation behavior, verification and misinformation queues, and advisory AI extraction interfaces. Model output never approves publication, denies aid, or dispatches a high-risk task. Preserve raw evidence and provenance.

## Exit criteria

- High-risk decisions require an authorized human transition with reason and audit.
- Stale facts trigger review and never silently resolve a case.
- Protocol action requirements and safety class constrain task assignment.
- Golden scenarios cover medical, structural, fire/hazmat, security, crowd, multi-hazard, unknown and no-response cases.
- Provider/LLM outage leaves deterministic intake and triage operational.

## Current implementation boundary

Unknown/multi-hazard and unknown-severity triage creates durable verification items; stale/invalid/future observations create reassessment items. Operators can resolve case-scoped review items with a required reason, verification completion requires `emergency.verify`, and open obligations block case resolution/closure. Review completion is fingerprinted to the facts reviewed, so a changed hazard/severity/observation opens a new obligation. Contact attempts are audit-recorded; failed, unsafe, or invalid contact creates a no-response follow-up item and never auto-resolves the case. Golden hazard-specific queues, contact escalation delivery, and the full case brief/timeline remain open. Tests are authored but deferred to Section 12.
