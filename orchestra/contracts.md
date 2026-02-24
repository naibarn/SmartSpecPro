# Orchestra Contracts

## Wave 1 — Single-Agent (No Parallel Contract Required)

Only one agent (ssp-frontend) runs in Wave 1. No inter-agent contract needed.
The following internal component contracts are defined for consistency:

---

### MobileDrawerPanel Props Contract
```typescript
interface MobileDrawerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  slidesPanel: ReactNode;
  onAddElement: (type: PresentationElementType) => void;
  snapLockEnabled: boolean;
  onToggleSnapLock: () => void;
}
```

### MobileBottomSheet Updated Contract
```typescript
// Internal state added — no new props needed:
// isExpanded: boolean (default false — collapsed on mount)
// Swipe-up gesture: pointer events on drag handle
// Tab click: if collapsed → expand + switch tab
//             if expanded + same tab → collapse
//             if expanded + different tab → just switch tab
```

### Ownership Boundaries
| File | Owner |
|------|-------|
| `apps/web/client/src/presentation-canvas/components/MobileDrawerPanel.tsx` | ssp-frontend (NEW) |
| `apps/web/client/src/presentation-canvas/components/MobileBottomSheet.tsx` | ssp-frontend |
| `apps/web/client/src/presentation-canvas/components/MobileQuickActions.tsx` | ssp-frontend (review only) |
| `apps/web/client/src/presentation-canvas/CanvasShell.tsx` | ssp-frontend (minor review) |
| `apps/web/client/src/pages/PresentationEditor.tsx` | ssp-frontend |
| `apps/web/client/src/presentation-canvas/index.ts` | ssp-frontend |

### Desktop Layout — Hard Constraint
The `if (useStudioLayout)` branch in CanvasShell.tsx MUST NOT be modified.
Desktop layout is defined as: window.innerWidth >= 1024 (isMobileViewport = false).
