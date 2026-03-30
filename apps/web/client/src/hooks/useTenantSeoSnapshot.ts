import { useEffect, useState } from "react";

export type SeoRelatedLink = {
  href: string;
  label: string;
  description: string;
};

type TenantSeoSnapshot = {
  relatedLinks?: SeoRelatedLink[];
};

export function useTenantSeoSnapshot(path: string) {
  const [snapshot, setSnapshot] = useState<TenantSeoSnapshot>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/tenant/seo?path=${encodeURIComponent(path)}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSnapshot(data || {}))
      .catch(() => setSnapshot({}))
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [path]);

  return {
    relatedLinks: snapshot.relatedLinks || [],
    loading,
  };
}
