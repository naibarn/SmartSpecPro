# Decision Log

## Depth

`standard` quick plan: the change crosses skill content, shared safety
contract, cover state, router transport branching, and focused tests, but needs
no schema migration or new external service.

## Decisions

1. Use a dedicated Vertical Drama episode-cover rewriter rather than applying
   the generic non-drama rewriter to the complete prompt.
2. Review the final assembled prompt once before credit reservation and before
   transport selection, so Hermes and normal media cannot diverge.
3. Reuse a validated safety marker in the normal media service when the prompt
   hash matches, preventing a second LLM rewrite.
4. Store only bounded safety metadata in the existing cover JSONB state; do not
   persist provider URLs or raw provider payloads.
5. Keep automatic provider retry out of scope to avoid duplicate charges and
   unsupported assumptions about provider-side refusal causes.
