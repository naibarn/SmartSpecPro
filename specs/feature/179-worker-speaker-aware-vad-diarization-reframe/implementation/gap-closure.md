# Gap closure triage — 2026-09-06

## must_do_now

- standalone media support — fixed the hidden Series/binding precondition across
  Worker UI, Tauri root selection/submit, Worker execution validation, shared
  payload schema, tRPC queue validation, and the server control-plane route.
- the earlier scheduler idempotency payload collision remains fixed and covered
  by a passing regression test.

## should_offer_next

- none required for source correctness.

## safely_deferred

- Authenticated browser screenshots and target RTX/adapter-runner execution — blocked by unavailable external runtime/session; residual risk is limited to environment-specific integration behavior, not an unverified source claim.
- Full Web `npm run check` — skipped under the user's RAM constraint; focused Web tests and Worker/Rust gates passed.

## no_action_needed

- Existing dead-air/manual edit, crop/aspect, Bin, and Library flows — preserved and not replaced by Feature 179.
- Adapter fallback — explicit policy only; missing/failed runner blocks rather than fabricating evidence.
- Series workflows — unchanged; they still require an active Series binding and
  matching root, while standalone workflows use an isolated local-only root.
