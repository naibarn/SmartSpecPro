/** Accessible keyboard shortcut reference for the active Web Editor. */

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutCategory {
  name: string;
  shortcuts: Shortcut[];
}

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  { name: 'Playback', shortcuts: [
    { keys: ['Space'], description: 'Play/Pause' },
    { keys: ['←'], description: 'Step backward (1 frame)' },
    { keys: ['→'], description: 'Step forward (1 frame)' },
    { keys: ['Home'], description: 'Go to start' },
    { keys: ['End'], description: 'Go to end' },
  ] },
  { name: 'Project', shortcuts: [
    { keys: ['Ctrl', 'S'], description: 'Save project' },
    { keys: ['Ctrl', 'N'], description: 'New project' },
  ] },
  { name: 'Editing', shortcuts: [
    { keys: ['Ctrl', 'Z'], description: 'Undo' },
    { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo' },
    { keys: ['Delete'], description: 'Delete selected clip(s)' },
    { keys: ['Ctrl', 'D'], description: 'Duplicate clip' },
    { keys: ['Ctrl', 'B'], description: 'Split clip at playhead' },
    { keys: ['Ctrl', 'C'], description: 'Copy clip' },
    { keys: ['Ctrl', 'V'], description: 'Paste clip' },
  ] },
  { name: 'Selection', shortcuts: [
    { keys: ['Ctrl', 'A'], description: 'Select all clips' },
    { keys: ['Esc'], description: 'Deselect all' },
    { keys: ['Shift', 'Click'], description: 'Add to selection' },
    { keys: ['Ctrl', 'Click'], description: 'Toggle selection' },
  ] },
  { name: 'View', shortcuts: [
    { keys: ['Ctrl', '+'], description: 'Zoom in timeline' },
    { keys: ['Ctrl', '-'], description: 'Zoom out timeline' },
    { keys: ['Ctrl', '0'], description: 'Reset zoom' },
    { keys: ['F'], description: 'Fit timeline to window' },
  ] },
  { name: 'Help', shortcuts: [
    { keys: ['?'], description: 'Toggle shortcuts help' },
    { keys: ['Esc'], description: 'Close dialogs/overlays' },
  ] },
];

export const KeyboardShortcutsOverlay: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '?' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        setIsVisible((visible) => !visible);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Dialog open={isVisible} onOpenChange={setIsVisible}>
      <DialogContent className="max-h-[90dvh] w-[min(900px,calc(100vw-2rem))] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">⌨️ Keyboard Shortcuts</DialogTitle>
          <DialogDescription>กด ? เพื่อเปิดรายการคำสั่ง และกด Esc เพื่อปิด</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {SHORTCUT_CATEGORIES.map((category) => (
            <section key={category.name} className="rounded-lg border border-border/70 bg-muted/30 p-4" aria-labelledby={`shortcut-${category.name}`}>
              <h3 id={`shortcut-${category.name}`} className="mb-3 text-sm font-semibold text-primary">{category.name}</h3>
              <div className="grid gap-2">
                {category.shortcuts.map((shortcut) => (
                  <div key={`${category.name}-${shortcut.description}`} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{shortcut.description}</span>
                    <span className="flex shrink-0 gap-1" aria-label={shortcut.keys.join(' + ')}>
                      {shortcut.keys.map((key) => <kbd key={key} className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">{key}</kbd>)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardShortcutsOverlay;
