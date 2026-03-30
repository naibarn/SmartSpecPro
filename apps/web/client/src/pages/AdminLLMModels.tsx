import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Cpu, Layers, ToggleLeft } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { MultiProviderAdmin } from "@/components/admin/MultiProviderAdmin";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";

export default function AdminLLMModels() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/");
    }
  }, [authLoading, setLocation, user]);

  const { data: mappings } = trpc.multiProvider.listModelMappings.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });
  const { data: catalogRows, isLoading } = trpc.multiProvider.listAdminModelCatalog.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const summary = useMemo(() => {
    const groups = Object.values(mappings ?? {});
    const mappedRows = groups.flat();
    const catalogCount = catalogRows?.length ?? 0;

    return {
      modelGroups: groups.length,
      mappings: catalogCount,
      enabled: mappedRows.filter((row) => row.isEnabled).length,
    };
  }, [catalogRows, mappings]);

  if (authLoading || !user || user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 px-4 py-8 sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation("/admin/llm-providers")}
        className="mb-4 text-gray-600"
      >
        <ChevronLeft className="mr-1 h-5 w-5" />
        Back to LLM Providers
      </Button>

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Cpu className="h-8 w-8" />
            LLM Model Configuration
          </h1>
          <p className="mt-2 text-muted-foreground">
            The default view shows all LLM models in a single list so you can enable or disable them quickly, with separate group controls available for bulk management.
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/admin/llm-providers")}>
          Manage Providers
        </Button>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <DashboardKpiCard
          icon={Layers}
          label="Unique Models"
          value={summary.modelGroups}
        />
        <DashboardKpiCard
          icon={Cpu}
          label="Manageable Models"
          value={summary.mappings}
        />
        <DashboardKpiCard
          icon={ToggleLeft}
          label="Enabled Mappings"
          value={summary.enabled}
          valueClassName="text-green-600"
          iconContainerClassName="bg-green-50 text-green-600 ring-green-100"
          iconClassName="text-green-600"
        />
      </div>

      <DashboardCard
        title="Model Availability"
        description="Start with the full model list, then switch to group controls when you need to enable or disable entire sets at once."
      >
        {isLoading ? (
          <div className="py-8 text-sm text-muted-foreground">Loading model mappings...</div>
        ) : (
          <MultiProviderAdmin tabs={["mappings"]} defaultTab="mappings" />
        )}
      </DashboardCard>
    </div>
  );
}
