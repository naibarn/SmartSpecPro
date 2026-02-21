import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  LayoutGrid,
  Plus,
  Search,
  AlertCircle,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GalleryTemplateCard } from "@/components/workflow/GalleryTemplateCard";
import { GalleryDetailDrawer } from "@/components/workflow/GalleryDetailDrawer";

const PAGE_SIZE = 24;

export default function WorkflowGallery() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const requireAuth = (path: string) => {
    if (!isAuthenticated) {
      setLocation(`/login?redirect=${encodeURIComponent(path)}`);
      return;
    }
    setLocation(path);
  };

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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
  const categories = (categoriesQuery.data ?? []) as Array<{
    id: number;
    name: string;
    templateCount?: number;
  }>;
  const grandTotal = categories.reduce((s, c) => s + (c.templateCount ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-28 pb-14 overflow-hidden">
        {/* Decorative background orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            {/* Badge */}
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-5">
              <LayoutGrid className="w-4 h-4" />
              Workflow Gallery
            </span>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 leading-tight">
              Ready-to-Use{" "}
              <span className="gradient-text">AI Workflows</span>
            </h1>

            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Browse 60+ curated automation templates across 15 categories.
              From content generation to data pipelines — pick a template and
              launch in minutes.
            </p>

            {/* Search */}
            <div className="relative max-w-lg mx-auto mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search workflow templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 rounded-xl text-base shadow-sm"
              />
            </div>

            {/* CTA for non-auth users */}
            {!isAuthenticated && (
              <p className="text-sm text-muted-foreground">
                <span
                  className="text-primary cursor-pointer hover:underline"
                  onClick={() => setLocation("/signup")}
                >
                  Sign up free
                </span>{" "}
                to use any template and build your own workflows.
              </p>
            )}

            {/* CTA for auth users */}
            {isAuthenticated && (
              <Button
                onClick={() => setLocation("/workflows/editor")}
                className="bg-gradient-to-r from-violet-500 to-teal-400 hover:from-violet-600 hover:to-teal-500 text-white shadow-lg shadow-violet-500/25"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create New Workflow
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </motion.div>
        </div>
      </section>

      {/* Sticky Category Filter Bar */}
      <section className="sticky top-16 lg:top-20 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {/* All categories button */}
            <Button
              size="sm"
              variant={selectedCategory === null ? "default" : "outline"}
              onClick={() => setSelectedCategory(null)}
              className="shrink-0 rounded-full"
            >
              All
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-background/20 text-xs tabular-nums">
                {grandTotal || total}
              </span>
            </Button>

            {/* Category buttons */}
            {categories.map((cat) => (
              <Button
                key={cat.name}
                size="sm"
                variant={selectedCategory === cat.name ? "default" : "outline"}
                onClick={() =>
                  setSelectedCategory(
                    selectedCategory === cat.name ? null : cat.name
                  )
                }
                className="shrink-0 rounded-full whitespace-nowrap"
              >
                {cat.name}
                {cat.templateCount != null && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-background/20 text-xs tabular-nums">
                    {cat.templateCount}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Template Grid */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Results count */}
          {!templatesQuery.isLoading && items.length > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-muted-foreground mb-6"
            >
              {selectedCategory
                ? `${total} template${total !== 1 ? "s" : ""} in "${selectedCategory}"`
                : `${total} templates`}
              {debouncedSearch && ` matching "${debouncedSearch}"`}
            </motion.p>
          )}

          {/* Loading skeleton */}
          {templatesQuery.isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="h-48 rounded-xl bg-muted animate-pulse"
                />
              ))}
            </div>
          )}

          {/* Error state */}
          {templatesQuery.isError && (
            <div className="text-center py-20">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
              <p className="text-lg font-medium mb-2">
                Could not load templates.
              </p>
              <p className="text-muted-foreground mb-6">
                Please check your connection and try again.
              </p>
              <Button onClick={() => templatesQuery.refetch()}>
                Try Again
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!templatesQuery.isLoading &&
            !templatesQuery.isError &&
            items.length === 0 && (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <p className="text-lg font-medium mb-2">No templates found</p>
                <p className="text-muted-foreground mb-6">
                  Try adjusting your search or filter.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedCategory(null);
                    setSearchQuery("");
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            )}

          {/* Template grid */}
          {!templatesQuery.isLoading &&
            !templatesQuery.isError &&
            items.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
              >
                {items.map((t: any) => (
                  <GalleryTemplateCard
                    key={t.id}
                    template={t}
                    onSelect={setSelectedTemplateId}
                  />
                ))}
              </motion.div>
            )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-10">
              <Button
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section — for non-authenticated visitors */}
      {!isAuthenticated && (
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="relative rounded-3xl overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-purple-600 to-teal-500" />
              <div className="relative px-8 py-12 sm:px-16 text-center text-white">
                <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-80" />
                <h2 className="text-2xl sm:text-3xl font-bold mb-3">
                  Start Building with Any Template
                </h2>
                <p className="text-lg opacity-90 mb-6 max-w-xl mx-auto">
                  Sign up free to use any workflow template, customize it to
                  your needs, and run it with your own AI connections.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    size="lg"
                    className="bg-white text-violet-600 hover:bg-white/90 shadow-xl"
                    onClick={() => setLocation("/signup")}
                  >
                    Get Started Free
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10"
                    onClick={() => setLocation("/login")}
                  >
                    Sign In
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      <Footer />

      {/* Detail Drawer */}
      <GalleryDetailDrawer
        open={selectedTemplateId !== null}
        templateId={selectedTemplateId}
        onClose={() => setSelectedTemplateId(null)}
      />
    </div>
  );
}
