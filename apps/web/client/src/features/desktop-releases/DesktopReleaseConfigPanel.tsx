import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DesktopReleaseConfigForm = {
  githubRepository: string;
  githubWorkflow: string;
  githubRef: string;
  webUrl: string;
  githubToken: string;
};

const EMPTY_FORM: DesktopReleaseConfigForm = {
  githubRepository: "",
  githubWorkflow: "desktop-release.yml",
  githubRef: "main",
  webUrl: "https://smartaihub.app",
  githubToken: "",
};

function sourceBadgeLabel(
  t: (key: string, values?: Record<string, string | number>) => string,
  source: "db" | "env" | "none" | undefined
) {
  if (source === "db")
    return t("dashboard:desktopReleases.admin.config.source.ui");
  if (source === "env")
    return t("dashboard:desktopReleases.admin.config.source.legacy");
  return t("dashboard:desktopReleases.admin.config.source.none");
}

function sourceBadgeClass(source: "db" | "env" | "none" | undefined) {
  if (source === "db")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (source === "env") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

export function DesktopReleaseConfigPanel(props: { enabled?: boolean }) {
  const { enabled = true } = props;
  const { t } = useScopedTranslation(["dashboard", "common"]);
  const [form, setForm] = useState<DesktopReleaseConfigForm>(EMPTY_FORM);
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGuideExpanded, setIsGuideExpanded] = useState(false);

  const {
    data: config,
    isLoading,
    refetch,
  } = trpc.systemSettings.getDesktopReleaseSettings.useQuery(undefined, {
    enabled,
  });

  const updateMutation =
    trpc.systemSettings.updateDesktopReleaseSettings.useMutation({
      onSuccess: result => {
        toast.success(t("dashboard:desktopReleases.admin.config.saveSuccess"));
        setForm(prev => ({
          ...prev,
          githubToken: "",
          githubRepository:
            result.settings.githubRepository || prev.githubRepository,
          githubWorkflow: result.settings.githubWorkflow || prev.githubWorkflow,
          githubRef: result.settings.githubRef || prev.githubRef,
          webUrl: result.settings.webUrl || prev.webUrl,
        }));
        void refetch();
      },
      onError: error => {
        toast.error(
          error.message ||
            t("dashboard:desktopReleases.admin.config.saveFailed")
        );
      },
    });

  useEffect(() => {
    if (!config) return;
    setForm({
      githubRepository: config.githubRepository || "",
      githubWorkflow: config.githubWorkflow || "desktop-release.yml",
      githubRef: config.githubRef || "main",
      webUrl: config.webUrl || "https://smartaihub.app",
      githubToken: "",
    });
  }, [config]);

  useEffect(() => {
    if (!isExpanded) {
      setIsGuideExpanded(false);
    }
  }, [isExpanded]);

  const isMigrationNeeded = useMemo(() => {
    if (!config) return false;
    return [
      config.githubRepositorySource,
      config.githubWorkflowSource,
      config.githubRefSource,
      config.webUrlSource,
      config.githubTokenSource,
    ].some(source => source === "env");
  }, [config]);

  const isFullyConfigured = useMemo(() => {
    if (!config) return false;
    return (
      Boolean(config.githubRepository.trim()) &&
      Boolean(config.githubWorkflow.trim()) &&
      Boolean(config.githubRef.trim()) &&
      Boolean(config.webUrl.trim()) &&
      config.githubTokenConfigured &&
      config.githubRepositorySource === "db" &&
      config.githubWorkflowSource === "db" &&
      config.githubRefSource === "db" &&
      config.webUrlSource === "db" &&
      config.githubTokenSource === "db"
    );
  }, [config]);

  const canSave =
    form.githubRepository.trim().length > 0 &&
    form.githubWorkflow.trim().length > 0 &&
    form.githubRef.trim().length > 0 &&
    form.webUrl.trim().length > 0;

  const handleSave = () => {
    if (!canSave) {
      toast.error(t("dashboard:desktopReleases.admin.config.missingRequired"));
      return;
    }

    updateMutation.mutate({
      githubRepository: form.githubRepository.trim(),
      githubWorkflow: form.githubWorkflow.trim(),
      githubRef: form.githubRef.trim(),
      webUrl: form.webUrl.trim(),
      githubToken: form.githubToken.trim() || undefined,
    });
  };

  const sourceInfoRows = [
    {
      label: t("dashboard:desktopReleases.admin.config.repository"),
      source: config?.githubRepositorySource,
    },
    {
      label: t("dashboard:desktopReleases.admin.config.workflow"),
      source: config?.githubWorkflowSource,
    },
    {
      label: t("dashboard:desktopReleases.admin.config.ref"),
      source: config?.githubRefSource,
    },
    {
      label: t("dashboard:desktopReleases.admin.config.webUrl"),
      source: config?.webUrlSource,
    },
    {
      label: t("dashboard:desktopReleases.admin.config.githubToken"),
      source: config?.githubTokenSource,
    },
  ];

  const guideStepKeys = [
    "step1",
    "step2",
    "step3",
    "step4",
    "step5",
    "step6",
  ] as const;
  const githubTokenGuideStepKeys = [
    "step1",
    "step2",
    "step3",
    "step4",
  ] as const;

  const configBody = isLoading ? (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 text-sm text-slate-600">
      <Loader2 className="h-4 w-4 animate-spin" />
      {t("dashboard:desktopReleases.admin.config.loading")}
    </div>
  ) : (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
      <div className="space-y-4 rounded-2xl border border-sky-100 bg-white/95 p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="githubRepository">
                {t("dashboard:desktopReleases.admin.config.repository")}
              </Label>
              <Badge
                variant="outline"
                className={sourceBadgeClass(config?.githubRepositorySource)}
              >
                {sourceBadgeLabel(t, config?.githubRepositorySource)}
              </Badge>
            </div>
            <Input
              id="githubRepository"
              value={form.githubRepository}
              onChange={event =>
                setForm(prev => ({
                  ...prev,
                  githubRepository: event.target.value,
                }))
              }
              placeholder="naibarn/SmartAIHub"
            />
            <p className="text-xs text-slate-500">
              {t("dashboard:desktopReleases.admin.config.repositoryHint")}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="githubWorkflow">
                {t("dashboard:desktopReleases.admin.config.workflow")}
              </Label>
              <Badge
                variant="outline"
                className={sourceBadgeClass(config?.githubWorkflowSource)}
              >
                {sourceBadgeLabel(t, config?.githubWorkflowSource)}
              </Badge>
            </div>
            <Input
              id="githubWorkflow"
              value={form.githubWorkflow}
              onChange={event =>
                setForm(prev => ({
                  ...prev,
                  githubWorkflow: event.target.value,
                }))
              }
              placeholder="desktop-release.yml"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="githubRef">
                {t("dashboard:desktopReleases.admin.config.ref")}
              </Label>
              <Badge
                variant="outline"
                className={sourceBadgeClass(config?.githubRefSource)}
              >
                {sourceBadgeLabel(t, config?.githubRefSource)}
              </Badge>
            </div>
            <Input
              id="githubRef"
              value={form.githubRef}
              onChange={event =>
                setForm(prev => ({ ...prev, githubRef: event.target.value }))
              }
              placeholder="main"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="webUrl">
                {t("dashboard:desktopReleases.admin.config.webUrl")}
              </Label>
              <Badge
                variant="outline"
                className={sourceBadgeClass(config?.webUrlSource)}
              >
                {sourceBadgeLabel(t, config?.webUrlSource)}
              </Badge>
            </div>
            <Input
              id="webUrl"
              value={form.webUrl}
              onChange={event =>
                setForm(prev => ({ ...prev, webUrl: event.target.value }))
              }
              placeholder="https://smartaihub.app"
            />
            <p className="text-xs text-slate-500">
              {t("dashboard:desktopReleases.admin.config.webUrlHint")}
            </p>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="githubToken">
                {t("dashboard:desktopReleases.admin.config.githubToken")}
              </Label>
              <Badge
                variant="outline"
                className={sourceBadgeClass(config?.githubTokenSource)}
              >
                {config?.githubTokenConfigured
                  ? t("dashboard:desktopReleases.admin.config.configured")
                  : sourceBadgeLabel(t, config?.githubTokenSource)}
              </Badge>
            </div>
            <div className="relative">
              <Input
                id="githubToken"
                type={showGithubToken ? "text" : "password"}
                value={form.githubToken}
                onChange={event =>
                  setForm(prev => ({
                    ...prev,
                    githubToken: event.target.value,
                  }))
                }
                placeholder={
                  config?.githubTokenConfigured
                    ? t(
                        "dashboard:desktopReleases.admin.config.githubTokenKeep"
                      )
                    : t(
                        "dashboard:desktopReleases.admin.config.githubTokenPlaceholder"
                      )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowGithubToken(value => !value)}
              >
                {showGithubToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              {t("dashboard:desktopReleases.admin.config.githubTokenHint")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-200">
          <Button
            type="button"
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-sky-600 hover:bg-sky-700"
          >
            {updateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("dashboard:desktopReleases.admin.config.save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setForm(prev => ({
                ...prev,
                githubToken: "",
              }));
              void refetch();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("dashboard:desktopReleases.admin.config.reload")}
          </Button>
        </div>
      </div>

      <div className="space-y-4 min-w-0">
        <DashboardCard
          className="border-sky-100 bg-white/95 shadow-sm"
          leading={<Globe className="h-4 w-4 text-sky-500" />}
          title={t("dashboard:desktopReleases.admin.config.guide.title")}
          description={t(
            "dashboard:desktopReleases.admin.config.guide.description"
          )}
          trailing={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsGuideExpanded(value => !value)}
              className="border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
            >
              {isGuideExpanded ? (
                <ChevronUp className="mr-2 h-4 w-4" />
              ) : (
                <ChevronDown className="mr-2 h-4 w-4" />
              )}
              {isGuideExpanded
                ? t("dashboard:desktopReleases.admin.config.guide.collapse")
                : t("dashboard:desktopReleases.admin.config.guide.expand")}
            </Button>
          }
        >
          {isGuideExpanded ? (
            <ol className="space-y-3 text-sm text-slate-700">
              {guideStepKeys.map(step => (
                <li
                  key={step}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3"
                >
                  <div className="font-medium text-slate-900">
                    {t(
                      `dashboard:desktopReleases.admin.config.guide.${step}.title`
                    )}
                  </div>
                  <div className="mt-1 leading-6 text-slate-600">
                    {t(
                      `dashboard:desktopReleases.admin.config.guide.${step}.body`
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </DashboardCard>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertCircle className="h-4 w-4" />
            {t("dashboard:desktopReleases.admin.config.reminderTitle")}
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-900/90">
            {t("dashboard:desktopReleases.admin.config.reminderBody")}
          </p>
          <div className="mt-4 grid gap-2">
            {sourceInfoRows.map(row => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-white/80 px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-700">{row.label}</span>
                <Badge
                  variant="outline"
                  className={sourceBadgeClass(row.source)}
                >
                  {sourceBadgeLabel(t, row.source)}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-900">
            <KeyRound className="h-4 w-4" />
            {t("dashboard:desktopReleases.admin.config.githubTokenGuide.title")}
          </div>
          <p className="mt-2 text-sm leading-6 text-cyan-900/90">
            {t(
              "dashboard:desktopReleases.admin.config.githubTokenGuide.description"
            )}
          </p>
          <ol className="mt-4 space-y-2 text-sm text-cyan-900/90">
            {githubTokenGuideStepKeys.map(step => (
              <li
                key={step}
                className="rounded-xl border border-cyan-100 bg-white/85 px-3 py-2"
              >
                <div className="font-medium text-cyan-950">
                  {t(
                    `dashboard:desktopReleases.admin.config.githubTokenGuide.${step}.title`
                  )}
                </div>
                <div className="mt-1 leading-6 text-cyan-900/80">
                  {t(
                    `dashboard:desktopReleases.admin.config.githubTokenGuide.${step}.body`
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 text-xs leading-6 text-slate-500 shadow-sm">
          {t("dashboard:desktopReleases.admin.config.note")}
        </div>
      </div>
    </div>
  );

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <DashboardCard
        className="overflow-hidden border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50/30"
        headerClassName="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
        leading={<Sparkles className="w-5 h-5 text-sky-500" />}
        eyebrow={t("dashboard:desktopReleases.admin.config.eyebrow")}
        title={t("dashboard:desktopReleases.admin.config.title")}
        description={t("dashboard:desktopReleases.admin.config.description")}
        bodyClassName="space-y-6"
        trailing={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isMigrationNeeded ? (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-800"
              >
                <AlertCircle className="mr-1 h-3 w-3" />
                {t("dashboard:desktopReleases.admin.config.legacyBadge")}
              </Badge>
            ) : isFullyConfigured ? (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                <ShieldCheck className="mr-1 h-3 w-3" />
                {t("dashboard:desktopReleases.admin.config.managedBadge")}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-slate-200 bg-slate-50 text-slate-500"
              >
                {t("dashboard:desktopReleases.admin.config.source.none")}
              </Badge>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              className="border-slate-200 bg-white text-slate-700"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("dashboard:desktopReleases.admin.refresh")}
            </Button>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
              >
                {isExpanded ? (
                  <ChevronUp className="mr-2 h-4 w-4" />
                ) : (
                  <ChevronDown className="mr-2 h-4 w-4" />
                )}
                {isExpanded ? t("common.showLess") : t("common.showMore")}
              </Button>
            </CollapsibleTrigger>
          </div>
        }
      >
        {isExpanded ? configBody : null}
      </DashboardCard>
    </Collapsible>
  );
}
