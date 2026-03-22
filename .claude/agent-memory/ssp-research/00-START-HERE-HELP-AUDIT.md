---
name: Help System Audit — Start Here
description: Navigation guide for all help system research artifacts
type: reference
---

# Help System Audit — Navigation Guide

**Date**: 2026-03-18
**Status**: COMPLETE — 4 detailed research documents + implementation roadmap

---

## Quick Facts

- **31 help topics exist** (English + Thai)
- **77 routes in application** (43 documented = 56%, 34 gaps = 44%)
- **8 new features undocumented** (Teams, Team Rooms, etc. — blocking Feature 044)
- **File-based architecture** (zero code changes needed to add topics)
- **Implementation needed**: 74–112 hours (depends on Thai translator availability)

---

## Which Document to Read?

### For Executives / Decision Makers (5 min)
**→ Read**: `HELP-SYSTEM-RESEARCH-BRIEF.txt`

Includes: Status, risks, recommendation, success criteria, immediate action items.

### For Product Leads / Project Managers (15 min)
**→ Read**: `HELP-SYSTEM-EXECUTIVE-SUMMARY.md`

Includes: Metrics, what's working, gaps, costs, success criteria, FAQ.

### For Content Writers / Technical Writers (30 min)
**→ Read**: `HELP-SYSTEM-QUICK-REFERENCE.md`

Includes: File structure, step-by-step checklist for creating new topics, template, troubleshooting.

### For Engineers / Architects (45 min)
**→ Read**: `HELP-SYSTEM-AUDIT-COMPLETE.md` + `HELP-SYSTEM-GAPS-VISUAL.md`

Includes: All 31 topics mapped, all 77 routes analyzed, detailed architecture, risks, options.

### For Sprint Planning (30 min)
**→ Read**: `HELP-SYSTEM-GAPS-VISUAL.md`

Includes: Visual coverage by feature area, RED/YELLOW/GREEN priority buckets, roadmap with effort estimates.

---

## The Bottom Line

### What We Have
✓ Mature help system (file-based, efficient, scalable)
✓ 31 topics in English + Thai
✓ Good coverage for Chat, Media, Agencies, Workflows
✓ Excellent coverage for Domain Admin, Credits, Analytics
✓ Zero technical debt

### What We're Missing
✗ **6 topics for Feature 044** (Teams, Team Rooms, Team Runs, Scoped Memory, Run Monitoring, Automation Handoffs)
✗ **4 topics for admin** (LLM Models, Media Models, Media Providers, Channel Router)
✗ **4 topics for sub-routes** (Presentation Editor, Agency Builder, Agency Chat, Live Automation Session)
✗ **8 topics for admin dashboards** (Ops, Funnel, Approvals, Tenants, Gallery, Guardian, Feedback, Sandbox)

### What to Do NOW

**BLOCKING (do before Feature 044 ships):**
1. Create 6 Feature 044 topics (team-management, team-rooms, team-runs, scoped-memory, run-monitoring, automation-handoffs)
2. Hire Thai translator (freelance, ~$20/h)
3. Set up PR review checklist for frontmatter validation
4. **Timeline**: 3 weeks, blocks Feature 044 release

**IMPORTANT (next sprint):**
1. Create 4 admin topics (llm-models, media-models, media-providers, channel-router)
2. Fix 3 broken mappings (/settings/skills, admin-personas, others)
3. **Timeline**: 2 weeks

**NICE-TO-HAVE (optional, future):**
1. Add sub-route guidance (presentation editor, agency builder, etc.)
2. Improve admin dashboard help
3. **Timeline**: Next month

---

## Key Documents at a Glance

| Document | Size | Read Time | For Whom | Key Sections |
|----------|------|-----------|----------|--------------|
| `HELP-SYSTEM-RESEARCH-BRIEF.txt` | 2 KB | 5 min | Everyone | Findings, risks, recommendation, checklist |
| `HELP-SYSTEM-EXECUTIVE-SUMMARY.md` | 4 KB | 15 min | Execs, PMs, leads | Status, gaps, costs, success metrics, FAQ |
| `HELP-SYSTEM-QUICK-REFERENCE.md` | 6 KB | 30 min | Writers, content team | How to create topics, template, testing |
| `HELP-SYSTEM-AUDIT-COMPLETE.md` | 15 KB | 45 min | Engineers, architects | All topics, all routes, risks, options |
| `HELP-SYSTEM-GAPS-VISUAL.md` | 8 KB | 30 min | Sprint planners | Visual coverage, roadmap, effort estimates |

---

## Recommended Reading Order

1. **Start**: `HELP-SYSTEM-RESEARCH-BRIEF.txt` (everyone, 5 min)
2. **Then**: Choose path by role (see above)
3. **Deep dive**: `HELP-SYSTEM-AUDIT-COMPLETE.md` (if needed)
4. **Implement**: Use `HELP-SYSTEM-QUICK-REFERENCE.md` as checklist

---

## Implementation Checklist

### Week 1
- [ ] Assign help content owner
- [ ] Hire Thai translator (freelance)
- [ ] Create English drafts for 6 Phase 1 topics using template
- [ ] Set up help review checklist in PR template

### Week 2
- [ ] English review + revisions
- [ ] Thai translation (parallel with English review)
- [ ] Add screenshots
- [ ] Test contextual help endpoints

### Week 3
- [ ] Final QA
- [ ] Merge to feature branch
- [ ] Verify in dev/staging

---

## File Locations

All artifacts stored in:
```
apps/web/.claude/agent-memory/ssp-research/

├── 00-START-HERE-HELP-AUDIT.md (THIS FILE)
├── HELP-SYSTEM-RESEARCH-BRIEF.txt (executive summary)
├── HELP-SYSTEM-EXECUTIVE-SUMMARY.md (stakeholder overview)
├── HELP-SYSTEM-QUICK-REFERENCE.md (implementation guide)
├── HELP-SYSTEM-AUDIT-COMPLETE.md (full technical audit)
├── HELP-SYSTEM-GAPS-VISUAL.md (visual coverage breakdown)
└── MEMORY.md (index of all research)
```

Content lives in:
```
apps/web/docs/help/

├── _manifest.json (sections definition)
├── en/ (31 English topics)
└── th/ (31 Thai topics)
```

Service code:
```
apps/web/server/services/helpContentService.ts (346 lines, reads & caches topics)
apps/web/server/routers/help.ts (tRPC router, 4 endpoints)
```

---

## Key Contacts / Ownership

**Content Owner**: [ASSIGN] — Responsible for all help writing
**Thai Translator**: [HIRE FREELANCE] — ~$400-600 for 14 topics
**Product Lead**: [ASSIGN] — Approve help quality, gate releases
**Engineering Lead**: [ASSIGN] — Ensure frontmatter validation in PR reviews

---

## Success Looks Like

- ✓ 6 Feature 044 topics complete by 2026-04-15
- ✓ Both EN + TH for all topics
- ✓ Contextual help surfaces on intended routes
- ✓ 0 "how do I..." support tickets (preventable by help)
- ✓ >20% of users access help monthly

---

## Questions?

See `HELP-SYSTEM-EXECUTIVE-SUMMARY.md` FAQ section for common questions.

---

**Next Step**: Read `HELP-SYSTEM-RESEARCH-BRIEF.txt` (2 min) or choose your role above.

