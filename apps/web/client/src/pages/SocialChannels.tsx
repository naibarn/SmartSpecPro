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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SocialPageShell } from "@/components/social/SocialPageShell";

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

function modeLabel(mode: MetaPage["aiActionMode"]): string {
  switch (mode) {
    case "off":
      return "Off";
    case "draft_only":
      return "Draft only";
    case "approval_required":
      return "Approval required";
    case "auto_send":
      return "Auto send";
  }
}

function PageSettingsCard({
  page,
  onSave,
  onSync,
  onDisconnect,
  syncing,
  disconnecting,
  saving,
}: {
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
    <Card className="border-slate-200/80 bg-white/80 shadow-lg shadow-slate-200/60 backdrop-blur">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg text-slate-900">
                {page.pageName || "Untitled page"}
              </CardTitle>
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                {page.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {page.pageCategory || "Uncategorized"} · ID {page.providerPageId}
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
              Sync webhooks
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-slate-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              onClick={() => void onDisconnect()}
              disabled={disconnecting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">
              AI action mode
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
                  {modeLabel(mode)}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              {draft.aiActionMode === "auto_send"
                ? "Replies may send automatically when confidence is high enough."
                : draft.aiActionMode === "approval_required"
                  ? "Human approval will be required before any reply is sent."
                  : draft.aiActionMode === "off"
                    ? "Automation on this page is disabled."
                    : "Drafts are generated for review before sending."}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Auto-send confidence
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
            Channel routing
          </p>

          <div className="space-y-3">
            {[
              {
                key: "selectedForInbox" as const,
                label: "Inbox",
                description: "Route incoming conversations into the team inbox.",
              },
              {
                key: "selectedForPublishing" as const,
                label: "Publishing",
                description: "Allow this page to receive scheduled or drafted posts.",
              },
              {
                key: "selectedForModeration" as const,
                label: "Moderation",
                description: "Surface comments and moderation actions for review.",
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
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SocialChannels() {
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
      setNotice("Page settings saved.");
      await utils.metaChannels.getConnectionStatus.invalidate();
    },
    onError: (error) => setNotice(error.message),
  });
  const syncPageMutation = trpc.metaChannels.connectPage.useMutation({
    onSuccess: async () => {
      setNotice("Meta webhooks are synced.");
      await utils.metaChannels.getConnectionStatus.invalidate();
    },
    onError: (error) => setNotice(error.message),
  });
  const disconnectPageMutation = trpc.metaChannels.disconnectPage.useMutation({
    onSuccess: async () => {
      setNotice("Page disconnected.");
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
      label: "Inbox",
      value: inboxPagesCount,
      color: "bg-sky-500",
    },
    {
      label: "Publishing",
      value: publishingPagesCount,
      color: "bg-fuchsia-500",
    },
    {
      label: "Moderation",
      value: moderationPagesCount,
      color: "bg-emerald-500",
    },
    {
      label: "Automation",
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
                  Connection overview
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Ready for inbox, publishing, moderation, and automation
                </p>
              </div>
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {connectedPagesCount} page{connectedPagesCount === 1 ? "" : "s"} connected
            </p>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Use this hub to decide which pages feed inbox, publishing, moderation, and automation.
            </p>
          </div>
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {connection.connection.connectionStatus}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-slate-700">
            Token {connection.connection.tokenMasked}
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1">
            Expiry{" "}
            {connection.connection.tokenExpiresAt
              ? new Date(connection.connection.tokenExpiresAt).toLocaleString()
              : "not available"}
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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Inbox ready</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{inboxPagesCount}</p>
        <p className="mt-2 text-sm text-slate-500">Pages routing conversations into the inbox lane.</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-sky-700">
          <MessageCircle className="h-4 w-4" />
          Live support lane
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Publishing ready</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{publishingPagesCount}</p>
        <p className="mt-2 text-sm text-slate-500">Pages allowed to receive scheduled or drafted posts.</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-fuchsia-700">
          <Megaphone className="h-4 w-4" />
          Content lane
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Automation ready</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{automationPagesCount}</p>
        <p className="mt-2 text-sm text-slate-500">Pages with AI action mode turned on.</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-violet-700">
          <Workflow className="h-4 w-4" />
          Policy lane
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
            Start here
          </p>
        </div>
        <p className="mt-2 text-2xl font-semibold text-slate-900">
          Connect Meta to unlock the social workspace
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Once your Meta account is connected, each page can be routed into inbox, publishing, moderation, and automation.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pages connected</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">0</p>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div className="h-2 w-[12%] rounded-full bg-sky-500" />
          </div>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Inbox lane</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">0</p>
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-400">
            <MessageCircle className="h-4 w-4" />
            Waiting to route
          </div>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Automation</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">0</p>
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-400">
            <Workflow className="h-4 w-4" />
            Rules will appear here
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
      setNotice("Could not load the Meta authorization URL.");
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
      title="Social Channels"
      eyebrow="Meta connection hub"
      description="Use this workspace to connect your Meta app, sync pages, and tune how each page behaves across inbox, publishing, and moderation."
      tone="channels"
      badge={
        <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
          {connection?.status === "connected" ? "Connected" : "Not connected"}
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
            {authUrlQuery.isFetching ? "Loading..." : "Connect Meta"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-xl border-slate-200 bg-white"
            onClick={() => void connectionQuery.refetch()}
            disabled={connectionQuery.isFetching}
          >
            <RefreshCcw className={`h-4 w-4 ${connectionQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
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
          <Card className="border-slate-200 bg-white/90 shadow-sm">
            <CardContent className="p-6 text-sm text-slate-600">
              Loading Meta connection status...
            </CardContent>
          </Card>
        ) : connectionQuery.error ? (
          <Card className="border-rose-200 bg-rose-50/70 shadow-sm">
            <CardContent className="p-6 text-sm text-rose-700">
              {connectionQuery.error.message}
            </CardContent>
          </Card>
        ) : connection?.status !== "connected" ? (
          <Card className="border-slate-200/80 bg-white/80 shadow-lg shadow-slate-200/60 backdrop-blur">
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <PlugZap className="h-5 w-5 text-slate-500" />
                  No Meta account connected
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Connect a Meta app to load your Facebook Pages into the channel manager.
                </p>
              </div>
              <Button type="button" onClick={() => void handleConnectMeta()} className="bg-slate-900 text-white hover:bg-slate-800">
                <Facebook className="mr-2 h-4 w-4" />
                Connect Meta
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-slate-200/80 bg-white/80 shadow-sm backdrop-blur">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Connected pages
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {pages.length}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-slate-200/80 bg-white/80 shadow-sm backdrop-blur">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Connection status
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {connection.connection.connectionStatus}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-slate-200/80 bg-white/80 shadow-sm backdrop-blur">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Token
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {connection.connection.tokenMasked}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-slate-200/80 bg-white/80 shadow-sm backdrop-blur">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Expiry
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {connection.connection.tokenExpiresAt
                      ? new Date(connection.connection.tokenExpiresAt).toLocaleString()
                      : "Not available"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4">
              {pages.map((page: MetaPage) => (
                <PageSettingsCard
                  key={page.pageId}
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

        <Card className="border-slate-200/80 bg-white/80 shadow-sm backdrop-blur">
          <CardContent className="grid gap-4 p-6 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <MessageCircle className="h-5 w-5 text-sky-300" />
              <p className="mt-3 text-sm font-semibold">Inbox routing</p>
              <p className="mt-1 text-sm text-slate-300">
                Turn pages into conversational support channels.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <Megaphone className="h-5 w-5 text-fuchsia-300" />
              <p className="mt-3 text-sm font-semibold">Publishing workflows</p>
              <p className="mt-1 text-sm text-slate-300">
                Keep page publishing controlled and auditable.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <Zap className="h-5 w-5 text-amber-300" />
              <p className="mt-3 text-sm font-semibold">Automation guardrails</p>
              <p className="mt-1 text-sm text-slate-300">
                Tune auto-send behavior with confidence thresholds.
              </p>
            </div>
          </CardContent>
        </Card>
    </SocialPageShell>
  );
}
