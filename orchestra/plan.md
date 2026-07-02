# Orchestra Plan

## Task
Improve the entire chat page UI/UX using AstryX guidance, with complete desktop/tablet support and a practical mobile experience that renders and works correctly.

## Classification
- scope: medium
- risk: low
- affected_domains: frontend chat UI, responsive layout, accessibility, visual polish
- estimated_file_count: 3
- chosen_route: visual-ui-flow in Codex standard light mode
- task_summary: Refine the chat page shell, sidebar, message area, composer, and right panel responsiveness while preserving existing chat behavior.
- bug_route: N/A
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

## Activation Decision
The user explicitly invoked `orchestra` and requested AstryX-based UI/UX work. `visual-ui-enhancement` and the UI/UX planning references apply. `brainstorming` was used as a required pre-implementation design gate, and the user approved the proposed design before edits.

## SocratiCode Preflight
- `codebase_status`: green, watcher active.
- `codebase_search`: identified `apps/web/client/src/pages/Chat.tsx`, `apps/web/client/src/components/chat/ChatView.tsx`, and `apps/web/client/src/components/chat/ChatSidebar.tsx` as the primary surfaces.
- `codebase_impact` on `apps/web/client/src/pages/Chat.tsx`: no upstream callers.

## AstryX Discovery
- `astryx build "responsive AI chat workspace with conversation sidebar message stream composer and skill settings panel"` recommended `ai-chat`, `AppShell`, `SideNav`, `Layout`, `ChatComposerDrawer`, `ChatSendButton`, `TextArea`, and `useResizable`.
- `ai-chat` skeleton confirms the target pattern: conversation view, message list, composer dock, and resizable artifact/right panel.
- Existing app already imports AstryX CSS/theme setup in `main.tsx` and `index.css`; no reset will be added.

## UI/UX Contract

### Target User / JTBD
- Role: authenticated SmartSpecPro user using AI chat for skills, artifacts, browser sessions, finance, memory, alerts, and agency work.
- Goal: keep chat as the primary work surface while quickly opening supporting panels.
- Entry point: `/chat`, including `?c=<conversationId>` deep links.
- Success outcome: chat remains readable and actionable across desktop, tablet, and mobile without broken panel overlap or horizontal overflow.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Chat route shell | `/chat`, `apps/web/client/src/pages/Chat.tsx` | Responsive shell, top bar, side drawers, right panel behavior |
| Conversation sidebar | `apps/web/client/src/components/chat/ChatSidebar.tsx` | Density, scrolling, mobile-safe list actions |
| Chat view | `apps/web/client/src/components/chat/ChatView.tsx` | Header overflow, message widths, composer dock and touch targets |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| `Chat` | `Chat.tsx` | Page shell, left/right panels, global chat actions | `ChatSidebar`, `ChatView`, panel components |
| `ChatSidebar` | `ChatSidebar.tsx` | Conversation list, search, trash/team sections | chat tRPC list/update/delete |
| `ChatView` | `ChatView.tsx` | Conversation header, messages, composer, empty state | chat messages, models, skills, local AI, attachments |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Centered token-aware loading surface | Browser/typecheck |
| empty | Clear start state with primary CTA and optional browser/workpack actions | Browser |
| selected conversation | Stable 3-zone desktop, main-first tablet/mobile | Browser |
| right panel open | Desktop inline panel; tablet/mobile overlay drawer with close path | Browser |
| disabled/focus/hover | Icon buttons keep accessible names and visible states | Browser/manual |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Chat primary; sidebar/right panel are overlays; composer fits; no horizontal overflow | Playwright/manual evidence |
| tablet 768x1024 | Chat primary; panels overlay or constrained; toolbar wraps safely | Playwright/manual evidence |
| desktop 1440x900 | Left sidebar, chat, and right panel can coexist with stable widths | Playwright/manual evidence |

### Accessibility Acceptance
- Keyboard path: primary buttons remain reachable; drawers have close controls.
- Focus visibility: preserve shadcn focus styles and avoid hidden active panels stealing layout.
- Labels/semantics: icon-only buttons keep `title`/`aria-label` where possible.
- Contrast: use existing shadcn tokens and AstryX `--color-*` variables.
- Reduced motion: only short transitions, no looping decorative motion.

### Design Token Extraction
Sources:
- `/home/dev/projects/SmartSpecPro/AGENTS.md`
- `/home/dev/projects/SmartSpecPro/docs/astryx-adoption.md`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/main.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/index.css`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Chat.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/ChatView.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/ChatSidebar.tsx`

Token summary:
- Color: AstryX `--color-background-*`, `--color-text-*`, `--color-border*`, `--color-accent`; existing shadcn `bg-background`, `text-muted-foreground`, `border`.
- Typography: existing product uses compact 12-14px operational text; AstryX base is 14px with semantic type tokens.
- Spacing: compact operational density, 8-16px rhythm; composer/control touch targets must stay at least 44px on mobile.
- Radius: existing shadcn `rounded-lg/xl/2xl`; AstryX radius tokens include `--radius-element`, `--radius-container`, `--radius-chat`.
- Elevation: subtle borders and low shadows; avoid decorative gradients/orbs.
- Motion: short transform/opacity transitions only.
- Component primitives: existing shadcn/Radix controls plus AstryX token/component guidance.
- Density: dense operational chat workspace, not a marketing page.

Do not change:
- Chat streaming, skill routing, local AI, artifact extraction, finance mirroring, agency stream, or tRPC contracts.
- AstryX global reset.

## Wave Plan
- Wave 1: Patch chat page shell responsiveness and panel behavior.
- Wave 2: Patch `ChatView` header, message area, empty state, composer touch layout.
- Wave 3: Patch sidebar polish and mobile-safe interaction details.
- Wave 4: Run typecheck/browser evidence and fix regressions.
