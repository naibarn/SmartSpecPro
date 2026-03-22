---
name: Help System Missing Features Audit
description: Complete audit of help documentation gaps for new orchestrator features and other recent additions
type: project
---

# Help System Missing Features Audit

**Status**: RESEARCH COMPLETE — 8 Missing Features Identified, Documentation Gap Quantified

---

## Executive Summary

SmartSpecPro's help system is **28 topics strong** with comprehensive English + Thai documentation. However, **8 major feature areas from the recent Virtual AI Office Orchestrator and Hybrid Skill Orchestrator features are NOT documented** in the help system.

### Missing Coverage (8 Feature Areas)

1. **Team Management** — Create, view, edit, delete teams; member roles and permissions
2. **Team Rooms** — Multi-agent collaboration spaces, discussion history, turn management
3. **Team Runs** — Start/pause/resume/stop runs, stop policies, run history, status tracking
4. **Scoped Memory** — Create/search/promote memory per team, project-linking, entity isolation
5. **Run Monitoring** — Events, snapshots, stuck detection, performance metrics, error tracking
6. **SSE Streaming / Live Updates** — Real-time status, results, errors, chat completion
7. **Inter-Agent Communication** — Tool use, context passing between agents, handoffs
8. **Automation Handoffs** — Passing context to external systems, workflow triggers, job submission

### Recommendation

Create **16 new help documentation files** (8 topics × 2 locales: English + Thai) using the existing Markdown template. Estimated effort: **40–60 hours for Thai translation** (English can be drafted faster).

---

## Current Help System Status

### Fully Documented Topics (28)

**Getting Started (2):**
- `getting-started.md` — Overview, quick start, navigation
- (No others)

**Features (10):**
- `chat.md` — Chat basics, skills, media, memory, browser session
- `skills.md` — Skill types, detection, execution, chaining
- `media-generation.md` — Image, video, audio generation
- `presentations.md` — Create from chat, editor, AI slides
- `memory.md` — Memory modes, types, management, projects
- `browser-session.md` — Live web interaction, navigation
- `document-management.md` — Upload, organize, search, delete
- `gallery.md` — Browse, search, manage generated media
- `video-editor.md` — Edit clips, effects, transitions, rendering
- `workflows.md` — Build, trigger, schedule automation

**Content Creation (not explicitly in feature section, overlaps):**
- (Media, Presentations, Video Editor covered above)

**Advanced (2):**
- `agencies.md` — Multi-agent teams, templates, marketplace, preview states
- `automation.md` — Triggers, destination mapping, schedules, webhooks

**Admin (14):**
- `admin-users.md` — User management, roles, permissions
- `admin-queues.md` — Queue dashboard, LLM/media/task queues
- `admin-audit.md` — Audit logs, event search, compliance
- `admin-skills.md` — Skill management, deployment, configuration
- `admin-providers.md` — LLM + media provider setup, health
- `admin-settings.md` — System-wide settings, defaults, features
- `admin-advanced.md` — Agencies, approvals, tenants, ops, funnel, services, channel router, system guardian, feedback, quality, sandbox
- `credits.md` — Credit system, usage tracking, top-up
- `api-keys.md` — API key management, token storage, rotation
- `personas.md` — User personas, assistant personas, templates
- `groups.md` — Group management, member roles
- `domain-admin.md` — Multi-tenant, domain configuration, branding
- `usage-analytics.md` — Usage graphs, trends, per-user stats
- `marketplace.md` — Skill marketplace, agency templates, community

### File Structure

```
apps/web/docs/help/
├── _manifest.json           # Section definitions
├── en/                       # 28 English topics
└── th/                       # 28 Thai topics (1:1 mapping)

apps/web/
├── server/routers/help.ts    # tRPC router (4 endpoints + admin)
├── server/services/
│   ├── helpContentService.ts # Markdown parser, caching, HTML conversion
│   └── helpContextInjector.ts # Keyword extraction for LLM injection
└── client/src/lib/i18n/      # 300+ translation keys for UI (help.*, bsHelp.*)
```

---

## Missing Documentation (8 Features)

### 1. Team Management

**What it is:** Create, list, view, edit, and manage team membership

**Pages that should reference it:**
- `/teams` (main teams page — exists in codebase)
- `/settings/teams` (if team settings exist)
- `/admin/team-management` (if admin page exists)

**Typical user workflows:**
- Create a new team (name, description, members)
- Add/remove team members
- Assign roles within a team (lead, contributor, viewer)
- Archive/restore teams
- View team history

**Markdown sections to cover:**
- What are teams? (purpose, use cases)
- Creating a team (step-by-step)
- Managing members (add, remove, roles)
- Team settings (privacy, permissions, integrations)
- Deleting/archiving teams

**Suggested icon:** `Users` or `UserPlus`

**Suggested section:** `advanced` (or create new `collaboration` section)

**Suggested order:** 75

---

### 2. Team Rooms

**What it is:** Conversation spaces where teams collaborate and discuss asynchronously

**Pages that should reference it:**
- `/teams/{teamId}/room/{roomId}` (main room view)
- `/teams` (team room listing)

**Typical user workflows:**
- Create a room within a team (topic, goal, room type)
- Start a room conversation (user posts a goal)
- Let agents discuss autonomously (agent-to-agent turns)
- Watch discussion or skip to summary
- Archive rooms
- Reference previous room discussions

**Markdown sections to cover:**
- What are rooms? (conversation spaces for teams)
- Room types (team discussion, auto-team, direct, job review)
- Creating a room (goal prompt, room type selection)
- Watching vs. hands-off modes
- Room history and artifacts
- Approvals within rooms

**Suggested icon:** `MessageSquare` or `MessageCircle`

**Suggested section:** `advanced`

**Suggested order:** 76

---

### 3. Team Runs

**What it is:** Execution instances of automated work by team agents

**Pages that should reference it:**
- `/teams/{teamId}/runs` (run history)
- `/teams/{teamId}/room/{roomId}/runs` (runs within a room)
- `/admin/runs` (if admin run dashboard exists)

**Typical user workflows:**
- Start a run (submit goal to team agents)
- Pause/resume a run (interrupt if needed)
- Stop a run (abandon if wrong direction)
- View run status (queued, running, complete, failed)
- Review run results
- Rerun with different parameters
- View run history and past results

**Markdown sections to cover:**
- What are runs? (execution instances)
- Starting a run (with or without existing room)
- Run lifecycle (queued → running → paused → complete/failed)
- Pause/resume/stop actions (when to use)
- Run status indicators and what they mean
- Retrieving run results
- Error handling and retries

**Suggested icon:** `Play` or `Zap`

**Suggested section:** `advanced`

**Suggested order:** 77

---

### 4. Scoped Memory

**What it is:** Team-specific, project-specific, or run-specific memory that isolates facts and context

**Pages that should reference it:**
- `/teams/{teamId}/memory` (team memory)
- `/settings/memory` (global + scoped memory settings)
- `/help/memory` (add section on scoping)

**Typical user workflows:**
- Create a team memory (fact, rule, preference for a specific team)
- Search team memory (what do we know about this team's context?)
- Promote team memory to project memory (make it cross-team)
- View which memories apply to which agents
- Link global memories to specific teams
- Clean up unused team memory
- View memory retention policies per team

**Markdown sections to cover:**
- Memory scoping concepts (global vs. team vs. project)
- Creating team-scoped memory
- Memory visibility and inheritance
- How agents access scoped memory
- Memory promotion (team → project → global)
- Retention and cleanup policies
- Conflicting memory resolution

**Suggested icon:** `Brain`

**Suggested section:** `advanced` (or extend `memory.md` in features)

**Suggested order:** 78

---

### 5. Run Monitoring

**What it is:** Real-time and historical monitoring of team run execution

**Pages that should reference it:**
- `/teams/{teamId}/room/{roomId}/monitor` (live monitoring)
- `/teams/{teamId}/runs/{runId}/events` (run event history)
- `/admin/runs` (admin monitoring dashboard)

**Typical user workflows:**
- Watch a run's live status (agents executing)
- View event snapshots (what happened at step 5?)
- Detect stuck runs (agents not making progress)
- Monitor performance (tokens, latency, cost)
- View error logs from failed steps
- Retrieve intermediate artifacts mid-run
- Compare performance across runs

**Markdown sections to cover:**
- What is run monitoring? (live execution tracking)
- Live status view (current step, agents involved, token usage)
- Event history (snapshot of each turn)
- Performance metrics (latency, cost, token efficiency)
- Error detection and troubleshooting
- Stuck detection (when runs are hanging)
- Intermediate artifacts and checkpoints
- Exporting run logs

**Suggested icon:** `Activity` or `Monitor`

**Suggested section:** `advanced`

**Suggested order:** 79

---

### 6. SSE Streaming / Live Updates

**What it is:** Real-time updates for room chat, run status, and agent messages

**Pages that should reference it:**
- `/teams/{teamId}/room/{roomId}` (real-time chat)
- Any page with live status indicators

**Typical user workflows:**
- See live agent messages appear (not polling)
- Watch status change in real-time (running → complete)
- Receive error notifications immediately
- See progress updates during long runs
- Understand when data is stale vs. current

**Markdown sections to cover:**
- How live updates work (streaming vs. polling)
- When you'll see real-time data (during runs, in rooms)
- Connection indicators (connected, reconnecting, offline)
- What happens if connection drops
- Fallback behavior (polling if SSE unavailable)
- How to troubleshoot connection issues

**Suggested icon:** `Radio` or `Signal`

**Suggested section:** `features`

**Suggested order:** 45

---

### 7. Inter-Agent Communication

**What it is:** How agents within a team talk to each other, use tools, and pass context

**Pages that should reference it:**
- `/teams/{teamId}/room/{roomId}` (during discussion)
- `/admin/agent-monitoring` (if exists)

**Typical user workflows:**
- Understand how agents collaborate without you
- Trace tool calls between agents
- See what context one agent passes to another
- Understand handoff rules (when agent A yields to agent B)
- Monitor tool usage and failures
- Intervene if agents get stuck in loop

**Markdown sections to cover:**
- How agents communicate (message passing)
- Tool use and tool result passing
- Context window and token budgeting across agents
- Handoff rules (when one agent yields)
- Circular reasoning detection
- How agents resolve disagreements
- Requesting human approval mid-discussion

**Suggested icon:** `Share2` or `GitBranch`

**Suggested section:** `advanced`

**Suggested order:** 80

---

### 8. Automation Handoffs

**What it is:** Agents handing off execution context to other SmartSpec surfaces (workflows, presentations, video, browser sessions)

**Pages that should reference it:**
- `/automation` (automation page)
- `/workflows` (workflow editor)
- Any page that can receive handoffs

**Typical user workflows:**
- Agent submits a handoff to a workflow
- Workflow executes with agent-provided context
- Results return to the agent room
- Agent processes results and continues discussion
- Error handling if handoff fails

**Markdown sections to cover:**
- What are handoffs? (agent → execution surface)
- Supported handoff destinations (workflow, presentation, video, browser, agency)
- How agents trigger handoffs
- What context is passed
- How results are returned
- Error recovery from failed handoffs
- Approval gates for sensitive handoffs

**Suggested icon:** `Send` or `ArrowRight`

**Suggested section:** `advanced`

**Suggested order:** 81

---

## Help System File Format Reference

### Markdown Template

```yaml
---
slug: unique-topic-slug          # Lowercase, hyphenated, matches filename
title: Human-Readable Topic      # Display title
description: Brief one-liner     # Shows in search results
icon: LucideIconName             # e.g., MessageSquare, Zap, Users
section: features                # One of: getting-started, features, content-creation, advanced, admin
order: 10                         # Sort order within section (10, 20, 30...)
pages: ["/path"]                 # Routes where this help appears contextually
tags: [tag1, tag2]               # Keywords for search and injection
---

# Topic Title

[Markdown content with ## sections, bullet lists, tables, examples]

## What is [feature]?

Brief explanation of what it does and when to use it.

## How to get started

Step-by-step instructions or link to other docs.

## Common use cases

| Scenario | How to do it |
|----------|-------------|
| Use case 1 | Instructions |
| Use case 2 | Instructions |

```

### Frontmatter Fields (Required)

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| slug | string | "team-management" | Lowercase, hyphenated, unique per language |
| title | string | "Team Management" | Display title |
| description | string | "Create and manage AI assistant teams" | Shown in search results |
| icon | string | "Users" | Lucide icon name |
| section | string | "advanced" | Must match `_manifest.json` section id |
| order | number | 75 | Sort order (higher = later in section) |
| pages | array | ["/teams"] | Routes where contextual help is shown |
| tags | array | ["team", "members"] | Keywords for search and LLM injection |

### Available Sections (in _manifest.json)

```json
{
  "id": "getting-started",    "label": { "en": "Getting Started", "th": "เริ่มต้นใช้งาน" },
  "id": "features",           "label": { "en": "Features", "th": "ฟีเจอร์" },
  "id": "content-creation",   "label": { "en": "Content Creation", "th": "สร้างคอนเทนต์" },
  "id": "advanced",           "label": { "en": "Advanced", "th": "ขั้นสูง" },
  "id": "admin",              "label": { "en": "Administration", "th": "การจัดการ" }
}
```

---

## Implementation Recommendations

### Option A: Markdown-Only (Recommended)

**Pros:**
- Consistent with existing 28 topics
- Searchable via `helpContentService.ts`
- Can inject into LLM context via `helpContextInjector.ts`
- One-time Thai translation cost (~50h) then maintained inline
- No i18n key duplication

**Cons:**
- Requires Thai translator for all new topics
- Each locale is a separate file (2 files per topic)

**Effort:** 16 files created + _manifest.json updated + Thai translation (40–60 hours)

---

### Option B: i18n Keys Only

**Pros:**
- Can be done by English-only developers
- No separate file management
- Easy A/B testing of wording

**Cons:**
- Not searchable by help system (only indexed in i18n)
- Not injectable into LLM context for help-assistant skill
- Duplicates translation pattern (already have 300+ help.* keys)
- Harder to maintain dual format

**Effort:** 100+ new translation keys + English + Thai (40–60 hours)

---

### Option C: Hybrid (i18n for UI, Markdown for searchable docs)

**Pros:**
- ChatHelpDialog stays in i18n (existing pattern)
- /help/ pages use Markdown (searchable)
- Both systems coexist

**Cons:**
- More complex to maintain
- Possible content drift between systems

**Effort:** 16 Markdown files + 100+ i18n keys + Thai (60–80 hours)

---

## Recommendation

**Use Option A (Markdown-Only)** for new orchestrator features:

1. Write 8 English topics in `/apps/web/docs/help/en/`
2. Create 8 matching Thai topics in `/apps/web/docs/help/th/` (hire native translator)
3. Update `_manifest.json` to include new sections if needed (e.g., could add `collaboration` section)
4. Test via `/help` page and ChatHelpDialog
5. Topics will automatically be searchable and injectable into help-assistant skill

This approach:
- Matches existing patterns (28 topics already in Markdown)
- Requires zero code changes (service already supports dynamic topics)
- Provides searchability out of the box
- One-time Thai translation, then self-maintaining

---

## Existing Features NOT Yet Documented (Secondary Gaps)

While the 8 orchestrator features are the primary gap, a few other recent additions also lack help docs:

1. **Persona Templates** (`apps/web/client/src/components/settings/personaTemplates.ts`)
   - File: `docs/help/en/persona-templates.md` + Thai equivalent
   - Should extend or link to `personas.md`

2. **Agency Preview / MediaPromptPreviewContent** (new in git status)
   - Covered in `agencies.md` but could use dedicated "Agency Preview States" subsection

3. **i18n System** (`apps/web/client/src/lib/i18n/`)
   - Already covered as language toggle in Help header
   - No separate help doc needed

4. **Help System Itself** (`/help` page, Help.tsx)
   - Not self-documenting in the help system
   - Could add "How to Use This Help Center" topic

5. **Virtual Admin Agent / System Guardian**
   - Referenced in `admin-advanced.md` (System Guardian section exists)
   - Could use expansion for "Rule Engine" and "Auto-Remediation"

6. **Hybrid Skill Orchestrator** (Feature 045)
   - Covered under `skills.md` but could expand
   - Could add dedicated topic for "Skill Chaining" advanced usage

---

## Quick Implementation Checklist

For each new topic:

- [ ] Write English Markdown (`docs/help/en/{slug}.md`)
- [ ] Write Thai Markdown (`docs/help/th/{slug}.md`)
- [ ] Include YAML frontmatter (slug, title, description, icon, section, order, pages, tags)
- [ ] Content: 200–800 words, 2–4 ## sections, bullet lists, tables where applicable
- [ ] Use existing icons from Lucide (MessageSquare, Users, Zap, etc.)
- [ ] Test: Navigate to `/help` and search for your topic
- [ ] Test: Check that contextual help appears on referenced `pages`
- [ ] Update `_manifest.json` only if adding new section

---

## Files to Modify

**Create (16 new files):**
- `apps/web/docs/help/en/team-management.md`
- `apps/web/docs/help/th/team-management.md`
- `apps/web/docs/help/en/team-rooms.md`
- `apps/web/docs/help/th/team-rooms.md`
- `apps/web/docs/help/en/team-runs.md`
- `apps/web/docs/help/th/team-runs.md`
- `apps/web/docs/help/en/scoped-memory.md`
- `apps/web/docs/help/th/scoped-memory.md`
- `apps/web/docs/help/en/run-monitoring.md`
- `apps/web/docs/help/th/run-monitoring.md`
- `apps/web/docs/help/en/live-updates.md` (SSE Streaming)
- `apps/web/docs/help/th/live-updates.md`
- `apps/web/docs/help/en/agent-communication.md`
- `apps/web/docs/help/th/agent-communication.md`
- `apps/web/docs/help/en/automation-handoffs.md`
- `apps/web/docs/help/th/automation-handoffs.md`

**Update (1 file):**
- `apps/web/docs/help/_manifest.json` — Add new sections if needed (optional; can use existing `advanced`)

**No code changes required** — help service already supports dynamic topics.

---

## Testing Strategy

After creating all 16 files:

1. **Manual test via /help:**
   - Navigate to `/help`
   - Search for each topic slug (e.g., "team-management")
   - Verify HTML renders correctly
   - Verify Thai locale switch works

2. **Contextual help test:**
   - Go to `/teams` and click help button (if integrated)
   - Verify `pages: ["/teams"]` topic appears

3. **Search index test:**
   - Query `/help` with keywords (e.g., "team create")
   - Verify tags and description appear in results

4. **LLM injection test:**
   - Trigger help-assistant skill
   - Ask "how do I create a team?"
   - Verify help context is injected and skill uses it

---

## Effort Estimate

| Task | Hours | Owner |
|------|-------|-------|
| Write 8 English topics (500–600 words each) | 12–16 | Dev |
| Thai translation (professional) | 40–50 | Thai translator |
| Update _manifest.json | 0.5 | Dev |
| Testing (manual + LLM injection) | 2–3 | QA |
| Revisions based on feedback | 4–6 | Dev + Thai translator |
| **Total** | **58.5–75.5** | — |

**Thai translation is the blocker.** English topics can be drafted in parallel while translator works on Thai.

---

## References

- **Help System Service:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/helpContentService.ts`
- **Help Router:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/help.ts`
- **Manifest:** `/home/dev/projects/SmartSpecPro/apps/web/docs/help/_manifest.json`
- **Example Topic:** `/home/dev/projects/SmartSpecPro/apps/web/docs/help/en/agencies.md`
- **Skills (help-assistant, help-content-writer):**
  - `/home/dev/projects/SmartSpecPro/apps/web/skills/help-assistant/skill.md`
  - `/home/dev/projects/SmartSpecPro/apps/web/skills/help-content-writer/skill.md`
- **Orchestrator Spec:** `/home/dev/projects/SmartSpecPro/planning/virtual-ai-office-orchestrator/spec.md`
- **Teams Page:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Teams.tsx`
- **Help Page:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Help.tsx`
