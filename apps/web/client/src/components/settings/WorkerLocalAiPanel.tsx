import { useMemo } from "react";

import { trpc } from "@/lib/trpc";
import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

export function WorkerLocalAiPanel() {
  const { t } = useScopedTranslation("settings");
  const query = trpc.llmProviders.workerLocalModels.useQuery({ task: "chat" }, {
    staleTime: 30_000,
    retry: false,
  });
  const models = useMemo(() => query.data ?? [], [query.data]);

  return (
    <DashboardCard className="rounded-2xl border border-white/50 bg-white/70 shadow-lg shadow-blue-500/5 backdrop-blur-xl" bodyClassName="p-6">
      <DashboardSectionHeader
        title={t("settings.workers.localAi.title", "Worker Local AI")}
        description={t("settings.workers.localAi.description", "Models published by your connected Worker Apps. Configure providers and credentials in the Worker App; sharing stays controlled by the Worker owner.")}
      />
      <div className="mt-4 space-y-3">
        {query.isLoading && <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>}
        {!query.isLoading && models.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("settings.workers.localAi.empty", "No Worker Local AI models are available yet.")}</p>
        )}
        {models.map((model) => (
          <div key={model.modelRef} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/60 p-3">
            <div>
              <p className="font-medium">{model.name}</p>
              <p className="text-xs text-muted-foreground">{model.providerDisplayName} · {model.workerStatus}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Worker</Badge>
              <Badge variant={model.selectable ? "default" : "secondary"}>
                {model.selectable ? t("settings.workers.localAi.ready", "Ready") : t("settings.workers.localAi.unavailable", "Unavailable")}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}
