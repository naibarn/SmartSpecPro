# Windows Runner token renewal status — scoped repair

## Evidence ledger
- Source: screenshot plus current source/UI state path.
- Identifier: image shows Thai `กำลังต่ออายุอัตโนมัติ`, `กำลังต่ออายุ token…`, and internet-check notice.
- Data state: no Windows runtime logs or Tauri error code were supplied; exact network/server cause is not known.
- Confidence: medium for the displayed failure path; low for the upstream cause.
- Source evidence: `runner_status` maps any non-auth refresh failure to `retrying`; the UI renders `retrying` as ongoing automatic renewal and disables the connect button. Refresh HTTP client has a 30-second global timeout.
- Next evidence: expose a sanitized refresh error code and distinguish in-flight `renewing` from failed/cooldown `retrying`; real Windows diagnostics remain required to identify the upstream error.

## Change and proof matrix
| Requirement | Observable behavior | Test | Residual boundary |
|---|---|---|---|
| Do not present failed refresh as in-progress | `renewing` only while request is underway; `retrying` says last attempt failed and may retry | focused Rust tests for safe error classification; inspect UI mapping and Node syntax check | no physical Windows host/log |
| Keep user recovery available | when stopped and retry cooldown is active, reconnect button stays enabled | source-level state/UI check | browser approval flow remains runtime proof |
| Do not leak credentials | expose only whitelisted stable error code, never raw message/token | Rust unit test rejects unsafe text | Windows packaged release validation pending |
