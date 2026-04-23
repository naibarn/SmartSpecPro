import { useState } from "react";
import { Database, Loader2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

export function PropertyCatalogPanel() {
  const [query, setQuery] = useState("");

  const propertyCatalogQuery = trpc.library.listPropertyCatalog.useQuery(
    {
      query: query.trim() || undefined,
    },
    {
      refetchOnWindowFocus: false,
    },
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Property Catalog
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Explore the frontmatter-style fields already used across markdown
              knowledge.
            </p>
          </div>
          <div className="relative min-w-[260px] flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter properties..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(propertyCatalogQuery.data?.properties ?? []).map((property) => (
          <div
            key={property.key}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {property.key}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Used in {property.usageCount} note(s)
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 rounded-full">
                {property.inferredType}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      {propertyCatalogQuery.isLoading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading property catalog...
        </div>
      ) : null}

      {!propertyCatalogQuery.isLoading
      && (propertyCatalogQuery.data?.properties ?? []).length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
          <Database className="h-4 w-4" />
          No matching properties were found for this tenant.
        </div>
      ) : null}
    </div>
  );
}

export default PropertyCatalogPanel;
