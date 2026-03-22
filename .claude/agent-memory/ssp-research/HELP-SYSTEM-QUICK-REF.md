---
name: Help System Quick Reference
description: Fast lookup guide for help system architecture, endpoints, and new topic creation
type: reference
---

# Help System Quick Reference

## Architecture at a Glance

| Component | Location | Purpose |
|-----------|----------|---------|
| **Help Router** | `server/routers/help.ts` | tRPC endpoints for manifest, topics, search, contextual help |
| **Help Service** | `server/services/helpContentService.ts` | Markdown → HTML parser, caching, search indexing |
| **Help Injector** | `server/services/helpContextInjector.ts` | Keyword matching, topic scoring for LLM prompt injection |
| **Markdown docs** | `docs/help/{en,th}/*.md` | Topic content with YAML frontmatter |
| **ChatHelpDialog** | `client/src/components/chat/ChatHelpDialog.tsx` | UI component (hardcoded i18n translations) |
| **i18n** | `client/src/lib/i18n/locales/{en,th}.ts` | Translation keys for UI (300+ keys) |
| **Manifest** | `docs/help/_manifest.json` | Section definitions (5 sections) |

---

## tRPC Endpoints

### `help.getManifest(locale: "en" | "th")`
Returns section definitions + topic index (no HTML).
```typescript
{
  sections: [
    { id: "features", label: { en: "Features", th: "ฟีเจอร์" }, order: 2 },
    ...
  ],
  topics: [
    { slug: "chat", title: "Chat Guide", description: "...", icon: "MessageSquare", section: "features", order: 10, pages: ["/chat"] },
    ...
  ]
}
```

### `help.getTopic(slug: string, locale: "en" | "th")`
Returns full topic with HTML.
```typescript
{
  slug: "chat",
  title: "Chat Guide",
  description: "How to use the AI chat interface",
  icon: "MessageSquare",
  section: "features",
  order: 10,
  pages: ["/chat"],
  tags: ["chat", "conversation"],
  html: "<h1>Chat Guide</h1><h2>What Chat is best for...</h2>...",
  excerpt: "Chat is the fastest place to ask for answers, drafts..."
}
```

### `help.getSearchIndex(locale: "en" | "th")`
Returns searchable index (slug, title, description, excerpt, tags) for all topics.

### `help.getContextualTopics(page: "/chat" | "/team", locale: "en" | "th")`
Returns topics where `pages` field includes the given page.

### `help.captureScreenshot(url, featureName, step, width, height)` [Admin-only]
Calls Python backend to capture page screenshot for documentation.

---

## Markdown File Format

**Location:** `docs/help/{locale}/{slug}.md`

**Example:** `docs/help/en/chat.md`

```markdown
---
slug: chat
title: Chat Guide
description: How to use the AI chat interface
icon: MessageSquare              # Lucide icon name
section: features               # Must match _manifest.json id
order: 10                       # Display order
pages: ["/chat"]                # Which pages show this topic
tags: [chat, conversation, model, brainstorm]  # Keyword matching
---

# Chat Guide

## What Chat is best for

[Content...]

## Chat basics

1. Point one
2. Point two
```

**Constraints:**
- Slug must be unique and match filename (lowercase, hyphenated)
- Icon must be valid Lucide icon name
- Section must exist in `_manifest.json`
- Must have both English and Thai versions

---

## Creating a New Help Topic (Checklist)

### Step 1: Create English file
```bash
# docs/help/en/{slug}.md
touch docs/help/en/team-rooms.md
```

Add content with frontmatter:
```yaml
---
slug: team-rooms
title: Team Rooms — Multi-Agent Collaboration
description: Real-time collaboration with multi-agent teams in shared rooms
icon: Users
section: advanced
order: 71
pages: ["/team", "/team/room"]
tags: [team, collaboration, multi-agent, room]
---
```

### Step 2: Create Thai file
```bash
# docs/help/th/{slug}.md
touch docs/help/th/team-rooms.md
```

**Important:** Use same slug, translate title/description to Thai.

### Step 3: Update manifest (if needed)
Check if `_manifest.json` needs new section:
```json
{
  "sections": [
    { "id": "advanced", "label": { "en": "Advanced", "th": "ขั้นสูง" }, "order": 4 }
  ]
}
```

If "advanced" exists, no update needed. Topics auto-discovered by filename.

### Step 4: Test
```typescript
// In Node REPL or test
const topic = await help.getTopic("team-rooms", "en");
console.log(topic.html);  // Verify HTML renders

const index = await help.getSearchIndex("th");
console.log(index.find(t => t.slug === "team-rooms"));  // Verify indexed
```

### Step 5: Add contextual help (optional)
If you want help injected into LLM prompt for this feature, verify topic tags match keywords in `helpContextInjector.ts`:
```typescript
const thaiPatterns = [
  // Add your keywords
  "ห้องทีม", "team room", "collaboration",
];
```

---

## File Locations Quick Map

```
apps/web/
├── docs/help/
│   ├── _manifest.json                    # Section definitions
│   ├── en/
│   │   ├── chat.md
│   │   ├── agencies.md
│   │   ├── team-rooms.md                 # NEW TOPIC HERE
│   │   └── ...
│   └── th/
│       ├── chat.md
│       ├── agencies.md
│       ├── team-rooms.md                 # NEW TOPIC (Thai) HERE
│       └── ...
├── server/
│   ├── routers/help.ts                   # Endpoints
│   ├── services/
│   │   ├── helpContentService.ts         # Parser
│   │   └── helpContextInjector.ts        # Keyword matching
├── client/src/
│   ├── components/chat/ChatHelpDialog.tsx  # UI (only if adding i18n)
│   └── lib/i18n/locales/
│       ├── en.ts                         # i18n (only if Option B)
│       └── th.ts                         # i18n Thai (only if Option B)
```

---

## Sections Reference

| ID | Label (EN) | Label (TH) | Order | Topics |
|----|-----------|-----------|-------|--------|
| `getting-started` | Getting Started | เริ่มต้นใช้งาน | 1 | getting-started |
| `features` | Features | ฟีเจอร์ | 2 | chat, skills, media, presentations, memory, browser-session, document-management, gallery, groups, video-editor |
| `content-creation` | Content Creation | สร้างคอนเทนต์ | 3 | agency-builder, workflows, automation, api-keys |
| `advanced` | Advanced | ขั้นสูง | 4 | agencies, personas, webhooks, marketplace, usage-analytics, domain-admin, admin-advanced, **[NEW TEAM TOPICS GO HERE]** |
| `admin` | Administration | การจัดการ | 5 | admin-users, admin-queues, admin-audit, admin-skills, admin-providers, admin-settings, credits, feedback, settings |

---

## Cache Behavior

- **TTL:** 5 minutes
- **Cache keys:** `locale:slug` (e.g., `en:chat`)
- **Cache cleared:** Auto-expires after 5 min OR when file modified (on server restart)
- **Implication:** After editing `docs/help/en/chat.md`, restart server or wait 5 min to see changes

**For development:** Restart server after editing Markdown:
```bash
npm run dev  # or systemctl restart smartspec-web.service
```

---

## i18n Translation Keys (ChatHelpDialog only)

**Use only if Option B (Hybrid) chosen.**

Each feature section in ChatHelpDialog needs keys like:
```typescript
// Format: help.{featureName}.{part}.{index}
"help.skills.title": "Skills and slash commands",
"help.skills.1": "Type / in the message box...",
"help.skills.2": "Open the Skills panel...",
"help.skills.3": "Use skills when you want...",
"help.skills.4": "If the task is repetitive...",
```

**Current sections:** chatBestFor, chatBasics, skills, media, presentation, skillDetection, memory, browser, agencies, useCases

**New sections (if Option B):** teamManagement, teamRooms, teamRuns, runMonitoring, liveUpdates, agentComm, handoffs

**Thai translation pattern:**
```typescript
// locales/th.ts
"help.teamRooms.title": "ห้องทีม",
"help.teamRooms.1": "ส่วนหนึ่งของการทำงานทีม...",
```

---

## Common Keywords for helpContextInjector

**English patterns matched:**
- `chat, skill, skills, media, image, video, audio, presentation, slides, browser, memory, agency, agencies, workflow, group, document, library, gallery, settings, admin, provider, user, queue, audit, credits, api key, billing, usage, cost, task, monitor, automation, webhook, approval, tenant`

**Thai patterns matched:**
- `แชท, สกิล, มีเดีย, วิดีโอ, presentation, browser, memory, เอเจนซี่, เวิร์กโฟลว์, กลุ่ม, เอกสาร, ตั้งค่า, admin, ผู้ใช้, คิว, เครดิต, งบ, ตรวจสอบ, ตลาด, ติดตั้ง, เทมเพลต`

**To add new keywords** (if topic should auto-inject into LLM prompts):

Edit `helpContextInjector.ts`:
```typescript
const thaiPatterns = [
  // Existing...
  // NEW: Add for team features
  "ห้องทีม", "team room", "ทีม", "team run", "team memory",
];
```

---

## Testing Help Topics

### Command-line test (Node REPL):
```typescript
import { getHelpTopic, getHelpSearchIndex, getHelpManifest } from "../services/helpContentService.js";

// Test English topic
const topic = await getHelpTopic("chat", "en");
console.log(topic.title);  // "Chat Guide"
console.log(topic.html.length > 0);  // true

// Test Thai topic
const topicTh = await getHelpTopic("chat", "th");
console.log(topicTh.title);  // "คู่มือ Chat"

// Test search index
const index = await getHelpSearchIndex("en");
console.log(index.length);  // 28
console.log(index.find(t => t.slug === "chat"));
```

### Browser test:
```typescript
// In chat help dialog or via tRPC client
import { trpc } from "@/lib/trpc";

const manifest = await trpc.help.getManifest.query({ locale: "en" });
const topic = await trpc.help.getTopic.query({ slug: "chat", locale: "en" });
const contextual = await trpc.help.getContextualTopics.query({ page: "/chat", locale: "en" });
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Topic not appearing in manifest | Check `_manifest.json` has section, check slug matches filename |
| HTML rendering as broken | Check YAML frontmatter syntax, verify `---` markers |
| Thai topic returns undefined | Verify `docs/help/th/{slug}.md` exists and has same slug in frontmatter |
| Cache not updating | Restart server (`systemctl restart smartspec-web.service`) |
| Contextual help not injecting | Check `pages: ["/your/page"]` in frontmatter, check keywords in helpContextInjector.ts |
| ChatHelpDialog missing section | Create i18n keys in locales/{en,th}.ts, add section to component |

---

## References

- **Full audit:** `HELP-SYSTEM-AUDIT.md`
- **Service code:** `helpContentService.ts` (parsing, caching)
- **Router code:** `help.ts` (endpoints)
- **Injector code:** `helpContextInjector.ts` (LLM injection)
- **Example topics:** `docs/help/en/{chat,agencies,memory}.md`
