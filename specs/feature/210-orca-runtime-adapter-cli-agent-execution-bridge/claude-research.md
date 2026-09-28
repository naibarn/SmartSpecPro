# Spec 210 Research

## Evidence boundary

SocratiCode was unavailable; targeted shell discovery was used. Current
repository evidence includes `apps/web/server/services/runnerContracts.ts`,
`runnerGateway.ts`, `runnerControl.ts`, Runner Rust protocol/discovery and
`external_agent_task` admission, but no `orca.v1` adapter or production Orca
route.

## Design findings

- Feature 197 `sah-runner-v1` is the authenticated local control boundary.
- Feature 195 remains the only durable Job/attempt/event/dispatch/outbox truth.
- Spec 200 owns provider-native external agents; Spec 206 owns A2A routing.
- Spec 207 owns economic authorization; a runtime receipt is evidence, not
  economic finality by itself.
- Direct CLI invocation, raw provider credentials, public inbound ports and
  client-provided runner identity are disallowed.

## Testing

Use focused Vitest tests for Node contracts/services/routes and `cargo test`
for Runner protocol changes. Real installed Orca/provider certification is an
external release gate. Do not run repository-wide TypeScript typecheck under
the repository rules.

