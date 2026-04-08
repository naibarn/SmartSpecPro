# Adversarial Self-Review — Round 1

Review of `claude-plan.md` from the perspective of a skeptical senior architect.

---

## Finding 1 — HIGH: Streaming implementation is vague about the actual mechanism

**Section:** 8.1 How Streaming Works

**Issue:** The plan says "check how the existing chat streaming is implemented in ChatView.tsx and use the same mechanism" — but this defers a critical architectural decision to the implementer. The existing chat stream likely uses either:
- An Express route with `res.write()` for SSE
- tRPC v11 httpSubscription
- A WebSocket connection via Socket.io (which is used for agency streams)

If the chat streaming uses WebSocket and the article composer tries to implement SSE separately, there will be inconsistency. The implementer needs to know which to use.

**Fix:** Specify that the `generateArticle` endpoint follows the **same pattern as the existing chat streaming endpoint** (which is `POST /api/chat/stream` or equivalent). If that uses Server-Sent Events (SSE) with `res.setHeader('Content-Type', 'text/event-stream')`, use the same. The implementation section should explicitly say "mirror the existing `/api/chat/stream` endpoint's streaming pattern — find it in `chatService.ts` or the Express routes."

---

## Finding 2 — MEDIUM: Draft list + "New Article" flow has a race condition

**Section:** 7.2 ComposerDraftList, 2.2 Composer State Machine

**Issue:** The plan says "New Article" creates an empty draft via `saveDraft` with an empty topic, then advances to step 1. But `saveDraft` has a server-side validation that `topic` is required with `min 1` length (section 4.2). These are contradictory — you can't create an empty draft on the server with `topic: required min 1`.

**Fix:** Either:
1. Make `topic` nullable/optional in `saveDraft` for draft creation (set to empty string or null), OR
2. Don't call `saveDraft` on "New Article" click — just advance to step 1 and autosave when the user actually types a topic. The `activeDraftId` starts null; autosave creates the draft when first called with topic content.

Option 2 is cleaner (no empty drafts created). Fix the plan to use option 2: `activeDraftId` is null until the first successful autosave, which assigns the returned `id` to state.

---

## Finding 3 — MEDIUM: Social caption generation timing is underspecified

**Section:** 9. Social Caption Generation

**Issue:** The plan says caption is "triggered automatically when the user selects a social destination and picks an account." But what if the user changes the account (selects a different page after caption is generated)? Does caption regenerate automatically? And what if the user already edited the caption manually — does switching accounts overwrite their edits?

**Fix:** Specify the rule: caption auto-generates once (when `socialTargetId` is first set). If the user manually edits the caption, set a `captionIsManuallyEdited: boolean` flag in state. If `captionIsManuallyEdited` is true, changing the account does NOT regenerate the caption (to preserve the user's edits). The user can click "Regenerate caption" explicitly to override. If `captionIsManuallyEdited` is false, changing the account triggers a new auto-generation.

---

## Finding 4 — MEDIUM: Blog "Create new" needs a title

**Section:** 10.2 Blog Publish

**Issue:** The plan says `title = "first line of article or first 100 chars stripped of HTML"`. But blog posts have required slug generation. If creating a new blog post, the slug must be unique per tenant. The existing blog router likely auto-generates slugs from titles. But if two articles have similar topics, the slug collision could cause a server error.

**Fix:** Add a note: when creating a new blog post, the slug should be auto-generated from the title + a UUID suffix (e.g., `article-title-abc123`) to guarantee uniqueness. The implementer should follow the existing slug generation pattern in `blog.ts`. If the blog router already handles this (most likely), just note that the article composer relies on the blog router's existing slug generation.

---

## Finding 5 — LOW: `generateSocialCaption` failure handling absent

**Section:** 9. Social Caption Generation

**Issue:** No failure handling for the caption LLM call. If it fails, the user is stuck on the destination step with no caption.

**Fix:** On failure, show an inline error: "Caption generation failed. You can write one manually." The social caption textarea becomes editable immediately; the user can proceed without a generated caption. The caption field is not required for publish (only `contentText` in `socialPosts` is populated from it, and can be empty per existing `createDraft` schema which has `contentText?: optional`).

---

## Finding 6 — LOW: No mention of i18n (internationalization)

**Issue:** The existing codebase uses an i18n system (`useI18n`, locales at `lib/i18n/locales/`). All user-visible strings should use i18n keys. The plan never mentions this.

**Fix:** Add a note in the component architecture section: "All user-visible strings in composer components MUST use `useI18n()` translation keys. Add new keys to `apps/web/client/src/lib/i18n/locales/en.ts` and `th.ts` following the existing pattern. Key prefix: `mediaStudio.articleComposer.*`."

---

## Findings Summary

| # | Severity | Fix Applied? |
|---|----------|-------------|
| 1 | HIGH | Apply — clarify streaming mechanism |
| 2 | MEDIUM | Apply — fix empty draft creation flow |
| 3 | MEDIUM | Apply — specify caption re-generation behavior |
| 4 | MEDIUM | Apply — note slug generation pattern |
| 5 | LOW | Apply — add caption failure handling |
| 6 | LOW | Apply — add i18n requirement |
