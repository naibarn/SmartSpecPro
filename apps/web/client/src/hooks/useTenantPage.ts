import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";

export interface TenantPageData {
  id: number;
  tenantId: string | null;
  pageKey: string;
  title: string;
  slug: string;
  content?: string;
  sections?: Array<{
    id: string;
    type: string;
    title?: string;
    subtitle?: string;
    content?: string;
    image?: string;
    settings?: Record<string, unknown>;
    buttons?: Array<{ text: string; link: string; style?: string }>;
    items?: Array<any>;
  }>;
  metadata?: {
    description?: string;
    keywords?: string[];
    author?: string;
    ogImage?: string;
    customMeta?: Record<string, string>;
  };
  isPublished: boolean;
}

const cache = new Map<
  string,
  { data: TenantPageData | null; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function isSmartAIHubPublicHost(host: string): boolean {
  const normalizedHost = host
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  return normalizedHost === "smartaihub.app";
}

export function getTenantPageCacheKey(
  tenantId: string | null | undefined,
  host: string,
  pageKey: string
): string {
  return `${tenantId || "unknown"}@${host.toLowerCase()}:${pageKey}`;
}

export function clearTenantPageCache(pageKey?: string) {
  if (pageKey) {
    for (const key of cache.keys()) {
      if (key.endsWith(`:${pageKey}`)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}

export function useTenantPage(pageKey: string) {
  const { tenant } = useTenant();
  const requestHost =
    typeof window !== "undefined" ? window.location.host.toLowerCase() : "server";
  const cacheKey = getTenantPageCacheKey(tenant?.id, requestHost, pageKey);
  const [state, setState] = useState<{
    cacheKey: string;
    page: TenantPageData | null;
    isLoading: boolean;
  }>({ cacheKey, page: null, isLoading: true });

  useEffect(() => {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setState({ cacheKey, page: cached.data, isLoading: false });
      return;
    }

    const controller = new AbortController();
    setState({ cacheKey, page: null, isLoading: true });
    fetch(`/api/tenant/public-pages/${encodeURIComponent(pageKey)}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(res => {
        if (res.ok) return res.json();
        return null;
      })
      .then(data => {
        if (controller.signal.aborted) return;
        const tenantPage =
          data &&
          tenant?.id &&
          data.pageKey === pageKey &&
          data.isPublished === true &&
          (data.tenantId === tenant.id ||
            (data.tenantId === null &&
              pageKey === "home" &&
              typeof window !== "undefined" &&
              isSmartAIHubPublicHost(window.location.host)))
            ? data
            : null;
        if (tenantPage)
          cache.set(cacheKey, { data: tenantPage, timestamp: Date.now() });
        setState({ cacheKey, page: tenantPage, isLoading: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          cache.set(cacheKey, { data: null, timestamp: Date.now() });
          setState({ cacheKey, page: null, isLoading: false });
        }
      });

    return () => controller.abort();
  }, [cacheKey, pageKey]);

  return {
    page: tenant && state.cacheKey === cacheKey ? state.page : null,
    isLoading: state.cacheKey !== cacheKey || state.isLoading,
  };
}
