# Gateway Compatibility Review

Date: 2026-04-06
Scope: Existing SmartSpecPro gateway readiness as a shared LLM proxy for Claw-family runtimes

## Verdict

The current gateway is **mostly ready as an HTTP LLM proxy** for OpenClaw-, ZeroClaw-, and NemoClaw-style outbound callers, but it is **not yet complete as a full family-wide Claw gateway profile**.

The strongest path today is the OpenAI-compatible HTTP surface:

- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /v1/models`
- `GET /v1/credits`

The weakest path today is the public MCP surface when used as an LLM proxy:

- `POST /v1/mcp` exists
- `smartspec.llm.chat`, `smartspec.llm.embed`, and `smartspec.llm.models` are still placeholders
- MCP session initialization is modeled around API-key-style identity fields and needs auth normalization before it should be treated as a general Claw runtime path
- `POST /v1/responses` has real tenant flag checks, but non-internal callers still resolve to `tenantId = "default"` today

## Endpoint readiness

### Ready now

- `POST /v1/chat/completions`
  - real proxy route
  - supports bearer/API key/session auth
  - handles streaming and multi-provider routing
- `POST /v1/responses`
  - real proxy route
  - supports SSE, tool-loop behavior, and tenant flag checks
- `GET /v1/models`
  - real route
  - returns enabled models across configured providers
- `GET /v1/credits`
  - real route
  - useful for gateway clients that need balance awareness

### Partial

- `POST /v1/mcp`
  - protocol endpoint is real
  - good for implemented SmartSpecPro tool surfaces
  - not yet a true LLM proxy surface because `smartspec.llm.*` handlers are placeholders
- `GET /v1/events`
  - real SSE route
  - useful for public-event consumption
  - not a substitute for runtime-specific interactive orchestration channels

### Missing

- `POST /v1/embeddings`
  - no public route exists yet
- public compatibility docs for external Claw runtimes
  - OpenAPI/docs currently expose `/v1/mcp`
  - LLM proxy endpoints are not published as a formal external runtime contract

## Runtime-family assessment

### OpenClaw

- HTTP gateway: yes
- MCP gateway for LLM parity: not yet
- Notes: best fit today is the OpenAI-compatible HTTP profile plus the worker-control-plane APIs planned in Feature 071

### ZeroClaw

- HTTP gateway: yes
- MCP gateway for LLM parity: not yet
- Notes: usable when ZeroClaw should route centrally instead of using local/provider-direct model access

### NemoClaw

- HTTP gateway: yes
- MCP gateway for LLM parity: not yet
- Notes: outbound-only HTTP profile fits secure-pool positioning better than the current MCP LLM surface

### HiClaw

- HTTP gateway: partial
- MCP gateway for LLM parity: not yet
- Notes: HiClaw can reuse the HTTP proxy for model access, but manager-worker rooms, human-in-the-loop visibility, and cluster semantics are not covered by the current gateway alone

## Concrete gaps to fix next

1. Either implement `smartspec.llm.chat`, `smartspec.llm.embed`, and `smartspec.llm.models` as real proxy calls or remove/hide them from MCP discovery until ready.
2. Normalize `/v1/mcp` session identity for bearer and internal-token callers instead of assuming API-key-shaped fields.
3. Normalize tenant resolution for `/v1/responses` so API-key and bearer callers are evaluated against their real tenant, not always `default`.
4. Add `POST /v1/embeddings` or explicitly document embeddings as unsupported in the Claw gateway profile for this phase.
5. Publish the HTTP gateway contract in public docs so external Claw runtimes know which endpoints are supported and which are intentionally deferred.
6. Keep HiClaw support framed as "can reuse the LLM proxy" rather than "fully supported by the gateway" until cluster-specific control-plane work exists.
