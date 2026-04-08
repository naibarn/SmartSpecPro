# 063 - Media Studio Content Composer and Publish Router

Version: 1.0
Date: 2026-03-25
Status: Proposed
Audience: Product, Frontend, Backend, Social Publishing, Media Studio

---

## 1. Executive summary

This feature turns Media Studio into a content-first workspace.

Instead of only generating media and then bouncing the user between pages, the new flow starts with an article topic and lets the user:

1. choose the execution source used to generate the article
   - a single skill for straightforward topics
   - an agency for complex, research-heavy, or multi-step topics
2. enable or disable web search and thinking
3. generate the article
4. attach 1 to 6 images or videos from the library
5. choose where the content should go:
   - Docs
   - Blog
   - Social post
6. for social posts, choose the platform first, then choose the connected page/channel/account

The core design goal is to remove the current back-and-forth handoff problem and replace it with a stable, article-centered publish router.

---

## 2. Problem statement

The current flow is fragmented:

- Media Studio generates media
- blog and page content are edited elsewhere
- social publishing is handled in a separate section
- attachment handoff relies on temporary media URLs unless the asset is committed to the library first

This leads to:

- too many links and context switches
- unclear publish targets
- duplicate content entry
- temporary URLs being used where stable library references should be used
- no clear role-based difference between admin and general user behavior

The requested redesign needs a stronger structure:

- article generation first
- media selection second
- publish routing third
- platform/account selection only when social is the target

---

## 3. Goals

1. Add a dedicated content article panel inside Media Studio.
2. Let the user enter a topic and choose the generation source from skills or agencies.
3. Let the user toggle web search and thinking.
4. Generate an article draft and preview it as HTML before publishing.
5. Attach 1 to 6 library-backed images or videos to the article.
6. Route the article to Docs, Blog, or Social post.
7. For Social post, support platform selection first, then page/channel/account selection.
8. Restrict Docs and Blog options to admins and domain admins.
9. Keep the current media generation flow available as a separate path.

---

## 4. Non-goals

1. This spec does not replace the existing image/video generation studio.
2. This spec does not require a brand new social backend if the existing social and upload-post systems can be reused.
3. This spec does not allow temporary preview URLs to be published as final references.
4. This spec does not auto-publish without explicit user confirmation.
5. This spec does not remove the existing blog/page attach flow.

---

## 5. User roles and visibility

### Admin and domain_admin

- Can see destination options for:
  - Docs
  - Blog
  - Social post
- Can choose the article generation skill and publish targets
- Can use media attachments from the library

### General user

- Sees only Social post
- Can choose the social platform first
- Can choose connected page/channel/account after choosing the platform
- Can still generate an article and attach media if social publishing is available to the tenant

### Connected account behavior

- If no social account or page is connected, the UI must explain what is missing
- Platform choice must narrow the account/page/channel list to valid choices only

---

## 6. Target experience

### 6.1 Article composer

The user opens Media Studio and sees a new article composer panel with:

- Topic input
- Execution source selector
- Skill selector
- Agency selector for complex tasks
- Web search toggle
- Thinking toggle
- Generate article button
- HTML preview

The execution source must be explicit. The system may auto-pick a default skill or agency, but the user must be able to see and override it.

Selection behavior:

- Skills are the default for simple or evergreen requests.
- Agencies are available for complex tasks, research-heavy topics, or content that needs multiple coordinated steps.
- The UI should recommend the agency path when the task is complex, but not force it without user confirmation.
- If `agency` is selected, the panel should show which agency template or team will be used.

### 6.2 Media attachment

After generating the article, the user can select 1 to 6 media assets from the library:

- image
- video

The user can select existing library assets or generate new ones and promote them into the library first.

The article must reference stable library asset ids or stable library URLs only.

### 6.3 Publish destination

The user then chooses where to send the result:

- Docs
- Blog
- Social post

For Docs or Blog, the user should be able to choose the content target or create a draft target.

For Social post, the user must pick:

1. platform
2. connected page/channel/account

Supported platform choices:

- YouTube
- Facebook
- TikTok
- Upload-Post

If Upload-Post is selected, the next step should be the connected page/channel/account choice exposed by the upload-post gateway.

---

## 7. Functional requirements

### 7.1 Article generation

- Topic is required.
- The generation source used to create the article is selectable.
- The user can choose either a skill or an agency.
- Complex tasks may default to an agency recommendation.
- Web search can be enabled or disabled.
- Thinking can be enabled or disabled.
- The article result must support an HTML preview before publish.
- The article should be generated in a way that can feed Docs, Blog, and Social post targets.

Agency-specific rules:

- Agencies must use an approved template or preset.
- Agencies must have a constrained tool set suitable for article generation, research, and verification.
- The user must be able to see which agency will run before publish.
- The system must not silently switch from skill to agency or from agency to skill.

### 7.2 Media selection

- The user can select between 1 and 6 media items.
- The media must come from the library or be uploaded to the library before publish.
- The composer must not depend on temporary preview URLs.
- The UI must show which assets are attached to which article.

### 7.3 Destination routing

- Docs and Blog are visible only to admin and domain_admin users.
- Social post is visible to general users.
- Social routing must use platform-first selection.
- Social routing must then choose a valid connected page/channel/account.

### 7.4 Stable handoff

- The article composer should produce a stable draft object.
- The draft must carry stable media references.
- The publish step must use stable references when it creates or updates a blog post, docs page, or social post job.

### 7.5 Reuse of current surfaces

- Existing blog/page attach endpoints should be reused where appropriate.
- Existing social publishing and upload-post flows should be reused where appropriate.
- Existing Media Studio generation controls should remain available.

---

## 8. Proposed architecture

### 8.1 Media Studio becomes a two-track workspace

Track A:

- media generation
- reference images
- attach to existing targets

Track B:

- article composer
- attach 1 to 6 library assets
- route to Docs, Blog, or Social post

### 8.2 Publish router

The publish router should normalize the article result into a single internal shape:

- `destinationKind`: `docs | blog | social`
- `executionSource`: `skill | agency`
- `skillId`: selected skill id if a skill route was used
- `agencyId`: selected agency/template id if an agency route was used
- `socialPlatform`: `youtube | facebook | tiktok | upload-post`
- `socialTargetId`: connected page/channel/account id
- `attachmentIds`: stable library asset ids
- `articleBody`: HTML or markdown
- `articleTopic`
- `skillId`
- `requiresWebSearch`
- `requiresThinking`

### 8.3 Stable media promotion

Generated media should follow this order:

1. generate preview
2. upload to library
3. attach library asset to article
4. publish article or social post

Temporary URLs must never be the final publish source.

---

## 9. Key integration points

- `apps/web/client/src/pages/MediaStudio.tsx`
  - Add the article composer panel
  - Keep existing media generation controls intact
  - Add stable attach and destination routing controls
- `apps/web/client/src/pages/SocialPublishing.tsx`
  - Reuse existing platform and connected target selection patterns
- `apps/web/client/src/pages/SocialChannels.tsx`
  - Reuse connected account/page/channel management
- `apps/web/server/routers/blog.ts`
  - Reuse blog attach behavior
- `apps/web/server/routers/tenant.ts`
  - Reuse tenant page attach behavior
- `apps/web/server/routers/uploadPost.ts`
  - Reuse the upload-post gateway for social routing

---

## 10. Security and governance

1. Never publish temporary preview URLs as final content references.
2. Restrict Docs and Blog options to privileged roles.
3. Validate social target ownership and tenant access before publish.
4. Keep web search and thinking as explicit user-controlled toggles, even if the system preselects sensible defaults.
5. Do not silently switch platforms or targets without user confirmation.
6. If agency execution is selected, constrain the agency to approved templates and tool permissions only.
7. Sanitize all generated HTML before previewing or publishing.
8. Require explicit commit to the library before any image or video is attached as a final publish asset.

---

## 11. Acceptance criteria

- A user can create an article draft from a topic inside Media Studio.
- The user can choose the generation source as either a skill or an agency.
- The user can choose the generation skill or agency and toggle web search / thinking.
- Complex tasks can use an agency recommendation.
- The user can preview the article as HTML before publishing.
- The user can attach 1 to 6 library-backed images or videos.
- The user can choose Docs, Blog, or Social post as the target.
- General users only see Social post.
- Social post requires platform selection and then connected page/channel/account selection.
- Published results use stable library-backed references.
- The existing media generation flow still works.

---

## 12. Recommended implementation sequence

1. Add the article composer state model.
2. Wire the article preview and skill selection UI.
3. Wire library-backed asset selection and validation.
4. Add destination routing and role-based visibility.
5. Connect social platform and target selection.
6. Add tests for visibility, selection count, and stable reference behavior.
