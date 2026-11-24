# Decision log

## Planning depth: standard quick-plan

This is a medium-sized feature across one existing product surface, its worker
contract, skill runner, image billing, and managed media storage. It reuses the
current app's worker/jobs, model registry, and staged metadata instead of
introducing a new domain or database schema. Three implementation sections
are sufficient. Promote to full deep-plan only if implementation reveals a new
cross-domain control plane, a schema migration, or unresolved authorization or
billing invariants.

## Approaches considered

1. **One canonical worker operation with three per-image substeps — selected.**
   Fits the existing staged caption operation, gives one UI progress surface,
   keeps each prompt/image charge idempotent, and can preserve successful
   outputs when one image fails.
2. **Three independent worker jobs.** This gives isolated queues but adds job
   coordination and more state transitions for a single user action. No
   current product surface needs separate scheduling.
3. **Synchronous image generation from the browser request.** Rejected because
   provider calls can outlive a request and would bypass the canonical worker
   execution path and its durable retry state.

## User-visible defaults

- The user generates images after a caption is saved.
- Outputs use the caption's persisted source, one selected active character
  reference, and one selected active product reference, with the caption and
  product facts supplied to every prompt.
- The separate social-image model picker uses the existing enabled image
  catalog, narrowed to models that accept references and can output a portrait
  ratio. The worker validates provider readiness before enqueueing. It never
  changes the start-frame model.
- Prefer 4:5 when supported for feed posts; otherwise use a declared portrait
  ratio for that selected model.
- A missing character or product image blocks the batch before queuing or
  charging. Partial results remain visible and a retry reuses successful
  outputs when the caption, references, and model are unchanged.

## Billing decisions

- Each generated prompt is a separate vision LLM call; charge actual reported
  token usage with a stable per-output key.
- Each generated image reserves the selected model's fixed per-image credit
  cost with a stable per-output key. Refund only a provider generation that
  fails before completion.
- Show the selected model's image credit cost and a three-image estimate before
  submission. Prompt cost is usage-based and cannot be known exactly in advance.

## Persistence and access

- Store generated image outputs and their per-image status under the existing
  `stagedPipeline.socialCaption` JSON object.
- Store only safe managed-storage URLs in the user-facing projection. Resolve
  all source images server-side from the owned run metadata.
- Do not add a migration or expose provider task URLs/prompts in the UI.
