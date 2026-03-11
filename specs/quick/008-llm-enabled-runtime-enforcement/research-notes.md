## Codebase Scan

- `llmProviders.availableModels` already returns enabled models only.
- `multiProvider.getAvailableModelsWithProviders` already returns enabled mappings only.
- Several server/runtime paths still hardcode `"gpt-4o-mini"` or `"gpt-4o"` when no model is provided.
- Browser-policy settings and memory summarization still read persisted model values without reconciling them against enabled models.
- Client `ChatView` and `AgencyBuilder` still serialize hardcoded fallback models into requests in some execution paths.

## Hotspots

- `apps/web/server/routers/translation.ts`
- `apps/web/server/services/memoryService.ts`
- `apps/web/server/services/scheduler.ts`
- `apps/web/server/services/channelGateway.ts`
- `apps/web/server/services/chatService.ts`
- `apps/web/server/routers/chat.ts`
- `apps/web/server/routers/skills.ts`
- `apps/web/server/services/browserPolicySettingsBridge.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`

## Risk Notes

- Legacy `_core` routes may need a conservative compatibility fallback if they are not fully wired into the new routers.
- Some background services need a deterministic fallback for unattended jobs; if no enabled model exists, explicit failure is safer than silently using a disabled hidden model.
- Cost calculation defaults using `gpt-4o-mini` are pricing defaults, not model availability sources; they do not all need to change in this pass.

