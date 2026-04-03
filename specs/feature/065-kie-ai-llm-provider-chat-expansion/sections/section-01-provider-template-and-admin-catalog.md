# Section 01: Provider Template and Admin Catalog

## Purpose

Teach the admin LLM provider stack that Kie.ai is one provider with multiple per-model API styles.

## Ownership

- LLM provider template metadata
- admin model catalog row construction
- TypeScript and Zod contracts for `availableModels`

## Target files

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/routers/multiProvider.ts`
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`

## Implementation notes

1. Add a new LLM provider template:
   - `providerName: "kie_ai"`
   - `displayName: "Kie AI"`
   - `baseUrl: "https://api.kie.ai"`
   - `isEnabled: false` by default when seeded

2. Extend the `llmProviders.availableModels` TypeScript contract so each model entry can optionally carry:
   - `apiStyle`
   - capability hints
   - nested request `config`
   - existing `contextLength` and `pricing`

3. Update `llmProviders` create/update input validation to accept the richer catalog shape.

4. Replace the assumption that `defaultApiStyleForProvider(providerName)` is sufficient for unmapped rows.
   - For Kie rows, use `availableModels[n].apiStyle`.
   - Keep provider-level fallback for legacy providers that still only need one style.

5. Ensure admin catalog UI surfaces the model `apiStyle` clearly enough that operators can distinguish:
   - `responses`
   - `messages`
   - `chat-completions`
   - and whether rich model config exists for advanced inputs

6. Keep the richer catalog shape backward-compatible:
   - legacy providers must still validate when they only send `{ id, name, contextLength?, pricing? }`
   - admin UI should not require operators to hand-edit raw config JSON just to keep existing providers working

## TDD expectations

- Start with `llmProviders.test.ts` and `multiProvider.test.ts`.
- First make unmapped Kie rows fail because the metadata is ignored.
- Then implement the minimal schema/router changes until the tests pass.

## Acceptance checks

- Kie appears in provider templates.
- Unmapped Kie Claude rows show `messages`.
- Unmapped Kie Gemini rows show `chat-completions`.
- Unmapped Kie GPT/Codex rows show `responses`.
- Kie catalog rows can carry nested request config without being stripped.

## Coordination notes

- Do not break legacy provider templates that rely on provider-wide style defaults.
