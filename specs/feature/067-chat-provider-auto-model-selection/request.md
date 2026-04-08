## Request

Create a follow-up feature spec under `specs/feature` that extends the existing chat model-selection flow so the current chat page can support:

- explicit model selection from OpenRouter, Kie AI, or other enabled LLM providers
- provider-aware behavior when the selected provider is `kie_ai`
- provider-scoped automatic model selection such as:
  - `Kie AI - Auto Model`
  - `OpenRouter - Auto Model`
  - equivalent auto entries for other enabled providers where practical

The desired user experience is:

- the existing chat page keeps its current LLM picker
- a user may still pick a specific model manually
- a user may instead pick a provider-level auto option
- during each run, the system chooses the best enabled model for that provider based on capability requirements and priority
- examples:
  - if the chat request needs web search, choose a model that supports web search
  - if the request needs computer control, choose a model that supports computer use and related requirements
  - if the request needs photo search or image-aware reasoning, choose a model that supports the required visual capabilities

This should build on the repository’s existing auto-selection patterns already used by skills and multi-provider execution, without breaking current OpenRouter-oriented chat behavior.

## Repo-grounded assumptions

- Existing Kie provider behavior is specified in `065-kie-ai-llm-provider-chat-expansion`.
- Chat currently sends `model` and optional `preferredProvider` from the existing chat UI and server routes.
- The repo already contains reusable capability-aware selection logic in:
  - `apps/web/server/services/intelligentModelSelector.ts`
  - `apps/web/server/services/capabilityRegistry.ts`
  - `apps/web/server/services/skillExecutionPolicy.ts`
- The chat page already has a generic auto concept in the model picker via `AUTO_MODEL = "__auto__"`.

## Non-goals

- No attempt to change provider behavior on the original provider websites.
- No mandatory migration of all existing conversations to provider-auto mode.
- No breaking change to current explicit OpenRouter model selection flows.
- No forced auto-switching between providers unless the user selects a provider-auto or global-auto mode.
