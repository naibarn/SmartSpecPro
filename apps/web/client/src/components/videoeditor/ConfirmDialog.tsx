/**
 * Accessible confirmation dialog for editor destructive or state-changing actions.
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
  showUndoHint?: boolean;
  isPending?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'warning',
  showUndoHint = false,
  isPending = false,
}) => {
  const confirmClass = type === 'danger'
    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
    : type === 'info'
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : 'bg-amber-500 text-black hover:bg-amber-400';

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isPending) onCancel(); }}>
      <DialogContent
        className="max-h-[90dvh] max-w-[min(450px,calc(100vw-2rem))] overflow-y-auto"
        onEscapeKeyDown={(event) => { if (isPending) event.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span aria-hidden="true">{type === 'info' ? 'ℹ️' : '⚠️'}</span>
            {title}
          </DialogTitle>
          <DialogDescription className="leading-6">{message}</DialogDescription>
        </DialogHeader>

        {showUndoHint ? (
          <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-muted-foreground">
            💡 You can undo this action with Ctrl+Z
          </div>
        ) : null}

        <DialogFooter>
          <button
            type="button"
            className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onCancel}
            disabled={isPending}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`min-h-11 rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${confirmClass}`}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'กำลังดำเนินการ...' : confirmText}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmDialog;
