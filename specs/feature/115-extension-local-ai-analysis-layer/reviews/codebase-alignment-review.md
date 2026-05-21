# Codebase Alignment Review

## Scope

Reviewed the supplied Chrome Prompt API specification against the current SmartSpecPro repository and created a repository-aligned follow-on feature package.

## Findings

### 1. Existing extension already exists

The source brief includes a recommended module structure as if the extension were being introduced from scratch. The repository already has `apps/extension`, so the new spec treats local AI as an additive layer.

### 2. Platform naming must use `tiktok_shop`

Current shared contracts use:

```ts
export const marketplacePlatforms = ["shopee", "tiktok_shop"] as const;
```

The new spec maps the brief's TikTok language to the existing `tiktok_shop` contract.

### 3. REST namespace is plural in implementation

Current implementation mounts:

```ts
app.use("/api/marketplace-captures", router);
```

The new spec recommends adding insight sync under that namespace, not the brief's standalone `/api/extension/insights`.

### 4. UI is side-panel-first

The current extension uses a side panel, not a popup-first design. The new spec requires Local AI controls inside the existing side panel while keeping current detect/scan/upload/analyze actions.

### 5. Server LLM fallback already exists

`marketplaceExtractionService.ts` already includes deterministic fallback and optional server LLM gateway behavior. The new spec preserves that path and adds Prompt API only as a higher-priority optional provider.

## Result

Created:

- `specs/feature/115-extension-local-ai-analysis-layer/request.md`
- `specs/feature/115-extension-local-ai-analysis-layer/spec.md`
- `specs/feature/115-extension-local-ai-analysis-layer/sections/index.md`
- five implementation section files
- this alignment review

