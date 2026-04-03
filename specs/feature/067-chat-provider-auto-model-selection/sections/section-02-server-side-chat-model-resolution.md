# Section 02: Server-side Chat Model Resolution

## Purpose

Add a single server-side resolver that turns chat selection intent into a concrete model/provider choice.

## Ownership

- selection precedence
- provider filtering
- ranking reuse
- fail-closed resolution

## Target files

- `apps/web/server/services/chatModelSelection.ts`
- `apps/web/server/services/llmRoutesHandler.ts`
- `apps/web/server/routers/chat.ts`

## Implementation notes

### Resolver responsibilities

- parse and normalize `modelSelection`
- support explicit, auto-global, and auto-provider
- reload provider by authoritative provider ID
- filter candidates by provider when needed
- reuse existing capability-aware ranking
- return resolved model/provider and metadata

### Precedence rule

- `modelSelection` is authoritative when present
- contradictory legacy/new fields must fail closed

### Provider rule

- provider-auto must stay within its provider
- explicit mode preserves optional provider pin

## Acceptance checks

- provider-auto never crosses providers
- explicit model flows remain backward-compatible
- contradictory payloads are rejected deterministically
