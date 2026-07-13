# Video Studio → native Astryx Design System migration

## Problem statement

Video Studio (Feature 133) currently builds its UI below the page-shell level
with shadcn/ui (`@/components/ui/*`: Dialog, Button, Card, Input, Label,
Badge) + Tailwind utilities. This is the same pattern every other page in the
app uses (confirmed against the only other `AppPage`-based pages: Vertical
Drama Series/Detail/Episode). shadcn's tokens are already wired to Astryx's
theme CSS variables via `index.css`'s `@import "@astryxdesign/core/tailwind-theme.css"`,
so shadcn components already respond correctly to all 7 Astryx palettes
(Neutral/Butter/Chocolate/Gothic/Matcha/Stone/Y2K) and light/dark mode.

**User's explicit decision** (after being shown both of the following risks):
replace shadcn/ui components in Video Studio with native Astryx components
(`@astryxdesign/core/*`) directly, even though:
1. No other page in the codebase does this (would be the sole exception).
2. `AppPage.tsx`'s own docstring explicitly states it is "intentionally the
   ONLY app file... that imports `@astryxdesign` directly. Pages should
   import `AppPage` from here — never Astryx components directly." This
   migration deliberately violates that written rule, per explicit,
   twice-confirmed user instruction.

Also in scope: close concrete responsive gaps (desktop/tablet/mobile) found
during the audit, and remove the last 2 non-theme-aware hardcoded colors
(`amber-500` in `VideoStudioWorkspacePage.tsx:160` and `NotWiredJobCard.tsx:63`)
by mapping them to Astryx's `Banner status="warning"` / `Badge variant="warning"`
tone instead of raw Tailwind amber.

## Affected files (14)

- `apps/web/client/src/pages/VideoStudioListPage.tsx`
- `apps/web/client/src/pages/VideoStudioWorkspacePage.tsx`
- `apps/web/client/src/components/videoStudio/CatalogCreateDialog.tsx`
- `apps/web/client/src/components/videoStudio/MotionCreateDialog.tsx`
- `apps/web/client/src/components/videoStudio/StageRail.tsx`
- `apps/web/client/src/components/videoStudio/NotWiredJobCard.tsx`
- `apps/web/client/src/components/videoStudio/BriefPanel.tsx`
- `apps/web/client/src/components/videoStudio/CaptionsPanel.tsx`
- `apps/web/client/src/components/videoStudio/MotionPanel.tsx`
- `apps/web/client/src/components/videoStudio/NarrationPanel.tsx`
- `apps/web/client/src/components/videoStudio/QaPanel.tsx`
- `apps/web/client/src/components/videoStudio/RenderPanel.tsx`
- `apps/web/client/src/components/videoStudio/ScenesPanel.tsx`
- `apps/web/client/src/components/videoStudio/RemotionProjectPreview.tsx`

Test files that will very likely need updates to match Astryx's actual
rendered DOM/ARIA semantics (NOT behavior — same user-facing intent):
`apps/web/client/src/components/videoStudio/__tests__/CatalogCreateDialog.test.tsx`,
`apps/web/client/src/pages/__tests__/VideoStudioListPage.test.tsx`,
`apps/web/client/src/pages/__tests__/VideoStudioWorkspacePage.test.tsx`.

## Component mapping (shadcn → Astryx)

| shadcn/ui | Astryx | Notes |
|---|---|---|
| `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` | `@astryxdesign/core/Dialog` (`Dialog`, `DialogHeader`) composed with `Layout`/`LayoutContent`/`LayoutFooter` slots | **State model differs**: `isOpen`/`onOpenChange`, not `open`/`onOpenChange`. No compound Header/Content/Footer children of Dialog itself — composition via `Layout`'s `header`/`content`/`footer` slot props. `purpose="form"` for these use cases. |
| `Button` | `@astryxdesign/core/Button` | `variant`: `primary\|secondary\|ghost\|destructive` (default secondary — map "Create"/submit → `primary`, "Cancel" → `secondary`, destructive actions → `destructive`). `size`: `sm\|md\|lg`. Loading: `isLoading` prop instead of manual spinner+disabled. Link-as-button: `href="/video-studio/:id"` (wouter `Link` already wired app-wide via `LinkProvider`/`AstryxWouterLink` in `App.tsx` — no `asChild` needed). |
| `Button size="icon"` | `@astryxdesign/core/IconButton` | `icon` + required `label` (becomes `aria-label`). |
| `Card`/`CardHeader`/`CardTitle`/`CardContent` | `@astryxdesign/core/Card` (flat, no sub-parts) or `ClickableCard`/`SelectableCard` for interactive picker cards | Compose heading via `Heading`/`Text` children directly inside `Card`. |
| `Input` | `@astryxdesign/core/TextInput` | **Value-first onChange**: `onChange={(value, e) => ...}`, not event-first. Search input: `startIcon` prop instead of manually-positioned icon + padding. |
| `Label` | Handled by `TextInput`'s own `label` prop / `Field` for custom controls | No separate Label component needed for standard inputs. |
| `Badge` | `@astryxdesign/core/Badge` | `variant`: `neutral\|info\|success\|warning\|error\|blue\|cyan\|...`. `label` required prop (not children). |
| `Skeleton` | `@astryxdesign/core/Skeleton` | Already used successfully in `AppPage.tsx` — same import. |
| Hand-rolled empty/error state | `@astryxdesign/core/EmptyState` / `@astryxdesign/core/Banner` | `Banner status="warning"` replaces the hardcoded amber `NotWiredJobCard` notice and the unsaved-changes indicator styling. |
| `grid`/`flex` Tailwind layout | `@astryxdesign/core/Grid` / `Stack`/`HStack`/`VStack` where it clarifies responsive intent | `Grid columns={{minWidth: 240, max: N}}` for the product-picker grid (auto-responsive, replaces manual `grid-cols-1 sm:grid-cols-2`). Plain Tailwind `sm:`/`md:` breakpoints stay fine for simpler cases — don't force a Stack/Grid rewrite where Tailwind is already correct and clear. |
| `sonner` `toast.error()`/`toast.success()` | **Unchanged** | Sonner is a cross-cutting, app-wide concern (mounted once in `App.tsx`), not per-page component styling. Astryx has its own `useToast()` but introducing a second parallel toast system for one feature has no benefit and is explicitly out of scope. |

## Explicit exception note (required in code)

Since this deliberately violates `AppPage.tsx`'s documented "never import
Astryx directly outside this file" rule, every Video Studio file that now
imports from `@astryxdesign/core/*` directly must carry a short comment
explaining this is an intentional, user-directed exception — so a future
reader (or the docstring's original author) doesn't mistake it for an
accidental violation.

## Risk assessment

- **Behavioral drift risk (HIGH)**: Astryx `Dialog`'s controlled-state model,
  `Button`'s loading/href model, and `TextInput`'s value-first `onChange`
  are structurally different from Radix/shadcn's. A careless port can silently
  change behavior (e.g. dialog not closing on outside click if `purpose` is
  wrong, or a debounce/controlled-input bug from swapping event-first to
  value-first onChange handlers).
- **Test breakage risk (HIGH, expected)**: existing RTL tests query by role/
  label text assuming Radix Dialog ARIA semantics. Astryx's Dialog may render
  different roles/structure. Tests must be updated to match Astryx's real
  DOM while preserving the same user-facing assertion intent — not weakened
  or deleted to "make them pass."
- **Responsive risk (MEDIUM)**: `Grid`'s `columns={{minWidth, max}}` auto-fill
  behavior needs to be sanity-checked at narrow viewports (can't literally
  screen-test without browser tools in this environment — code review only).
- **Scope creep risk (LOW)**: strictly limit to the 14 files above. Do not
  touch `AppPage.tsx`, Vertical Drama pages, or any other feature.

## Status: COMPLETE (verified independently by the conductor, not just the implementing agents)

All 14 files migrated. Zero remaining `@/components/ui/*` (shadcn) imports across
the whole Video Studio surface (`RemotionProjectPreview.tsx` needed no changes —
it never used shadcn). `pnpm check`: 131 errors, exactly the pre-migration
baseline, 0 new. Full test sweep (7 files: videoStudio component tests +
`VideoStudioListPage.test.tsx` + `VideoStudioWorkspacePage.test.tsx` +
`Dashboard.test.tsx`): 45/45 pass. Responsive fixes applied as flagged:
`BriefPanel.tsx` (Grid auto-fit replacing 2→4 breakpoint jump), `QaPanel.tsx`
(2 spots) and `ScenesPanel.tsx` (1 spot) — bare `grid-cols-2` → `grid-cols-1
sm:grid-cols-2`. The 2 non-theme-aware hardcoded `amber-500` colors found
earlier this session are both gone (`Banner status="warning"` /
`Badge variant="warning"`).

**Known real behavior change (not a bug):** `CatalogCreateDialog`/
`MotionCreateDialog` use Astryx `Dialog purpose="form"`, which does not close
on backdrop click (only Escape / explicit Cancel / X). This differs from the
old Radix/shadcn Dialog's default outside-click-to-close. Kept intentionally —
prevents losing in-progress form state to a stray click, a common and
arguably better pattern for create/form dialogs.

**Not visually verified in a live browser** — code-reviewed and
test-verified only, per every wave's disclosure. The `Grid`/`ToggleButtonGroup`/
`NumberInput` responsive and interaction behavior was reasoned about from
Astryx's own source/type definitions, not screenshotted at real viewport
widths.

## Verification steps

1. `pnpm check` — must return to the same baseline error count as before this
   change started (131, per the last verified checkpoint on `main`).
2. Full existing Video Studio test suite (`VideoStudioListPage.test.tsx`,
   `VideoStudioWorkspacePage.test.tsx`, `components/videoStudio/__tests__/*`)
   must pass — updating assertions to match Astryx's real DOM is expected and
   fine; deleting or weakening assertions to force a pass is not.
3. Manual code-review pass (no live browser available in this environment) of
   every `Grid`/`Stack` responsive prop usage for narrow-viewport correctness.
4. Confirm every `data-testid` attribute used by tests is preserved on the
   new Astryx-based markup.
5. Explicit, honest status report: this was code-reviewed and test-verified
   only, not visually verified in a live browser — same disclosure pattern
   used for the prior UI-polish pass on this feature.
