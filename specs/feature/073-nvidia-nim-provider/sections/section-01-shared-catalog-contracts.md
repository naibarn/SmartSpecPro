# Section 01 - Shared Catalog Contracts

## Purpose

This section establishes the shared metadata contract that every NVIDIA NIM Hosted catalog row must use across the Node server, admin UI, runtime selection pipeline, and later Python integration work.

The goal is to make NVIDIA catalog rows safe to store, render, filter, and route before any provider sync or admin mutation logic depends on them.

## Why this section exists first

The NVIDIA hosted catalog mixes chat, embeddings, parse, safety, reward, translation, and multimodal rows in one feed. If the shared contract does not carry enough metadata, later sections will have to guess whether a row is chat-capable, auto-selectable, or only safe for internal use.

This section creates the contract that later sections rely on:

- `section-02-nvidia-provider-sync` needs the classification helpers and metadata shape.
- `section-03-admin-catalog-and-mutation-safety` needs the admin-facing row shape and eligibility flags.
- `section-04-runtime-auto-selection-gating` needs a runtime-readable `autoSelectionEligible` signal.
- `section-05-chat-routing-and-provider-integration` needs the shared `apiStyle` compatibility to remain intact.

## Files in scope

- `apps/web/server/services/llmProviderCatalog.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`

## Contract changes to make

### Shared model metadata

Extend the shared provider model shape so NVIDIA-hosted rows can carry multi-surface metadata without breaking existing provider rows.

The contract should support the following fields:

```ts
type ModelSurface =
  | "chat"
  | "embedding"
  | "parse"
  | "guardrail"
  | "reward"
  | "translation"
  | "multimodal"
  | "other";

type AvailableLlmProviderModel = {
  id: string;
  name: string;
  contextLength?: number;
  createdAt?: number;
  pricing?: { input: number; output: number };
  apiStyle?: "chat-completions" | "responses" | "messages" | "gemini";
  ownedBy?: string;
  surface?: ModelSurface;
  executionMode?: "public" | "internal-only" | "deferred";
  autoSelectionEligible?: boolean;
  embeddingDimension?: number;
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsWebSearch?: boolean;
  supportsFunctionTools?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsJsonMode?: boolean;
  supportsStrictToolSchema?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  supportsResponses?: boolean;
};
```

Important compatibility rule:

- keep the existing `apiStyle` enum backward-compatible, including `gemini`
- do not remove or rename any existing provider-facing fields used by Kie, Google, or OpenRouter

### NVIDIA classification helpers

Add shared helper functions in `llmProviderCatalog.ts` to normalize NVIDIA hosted catalog rows:

```ts
type NvidiaHostedClassification = {
  ownedBy?: string;
  surface: ModelSurface;
  executionMode: "public" | "internal-only" | "deferred";
  autoSelectionEligible: boolean;
  apiStyle?: "chat-completions";
};

function classifyNvidiaHostedModel(providerModelId: string, ownedBy?: string): NvidiaHostedClassification;

function buildNvidiaHostedCapabilityOverlay(providerModelId: string): Partial<AvailableLlmProviderModel>;
```

The helper behavior should be conservative:

- exact-ID overrides first
- then non-chat heuristics such as `embed`, `parse`, `reward`, `guard`, `guardian`, `safety`, `pii`, `translate`, `clip`, and clearly multimodal `vl`
- then reviewed chat allowlist or reviewed family rules
- otherwise fall back to `surface = other`, `executionMode = deferred`, `autoSelectionEligible = false`

### Schema typing updates

Update the JSON typing for `llm_providers.availableModels` in `apps/web/drizzle/schema.ts` so the database contract accepts the new fields.

The implementation should also ensure the admin/client row types can read the same metadata, so the UI can render it without casting or hidden assumptions.

## Implementation guidance

This section should not invent a second catalog shape. The same shared contract should flow through:

- provider defaults
- sync normalization
- admin catalog rendering
- runtime selection metadata

The safest implementation pattern is:

1. extend the shared type first
2. make the Zod/schema validation accept the same fields
3. thread the new fields through client/admin row types
4. keep all later sections consuming the same shape

The section should also preserve the existing behavior for providers that do not yet use NVIDIA metadata:

- rows without the new fields must continue to work
- old Kie/OpenAI/Gemini catalog entries must still validate
- shared consumers should treat missing `surface` and `autoSelectionEligible` as absent, not as errors

## TDD expectations

Write the tests for this section before implementing it.

### Contract validation tests

- Test: `availableModels` accepts `ownedBy`
- Test: `availableModels` accepts `surface`
- Test: `availableModels` accepts `executionMode`
- Test: `availableModels` accepts `autoSelectionEligible`
- Test: `apiStyle = gemini` remains valid after the contract extension
- Test: legacy provider rows without the new fields still validate

### Helper classification tests

- Test: a reviewed NVIDIA chat ID classifies as `surface = chat`
- Test: a reviewed NVIDIA embedding ID classifies as `surface = embedding`
- Test: a reviewed NVIDIA parse ID classifies as `surface = parse`
- Test: an ambiguous partner row does not default to chat
- Test: the fallback classification returns `surface = other`, `executionMode = deferred`, and `autoSelectionEligible = false`

### Metadata propagation tests

- Test: admin row types can carry the new catalog fields without losing existing capability flags
- Test: shared metadata fields remain readable after the provider catalog merge path hydrates defaults

## Done when

This section is complete when the shared type contract can represent every NVIDIA-hosted row we plan to sync, while still preserving existing provider compatibility and keeping later sections from having to guess at model surface or auto-selection state.
