# Decision log

## Depth

Chosen depth: standard quick-plan. The change crosses an existing tRPC router, shared capability/prompt helpers, one Settings surface, and focused tests, but needs no migration or new worker.

## Decisions

1. Add a Vertical Drama-specific model list procedure rather than exposing all media models to the client.
2. Reuse `mediaRouter.generateImageAsync` through an in-process caller for credit/provider/rate-limit parity.
3. Tag task with `__vd_series_id` and `__vd_purpose=series_logo` so result durability is automatic.
4. Apply by `taskId`, not client-supplied URL; re-fetch and verify completed durable task before updating watermark.
5. Keep prompt builder pure and exact; technical transparent/PNG controls are transport fields, not prompt suffixes.
6. Use local component state for the modal lifecycle and disable the relevant slot action during each mutation/poll/apply phase.

## Risks that would promote the plan

- If the existing media caller cannot return a task that unified polling can durabilize, add a small shared media submission helper rather than duplicating credit logic.
- If no live model row has the capability, verify empty-state behavior but do not add a catalog migration as part of this feature.
