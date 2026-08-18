# Request

Implement the approved QC-guided repair flow for both Vertical Drama Draft QC
and Marketplace Auto Review Creative QC.

Required behavior:

- User confirms before a repair can spend credits.
- Repair uses a bounded, domain-specific Skill revision.
- Server preserves immutable identity, continuity, completeness, and product
  truth contracts.
- Repair creates a new durable candidate/version; the original remains
  recoverable and active until an explicit selection.
- The repaired candidate receives a fresh QC evaluation before it can be used.
- A worse or non-passing result never replaces the active candidate.
- Marketplace approval remains blocked until Creative QC passes.

Repository assumptions:

- Vertical Drama already has a Draft Ledger, QC job state, candidate fingerprint
  checks, and story-control validators.
- Marketplace already has an Auto Review outbox, JSON artifact table, plan
  revisions, and Creative QC state.
- The worktree is heavily dirty; only focused files may be changed.
- SocratiCode is unavailable, so targeted shell discovery is the evidence source.

Non-goals: provider fallback, infinite repair loops, weakening hard-fail gates,
deleting old drafts/artifacts, or unrelated media-generation changes.
