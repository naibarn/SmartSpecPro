# Help System Audit — Executive Summary

## Research Question
What help/documentation system exists in SmartSpecPro, what's missing for new orchestrator features, and what pattern should be used for new topics?

## Key Findings

### 1. **Comprehensive Bi-Lingual Help System Already Exists**
SmartSpecPro has a **mature, production-ready help system** with:
- **28 documented topics** (Chat, Media, Skills, Presentations, Memory, Browser Session, Agencies, Admin features, etc.)
- **Dual-locale support** (English + Thai) with 1:1 file parity
- **Multiple access points**: ChatHelpDialog UI, BrowserSessionHelpDialog UI, /help/* pages, LLM prompt injection
- **3-layer architecture**: File-based Markdown, tRPC router, cached HTML service

### 2. **Two Independent Help Systems (Not Integrated)**

| System | Location | Purpose | Coverage |
|--------|----------|---------|----------|
| **Markdown System** | `docs/help/{en,th}/*.md` | Searchable, linkable documentation | 28 topics |
| **i18n System** | `locales/{en,th}.ts` | Hardcoded UI help in dialogs | 300+ keys |

These are **separate** — Markdown files power /help/* pages and contextual injection; i18n powers inline ChatHelpDialog/BrowserSessionHelpDialog.

### 3. **Strategic Gap: 8 New Features Undocumented**
New orchestrator features have **zero help documentation**:
1. **Team Management** (create, invite, manage members)
2. **Team Rooms** (multi-agent conversations)
3. **Team Runs** (execution history, control)
4. **Scoped Memory** (team-level, project-linked)
5. **Run Monitoring** (events, snapshots, stuck detection)
6. **SSE Streaming** (live updates, real-time status)
7. **Inter-Agent Communication** (tool use, context passing)
8. **Automation Handoffs** (external system integration)

**Impact:** Users have no help for these features; help injector can't assist LLM with context.

### 4. **File Organization is Clean and Scalable**
```
docs/help/
├── _manifest.json              # 5 sections defined
├── en/                         # 28 topics
└── th/                         # 28 topics (1:1 with English)
```

**Each topic is a single Markdown file with YAML frontmatter:**
- `slug` (unique identifier)
- `section` (must exist in manifest)
- `pages` (contextual help triggers)
- `tags` (keyword matching for LLM injection)
- Markdown content

### 5. **Help Service is Simple and Cacheable**
Backend architecture is **minimal and efficient**:
- **helpContentService.ts**: Reads Markdown → parses YAML → converts to HTML → caches (5 min TTL)
- **help.ts router**: 4 tRPC endpoints (getManifest, getTopic, getSearchIndex, getContextualTopics)
- **helpContextInjector.ts**: Keywords → topic scoring → LLM context formatting

**No database required** — pure file-based, makes it easy to add new topics.

### 6. **Translation is a Real Cost for New Topics**
- **English content creation:** ~30 min per topic
- **Thai translation:** 40–60 hours total for 8 topics (5–7.5 hours per topic)

Thai translation is **not optional** — the system is designed for bilingual users.

---

## Recommendations

### For New Orchestrator Features: Use Markdown-Only (Option A)

**Why this is best:**

1. **Avoids i18n duplication** — Content lives in one place (Markdown), not repeated in i18n keys
2. **Searchable + linkable** — Users can search help, get permalinks (/help/team-rooms)
3. **Contextually injectable** — helpContextInjector auto-matches topics to LLM prompts
4. **Easier to maintain** — As features evolve, update Markdown; translator keeps up
5. **Consistent with existing pattern** — All 28 topics use Markdown, not i18n

**What to create:**

| Artifact | Count | Effort |
|----------|-------|--------|
| English Markdown files | 8 | ~4 hours |
| Thai Markdown files | 8 | 40–60 hours (professional translator) |
| _manifest.json updates | 1 | 15 min |
| **Total** | **17 files** | **44–64 hours** |

### Implementation Checklist

For each new topic:
1. Create `docs/help/en/{slug}.md` with YAML frontmatter + markdown content
2. Create `docs/help/th/{slug}.md` with Thai translation
3. Ensure `section` field matches entry in `_manifest.json` (use existing "advanced" section)
4. Add `pages: ["/your/page"]` to trigger contextual help
5. Add relevant `tags` for keyword matching in LLM context injector
6. Restart server (5-min cache TTL)
7. Test: `help.getTopic("your-slug", "en")` → verify HTML renders

---

## When NOT to Use Option A

**Skip Markdown, add i18n instead** if:
- Feature should be visible in ChatHelpDialog (main help modal)
- Feature is essential for onboarding all users
- Examples: "Chat", "Skills", "Agencies" (core features)

**Team features likely don't need ChatHelpDialog sections** — they're advanced, user-discovered via the UI itself.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Thai translation quality** | HIGH | Hire professional translator, use glossary of existing terms |
| **Content drift** | MEDIUM | Add "last updated" metadata, feature flag for beta features |
| **Slug collisions** | LOW | Enforce kebab-case naming, auto-check uniqueness in CI |
| **Cache expiry confusion** | LOW | Document 5-min TTL, auto-clear on server restart |
| **Topic isolation** | LOW | Keep topics focused; cross-link related topics in markdown |

---

## Artifacts Produced

### For Decision-Makers
- **HELP-SYSTEM-EXEC-SUMMARY.md** (this doc) — Executive summary, recommendations

### For Implementers
- **HELP-SYSTEM-QUICK-REF.md** — Step-by-step checklist, file format, examples
- **HELP-SYSTEM-VISUAL-SUMMARY.txt** — Architecture diagrams, data flow, cache behavior

### For Deep Dives
- **HELP-SYSTEM-AUDIT.md** — Full technical audit, all 28 existing topics, 8 missing topics, 3 design options, risks, open questions

---

## Next Steps

1. **Decide on timeline** — 8 new topics × 5–7.5 hours/topic = 40–60 hours Thai translation work
2. **Budget professional translator** — AI translation will likely diverge from existing Thai terminology
3. **Start with 1 topic** (e.g., team-management) to establish pattern
4. **Follow HELP-SYSTEM-QUICK-REF.md checklist** for each topic
5. **Test contextual help** — Verify `helpContextInjector` auto-matches topics to LLM prompts
6. **Keep i18n separate** — Don't add ChatHelpDialog sections unless feature is critical to onboarding

---

## Questions to Answer Before Implementation

1. **Are team features essential for onboarding?** (Affects whether they need ChatHelpDialog sections)
   - Answer: Likely NO → Use Markdown-only
2. **Is Thai translation budget approved?**
   - Critical path blocker if NO
3. **Should team features have separate help or be integrated with existing topics?** (e.g., extend memory.md for team memory vs. new team-memory.md)
   - Recommend: Separate topics for clarity
4. **Who owns the Thai translations?** (In-house or contractor?)
   - Recommend: Professional contractor with tech glossary

---

## Conclusion

SmartSpecPro has a **solid, proven help system** ready for new topics. The **Markdown-only approach (Option A) is recommended** for orchestrator features because it's maintainable, avoids duplication, and integrates with existing LLM context injection.

**To unblock implementation:** Budget 40–60 hours for professional Thai translation, use the Quick Reference guide, and follow the step-by-step checklist.

All research artifacts are ready in `.claude/agent-memory/ssp-research/HELP-SYSTEM-*.md`.
