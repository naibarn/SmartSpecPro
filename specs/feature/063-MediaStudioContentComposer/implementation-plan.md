# Implementation Plan: Feature 063 - Media Studio Content Composer and Publish Router

## Objective

Add a new panel to Media Studio that turns a topic into an article-driven publish flow:

1. Enter a topic
2. Choose the generation source from a skill or an agency
3. Toggle web search and thinking
4. Generate the article
5. Select 1 to 6 images or videos from the library
6. Choose the publish destination:
   - Docs
   - Blog
   - Social post
7. If Social post is selected, choose the platform first, then choose the connected page/channel/account
8. Restrict Docs and Blog options to privileged users only

## Why this spec exists

The current media flow is media-first and link-heavy. It works for attaching one generated asset to an existing target, but it is not a clean content-production workflow. The new design should reduce context switching and make article creation the center of the experience.

## Current-codebase fit

This feature should reuse:

- Media Studio reference-image parsing and attach-target handling
- Existing library upload and stable asset URLs
- Existing blog and tenant page media attach endpoints
- Existing Social Publishing platform/page selection patterns
- Existing Upload-Post gateway routing
- Existing social background provider registry for provider-aware background dispatch
- Existing Media Studio tab architecture so the article composer can land as a separate tab

Likely touched files:

- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/components/media/*`
- `apps/web/server/routers/contentComposer.ts`
- `apps/web/server/routes/contentComposerStream.ts`
- `apps/web/server/services/contentComposerPublishService.ts`
- `apps/web/server/routers/blog.ts`
- `apps/web/server/routers/tenant.ts`
- `apps/web/server/routers/uploadPost.ts`
- `apps/web/server/services/socialBackgroundFacade.ts`
- `apps/web/server/services/social/providers/*`

## Proposed UX

### Panel 1: Article Composer

- Topic input
- Execution source selector
- Skill selector
- Agency selector for complex tasks
- Web search checkbox
- Thinking checkbox
- Generate button
- HTML preview before publish

Selection rules:

- Skills are the default for simple, evergreen work.
- Agencies are suggested for complex, research-heavy, or multi-step work.
- The user must be able to override the recommendation.
- If agency mode is chosen, show the selected agency template or team.

### Panel 2: Media Attachments

- Search/select 1 to 6 assets from Library
- Allow image and video assets
- Show stable library references only

### Panel 3: Destination Router

- Destination type:
  - Docs
  - Blog
  - Social post
- For Docs or Blog:
  - choose the target page or create a new draft target
- For Social post:
  - choose platform: YouTube, Facebook, TikTok, Upload-Post
  - then choose connected page/channel/account

### Permission behavior

- Domain admins and admins can see Docs, Blog, and Social post
- General users see only Social post
- If a user has no connected social account, the UI must prompt them to connect one
- The publish endpoint must enforce the same role boundaries server-side, not just in the UI

## Implementation approach

1. Add a new article composer sub-panel to `MediaStudio.tsx`.
2. Define a new article draft state model that stores:
   - topic
   - execution source
   - selected skill
   - selected agency
   - web search toggle
   - thinking toggle
   - generated article body
   - selected library assets
   - destination type
   - social platform
   - destination target id
3. Reuse existing library search and upload components for asset selection.
4. Reuse the existing social page selection data model for platform and target routing.
5. Make publish actions commit stable asset references before any blog/doc/social post is created.
6. Ensure article previews can render HTML before publish.
7. Keep the current media generation flow intact for users who only want image or video generation.
8. Add a clear security boundary so agency execution only uses approved templates and allowed tools.
9. Keep existing media-generation tabs and library workflows working exactly as they do today.

## Data contract

The article composer should produce a draft object with at least:

- `topic`
- `executionSource`
- `skillId`
- `agencyId`
- `requiresWebSearch`
- `requiresThinking`
- `articleHtml`
- `articleMarkdown`
- `selectedAssetIds`
- `destinationKind`
- `socialPlatform`
- `socialTargetId`
- `attachmentMode`

## Key risks

- Temporary URLs can leak into drafts if the handoff is not forced through library upload.
- The UI can become cluttered if article generation, asset selection, and destination routing are mixed without clear sections.
- Social platform routing must not assume every connected page is valid for every platform.
- Agency execution can broaden tool access if the template is not constrained tightly enough.

## Acceptance criteria

- A user can create an article draft from a topic inside Media Studio.
- The user can choose the generation source as either a skill or an agency.
- The user can choose the generation skill or agency and toggle web search and thinking.
- Complex tasks can use an agency recommendation.
- The user can select between 1 and 6 library assets to attach.
- The user can route the output to Docs, Blog, or Social post.
- General users only see Social post.
- Social post requires platform selection and then account/page/channel selection.
- The publish result uses stable library URLs or library asset ids, not temporary preview URLs.
- Existing image/video generation flows remain functional and unchanged.
