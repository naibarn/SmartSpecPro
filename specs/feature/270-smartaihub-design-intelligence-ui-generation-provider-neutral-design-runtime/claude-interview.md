# Spec 270 Interview

No blocking domain question was raised. The user requested autonomous technical decisions and no further confirmation.

## Auto-decisions

1. G0 must be recorded before DDL, production enablement, or credential onboarding. The missing canonical registry remains an explicit local-evidence limitation.
2. Deliver the native/no-provider path first; keep Stitch optional, certified, default-off, and design-time only.
3. Reuse Spec 224, Spec 256, worker_jobs/outbox, credential, audit, asset, and backup owners; do not create parallel authorities.
4. Do not make live provider calls or transmit private data during planning/tests.
5. Do not use retired systems.
6. Spec 263 consumes canonical Spec 270 context/artifact/verification contracts; 270 does not own public route/copy semantics.
