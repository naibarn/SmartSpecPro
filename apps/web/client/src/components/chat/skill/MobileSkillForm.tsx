import React, { useEffect, useCallback } from 'react';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { ChatDynamicSkillForm } from './ChatDynamicSkillForm';
import { SkillInputSchema } from '@/components/media/DynamicSkillForm';

interface MobileSkillFormProps {
  open: boolean;
  onClose: () => void;
  skillName: string;
  schema: SkillInputSchema;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  hasUnsavedChanges?: boolean;
  error?: string | null;
}

export function MobileSkillForm({
  open,
  onClose,
  skillName,
  schema,
  values,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  hasUnsavedChanges,
  error,
}: MobileSkillFormProps) {
  // Handle dismiss with unsaved changes check
  const handleDismiss = useCallback(() => {
    if (hasUnsavedChanges) {
      if (confirm('Discard unsaved changes?')) {
        onClose();
      }
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        handleDismiss();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, handleDismiss]);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleDismiss();
      }}
      snapPoints={[0.5, 0.9]}
      defaultSnapPoint={0.9}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 bg-background rounded-t-xl z-50 flex flex-col max-h-[95vh]">
          {/* Drag Handle */}
          <div className="w-full flex justify-center pt-2 pb-2 shrink-0">
            <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-4 pb-3 border-b flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-lg">{skillName}</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleDismiss}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
            <ChatDynamicSkillForm
              schema={schema}
              values={values}
              onChange={onChange}
              isLoading={isSubmitting}
              error={error}
            />
          </div>

          {/* Sticky Footer */}
          <div className="border-t p-4 bg-background shrink-0 flex gap-3">
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
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Executing...
                </>
              ) : (
                'Execute'
              )}
            </Button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export default MobileSkillForm;
