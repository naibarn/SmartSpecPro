# Policy Badge (Runtime Snapshot)

This repo publishes a `policy` badge using a Shields endpoint JSON hosted on the `badges` branch.

## What it represents

It is derived from a *runtime policy snapshot* generated in CI by calling the proxy endpoint:

- `GET /v1/policy`

The snapshot is created in-process (FastAPI TestClient) and does not require external services.

Badge message example:
- `approval:on token:on`

Where:
- `approval:on` means write tools require approval (autoApproveNonstream is off and write tool is in approval allowlist)
- `token:on` means MCP writeToken is required (if MCP policy is present)

Files:
- Snapshot generator: `scripts/ci/policy_snapshot.py`
- Badge generator: `scripts/ci/policy_badge.py`
- Published JSON: `badges/policy.json` on branch `badges`
