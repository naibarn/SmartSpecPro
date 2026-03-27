# Interview Transcript — Feature 060: Media Studio Content Composer

---

## Round 1

### Q1: Article generation UX — streaming or background task?

**Question:** How should article generation work inside the composer? The spec mentions skill and agency routes, web search, and thinking toggles — this affects whether generation is streaming (user sees text appear live) or a background task (spinner then result).

**Answer:** Streaming (like chat)

**Implication:** Article generation will reuse the existing chat/LLM streaming infrastructure. Text appears word-by-word in the HTML preview area as the LLM generates it. The same skill/agency routing used by the chat service applies. Web search and thinking flags are passed as options in the streaming request.

---

### Q2: Track A vs Track B navigation — how to split in MediaStudio?

**Question:** In MediaStudio, how should Track A (current media generation) and Track B (new article composer) be separated in the UI?

**Answer:** Top-level tab (alongside existing Image/Video/Audio tabs)

**Implication:** Add "Article Composer" as a new top-level tab in MediaStudio alongside the existing Image, Video, and Audio tabs. The existing tab state isolation pattern (`tabStates` record) is extended to accommodate a non-generative track. The Article Composer tab renders `ContentComposerPanel` instead of the standard media generation form.

---

### Q3: "Docs" destination target

**Question:** When the user chooses 'Docs' as the publish destination, which CMS target does this refer to?

**Answer:** Both — user picks which (sub-picker: Doc pages or Tenant CMS pages)

**Implication:** The Docs destination step shows a sub-selector:
1. "Documentation" → doc_pages (help center / structured docs)
2. "CMS Page" → tenant_pages (domain admin landing/content pages)

Both sub-options are admin/domain_admin only. The user picks the type first, then selects a target page or creates a new one.

---

## Round 2

### Q4: Social post content format

**Question:** When publishing an article to a social platform (YouTube/Facebook/TikTok/Upload-Post), what content format should be submitted as the post body?

**Answer:** Auto-truncated summary (Recommended)

**Implication:** When the user selects a social destination, the composer triggers a lightweight LLM call to generate a platform-appropriate social caption from the article body. This caption is shown in an editable text field on the destination step so the user can review and adjust before publishing. The full article body is not sent to social platforms — only the generated caption (+ optional media refs).

**Technical note:** Social summary generation happens on-demand when the user reaches the social destination step (not during initial article generation). It uses a short system prompt: "Summarize this article into a social media post for [platform]. Keep it under [platform limit] characters."

---

### Q5: Draft persistence

**Question:** Should article composer drafts be saved persistently (stored in the database so users can return to them later), or is the composer ephemeral?

**Answer:** Persistent drafts in DB (Recommended)

**Implication:** A new `content_composer_drafts` table is required. The composer autosaves to this table ~2s after the user stops making changes (debounced tRPC mutation). A "Draft saved" toast indicator is shown. Users can return to in-progress drafts from the Media Studio "Article Composer" tab (a drafts list is shown before starting a new composition).

---

### Q6: Agency recommendation trigger

**Question:** How should the system decide to 'recommend the agency path' for a complex topic?

**Answer:** Topic length/keywords heuristic (Recommended)

**Implication:** No LLM pre-scan required. The UI analyzes the topic text client-side:
- If topic length > 150 characters, OR
- If topic contains keywords: research, compare, analyze, comprehensive, multi-step, in-depth, detailed, review, versus, vs, pros and cons

Show a soft suggestion banner: "This topic looks complex — consider using an Agency for better results." The user can dismiss it or switch to agency. No hard enforcement.

---

## Auto-Decisions (Technical — Not Asked)

These technical choices were made based on codebase research:

| Decision | Choice | Reason |
|---|---|---|
| Skill filtering for article composer | Show skills with `category` in `['chat_assistant', 'prompt_enhancement']` | Existing skill categories; media generation skills (image_generation etc.) are not suitable for text articles |
| Agency validation | Any agency belonging to the tenant is valid | No "approved templates" concept exists yet; add agency tool-constraint enforcement in Phase 2 |
| HTML sanitization (preview) | DOMPurify on client with `article` profile | Industry standard, 32M weekly downloads, allowlist-based |
| HTML sanitization (storage) | Existing `sanitizeHtml()` in blog.ts route | Reuse existing server-side sanitization; article body sanitized before DB write |
| Blog multi-image storage | Add `mediaAttachments json` column to `blog_posts` | `coverImage` is single varchar; need JSON array for up to 6 refs. Backward compatible addition |
| Social page filtering | Filter by `provider` field on `socialPages` | Existing field distinguishes meta/youtube/tiktok/upload_post pages |
| Platform → social mapping | YouTube, Facebook, TikTok = native; Upload-Post = upload_post gateway | Matches existing `publishGateway: "native" | "upload_post"` pattern in SocialPublishing.tsx |
| Article generation routing | Extend existing chat/skill/agency streaming endpoint | Add `articleMode: true` flag + web search + thinking toggles as streaming options |
| Draft state management | Local `useReducer` within `ContentComposerPanel` | Single-panel scope; no cross-page state needed; avoid adding Zustand for this |
| Social summary generation | On-demand LLM call at destination step | Not during initial generation; avoids generating unnecessary summaries for Blog/Docs destinations |
| Upload-Post platforms available | Use existing `UPLOAD_POST_PLATFORMS` constant | Already defined in `shared/uploadPost.ts` |
| Doc pages target | Reuse existing doc_pages Express route | Already exists and handles CRUD for documentation pages |
| Tenant pages target | Reuse existing tenant_pages tRPC procedures | Already exists via tenant.ts router |
| Testing approach | Vitest + jsdom + @testing-library/react | Matches all existing frontend tests in `pages/__tests__/` |
