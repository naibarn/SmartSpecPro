# Orchestra Plan

## Task
Redesign Presentation Editor mobile/tablet layout so canvas fills maximum screen space, with a collapsible bottom sheet (swipe-up gesture) and a slide-in drawer panel for slides/tools — no impact on desktop layout.

## Task Classification
- Scope: medium
- Risk: low
- Affected domains: CMD-1 Frontend
- Estimated file count: 6
- Chosen route: multi-agent-waves
- Bug route: false
- Classification notes: All changes are frontend-only React/Tailwind UI. File count (~6) exceeds
  the small-scope ceiling of 3. Involves gesture handling (pointer events for swipe-up),
  new MobileDrawerPanel component, and significant rework of PresentationEditor mobile layout.
  No API, auth, DB, or backend changes — risk is low.

## Wave Plan

### Wave 1 — Frontend: Mobile Layout Redesign (ssp-frontend)

**Agent:** ssp-frontend
**Files owned:**
1. `apps/web/client/src/presentation-canvas/components/MobileBottomSheet.tsx`
   — Add collapsible state (collapsed by default), swipe-up pointer gesture, expand/collapse toggle
2. `apps/web/client/src/presentation-canvas/components/MobileQuickActions.tsx`
   — Already simplified (icons only); review and ensure it is minimal (mode toggle + nudge + delete)
3. `apps/web/client/src/presentation-canvas/components/MobileDrawerPanel.tsx` ← NEW
   — Left slide-in drawer: Slides panel + Add-element grid + Snap toggle; triggered by hamburger button
4. `apps/web/client/src/presentation-canvas/CanvasShell.tsx`
   — No structural changes needed (already flex h-full); may need to remove canvasFooter overlap
5. `apps/web/client/src/pages/PresentationEditor.tsx`
   — Simplify mobile canvasToolbar to just MobileQuickActions (no add-element grid)
   — Add hamburger (☰) button in header when isMobileViewport
   — Wire MobileDrawerPanel with open/close state
   — Remove add-element buttons from mobile canvasToolbar (they are in the drawer now)
6. `apps/web/client/src/presentation-canvas/index.ts`
   — Export MobileDrawerPanel

**Design contract:**
- MobileDrawerPanel: `{ isOpen: boolean; onClose: () => void; slidesPanel: ReactNode; onAddElement: (type) => void; snapLockEnabled: boolean; onToggleSnapLock: () => void }`
- MobileBottomSheet: adds `isCollapsed` internal state; tab click expands; drag handle toggles
- MobileQuickActions: unchanged from last session (already correct)
- Desktop layout (useStudioLayout=true path in CanvasShell): MUST NOT be modified

### Wave 2 — Quality Gate
- TypeScript check: `cd apps/web && pnpm check`
- Expected: 0 errors

## Route Status
route: multi-agent-waves
waves_completed: 0
agents_dispatched: []
quality_gates: pending
security_gate: skipped (low risk, UI only)
