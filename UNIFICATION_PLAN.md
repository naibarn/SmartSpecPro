# SmartSpec Pro — Unified Codebase Plan (Web + Desktop)

## สถานะปัจจุบัน (Current State Analysis)

| | SmartSpecWeb | desktop-app |
|---|---|---|
| **Framework** | React 19 + Vite 7 | React 18 + Vite 7 + Tauri 2 |
| **Router** | Wouter | React Router DOM 6 |
| **State** | tRPC + React Query | Zustand + local services |
| **Backend** | Express + tRPC (server/) | Tauri Rust commands + direct API |
| **DB** | PostgreSQL (Drizzle ORM, 40+ tables) | ไม่มี local DB |
| **Auth** | OAuth + local (bcrypt, JWT, 2FA) | Tauri secure store + token |
| **Pages** | 66 pages | 14 pages |
| **Skills** | DB + folder sync + marketplace | Local file + editor + workspace |
| **UI Components** | 55 shadcn components | 4 shadcn + 16 custom (common/) |
| **Utilities** | 10 lines (minimal) | 413 lines (comprehensive) |

**ปัญหาหลัก**: 2 codebases แยกกัน, ไม่ share code, feature ไม่ sync, UI divergence

---

## Shared vs Separate — รายการสมบูรณ์

### ✅ SHARED ได้ (ใช้ร่วมกันทั้ง 2 platforms)

| Category | Items | ที่มา | หมายเหตุ |
|----------|-------|-------|----------|
| **UI Base** | Button, Card, Badge, Tabs, Input, Dialog, Select, Tooltip, Dropdown, Form, Label, Textarea, Checkbox, Switch, Popover, Sheet, Avatar, Separator, ScrollArea, Skeleton, Progress, Spinner | SmartSpecWeb เป็นหลัก | Desktop มี 4 ตัว, ย้ายไป shared ทั้งหมด |
| **Chat UI** | ChatInterface, MessageBubble, ModelSelector, MemoryPanel, SafeMarkdown, CodeBlock | ทั้ง 2 มี (ต่างกัน) | Merge เป็น version เดียว, Web เป็นหลัก |
| **Media UI** | MediaGenerationPanel, GenerationProgress, ImageLightbox, VideoPlayer | ทั้ง 2 มี | Web version สมบูรณ์กว่า |
| **Types** | User, Conversation, Message, Skill, MediaTask, CreditTransaction, GalleryItem | SmartSpecWeb/shared + drizzle | รวม + export จาก packages/shared |
| **Utils** | cn(), formatRelativeTime, formatNumber, formatBytes, formatCurrency, truncate, capitalize, slugify, isValidEmail, isValidUrl, generateId, debounce, throttle, sleep, retry, groupBy, unique, sortBy, chunk, pick, omit, deepClone | Desktop มีครบกว่า | Merge best of both → packages/shared/utils |
| **Validation** | Zod schemas: loginSchema, signupSchema, skillSchema, mediaRequestSchema, settingsSchema | SmartSpecWeb | Extract + share |
| **Skill Engine** | SkillRegistry (load, parse YAML frontmatter), SkillDetector (trigger matching), Skill types/interfaces | ทั้ง 2 มี (ต่างกัน) | Merge → packages/skills |
| **Constants** | Media types, skill categories, model providers, supported languages, credit multipliers | กระจายทั้ง 2 | รวมใน packages/shared/constants |
| **Hooks** | useDebounce, useLocalStorage, useMediaQuery, useClickOutside, useKeyPress | ทั้ง 2 มี | Merge → packages/ui/hooks |
| **Security Utils** | sanitizeHtml, sanitizeFilename, validateBitrate, validateResolution | Desktop | Share ไปให้ Web ด้วย |
| **Theme** | Tailwind 4 config, color tokens, dark/light mode tokens | ทั้ง 2 ใช้ Tailwind 4 | Unified theme preset |
| **Menu Config** | MenuItem type + defaultMenuItems array with platform flags | **NEW** | สร้างใหม่ใน packages/shared |
| **Platform Detect** | detectPlatform(), Platform type, PlatformProvider context | **NEW** | สร้างใหม่ใน packages/shared |

### ❌ SEPARATE (แยกเฉพาะแต่ละ platform)

| Category | Web Only | Desktop Only |
|----------|----------|-------------|
| **Router** | Wouter (Route, Link, useLocation) | React Router DOM (Routes, Navigate, useNavigate) |
| **State Management** | tRPC + React Query (server state) | Zustand + Immer (local state) |
| **Backend** | Express + tRPC server, 15+ routers | Tauri Rust commands (db.rs, skills.rs, pty.rs) |
| **Database** | PostgreSQL adapter (Drizzle pg-core) | SQLite adapter (Drizzle sqlite-core / rusqlite) |
| **Auth Flow** | OAuth (Google/GitHub) + bcrypt + 2FA TOTP | Tauri secure store + web token bridge |
| **Pages — Admin** | 24 admin pages (users, providers, tenants, gallery, audit, analytics) | ไม่มี |
| **Pages — Marketing** | 25 public pages (home, pricing, docs, blog, about, careers) | ไม่มี |
| **Pages — Domain Admin** | 5 domain admin pages (theme, content, users, blog, invoice) | ไม่มี |
| **Pages — Desktop Dev** | ไม่มี | Terminal (PTY), Kilo CLI, Docker Sandbox, Factory |
| **Marketplace** | Full marketplace (browse, like, comment, install, spam protection) | Read-only marketplace (browse + download) |
| **Skill Management** | Admin-controlled: DB-driven, git repos, per-tenant visibility | User-controlled: local folder, editor, import/export |
| **Multi-tenancy** | Full: tenant middleware, branding, isolation, white-label | ไม่มี (single user) |
| **Billing** | Stripe integration, credit packages, subscriptions | ไม่มี (user brings own API keys) |
| **Scheduling** | BullMQ + Redis, scheduled messages, cron jobs | ไม่มี |
| **Storage** | S3/R2 (cloud storage) | Local filesystem |
| **Email/SMS** | SMTP + SMS providers (Twilio/Vonage) | ไม่มี |
| **STT Providers** | Admin-configured STT (Groq, etc.) | User-configured API keys |
| **Sidebar** | DashboardLayout.tsx (resizable, tenant branding) | Sidebar.tsx (fixed, web user credit display) |

---

## Architecture Overview

```
smartspec-pro/                         # Unified Turborepo monorepo
│
├── packages/                          # ===== SHARED PACKAGES =====
│   │
│   ├── shared/                        # Types + Utils + Constants
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── user.ts           # User, InsertUser, UserRole
│   │   │   │   ├── conversation.ts   # Conversation, Message, Artifact
│   │   │   │   ├── media.ts          # MediaTask, MediaType, MediaModel
│   │   │   │   ├── skill.ts          # Skill, SkillCategory, SkillTrigger
│   │   │   │   ├── credits.ts        # CreditTransaction, CreditPackage
│   │   │   │   └── index.ts          # Re-export all
│   │   │   ├── utils/
│   │   │   │   ├── string.ts         # truncate, capitalize, slugify, camelToTitle
│   │   │   │   ├── number.ts         # formatNumber, formatBytes, formatCurrency, clamp
│   │   │   │   ├── date.ts           # formatRelativeTime, formatDate, formatDateTime
│   │   │   │   ├── array.ts          # groupBy, unique, sortBy, chunk
│   │   │   │   ├── object.ts         # deepClone, isEmpty, pick, omit
│   │   │   │   ├── async.ts          # sleep, retry, debounce, throttle
│   │   │   │   ├── validation.ts     # isValidEmail, isValidUrl, isValidJson
│   │   │   │   ├── id.ts             # generateId, generateUUID
│   │   │   │   ├── security.ts       # sanitizeHtml, sanitizeFilename
│   │   │   │   └── index.ts
│   │   │   ├── constants/
│   │   │   │   ├── platform.ts       # Platform type, detectPlatform()
│   │   │   │   ├── menu.ts           # MenuItem[], defaultMenuItems with platform flags
│   │   │   │   ├── media.ts          # MEDIA_TYPES, ASPECT_RATIOS, MODEL_PROVIDERS
│   │   │   │   ├── skills.ts         # SKILL_CATEGORIES, DEFAULT_TRIGGERS
│   │   │   │   └── index.ts
│   │   │   └── schemas/              # Zod validation schemas
│   │   │       ├── auth.ts           # loginSchema, signupSchema
│   │   │       ├── skill.ts          # skillSchema, triggerSchema
│   │   │       ├── media.ts          # mediaRequestSchema
│   │   │       └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ui/                            # Shared React Components
│   │   ├── src/
│   │   │   ├── primitives/           # Base shadcn (Radix-based)
│   │   │   │   ├── button.tsx        # from SmartSpecWeb
│   │   │   │   ├── input.tsx         # from SmartSpecWeb (with IME support)
│   │   │   │   ├── card.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── tabs.tsx
│   │   │   │   ├── tooltip.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   ├── popover.tsx
│   │   │   │   ├── sheet.tsx
│   │   │   │   ├── form.tsx
│   │   │   │   ├── checkbox.tsx
│   │   │   │   ├── switch.tsx
│   │   │   │   ├── avatar.tsx
│   │   │   │   ├── scroll-area.tsx
│   │   │   │   ├── skeleton.tsx
│   │   │   │   ├── progress.tsx
│   │   │   │   ├── separator.tsx
│   │   │   │   ├── textarea.tsx
│   │   │   │   ├── label.tsx
│   │   │   │   └── index.ts          # Re-export all
│   │   │   ├── chat/                 # Chat UI (merged from both)
│   │   │   │   ├── ChatMessages.tsx  # Message list rendering
│   │   │   │   ├── MessageBubble.tsx # Single message display
│   │   │   │   ├── ChatInput.tsx     # Input with slash commands
│   │   │   │   ├── ModelSelector.tsx # LLM model picker
│   │   │   │   ├── MemoryPanel.tsx   # Memory display
│   │   │   │   ├── SafeMarkdown.tsx  # Sanitized markdown render
│   │   │   │   ├── CodeBlock.tsx     # Syntax-highlighted code
│   │   │   │   └── index.ts
│   │   │   ├── media/                # Media UI (merged)
│   │   │   │   ├── MediaForm.tsx     # Generation form
│   │   │   │   ├── GenerationProgress.tsx
│   │   │   │   ├── ImageLightbox.tsx
│   │   │   │   ├── VideoPlayer.tsx
│   │   │   │   └── index.ts
│   │   │   ├── skill/                # Skill UI (shared parts)
│   │   │   │   ├── SkillCard.tsx     # Skill display card
│   │   │   │   ├── SkillBadge.tsx    # Category/status badge
│   │   │   │   └── index.ts
│   │   │   ├── hooks/                # Shared React hooks
│   │   │   │   ├── useDebounce.ts
│   │   │   │   ├── useLocalStorage.ts
│   │   │   │   ├── useMediaQuery.ts
│   │   │   │   ├── useClickOutside.ts
│   │   │   │   ├── useKeyPress.ts
│   │   │   │   └── index.ts
│   │   │   └── lib/
│   │   │       └── utils.ts          # cn() with clsx + tailwind-merge
│   │   ├── package.json              # deps: react, radix-ui, cva, clsx, tailwind-merge
│   │   └── tsconfig.json
│   │
│   ├── db/                            # Database Abstraction
│   │   ├── src/
│   │   │   ├── types.ts              # DbAdapter interface (all query methods)
│   │   │   ├── schema-types.ts       # Dialect-agnostic table interfaces
│   │   │   ├── adapters/
│   │   │   │   ├── postgres.ts       # Drizzle pg-core tables + PostgresAdapter
│   │   │   │   └── sqlite.ts         # Drizzle sqlite-core tables + SqliteAdapter
│   │   │   ├── migrations/
│   │   │   │   ├── postgres/         # PG migration SQL files
│   │   │   │   └── sqlite/           # SQLite migration SQL files
│   │   │   └── index.ts              # createDb(platform) factory
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── skills/                        # Skill Engine (shared logic)
│       ├── src/
│       │   ├── types.ts              # Skill, SkillManifest, SkillContext, SkillResult
│       │   ├── parser.ts             # Parse skill.md (YAML frontmatter + markdown)
│       │   ├── registry.ts           # Load skills from folder or DB
│       │   ├── detector.ts           # Match user prompt → skill (trigger patterns)
│       │   ├── validator.ts          # Validate skill.md structure
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── apps/                              # ===== PLATFORM-SPECIFIC APPS =====
│   │
│   ├── web/                           # SmartSpecWeb (SaaS platform)
│   │   ├── client/src/
│   │   │   ├── App.tsx               # Wouter routes (66 pages)
│   │   │   ├── main.tsx              # tRPC client + React Query setup
│   │   │   ├── contexts/
│   │   │   │   ├── AuthContext.tsx    # OAuth + session + 2FA
│   │   │   │   ├── TenantContext.tsx  # Multi-tenant
│   │   │   │   └── ThemeContext.tsx
│   │   │   ├── components/
│   │   │   │   ├── DashboardLayout.tsx   # Web sidebar (resizable, tenant branding)
│   │   │   │   ├── Navbar.tsx            # Public nav
│   │   │   │   ├── chat/
│   │   │   │   │   ├── ChatView.tsx      # Web-specific: tRPC, scheduling, artifacts, slash commands
│   │   │   │   │   ├── ChatSidebar.tsx   # Web-specific: pin, archive, trash, search
│   │   │   │   │   ├── SlashCommandMenu.tsx
│   │   │   │   │   ├── SchedulePanel.tsx
│   │   │   │   │   ├── SaveMemoryDialog.tsx
│   │   │   │   │   └── artifacts/        # ArtifactPanel, CodeArtifact
│   │   │   │   └── media/               # Web-specific media components
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.tsx         # Per-user stats, credit transactions
│   │   │   │   ├── Chat.tsx              # tRPC-based chat
│   │   │   │   ├── MediaStudio.tsx       # Full-featured (ref images, STT, presets)
│   │   │   │   ├── Marketplace.tsx       # Skills marketplace
│   │   │   │   ├── Credits.tsx           # Billing + packages
│   │   │   │   ├── Settings.tsx          # Security tab: 2FA, backup email, phone
│   │   │   │   ├── ForgotPassword.tsx    # Multi-channel recovery
│   │   │   │   ├── admin/               # 24 admin pages
│   │   │   │   ├── domain-admin/        # 5 domain admin pages
│   │   │   │   └── public/              # 25 marketing pages
│   │   │   └── lib/
│   │   │       └── trpc.ts              # tRPC client config
│   │   ├── server/                       # Express + tRPC backend
│   │   │   ├── _core/                   # Express setup, OAuth, tenant middleware
│   │   │   ├── routers/                 # 15+ tRPC routers
│   │   │   ├── services/                # 25+ business logic services
│   │   │   ├── db.ts                    # PostgreSQL queries
│   │   │   └── storage.ts              # S3/R2 cloud storage
│   │   ├── drizzle/                     # PostgreSQL migrations
│   │   ├── skills/                      # Built-in skill definitions
│   │   └── package.json
│   │
│   └── desktop/                         # Tauri Desktop App
│       ├── src/
│       │   ├── App.tsx                  # React Router DOM routes (14 pages)
│       │   ├── main.tsx                 # Zustand + platform config
│       │   ├── contexts/
│       │   │   └── PlatformContext.tsx   # Platform = 'desktop', config
│       │   ├── components/
│       │   │   ├── Sidebar.tsx          # Desktop sidebar (uses shared menuConfig)
│       │   │   ├── chat/
│       │   │   │   ├── DesktopChatView.tsx   # Zustand-based, local memory
│       │   │   │   ├── ChatSidebar.tsx       # Desktop sessions + memory stats
│       │   │   │   ├── KnowledgePanel.tsx    # Desktop-only
│       │   │   │   └── ApprovalCard.tsx      # Desktop-only: workflow approvals
│       │   │   ├── terminal/                 # Desktop-only
│       │   │   │   ├── PtyXterm.tsx
│       │   │   │   └── Terminal.tsx
│       │   │   ├── docker/                   # Desktop-only
│       │   │   │   └── DockerSandbox.tsx
│       │   │   ├── skills/
│       │   │   │   ├── SkillEditor.tsx       # Desktop-only: create/edit skills
│       │   │   │   ├── SkillManager.tsx      # Desktop-only: local skill CRUD
│       │   │   │   ├── SkillImportExport.tsx # Desktop-only
│       │   │   │   └── SkillSyncManager.tsx  # Desktop-only: git sync
│       │   │   └── factory/                  # Desktop-only
│       │   │       └── FactoryPanel.tsx
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx             # Desktop dashboard (local stats)
│       │   │   ├── LLMChat.tsx               # Desktop chat (direct API calls)
│       │   │   ├── MediaStudioPage.tsx       # Wrapper → shared MediaForm
│       │   │   ├── SkillsPage.tsx            # User skill management
│       │   │   ├── Settings.tsx              # API keys, rate limits, preferences
│       │   │   ├── KiloPty.tsx               # Desktop-only: terminal
│       │   │   ├── KiloCli.tsx               # Desktop-only: CLI
│       │   │   ├── DockerSandbox.tsx         # Desktop-only
│       │   │   └── Login.tsx                 # Tauri auth
│       │   ├── stores/
│       │   │   ├── appStore.ts              # Zustand (settings, runtime)
│       │   │   └── memoryStore.ts           # Local memory management
│       │   └── services/
│       │       ├── authService.ts           # Tauri secure store
│       │       ├── chatService.tsx          # Direct LLM API calls
│       │       ├── mediaService.ts          # Direct media API calls
│       │       ├── skillService.ts          # Local file-based skills
│       │       ├── dockerService.ts         # Desktop-only
│       │       └── pty.ts                   # Desktop-only: terminal
│       ├── src-tauri/                       # Rust backend
│       │   ├── src/
│       │   │   ├── main.rs
│       │   │   ├── db.rs                   # SQLite via rusqlite
│       │   │   ├── skills.rs               # Local skill file ops
│       │   │   ├── pty.rs                  # Terminal PTY
│       │   │   └── docker.rs               # Docker management
│       │   └── Cargo.toml
│       └── package.json
│
├── skills/                                # Built-in skill definitions (shared)
│   ├── brainstorm/skill.md
│   ├── image_prompt_engineer/skill.md
│   ├── video-prompt-engineer/skill.md
│   ├── translation/skill.md
│   ├── ultra-think/skill.md
│   ├── chat-alert/skill.md
│   └── code-docs-assistant/skill.md
│
├── python-backend/                        # Python proxy (shared by both)
│   ├── app/
│   │   ├── llm_proxy/                    # LLM gateway
│   │   ├── services/                     # Media generation
│   │   └── core/                         # Auth, CSRF
│   └── requirements.txt
│
├── turbo.json
├── package.json                           # workspaces: ["packages/*", "apps/*"]
└── tsconfig.base.json                     # Shared TS config
```

---

## Implementation Plan — จัดลำดับตามความสำคัญ

### Phase 1: Foundation — Monorepo + packages/shared (สำคัญที่สุด)

**เป้าหมาย**: ตั้ง monorepo ให้ทั้ง 2 apps ยัง build/run ได้ปกติ แต่เริ่ม share code

#### Step 1.1: Turborepo Setup
```
สร้าง:
├── turbo.json
├── package.json (workspaces)
├── tsconfig.base.json
├── packages/shared/package.json
├── packages/shared/tsconfig.json
└── packages/shared/src/index.ts

ย้าย:
├── SmartSpecWeb/ → apps/web/
└── desktop-app/ → apps/desktop/
```

#### Step 1.2: Extract packages/shared
**จากไหน → ไปไหน:**

| Source | Destination | Action |
|--------|-------------|--------|
| `desktop-app/src/utils/index.ts` (413 lines) | `packages/shared/src/utils/` | Split เป็น string/number/date/array/object/async/id |
| `desktop-app/src/utils/security.ts` (135 lines) | `packages/shared/src/utils/security.ts` | ย้ายตรงๆ |
| `SmartSpecWeb/shared/` | `packages/shared/src/types/` | Merge types |
| `SmartSpecWeb/drizzle/schema.ts` (types only) | `packages/shared/src/types/` | Export interfaces (ไม่ใช่ tables) |
| Both apps: Zod schemas | `packages/shared/src/schemas/` | Merge + dedupe |
| **NEW** | `packages/shared/src/constants/platform.ts` | `Platform` type + `detectPlatform()` |
| **NEW** | `packages/shared/src/constants/menu.ts` | `MenuItem` + `defaultMenuItems` |

#### Step 1.3: Update imports ทั้ง 2 apps
```typescript
// ก่อน (desktop-app)
import { truncate, formatNumber } from '../../utils';

// หลัง
import { truncate, formatNumber } from '@smartspec/shared';
```

**ทดสอบ**: `turbo build` — ทั้ง 2 apps build ผ่าน

---

### Phase 2: packages/ui — Shared React Components

**เป้าหมาย**: UI components library เดียวที่ทั้ง 2 apps ใช้ร่วมกัน

#### Step 2.1: Extract Base UI Primitives
**Source**: `SmartSpecWeb/client/src/components/ui/` (55 files — เป็นหลัก)

```
packages/ui/src/primitives/
├── button.tsx          ← SmartSpecWeb version (มี aria-invalid, has-[] etc.)
├── input.tsx           ← SmartSpecWeb version (มี IME support)
├── card.tsx            ← SmartSpecWeb version (มี data-slot, @container)
├── badge.tsx           ← Merge: SmartSpecWeb base + Desktop's success/warning variants
├── tabs.tsx            ← SmartSpecWeb version
├── dialog.tsx          ← SmartSpecWeb
├── select.tsx          ← SmartSpecWeb
├── tooltip.tsx         ← SmartSpecWeb
├── dropdown-menu.tsx   ← SmartSpecWeb
├── popover.tsx         ← SmartSpecWeb
├── sheet.tsx           ← SmartSpecWeb
├── form.tsx            ← SmartSpecWeb
├── checkbox.tsx        ← SmartSpecWeb
├── switch.tsx          ← SmartSpecWeb
├── avatar.tsx          ← SmartSpecWeb
├── separator.tsx       ← SmartSpecWeb
├── scroll-area.tsx     ← SmartSpecWeb
├── skeleton.tsx        ← SmartSpecWeb
├── progress.tsx        ← SmartSpecWeb
├── textarea.tsx        ← SmartSpecWeb
├── label.tsx           ← SmartSpecWeb
└── ... (ที่เหลือจาก SmartSpecWeb ui/)
```

**Desktop ลบ**: `desktop-app/src/components/ui/` (4 files) + `desktop-app/src/components/common/` (16 files)
**Desktop import**: `import { Button, Card, Input } from '@smartspec/ui'`

#### Step 2.2: Upgrade Desktop to React 19
- `desktop-app/package.json`: react 18.2 → 19.2
- ลบ `React.forwardRef` patterns (React 19 ไม่ต้อง)
- Test ทุก component

#### Step 2.3: Extract Shared Chat Components
**Merge strategy**: Web version เป็นหลัก (สมบูรณ์กว่า), desktop adapt

```
packages/ui/src/chat/
├── ChatMessages.tsx     # Message list (merged: Web's artifact support + Desktop's approval cards)
├── MessageBubble.tsx    # Single message (Web base + Desktop's memory indicator)
├── ChatInput.tsx        # Text input area (shared base, platform adapts)
├── ModelSelector.tsx    # LLM model picker (merged)
├── MemoryPanel.tsx      # Memory display (Web's is richer)
├── SafeMarkdown.tsx     # Sanitized markdown (Web version)
├── CodeBlock.tsx        # Syntax highlight (Web version)
└── index.ts
```

**ยังแยก (platform-specific)**:
- Web: `SlashCommandMenu.tsx`, `SchedulePanel.tsx`, `SaveMemoryDialog.tsx`, `ArtifactPanel.tsx`
- Desktop: `KnowledgePanel.tsx`, `ApprovalCard.tsx`

#### Step 2.4: Extract Shared Media Components
```
packages/ui/src/media/
├── MediaForm.tsx            # Generation form (shared)
├── GenerationProgress.tsx   # Progress display (shared)
├── ImageLightbox.tsx        # Image viewer (shared)
├── VideoPlayer.tsx          # Video player (shared)
└── index.ts
```

#### Step 2.5: Extract Shared Hooks
```
packages/ui/src/hooks/
├── useDebounce.ts
├── useLocalStorage.ts
├── useMediaQuery.ts
├── useClickOutside.ts
├── useKeyPress.ts
└── index.ts
```

**ทดสอบ**: ทั้ง 2 apps build + UI ไม่ broken

---

### Phase 3: packages/db — Database Abstraction

**เป้าหมาย**: PostgreSQL (web) + SQLite (desktop) ผ่าน interface เดียว

#### Step 3.1: Define DbAdapter Interface

```typescript
// packages/db/src/types.ts
export interface DbAdapter {
  // Users
  getUser(openId: string): Promise<User | undefined>;
  upsertUser(user: InsertUser): Promise<void>;
  updateLastSignedIn(openId: string): Promise<void>;

  // Conversations
  listConversations(userId: number, opts: { limit: number; offset?: number }): Promise<{ conversations: Conversation[]; total: number }>;
  getConversation(id: number): Promise<Conversation | undefined>;
  createConversation(conv: InsertConversation): Promise<number>;
  updateConversation(id: number, data: Partial<Conversation>): Promise<void>;
  deleteConversation(id: number): Promise<void>;

  // Messages
  getMessages(conversationId: number): Promise<Message[]>;
  createMessage(msg: InsertMessage): Promise<number>;

  // Skills
  listSkills(opts?: { category?: string; enabled?: boolean }): Promise<Skill[]>;
  getSkillBySlug(slug: string): Promise<Skill | undefined>;
  upsertSkill(skill: InsertSkill): Promise<void>;

  // Media Tasks
  listMediaTasks(userId: number, opts: { limit: number }): Promise<{ tasks: MediaTask[]; total: number }>;
  createMediaTask(task: InsertMediaTask): Promise<number>;
  updateMediaTask(id: number, data: Partial<MediaTask>): Promise<void>;

  // Credits (web-specific but interface still defined)
  getCreditBalance(userId: number): Promise<number>;
  addCreditTransaction(tx: InsertCreditTransaction): Promise<void>;

  // Memory
  getMemories(userId: number, conversationId?: number): Promise<Memory[]>;
  saveMemory(memory: InsertMemory): Promise<void>;

  // Settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}
```

#### Step 3.2: PostgreSQL Adapter (wrap existing)
```typescript
// packages/db/src/adapters/postgres.ts
// Wrap existing SmartSpecWeb/server/db.ts + drizzle schema
// ไม่ rewrite — wrap functions ที่มีอยู่แล้วให้ conform to DbAdapter
```

#### Step 3.3: SQLite Adapter (new for desktop)
```typescript
// packages/db/src/adapters/sqlite.ts
// Drizzle sqlite-core tables (mirror PG schema)
// Desktop: SQLite file at $APPDATA/SmartSpecPro/data.db

// Simplified schema (desktop ไม่ต้องการ tables ทั้งหมด):
// ✅ users (single user, local settings)
// ✅ conversations + messages
// ✅ skills (local skill metadata)
// ✅ media_tasks (generation history)
// ✅ memories (local memory)
// ✅ settings (key-value)
// ❌ tenants, credit_packages, stripe, oauth, etc. (web only)
```

#### Step 3.4: Tauri Rust SQLite Commands
```rust
// apps/desktop/src-tauri/src/db.rs
#[tauri::command]
async fn db_query(sql: String, params: Vec<String>) -> Result<String, String> { ... }

#[tauri::command]
async fn db_execute(sql: String, params: Vec<String>) -> Result<u64, String> { ... }

#[tauri::command]
async fn db_migrate() -> Result<(), String> { ... }
```

**ทดสอบ**: Desktop app stores conversations/skills locally in SQLite

---

### Phase 4: packages/skills — Unified Skill Engine

**เป้าหมาย**: Skill parsing, detection, validation ใช้ร่วมกัน

#### Step 4.1: Extract Skill Parser + Detector

```typescript
// packages/skills/src/parser.ts
// จาก SmartSpecWeb/server/services/skillRegistry.ts
// Parse skill.md → Skill object (YAML frontmatter + markdown content)
export function parseSkillFile(content: string): SkillManifest { ... }

// packages/skills/src/detector.ts
// จาก SmartSpecWeb/server/services/skillDetector.ts
// Match user prompt against trigger patterns
export function detectSkill(prompt: string, skills: Skill[]): Skill | null { ... }

// packages/skills/src/validator.ts
// Validate skill.md structure
export function validateSkill(manifest: SkillManifest): ValidationResult { ... }
```

#### Step 4.2: Platform-Specific Loading

```typescript
// Web: load from DB + folder scan (existing behavior)
// packages/skills/src/registry.ts
export class SkillRegistry {
  async loadFromFolder(dir: string): Promise<Skill[]> { ... }  // ใช้ร่วมกัน
  async loadFromDb(adapter: DbAdapter): Promise<Skill[]> { ... }  // Web only
  async syncFolderToDb(dir: string, adapter: DbAdapter): Promise<void> { ... }  // Web only
}

// Desktop: load from local folder only
// User manages skills ที่ ~/SmartSpecPro/skills/
```

#### Step 4.3: Desktop Marketplace (Read-Only)

```typescript
// Desktop can fetch skill catalog from web API (read-only)
// Browse → Download → Save to local skills folder
// ไม่มี like/comment (ต้อง login web สำหรับนั้น)
```

---

### Phase 5: Platform-Aware Menu System

**เป้าหมาย**: Admin กำหนด menu ได้ per platform + per tenant

#### Step 5.1: Menu Config (packages/shared)

```typescript
// packages/shared/src/constants/menu.ts
export const defaultMenuItems: MenuItem[] = [
  // ===== SHARED (ทั้ง web + desktop) =====
  { id: 'dashboard',  label: 'Dashboard',     labelTh: 'แดชบอร์ด',      icon: 'LayoutDashboard', path: '/',           platforms: ['web', 'desktop'], sortOrder: 0 },
  { id: 'chat',       label: 'AI Chat',        labelTh: 'แชท AI',        icon: 'MessageSquare',   path: '/chat',       platforms: ['web', 'desktop'], sortOrder: 1 },
  { id: 'media',      label: 'Media Studio',   labelTh: 'สตูดิโอ',       icon: 'Image',           path: '/media',      platforms: ['web', 'desktop'], sortOrder: 2 },
  { id: 'skills',     label: 'Skills',         labelTh: 'ทักษะ',         icon: 'Sparkles',        path: '/skills',     platforms: ['web', 'desktop'], sortOrder: 3 },
  { id: 'settings',   label: 'Settings',       labelTh: 'ตั้งค่า',       icon: 'Settings',        path: '/settings',   platforms: ['web', 'desktop'], sortOrder: 99 },

  // ===== WEB ONLY =====
  { id: 'marketplace', label: 'Marketplace',   labelTh: 'มาร์เก็ตเพลส',  icon: 'Store',           path: '/marketplace', platforms: ['web'], sortOrder: 4 },
  { id: 'gallery',     label: 'Gallery',       labelTh: 'แกลเลอรี่',     icon: 'GalleryHorizontal', path: '/gallery', platforms: ['web'], sortOrder: 5 },
  { id: 'credits',     label: 'Credits',       labelTh: 'เครดิต',        icon: 'Coins',           path: '/credits',    platforms: ['web'], sortOrder: 6 },

  // ===== DESKTOP ONLY =====
  { id: 'terminal',   label: 'Terminal',       labelTh: 'เทอร์มินัล',    icon: 'Terminal',        path: '/terminal',   platforms: ['desktop'], sortOrder: 4 },
  { id: 'docker',     label: 'Docker Sandbox', labelTh: 'แซนด์บ็อกซ์',   icon: 'Container',       path: '/docker',     platforms: ['desktop'], sortOrder: 5 },
  { id: 'factory',    label: 'Factory',        labelTh: 'โรงงาน',        icon: 'Factory',         path: '/factory',    platforms: ['desktop'], sortOrder: 6 },

  // ===== ADMIN (web only) =====
  { id: 'admin-users',     label: 'Users',          icon: 'Users',        path: '/admin/users',          platforms: ['web'], roles: ['admin'], sortOrder: 20 },
  { id: 'admin-providers', label: 'LLM Providers',  icon: 'Brain',        path: '/admin/llm-providers',  platforms: ['web'], roles: ['admin'], sortOrder: 21 },
  { id: 'admin-media',     label: 'Media Models',   icon: 'Layers',       path: '/admin/media-models',   platforms: ['web'], roles: ['admin'], sortOrder: 22 },
  { id: 'admin-skills',    label: 'Skills Admin',   icon: 'Wand2',        path: '/admin/skills',         platforms: ['web'], roles: ['admin'], sortOrder: 23 },
  { id: 'admin-tenants',   label: 'Tenants',        icon: 'Building2',    path: '/admin/tenants',        platforms: ['web'], roles: ['admin'], sortOrder: 24 },
  { id: 'admin-gallery',   label: 'Gallery Admin',  icon: 'Images',       path: '/admin/gallery',        platforms: ['web'], roles: ['admin'], sortOrder: 25 },
  { id: 'admin-settings',  label: 'Platform Settings', icon: 'Settings',  path: '/admin/settings',       platforms: ['web'], roles: ['admin'], sortOrder: 26 },

  // ===== DOMAIN ADMIN (web only) =====
  { id: 'domain-admin',    label: 'Domain Admin',   icon: 'Building2',    path: '/domain-admin',         platforms: ['web'], roles: ['domain_admin', 'admin'], sortOrder: 30 },
];
```

#### Step 5.2: DB Table for Admin Overrides (Web)

```sql
CREATE TABLE menu_config (
  id SERIAL PRIMARY KEY,
  menu_item_id VARCHAR(50) NOT NULL,
  platform VARCHAR(10) NOT NULL DEFAULT 'web',
  visible BOOLEAN DEFAULT true,
  custom_label VARCHAR(100),
  custom_icon VARCHAR(50),
  sort_order INTEGER,
  tenant_id VARCHAR(36),               -- NULL = global default
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(menu_item_id, platform, tenant_id)
);
```

#### Step 5.3: Admin Menu Editor Page
- Drag-and-drop reorder
- Toggle visibility per item
- Per-tenant customization
- Preview for web + desktop

#### Step 5.4: Shared Sidebar Component

```typescript
// packages/ui/src/layout/SidebarMenu.tsx
// Renders menu items from config
// Platform-agnostic: receives items + onNavigate callback
// Each app wraps with its own router navigation

// Web: <SidebarMenu items={items} onNavigate={(path) => setLocation(path)} />
// Desktop: <SidebarMenu items={items} onNavigate={(path) => navigate(path)} />
```

---

### Phase 6: Cross-Platform Desktop Build

**เป้าหมาย**: Windows + Mac + Linux builds + auto-update

#### Step 6.1: Tauri Config Updates

```json
// apps/desktop/src-tauri/tauri.conf.json
{
  "bundle": {
    "targets": ["dmg", "nsis", "deb", "appimage"],
    "windows": {
      "nsis": { "oneClick": false, "perMachine": true, "allowElevation": true }
    },
    "macOS": {
      "minimumSystemVersion": "10.15",
      "frameworks": [],
      "dmg": { "appPosition": { "x": 180, "y": 170 }, "applicationFolderPosition": { "x": 480, "y": 170 } }
    }
  }
}
```

#### Step 6.2: GitHub Actions CI/CD

```yaml
# .github/workflows/desktop-release.yml
name: Desktop Release
on:
  push:
    tags: ['v*']
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: universal-apple-darwin    # Both Intel + Apple Silicon
          - os: windows-latest
            target: x86_64-pc-windows-msvc
          - os: ubuntu-22.04
            target: x86_64-unknown-linux-gnu
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install --filter @smartspec/desktop...
      - uses: tauri-apps/tauri-action@v0
        with:
          projectPath: apps/desktop
          tagName: v__VERSION__
          releaseName: 'SmartSpec Pro v__VERSION__'
          releaseBody: 'See CHANGELOG.md for details'
```

#### Step 6.3: Auto-Updater

```json
// tauri.conf.json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": ["https://releases.smartspec.pro/{{target}}/{{arch}}/{{current_version}}"],
      "dialog": true,
      "pubkey": "<generate-with-tauri-cli>"
    }
  }
}
```

---

## Desktop SQLite Schema — Tables ที่ต้องการ

```
Desktop ใช้ subset ของ Web schema:

✅ users              (1 row — local user profile + settings)
✅ conversations      (local chat history)
✅ messages           (local messages)
✅ entity_memories    (local long-term memory)
✅ skills             (local skill metadata, synced from files)
✅ skill_preferences  (user's skill visibility/config)
✅ media_tasks        (local generation history)
✅ settings           (key-value app settings)

❌ tenants            (web only — multi-tenant)
❌ credit_packages    (web only — billing)
❌ credit_transactions (web only — billing)
❌ gallery_items      (web only — public gallery)
❌ tenant_pages       (web only — CMS)
❌ blog_posts         (web only — blog)
❌ seo_metadata       (web only — SEO)
❌ theme_presets      (web only — themes)
❌ invoice_config     (web only — billing)
❌ llm_providers      (web only — admin config)
❌ media_providers    (web only — admin config)
❌ media_models       (web only — admin config)
❌ registration_events (web only — security)
❌ device_fingerprints (web only — security)
❌ blocked_patterns   (web only — security)
❌ email_verification_tokens (web only — auth)
❌ scheduled_messages (web only — BullMQ)
❌ skill_repositories (web only — git repos)
❌ skill_likes        (web only — marketplace)
❌ skill_comments     (web only — marketplace)
❌ user_follows       (web only — social)
❌ direct_messages    (web only — social)
❌ user_notifications (web only — social)
❌ system_settings    (web only — admin)
❌ stt_providers      (web only — admin)
```

---

## Shared Components — Dependency Graph

```
packages/shared (no React dependency)
    ↓ used by
packages/db (no React dependency)
    ↓ used by
packages/skills (no React dependency)
    ↓ used by
packages/ui (React dependency)
    ↓ used by
├── apps/web
└── apps/desktop
```

**ข้อจำกัด**: packages/shared, packages/db, packages/skills ไม่มี React dependency — ใช้ได้ทั้ง frontend + backend

---

## ความเสี่ยงและ Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Drizzle PG↔SQLite schema drift | สูง | CI test: generate SQLite from PG schema, run both adapters |
| React 18→19 upgrade (desktop) | กลาง | Phase 2 ทำก่อน UI extraction, test ทุก component |
| Wouter vs React Router | กลาง | Shared UI ไม่ depend on router, pass `onNavigate` callback |
| Import path migration | ต่ำ | Codemod script: replace relative → @smartspec/* |
| Tailwind theme inconsistency | กลาง | Shared tailwind preset in packages/ui |
| Build time increase (monorepo) | ต่ำ | Turborepo cache + parallel builds |
| Code signing (Mac/Win) | ต่ำ | Apple $99/yr, Windows EV cert $200-400/yr |

---

## ลำดับความสำคัญสรุป

```
Phase 1  ★★★★★  Monorepo + packages/shared     ← ทำก่อน (foundation)
Phase 2  ★★★★☆  packages/ui                     ← ลด duplication มากที่สุด
Phase 3  ★★★☆☆  packages/db                     ← Desktop ได้ local storage
Phase 4  ★★★☆☆  packages/skills                 ← Unified skill engine
Phase 5  ★★☆☆☆  Menu system                     ← Admin flexibility
Phase 6  ★★☆☆☆  Cross-platform build            ← Distribution
```

แต่ละ Phase ทำเสร็จแล้ว ทั้ง 2 apps ยังทำงานได้ปกติ — ไม่มี big bang migration
