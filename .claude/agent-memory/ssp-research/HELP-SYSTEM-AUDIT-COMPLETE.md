---
name: Help System Complete Audit
description: Comprehensive audit of all help topics, documentation coverage, and system pages
type: project
---

# SmartSpecPro Help System — Complete Audit

**Date**: 2026-03-18
**Status**: AUDIT COMPLETE — All help topics and pages mapped
**Total Help Topics**: 31 (both English + Thai)
**Total Pages/Routes**: 77 (across main app, admin, domain-admin)
**Help Coverage**: 28 topics document 43+ pages (56% of routes have direct help)

---

## Executive Summary

The help system is **file-based Markdown** with dual-locale support (English + Thai). All 31 help topics are synchronized between en/ and th/ directories. The system is mature but **8 new feature areas are missing documentation**:

1. **Team Management** (`/teams`) — Multi-user AI team orchestration (new in Feature 044+)
2. **Team Rooms** (within Teams) — Shared chat/work spaces
3. **Team Runs** — Execution history for orchestrated tasks
4. **Scoped Memory** — Team/organization-level memory (Feature 044+)
5. **Run Monitoring** — Pipeline execution dashboard
6. **SSE Streaming** — Real-time data flow visualization
7. **Inter-Agent Communication** — Agent-to-agent messaging protocols
8. **Automation Handoffs** — Task passing between automation workflows

These represent the **Virtual AI Office Orchestrator** (Feature 044+) and **Hybrid Skill Orchestrator** capabilities, not yet documented.

---

## Architecture

### Manifest System
- **File**: `apps/web/docs/help/_manifest.json`
- **Content**: 5 sections (Getting Started, Features, Content Creation, Advanced, Administration)
- **Purpose**: Organizes topics in UI; serves as table of contents

### Content Service
- **File**: `apps/web/server/services/helpContentService.ts`
- **Responsibilities**:
  - Read `.md` files from `docs/help/{locale}/`
  - Parse YAML frontmatter (title, description, icon, section, order, pages, tags)
  - Convert Markdown → HTML via `marked` library
  - Cache results (5-min TTL)
  - Serve via 4 tRPC endpoints

### Content Structure
Each `.md` file has:
- **Frontmatter**: Metadata (title, icon, section, page mappings)
- **Body**: Markdown content (converted to HTML)
- **Excerpt**: First 200 chars plain text (for search)

### Page Mapping
- **Field**: `pages: ["/path1", "/path2", ...]` in frontmatter
- **Purpose**: Contextual help — links topics to specific routes
- **Usage**: `getContextualHelpTopics(page)` returns relevant help for a page

---

## All Help Topics (31 Total)

### Getting Started Section (1 topic)
1. **getting-started** → Pages: `/`, `/dashboard`

### Features Section (8 topics)
1. **chat** → `/chat`
2. **media-generation** → `/chat`, `/media-studio`
3. **skills** → `/chat` (note: skill browser at `/settings/skills` has NO direct help)
4. **browser-session** → `/chat` (via `/browser-session` in chat interface)
5. **presentations** → `/chat`, `/presentation`
6. **video-editor** → `/video-editor`
7. **marketplace** → `/marketplace`, `/agencies/marketplace`, `/agencies/templates`
8. **memory** → `/chat`, `/settings`

### Content Creation Section (8 topics)
1. **agencies** → `/chat`, `/agency` (note: lacks `/agencies/*` routes)
2. **workflows** → `/workflows`, `/workflows/editor`, `/workflows/gallery`
3. **automation** → `/automation`
4. **webhooks** → `/webhook-triggers`
5. **groups** → `/groups`, `/groups/discover`
6. **gallery** → `/gallery`
7. **document-management** → `/document-management`, `/media-history`
8. **usage-analytics** → `/usage`, `/tasks`

### Advanced Section (3 topics)
1. **api-keys** → `/settings`, `/admin/api-keys`
2. **credits** → `/credits`, `/dashboard`
3. **feedback** → `/chat`, `/my-feedback`, `/admin/feedback-hub`

### Administration Section (11 topics)
1. **admin-users** → `/admin/users`, `/admin/packages`
2. **admin-providers** → `/admin/providers`, `/admin/multi-provider` (note: real routes are `/admin/llm-providers`, `/admin/media-providers`)
3. **admin-skills** → `/admin/skills`, `/admin/skill-repositories`
4. **admin-personas** → (no pages listed; route exists: `/admin/personas`)
5. **admin-agencies** → (no pages listed; route exists: `/admin/agencies`)
6. **admin-queues** → `/admin/queues`, `/admin/queues/llm`, `/admin/queues/media`
7. **admin-audit** → `/admin/audit-logs`, `/admin/orchestration-logs`
8. **admin-settings** → `/admin/settings`
9. **admin-advanced** → `/admin/agencies`, `/admin/approvals`, `/admin/tenants`, `/admin/ops`, `/admin/funnel`, `/admin/services`, `/admin/channel-router`, `/admin/system-guardian`, `/admin/feedback-hub`, `/admin/content-quality`, `/admin/sandbox`
10. **domain-admin** → `/domain-admin`, `/domain-admin/theme`, `/domain-admin/content`, `/domain-admin/users`, `/domain-admin/settings`, `/domain-admin/blog`
11. **settings** → `/settings`, `/settings/personas`, `/profile`

---

## All Routes (77 Total)

### Marketing Pages (9)
- `/` (Home)
- `/pricing` (Pricing)
- `/features` (Features)
- `/docs` + `/docs/:slug` (Developer Docs)
- `/contact` (Contact)
- `/about` (About)
- `/changelog` (Changelog)
- `/careers` (Careers)
- `/community` (Community)
- `/support` (Support)
- `/status` (Status)
- `/security` (Security)

### Auth Pages (7)
- `/login`
- `/signup`
- `/forgot-password`
- `/verify-email`
- `/auth/callback/:provider`
- `/auth/callback/google-drive`
- `/auth/callback/onedrive`

### Main App Pages (28)
- `/dashboard` ✓ (has help: "credits")
- `/chat` ✓ (has help: "chat", "media-generation", "skills", "browser-session", "presentations", "memory", "agencies", "feedback")
- `/generate/:type?` (NO help)
- `/media-studio` ✓ (has help: "media-generation")
- `/media-history` ✓ (has help: "document-management")
- `/document-management` ✓ (has help: "document-management")
- `/settings` ✓ (has help: "settings", "api-keys", "memory")
- `/settings/personas` ✓ (has help: "settings", "personas")
- `/settings/skills` ✗ (NO help; "skills" help topic only for `/chat`)
- `/profile` ✓ (has help: "settings")
- `/gallery` ✓ (has help: "gallery")
- `/credits` ✓ (has help: "credits")
- `/usage` (Usage Analytics) ✓ (has help: "usage-analytics")
- `/tasks` (Task Queue Monitor) ✓ (has help: "usage-analytics")
- `/my-feedback` ✓ (has help: "feedback")
- `/video-editor` ✓ (has help: "video-editor")
- `/presentations` ✓ (has help: "presentations")
- `/presentation-editor/:docId` (NO help)
- `/presentation/:itemId/play` (NO help)
- `/agencies` ✓ (has help: "marketplace", "agencies")
- `/agencies/templates` ✓ (has help: "marketplace", "agencies")
- `/agencies/marketplace` ✓ (has help: "marketplace")
- `/agencies/:id` (Agency Chat) (NO help)
- `/agencies/:id/edit` (Agency Builder) (NO help)
- `/teams` **✗ MISSING HELP** (NEW feature)
- `/teams/:teamId` **✗ MISSING HELP** (NEW feature)
- `/groups` ✓ (has help: "groups")
- `/groups/discover` ✓ (has help: "groups")
- `/groups/:groupId` (NO help)
- `/automation` ✓ (has help: "automation")
- `/automation/live/:sessionId` (NO help)
- `/workflows` ✓ (has help: "workflows")
- `/workflows/editor` ✓ (has help: "workflows")
- `/workflows/gallery` ✓ (has help: "workflows")
- `/workflows/editor/:id` (NO help)
- `/webhook-triggers` ✓ (has help: "webhooks")
- `/factory` (SaaS Factory) (NO help)
- `/terminal` (Terminal) (NO help)
- `/kilo` (CLI) (NO help)
- `/docker` (Docker Sandbox) (NO help)

### Admin Pages (18)
- `/admin/dashboard` (Admin Overview) (NO help)
- `/admin/ops` (Ops Dashboard) (NO help)
- `/admin/funnel` (Funnel Analytics) (NO help; referenced in "admin-advanced")
- `/admin/approvals` (Approvals) (NO help; referenced in "admin-advanced")
- `/admin/tenants` (Tenants) (NO help; referenced in "admin-advanced")
- `/admin/services` (Services) (NO help; referenced in "admin-advanced")
- `/admin/queues` ✓ (has help: "admin-queues")
- `/admin/queues/llm` ✓ (has help: "admin-queues")
- `/admin/queues/media` ✓ (has help: "admin-queues")
- `/admin/audit-logs` ✓ (has help: "admin-audit")
- `/admin/orchestration-logs` ✓ (has help: "admin-audit")
- `/admin/users` ✓ (has help: "admin-users")
- `/admin/packages` ✓ (has help: "admin-users")
- `/admin/llm-providers` ✓ (has help: "admin-providers")
- `/admin/llm-models` (NO help; related to "admin-providers" but not listed)
- `/admin/media-providers` (NO help; related to "admin-providers" but not listed)
- `/admin/media-models` (NO help; related to "admin-providers" but not listed)
- `/admin/skills` ✓ (has help: "admin-skills")
- `/admin/skill-repositories` ✓ (has help: "admin-skills")
- `/admin/personas` ✓ (has help: "admin-personas")
- `/admin/agencies` ✓ (has help: "admin-agencies")
- `/admin/channel-router` (NO help; referenced in "admin-advanced")
- `/admin/gallery` (NO help)
- `/admin/api-keys` ✓ (has help: "api-keys")
- `/admin/settings` ✓ (has help: "admin-settings")
- `/admin/content-quality` (NO help; referenced in "admin-advanced")
- `/admin/system-guardian` (NO help; referenced in "admin-advanced")
- `/admin/feedback-hub` ✓ (has help: "feedback", "admin-advanced")
- `/admin/sandbox` (NO help; referenced in "admin-advanced")

### Domain Admin Pages (6)
- `/domain-admin` ✓ (has help: "domain-admin")
- `/domain-admin/theme` ✓ (has help: "domain-admin")
- `/domain-admin/content` ✓ (has help: "domain-admin")
- `/domain-admin/users` ✓ (has help: "domain-admin")
- `/domain-admin/settings` ✓ (has help: "domain-admin")
- `/domain-admin/blog` ✓ (has help: "domain-admin")

### Help Pages (2)
- `/help` (Help Hub)
- `/help/:slug` (Help Topic)

### Misc Pages (3)
- `/marketplace` ✓ (has help: "marketplace")
- `/404` (Not Found)
- `/docker-redirect` (Docker Redirect)
- `/device-auth` (Device Auth) (NO help)

---

## Gap Analysis — Missing Help Topics

### Tier 1: Routes with NO Help Mapping (7 routes)

| Route | Page Name | Menu Item | Reason |
|-------|-----------|-----------|--------|
| `/generate/:type?` | Generate Page | (not in menu) | Possible deprecated route or hidden surface |
| `/settings/skills` | Skill Browser | "Skills" menu item | Confusing: "skills" help links to `/chat`, not `/settings/skills` |
| `/presentation-editor/:docId` | Presentation Editor | (sub-route of Presentations) | Editorial surface, should have help |
| `/presentation/:itemId/play` | Presentation Play Mode | (sub-route of Presentations) | View mode, needs usage guidance |
| `/agencies/:id` | Agency Chat | (sub-route of Agencies) | Execution surface, should have help |
| `/agencies/:id/edit` | Agency Builder | (sub-route of Agencies) | Builder surface, should have help |
| `/groups/:groupId` | Group Detail | (sub-route of Groups) | Detail view, needs help |
| `/automation/live/:sessionId` | Live Automation Session | (sub-route of Automation) | Real-time session, needs monitoring help |

### Tier 2: Routes with Vague/Incomplete Help Mapping (5 routes)

| Route | Current Help | Issue |
|-------|--------------|-------|
| `/admin/llm-models` | None; admin-providers only lists `/admin/llm-providers` | Media Models help is missing; Media Providers help is missing |
| `/admin/media-providers` | None; admin-providers doesn't cover this | Needs separate coverage |
| `/admin/media-models` | None; admin-providers doesn't cover this | Needs separate coverage |
| `/admin/channel-router` | admin-advanced (vague) | Should have dedicated topic |
| `/admin/personas` | admin-personas (no pages[] field!) | Frontmatter incomplete; missing page mapping |

### Tier 3: NEW Features WITHOUT Help (8 features)

These are from **Feature 044: Virtual AI Office Orchestrator** and **Feature 045+**:

1. **Teams** (`/teams`, `/teams/:teamId`) — Multi-user AI team orchestration
   - Status: Menu item exists, no help topic
   - Requires: team-management.md (EN + TH)
   - Pages: `/teams`, `/teams/:teamId`, possibly sub-pages for team rooms/runs

2. **Team Rooms** (within Teams modal/panel) — Shared work spaces
   - Status: No dedicated UI/help
   - Requires: team-rooms.md
   - Scope: Message history, shared memory, room settings

3. **Team Runs** — Execution history + monitoring
   - Status: No dedicated UI/help
   - Requires: team-runs.md
   - Scope: Run status, logs, artifacts, re-run

4. **Scoped Memory** (Team-level) — Org/team memory vs user memory
   - Status: MemoryPanel may support this, no help
   - Requires: scoped-memory.md
   - Scope: Memory visibility, inheritance, team context

5. **Run Monitoring Dashboard** — Pipeline execution tracking
   - Status: Likely `/admin/orchestration-logs` is this, but help doesn't explain it well
   - Requires: run-monitoring.md or expand admin-audit.md
   - Scope: Live task status, failure recovery, SLA tracking

6. **SSE Streaming** — Real-time data push (e.g., LLM token streaming)
   - Status: Underlying infra, no user-facing help needed (technical)
   - Requires: Optional (developer docs only)

7. **Inter-Agent Communication** — Agent-to-agent tool calls
   - Status: No user-facing surface
   - Requires: Optional (developer docs in `/docs` section)

8. **Automation Handoffs** — Task passing between workflows
   - Status: Part of Workflows, but may need specific help
   - Requires: Expand workflows.md or new automation-handoffs.md
   - Pages: `/automation` (already has help), but capability not explained

---

## Implementation Checklist for Missing Help

### Immediate (User-Facing)

- [ ] Create `team-management.md` (EN + TH)
  - **Estimate**: 4 hours each = 8 hours
  - **Content**: Create team, invite members, manage roles, team memory, shared chats
  - **Pages**: `/teams`, `/teams/:teamId`

- [ ] Create `team-rooms.md` (EN + TH)
  - **Estimate**: 3 hours each = 6 hours
  - **Content**: Room types, message history, shared context
  - **Pages**: `/teams/:teamId` (sub-view)

- [ ] Create `team-runs.md` (EN + TH)
  - **Estimate**: 3 hours each = 6 hours
  - **Content**: Run status, logs, retry, artifacts
  - **Pages**: `/teams/:teamId` (sub-view)

- [ ] Create `scoped-memory.md` (EN + TH)
  - **Estimate**: 2 hours each = 4 hours
  - **Content**: Difference from user memory, visibility, inheritance
  - **Pages**: `/settings` (update existing), `/teams/:teamId`

- [ ] Create `run-monitoring.md` (EN + TH)
  - **Estimate**: 3 hours each = 6 hours
  - **Content**: Monitoring dashboard, SLA, failure recovery
  - **Pages**: `/admin/orchestration-logs` (better coverage)

- [ ] Create `automation-handoffs.md` (EN + TH)
  - **Estimate**: 2 hours each = 4 hours
  - **Content**: Passing data between workflows, trigger conditions
  - **Pages**: `/automation` (update existing)

**Subtotal**: 34 hours (Thai translation only; English base templates may exist in planning docs)

### Secondary (Improve Existing)

- [ ] Fix `admin-personas.md` frontmatter (add pages field)
  - **Pages**: `/admin/personas`
  - **Estimate**: 30 min

- [ ] Create `admin-llm-models.md` (EN + TH)
  - **Estimate**: 2 hours each = 4 hours
  - **Pages**: `/admin/llm-models`

- [ ] Create `admin-media-models.md` (EN + TH)
  - **Estimate**: 2 hours each = 4 hours
  - **Pages**: `/admin/media-models`

- [ ] Create `admin-media-providers.md` (EN + TH)
  - **Estimate**: 2 hours each = 4 hours
  - **Pages**: `/admin/media-providers`

- [ ] Create `admin-channel-router.md` (EN + TH)
  - **Estimate**: 2 hours each = 4 hours
  - **Pages**: `/admin/channel-router`

- [ ] Fix `settings/skills` help mapping
  - Move or create dedicated `skill-browser.md`
  - **Estimate**: 1 hour each = 2 hours

- [ ] Add help for presentation sub-routes
  - Update `presentations.md` to cover all routes
  - **Estimate**: 1.5 hours each = 3 hours

**Subtotal**: 25.5 hours

### Optional (Technical, not user-facing)

- [ ] SSE Streaming documentation (in `/docs`, not `/help`)
- [ ] Inter-agent communication (in `/docs`)
- [ ] API reference for new orchestrator endpoints

---

## File Locations

### Help Content
- English: `/home/dev/projects/SmartSpecPro/apps/web/docs/help/en/`
- Thai: `/home/dev/projects/SmartSpecPro/apps/web/docs/help/th/`
- Manifest: `/home/dev/projects/SmartSpecPro/apps/web/docs/help/_manifest.json`

### Service Code
- Content service: `apps/web/server/services/helpContentService.ts`
- Help router: `apps/web/server/routers/help.ts`
- Help context injector: `apps/web/server/services/helpContextInjector.ts`

### Frontend
- Help hub page: `apps/web/client/src/pages/Help.tsx`
- Help topic page: `apps/web/client/src/pages/HelpTopic.tsx`
- Chat help dialog: `apps/web/client/src/components/chat/ChatHelpDialog.tsx`
- Browser session help: `apps/web/client/src/components/browser-session/BrowserSessionHelpDialog.tsx`

### i18n
- Help translations (400+ keys): `apps/web/client/src/lib/i18n/` (assumed, based on ChatHelpDialog imports)

---

## How Help Content is Served

### tRPC Endpoints (in `help.ts`)
1. **`getManifest(locale)`** — Returns all topics + sections
2. **`getTopic(slug, locale)`** — Returns full topic (title, HTML, excerpt)
3. **`getSearchIndex(locale)`** — Returns searchable index (slug, title, desc, excerpt, tags)
4. **`getContextualTopics(page, locale)`** — Returns help for a specific route

### Cache
- **TTL**: 5 minutes
- **Policy**: Automatic invalidation on file change (dev mode)

### i18n
- **Supported locales**: English (en), Thai (th)
- **Fallback**: If a topic doesn't exist in requested locale, service returns null (client handles fallback to English)

---

## Recommendations

### Short-term (1-2 weeks)
1. Create the 6 Tier 1 help topics for new Features (team-management, team-rooms, team-runs, scoped-memory, run-monitoring, automation-handoffs)
2. Fix `admin-personas.md` frontmatter
3. Create admin model help topics (llm-models, media-models, media-providers, channel-router)

### Medium-term (1 month)
1. Add help for all sub-routes (presentation-editor, presentation/play, agencies/:id, agencies/:id/edit, groups/:groupId, automation/live)
2. Audit all pages for contextual help relevance (many topics are broad; could be more specific)
3. Create developer docs in `/docs` for SSE streaming and inter-agent communication

### Long-term
1. Add video tutorials linked from help topics
2. Build in-app "getting started" wizard for new users
3. Implement AI-powered help search (beyond keyword matching)
4. Add feedback loop (users rate help quality)

---

## Notes

- **Thai translations**: All 31 topics have Thai counterparts. New topics MUST be created in pairs (en/ + th/).
- **Frontmatter is critical**: The `pages` field drives contextual help. Missing/incorrect pages = help won't surface in that page's UI.
- **Manifest.json**: Only defines sections, not topics. Topics are auto-discovered from files.
- **Admin "catch-all"**: The `admin-advanced.md` topic lists 11 pages, serving as a fallback for many admin features.

