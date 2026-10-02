# Section 08 — Mutual Aid and Federation

**Dependencies:** Sections 05 and 07. **Owner:** conductor. **Status:** In progress (opt-in profile persistence/discovery, exact assignment-scoped consent/revocation, responder projection enforcement, and source-side partner/share lifecycle are implemented; authenticated external delivery/read, partner identity handshake, and external capability discovery remain open).

## Scope

Implement opt-in helper discovery, proximity privacy, eligibility and safety envelopes, task-specific disclosure grants, capability discovery, trusted partner registry, federation schemas, jurisdiction boundaries, expiry/revocation, and external authority read integrations. No external partner or helper gains dispatch authority by identity alone.

## Exit criteria

- Helper location is opt-in, coarse and protected from repeated-query reconstruction.
- Grants specify subject, purpose, resource, fields, expiry, jurisdiction and revocation state.
- External contracts are versioned and validated; external input is untrusted provenance.
- Revocation blocks future reads, and tenant-isolation negatives are covered.
- Local partner/share lifecycle is available in `/dashboard/emergency/command/federation`; shares are queued and explicitly not externally delivered until authenticated partner identity and a delivery adapter exist.
- Federation projections use `spec260-federation-v1` and an explicit allowlist; only case/situation state, hazard/severity, public reference, bounded public summary, and share time can enter the projection.
- No retired Agency, workpacks, legacy workflow engine or OpenSandbox path is introduced.

The command federation panel registers partners in `pending`, requires an explicit `emergency.verify` action and `verified`/`trusted` state before activation, and supports pause/revoke. Activation is hidden when the current operator lacks verification capability. Source-side shares are currently limited to tenant-local cases with an authoritative triage jurisdiction, at most 24 hours, and a versioned allowlisted projection; partner revocation also revokes outstanding shares. The selector uses a dedicated minimum case-options projection that omits location and report text. Situation sharing fails closed because situations do not yet have an authoritative jurisdiction field. The share ledger reports `queued_not_delivered`. There is no external partner read or delivery endpoint because partner identity/authentication and recipient binding are not implemented; partner registration does not grant dispatch authority.
