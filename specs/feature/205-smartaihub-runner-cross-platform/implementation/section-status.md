# Feature 205 deep-implement section status

Date: 2026-09-18

All nine plan sections were implemented in dependency order. “Completed” means
the repository contract, code path and focused proof are present; native host,
Cloudflare target-account and signed-release evidence remain external rollout
gates and are not represented as local passes.

| Section | Result | Repository proof |
|---|---|---|
| 01 Contracts/profile boundary | Completed | additive TS profile/envelope/tool inventory validation, Rust protocol tests |
| 02 Backend registry/gateway | Completed | separate Runner auth namespace, authenticated setup/enroll/control/rotate/refresh/revoke routes, registry schema, capability route, gateway idempotency/rollback tests |
| 03 Runner foundation/journal | Completed | standalone `apps/runner-app`, config/identity/journal/diagnostics/lifecycle tests |
| 04 Discovery/control channel | Completed — target evidence pending | bounded PATH scan, redacted inventory, approved version probe, authenticated WSS client, HTTPS fallback, sequenced reconciliation queue, local `run` refresh loop and explicit `rescan` |
| 05 Job execution/adapters | Completed — provider evidence pending | lease/fence, workspace/symlink confinement, bounded no-shell process host, direct cancellation, approved adapter/probe gate, artifact verification and duplicate execution tests |
| 06 Shared Container Runner | Completed — target evidence pending | assignment-scoped Rust workspace cleanup plus Cloudflare start/reconcile/release lifecycle adapter; Feature 204 target-account proof remains external |
| 07 UI Task Control/connection | Completed — deployed evidence pending | existing combined Feedback/Chat surface projects Runner platform/profile, safe state, expandable redacted tool/capability inventory and task step progress; `/workers/connect` embeds authenticated Runner enrollment beside Worker App; deployed browser evidence remains external |
| 08 Manual release workflow | Completed | `workflow_dispatch`-only workflow, four targets, profile/publish/signing inputs, manifest/checksum/static policy proof |
| 09 Platform/rollout evidence | Partial with explicit gates | evidence matrix and 10-round audit recorded; local focused proof passes, provider/session and deployment gates explicitly pending/unverified |

## Focused commands

```text
cargo test --manifest-path apps/runner-app/Cargo.toml
npm --workspace apps/web test -- server/services/__tests__/runnerContracts.test.ts server/services/__tests__/runnerGateway.test.ts
npm --workspace apps/web test -- server/routes/__tests__/runnerControl.test.ts client/src/components/settings/__tests__/RunnerConnectPanel.test.tsx
npm --workspace apps/web test -- client/src/components/chat/__tests__/UniversalControlPlanePanel.test.tsx client/src/components/guardian/__tests__/FeedbackButton.test.tsx
npm --workspace apps/cloudflare test -- src/runnerContainer.test.ts src/contracts.test.ts
npm --workspace apps/cloudflare run check
node scripts/verify-runner-release-workflow.mjs
git diff --check
```

The repository-wide TypeScript check was intentionally not run because the
project instruction prohibits it for RAM reasons. Runner server modules were
checked with the targeted compiler probe; UI modules were checked by focused
Vitest/jsdom coverage and the application build remains an external release
gate.
