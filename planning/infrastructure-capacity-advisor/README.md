# Infrastructure Capacity Advisor implementation notes

Implement the approved design in
`docs/portable-skill-pack/specs/2026-08-21-infrastructure-capacity-advisor-design.md`.

1. Add the persisted assessment contract and bounded host/runtime snapshot.
2. Connect the canonical product skill to the existing model fallback/audit
   path and expose Admin-only tRPC procedures.
3. Schedule one daily run through the existing BullMQ maintenance pattern.
4. Add the Capacity Advisor Admin Monitoring tab and a clearly labelled Dashboard
   Admin menu entry.
5. Run focused tests, migration/schema checks, and diff hygiene checks.
