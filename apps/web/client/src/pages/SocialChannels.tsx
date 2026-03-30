import { useEffect, useState } from "react";
import {
  Facebook,
  PlugZap,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Settings2,
  Trash2,
  Megaphone,
  MessageCircle,
  Zap,
  Workflow,
} from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SocialPageShell } from "@/components/social/SocialPageShell";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type MetaPage = {
  pageId: number;
  providerPageId: string;
  pageName: string | null;
  pageCategory: string | null;
  status: string;
  selectedForInbox: boolean;
  selectedForPublishing: boolean;
  selectedForModeration: boolean;
  aiActionMode: "off" | "draft_only" | "approval_required" | "auto_send";
  autoSendConfidenceThreshold: number;
  tokenExpiresAt: string | null;
};

type ConnectionResponse =
  | {
      status: "not_connected";
    }
  | {
      status: "connected";
      connection: {
        id: number;
        providerUserId: string | null;
        connectionStatus: string;
        tokenMasked: string;
        tokenExpiresAt: string | null;
        pages: MetaPage[];
      };
    };

const AI_MODES: Array<MetaPage["aiActionMode"]> = [
  "off",
  "draft_only",
  "approval_required",
  "auto_send",
];

function modeLabel(
  mode: MetaPage["aiActionMode"],
  t: (key: string) => string,
): string {
  switch (mode) {
    case "off":
      return t("channels.page.mode.offLabel");
    case "draft_only":
      return t("channels.page.mode.draftOnlyLabel");
    case "approval_required":
      return t("channels.page.mode.approvalRequiredLabel");
    case "auto_send":
      return t("channels.page.mode.autoSendLabel");
  }
}

function connectionStatusLabel(
  status: string,
  t: (key: string) => string,
): string {
  switch (status) {
    case "connected":
      return t("channels.connected");
    case "not_connected":
      return t("channels.notConnected");
    default:
      return status;
  }
}

function PageSettingsCard({
  t,
  page,
  onSave,
  onSync,
  onDisconnect,
  syncing,
  disconnecting,
  saving,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  page: MetaPage;
  onSave: (next: {
    aiActionMode: MetaPage["aiActionMode"];
    autoSendConfidenceThreshold: number;
    selectedForInbox: boolean;
    selectedForPublishing: boolean;
    selectedForModeration: boolean;
  }) => Promise<void>;
  onSync: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  syncing: boolean;
  disconnecting: boolean;
  saving: boolean;
}) {
  const [draft, setDraft] = useState({
    aiActionMode: page.aiActionMode,
    autoSendConfidenceThreshold: page.autoSendConfidenceThreshold,
    selectedForInbox: page.selectedForInbox,
    selectedForPublishing: page.selectedForPublishing,
    selectedForModeration: page.selectedForModeration,
  });

  useEffect(() => {
    setDraft({
      aiActionMode: page.aiActionMode,
      autoSendConfidenceThreshold: page.autoSendConfidenceThreshold,
      selectedForInbox: page.selectedForInbox,
      selectedForPublishing: page.selectedForPublishing,
      selectedForModeration: page.selectedForModeration,
    });
  }, [page.aiActionMode, page.autoSendConfidenceThreshold, page.selectedForInbox, page.selectedForModeration, page.selectedForPublishing, page.pageId]);

  const hasChanges =
    draft.aiActionMode !== page.aiActionMode ||
    draft.autoSendConfidenceThreshold !== page.autoSendConfidenceThreshold ||
    draft.selectedForInbox !== page.selectedForInbox ||
    draft.selectedForPublishing !== page.selectedForPublishing ||
    draft.selectedForModeration !== page.selectedForModeration;

  return (
    <DashboardCard className="border-slate-200/80 bg-white/80 shadow-lg shadow-slate-200/60 backdrop-blur">
      <div className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg text-slate-900">
                {page.pageName || t("channels.page.untitled")}
              </h3>
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                {page.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {page.pageCategory || t("channels.page.uncategorized")} · ID {page.providerPageId}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 bg-white"
              onClick={() => void onSync()}
              disabled={syncing}
              >
                <PlugZap className="mr-2 h-4 w-4" />
              {t("channels.page.syncWebhooks")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              onClick={() => void onDisconnect()}
              disabled={disconnecting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
              {t("channels.page.disconnect")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">
              {t("channels.page.aiActionMode")}
            </Label>
            <select
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
              value={draft.aiActionMode}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  aiActionMode: event.target.value as MetaPage["aiActionMode"],
                }))
              }
            >
              {AI_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {modeLabel(mode, t)}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              {draft.aiActionMode === "auto_send"
                ? t("channels.page.mode.autoSend")
                : draft.aiActionMode === "approval_required"
                  ? t("channels.page.mode.approvalRequired")
                  : draft.aiActionMode === "off"
                    ? t("channels.page.mode.off")
                    : t("channels.page.mode.draftOnly")}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {t("channels.page.autoSendConfidence")}
              </Label>
              <span className="text-sm font-semibold text-slate-900">
                {Math.round(draft.autoSendConfidenceThreshold * 100)}%
              </span>
            </div>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              className="mt-2 h-11 rounded-xl border-slate-200 bg-white"
              value={draft.autoSendConfidenceThreshold}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  autoSendConfidenceThreshold: Number(event.target.value) || 0,
                }))
              }
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Settings2 className="h-4 w-4 text-slate-500" />
            {t("channels.page.routing.title")}
          </p>

          <div className="space-y-3">
            {[
              {
                key: "selectedForInbox" as const,
                label: t("channels.page.routing.inbox.label"),
                description: t("channels.page.routing.inbox.description"),
              },
              {
                key: "selectedForPublishing" as const,
                label: t("channels.page.routing.publishing.label"),
                description: t("channels.page.routing.publishing.description"),
              },
              {
                key: "selectedForModeration" as const,
                label: t("channels.page.routing.moderation.label"),
                description: t("channels.page.routing.moderation.description"),
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300"
              >
                <input
                  type="checkbox"
                  checked={draft[item.key]}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [item.key]: event.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-slate-900">
                    {item.label}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {item.description}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <Button
            type="button"
            className="mt-4 w-full bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => void onSave(draft)}
            disabled={!hasChanges || saving}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            {t("channels.page.saveSettings")}
          </Button>
        </div>
      </div>
    </DashboardCard>
  );
}

export default function SocialChannels() {
  const { t } = useScopedTranslation("social");
  const [notice, setNotice] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const connectionQuery = trpc.metaChannels.getConnectionStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const authUrlQuery = trpc.metaChannels.getAuthUrl.useQuery(undefined, {
    enabled: false,
    retry: false,
  });

  const saveSettingsMutation = trpc.metaChannels.updatePageSettings.useMutation({
    onSuccess: async () => {
      setNotice(t("channels.notice.settingsSaved"));
      await utils.metaChannels.getConnectionStatus.invalidate();
    },
    onError: (error) => setNotice(error.message),
  });
  const syncPageMutation = trpc.metaChannels.connectPage.useMutation({
    onSuccess: async () => {
      setNotice(t("channels.notice.webhooksSynced"));
      await utils.metaChannels.getConnectionStatus.invalidate();
    },
    onError: (error) => setNotice(error.message),
  });
  const disconnectPageMutation = trpc.metaChannels.disconnectPage.useMutation({
    onSuccess: async () => {
      setNotice(t("channels.notice.pageDisconnected"));
      await utils.metaChannels.getConnectionStatus.invalidate();
    },
    onError: (error) => setNotice(error.message),
  });

  const connection = connectionQuery.data as ConnectionResponse | undefined;
  const pages: MetaPage[] = connection?.status === "connected"
    ? connection.connection.pages
    : [];
  const connectedPagesCount = pages.length;
  const inboxPagesCount = pages.filter((page) => page.selectedForInbox).length;
  const publishingPagesCount = pages.filter((page) => page.selectedForPublishing).length;
  const moderationPagesCount = pages.filter((page) => page.selectedForModeration).length;
  const automationPagesCount = pages.filter((page) => page.aiActionMode !== "off").length;
  const routingStats = [
    {
      label: t("channels.stats.inbox"),
      value: inboxPagesCount,
      color: "bg-sky-500",
    },
    {
      label: t("channels.stats.publishing"),
      value: publishingPagesCount,
      color: "bg-fuchsia-500",
    },
    {
      label: t("channels.stats.moderation"),
      value: moderationPagesCount,
      color: "bg-emerald-500",
    },
    {
      label: t("channels.stats.automation"),
      value: automationPagesCount,
      color: "bg-violet-500",
    },
  ];
  const routingMax = Math.max(...routingStats.map((stat) => stat.value), 1);
  const hero = connection?.status === "connected" ? (
    <div className="grid gap-3 xl:grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr]">
      <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 xl:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-sky-600 shadow-sm shadow-sky-200/60">
                <Facebook className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  {t("channels.hero.connectionOverview")}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {t("channels.hero.readyForRouting")}
                </p>
              </div>
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {t("channels.hero.connectedPages", { count: connectedPagesCount })}
            </p>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {t("channels.hero.description")}
            </p>
          </div>
              <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
                {connectionStatusLabel(connection.connection.connectionStatus, t)}
              </Badge>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-slate-700">
            {t("channels.hero.token", { token: connection.connection.tokenMasked })}
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1">
            {t("channels.hero.expiry")}
            {" "}
            {connection.connection.tokenExpiresAt
              ? new Date(connection.connection.tokenExpiresAt).toLocaleString()
              : t("channels.hero.notAvailable")}
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {routingStats.map((stat) => (
            <div key={stat.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{stat.label}</span>
                <span>{stat.value}</span>
              </div>
              <div className="h-2 rounded-full bg-white/90">
                <div
                  className={`h-2 rounded-full ${stat.color}`}
                  style={{ width: `${Math.max((stat.value / routingMax) * 100, stat.value > 0 ? 24 : 8)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("channels.metrics.inboxReady")}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{inboxPagesCount}</p>
        <p className="mt-2 text-sm text-slate-500">{t("channels.metrics.inboxDescription")}</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-sky-700">
          <MessageCircle className="h-4 w-4" />
          {t("channels.metrics.liveSupportLane")}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("channels.metrics.publishingReady")}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{publishingPagesCount}</p>
        <p className="mt-2 text-sm text-slate-500">{t("channels.metrics.publishingDescription")}</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-fuchsia-700">
          <Megaphone className="h-4 w-4" />
          {t("channels.metrics.contentLane")}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("channels.metrics.automationReady")}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{automationPagesCount}</p>
        <p className="mt-2 text-sm text-slate-500">{t("channels.metrics.automationDescription")}</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-violet-700">
          <Workflow className="h-4 w-4" />
          {t("channels.metrics.policyLane")}
        </div>
      </div>
    </div>
  ) : (
    <div className="grid gap-3 lg:grid-cols-[1.1fr_0.95fr]">
      <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-sky-600 shadow-sm shadow-sky-200/60">
            <Facebook className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            {t("channels.empty.startHere")}
          </p>
        </div>
        <p className="mt-2 text-2xl font-semibold text-slate-900">
          {t("channels.empty.title")}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          {t("channels.empty.description")}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("channels.empty.pagesConnected")}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">0</p>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div className="h-2 w-[12%] rounded-full bg-sky-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("channels.empty.inboxLane")}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">0</p>
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-400">
            <MessageCircle className="h-4 w-4" />
            {t("channels.empty.waitingToRoute")}
          </div>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("channels.empty.automation")}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">0</p>
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-400">
            <Workflow className="h-4 w-4" />
            {t("channels.empty.rulesAppearHere")}
          </div>
        </div>
      </div>
    </div>
  );

  const handleConnectMeta = async () => {
    setNotice(null);
    const result = await authUrlQuery.refetch();
    const authorizationUrl = result.data?.authorization_url;
    if (!authorizationUrl) {
      setNotice(t("channels.connectUrlFailed"));
      return;
    }
    window.location.assign(authorizationUrl);
  };

  const handleSavePage = async (
    pageId: number,
    next: {
      aiActionMode: MetaPage["aiActionMode"];
      autoSendConfidenceThreshold: number;
      selectedForInbox: boolean;
      selectedForPublishing: boolean;
      selectedForModeration: boolean;
    },
  ) => {
    setNotice(null);
    await saveSettingsMutation.mutateAsync({ pageId, ...next });
  };

  const handleSyncPage = async (pageId: number) => {
    setNotice(null);
    await syncPageMutation.mutateAsync({ pageId });
  };

  const handleDisconnectPage = async (pageId: number) => {
    setNotice(null);
    await disconnectPageMutation.mutateAsync({ pageId });
  };

  return (
    <SocialPageShell
      icon={Facebook}
      title={t("channels.title")}
      eyebrow={t("channels.eyebrow")}
      description={t("channels.description")}
      tone="channels"
      badge={
        <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
          {connection?.status === "connected" ? t("channels.connected") : t("channels.notConnected")}
        </Badge>
      }
      actions={
        <>
          <Button
            type="button"
            onClick={() => void handleConnectMeta()}
            className="bg-slate-900 text-white hover:bg-slate-800"
            disabled={authUrlQuery.isFetching}
          >
            <Facebook className="mr-2 h-4 w-4" />
            {authUrlQuery.isFetching ? t("channels.connecting") : t("channels.connectMeta")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-xl border-slate-200 bg-white"
            onClick={() => void connectionQuery.refetch()}
            disabled={connectionQuery.isFetching}
          >
            <RefreshCcw className={`h-4 w-4 ${connectionQuery.isFetching ? "animate-spin" : ""}`} />
            {t("channels.refresh")}
          </Button>
        </>
      }
      hero={hero}
    >
        {notice ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            {notice}
          </div>
        ) : null}

        {connectionQuery.isLoading ? (
          <DashboardCard className="border-slate-200 bg-white/90 shadow-sm">
            <div className="p-6 text-sm text-slate-600">
              {t("channels.loadingConnection")}
            </div>
          </DashboardCard>
        ) : connectionQuery.error ? (
          <DashboardCard className="border-rose-200 bg-rose-50/70 shadow-sm">
            <div className="p-6 text-sm text-rose-700">
              {connectionQuery.error.message}
            </div>
          </DashboardCard>
        ) : connection?.status !== "connected" ? (
          <DashboardCard className="border-slate-200/80 bg-white/80 shadow-lg shadow-slate-200/60 backdrop-blur">
            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <PlugZap className="h-5 w-5 text-slate-500" />
                  {t("channels.empty.noMetaAccountConnected")}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {t("channels.empty.connectMetaApp")}
                </p>
              </div>
              <Button type="button" onClick={() => void handleConnectMeta()} className="bg-slate-900 text-white hover:bg-slate-800">
                <Facebook className="mr-2 h-4 w-4" />
                {t("channels.connectMeta")}
              </Button>
            </div>
          </DashboardCard>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <DashboardCard className="border-slate-200/80 bg-white/80 shadow-sm backdrop-blur">
                <div className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {t("channels.connectedPages")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {pages.length}
                  </p>
                </div>
              </DashboardCard>
              <DashboardCard className="border-slate-200/80 bg-white/80 shadow-sm backdrop-blur">
                <div className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {t("channels.connectionStatus")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {connection.connection.connectionStatus}
                  </p>
                </div>
              </DashboardCard>
              <DashboardCard className="border-slate-200/80 bg-white/80 shadow-sm backdrop-blur">
                <div className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {t("channels.token")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {connection.connection.tokenMasked}
                  </p>
                </div>
              </DashboardCard>
              <DashboardCard className="border-slate-200/80 bg-white/80 shadow-sm backdrop-blur">
                <div className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {t("channels.expiry")}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {connection.connection.tokenExpiresAt
                      ? new Date(connection.connection.tokenExpiresAt).toLocaleString()
                      : t("channels.notAvailable")}
                  </p>
                </div>
              </DashboardCard>
            </div>

            <div className="grid gap-4">
              {pages.map((page: MetaPage) => (
                <PageSettingsCard
                  key={page.pageId}
                  t={t}
                  page={page}
                  saving={saveSettingsMutation.isPending && saveSettingsMutation.variables?.pageId === page.pageId}
                  syncing={syncPageMutation.isPending && syncPageMutation.variables?.pageId === page.pageId}
                  disconnecting={disconnectPageMutation.isPending && disconnectPageMutation.variables?.pageId === page.pageId}
                  onSave={(next) => handleSavePage(page.pageId, next)}
                  onSync={() => handleSyncPage(page.pageId)}
                  onDisconnect={() => handleDisconnectPage(page.pageId)}
                />
              ))}
            </div>
          </>
        )}

        <Separator className="bg-slate-200/80" />

        <DashboardCard className="border-slate-200/80 bg-white/80 shadow-sm backdrop-blur">
          <div className="grid gap-4 p-6 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <MessageCircle className="h-5 w-5 text-sky-300" />
              <p className="mt-3 text-sm font-semibold">
                {t("channels.more.inboxRouting")}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {t("channels.more.inboxRoutingDesc")}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <Megaphone className="h-5 w-5 text-fuchsia-300" />
              <p className="mt-3 text-sm font-semibold">
                {t("channels.more.publishingWorkflows")}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {t("channels.more.publishingWorkflowsDesc")}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <Zap className="h-5 w-5 text-amber-300" />
              <p className="mt-3 text-sm font-semibold">
                {t("channels.more.automationGuardrails")}
              </p>
              <p className="mt-1 text-sm text-slate-300">
                {t("channels.more.automationGuardrailsDesc")}
              </p>
            </div>
          </div>
        </DashboardCard>
    </SocialPageShell>
  );
}
