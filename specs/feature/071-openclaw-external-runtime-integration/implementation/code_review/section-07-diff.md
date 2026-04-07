# Diff Notes: Section 07 - Security, Observability, and Fleet Operations

- Added worker fleet admin service with list, diagnostics, disable, drain, resume, revoke, and retention-cleanup operations.
- Hardened worker auth at the registry layer so revoked workers fail closed even before token expiry.
- Sanitized worker diagnostics and event payloads before persistence and audit fan-out.
- Added worker-specific audit events for registration, claim, terminal job outcomes, diagnostics, artifact publication, and fleet actions.
