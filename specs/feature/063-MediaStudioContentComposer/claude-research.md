# Research: Media Studio Content Composer (Feature 063)

---

## 1. Existing Codebase Architecture

### 1.1 MediaStudio.tsx — Current Structure

**Location:** `apps/web/client/src/pages/MediaStudio.tsx` (~5,614 lines)

The current MediaStudio uses a **per-tab state isolation pattern**:

```typescript
interface TabState {
  prompt: string;
  enhancedPrompt: string;
  referenceImages: ReferenceImage[];
  selectedSkillId: string;
  useAdvancedMode: boolean;
  dynamicFormValues: Record<string, any>;
  selectedStyleCategory: string;
  selectedStyle: string;
  // 10+ more tab-specific fields
}

const [tabStates, setTabStates] = useState<Record<string, TabState>>({
  image: createDefaultTabState("image"),
  video: createDefaultTabState("video"),
  audio: createDefaultTabState("audio"),
});
```

Each tab (image/video/audio) maintains its own state; `currentTab` determines which is rendered. The "article composer" track will be a **fourth top-level track** in this same architecture, not a tab within the existing media generation flow.

**Key existing imports in MediaStudio:**
```typescript
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import DynamicSkillForm from "@/components/media/DynamicSkillForm";
import { LibraryFilePicker } from "@/components/library/LibraryFilePicker";
import { isMediaStudioSkillCompatible, sortMediaStudioSkillsForTab } from "@/lib/mediaStudioSkillMatching";
```

**Generation task tracking** uses a `GenerationTask` interface with progressive status updates.

**Library integration** already exists: `isMediaTaskEligibleForLibraryAdd()` determines when the "add to library" button is shown. Generated items can already be promoted to the library.

### 1.2 SocialPublishing.tsx — Social Integration Patterns

**Location:** `apps/web/client/src/pages/SocialPublishing.tsx`

Key state structure for the content composer to reference:
```typescript
const [selectedPageId, setSelectedPageId] = useState<number | undefined>();
const [publishGateway, setPublishGateway] = useState<"native" | "upload_post">("native");
const [contentText, setContentText] = useState("");
const [mediaRefsText, setMediaRefsText] = useState(""); // newline/comma separated
```

**Platform distinction:** `selectedPage?.provider` determines which media format is required:
- `"meta"` → media refs not required
- Others (youtube, tiktok, upload_post) → `requiresMediaRefs = true`

**tRPC hooks pattern:**
```typescript
const pagesQuery = trpc.socialPublishing.listPages.useQuery();
// Returns SocialPublishingPageOption[] with publishingReady + publishingIssueCode
```

### 1.3 Upload-Post Gateway

**Location:** `apps/web/server/routers/uploadPost.ts`

Available procedures:
- `getConnection()` — status, profiles, jobs, queue settings
- `connect()` — API key + consent disclosure
- `createProfile()`, `deleteProfile()` — per-platform profile management
- `publishUploadPostNow()`, `scheduleUploadPostJob()` — queue management
- Rate limits: 20/hr management, 30/hr publish

**Upload-Post platforms:**
```typescript
export const UPLOAD_POST_PLATFORMS = [
  "facebook", "instagram", "threads", "tiktok", "youtube",
  "linkedin", "x", "pinterest", "other",
] as const;
```

**Connection state:** `UploadPostConnectionStatus = "pending" | "active" | "disconnected" | "error"`

### 1.4 Agency Components

**AgencyPickerModal.tsx** (`apps/web/client/src/components/agency/AgencyPickerModal.tsx`):
```typescript
const { data: agencyData } = trpc.agency.list.useQuery(
  { limit: 100, offset: 0 },
  { enabled: open }
);
// Searchable list of agencies with name + description
```

**ModelPicker.tsx** — Groups providers in a popover, supports `hideAuto`, compact mode.

**ToolPicker.tsx** — Two-step flow: select tool type → configure parameters. Risk levels: low/medium/high.

### 1.5 Library Components

**LibraryFilePicker** — Browse and select files from the library; already used in MediaStudio.

**DocumentPreviewPanel** — Lazy-loaded preview for PDFs, images, video, markdown. Supports editing (Tiptap via UnifiedDocumentSurface), file replacement, version history.

Key `libraryItems` table fields relevant to media attachment:
```sql
id: serial PK
tenantId: varchar(36)
userId: integer
name: varchar(500)
itemType: varchar(50)  -- "file", "folder", etc.
contentType: varchar(100)  -- "image/jpeg", "video/mp4", etc.
sourceUrl: varchar(2048)   -- stable URL for published references
status: enum(processing, available, error, archived)
visibility: enum(private, shared, public)
```

### 1.6 Blog Router

**Location:** `apps/web/server/routers/blog.ts`

Uses Express routes (not tRPC):
- `GET /api/blog/posts` — public listing
- `GET /api/blog/posts/:slug` — public by slug
- `POST /api/blog/posts` — admin create (role check)
- `PUT /api/blog/posts/:id` — admin update
- `DELETE /api/blog/posts/:id` — admin delete

**Critical pattern:** Uses `sanitizeHtml()` + `sanitizeBrandingDeep()` server-side before storing.

`blogPosts` table:
```sql
id, tenantId, slug, title, excerpt, content (text/HTML), coverImage (varchar 1024),
author, authorAvatar, category, tags (json), readTime, isPublished, isFeatured,
metaDescription, metaKeywords, publishedAt, createdAt, updatedAt
```

**Gap identified:** `coverImage` is a single varchar — no multi-image array. The new composer will need to handle this. For Phase 1, use `coverImage` for the first attached media, store additional refs in `content` or add a new column.

### 1.7 Role-Based Access Patterns

**Roles:** `user` → `admin` → `domain_admin` → `system_agent`

**Existing pattern (server-side):**
```typescript
// Feature flag check in middleware
const enabled = await getTenantFeatureFlag("FEATURE_NAME", tenantId);
if (!enabled) throw new TRPCError({ code: "FORBIDDEN" });

// Admin-only guard
if (!user || (user.role !== "domain_admin" && user.role !== "admin")) {
  return res.status(403).json({ error: "Unauthorized" });
}
```

**Client-side pattern:**
```typescript
const { user } = useAuth();
const isAdmin = user?.role === "admin" || user?.role === "domain_admin";
// Conditionally render Docs + Blog options based on isAdmin
```

### 1.8 Social Publishing Schema

```typescript
// socialPages — connected pages/channels/accounts
{
  id, tenantId, connectionId, providerPageId, pageName,
  status: "active" | "inactive" | "error",
  selectedForPublishing: boolean,
  publishingReady: boolean,
  publishingIssueCode: "missing_page_access" | "expired_page_access" | ...
}

// socialPosts — publish jobs
{
  id, tenantId, pageId, status: "draft" | "scheduled" | "published" | "failed",
  contentText, contentLink, mediaRefs: json (string[] URLs),
  scheduledAt, publishedAt, errorMessage
}
```

### 1.9 Testing Patterns

**tRPC router tests:**
```typescript
// Use vi.hoisted() for mock factories at the top
const mocks = vi.hoisted(() => ({ mockService: vi.fn() }));

// Create caller with typed user context
function createCaller(user = { id: 42, role: "user", currentTenantId: "tenant-1" }) {
  return router.createCaller({ user, tenantId: "tenant-1", ... });
}
```

**React component tests:**
```typescript
// @vitest-environment jsdom
// Mock trpc fully: { trpc: { router: { procedure: { useQuery/useMutation: vi.fn() } } } }
// Mock sonner toast
// Use @testing-library/user-event for interactions
```

**Key test coverage areas for this feature:**
- Role-based destination visibility (admin sees Docs/Blog, user sees only Social)
- Media attachment count limits (1-6)
- Stable reference validation (no temp URLs)
- Social platform → account filtering
- Skill vs agency selection switching

---

## 2. HTML Sanitization Best Practices

### Recommendation: DOMPurify with Profile-Based Config

DOMPurify (32M weekly npm downloads, maintained by cure53 security team) is the definitive standard.

**Implementation pattern:**
```typescript
// Centralized profiles — never configure inline ad-hoc
const SANITIZE_PROFILES = {
  article: {
    ALLOWED_TAGS: ['h1','h2','h3','h4','p','ul','ol','li','blockquote',
                   'pre','code','a','b','i','em','strong','br','img'],
    ALLOWED_ATTR: ['href', 'title', 'alt', 'src'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input'],
    FORBID_ATTR: ['onerror','onload','onclick','onmouseover','style'],
  },
  social: {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href'],
  },
};

// URL scheme hardening hook (critical for LLM output)
DOMPurify.addHook('beforeSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') ?? '';
    if (!/^https?:\/\/|^mailto:|^tel:/.test(href)) {
      node.removeAttribute('href'); // strips javascript:, data:, vbscript:
    }
  }
});

// Safe render component
function SafeHtml({ html, profile = 'article' }: { html: string; profile?: keyof typeof SANITIZE_PROFILES }) {
  const clean = useMemo(() => DOMPurify.sanitize(html, SANITIZE_PROFILES[profile]), [html, profile]);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

**Defense-in-depth stack:**
1. Zod schema validation (max length, structure)
2. DOMPurify (allowlist, URL scheme stripping)
3. `<SafeHtml>` component — single rendering path
4. CSP: `script-src 'none'` on preview pages

**Critical rule:** Sanitize server-side (in the tRPC mutation or Express route) before storing to the DB. Client-side sanitization for preview; server-side sanitization before persistence.

**Existing pattern to reuse:** The codebase already calls `sanitizeHtml()` in `blog.ts` before storing. The article composer should follow the same pattern.

---

## 3. Multi-Step Composer UX

### 5-Step Wizard Pattern

```
Step 1: Topic & Settings  → topic, skill/agency selector, web search, thinking
Step 2: Generated Content → HTML preview, regenerate, edit
Step 3: Media Attachment  → 1-6 library assets; promote to library if needed
Step 4: Destination       → Docs | Blog | Social post (role-filtered); platform + account for social
Step 5: Review & Confirm  → full summary; "Publish Now" CTA (not "Submit")
```

The **Review step is mandatory** and is the primary safeguard against accidental publish.

**State management pattern:**
- Zustand store for cross-step state (topic, generatedContent, attachments, destination)
- React Hook Form per-step for validation
- Autosave draft via debounced tRPC mutation (~2s idle)
- Navigation guard (`useBlocker`) to prevent accidental abandonment

**Key UX rules:**
- Show all 5 steps in the stepper header (users need to know full scope upfront)
- "Next" label on steps 1-4; specific action label ("Publish Now" / "Save Draft") on step 5
- Allow clicking back to completed steps without data loss
- Display "Draft saved" indicator

### Confirmation Pattern

DO NOT use generic "Are you sure?" dialogs. Use:
```
Title:   "Publish to [N] destinations?"
Body:    "This will post to [specific destinations listed]."
Buttons: [Keep editing] on left, [Publish now →] on right
```

---

## 4. Platform-First Social Publish Flow

### Industry-Standard Pattern (Buffer, Hootsuite, Sprout Social)

```
1. Select Platform(s)  ← icon pills: YouTube | Facebook | TikTok | Upload-Post
2. Select Account(s)   ← filtered to only accounts for chosen platform(s)
3. Compose (global)    ← content body, media
4. Review per network  ← one tab per selected platform, pre-filled from global
5. Schedule / Publish  ← confirm with destination summary
```

**Key filtering rule:** Once platform is selected, the account picker shows ONLY accounts connected for that platform. A user with 3 Facebook pages + 2 YouTube channels sees either Facebook or YouTube pages — not all 5.

**Account picker display:**
- Group by platform with platform icon header
- Show account avatar + name + handle
- Show `publishingReady` status badge
- Explain `publishingIssueCode` inline if not ready

**Existing data to leverage:**
- `trpc.socialPublishing.listPages.useQuery()` returns `SocialPublishingPageOption[]` with `provider` field — filter by this
- `publishingReady` + `publishingIssueCode` already in the data shape
- For Upload-Post: `trpc.uploadPost.getConnection.useQuery()` returns profiles grouped by platform

### Platform → Account Mapping

```typescript
// Available platforms for the social route selector
type ContentComposerPlatform = "youtube" | "facebook" | "tiktok" | "upload_post";

// Filter the page list by selected platform
const filteredPages = allPages.filter(p => p.provider === selectedPlatform);
```

---

## 5. New tRPC Procedures Needed

Based on the codebase analysis, the following new tRPC procedures are required:

### contentComposer router (new)

```typescript
// Generate article (calls LLM via skill or agency)
generateArticle: protectedProcedure
  .input(z.object({
    topic: z.string().min(1).max(2000),
    executionSource: z.enum(["skill", "agency"]),
    skillId: z.string().optional(),
    agencyId: z.string().optional(),
    requiresWebSearch: z.boolean().default(false),
    requiresThinking: z.boolean().default(false),
  }))
  .mutation(...)

// Save/update draft composition
saveDraft: protectedProcedure
  .input(z.object({
    id: z.string().optional(), // omit for new draft
    topic: z.string(),
    executionSource: z.enum(["skill", "agency"]),
    skillId: z.string().optional(),
    agencyId: z.string().optional(),
    articleBody: z.string().optional(),
    attachmentIds: z.array(z.number()).max(6).default([]),
    destinationKind: z.enum(["docs", "blog", "social"]).optional(),
    socialPlatform: z.enum(["youtube", "facebook", "tiktok", "upload_post"]).optional(),
    socialTargetId: z.number().optional(),
    requiresWebSearch: z.boolean().default(false),
    requiresThinking: z.boolean().default(false),
  }))
  .mutation(...)

// Publish to destination
publish: protectedProcedure
  .input(z.object({
    draftId: z.string(),
  }))
  .mutation(...)
```

### Reuse existing procedures
- `trpc.agency.list` — for agency picker
- `trpc.socialPublishing.listPages` — for social page selection
- `trpc.uploadPost.getConnection` — for Upload-Post profiles
- Blog: existing Express routes `POST /api/blog/posts`
- Docs: existing `tenant.ts` page routes

---

## 6. Database Changes Needed

### New Table: `contentComposerDrafts`

```typescript
export const contentComposerDrafts = pgTable("content_composer_drafts", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: varchar("tenantId", { length: 36 }).notNull(),
  userId: integer("userId").notNull().references(() => users.id),
  topic: text("topic").notNull(),
  executionSource: varchar("executionSource", { length: 20 }).notNull(), // "skill" | "agency"
  skillId: varchar("skillId", { length: 255 }),
  agencyId: varchar("agencyId", { length: 255 }),
  articleBody: text("articleBody"),    // sanitized HTML
  articleBodyRaw: text("articleBodyRaw"), // LLM output before sanitization (for debugging)
  attachmentIds: json("attachmentIds").$type<number[]>().default([]),
  destinationKind: varchar("destinationKind", { length: 20 }), // "docs" | "blog" | "social"
  socialPlatform: varchar("socialPlatform", { length: 50 }),
  socialTargetId: integer("socialTargetId"),
  requiresWebSearch: boolean("requiresWebSearch").default(false),
  requiresThinking: boolean("requiresThinking").default(false),
  status: varchar("status", { length: 30 }).default("draft"), // "draft" | "published" | "failed"
  publishedAt: timestamp("publishedAt", { withTimezone: true }),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
});
```

**Indexes:** `(tenantId, userId)`, `(tenantId, status)`, `(updatedAt DESC)` for draft list

### blogPosts — No schema change for Phase 1
Use existing `coverImage` for first attachment. Additional media refs can be embedded in `content` HTML body. A future migration can add `mediaAttachments json` if needed.

---

## 7. Component Architecture Plan

### New Components to Create

| Component | Location | Purpose |
|---|---|---|
| `ContentComposerPanel` | `client/src/components/media/ContentComposerPanel.tsx` | Top-level panel, owns wizard state |
| `ArticleComposerStep` | `client/src/components/media/composer/ArticleComposerStep.tsx` | Step 1+2: topic, settings, generation, preview |
| `MediaAttachmentStep` | `client/src/components/media/composer/MediaAttachmentStep.tsx` | Step 3: library picker, max 6 |
| `DestinationStep` | `client/src/components/media/composer/DestinationStep.tsx` | Step 4: routing + role filter |
| `ComposerReviewStep` | `client/src/components/media/composer/ComposerReviewStep.tsx` | Step 5: summary + publish |
| `SafeHtml` | `client/src/components/ui/SafeHtml.tsx` | DOMPurify wrapper |
| `SkillAgencySelector` | `client/src/components/media/composer/SkillAgencySelector.tsx` | skill vs agency picker for article generation |
| `SocialPlatformPicker` | `client/src/components/media/composer/SocialPlatformPicker.tsx` | Platform-first selector |
| `SocialAccountPicker` | `client/src/components/media/composer/SocialAccountPicker.tsx` | Filtered by platform |

### Reuse Existing Components
- `AgencyPickerModal` — agency selection
- `LibraryFilePicker` — media attachment
- `DynamicSkillForm` — skill-specific parameters
- `ModelPicker` — LLM model for article generation

### State Management
Use local `useReducer` / `useState` for wizard state within `ContentComposerPanel`. No Zustand needed for this feature since it's a single-page modal/panel (avoid adding new global stores unless cross-page state is needed).

---

## 8. Security Considerations

1. **HTML sanitization** — Server-side DOMPurify (or existing `sanitizeHtml`) before DB storage; client-side DOMPurify for preview. Never store raw LLM HTML in `articleBody`.

2. **Temp URL prohibition** — Article body must only reference library asset `sourceUrl` values, not generation task preview URLs. The publish step must validate this.

3. **Role-based routing** — tRPC procedures for Docs/Blog creation must enforce `admin` or `domain_admin` role at the middleware level. Social posting is available to all authenticated users.

4. **Social target ownership** — Before publishing a social post, verify the `socialTargetId` belongs to the caller's tenant.

5. **Agency constraints** — If `executionSource === "agency"`, validate the agencyId belongs to the tenant and is an approved template before executing.

6. **Attachment count** — Enforce max 6 attachments server-side (not just client-side).

7. **Stable references** — After publish, the stored blog/doc/social content must reference `libraryItems.id` or `libraryItems.sourceUrl`, never raw task preview URLs.

---

## 9. Testing Setup Reference

- **Frontend tests:** Vitest + jsdom + `@testing-library/react` + `@testing-library/user-event`
- **Backend tests:** Vitest + `vi.hoisted()` mocks + `router.createCaller()`
- **Test file locations:** `apps/web/client/src/pages/__tests__/` and `apps/web/server/routers/__tests__/`
- **Mock pattern:** `vi.hoisted()` at top of test file, mock all tRPC calls through the `@/lib/trpc` module mock

Key areas for new tests:
1. `ContentComposerPanel.test.tsx` — Role-based destination visibility
2. `DestinationStep.test.tsx` — Admin sees Docs/Blog, user sees Social only
3. `SocialPlatformPicker.test.tsx` — Platform filtering of account list
4. `MediaAttachmentStep.test.tsx` — 1-6 limit enforcement, temp URL rejection
5. `contentComposer.router.test.ts` — generateArticle, saveDraft, publish procedures
6. `SafeHtml.test.tsx` — DOMPurify profile application, XSS prevention
