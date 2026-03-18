import { useState, useMemo, useCallback } from "react";
import Fuse from "fuse.js";
import { trpc } from "@/lib/trpc";

export interface HelpSearchItem {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  tags: string[];
}

export function useHelpSearch(locale: string) {
  const [query, setQuery] = useState("");

  const { data: searchIndex } = trpc.help.getSearchIndex.useQuery(
    { locale: locale as "en" | "th" },
    { staleTime: 5 * 60 * 1000 },
  );

  const fuse = useMemo(() => {
    if (!searchIndex?.length) return null;
    return new Fuse(searchIndex, {
      keys: [
        { name: "title", weight: 0.4 },
        { name: "description", weight: 0.3 },
        { name: "tags", weight: 0.2 },
        { name: "excerpt", weight: 0.1 },
      ],
      threshold: 0.4,
      includeScore: true,
    });
  }, [searchIndex]);

  const results = useMemo(() => {
    if (!query.trim() || !fuse) return [];
    return fuse.search(query).map((r) => r.item);
  }, [query, fuse]);

  const search = useCallback((q: string) => setQuery(q), []);

  return { query, search, results, isReady: !!fuse };
}
