import { useState, useEffect } from "react";

interface TenantPageData {
  id: number;
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
    buttons?: Array<{ text: string; link: string; style?: string }>;
    items?: Array<any>;
  }>;
  metadata?: {
    description?: string;
    keywords?: string[];
  };
  isPublished: boolean;
}

const cache: Record<string, { data: TenantPageData | null; timestamp: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function clearTenantPageCache(pageKey?: string) {
  if (pageKey) {
    delete cache[pageKey];
  } else {
    Object.keys(cache).forEach(key => delete cache[key]);
  }
}

export function useTenantPage(pageKey: string) {
  const [page, setPage] = useState<TenantPageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const cached = cache[pageKey];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setPage(cached.data);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch(`/api/tenant/public-pages/${pageKey}`, { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        cache[pageKey] = { data, timestamp: Date.now() };
        setPage(data);
      })
      .catch(() => {
        cache[pageKey] = { data: null, timestamp: Date.now() };
        setPage(null);
      })
      .finally(() => setIsLoading(false));
  }, [pageKey]);

  return { page, isLoading };
}
