# Agent Experience Schema Changelog

## 2026-06-22-v1

- Owner: Agent Experience package/API owner.
- Status: initial MVP schema.
- Supported versions: current only during Phase 0; current and current-1 after Phase 1 unless a later migration plan extends the window.
- Compatibility rule: schema changes must update runtime validation, fixtures, fixture inventory, changelog, and compatibility expectations together.
- Deprecation rule: deprecation entries must include deprecated field/event, replacement, removal window, affected fixtures, and rollback note.
- Rollback note: unsupported future versions fail closed and produce dropped-event diagnostics instead of renderer input.
