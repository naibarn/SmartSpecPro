# Vertical Drama Worker Shot opt-in

## Decision

Add a Series-level `workerShotGenerationEnabled` setting inside the existing
`workerMediaWorkflowPolicy` JSON policy. The setting is disabled by default,
including for legacy policies that do not contain the field.

## UI behavior

- Series Settings shows an explicit toggle: “เปิดใช้การสร้าง Shot ด้วย Worker”.
- The Episode Shot card “สร้าง Shot ด้วย Worker” is rendered only when that
  toggle is enabled.
- When disabled, the Episode page does not load Worker targets for this lane.
- When enabled, the existing Worker target selection and dispatch controls are
  unchanged. `mcpReady` continues to protect dispatch/retry buttons, but does
  not decide whether the card is visible.

## Persistence and compatibility

The existing workflow-policy mutation persists the flag in the existing JSON
policy column and includes it in the audit metadata. No database migration is
required. Zod defaults the field to `false` so old saved policies remain valid.
