import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true');
}

/**
 * Adds the missing focus policy to legacy editor overlays while they migrate
 * to the shared Radix dialog primitives: focus entry, Escape close, tab wrap,
 * and focus restoration to the element that opened the surface.
 */
export function useEditorFocusScope<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  restoreFocusRef?: RefObject<HTMLElement | null>,
): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusInitial = () => {
      const container = containerRef.current;
      if (!container) return;
      const firstFocusable = getFocusableElements(container)[0];
      (firstFocusable ?? container).focus();
    };
    const focusTimer = window.setTimeout(focusInitial, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;
      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      window.setTimeout(() => (restoreFocusRef?.current ?? openerRef.current)?.focus(), 0);
    };
  }, [open, restoreFocusRef]);

  return containerRef;
}
