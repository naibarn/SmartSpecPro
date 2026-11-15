# Existing runtime gap matrix

| Capability | UX prototype | Existing modular runtime at task start | Integration gap |
|---|---|---|---|
| Fleet full-page workspace | Complete synthetic concept | No separate Mission Control route in shell; Chat contains only a small mission surface | Add an authorized read-model route only after UX review and canonical data API readiness |
| Concurrent Harness/Agent/Runner views | Six selectable fixtures and filters | Canonical platform contracts exist; complete fleet read surface not proven by this task | Implement projections over existing Mission/Job/Run/Event authorities; verify 10+ items and tenant isolation |
| Execution evidence inspector | All requested tabs and honest unavailable states | Some task projections/events/artifact contracts exist; end-to-end evidence coverage not established | Connect each evidence type to its authority; keep unsupported fields unavailable |
| Session restore / deep link | Query-string demo execution key | Prototype only | Use canonical execution identity and authorization-bound route parsing |
| Simple/Developer disclosure | Local presentation toggle | Not evaluated here for production permission boundaries | Reuse trusted authorization and presentation policy; mode must not grant access |
| Light/Dark/Balance | All switch actual scoped theme tokens | Existing shell design tokens not migrated into this concept | Align variables with final Design System/theme contract |
| Responsive navigation | Desktop rail; tablet/mobile drawers | Existing Chat responsive shell is separate | Incorporate patterns after owner UX review; validate keyboard focus and touch targets |
| Interactive decision panel | Demo-only expand/collapse | No canonical decision operation invoked | Connect only to a defined, authorized, idempotent runtime action after approval |
| DEV deployment | Preview screenshots are local browser captures | Runtime URL/deploy not yet verified | Publish through the registered `modular-debian-dev` controller and verify live route/source SHA |

This matrix records implementation readiness, not acceptance. No mock interaction changes production state and no SPEC-312 acceptance state is changed.
