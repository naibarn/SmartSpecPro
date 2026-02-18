# Section 10: Mobile Bottom Sheet

## Overview

Implement mobile-optimized form display using the vaul library for bottom sheet presentation.

## Files

- **Install:** `npm install vaul`
- **Create:** `apps/web/client/src/components/chat/skill/MobileSkillForm.tsx`
- **Create:** `apps/web/client/src/components/chat/skill/MobileSkillForm.test.tsx`
- **Modify:** `apps/web/client/src/components/chat/skill/ChatDynamicSkillForm.tsx`

## Vaul Library Setup

```typescript
// Install
npm install vaul

// Import
import { Drawer } from 'vaul';
```

## MobileSkillForm Component

```typescript
interface MobileSkillFormProps {
  open: boolean;
  onClose: () => void;
  skillName: string;
  children: React.ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  hasUnsavedChanges?: boolean;
}

export function MobileSkillForm({
  open,
  onClose,
  skillName,
  children,
  onSubmit,
  onCancel,
  isSubmitting,
  hasUnsavedChanges
}: MobileSkillFormProps) {
  const [snapPoint, setSnapPoint] = useState<number | string>(0.5);
  
  // Handle dismiss with unsaved changes check
  const handleDismiss = () => {
    if (hasUnsavedChanges) {
      // Show confirmation
      if (confirm('Discard unsaved changes?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };
  
  return (
    <Drawer.Root
      open={open}
      onOpenChange={handleDismiss}
      snapPoints={[0.5, 0.9]}
      activeSnapPoint={snapPoint}
      setActiveSnapPoint={setSnapPoint}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 bg-background rounded-t-xl max-h-[90vh]">
          {/* Drag Handle */}
          <div className="w-full flex justify-center pt-2 pb-4">
            <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
          </div>
          
          {/* Header */}
          <div className="px-4 pb-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-lg">{skillName}</h3>
            <button 
              onClick={handleDismiss}
              className="p-2 hover:bg-muted rounded-full"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Scrollable Content */}
          <div className="overflow-y-auto px-4 py-4" style={{ maxHeight: 'calc(90vh - 140px)' }}>
            {children}
          </div>
          
          {/* Sticky Footer */}
          <div className="border-t p-4 bg-background flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={onSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Execute
            </Button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

## Responsive Integration

```typescript
// In ChatDynamicSkillForm or ChatView
import { useMediaQuery } from '@/hooks/useMediaQuery';

export function ResponsiveSkillForm(props: SkillFormProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  if (isMobile) {
    return (
      <MobileSkillForm
        open={props.isOpen}
        onClose={props.onClose}
        skillName={props.skillName}
        onSubmit={props.onSubmit}
        onCancel={props.onCancel}
        isSubmitting={props.isSubmitting}
        hasUnsavedChanges={props.hasUnsavedChanges}
      >
        <ChatDynamicSkillForm
          schema={props.schema}
          values={props.values}
          onChange={props.onChange}
        />
      </MobileSkillForm>
    );
  }
  
  // Desktop inline form
  return (
    <div className="mb-4">
      <Card>
        {/* Desktop form layout */}
      </Card>
    </div>
  );
}
```

## Unsaved Changes Detection

```typescript
function useUnsavedChanges(
  values: Record<string, any>,
  initialValues: Record<string, any>
): boolean {
  return useMemo(() => {
    return JSON.stringify(values) !== JSON.stringify(initialValues);
  }, [values, initialValues]);
}

// Usage
const hasUnsavedChanges = useUnsavedChanges(
  skillFormState.values,
  defaultValues
);
```

## Navigation Confirmation

```typescript
// In ChatView
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [hasUnsavedChanges]);

// Or for React Router
useEffect(() => {
  if (!hasUnsavedChanges) return;
  
  const unblock = history.block((location) => {
    if (confirm('Discard unsaved changes?')) {
      unblock();
      return true;
    }
    return false;
  });
  
  return unblock;
}, [hasUnsavedChanges, history]);
```

## Testing

```typescript
describe('MobileSkillForm', () => {
  it('renders as drawer on mobile', () => {
    // Mock mobile viewport
    // Render component
    // Expect Drawer components
  });

  it('has drag handle', () => {
    // Render
    // Expect drag handle visible
  });

  it('snaps to points', async () => {
    // Render
    // Drag up
    // Expect snap to 0.9
  });

  it('shows confirmation on dismiss with unsaved changes', () => {
    // Render with hasUnsavedChanges=true
    // Try to dismiss
    // Expect confirmation dialog
  });

  it('dismisses without confirmation when no changes', () => {
    // Render with hasUnsavedChanges=false
    // Try to dismiss
    // Expect onClose called immediately
  });

  it('sticky header and footer visible', () => {
    // Render
    // Scroll content
    // Expect header/footer still visible
  });
});
```

## Accessibility

```typescript
// ARIA attributes
<Drawer.Content
  role="dialog"
  aria-modal="true"
  aria-labelledby="skill-form-title"
>
  <h3 id="skill-form-title">{skillName}</h3>
</Drawer.Content>

// Focus management
useEffect(() => {
  if (open) {
    // Focus first input
    const firstInput = contentRef.current?.querySelector('input, select, textarea');
    (firstInput as HTMLElement)?.focus();
  }
}, [open]);

// Escape key handling
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      handleDismiss();
    }
  };
  
  document.addEventListener('keydown', handleEscape);
  return () => document.removeEventListener('keydown', handleEscape);
}, [open]);
```

## Styling

```css
/* Mobile-specific form adjustments */
@media (max-width: 768px) {
  .chat-dynamic-form {
    @apply p-0;
  }
  
  .chat-dynamic-form .form-section {
    @apply mb-6;
  }
  
  .chat-dynamic-form input,
  .chat-dynamic-form select,
  .chat-dynamic-form textarea {
    @apply text-base; /* Prevent zoom on iOS */
  }
}
```

## Acceptance Criteria

- [ ] Uses vaul library for mobile bottom sheet
- [ ] Drag handle visible and functional
- [ ] Snap points at 50% and 90%
- [ ] Sticky header with title and close button
- [ ] Sticky footer with Cancel/Execute buttons
- [ ] Scrollable content area
- [ ] Confirmation on dismiss with unsaved changes
- [ ] Backdrop tap dismisses
- [ ] Focus management on open
- [ ] Escape key dismisses
- [ ] iOS zoom prevention (text-base)

## Dependencies

- vaul library
- Section 3: ChatDynamicSkillForm (form content)
- useMediaQuery hook
