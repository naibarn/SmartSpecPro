# Decision Log

## Depth choice

Chosen depth: `standard`

Why:

- the feature spans both the web stack and the Python media gateway, but the implementation pattern is already established by the existing provider expansion work
- no new database schema or brand-new architecture is required
- the main risk is wiring consistency, not fundamental product ambiguity

Why this did not promote to full `deep-plan`:

- the provider and model catalog are data-driven
- the WaveSpeed docs are sufficiently concrete for a bounded first release
- the first delivery can be scoped to one provider and one model

## Product decisions locked in

- canonical provider key: `wavespeed_ai`
- display name: `WaveSpeedAI`
- canonical Seedance model id: `wavespeed-ai/cinematic-video-generator`
- canonical Seedance display name: `Seedance 2.0 Grade Cinematic Video Generator`
- seeded provider base URL: `https://api.wavespeed.ai/api/v3`
- first rollout model scope: Seedance 2.0 cinematic video only
- pricing shape: `per_duration` with 5s, 10s, and 15s tiers
- v1 execution mode: async submit + poll only, never sync mode
- native audio interpretation: audio remains embedded in the output video asset; no separate audio artifact is created
- connection test: read-only WaveSpeed endpoint, not a generation call
- provider seed state: disabled by default until an admin enables it

## Deterministic implementation defaults

When the implementer or LLM sees minor ambiguity, use these defaults without reopening scope:

- Prefer the model-specific API doc over the marketing model page, and prefer the marketing model page over the blog post.
- Persist the provider row with `https://api.wavespeed.ai/api/v3`, but accept either the service root or API root in the Python provider and normalize internally.
- Persist submission and polling endpoint metadata in `configJson`, but keep the provider adapter as the runtime source of truth for HTTP behavior.
- If DB pricing metadata is unavailable, use static fallback `configJson.pricingTiers` rather than a flat credit cost.
- If the upstream response exposes both `data.outputs` and other URL-like fields, prefer `data.outputs[0]` as the canonical final media URL.
- Treat unknown non-terminal provider states as processing unless the upstream payload clearly marks failure.
- Expose Prompt Enhancer, sync mode, and standalone audio only when there is an explicit product request after the v1 path is stable.

## Risks to keep watching

- WaveSpeed pricing or model fields may drift from the current public pages, so the seed script must stay easy to adjust.
- The runtime adapter must preserve the exact upstream model path because the canonical id contains a slash.
- The blog’s broader multimodal description is wider than the currently documented model page, so the first spec must not promise audio/video reference inputs unless the adapter has a concrete upstream field to map.
- Long-running task polling needs bounded retries and validated result URLs so the new provider does not regress the existing recovery loop.
