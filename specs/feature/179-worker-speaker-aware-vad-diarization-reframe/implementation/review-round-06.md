# Audit round 06 — durable queue and idempotency

- Checked Worker claim capability, server queue admission, local-root binding, job type dispatch, and artifact input routes.
- The first import command was run from the wrong directory and failed to resolve a relative module; this was a verification-command error, not a product failure.
- Re-ran from `apps/web`; both router and control-plane imports passed.
- Finding: control-plane idempotency compared JSON text order-sensitively.
- Action: replaced it with `hashSpeakerAwarePayload` canonical hashing.
