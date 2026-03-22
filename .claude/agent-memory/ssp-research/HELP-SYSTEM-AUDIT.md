---
name: Help System Audit
description: Complete audit of help/documentation system architecture, existing coverage, and gaps for new orchestrator features
type: project
---

# Help System Architecture & Coverage Audit

## Status: COMPLETE — 28 Topics Documented, 8 Feature Areas Missing

### Executive Summary

SmartSpecPro has a **comprehensive, bi-lingual help system** (English + Thai) with:
- **File-based architecture**: Markdown files in `docs/help/{en,th}/*.md` with YAML frontmatter
- **Translation system**: i18n with dual locales, translation key-based UI in ChatHelpDialog + BrowserSessionHelpDialog
- **Help router**: tRPC endpoints for manifest, topics, search index, contextual help, and admin screenshot capture
- **Help content service**: Markdown → HTML converter with caching (5-min TTL), slug-based lookup, search indexing
- **Help context injector**: Keyword extraction + topic scoring for dynamic LLM injection

**Documented topics (28):** Chat, Media, Skills, Presentations, Memory, Browser Session, Agencies, Workflows, Settings, Personas, Groups, Document Management, Gallery, Video Editor, Admin (Users, Queues, Audit, Skills, Providers, Settings), Credits, API Keys, Usage Analytics, Marketplace, Automation, Webhooks, Domain Admin, Getting Started, Feedback, Agency Builder, Admin Advanced

**NOT documented (8 new orchestrator features):**
1. Team management (create team, view members, invite, remove)
2. Team rooms (multi-agent conversations, collaboration)
3. Team runs (start/pause/resume/stop, stop policies, run history)
4. Scoped memory (create, search, promote, project-link memory to teams)
5. Run monitoring (events, snapshots, stuck detection, performance)
6. SSE streaming / live updates (status, results, errors)
7. Inter-agent communication (tool use, context passing)
8. Automation handoffs (passing context to external systems)

---

## Current Architecture

### File Structure
```
apps/web/
├── docs/help/
│   ├── _manifest.json           # Section definitions (5 sections)
│   ├── en/                       # English topics (28 files)
│   │   ├── chat.md              # Example: slug, title, description, icon, section, order, pages, tags
│   │   ├── agencies.md
│   │   └── ...
│   └── th/                       # Thai topics (28 files, 1:1 with English)
├── server/routers/
│   └── help.ts                   # tRPC router (4 endpoints)
├── server/services/
│   ├── helpContentService.ts     # Markdown parser, caching, HTML conversion
│   └── helpContextInjector.ts    # Keyword extraction, topic scoring, LLM context injection
├── client/src/
│   ├── components/
│   │   ├── chat/ChatHelpDialog.tsx                    # Help dialog with collapsible sections
│   │   └── browser-session/BrowserSessionHelpDialog.tsx
│   └── lib/i18n/
│       ├── locales/en.ts         # 300+ translation strings for UI (help.*, bsHelp.*)
│       ├── locales/th.ts         # Thai translations
│       └── context.tsx, types.ts # i18n infrastructure
```

### Help Markdown Format
```yaml
---
slug: chat
title: Chat Guide
description: How to use the AI chat interface
icon: MessageSquare                   # Lucide icon name
section: features                     # Must match _manifest.json id
order: 10                             # Display order within section
pages: ["/chat"]                      # Which pages to show contextual help
tags: [chat, conversation, model]     # For keyword matching
---

# Chat Guide

[Markdown content with ## headers, bullet lists, tables, etc.]
```

**Key constraint:** Slug must be unique and match filename (lowercase, hyphenated, no spaces).

### Translation System Pattern
- **Help dialog content**: Stored in i18n `locales/{en,th}.ts` as `help.* keys` (ChatHelpDialog.tsx uses t("help.chatBestFor.title"))
- **Help documentation**: File-based Markdown in `docs/help/{locale}/*.md` (automatic per-locale versions)
- **Help router endpoints**: Return `locale` parameter ("en" or "th") to determine which docs to load

**Important:** ChatHelpDialog uses i18n translations (hardcoded content), while helpContentService loads from Markdown files. These are two separate systems:
1. **i18n system** (ChatHelpDialog) — Used for inline UI help in dialogs
2. **Markdown system** (helpContentService) — Used for /help/* pages, searchable topics, contextual injection

### Help Router Endpoints
**Location:** `server/routers/help.ts`

1. **getManifest(locale)** — Returns section definitions + topic index (no HTML)
   - Input: `{ locale: "en" | "th" }` (default "en")
   - Output: `{ sections: [...], topics: [{slug, title, description, icon, section, order, pages}] }`

2. **getTopic(slug, locale)** — Returns full topic with HTML
   - Input: `{ slug: string, locale: "en" | "th" }` (default "en")
   - Output: `{ slug, title, description, icon, section, order, pages, tags, html, excerpt }`

3. **getSearchIndex(locale)** — Returns searchable topic index
   - Input: `{ locale: "en" | "th" }` (default "en")
   - Output: Array of `{ slug, title, description, excerpt, tags }`

4. **getContextualTopics(page, locale)** — Returns topics relevant to a page (uses `pages` field in frontmatter)
   - Input: `{ page: "/chat", locale: "en" | "th" }`
   - Output: Array of matched topics

5. **captureScreenshot(url, featureName, step, width, height)** — Admin-only, calls Python backend
   - Returns: `{ url, filename, markdown }`

### Help Content Service
**Location:** `server/services/helpContentService.ts`

**Functions:**
- `getHelpManifest(locale)` — Reads `_manifest.json`, returns sections + topic index
- `getHelpTopic(slug, locale)` — Reads `docs/help/{locale}/{slug}.md`, parses YAML + Markdown → HTML
- `getHelpSearchIndex(locale)` — Returns searchable index (all topics with excerpts)
- `getContextualHelpTopics(page, locale)` — Filters topics by `pages` field

**Caching:** 5-minute TTL for all results. Cache key format: `locale:slug` or `locale:search`.

**Markdown parsing:**
- YAML frontmatter extracted via regex
- Markdown → HTML via `marked` library
- Excerpt: first 200 chars of plain text (HTML stripped)

### Help Context Injector
**Location:** `server/services/helpContextInjector.ts`

**Function:** `buildHelpContext(userMessage, locale, maxTopics=3)`

Dynamically injects relevant help documentation into LLM system prompt:
1. Extract keywords from user message (English words + Thai terms)
2. Score all topics against keywords (slug match +3, title +2, tag +2, description +1)
3. Load top 3 matching topics (minimum score 2)
4. Format as "=== HELP DOCUMENTATION REFERENCE ===" section
5. Return context string for LLM injection

Used by "help-assistant" skill in `server/_core/llmRoutes.ts`.

### i18n Translation System
**Location:** `client/src/lib/i18n/`

**Structure:**
```typescript
// locales/en.ts
const en: TranslationDictionary = {
  "help.title": "Complete User Guide",
  "help.chatBestFor.title": "What Chat is best for",
  "help.chatBasics.1": "Type a normal message...",
  // ... 300+ keys for help content
};

// context.tsx
const useI18n = () => ({ t, locale, setLocale })
```

**Sections in ChatHelpDialog translations:**
- `help.title`, `help.description` — Dialog chrome
- `help.chatBestFor.*` — Intro section
- `help.chatBasics.*` — 4 bullet points
- `help.skills.*` — 4 bullet points
- `help.media.*` — 5 bullet points
- `help.presentation.*` — Params table, examples, how-it-works
- `help.skillDetection.*` — Tips, examples, how-it-works
- `help.memory.*` — 7 subsections (what, modes, types, auto, summary, projects, manage, tips)
- `help.browser.*` — 3 bullet points
- `help.agencies.*` — 4 bullets + templates + preview states + commit actions
- `help.useCases.*` — 6 use-case cards

**Sections in BrowserSessionHelpDialog translations:**
- `bsHelp.title`, `bsHelp.description` — Dialog chrome
- `bsHelp.what.*` — Intro
- `bsHelp.quickStart.*` — 5 steps
- `bsHelp.request.*` — 3 tips
- `bsHelp.prompts.*` — 6 example prompts
- `bsHelp.running.*` — 4 tips during session
- `bsHelp.best.*` — 5 best practices
- `bsHelp.useCases.*` — 18 use cases
- `bsHelp.pause.*` — 3 pause scenarios

---

## Existing Help Topics (28 Documented)

### Organized by Section

**Getting Started (2):**
1. `getting-started.md` — Feature overview, account setup
2. (None other)

**Features (10):**
1. `chat.md` — Chat basics, skills, media, memory, browser session
2. `skills.md` — Skill types, detection, execution, chaining
3. `media-generation.md` — Image, video, audio, models, quality settings
4. `presentations.md` — Create from chat, editor, AI-generated slides
5. `memory.md` — What memory stores, modes, types, management
6. `browser-session.md` — Live web interaction, navigation, approval workflow
7. `document-management.md` — Upload, organize, search, delete
8. `gallery.md` — Browse, download, share, tags
9. `groups.md` — Create group, invite members, manage access
10. `video-editor.md` — Intro, timeline, effects, export

**Content Creation (4):**
1. `agency-builder.md` — Create custom agencies, nodes, tools, test
2. `workflows.md` — Build workflow, connect steps, conditions
3. `automation.md` — Trigger, conditions, actions, schedule
4. `api-keys.md` — Generate, revoke, rotate API keys

**Advanced (7):**
1. `agencies.md` — Multi-agent teams, templates, preview lifecycle, save actions
2. `personas.md` — Create, configure, use in chat
3. `webhooks.md` — Inbound webhooks, signatures, testing
4. `marketplace.md` — Browse, install, update, review apps
5. `usage-analytics.md` — Usage metrics, cost breakdown, trends
6. `domain-admin.md` — Domain-level settings, user management
7. `admin-advanced.md` — Advanced config, monitoring, debugging

**Administration (5):**
1. `admin-users.md` — User list, roles, permissions, bulk actions
2. `admin-queues.md` — Queue dashboard, job status, retry
3. `admin-audit.md` — Audit log, search, export
4. `admin-skills.md` — Manage skills, enable/disable, test
5. `admin-providers.md` — LLM providers, model sync, routing
6. `admin-settings.md` — System settings, integrations, configuration
7. `credits.md` — Credit system, pricing, usage tracking
8. `feedback.md` — Submit feedback, report bugs, feature requests
9. `settings.md` — User settings, preferences, notifications

**Total:** 28 topics × 2 locales = 56 Markdown files

---

## Gaps: Missing Documentation for New Features

### 1. Team Management
**Scope:** Create team, view members, invite, remove, change roles, view team details, team settings

**Files needed:**
- `docs/help/en/teams.md`
- `docs/help/th/teams.md`

**i18n keys needed:**
- `help.teams.title`, `help.teams.description`
- `help.teams.create.*`, `help.teams.invite.*`, `help.teams.members.*`, `help.teams.settings.*`

**Manifest update:**
- Add section or place in existing "Advanced" section
- Set `pages: ["/teams", "/settings"]`
- Set `tags: [team, collaboration, members, invite]`

---

### 2. Team Rooms (Multi-Agent Conversations)
**Scope:** Join room, send messages, view participant agents, monitor performance, leave room, room history

**Files needed:**
- `docs/help/en/team-rooms.md`
- `docs/help/th/team-rooms.md`

**i18n keys needed:**
- `help.teamRooms.title`, `help.teamRooms.description`
- `help.teamRooms.whatIs.*`, `help.teamRooms.start.*`, `help.teamRooms.chat.*`, `help.teamRooms.monitor.*`

**Manifest update:**
- Section: "Advanced"
- Pages: `["/team", "/team/room"]`
- Tags: `[team, collaboration, multi-agent, room, conversation]`

---

### 3. Team Runs (Execution History & Control)
**Scope:** Start run, view status, pause/resume, stop, view run history, stop policies, performance metrics

**Files needed:**
- `docs/help/en/team-runs.md`
- `docs/help/th/team-runs.md`

**i18n keys needed:**
- `help.teamRuns.title`, `help.teamRuns.description`
- `help.teamRuns.lifecycle.*`, `help.teamRuns.control.*`, `help.teamRuns.history.*`, `help.teamRuns.policies.*`

**Manifest update:**
- Section: "Advanced"
- Pages: `["/team", "/team/run"]`
- Tags: `[team, run, execution, history, control]`

---

### 4. Scoped Memory
**Scope:** Create memory scoped to team, search team memory, promote to global, project-link memory, memory inheritance

**Files needed:**
- `docs/help/en/team-memory.md` (or extend memory.md)
- `docs/help/th/team-memory.md`

**i18n keys needed:**
- `help.teamMemory.title`, `help.teamMemory.description`
- `help.teamMemory.scope.*`, `help.teamMemory.create.*`, `help.teamMemory.promote.*`, `help.teamMemory.inheritance.*`

**Manifest update:**
- Could extend existing "Features" section "memory" topic
- Pages: `["/chat", "/team", "/team/memory"]`
- Tags: extend memory.md tags: add `team, scope`

---

### 5. Run Monitoring (Events, Snapshots, Stuck Detection)
**Scope:** View run events, take snapshots, stuck detection, performance analysis, replay events

**Files needed:**
- `docs/help/en/run-monitoring.md`
- `docs/help/th/run-monitoring.md`

**i18n keys needed:**
- `help.runMonitoring.title`, `help.runMonitoring.description`
- `help.runMonitoring.events.*`, `help.runMonitoring.snapshots.*`, `help.runMonitoring.stuck.*`, `help.runMonitoring.analyze.*`

**Manifest update:**
- Section: "Advanced" or "Admin"
- Pages: `["/team/run", "/admin/monitoring"]`
- Tags: `[monitoring, run, events, snapshots, performance]`

---

### 6. SSE Streaming & Live Updates
**Scope:** Real-time run status, results streaming, error notifications, live transcription, connection management

**Files needed:**
- `docs/help/en/live-updates.md`
- `docs/help/th/live-updates.md`

**i18n keys needed:**
- `help.liveUpdates.title`, `help.liveUpdates.description`
- `help.liveUpdates.whatIs.*`, `help.liveUpdates.status.*`, `help.liveUpdates.results.*`, `help.liveUpdates.errors.*`, `help.liveUpdates.troubleshoot.*`

**Manifest update:**
- Section: "Advanced" or "Getting Started" (as infrastructure primer)
- Pages: `["/team", "/team/room"]`
- Tags: `[streaming, live, updates, real-time, sse]`

---

### 7. Inter-Agent Communication
**Scope:** Tool use between agents, context passing, message protocol, debugging agent conversations

**Files needed:**
- `docs/help/en/agent-communication.md`
- `docs/help/th/agent-communication.md`

**i18n keys needed:**
- `help.agentComm.title`, `help.agentComm.description`
- `help.agentComm.whatIs.*`, `help.agentComm.tools.*`, `help.agentComm.context.*`, `help.agentComm.debug.*`

**Manifest update:**
- Section: "Advanced"
- Pages: `["/team/room", "/admin/monitoring"]`
- Tags: `[agent, communication, tools, protocol, debugging]`

---

### 8. Automation Handoffs
**Scope:** Pass context to external systems, webhook triggers, state transfer, resumable workflows, approval gates

**Files needed:**
- `docs/help/en/handoffs.md` (or extend automation.md)
- `docs/help/th/handoffs.md`

**i18n keys needed:**
- `help.handoffs.title`, `help.handoffs.description`
- `help.handoffs.whatIs.*`, `help.handoffs.context.*`, `help.handoffs.triggers.*`, `help.handoffs.approval.*`, `help.handoffs.resume.*`

**Manifest update:**
- Could extend "automation.md" or create new topic
- Pages: `["/automation", "/integrations"]`
- Tags: extend automation.md tags: add `handoff, external, webhook, resumable`

---

## Implementation Pattern (For New Topics)

### Markdown File Template
```markdown
---
slug: team-rooms
title: Team Rooms - Multi-Agent Collaboration
description: Real-time collaboration with multi-agent teams in shared rooms
icon: Users
section: advanced
order: 71
pages: ["/team", "/team/room"]
tags: [team, collaboration, multi-agent, room, conversation, real-time]
---

# Team Rooms — Multi-Agent Collaboration

## What are team rooms?

[2-3 paragraphs explaining purpose, when to use]

## Getting started

1. Step one
2. Step two
3. etc.

## [Feature 1]

Details...

## [Feature 2]

Details...

## Common use cases

| Goal | What to do |
|---|---|
| ... | ... |
```

### Translation Keys Template
```typescript
// Add to locales/en.ts
"help.teamRooms.title": "Team Rooms",
"help.teamRooms.description": "Multi-agent teams collaborating in real-time",
"help.teamRooms.whatIs.1": "...",
// etc.

// Add to locales/th.ts
"help.teamRooms.title": "ห้องทีม",
"help.teamRooms.description": "ทีมตัวแทนหลายตัวทำงานร่วมกันแบบเรียลไทม์",
// etc.
```

### Manifest Update
```json
// Update _manifest.json if needed
{
  "sections": [
    // ... existing sections
  ]
}

// Already has "advanced" section, so just add topic to en/th markdown
```

---

## Risks & Considerations

### 1. i18n vs Markdown Separation
**Current design:** Two parallel help systems
- **i18n** (ChatHelpDialog) — Hardcoded, UI-specific, 300+ keys
- **Markdown** (helpContentService) — File-based, searchable, contextual injection

**Risk:** Creating 8 new topics in both English and Thai, keeping them in sync, while also adding 300+ new i18n keys could diverge.

**Mitigation:**
- Use Markdown system for new documentation (stored in `docs/help/{en,th}/`)
- Only add i18n keys for ChatHelpDialog if you want inline help in the modal (not needed for /help/* pages)
- Leverage `getContextualTopics(page)` to inject help on specific pages automatically

### 2. Content Freshness
**Risk:** Markdown documentation can drift from implementation, especially for new orchestrator features under active development.

**Mitigation:**
- Add documentation as features stabilize, not before
- Use feature flags in i18n (`Feature X is currently in Beta`) to handle unstable features
- Implement help content versioning (track last updated date in frontmatter)

### 3. Thai Translation Quality
**Current state:** All 28 topics have Thai translations. New topics will need professional Thai translation (not automated).

**Risk:** If Thai translation is missing or poor, help content is incomplete for th locale users.

**Mitigation:**
- Allocate time for Thai translation review
- Use glossary of existing Thai terms (e.g., "ทีม" for team, "เอเจนซี่" for agency)
- Test ChatHelpDialog with `locale: "th"` to verify rendering

### 4. Topic Slug Uniqueness
**Constraint:** Slug must be globally unique across both locales (filename-based).

**Risk:** If you create `team-rooms.md` in en/ but forget in th/, the lookup will fail for Thai users.

**Mitigation:**
- Always create topic files in pairs: `docs/help/en/{slug}.md` + `docs/help/th/{slug}.md`
- Use consistent slug naming (kebab-case, lowercase, no spaces)
- Update `_manifest.json` with consistent entries for both locales

---

## Options

### Option A: Markdown-Only (Recommended for team features)
- Create 8 new `.md` files in `docs/help/{en,th}/`
- Add entries to `_manifest.json`
- No i18n keys needed (unless you want ChatHelpDialog sections)
- **Pros:** Searchable, contextual, easy to update, no duplication
- **Cons:** Not embedded in ChatHelpDialog (separate /help/* pages)
- **Effort:** 16 files (8 topics × 2 locales) + _manifest.json update

### Option B: Hybrid (i18n for UI + Markdown for docs)
- Create 8 Markdown files (as above)
- Add 300-400 i18n keys for ChatHelpDialog sections
- **Pros:** Help available inline + /help/* pages
- **Cons:** Content duplication, more translation effort, harder to keep in sync
- **Effort:** 16 files + 300+ i18n keys (500+ lines per locale) + _manifest.json update

### Option C: Extend ChatHelpDialog only (Not recommended)
- Add 300+ i18n keys only, no Markdown files
- **Pros:** Single UI for all help
- **Cons:** Not searchable, not linkable (/help/team-rooms won't work), harder to update
- **Effort:** i18n keys only (least code, most maintenance)

---

## Recommendation

**Use Option A (Markdown-only) for new orchestrator features** because:

1. **Team features are specialized** — not needed by all users, best accessed contextually (when on /team page)
2. **Searchable + linkable** — Markdown system supports full-text search, /help/team-rooms URL
3. **Easier to maintain** — Single source of truth, no i18n duplication
4. **Lower translation burden** — Thai translator only translates real content, not hardcoded UI
5. **Dynamic injection ready** — helpContextInjector can auto-inject help into team room LLM prompt

**When to add i18n keys:** Only if ChatHelpDialog should show "Team Rooms" section inline (currently covers Chat, Skills, Media, Presentations, Memory, Browser Session, Agencies — core features). New orchestrator features can stay as /help/* links.

---

## Open Questions

1. **Are team features core enough for ChatHelpDialog?** (Affects i18n decision)
   - If YES → Use Option B (Hybrid)
   - If NO → Use Option A (Markdown-only)

2. **Should run monitoring be admin-only or user-facing?** (Affects pages and visibility)
   - Affects `pages` field in frontmatter

3. **Should automation handoffs extend automation.md or be a separate topic?** (Affects slug/file count)
   - Extending keeps related topics together
   - Separate allows more focused help content

4. **Is Thai translation already budgeted?** (Affects timeline)
   - All 8 new topics need professional Thai translation
   - Estimate: 40-60 hours for professional translator

5. **Should team memory be under Memory topic or separate?** (Affects navigation)
   - Could be subsection of memory.md or new topic
   - Separate topic is clearer but creates more files

---

## File Checklist for Implementation

### Required (8 new topics):
- [ ] `docs/help/en/team-management.md` + `docs/help/th/team-management.md`
- [ ] `docs/help/en/team-rooms.md` + `docs/help/th/team-rooms.md`
- [ ] `docs/help/en/team-runs.md` + `docs/help/th/team-runs.md`
- [ ] `docs/help/en/run-monitoring.md` + `docs/help/th/run-monitoring.md`
- [ ] `docs/help/en/live-updates.md` + `docs/help/th/live-updates.md`
- [ ] `docs/help/en/agent-communication.md` + `docs/help/th/agent-communication.md`
- [ ] `docs/help/en/handoffs.md` + `docs/help/th/handoffs.md`
- [ ] **Option:** `docs/help/en/team-memory.md` + `docs/help/th/team-memory.md` (or extend memory.md)

### Configuration Updates:
- [ ] Update `docs/help/_manifest.json` with new topics (manifest.sections already has "advanced", so just verify)

### Optional (ChatHelpDialog i18n):
- [ ] Add `help.teamRooms.*`, `help.teamRuns.*`, etc. to `client/src/lib/i18n/locales/en.ts`
- [ ] Add Thai equivalents to `client/src/lib/i18n/locales/th.ts`
- [ ] Update ChatHelpDialog.tsx to render new sections (only if Option B chosen)

### Testing:
- [ ] Verify `help.getManifest("en")` returns new topics
- [ ] Verify `help.getTopic("team-rooms", "en")` returns HTML
- [ ] Verify `help.getSearchIndex("th")` includes new topics
- [ ] Test contextual help: `help.getContextualTopics("/team", "en")` returns team-* topics
- [ ] Test i18n rendering if Option B chosen

---

## Key Files to Reference

- **Help Router:** `/apps/web/server/routers/help.ts` (4 endpoints)
- **Help Service:** `/apps/web/server/services/helpContentService.ts` (parsing, caching)
- **Help Injector:** `/apps/web/server/services/helpContextInjector.ts` (LLM context building)
- **ChatHelpDialog:** `/apps/web/client/src/components/chat/ChatHelpDialog.tsx` (UI component)
- **i18n:** `/apps/web/client/src/lib/i18n/locales/{en,th}.ts` (translation keys)
- **Manifest:** `/apps/web/docs/help/_manifest.json` (section definitions)
- **Example Topics:** `/apps/web/docs/help/en/{chat,agencies,memory}.md` (reference implementation)
