# Diff Notes: Section 06 - Team, Admin, and Workflow Integration

- Extended team create/add/edit flows to preserve `externalRef` while optionally binding an `externalWorkerId`.
- Added a tenant-scoped bindable-worker query for team UIs.
- Surface bound worker state in the Teams UI and keep unresolved connectors supported.
- Added best-effort run-engine dispatch for bound external connectors when auto-team runs pause waiting on an external member.
- Added admin fleet list and worker action endpoints, then surfaced them in Admin Monitoring.
