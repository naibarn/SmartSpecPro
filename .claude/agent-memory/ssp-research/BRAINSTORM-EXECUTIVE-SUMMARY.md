---
name: Brainstorm Feature Executive Summary
description: Quick overview of brainstorm research for stakeholder decisions
type: reference
---

# Brainstorm → Team Rooms: Executive Summary

**Date:** 2026-03-21
**For:** Product, Engineering
**Time to read:** 3 minutes

---

## What Happened to Brainstorm?

**The Brainstorm skill** was a 2-LLM debate mode in Chat where two AI models would argue both sides of a question, then synthesize an answer.

**Status:** Deprecated. Replaced by Team Rooms.

- **Why?** Brainstorm was too simple for real collaboration. Users wanted: (1) more than 2 voices, (2) human participants, (3) work tracking, (4) approval gates
- **When?** Phased out mid-2025; endpoint returns 410 GONE
- **Backward compat?** Old messages still readable in Chat; not deleted

---

## Current State of Play

### Team Rooms (The New Way)

Supports N participants + rich orchestration:
- **Participants:** LLM agents + human coordinators + external connectors (any combo)
- **Turn system:** Dynamic (not just round-robin) — considers roles, work item status, skill detection
- **Work tracking:** Explicit drafts, approvals, status transitions
- **Messaging:** Broadcast, directed (agent→agent), or attached to work items
- **Skills:** Full integration — detected, routed, executed with context

### Brainstorm (The Old Way)

Simple 2-model debate:
- **Participants:** Only 2 LLM models (hard-coded)
- **Turn system:** Predetermined (A→B→A→B→Summary)
- **Work tracking:** None (just messages)
- **Messaging:** Unidirectional (each response independent)
- **Skills:** Metadata only (no execution)

---

## The Ask: "Extend Brainstorm to N Participants"

### We Analyzed 3 Options

| Option | Approach | Effort | Risk | Recommendation |
|--------|----------|--------|------|---|
| **1** | Extend brainstorm to 3+ models | 8-12 hrs | HIGH | ❌ No |
| **2** | Hybrid: brainstorm + work items | 16-20 hrs | CRITICAL | ❌ No |
| **3** | "Quick Debate" template in Teams | 6-8 hrs | LOW | ✅ **YES** |

### Why Option 3?

**Option 1** ("Brainstorm N") just scales the same problem:
- Still no work tracking, approvals, skill routing
- Will be deprecated *again* when users ask for those features
- Doubles maintenance burden (2 systems instead of 1)

**Option 2** ("Structured Brainstorm") tries to graft Team Room onto Chat:
- Introduces architectural debt (2 message stores, 2 orchestration layers)
- Unmaintainable long-term
- Users confused about which tool to use

**Option 3** ("Quick Debate in Teams") solves it cleanly:
- Team Rooms *already* support N participants
- One system to maintain, not two
- Users learn one mental model: Chat (1-on-1) vs Teams (collaboration)
- "Quick Debate" template makes it as simple as brainstorm was
- If users need more (work tracking, approvals), it's already there

---

## What We'd Build (Option 3)

### Phase 1: MVP (6 hours)

1. **New tRPC procedure:** `team.quickDebate(topic, modelA, modelB)`
   - Auto-creates temp team
   - Adds 2 agents
   - Starts run
   - Returns room URL

2. **Chat UI button:** "Start Debate" in Chat header
   - Appears when user writes message that matches debate keywords
   - Opens modal to select 2 models
   - Launches team

3. **Help docs:** New section in teams.md + chat.md update
   - Explain: "Use Teams for collaborative brainstorming"
   - Link old chat.md → teams.md

### Phase 2: UX Polish (4 hours)

- Lighter UI for "Quick Debate" (simpler than full Team Room)
- Add debate templates: "Optimist vs Pessimist", "Expert vs Novice", etc.
- Optional: Auto-carry Chat context into first work item

### Phase 3: Sunset (2 hours)

- Mark brainstorm skill deprecated (after 6 months)
- Help users migrate existing workflows
- Keep endpoint 410 for a year

---

## Impact

### Users

- **Gain:** Full N-participant collaboration without leaving Teams
- **Lose:** "Brainstorm" label (but functionality = same or better)
- **Migration:** 1-click "Start Debate" in Chat; no learning curve

### Engineering

- **Reduce:** Code duplication (1 system instead of 2)
- **Reduce:** Maintenance burden (1 set of tests, 1 message store)
- **Add:** 6 hours of new code (worth it for the cleanup)
- **No:** Breaking changes (old messages still work)

### Product

- **Clearer story:** "Chat for 1-on-1. Teams for collaboration."
- **Upsell:** Users who start with Quick Debate discover Team Room features
- **Metric:** Track: how many Quick Debates → how many convert to full Team workflows?

---

## Decision Required

**Question:** Should we build Option 3 (Quick Debate template)?

**Options:**
- ✅ **Yes** — Recommended. Solves the problem cleanly, reduces debt.
- ⏸ **Later** — Skip for now; revisit if users ask for 3+ model debates.
- ❌ **No** — Keep brainstorm as-is (accept the maintenance cost).

**If Yes:**
- Assign: 6-8 hours this sprint
- Link to: Team Room stability work (currently working on intent routing bugs per prior research)
- Success metric: 3+ users try Quick Debate within 2 weeks

---

## Technical Details

**For implementation:** See full research brief: `BRAINSTORM-TO-TEAM-ROOMS-RESEARCH-BRIEF.md`

**Key files:**
- Team Room core: `apps/web/server/routers/team.ts`
- Chat UI: `apps/web/client/src/components/chat/ChatView.tsx`
- Database: `teamRoomMessages` table (separate from `messages`)
- Deprecated endpoint: `apps/web/server/_core/llmRoutes.ts:2114`

---

## Questions?

- **"What if users want the old brainstorm?"** — It's gone but not deleted. Old messages still render. Tell them: "Use Quick Debate template in Teams."
- **"Will this work with non-English?"** — Team Rooms support i18n (persona system, memory system, etc.). Need to ensure: (1) quick-debate template labels translated, (2) agent prompts respect language.
- **"How do we A/B test?"** — Add feature flag `FEATURE_QUICK_DEBATE_BUTTON` in Chat. Measure: % users clicking / time-to-value.

