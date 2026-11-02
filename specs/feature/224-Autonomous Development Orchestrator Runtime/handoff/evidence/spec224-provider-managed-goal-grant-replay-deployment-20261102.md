# SPEC-224 Provider-Managed Goal Grant Replay Deployment

- Observed at: `2026-11-02T03:33:52Z`
- Source SHA: `22b7f33cd7b37c658bd76625286d03e56041fd13`
- Target: `legacy-debian-dev` / `https://smartaihub.app`
- Service: `smartspec-backend.service`
- Release: `smartspec-python-22b7f33cd7b37c658bd76625286d03e56041fd13-d6c9bd72e6a8`
- Artifact digest: `sha256:d6c9bd72e6a8afdadddcd6b52df078c59275ae4173c76ef174e9dcb2ef668ec8`

The Python Approval Authority backend is now serving the exact integrated revision. It recovers an exact replay of a still-live pending owner-started Goal Grant as approved, preserving the original immutable provider, workspace, source, write scope, and expiry. Platform Engineering runs use the configured provider-managed economics path, without a tenant run-budget hold; external provider account limits remain authoritative.

The existing release controller reported `DEPLOYED_VERIFIED`; Python health and database readiness both returned HTTP 200. Focused approval admission tests passed (3/3 with coverage disabled for this scoped run).

This proves backend deployment and focused admission behavior only. No authenticated user continuation, Codex execution, Runner receipt, or Mission Control completion was observed. The current user should hard-refresh Task Control so the existing Run retries against the updated Approval Authority.
