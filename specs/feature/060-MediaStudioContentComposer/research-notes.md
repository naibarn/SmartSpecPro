# Research Notes

## Existing code paths

- `apps/web/client/src/pages/MediaStudio.tsx`
  - Already parses `attachTarget` and `referenceImages` from query params.
  - Already supports `Upload to Library & Attach`.
  - Already has a stable handoff from generated media into blog/page attach endpoints.
- `apps/web/client/src/components/agency/preview/MediaPromptPreviewContent.tsx`
  - Already deep-links into Media Studio with `referenceImages`.
- `apps/web/client/src/pages/DomainAdminContent.tsx`
  - Already builds Media Studio links with `attachTarget`.
- `apps/web/client/src/pages/SocialPublishing.tsx`
  - Already supports social platform selection and connected pages/profiles.
  - Already has platform options including `youtube`, `facebook`, `tiktok`, and `upload-post` style routing.
- `apps/web/client/src/pages/SocialChannels.tsx`
  - Existing channel connection surface.
- `apps/web/server/routers/uploadPost.ts`
  - Existing upload-post gateway API surface.
- `apps/web/server/routers/blog.ts`
  - Existing blog media attach endpoint.
- `apps/web/server/routers/tenant.ts`
  - Existing page media attach endpoint.

## Gaps observed

- Media Studio is still centered on media generation first. It does not provide a dedicated article composer flow.
- The current link flow can jump between Media Studio, blog/page attach, and social surfaces, but there is no single article-driven flow with explicit destination routing.
- No explicit UI contract exists for:
  - selecting an article generation skill
  - toggling web search / thinking
  - selecting 1 to 6 attached assets from library for an article
  - selecting Docs / Blog / Social post as a destination in the same panel
  - hiding Docs and Blog for general users

## Design implication

- The new spec should add a dedicated article composer panel inside Media Studio rather than adding more link hops.
- The panel should generate a stable article draft object and then let the user commit assets and choose a publish target.
- Social publishing should remain connected to the existing platform/page/channel selection model, not a new separate flow.
