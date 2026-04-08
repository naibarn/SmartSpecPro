# Section 02: LLM Request Config Contract

## Purpose

Introduce a media-style per-model request-config contract for LLM models so inputs, passthrough fields, and conflict rules are stored explicitly instead of being scattered across hardcoded route allowlists.

## Ownership

- LLM catalog config shape
- per-model documented inputs
- passthrough allowlists
- parameter conflict metadata

## Target files

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/routers/multiProvider.ts`

## Implementation notes

### Core contract

Each LLM catalog entry should support:

- `apiStyle`
- `config.requestBodyFormat`
- `config.apiEndpoint` or `config.apiEndpointTemplate`
- `config.authStrategy`
- `config.inputFields`
- `config.passthroughFields`
- `config.conflicts`

### Design rule

Separate:

- `inputFields`
  - documented, operator-visible inputs
- `passthroughFields`
  - compatibility fields the gateway should preserve even if the UI does not expose them prominently

Best-fit auth rule:

- `authStrategy` should default to `provider-default`
- request-body format must never imply provider auth headers
- Kie Claude keeps Bearer auth even though its payload shape is Anthropic-style

### Family examples

#### GPT 5.4 / Codex

- `requestBodyFormat: "responses"`
- documented inputs:
  - `input`
  - `tools`
  - `tool_choice`
  - `reasoning`
  - `stream`
- conflicts:
  - web-search tools XOR function tools

#### Claude

- `requestBodyFormat: "anthropic-messages"`
- documented inputs:
  - `messages`
  - `tools`
  - `thinkingFlag`
  - `stream`
- model-specific documented add-on:
  - `claude-sonnet-4-5` includes `output_config`

#### Gemini

- `requestBodyFormat: "openai-chat-completions"`
- documented inputs:
  - `messages`
  - `tools`
  - `stream`
  - `include_thoughts`
  - `reasoning_effort`
  - `response_format` where documented
- conflicts:
  - Google Search XOR Function Calling
  - `response_format` XOR function-calling tools

### Model-level differences that must not be flattened away

- `claude-sonnet-4-5` documents `output_config`; the other Claude pages in scope do not.
- `gemini-3-pro` explicitly documents `response_format`; `gemini-3-flash` and `gemini-3.1-pro` do not in the reviewed pages.
- GPT 5.4 and Codex pages explicitly reference `tool_choice` in the page heading; the examples still center on `tools`.

## TDD expectations

- Write catalog-config tests before route changes.
- Verify config survives round-trips through provider template creation, admin listing, and admin catalog merging.

## Acceptance checks

- Kie models can store rich per-model request config in the catalog.
- The contract is expressive enough to model all documented inputs requested by the user.
- The contract prevents unsafe absolute endpoint URLs by design or validation.
- Legacy providers remain valid without needing the new config immediately.
