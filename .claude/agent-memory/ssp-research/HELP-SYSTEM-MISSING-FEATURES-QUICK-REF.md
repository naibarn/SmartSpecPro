---
name: Help System Missing Features Quick Reference
description: Quick lookup guide for documenting missing help topics
type: project
---

# Help System Missing Features — Quick Reference

**Current status**: 28 topics documented ✅ | **Missing**: 8 topics ❌ | **Required files**: 16 (8 × 2 locales)

---

## Missing Topics at a Glance

| # | Feature | Slug | Section | Icon | Pages | Est. Words |
|---|---------|------|---------|------|-------|-----------|
| 1 | Team Management | `team-management` | advanced | Users | `/teams` | 500 |
| 2 | Team Rooms | `team-rooms` | advanced | MessageSquare | `/teams` | 500 |
| 3 | Team Runs | `team-runs` | advanced | Play | `/teams` | 500 |
| 4 | Scoped Memory | `scoped-memory` | advanced | Brain | `/teams`, `/settings` | 600 |
| 5 | Run Monitoring | `run-monitoring` | advanced | Activity | `/teams` | 600 |
| 6 | Live Updates (SSE) | `live-updates` | features | Radio | (global) | 400 |
| 7 | Inter-Agent Communication | `agent-communication` | advanced | Share2 | `/teams` | 600 |
| 8 | Automation Handoffs | `automation-handoffs` | advanced | Send | `/automation` | 500 |

---

## File Locations

**All files go in:**
- English: `/home/dev/projects/SmartSpecPro/apps/web/docs/help/en/{slug}.md`
- Thai: `/home/dev/projects/SmartSpecPro/apps/web/docs/help/th/{slug}.md`

**Update only:**
- `/home/dev/projects/SmartSpecPro/apps/web/docs/help/_manifest.json` (only if adding new section)

**No code changes needed** — service auto-discovers markdown files.

---

## Frontmatter Template (Copy & Paste)

```yaml
---
slug: feature-slug
title: Feature Title
description: Brief one-line description for search
icon: IconName
section: advanced
order: 75
pages: ["/path"]
tags: [tag1, tag2, tag3]
---

# Feature Title

[Content starts here]
```

---

## Content Structure Template

Each topic should have:

```markdown
## What is [Feature]?

One-sentence definition. 2–3 sentences of context.

## When to use

Scenarios where this feature is useful.
- Use case 1
- Use case 2
- Use case 3

## Getting started

Step-by-step instructions or link to next doc.

1. Step 1
2. Step 2
3. Step 3

## Common questions

**Q: Question?**
A: Answer with details.

**Q: Another question?**
A: Another answer.
```

---

## Suggested Icons (Lucide)

Pick from these (used in existing 28 topics):

**Common in SmartSpec:**
- `MessageSquare` — Chat, rooms, communication
- `Users` — Teams, groups, collaboration
- `Zap` — Quick actions, automation, runs
- `Brain` — Memory, thinking, context
- `Play` — Start, execute, run
- `Monitor` / `Activity` — Monitoring, status
- `Radio` / `Signal` — Streaming, real-time
- `Share2` / `Send` — Handoffs, passing, delegation
- `Settings` — Configuration, management
- `Book` / `FileText` — Documentation, reference

---

## Order Values (for sorting within section)

**Existing "advanced" topics:**
- `agencies.md` — order 70
- `automation.md` — order 71

**New topics should use:**
- Team Management — 75
- Team Rooms — 76
- Team Runs — 77
- Scoped Memory — 78
- Run Monitoring — 79
- Inter-Agent Communication — 80
- Automation Handoffs — 81

SSE Streaming (in "features" section):
- Order 45 (after media-generation at 40)

---

## Checklist per Topic

For each of the 8 topics:

- [ ] Write English markdown (500–600 words)
- [ ] Write Thai markdown (Thai translator)
- [ ] Include YAML frontmatter with all required fields
- [ ] Add 2–4 `##` sections (what, when, how, Q&A)
- [ ] Use bullet lists or numbered steps
- [ ] Include a table if applicable
- [ ] Use one suggested icon from Lucide
- [ ] Set correct `section` (advanced or features)
- [ ] Set correct `order` (75–81)
- [ ] Include relevant `pages` values
- [ ] Include 3–5 `tags` (keywords)
- [ ] Test: Navigate to `/help`, search for your slug
- [ ] Test: Check contextual help on referenced pages
- [ ] Thai review (if using translator)

---

## Testing After Creation

After creating all 16 files:

1. **Verify files exist:**
   ```bash
   ls -la apps/web/docs/help/en/team-*.md
   ls -la apps/web/docs/help/th/team-*.md
   ```

2. **Clear cache and test:**
   - Navigate to `/help`
   - Search for each topic slug
   - Switch language to Thai, verify translations appear

3. **Test contextual help:**
   - Go to `/teams`
   - Click help button
   - Verify team-related topics appear

4. **Test LLM injection (help-assistant skill):**
   - Message: "how do I create a team?"
   - Verify skill uses team-management help docs in response

---

## Thai Translation Notes

**Who to hire:**
- Native Thai speaker with technical documentation experience
- Should understand SmartSpec terminology (agents, runs, orchestration)
- Estimated budget: $1,500–3,000 for 3,500–4,000 words

**What to provide translator:**
1. English markdown files (8 files, ~600 words each)
2. Glossary of technical terms:
   - Team = ทีม
   - Run = การทำงาน
   - Room = ห้องอภิปราย
   - Agent = ตัวแทน
   - Orchestrator = ผู้ประสานงาน
   - Memory scope = ขอบเขตความจำ
3. Keep UI terms in English (e.g., "Brainstorm Mode", "Live Updates")

**Validate:**
- Check tone matches existing Thai docs (`memory.md`, `chat.md`)
- Verify technical terms match glossary
- Test in `/help` with Thai locale selected

---

## Documentation Reference Files

**To understand existing patterns, read:**

1. `/home/dev/projects/SmartSpecPro/apps/web/docs/help/en/agencies.md` — Long, detailed topic with features
2. `/home/dev/projects/SmartSpecPro/apps/web/docs/help/en/memory.md` — Scoped content, good examples
3. `/home/dev/projects/SmartSpecPro/apps/web/docs/help/en/chat.md` — Quick reference with tables
4. `/home/dev/projects/SmartSpecPro/apps/web/docs/help/th/agencies.md` — Thai translation example

**To understand service:**
1. `/home/dev/projects/SmartSpecPro/apps/web/server/services/helpContentService.ts` — How files are parsed
2. `/home/dev/projects/SmartSpecPro/apps/web/server/routers/help.ts` — tRPC endpoints
3. `/home/dev/projects/SmartSpecPro/apps/web/docs/help/_manifest.json` — Section definitions

---

## Next Steps

1. **Decision**: Approve creating 16 help files (8 topics × 2 locales)
2. **English drafting**: 12–16 hours (can start immediately)
3. **Thai translation**: Hire translator + 40–50 hours (run in parallel with English)
4. **Review + Testing**: 2–3 hours (dev + QA)
5. **Deployment**: Zero-downtime (files auto-discovered by help service)

**Total timeline**: 2–3 weeks (depends on Thai translator availability)

---

## Effort Breakdown

| Task | Hours | Owner | Timeline |
|------|-------|-------|----------|
| Write English topics | 12–16 | Dev | Week 1 |
| Thai translation | 40–50 | Translator | Week 1–2 (parallel) |
| Testing + review | 2–3 | Dev + QA | Week 2 |
| Revisions | 4–6 | Dev + Translator | Week 2–3 |
| **Total** | **58.5–75.5** | — | **2–3 weeks** |

---

## Implementation Recommendation

**Option A: Markdown-Only (RECOMMENDED)**

- Create 16 `.md` files (8 topics × English + Thai)
- Update `_manifest.json` (if adding new section)
- Zero code changes
- Matches existing 28-topic pattern
- Searchable + injectable into help-assistant skill

**Why not Option B (i18n keys)?**
- Would duplicate existing 300+ help.* keys
- Not searchable by help system
- Not injectable into LLM

**Why not Option C (Hybrid)?**
- Overly complex
- Content drift risk

**Recommendation: Use Option A** — simplest, most maintainable.

---

## Support Resources

**Questions about format?** Read the help-content-writer skill:
- `/home/dev/projects/SmartSpecPro/apps/web/skills/help-content-writer/skill.md`

**Want to see how help is delivered?** Check:
- Chat panel: `apps/web/client/src/components/chat/ChatHelpDialog.tsx`
- Help page: `apps/web/client/src/pages/Help.tsx`
- Search: `apps/web/client/src/components/help/useHelpSearch.ts`

**Questions about Lucide icons?** Browse:
- https://lucide.dev (search for icon names)
- Used in existing topics: MessageSquare, Zap, Brain, Users, MonitorPlay, etc.
