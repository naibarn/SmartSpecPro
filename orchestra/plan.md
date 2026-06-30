# Orchestra Plan

## Task
Improve the SmartSpecPro dashboard so the Astryx-guided UI/UX works across desktop, tablet, and mobile, with tablet support treated as complete rather than partial.

## Classification
- scope: medium
- risk: low
- affected_domains: frontend UI, responsive QA, dashboard tests
- estimated_file_count: 2
- chosen_route: visual-ui-flow
- task_summary: Restore full dashboard content on tablet/mobile while keeping desktop sidebar behavior and adding regression coverage.
- bug_route: N/A
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

## Skill Activation
- orchestra: selected because the user explicitly invoked it and requested inspect/change/verify workflow.
- visual-ui-enhancement: selected because responsive UI/UX and route-level dashboard polish are in scope.
- brainstorming: used as a bounded design approval gate before implementation.

## SocratiCode Preflight
- status: active and green for `/home/dev/projects/SmartSpecPro`.
- narrowed files: `apps/web/client/src/pages/Dashboard.tsx`, `apps/web/client/src/pages/__tests__/Dashboard.test.tsx`.
- fallback: none.

## Design Token Extraction
Sources:
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Dashboard.tsx`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/dashboard/dashboardPrimitives.tsx`
- Astryx CLI: `astryx build "responsive dashboard tablet mobile desktop SaaS app shell cards actions"`

Token summary:
- Color: existing slate/sky/emerald semantic dashboard palette with shadcn button/badge primitives.
- Typography: existing dashboard primitive classes for titles, body copy, meta lines.
- Spacing: existing 3/4/5/6 Tailwind spacing rhythm, rounded 2xl/28px surface pattern.
- Radius: existing rounded-xl/2xl/28px dashboard cards.
- Elevation: subtle borders plus shadow-sm on mobile/tablet, richer shadows on xl desktop.
- Motion: framer-motion entrance effects limited to desktop-class viewport.
- Component primitives: local `DashboardSectionHeader`, `DashboardStatCard`, shadcn `Button`, `Badge`, lazy finance/release panels.
- Density: balanced operational dashboard; tablet should keep all key sections visible without fixed desktop sidebar.

Do not change:
- Data-fetching contracts, tRPC router behavior, auth/tenant logic, or menu resolution semantics.
- Existing quick action/menu user intent beyond responsive availability.

## Impact Preflight
- Directly changed files: `Dashboard.tsx`, `Dashboard.test.tsx`.
- Dependent tests: dashboard Vitest suite.
- Risk-sensitive surfaces: user-facing dashboard route, admin-only dashboard sections, analytics visibility.
- Parallelizable workstreams: implementation and review could be split, but standard light mode and two-file scope favor direct inline work.
- Sequential workstreams: patch first, then focused test/typecheck/browser evidence.
- Confidence: high that the primary issue is viewport gating at `min-width: 1280px`.

## UI/UX Contract

### Target User / JTBD
- Role: authenticated SmartSpecPro users and admins.
- Goal: monitor work, finance, usage, reviews, workflows, and recent activity from the dashboard.
- Entry point: `/dashboard`.
- Success outcome: tablet, mobile, and desktop users can reach core dashboard surfaces without missing sections.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Dashboard route | `apps/web/client/src/pages/Dashboard.tsx` | Keep core sections rendered below desktop width; refine header/mobile drawer responsiveness. |
| Dashboard tests | `apps/web/client/src/pages/__tests__/Dashboard.test.tsx` | Add tablet regression coverage. |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| `Dashboard` | `Dashboard.tsx` | Route layout, responsive rendering, dashboard sections | Auth/Tenant/TRPC hooks, dashboard primitives, FinanceHub |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Existing lazy panel fallbacks remain | Focused test/typecheck |
| empty | Existing empty states remain visible | Existing test coverage |
| error | Existing dashboard fallback behavior unchanged | Code review |
| success | Core sections render on tablet/mobile/desktop | New tablet regression test |
| disabled/focus/hover | Buttons retain visible focus; header actions can wrap | Code review/browser evidence |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Drawer navigation, stacked content, core surfaces visible | Planned browser evidence |
| tablet 768x1024 | Drawer navigation with wider panel, 3-column quick actions, core surfaces visible | New regression test + planned browser evidence |
| desktop 1440x900 | Fixed sidebar and full dashboard remain intact | Existing tests + planned browser evidence |
| laptop 1024x768 | No fixed sidebar; core dashboard still visible | Planned browser evidence if tooling allows |

### Accessibility Acceptance
- Keyboard path: buttons remain semantic and reachable.
- Focus visibility: existing focus-visible rings preserved on quick actions.
- Labels/semantics: no icon-only control introduced.
- Contrast: existing token palette preserved.
- Reduced motion: non-desktop viewports avoid entrance animation props.

### Browser Evidence Required
- Follow `orchestra/ui-browser-evidence.md` after implementation.

## Wave Plan
- Wave 1: Restore tablet/mobile content availability, header wrapping, mobile drawer width, and tablet regression test.
- Wave 2: Run focused tests/typecheck and browser-responsive evidence when available.
