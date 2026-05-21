import { ChevronLeft, FileText, Zap } from "lucide-react";
import { useLocation } from "wouter";

import { HelpButton } from "@/components/help";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { ContentComposerPanel } from "@/components/media/ContentComposerPanel";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

export default function ContentComposer() {
  const [, setLocation] = useLocation();
  const { t } = useScopedTranslation(["media", "common"]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/25 to-white">
      <header className="sticky top-0 z-10 border-b bg-white/75 backdrop-blur-xl">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t("back")}
              </Button>
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-bold">{t("contentComposer.title")}</h1>
                  <p className="truncate text-xs text-muted-foreground">{t("contentComposer.subtitle")}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <LocaleToggle className="hidden sm:inline-flex" />
              <HelpButton page="/content-composer" variant="ghost" size="sm" />
              <Badge variant="secondary" className="gap-1">
                <Zap className="h-3 w-3" />
                {t("contentComposer.badge")}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <DashboardCard
            className="overflow-hidden border-cyan-200/70 bg-gradient-to-br from-white via-white to-cyan-50/50 shadow-[0_18px_50px_rgba(14,165,233,0.08)]"
            bodyClassName="p-4"
          >
            <DashboardSectionHeader
              eyebrow={t("contentComposer.title")}
              title={t("contentComposer.subtitle")}
              description={t("contentComposer.description")}
            />
          </DashboardCard>

          <ContentComposerPanel />
        </div>
      </main>
    </div>
  );
}
