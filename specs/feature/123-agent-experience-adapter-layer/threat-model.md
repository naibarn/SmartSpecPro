# Agent Experience Threat Model

## Minimum Threats And Controls

| Threat | Control |
|---|---|
| Malformed source streams | Runtime validation and dropped-event diagnostics |
| Cross-tenant references | Tenant identity preservation and host re-checks before mutation |
| Debug payload exposure | Permission gate, redaction, private/internal filtering |
| Approval spoofing or replay | Backend-authoritative approval state and audit linkage |
| Billing/cost manipulation | Server-owned finalization only |
| Artifact XSS or privileged URL leak | Pointer-only events and permissioned content loading |
| External renderer supply-chain risk | Dependency gate, exact pin, isolated bridge, rollback |
| Fixture/log leakage | Synthetic fixtures and content-free metrics |
| Deferred page-action escalation | Explicit deferral and future server-side action registry |
