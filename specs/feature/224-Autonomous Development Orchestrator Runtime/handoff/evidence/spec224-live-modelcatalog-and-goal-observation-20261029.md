# SPEC-224 live Model Catalog and Goal observation — 2026-10-29

Observed at 2026-10-29 01:10 UTC against `smartspec_dev` and canonical source SHA `f46cf76ed4237f0bbb282cd41d4a7a1aa97e2a07`.

## Runtime evidence

- Existing Runner service is active. Runner ID `runner-f1328901deec1b147d200a818e12e4be` remains `online` and `trusted`, on the existing session `27a7a2a1-45b2-4f6d-a34d-fcb72e120d0e`; runtime reports version `0.2.52-spec224-catalog-ffc367b845be7ca6f23d19719138fba585695e0f` and `ready` with one authenticated, task-probed, authorized execution tool.
- The persisted snapshot revision is `snapshot:runner-f1328901deec1b147d200a818e12e4be:2026-10-29T01:09:35.167Z`, observed at 01:10:14Z and expiring at 01:15:14Z. It is current at observation time.
- The unchanged active `PLATFORM_ENGINEERING` binding resolves to project/repository `smartspecpro`, workspace `ws-smartspecpro-82e2bf8ca9c2`, and the same Runner.
- The current snapshot stores the discovered Codex catalog on `toolInventory[].adapterId == "codex.v1"` (not at the snapshot root). It has state `discovered`, source `codex_app_server_model_list`, revision `catalog:sha256:ac74a456e170412caf0dc77cde9b22988e8e8167cfb195eeddc8e27ba0f234e1`, eight models, and a non-empty account-provider fingerprint. The fingerprint value is intentionally omitted.
- Discovered model IDs and Runner-reported reasoning efforts:
  - `gpt-5.6-luna`: low, medium, high, xhigh, max
  - `gpt-5.6-sol`: low, medium, high, xhigh, max, ultra
  - `gpt-5.6-terra`: low, medium, high, xhigh, max, ultra
  - `gpt-6-astra`: low, medium, high, xhigh, max, ultra
  - `gpt-6-luna`: low, medium, high, xhigh, max
  - `gpt-6-sol`: low, medium, high, xhigh, max, ultra
  - `gpt-6.1-sol`: low, medium, high, xhigh, max, ultra
  - `gpt-6.1-terra`: low, medium, high, xhigh, max, ultra
- The snapshot marks the catalog `unverified_catalog_only`. This is discovery evidence, not an independent entitlement attestation; no entitlement check was bypassed or changed.

## API/UI path and verification

`spec224WorkspaceSpecSet` reads the Codex catalog from the persisted `toolInventory` entry and includes it only with trusted, online, unexpired Runner snapshots and workspace bindings authorized for the requesting tenant/actor. The Task Control UI derives model and reasoning-effort options from those catalog entries and their per-model capabilities. No hardcoded catalog was added.

Focused regression command:

```text
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 pnpm --dir apps/web exec vitest run client/src/components/chat/Spec224WorkspacePanel.test.tsx server/routers/__tests__/spec226DevelopmentControl.test.ts server/services/spec224WorkspaceSpecSet.test.ts
```

Result: 3 files, 79 tests passed. This verifies the API projection/UI contracts against test cases, not a live authenticated browser selection. No authenticated owner browser session was available in this host turn, so a live Task Control tRPC response and visible dropdown selection were not directly observed. The catalog verification state remains `unverified_catalog_only`; do not represent it as stronger entitlement proof.

## Goal activation state

Read-only queries of `smartspec_dev` found zero approval requests whose payload is a SPEC-224 Goal Delegation Grant and zero tenant-001 SPEC-224/development-run worker jobs. Therefore there is no durable Goal, Run, Child Job/Attempt, Writer Lease, dispatch, receipt, or settlement to resume. No Start, approval, admission, or execution record was fabricated.

Before release, refresh the existing Runner snapshot and recompute Source Admission for `apps/runner-app/tests/spec224-live-pilot/**`, then use the existing fenced Writer Lease and Goal authorization. Exact owner action: on authenticated `aimarkethubs.com` Task Control, select this existing Debian Runner and authorized Platform Engineering workspace, choose the development-from-prompt path, use only the bounded scope above, and press Start. Approve the actual resulting Goal Grant through the existing Approval Authority. Reuse the resulting durable Run on resume.

SPEC-224 remains incomplete: live authenticated UI selection, owner Goal Start/approval, real Child 1 and Child 2 execution/receipts/settlement, automatic continuation, and independent Final Verify remain unverified.
