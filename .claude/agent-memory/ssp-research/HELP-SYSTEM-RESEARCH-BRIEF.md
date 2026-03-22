---
name: Help System Research Brief
description: Formal research brief on help documentation gaps and implementation strategy
type: project
---

# Help System Documentation Gap — Research Brief

## Findings

### Current State: 28 Topics, Comprehensive Coverage

SmartSpecPro has a **well-architected, bi-lingual help system** with:

- **File-based Markdown** in `docs/help/{en,th}/*.md` with YAML frontmatter
- **tRPC router** with 4 public endpoints (getManifest, getTopic, getSearchIndex, getContextualTopics) + admin screenshot capture
- **Smart caching** (5-min TTL) to avoid parsing on every request
- **Keyword-based context injection** via help-assistant skill for LLM-assisted help responses
- **Full i18n support** with dual English + Thai locales for all 28 topics
- **Searchable** via `/help` page with live filtering and topic preview

**28 Documented Topics** across 5 sections:
- Getting Started (1) — overview, quick start
- Features (10) — chat, skills, media, presentations, memory, browser, documents, gallery, video editor, workflows
- Content Creation (implicit in features)
- Advanced (2) — agencies, automation
- Admin (14) — users, queues, audit, skills, providers, settings, credits, API keys, personas, groups, domain admin, usage analytics, marketplace, advanced admin (agencies, approvals, tenants, ops, funnel, services, channels, guardian, feedback, quality, sandbox)

### The Gap: 8 Missing Feature Areas

Recent implementations of the **Virtual AI Office Orchestrator** (Feature 044) and **Hybrid Skill Orchestrator** (Feature 045) have introduced 8 new user-facing features that have **NO help documentation**:

1. **Team Management** — Create, list, edit, delete teams; manage membership
2. **Team Rooms** — Collaboration spaces for teams; multi-agent discussion
3. **Team Runs** — Execution instances; lifecycle (queued → running → complete/failed)
4. **Scoped Memory** — Team/project-specific context isolation
5. **Run Monitoring** — Real-time execution tracking, events, performance metrics
6. **SSE Streaming / Live Updates** — Real-time status and message delivery
7. **Inter-Agent Communication** — Tool use, context passing, handoff rules
8. **Automation Handoffs** — Agent submission to workflows, presentations, browser sessions

### Impact

Users discovering these features will:
- Lack step-by-step guidance on how to use them
- Not find answers via the `/help` search
- Cannot trigger the help-assistant skill for quick answers
- May struggle with team workflows and agent orchestration

The system **is fully capable** of supporting these topics (service is dynamic). The gap is purely **content coverage**.

---

## Current Architecture

### File Structure

```
apps/web/docs/help/
├── _manifest.json              # Section definitions + metadata
├── en/                         # 28 English topics
│   ├── chat.md
│   ├── agencies.md
│   ├── memory.md
│   └── ... (28 total)
└── th/                         # 28 Thai topics (1:1 mirror)
    ├── chat.md
    ├── agencies.md
    ├── memory.md
    └── ... (28 total)
```

### Service Layer

**helpContentService.ts:**
- Reads YAML frontmatter (slug, title, description, icon, section, order, pages, tags)
- Parses Markdown → HTML via `marked` library
- Caches all results (5-min TTL)
- Returns structured `HelpTopic` objects for rendering

**helpContextInjector.ts:**
- Extracts keywords from user message
- Scores all topics by relevance (slug match +3, title +2, tag +2, description +1)
- Loads top 3 matching topics (min score 2)
- Injects as "=== HELP DOCUMENTATION REFERENCE ===" into LLM system prompt

**help.ts (tRPC router):**
- `getManifest(locale)` — Returns section definitions + topic index
- `getTopic(slug, locale)` — Full topic with HTML
- `getSearchIndex(locale)` — Searchable index (all topics with excerpts)
- `getContextualTopics(page, locale)` — Topics for a specific route
- `captureScreenshot(url, featureName, step, width, height)` — Admin-only

### Frontend

**Help.tsx (page):**
- Full help center at `/help`
- Language toggle (EN/TH)
- Live search across all topics
- Topic view with full HTML rendering

**ChatHelpDialog.tsx:**
- Inline help panel in chat
- Uses i18n keys (hardcoded) + `/help` links
- Collapsible sections (What it's for, How to use, Skills, Media, etc.)

**useHelpSearch hook:**
- Powers search on `/help` page
- Filters by title + description + tags + excerpt

### Frontmatter Format

```yaml
---
slug: chat                           # URL-safe identifier
title: Chat Guide                    # Display title
description: How to use the chat     # Search result excerpt
icon: MessageSquare                  # Lucide icon name
section: features                    # Must match _manifest.json
order: 10                            # Sort order within section
pages: ["/chat"]                     # Contextual help routes
tags: [chat, conversation, skills]   # Keywords for search + injection
---

# Chat Guide

[Markdown content...]
```

### i18n Translation Pattern

- **Help UI text** (dialog headers, buttons) — stored in `locales/en.ts` + `locales/th.ts` (~300 keys: `help.*`, `bsHelp.*`)
- **Help documentation** — file-based Markdown with per-locale versions (`en/chat.md`, `th/chat.md`)
- Both systems coexist without duplication

---

## Risks

### Risk 1: Documentation Mismatch with Implementation

**Severity**: MEDIUM | **Probability**: HIGH

**Description**: If help docs are written before implementation is stable, they may become outdated quickly. Orchestrator feature design is actively evolving.

**Mitigation**:
- Write help only after implementation reaches feature-complete status
- Wait for code review + testing rounds before documentation
- Plan help creation as **final step** of feature acceptance

**Timeline**: Recommend creating help docs **after** team/room/run features ship to production

---

### Risk 2: Thai Translation Quality

**Severity**: HIGH | **Probability**: MEDIUM

**Description**: Incorrect Thai translations or technical term inconsistency will confuse Thai users and undermine the dual-language experience.

**Mitigation**:
- Hire professional Thai translator familiar with technical documentation
- Provide glossary of technical terms (team, run, room, agent, orchestrator)
- Compare tone + terminology with existing Thai docs (`memory.md`, `chat.md`, `agencies.md`)
- Have Thai-fluent reviewer validate before publishing

**Budget**: $1,500–3,000 for 3,500–4,000 words of translation

---

### Risk 3: Incomplete Pages Field

**Severity**: LOW | **Probability**: MEDIUM

**Description**: If `pages: [...]` frontmatter is missing or incomplete, contextual help won't appear where users expect it.

**Mitigation**:
- Audit all new topic files before publishing
- Test each topic on its listed pages
- Use `/help` search + contextual help page testing in QA checklist

---

### Risk 4: SEO / Discoverability

**Severity**: LOW | **Probability**: LOW

**Description**: If tags are generic or slugs unclear, topics may not surface in help search or LLM injection.

**Mitigation**:
- Use specific tags (not generic like "help", "guide")
- Use descriptive slugs that hint at content (not "feature-1", "new-stuff")
- Test help-assistant skill with relevant queries

---

## Options

### Option A: Markdown-Only (Recommended)

**Description**: Create 16 new Markdown files (8 topics × English + Thai) and update `_manifest.json`.

**Pros**:
- Consistent with existing 28-topic pattern
- Zero code changes required
- Fully searchable via `/help` page
- Injectable into help-assistant skill
- One-time translation cost, then self-maintaining

**Cons**:
- Requires professional Thai translator
- 40–50 hours translation work (critical path)
- Each locale is a separate file (potential for drift)

**Effort**: 16 files, 58.5–75.5 hours (mostly translation)

**Recommendation**: **✅ Use this approach** — simplest, most maintainable

---

### Option B: i18n Keys Only

**Description**: Add 100+ new translation keys to `locales/en.ts` + `locales/th.ts` instead of separate files.

**Pros**:
- No separate files to manage
- Can be done by English-only developers
- Easy A/B testing of wording

**Cons**:
- Not searchable by help system (`/help` page won't find them)
- Not injectable into help-assistant skill (LLM won't see them)
- Duplicates existing 300+ `help.*` keys pattern
- Harder to maintain as code grows

**Effort**: 100+ keys + translations, 40–60 hours

**Recommendation**: ❌ **Not recommended** — creates fragmentation

---

### Option C: Hybrid (i18n + Markdown)

**Description**: Keep UI text in i18n, but create Markdown for searchable `/help` pages.

**Pros**:
- ChatHelpDialog stays in i18n (familiar pattern)
- Full documentation searchable on `/help`
- Both systems coexist

**Cons**:
- Overly complex to maintain
- Risk of content drift between systems
- Requires translation for both systems

**Effort**: 16 Markdown files + 100+ i18n keys + translations, 60–80 hours

**Recommendation**: ❌ **Not recommended** — unnecessary complexity

---

## Recommendation

**Use Option A: Markdown-Only Approach**

**Why**:
1. Matches existing 28-topic pattern perfectly
2. Zero code changes (service is already dynamic)
3. Searchable + injectable into LLM
4. Lower total maintenance burden long-term
5. Single source of truth per topic (no sync issues)

**Implementation Plan**:

1. **Phase 1: English drafting** (Week 1, 12–16 hours)
   - Write 8 topics in `/apps/web/docs/help/en/`
   - 500–600 words per topic, 2–4 sections each
   - Include YAML frontmatter (slug, title, description, icon, section, order, pages, tags)
   - Dev can do this immediately

2. **Phase 2: Thai translation** (Week 1–2 parallel, 40–50 hours)
   - Hire professional Thai translator
   - Provide English topics + glossary of technical terms
   - Create `/apps/web/docs/help/th/` mirror files
   - Run in parallel with Phase 1

3. **Phase 3: Testing + Review** (Week 2, 2–3 hours)
   - Verify files in `/help` search
   - Test contextual help on relevant pages
   - Test help-assistant skill with example queries
   - QA + Thai review round

4. **Phase 4: Deployment** (Week 2–3)
   - Merge files, zero service changes required
   - Files auto-discovered by help service
   - No downtime, no backend changes

**Timeline**: 2–3 weeks total (dependent on Thai translator availability)

**Effort**: 58.5–75.5 hours (blocker: Thai translation at 40–50h)

---

## Open Questions

1. **When should we create these docs?**
   - Recommend **after implementation stabilizes** (post-testing, pre-GA release)
   - Avoids docs-chasing-code problem

2. **Do we need to expand the "advanced" section?**
   - Current section order: 1=getting-started, 2=features, 3=content-creation, 4=advanced, 5=admin
   - Could add new `collaboration` section for team features
   - Recommendation: Use existing `advanced` section (simpler)

3. **Should help docs link to the orchestrator spec?**
   - No — help docs should be user-focused, not technical
   - Keep specs in `/planning` directory

4. **Who should translate to Thai?**
   - Hire professional translator (not machine translation)
   - Budget: $1,500–3,000
   - Ideally someone with existing SmartSpec Thai documentation experience

5. **When do we test these with users?**
   - After publishing, collect feedback via `/admin/feedback-hub`
   - A/B test titles/descriptions to see what users search for

---

## Summary Table

| Aspect | Current State | Missing | Recommendation |
|--------|---------------|---------|-----------------|
| **Documented topics** | 28 ✅ | 8 ❌ | Create 16 files (8 × 2 locales) |
| **Implementation** | Complete | None | Zero code changes |
| **Searchability** | Working | Missing | File-based, auto-indexed |
| **Contextual help** | Working | Partial | Add pages field to new topics |
| **LLM injection** | Working | Missing | Use existing help-assistant skill |
| **Thai support** | Working | Missing | Professional translation |
| **Effort to complete** | (done) | 58.5–75.5h | ~2–3 weeks |

---

## References

**Key Files**:
- Help service: `apps/web/server/services/helpContentService.ts`
- Router: `apps/web/server/routers/help.ts`
- Manifest: `apps/web/docs/help/_manifest.json`
- Example: `apps/web/docs/help/en/agencies.md` (well-structured reference)

**Skills**:
- `apps/web/skills/help-assistant/skill.md` — Uses injected help docs
- `apps/web/skills/help-content-writer/skill.md` — Template for new docs

**Features**:
- Orchestrator spec: `planning/virtual-ai-office-orchestrator/spec.md`
- Teams page: `apps/web/client/src/pages/Teams.tsx`
- Help page: `apps/web/client/src/pages/Help.tsx`

---

## Next Steps

1. **Approval**: Decide to proceed with Option A (Markdown-only)
2. **Timeline**: Schedule Thai translator + English drafting
3. **Scope**: Confirm all 8 topics or prioritize subset
4. **QA**: Plan `/help` page + contextual help + skill testing
5. **Launch**: Merge after testing, no backend changes needed
