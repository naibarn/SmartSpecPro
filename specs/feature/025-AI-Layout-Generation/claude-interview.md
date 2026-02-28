# Interview Transcript: Feature 025 — AI Presentation Layout Auto-Generation

## Round 1

### Q1: Empty State — No Article Skills Available
**Question:** For Phase 1 (Article Skill), what should happen if the user hasn't created any article-type skills yet? Should we show a 'no skills available' message, provide a default built-in article skill, or prompt them to create one first?

**Answer:** Provide a built-in default article skill.

### Q2: Default Image Model
**Question:** For Phase 4 (Image Generation), which image model should be the default when the user doesn't explicitly choose one?

**Answer:** Same default as Media Studio (flux-2.0, consistent UX across surfaces).

### Q3: Post-Generation Editing
**Question:** For the generated slides, should the user be able to edit/regenerate individual slides after generation, or is it strictly 'generate all, then manually edit in canvas'?

**Answer:** Generate all, edit manually in canvas (MVP). Simplest approach — generated slides are normal slides.

### Q4: Deck Context
**Question:** Should the AI Draft feature be available only for new/empty decks, or also for decks that already have slides?

**Answer:** Both, with a warning for non-empty decks. Allow appending but show a warning that AI slides will be added at the end.

---

## Round 2

### Q5: Built-in Article Skills
**Question:** The built-in default article skill — should it be a generic 'general article writer' or should we ship multiple built-in article skills for common domains?

**Answer:** 3-5 built-in domain skills. Ship a starter pack: general, business, education, marketing, lifestyle.

### Q6: Phase 1 Error Recovery
**Question:** For error recovery during the 6-phase pipeline: if Phase 1 (article generation) fails, should the entire operation fail immediately, or should we attempt a retry?

**Answer:** Fail immediately, return error to user. Phase 1 is critical — if it fails, there's nothing to split into slides.

### Q7: Loading UX
**Question:** How should we handle the loading UX during the 25-35 second generation?

**Answer:** Detailed progress with slide thumbnails. Show each slide being built as it completes (more complex to implement).

---

## Round 3

### Q8: LLM Structured Output Approach
**Question:** For making direct LLM calls (Phase 2 split), there's no dedicated server-side structured JSON function. Should we create a Node.js utility, use Python backend, or use OpenAI SDK directly?

**Answer:** Create a Node.js utility (callLLMStructured). Small function wrapping getProviderForModel() with JSON response_format, keeping everything in Node.js.

### Q9: Progress Streaming Mechanism
**Question:** For the detailed progress UX with slide thumbnails, how should we stream progress updates to the client?

**Answer:** Polling with progress endpoint. Mutation is async (returns taskId), client polls a progress query every 2 seconds.

---

## Key Design Decisions Summary

1. **Built-in skills:** Ship 3-5 domain-specific article skills (general, business, education, marketing, lifestyle)
2. **Image model:** Use Media Studio default (flux-2.0)
3. **Post-generation:** No regenerate per slide — standard canvas editing
4. **Deck context:** Available for any deck, warning on non-empty
5. **Error handling:** Phase 1 fail = immediate error (no retry)
6. **Loading UX:** Real progress with slide thumbnails via polling
7. **LLM utility:** New `callLLMStructured()` Node.js utility
8. **Progress mechanism:** Async mutation + polling endpoint (not SSE, not fake timer)
