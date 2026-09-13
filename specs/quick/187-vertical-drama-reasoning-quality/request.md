# Vertical Drama: Unified LLM Reasoning Quality

## Original request

Design and plan a complete improvement for Vertical Drama Series so every LLM-driven
skill can use a user-selected thinking quality safely, even when the selected model or
provider does not support the requested reasoning mode. The solution must use a central
resolver, wrapper, and provider adapter; avoid mid-pipeline failure; keep the UI simple;
and materially improve story coherence and quality rather than only adding more retries.

## Repository context

- Repository: `/home/dev/projects/SmartSpecPro`
- Primary app: `apps/web` (TypeScript/React/tRPC/Drizzle)
- Provider transport: `apps/web/server/services/llmRouter.ts`
- Current setting: series LLM model policy plus series/episode JSON generation settings
- Current partial implementation: the episode Script, Storyboard, Start Frame, Dialogue,
  and Video Motion paths pass reasoning parameters, while several Character, Special,
  Quality Review, Location, Memory, and auxiliary paths do not.

## Assumptions

- The user should choose one visible LLM quality profile per Drama Series, not one raw
  effort value per skill.
- Image model and image quality remain separate from LLM model and reasoning quality.
- The existing explicit model selection remains authoritative; provider/model fallback
  must not silently replace an explicit model unless the existing routing policy allows it.
- Unsupported reasoning is a recoverable capability downgrade, not a generation failure.
- All LLM-driven actions inside Vertical Drama are in scope; generic non-Drama chat is not.
- The plan must preserve existing tenant ownership, credit ordering, managed media, and
  dirty-worktree safety constraints.

## Non-goals

- Rewriting all Vertical Drama prompts in one implementation wave.
- Exposing chain-of-thought or raw reasoning text to end users.
- Applying LLM reasoning settings to image/video provider generation requests.
- Changing generic system-wide skill routing outside Vertical Drama.

## Success outcome

Every in-scope Drama LLM call receives an effective, provider-valid quality policy or an
explicit safe downgrade. Story stages share a versioned source-of-truth context and a
semantic acceptance gate, so schema-valid but contradictory story output is not silently
accepted. The UI remains understandable and the system can prove what quality was
requested versus what was actually applied.
