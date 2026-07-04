import * as React from "react";

/**
 * Single source of truth for viewport tiering, aligned with Tailwind's
 * default breakpoints (sm=640, md=768, lg=1024):
 *   - "mobile"  : < 768px
 *   - "tablet"  : 768px - 1023px
 *   - "desktop" : >= 1024px
 *
 * Introduced to stop the recurring class of bugs where "mobile" is defined
 * differently in different places (e.g. useMobile.tsx's 768px threshold vs.
 * PresentationEditor's local 1024px threshold), causing the 768-1023px
 * tablet range to be treated inconsistently as either mobile or desktop.
 *
 * Prefer this hook for any NEW responsive logic. Existing hooks/state that
 * already encode a specific threshold (e.g. useIsMobile() in useMobile.tsx)
 * are left unchanged to avoid behavior drift for their current callers.
 */

export type ViewportTier = "mobile" | "tablet" | "desktop";

const TABLET_BREAKPOINT = 768; // Tailwind `md`
const DESKTOP_BREAKPOINT = 1024; // Tailwind `lg`

function getViewportTier(width: number): ViewportTier {
  if (width < TABLET_BREAKPOINT) return "mobile";
  if (width < DESKTOP_BREAKPOINT) return "tablet";
  return "desktop";
}

/** SSR-safe default: assume desktop when `window` is unavailable. */
function getInitialTier(): ViewportTier {
  if (typeof window === "undefined") return "desktop";
  return getViewportTier(window.innerWidth);
}

export function useViewportTier(): ViewportTier {
  const [tier, setTier] = React.useState<ViewportTier>(getInitialTier);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const mqlTablet = window.matchMedia(
      `(min-width: ${TABLET_BREAKPOINT}px) and (max-width: ${DESKTOP_BREAKPOINT - 1}px)`,
    );
    const mqlMobile = window.matchMedia(
      `(max-width: ${TABLET_BREAKPOINT - 1}px)`,
    );

    const onChange = () => {
      setTier(getViewportTier(window.innerWidth));
    };

    mqlTablet.addEventListener("change", onChange);
    mqlMobile.addEventListener("change", onChange);
    onChange();

    return () => {
      mqlTablet.removeEventListener("change", onChange);
      mqlMobile.removeEventListener("change", onChange);
    };
  }, []);

  return tier;
}

export function useIsMobile(): boolean {
  return useViewportTier() === "mobile";
}

export function useIsTablet(): boolean {
  return useViewportTier() === "tablet";
}

export function useIsDesktop(): boolean {
  return useViewportTier() === "desktop";
}
