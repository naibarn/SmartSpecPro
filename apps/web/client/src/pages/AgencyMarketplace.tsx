import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Bot,
  Search,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Plus,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgencyMarketplaceCard } from "@/components/agency/AgencyMarketplaceCard";
import { AgencyMarketplaceDrawer } from "@/components/agency/AgencyMarketplaceDrawer";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

const PAGE_SIZE = 24;

export default function AgencyMarketplace() {
  const { t } = useScopedTranslation("agency");
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  const itemsQuery = trpc.agency.listMarketplace.useQuery({
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const items = itemsQuery.data?.items ?? [];
  const total = itemsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-28 pb-14 overflow-hidden">
        {/* Decorative background orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            {/* Badge */}
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 text-purple-600 text-sm font-medium mb-5">
              <Bot className="w-4 h-4" />
              {t("marketplace.title")}
            </span>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 leading-tight">
              Multi-Agent{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-500 bg-clip-text text-transparent">
                Teams
              </span>
            </h1>

            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Browse public AI agent teams created by the community.
              Clone any agency and customize it for your use case.
            </p>

            {/* Search */}
            <div className="relative max-w-lg mx-auto mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder={t("marketplace.searchPlaceholder")}
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
                to clone and use any agency.
              </p>
            )}

            {/* CTA for auth users */}
            {isAuthenticated && (
              <Button
                onClick={() => setLocation("/agencies")}
                className="bg-gradient-to-r from-purple-600 to-indigo-500 hover:from-purple-700 hover:to-indigo-600 text-white shadow-lg shadow-purple-500/25"
              >
                <Plus className="mr-2 h-4 w-4" />
                Build Your Own Agency
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </motion.div>
        </div>
      </section>

      {/* Grid Section */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Results count */}
          {!itemsQuery.isLoading && items.length > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-muted-foreground mb-6"
            >
              {total} agenc{total !== 1 ? "ies" : "y"}
              {debouncedSearch && ` matching "${debouncedSearch}"`}
            </motion.p>
          )}

          {/* Loading skeleton */}
          {itemsQuery.isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-48 rounded-xl bg-muted animate-pulse"
                />
              ))}
            </div>
          )}

          {/* Error state */}
          {itemsQuery.isError && (
            <div className="text-center py-20">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
              <p className="text-lg font-medium mb-2">
                Could not load agencies.
              </p>
              <p className="text-muted-foreground mb-6">
                Please check your connection and try again.
              </p>
              <Button onClick={() => itemsQuery.refetch()}>
                Try Again
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!itemsQuery.isLoading &&
            !itemsQuery.isError &&
            items.length === 0 && (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-8 w-8 text-purple-500" />
                </div>
                <p className="text-lg font-medium mb-2">{t("marketplace.empty")}</p>
                <p className="text-muted-foreground mb-6">
                  {debouncedSearch
                    ? "Try adjusting your search."
                    : "Be the first to publish a public agency!"}
                </p>
                {debouncedSearch && (
                  <Button
                    variant="outline"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear Search
                  </Button>
                )}
              </div>
            )}

          {/* Card grid */}
          {!itemsQuery.isLoading &&
            !itemsQuery.isError &&
            items.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
              >
                {items.map((agency: any) => (
                  <AgencyMarketplaceCard
                    key={agency.id}
                    agency={agency}
                    onSelect={setSelectedAgencyId}
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
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-500" />
              <div className="relative px-8 py-12 sm:px-16 text-center text-white">
                <Bot className="w-12 h-12 mx-auto mb-4 opacity-80" />
                <h2 className="text-2xl sm:text-3xl font-bold mb-3">
                  Build Your AI Agent Team
                </h2>
                <p className="text-lg opacity-90 mb-6 max-w-xl mx-auto">
                  {t("marketplace.signUpFreeDesc")}
                  and run multi-agent workflows.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    size="lg"
                    className="bg-white text-purple-600 hover:bg-white/90 shadow-xl"
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
      <AgencyMarketplaceDrawer
        open={selectedAgencyId !== null}
        agencyId={selectedAgencyId}
        onClose={() => setSelectedAgencyId(null)}
      />
    </div>
  );
}
