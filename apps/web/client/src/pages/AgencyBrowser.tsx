import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyList } from "@/hooks/useAgencyQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Plus,
  Search,
  Loader2,
  MessageSquare,
  Edit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgencyTemplateModal } from "@/components/agency/AgencyTemplateModal";

interface AgencyItem {
  id: string;
  name: string;
  description?: string;
  status?: string;
  agentCount?: number;
  creditMultiplier?: number;
  creatorFeeCredits?: number;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  published: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  archived: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

export default function AgencyBrowser() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  // Feature flag is enforced server-side: agency.list throws NOT_FOUND
  // when AGENCY_SWARM_ENABLED is false
  const { data: agencies, isLoading, isError } = useAgencyList();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Redirect to dashboard if agency feature is disabled
  useEffect(() => {
    if (!isLoading && isError) {
      setLocation("/dashboard");
    }
  }, [isLoading, isError, setLocation]);

  if (authLoading || isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const agencyList = (agencies as unknown as { agencies: AgencyItem[] } | undefined)?.agencies ?? [];
  const filtered = agencyList.filter(
    (a) =>
      !search ||
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.description?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <AgencyTemplateModal open={isModalOpen} onOpenChange={setIsModalOpen} />

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Agencies</h1>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Agency
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agencies..."
          className="pl-9"
        />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <Users className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-lg font-medium text-slate-600">No agencies found</p>
          <p className="text-sm mt-1 text-slate-500">
            {search
              ? "Try adjusting your search terms."
              : "Create your first agency team to get started."}
          </p>
          {!search && (
            <Button className="mt-6" variant="outline" onClick={() => setIsModalOpen(true)}>
              Browse Templates
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agency) => (
            <div
              key={agency.id}
              className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-indigo-300 hover:shadow-md hover:-translate-y-1"
              onClick={() => setLocation(`/agencies/${agency.id}`)}
            >
              <div className="mb-3 flex items-start justify-between">
                <h3 className="font-semibold text-slate-800 text-lg leading-tight">{agency.name}</h3>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] uppercase tracking-wider font-bold",
                    STATUS_STYLES[agency.status || ""] || "",
                  )}
                >
                  {agency.status || "draft"}
                </Badge>
              </div>

              {agency.description && (
                <p className="mb-4 line-clamp-2 text-sm text-slate-600 leading-relaxed">
                  {agency.description}
                </p>
              )}

              <div className="flex items-center justify-between mt-auto">
                <div className="flex items-center gap-3 text-xs font-medium text-slate-500 bg-slate-50 px-2 py-1.5 rounded-md">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {agency.agentCount ?? 0} agents
                  </span>
                </div>

                <div className="flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocation(`/agencies/${agency.id}/edit`);
                    }}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
