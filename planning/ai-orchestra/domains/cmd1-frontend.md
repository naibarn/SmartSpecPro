# CMD-1: Frontend Architect — Domain Knowledge

## Ownership
All client-side code in `apps/web/client/src/` and `packages/ui/`

## Architecture

### Pages (74 total)
- **Public:** Home, Pricing, Features, About, Docs, Contact, Blog, Gallery, Marketplace
- **Auth:** Login, Signup, ForgotPassword, AuthCallback, VerifyEmail, DeviceAuth
- **User:** Chat, Dashboard, Generate, MediaStudio, VideoEditorPage, Settings, Profile, Credits, SkillBrowser, UsageAnalytics
- **Admin (15):** AdminUsers, AdminLLMProviders, AdminMediaProviders, AdminSkills, AdminQueues, AdminSettings, AdminTenants, AdminAuditLogs, AdminSystemHealth, AdminDockerStatus, AdminStorageSettings, AdminMediaModels, AdminPackages, AdminRateLimits, AdminAnalytics
- **Domain Admin:** DomainAdmin, DomainUsers, DomainAdminContent, DomainThemeEditor, DomainBlogAdmin, DomainAdminInvoice, TenantSettings

### Component Groups
- **videoeditor/** (17 components): VideoEditorPhase3 (main), Timeline, TimelineClip, PreviewPlayer, MediaLibraryPanel, TextClipEditor, Toolbar, ExportDialog, RenderProgressDialog, TransitionsPanel, AudioDuckingPanel, OverlayPanel, HistoryPanel, KeyboardShortcutsOverlay, Toast, ConfirmDialog, ErrorBoundary
- **chat/** (11 components): ChatView, ChatSidebar, SlashCommandMenu, MemoryPanel, SaveMemoryDialog, SchedulePanel, ScheduleConfirmCard, SafeMarkdown, FallbackConsent + media/ + settings/ + artifacts/
- **media/** (3): SkillSelectorDialog, DynamicSkillForm, ModelSelectorDialog
- **admin/** (1): MultiProviderAdmin
- **analytics/** (3+): DateRangeSelector, StatsCards, etc.
- **ui/** (58): Full Radix UI component library (Button, Dialog, Input, Table, etc.)
- **Layout** (5): DashboardLayout, DashboardLayoutSkeleton, Navbar, Footer, ErrorBoundary

### State Management
- **AuthContext:** User state, login/logout/register, session management
- **TenantContext:** Current tenant, domain, branding
- **ThemeContext:** Light/dark mode
- **TanStack Query:** Server state via tRPC hooks (auto-caching, invalidation)

### Routing (Wouter)
- Lightweight, `<Route path="/admin/...">` pattern
- Protected routes check `useAuth()` for authentication
- Path aliases: `@/` = `client/src/`, `@shared/` = `shared/`, `@assets/` = `attached_assets/`

### Styling
- TailwindCSS 4 (utility-first)
- CVA (class-variance-authority) for component variants
- `cn()` utility from `@smartspec/ui` for class merging
- Framer Motion for animations
- Radix UI primitives (unstyled, accessible)

## Video Editor (Critical Subsystem)

### Component Hierarchy
```
VideoEditorPage.tsx
  └── VideoEditorPhase3.tsx (main state management)
        ├── Toolbar.tsx (above timeline: zoom, undo/redo, play controls)
        ├── MediaLibraryPanel.tsx (left sidebar: project assets)
        ├── PreviewPlayer.tsx (center: video preview with controls)
        ├── Timeline.tsx (bottom: multi-track timeline)
        │     └── TimelineClip.tsx (individual clip on track)
        ├── TextClipEditor.tsx (text overlay editing)
        ├── TransitionsPanel.tsx (transition selection)
        ├── ExportDialog.tsx (export settings)
        └── RenderProgressDialog.tsx (export progress)
```

### Track Types
- V1 (video): Primary video track, auto-snap enabled
- V2 (overlay): Image/video overlays, transparency
- T1 (text): Text overlays with font, color, animation
- A1 (audio): Audio track, volume control

### Known Issues / History
- **Preview black screen** (FIXED commit 94dfc69): Global CSS `[aria-label*="preview"]` was hiding the video container. Fix: scoped selectors with `body >` + renamed aria-label.
- **CSS specificity conflicts**: `index.css` has global hide rules for external previewer banners. Be careful with aria-label and data-testid attributes.
- **Flex layout pattern**: Use `flex: 1; height: 0; min-height: 0;` for reliable flex growth (not `height: 100%`).

## Common Debugging Patterns

1. **Component not rendering:** Check CSS (display, height, overflow), check parent flex/grid layout
2. **tRPC data not loading:** Check TanStack Query state, verify tRPC hook setup, check auth
3. **Style conflicts:** Check global CSS in `index.css`, check Tailwind class specificity
4. **Video editor issues:** Check track type restrictions, clip duration calculations, auto-snap logic
