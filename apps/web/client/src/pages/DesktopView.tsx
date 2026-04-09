import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";

import { resolveDesktopViewHref } from "@/features/desktop-host/labels";

function getSearchParam(search: string, key: string): string | null {
  const value = new URLSearchParams(search).get(key);
  return value && value.trim().length > 0 ? value : null;
}

export default function DesktopView() {
  const search = useSearch();
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate(resolveDesktopViewHref({
      runId: getSearchParam(search, "runId"),
      projectId: getSearchParam(search, "projectId"),
      skillId: getSearchParam(search, "skillId"),
      agencyId: getSearchParam(search, "agencyId"),
    }));
  }, [navigate, search]);

  return null;
}
