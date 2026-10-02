# Deep-plan interview — Spec 262

## Status

No unresolved domain decision blocks planning. The user has already clarified the material product choices across the active conversation: reuse the existing AI Chat & Feedback panel, preserve Spec260 as the canonical emergency authority, support Linux/tunnel and Cloudflare ingress where feasible, detect deployment mode automatically when safely possible, implement first and reserve real-environment verification for the final phase, and keep iterating on discovered gaps without pausing for routine confirmation.

## Q1 — Which conversation surface should map context use?

**Question:** Should Spec262 add a map-specific Chat page/panel or use the existing SmartAIHub Chat panel?

**Answer:** Use the existing Chat UI shown in the reference image, which already has AI Chat, Task Control and Send Feedback.

## Q2 — Deployment target and mode detection

**Question:** Should the implementation target Cloudflare only or retain Linux server deployment?

**Answer:** Support both Linux server and Cloudflare; automatic detection is preferred when feasible.

## Q3 — Implementation and verification order

**Question:** Should real Cloudflare verification interrupt each implementation slice?

**Answer:** Complete implementation and local verification first, then verify against the real environment at the end.

## Auto-decisions

- Reuse `FeedbackButton`/`ChatView`, existing conversation/task authority, shared Spec260 route manifest and existing emergency source/capture/claim contracts.
- Keep DB, auth, tenant authorization, audit and durable `worker_jobs`/outbox execution in the canonical platform service. Cloudflare remains the ingress/transport proxy unless the repo adds a separately approved execution contract.
- Use additive migrations and canonical schema/journal only for data that must be durable; no second geospatial or queue authority.
- Persist domain facts with explicit source, event/observation/ingestion time, CRS/units, freshness, uncertainty and review state. Never promote a missing/stale feed to “no incidents.”
- Separate public, authenticated and operations projections; derive audience from identity/tenant/policy server-side. UI-provided map mode is only a display hint.
- Release in feature slices and gate unimplemented/nonvalidated providers/models by explicit capability coverage. No fabricated hydrology forecast or implied provider access.
- Run local focused checks after implementation and capture browser evidence; do not claim production/Cloudflare/provider success without actual environment evidence.
