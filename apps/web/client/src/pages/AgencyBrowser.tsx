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

interface AgencyItem {
  id: string;
  name: string;
  description?: string;
  status?: string;
  agentCount?: number;
  creditMultiplier?: number;
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

  const filtered = ((agencies as AgencyItem[] | undefined) || []).filter(
    (a) =>
      !search ||
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.description?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Agencies</h1>
        </div>
        <Button onClick={() => setLocation("/agencies/new/edit")}>
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
        <div className="py-16 text-center text-muted-foreground">
          <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
          <p className="text-lg font-medium">No agencies found</p>
          <p className="text-sm">
            {search
              ? "Try a different search term."
              : "Create your first agency to get started."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agency) => (
            <div
              key={agency.id}
              className="group cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/50"
              onClick={() => setLocation(`/agencies/${agency.id}`)}
            >
              <div className="mb-2 flex items-start justify-between">
                <h3 className="font-semibold">{agency.name}</h3>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-xs",
                    STATUS_STYLES[agency.status || ""] || "",
                  )}
                >
                  {agency.status || "draft"}
                </Badge>
              </div>

              {agency.description && (
                <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                  {agency.description}
                </p>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {agency.agentCount ?? 0} agents
                  </span>
                  {(agency.creditMultiplier ?? 1) > 1 && (
                    <span className="text-amber-500">
                      {agency.creditMultiplier}x credits
                    </span>
                  )}
                </div>

                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocation(`/agencies/${agency.id}`);
                    }}
                  >
                    <MessageSquare className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocation(`/agencies/${agency.id}/edit`);
                    }}
                  >
                    <Edit className="h-3 w-3" />
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
