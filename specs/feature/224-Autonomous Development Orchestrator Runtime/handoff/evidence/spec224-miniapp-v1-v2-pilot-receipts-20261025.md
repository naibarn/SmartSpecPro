# SPEC-224 Personal Mini-App V1→V2 Pilot Receipts

Observation date: 2026-10-25 (UTC)

## Scope and identity

- Existing private App: `app_e6f0be051fd22e09bc4c5dff`.
- V1 and V2 were read from the production service database through the configured read-only query session. No production data was modified.
- V1 Git source revision: `7b90395508e8a7084026d7dafc80a8e4b2360493`.
- V2 Git source revision: `1d7273d719ff9b034cd304920c1ef76efdd86e76` (`pruksacharttk/smartaihub-app-e6f0be051fd22e09bc4c5dff`, branch `v2/thai-thb`).
- V1 ledger version 1: DevelopmentRun `run-e6f0be051fd22e09bc4c5dffafc52749766efc13`; source digest `136c7c849ec0b7771fe45a5ed652a784033a8f120bd6bc04289bbc727f107f66`; artifact digest `6e93c6c1baebdbb1f9cfa4643357ff9c634f1d4a312f9207192161a6e6e632e4`.
- V2 ledger version 2: DevelopmentRun `run-828426b4863029414442cf093996860169bac792`; source digest `edda68baa3ff41f697d201275582e40dff7347b23b6dbc58083782e454c516a3`; artifact digest `4394cfde7b8ac138919a11d37ee5a98efeab44677f651b71ab47a048cbf307ee`.
- V2 is current Last-Known-Good at `r2://mini-app-previews/tenant-ZCSKEM9s/app_e6f0be051fd22e09bc4c5dff/sha256/4394cfde7b8ac138919a11d37ee5a98efeab44677f651b71ab47a048cbf307ee`.
- Runtime data migration is `OWNER_CONFIRMED`: 0 values imported and 2 existing values preserved.

## V2 stage receipts

All three stage jobs belong to the same DevelopmentRun and each completed on attempt 1/1, with no stage error:

| Stage | Job | Status / heartbeat / finished | Durable output |
|---|---|---|---|
| package | `378014fe-bd84-4929-b9c9-ac11d53b33b1` | succeeded; heartbeat `2026-10-25 10:26:48.016 UTC`; finished `10:26:49.113 UTC` | `CHECKPOINTED`, next job `f1202c01-5718-4f4e-849a-fac1d9ce4c24`, next stage deploy |
| deploy | `f1202c01-5718-4f4e-849a-fac1d9ce4c24` | succeeded; heartbeat `10:26:51.035 UTC`; finished `10:26:51.314 UTC` | `CHECKPOINTED`, next job `678af4ab-1dea-4be7-9b49-9f15424794bc`, next stage smoke |
| smoke | `678af4ab-1dea-4be7-9b49-9f15424794bc` | succeeded; heartbeat `10:26:53.045 UTC`; finished `10:26:53.783 UTC` | `CHECKPOINTED`, no next stage |

The stage history records `deployment:miniapp:app_e6f0be051fd22e09bc4c5dff:v2`, private-preview smoke, owner-access and unauthorized-denial receipts, and the exact V2 Git revision. The DevelopmentWorkUnit state is `IMPLEMENTATION_COMPLETE` with all app stages complete.

## Anchor and acceptance are separate

The original run anchor job `3d92ce3f-7475-40c3-9934-a6c4a6ebeac9` is retained in audit history with terminal state `expired` / `JOB_DEADLINE_EXPIRED` at `2026-10-25 10:27:47.651 UTC`. The completed package/deploy/smoke jobs and completed DevelopmentWorkUnit are the authoritative delivery evidence; anchor expiration does not reopen the run or invalidate the V2 ledger/LKG.

This record does **not** claim a new owner-authenticated browser acceptance. The real owner must verify the deployed V2 UI using their existing authenticated session. Existing app-level Playwright evidence is recorded separately; no owner session was created or copied for this check.

This is a V1/V2 pilot evidence record only. It does not mark overall SPEC-224, protected Runner acceptance, or generic Mini-App readiness as complete.
