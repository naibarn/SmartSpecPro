---
name: Help System Quick Reference
description: Fast lookup for help system architecture, new topic creation, and troubleshooting
type: reference
---

# Help System — Quick Reference Guide

## At a Glance

| Component | Details |
|-----------|---------|
| **Type** | File-based Markdown with i18n |
| **Locales** | English (en) + Thai (th) |
| **Total Topics** | 31 (documented for 28+ pages, gaps exist for 8 new features) |
| **Cache TTL** | 5 minutes |
| **Serve Method** | tRPC endpoints + contextual injection |
| **Auto-Discovery** | Yes — topics auto-sync from files |

---

## File Structure

```
apps/web/docs/help/
├── _manifest.json                 # Section definitions (5 sections)
├── en/                            # English topics (31 .md files)
│   ├── chat.md
│   ├── memory.md
│   ├── admin-users.md
│   └── ...
└── th/                            # Thai topics (31 .md files, paired with en/)
    ├── chat.md
    ├── memory.md
    ├── admin-users.md
    └── ...
```

---

## Creating a New Help Topic (Checklist)

### Step 1: Create English topic file

**File**: `apps/web/docs/help/en/{topic-slug}.md`

```markdown
---
title: Your Topic Title
description: One-line description (100 chars max)
icon: lucide-icon-name
section: features  # or: getting-started, content-creation, advanced, admin
order: 10
pages: ["/path1", "/path2"]
tags: [tag1, tag2, tag3]
---

# Your Topic Title

Content here in markdown format.

## Subsection

More content...
```

**Field reference:**
- `title` — Display name (shown in help hub)
- `description` — Subtitle (shown in list)
- `icon` — Lucide icon name (no default, required)
- `section` — Must match a section ID from _manifest.json
- `order` — Sort within section (lower = higher priority)
- `pages` — Which routes trigger contextual help for this topic (e.g., `/chat`, `/admin/users`)
- `tags` — Keywords for search (comma-separated)

### Step 2: Create Thai translation

**File**: `apps/web/docs/help/th/{topic-slug}.md`

Same structure as English, but translate:
- YAML fields (title, description, tags)
- Markdown body
- Keep `icon`, `section`, `order`, `pages` identical to English

### Step 3: Update manifest (optional)

Only if creating a **new section**. Otherwise, auto-discovered.

**File**: `apps/web/docs/help/_manifest.json`

```json
{
  "sections": [
    {
      "id": "your-new-section",
      "label": { "en": "English Label", "th": "Thai Label" },
      "order": 6
    }
  ]
}
```

### Step 4: Verify and test

```bash
cd apps/web
npm run build         # Compiles tRPC router + frontend
curl http://localhost:3000/trpc/help.getManifest?locale=en
# Should see your new topic in the manifest
```

### Step 5: Add to sidebar help dialogs (optional)

If you want a "Help" button inside a specific page:

**File**: `apps/web/client/src/components/{feature}/YourFeatureHelpDialog.tsx`

```typescript
import { HelpDialog } from "@/components/help/HelpDialog";

export function YourFeatureHelpDialog() {
  return (
    <HelpDialog
      slug="your-topic-slug"
      title="Learn about Your Feature"
      trigger={<HelpCircle />}
    />
  );
}
```

---

## Topic Frontmatter — Detailed Field Guide

### `pages: [...]` — THE CRITICAL FIELD

This is how **contextual help** works. When a user visits `/chat`, the app calls:

```typescript
getContextualTopics("/chat", "en")
// Returns all topics where pages includes "/chat"
```

**Best practices:**
- List ALL pages where this topic is relevant
- Be specific: `/chat` not just `/`
- Include sub-routes: if help covers both `/media-studio` and `/media-history`, list both
- One topic per conceptual area (don't duplicate)

### `section` — Valid values

```
"getting-started"      # Onboarding, intro, first steps
"features"            # Core platform features (chat, media, video, etc.)
"content-creation"    # Advanced creation (agencies, workflows, groups, automation)
"advanced"            # Power-user topics (API keys, credits, feedback)
"admin"               # Administration (users, providers, settings, etc.)
```

Invalid section = topic still loads, but won't appear in organized sections.

### `icon` — Lucide icon names

Use from [lucide.dev](https://lucide.dev). Common examples:
- `MessageSquare`, `Sparkles`, `BookOpen`, `Settings`, `Users`, `Brain`, `Zap`, `Shield`

### `tags` — For search

```yaml
tags: [chat, conversation, ai, llm, assistant]
```

Lowercase, comma-separated. Helps users find topics via the help hub search bar.

---

## Testing a New Topic

### Check if manifest picks it up
```bash
curl http://localhost:3000/trpc/help.getManifest?locale=en | jq '.topics[] | select(.slug == "your-topic-slug")'
```

### Fetch the full topic
```bash
curl "http://localhost:3000/trpc/help.getTopic?slug=your-topic-slug&locale=en" | jq .
```

### Test contextual help
```bash
curl "http://localhost:3000/trpc/help.getContextualTopics?page=/your-route&locale=en" | jq .
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Topic not showing in help hub | Not in manifest, wrong section, or cache expired | Wait 5 min, restart dev server, check YAML syntax |
| Topic appears but no icon | Icon name is wrong or doesn't exist in lucide | Check `lucide.dev`, fix `icon` field |
| Help doesn't show on my page | Pages field doesn't include that route | Add route to `pages: [...]` |
| Thai translation missing | Thai .md file doesn't exist | Create `th/{slug}.md` with same structure |
| Contextual help returns empty | No topics have this page in their `pages` array | Add the page to at least one topic's pages field |
| YAML parse error | Malformed frontmatter (unquoted colons, bad spacing) | Check YAML syntax with online validator |

---

## Code Locations

### Backend
- Service: `apps/web/server/services/helpContentService.ts`
- Router: `apps/web/server/routers/help.ts`
- Context injector: `apps/web/server/services/helpContextInjector.ts`

### Frontend
- Help hub: `apps/web/client/src/pages/Help.tsx`
- Topic viewer: `apps/web/client/src/pages/HelpTopic.tsx`
- Chat help dialog: `apps/web/client/src/components/chat/ChatHelpDialog.tsx`
- Generic help dialog: `apps/web/client/src/components/help/HelpDialog.tsx` (if exists)

### Database
- Audit log (if help interactions are tracked): Check `apps/web/server/services/auditLogger.ts`

---

## Missing Help Topics (Priority List)

### Must Have (User-Facing Features)
1. `team-management.md` — `/teams`, `/teams/:teamId`
2. `team-rooms.md` — Shared work spaces
3. `team-runs.md` — Run history & monitoring
4. `scoped-memory.md` — Team-level memory
5. `run-monitoring.md` — Pipeline execution dashboard
6. `automation-handoffs.md` — Task passing between workflows

### Should Have (Admin Features)
7. `admin-llm-models.md` — `/admin/llm-models`
8. `admin-media-models.md` — `/admin/media-models`
9. `admin-media-providers.md` — `/admin/media-providers`
10. `admin-channel-router.md` — `/admin/channel-router`

### Nice to Have (Sub-Routes)
11. Help for `/presentation-editor/:docId`
12. Help for `/agencies/:id/edit`
13. Help for `/automation/live/:sessionId`

---

## New Topic Template (Copy & Paste)

**English** (`en/new-topic.md`):
```markdown
---
title: Your Feature Name
description: Short description of what users will learn here
icon: Sparkles
section: features
order: 50
pages: ["/route1", "/route2"]
tags: [tag1, tag2, feature-name]
---

# Your Feature Name

## Overview

Explain what this feature does and why users need it.

## Getting Started

Step-by-step guide to using the feature.

### Step 1: Do this first

Instructions...

### Step 2: Then do this

Instructions...

## Common Tasks

### How to [task 1]

Explanation with examples.

### How to [task 2]

Explanation with examples.

## Tips & Tricks

- Tip 1
- Tip 2

## Troubleshooting

**Q: Something doesn't work?**
A: Here's the solution...
```

**Thai** (`th/new-topic.md`):
```markdown
---
title: ชื่อฟีเจอร์ของคุณ
description: คำอธิบายสั้นๆ ว่าผู้ใช้จะเรียนรู้อะไรที่นี่
icon: Sparkles
section: features
order: 50
pages: ["/route1", "/route2"]
tags: [tag1, tag2, feature-name]
---

# ชื่อฟีเจอร์ของคุณ

## ภาพรวม

อธิบายว่าฟีเจอร์นี้ทำอะไร และทำไมผู้ใช้จึงต้องใช้มัน

## เริ่มต้นใช้งาน

คำแนะนำทีละขั้นตอน

### ขั้นตอนที่ 1: ทำสิ่งนี้ก่อน

คำแนะนำ...

### ขั้นตอนที่ 2: จากนั้นทำสิ่งนี้

คำแนะนำ...

## งานทั่วไป

### วิธี [งาน 1]

คำอธิบายพร้อมตัวอย่าง

### วิธี [งาน 2]

คำอธิบายพร้อมตัวอย่าง

## เคล็ดลับและเทคนิค

- เคล็ดลับ 1
- เคล็ดลับ 2

## การแก้ไขปัญหา

**คำถาม: บางสิ่งไม่ทำงาน?**
คำตอบ: นี่คือวิธีแก้ไข...
```

---

## Admin APIs (if you need to manually update topics)

Help system is read-only from frontend. To add/edit topics:
1. Edit `.md` files directly
2. Restart dev server or wait for cache to expire (5 min)
3. No database updates needed (file-based only)

---

## Performance Notes

- Cache is **per-locale**, not global
- Each `.md` file is read on-demand, then cached
- Markdown → HTML conversion happens once, cached
- Search index is built once per 5-min interval, cached
- No database queries (all file I/O)

---

## i18n Integration (i18n Translations)

The help system uses **file-based frontmatter** for metadata translation (title, description, tags).

Separate from this is the **UI translation** for help dialogs, buttons, etc., which is in:
- `apps/web/client/src/lib/i18n/` (assumed location)
- 300+ keys for ChatHelpDialog, etc.

If you add a new help dialog, you may need to add i18n keys like:
- `helpDialog.{topicSlug}.title`
- `helpDialog.{topicSlug}.description`

Check existing `ChatHelpDialog.tsx` for pattern.

