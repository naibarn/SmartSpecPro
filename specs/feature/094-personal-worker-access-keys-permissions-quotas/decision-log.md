# Decision Log

## 1. Planning depth

- Chosen depth: `standard`
- Reason: this is a cross-cutting feature, but it can still be split cleanly into a small set of sections that map to UI, backend token lifecycle, metadata capture, permissions, and quotas.

## 2. Feature identity

- Decision: create a new feature spec instead of folding this into Hermes feature 093.
- Reason: the requested capability must work for multiple worker families, not only Hermes.

## 3. UX placement

- Decision: add a dedicated Settings tab for worker access management rather than hiding this inside existing API keys or Desktop Host panels.
- Reason: the user mental model is "my workers", not "generic API keys".

## 3.5 Rollout gate

- Decision: keep the new tab behind a tenant-level worker-access rollout gate until an admin enables it.
- Reason: the feature exposes powerful bootstrap secrets and permission controls, so it should fail closed by default.

## 4. Secret model

- Decision: use a dedicated worker access-key object with one-time secret display and hashed storage.
- Reason: worker bootstrap keys need explicit expiry, revoke, runtime-family binding, and audit metadata that should not be mixed with the existing user API key surface.

## 5. Permission model

- Decision: keep a two-level permission model.
  - Friendly presets for most users.
  - Advanced allowlists for runtime families, route families, and gateway/callback scopes.
- Reason: the feature must stay usable for non-technical users while still being precise enough for admins and power users.

## 6. Runtime coverage

- Decision: support the runtime families that already exist in the codebase today: Hermes, OpenClaw, Desktop + ZeroClaw, NemoClaw, and HiClaw.
- Decision: do not invent NanoClaw as a first-class runtime type in this feature unless the runtime contract already exists elsewhere.
- Reason: the repository currently exposes the first five families as top-level runtime identities; NanoClaw remains a future ecosystem variant.

## 7. Quotas

- Decision: reuse the existing worker budget model and surface the editor in the new worker tab.
- Reason: the backend already computes owner-bound hourly, five-hour, daily, weekly, and monthly caps from worker metadata.

## 8. Auditability

- Decision: record detailed worker identity metadata, but redact secrets and never show raw access keys again after creation.
- Reason: the user asked for maximal traceability without sacrificing security.

## 9. Canonical lifecycle

- Decision: model worker access keys explicitly as `draft`, `active`, `expired`, `revoked`, and `rotated`.
- Reason: security-sensitive bootstrap secrets need an auditable state machine instead of an ambiguous "enabled/disabled" flag.

## 10. Metadata boundary

- Decision: use a narrow allowlist for persisted worker metadata and treat anything else as redactable or hash-only.
- Reason: the feature should improve auditability without turning into an uncontrolled device inventory system.

## 11. Active-key limit

- Decision: enforce a conservative active-key limit per user and surface the count in the UI.
- Reason: this reduces blast radius if a user accidentally leaks one of their bootstrap secrets.

## 12. Canonical permissions

- Decision: make the permission vocabulary server-side canonical and reject freeform scopes.
- Reason: security-sensitive bootstrap permissions should not depend on ad hoc UI labels.
