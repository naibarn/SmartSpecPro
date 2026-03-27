# Social Video Platform Expansion Research

Date: 2026-03-24

## 1. Codebase Research

### 1.1 Existing social background surface

The repo already has a provider-neutral background path for social actions:

- [`apps/web/server/services/socialBackgroundFacade.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/socialBackgroundFacade.ts)
- [`apps/web/server/routes/internalSocialActions.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/routes/internalSocialActions.ts)
- [`apps/web/server/services/social/providerCatalog.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/social/providerCatalog.ts)

This means the new work should extend the same registry/dispatch pattern rather than creating a second social tool stack.

### 1.2 Agency / workflow integration

The current stack already supports background use from:

- Virtual workflow node execution on the Python side
- Agencies Swarm tool bridging through the Python bridge
- internal HTTP routes guarded by `x-internal-token`

The `builtin-social-actions` tool can dispatch provider-aware background requests without opening the UI.

### 1.3 Existing test harness

- TypeScript: `vitest`
- Python: `pytest`

This is important because the feature is split across web server + Python backend + tool bridge layers.

## 2. Web Research

### 2.1 TikTok official capabilities

The official Content Posting API documentation confirms:

- direct post is supported
- draft upload is supported
- creator info must be queried before posting
- unaudited clients are restricted to private viewing mode
- media transfer can be file upload or pull-from-URL
- URL transfer requires verified domain / URL prefix
- status polling and webhooks exist
- cancellation exists on a best-effort basis for in-flight publish/download tasks

Important docs reviewed:

- [Content Posting API overview](https://developers.tiktok.com/products/content-posting-api)
- [Get started](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [Direct Post reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [Upload Video reference](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video)
- [Creator info query](https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info)
- [Get post status](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status)
- [Media transfer guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide)

### 2.2 YouTube official capabilities

The official YouTube Data API confirms:

- `videos.insert` uploads video and metadata
- `status.publishAt` supports scheduled publish
- privacy settings are available at upload time
- unverified projects created after 28 July 2020 are private-only until audit requirements are met

Important docs reviewed:

- [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- [YouTube Shorts upload help](https://support.google.com/youtube/answer/12779649)
- [YouTube Shorts 3-minute help](https://support.google.com/youtube/answer/15424877)

### 2.3 YouTube Shorts conclusion

There is no separate Shorts upload endpoint in the docs reviewed.
Shorts should be treated as:

- the same upload API as YouTube video upload
- plus a classification rule based on aspect ratio and duration

For standard channels, square or vertical uploads up to 3 minutes are categorized as Shorts.

## 3. Product Implications

1. TikTok needs a first-class provider adapter with preflight creator info and strict media validation.
2. YouTube needs a first-class provider adapter that uses `videos.insert` plus schedule metadata.
3. YouTube Shorts should be modeled as a classifier on top of YouTube upload, not a separate provider family.
4. The provider-neutral social background surface should stay the only integration entry point for workflow and agency swarm callers.

