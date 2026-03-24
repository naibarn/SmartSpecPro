import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import i18next from "i18next";
import { getRouteNamespaces } from "./namespaces";
import { loadNamespace } from "./loader";

/**
 * Hook that preloads i18next namespaces when the route changes.
 * Runs in parallel with React.lazy chunk loading for the same route.
 * Fire-and-forget — rendering suspension is handled by react-i18next + Suspense.
 */
export function useNamespacePreloader(): void {
  const [pathname] = useLocation();
  const prevRef = useRef<string>("");

  useEffect(() => {
    if (pathname === prevRef.current) return;
    prevRef.current = pathname;

    const namespaces = getRouteNamespaces(pathname);
    if (!namespaces) return;

    // Load for the current language
    i18next.loadNamespaces([...namespaces]);

    // Preload English fallback to avoid flash of key strings when
    // the current language has incomplete translations.
    if (i18next.language !== "en") {
      namespaces.forEach((ns) => {
        loadNamespace("en", ns);
      });
    }
  }, [pathname]);
}
