import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { LayoutGrid, ArrowLeft, Plus, Search, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GalleryCategories } from "@/components/workflow/GalleryCategories";
import { GalleryTemplateCard } from "@/components/workflow/GalleryTemplateCard";
import { GalleryDetailDrawer } from "@/components/workflow/GalleryDetailDrawer";

const PAGE_SIZE = 24;

export default function WorkflowGallery() {
  const [, setLocation] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    null
  );

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [selectedCategory, debouncedSearch]);

  const templatesQuery = trpc.workflow.listTemplates.useQuery({
    category: selectedCategory ?? undefined,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const categoriesQuery = trpc.workflow.listTemplateCategories.useQuery();

  const items = templatesQuery.data?.items ?? [];
  const total = templatesQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const totalCount =
    categoriesQuery.data?.reduce(
      (sum, c) => sum + (c.templateCount ?? 0),
      0
    ) ?? 0;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 backdrop-blur px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/workflows")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <LayoutGrid className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Workflow Gallery</h1>
        </div>
        <Button size="sm" onClick={() => setLocation("/workflows/editor")}>
          <Plus className="h-4 w-4 mr-1" />
          New Workflow
        </Button>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r p-4 overflow-y-auto hidden md:block">
          <GalleryCategories
            categories={categoriesQuery.data ?? []}
            totalCount={totalCount}
            selectedCategory={selectedCategory}
            onSelect={setSelectedCategory}
            isLoading={categoriesQuery.isLoading}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">
          {/* Search */}
          <div className="relative mb-6 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Loading state */}
          {templatesQuery.isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <div
                  key={i}
                  className="h-48 rounded-lg bg-muted animate-pulse"
                />
              ))}
            </div>
          )}

          {/* Error state */}
          {templatesQuery.isError && (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
              <p className="text-lg font-medium">
                Could not load templates. Please try again.
              </p>
              <Button
                onClick={() => templatesQuery.refetch()}
                className="mt-4"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!templatesQuery.isLoading &&
            !templatesQuery.isError &&
            items.length === 0 && (
              <div className="text-center py-12">
                <p className="text-lg font-medium">
                  No templates found matching your filters.
                </p>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelectedCategory(null);
                    setSearchQuery("");
                  }}
                  className="mt-4"
                >
                  Clear Filters
                </Button>
              </div>
            )}

          {/* Template grid */}
          {!templatesQuery.isLoading &&
            !templatesQuery.isError &&
            items.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {items.map((t: any) => (
                    <GalleryTemplateCard
                      key={t.id}
                      template={t}
                      onSelect={setSelectedTemplateId}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
        </main>
      </div>

      {/* Detail Drawer */}
      <GalleryDetailDrawer
        open={selectedTemplateId !== null}
        templateId={selectedTemplateId}
        onClose={() => setSelectedTemplateId(null)}
      />
    </div>
  );
}
