import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Cpu, Layers, ToggleLeft } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { MultiProviderAdmin } from "@/components/admin/MultiProviderAdmin";
import { LocaleToggle } from "@/components/LocaleToggle";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

export default function AdminLLMModels() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useScopedTranslation("admin");

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
        <div className="text-sm text-muted-foreground">{t("admin.multiProvider.loading")}</div>
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
        {t("admin.llmModels.backToProviders")}
      </Button>

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Cpu className="h-8 w-8" />
            {t("admin.llmModels.title")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t("admin.llmModels.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LocaleToggle className="shrink-0" />
          <Button variant="outline" onClick={() => setLocation("/admin/llm-providers")}>
            {t("admin.llmModels.manageProviders")}
          </Button>
        </div>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <DashboardKpiCard
          icon={Layers}
          label={t("admin.llmModels.kpis.uniqueModels")}
          value={summary.modelGroups}
        />
        <DashboardKpiCard
          icon={Cpu}
          label={t("admin.llmModels.kpis.manageableModels")}
          value={summary.mappings}
        />
        <DashboardKpiCard
          icon={ToggleLeft}
          label={t("admin.llmModels.kpis.enabledMappings")}
          value={summary.enabled}
          valueClassName="text-green-600"
          iconContainerClassName="bg-green-50 text-green-600 ring-green-100"
          iconClassName="text-green-600"
        />
      </div>

      <DashboardCard
        title={t("admin.llmModels.card.title")}
        description={t("admin.llmModels.card.description")}
      >
        {isLoading ? (
          <div className="py-8 text-sm text-muted-foreground">{t("admin.llmModels.card.loading")}</div>
        ) : (
          <MultiProviderAdmin tabs={["mappings"]} defaultTab="mappings" />
        )}
      </DashboardCard>
    </div>
  );
}
