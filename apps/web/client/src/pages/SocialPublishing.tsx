import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, FileText, Megaphone, RefreshCcw, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SocialPageShell } from "@/components/social/SocialPageShell";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  formatPublishingStatus,
  formatRelativeTime,
  formatPublishingReadiness,
  getPublishingStatusTone,
  getPublishingReadinessTone,
  mapPublishingFilterToBackendStatus,
  type SocialPublishingFilterStatus,
  type SocialPublishingPageOption,
  type SocialPublishingPostSummary,
  truncateText,
} from "@/types/social";
import type { UploadPostPlatform } from "@shared/uploadPost";

const POST_LIMIT = 12;
const DRAFT_CHARACTER_LIMIT = 2000;

function toDatetimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function isScheduleInRange(value: string): boolean {
  const scheduledDate = new Date(value);
  if (Number.isNaN(scheduledDate.getTime())) return false;

  const now = Date.now();
  const minimum = now + 10 * 60 * 1000;
  const maximum = now + 30 * 24 * 60 * 60 * 1000;
  const timestamp = scheduledDate.getTime();
  return timestamp >= minimum && timestamp <= maximum;
}

function PublishingStatusBadge({ status }: { status: SocialPublishingPostSummary["status"] }) {
  return <Badge className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getPublishingStatusTone(status)}`}>{formatPublishingStatus(status)}</Badge>;
}

export default function SocialPublishing() {
  const { t } = useScopedTranslation("social");
  const utils = trpc.useUtils();
  const [publishGateway, setPublishGateway] = useState<"native" | "upload_post">("native");
  const [selectedPageId, setSelectedPageId] = useState<number | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<SocialPublishingFilterStatus>("all");
  const [contentText, setContentText] = useState("");
  const [contentLink, setContentLink] = useState("");
  const [mediaRefsText, setMediaRefsText] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [selectedUploadPostProfileId, setSelectedUploadPostProfileId] = useState<number | undefined>(undefined);
  const [uploadPostPlatform, setUploadPostPlatform] = useState<UploadPostPlatform>("facebook");

  const pagesQuery = trpc.socialPublishing.listPages.useQuery();
  const backendStatus = mapPublishingFilterToBackendStatus(statusFilter);

  const postsQuery = trpc.socialPublishing.listPosts.useInfiniteQuery(
    {
      pageId: selectedPageId,
      status: backendStatus,
      limit: POST_LIMIT,
    },
    {
      initialCursor: null,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );

  const createDraftMutation = trpc.socialPublishing.createDraft.useMutation({
    onError: (error) => {
      toast.error(error.message || t("publishing.toasts.createDraftFailed"));
    },
  });

  const publishNowMutation = trpc.socialPublishing.publishNow.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialPublishing.listPages.invalidate(),
        utils.socialPublishing.listPosts.invalidate(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || t("publishing.toasts.publishFailed"));
    },
  });

  const schedulePostMutation = trpc.socialPublishing.schedulePost.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialPublishing.listPages.invalidate(),
        utils.socialPublishing.listPosts.invalidate(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || t("publishing.toasts.scheduleFailed"));
    },
  });

  const cancelScheduledPostMutation = trpc.socialPublishing.cancelScheduledPost.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialPublishing.listPages.invalidate(),
        utils.socialPublishing.listPosts.invalidate(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || t("publishing.toasts.cancelScheduledFailed"));
    },
  });

  const uploadPostConnectionQuery = trpc.uploadPost.getConnection.useQuery(undefined, {
    enabled: publishGateway === "upload_post",
    refetchInterval: publishGateway === "upload_post" ? 15_000 : false,
  });
  const uploadPostPublishNowMutation = trpc.uploadPost.publishNow.useMutation({
    onSuccess: async () => {
      await uploadPostConnectionQuery.refetch();
      toast.success(t("publishing.toasts.uploadPostPublished"));
    },
    onError: (error) => toast.error(error.message || t("publishing.toasts.uploadPostPublishFailed")),
  });
  const uploadPostScheduleMutation = trpc.uploadPost.schedulePost.useMutation({
    onSuccess: async () => {
      await uploadPostConnectionQuery.refetch();
      toast.success(t("publishing.toasts.uploadPostScheduled"));
    },
    onError: (error) => toast.error(error.message || t("publishing.toasts.uploadPostScheduleFailed")),
  });

  const pages = useMemo<SocialPublishingPageOption[]>(() => pagesQuery.data ?? [], [pagesQuery.data]);

  useEffect(() => {
    if (selectedPageId !== undefined) return;
    if (pages.length === 0) return;
    setSelectedPageId(pages[0]?.id);
  }, [pages, selectedPageId]);

  useEffect(() => {
    if (selectedPageId === undefined) return;
    if (pages.some((page) => page.id === selectedPageId)) return;
    setSelectedPageId(pages[0]?.id);
  }, [pages, selectedPageId]);

  useEffect(() => {
    if (publishGateway !== "upload_post") return;
    const profiles = uploadPostConnectionQuery.data?.profiles ?? [];
    if (profiles.length === 0) {
      setSelectedUploadPostProfileId(undefined);
      return;
    }
    if (!selectedUploadPostProfileId || !profiles.some((profile) => profile.id === selectedUploadPostProfileId)) {
      setSelectedUploadPostProfileId(profiles[0]?.id);
    }
  }, [publishGateway, selectedUploadPostProfileId, uploadPostConnectionQuery.data?.profiles]);

  const posts = useMemo(
    () => postsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [postsQuery.data?.pages],
  );
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;
  const mediaRefs = useMemo(
    () => mediaRefsText
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    [mediaRefsText],
  );
  const requiresMediaRefs = selectedPage?.provider !== "meta";
  const selectedPageReady = selectedPage ? selectedPage.publishingReady !== false : false;
  const selectedPageReadyLabel = selectedPageReady ? t("publishing.readyToPublish") : t("publishing.actionRequired");
  const selectedPageIssue = selectedPage?.publishingIssue ?? null;
  const selectedPageIssueTitle = selectedPage?.publishingIssueCode === "missing_page_access"
    ? t("publishing.issues.missingPageAccess")
    : selectedPage?.publishingIssueCode === "expired_page_access"
      ? t("publishing.issues.expiredPageAccess")
      : selectedPage?.publishingIssueCode === "missing_provider_access"
        ? t("publishing.issues.missingProviderAccess")
        : selectedPage?.publishingIssueCode === "expired_provider_access"
          ? t("publishing.issues.expiredProviderAccess")
          : selectedPage?.publishingIssueCode === "publishing_disabled"
            ? t("publishing.issues.publishingDisabled")
            : selectedPage?.publishingIssueCode === "page_inactive"
              ? t("publishing.issues.pageInactive")
              : t("publishing.issues.notReady");

  const draftCount = posts.filter((post) => post.status === "draft").length;
  const scheduledCount = posts.filter((post) => post.status === "scheduled").length;
  const publishedCount = posts.filter((post) => post.status === "published").length;
  const failedCount = posts.filter((post) => post.status === "failed").length;
  const publishingStats = [
    { label: t("publishing.status.draft"), value: draftCount, color: "bg-slate-500" },
    { label: t("publishing.status.scheduled"), value: scheduledCount, color: "bg-amber-500" },
    { label: t("publishing.status.published"), value: publishedCount, color: "bg-emerald-500" },
    { label: t("publishing.status.failed"), value: failedCount, color: "bg-rose-500" },
  ];
  const publishingMax = Math.max(...publishingStats.map((stat) => stat.value), 1);
  const hero = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 xl:col-span-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-cyan-600 shadow-sm shadow-cyan-200/60">
            <Megaphone className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
            {t("publishing.eyebrow")}
          </p>
        </div>
        <p className="mt-2 text-2xl font-semibold text-slate-900">
          {t("publishing.postsInHistory", { count: posts.length })}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          {t("publishing.heroDescription")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {selectedPage?.label ?? t("publishing.noPageSelected")}
          </Badge>
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {t("publishing.draftLimit", { count: DRAFT_CHARACTER_LIMIT })}
          </Badge>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {[
            { label: t("publishing.flow.draft"), icon: FileText, tone: "text-slate-600" },
            { label: t("publishing.flow.publish"), icon: Send, tone: "text-cyan-700" },
            { label: t("publishing.flow.schedule"), icon: CalendarDays, tone: "text-amber-700" },
          ].map((step, index) => (
            <div
              key={step.label}
              className="flex flex-1 items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 text-xs font-medium text-slate-600"
            >
              <step.icon className={`h-4 w-4 ${step.tone}`} />
              <span>{index + 1}</span>
              <span>{step.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {publishingStats.map((stat) => (
            <div key={stat.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{stat.label}</span>
                <span>{stat.value}</span>
              </div>
              <div className="h-2 rounded-full bg-white/90">
                <div
                  className={`h-2 rounded-full ${stat.color}`}
                  style={{ width: `${Math.max((stat.value / publishingMax) * 100, stat.value > 0 ? 22 : 8)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("publishing.metrics.drafts")}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{draftCount}</p>
        <p className="mt-2 text-sm text-slate-500">{t("publishing.metrics.draftsDescription")}</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-700">
          <FileText className="h-4 w-4" />
          {t("publishing.metrics.composerQueue")}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("publishing.metrics.scheduled")}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{scheduledCount}</p>
        <p className="mt-2 text-sm text-slate-500">{t("publishing.metrics.scheduledDescription")}</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-amber-700">
          <CalendarDays className="h-4 w-4" />
          {t("publishing.metrics.calendarLane")}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("publishing.metrics.publishedFailed")}</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          {publishedCount}
          <span className="text-slate-400"> / {failedCount}</span>
        </p>
        <p className="mt-2 text-sm text-slate-500">{t("publishing.metrics.publishedFailedDescription")}</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-700">
          <Send className="h-4 w-4" />
          {t("publishing.metrics.liveFeed")}
        </div>
      </div>
    </div>
  );
  const contentLength = contentText.trim().length;
  const hasRequiredComposerContent = requiresMediaRefs ? mediaRefs.length > 0 : contentLength > 0;
  const isPublishing = publishNowMutation.isPending || createDraftMutation.isPending;
  const isScheduling = schedulePostMutation.isPending || createDraftMutation.isPending;
  const isBusy = isPublishing || isScheduling || cancelScheduledPostMutation.isPending;
  const canAutoPublish = hasRequiredComposerContent && selectedPageReady;

  const resetComposer = () => {
    setContentText("");
    setContentLink("");
    setScheduledAt(toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
  };

  const createDraft = async () => {
    if (!selectedPageId) {
      throw new Error(t("publishing.errors.choosePageFirst"));
    }
    return createDraftMutation.mutateAsync({
      pageId: selectedPageId,
      contentText: contentText.trim() || null,
      contentLink: contentLink.trim() ? contentLink.trim() : null,
      mediaRefs: mediaRefs.length > 0 ? mediaRefs : undefined,
    });
  };

  const handlePublishNow = async () => {
    if (!hasRequiredComposerContent) {
      toast.error(requiresMediaRefs ? t("publishing.errors.addMediaFirst") : t("publishing.errors.addContentFirst"));
      return;
    }
    try {
      const draft = await createDraft();
      await publishNowMutation.mutateAsync({ postId: draft.id });
      resetComposer();
      toast.success(t("publishing.toasts.postPublished"));
    } catch {
      // handled by individual mutations
    }
  };

  const handleSchedule = async () => {
    if (selectedPage?.provider === "tiktok") {
      toast.error(t("publishing.errors.tiktokNoSchedule"));
      return;
    }
    if (!hasRequiredComposerContent) {
      toast.error(requiresMediaRefs ? t("publishing.errors.addMediaFirst") : t("publishing.errors.addContentFirst"));
      return;
    }
    if (!isScheduleInRange(scheduledAt)) {
      toast.error(t("publishing.errors.scheduleRange"));
      return;
    }

    try {
      const draft = await createDraft();
      await schedulePostMutation.mutateAsync({
        postId: draft.id,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      resetComposer();
      toast.success(t("publishing.toasts.postScheduled"));
    } catch {
      // handled by individual mutations
    }
  };

  const handleCancel = async (postId: number) => {
    await cancelScheduledPostMutation.mutateAsync({ postId });
  };

  const uploadPostProfiles = uploadPostConnectionQuery.data?.profiles ?? [];
  const uploadPostJobs = uploadPostConnectionQuery.data?.jobs ?? [];
  const uploadPostSelectedProfile = uploadPostProfiles.find((profile) => profile.id === selectedUploadPostProfileId) ?? uploadPostProfiles[0] ?? null;
  const uploadPostHasContent = contentText.trim().length > 0 || mediaRefs.length > 0;
  const uploadPostCanSchedule = isScheduleInRange(scheduledAt);

  const handleUploadPostPublishNow = async () => {
    if (!uploadPostSelectedProfile) {
      toast.error(t("publishing.errors.selectUploadPostProfile"));
      return;
    }
    if (!uploadPostHasContent) {
      toast.error(t("publishing.errors.addContentOrMediaFirst"));
      return;
    }

    try {
      await uploadPostPublishNowMutation.mutateAsync({
        profileId: uploadPostSelectedProfile.id,
        platform: uploadPostPlatform,
        contentText: contentText.trim() || null,
        contentLink: contentLink.trim() ? contentLink.trim() : null,
        mediaRefs: mediaRefs.length > 0 ? mediaRefs : null,
        metadata: { source: "manual" },
      });
      resetComposer();
    } catch {
      // handled by mutation
    }
  };

  const handleUploadPostSchedule = async () => {
    if (!uploadPostSelectedProfile) {
      toast.error(t("publishing.errors.selectUploadPostProfile"));
      return;
    }
    if (!uploadPostHasContent) {
      toast.error(t("publishing.errors.addContentOrMediaFirst"));
      return;
    }
    if (!uploadPostCanSchedule) {
      toast.error(t("publishing.errors.scheduleRange"));
      return;
    }

    try {
      await uploadPostScheduleMutation.mutateAsync({
        profileId: uploadPostSelectedProfile.id,
        platform: uploadPostPlatform,
        contentText: contentText.trim() || null,
        contentLink: contentLink.trim() ? contentLink.trim() : null,
        mediaRefs: mediaRefs.length > 0 ? mediaRefs : null,
        scheduledAt: new Date(scheduledAt).toISOString(),
        metadata: { source: "manual" },
      });
      resetComposer();
    } catch {
      // handled by mutation
    }
  };

  return (
    <SocialPageShell
      icon={Megaphone}
      title={t("publishing.title")}
      eyebrow={t("publishing.eyebrow")}
      description={t("publishing.description")}
      tone="publishing"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
            {selectedPage ? `${selectedPage.label} · ${selectedPage.provider}` : t("publishing.noPageSelected")}
          </Badge>
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {selectedPageReadyLabel}
          </Badge>
        </div>
      }
      actions={
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-xl border-slate-200 bg-white"
          onClick={() => {
            void pagesQuery.refetch();
            void postsQuery.refetch();
          }}
        >
          <RefreshCcw className="h-4 w-4" />
          {t("publishing.refresh")}
        </Button>
      }
      hero={hero}
    >
        {pagesQuery.error || postsQuery.error ? (
          <DashboardCard className="border-rose-200 bg-rose-50/90 text-rose-900 shadow-sm">
            <div className="flex items-start gap-3 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5" />
              <div>
                <p className="font-semibold">{t("publishing.errors.loadDataTitle")}</p>
                <p className="text-sm">
                  {(pagesQuery.error || postsQuery.error)?.message || t("publishing.errors.loadDataMessage")}
                </p>
              </div>
            </div>
          </DashboardCard>
        ) : null}

        <DashboardCard className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg text-slate-900">{t("publishing.gateway.title")}</h3>
                <p className="mt-1 text-sm text-slate-500">{t("publishing.gateway.description")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["native", "upload_post"] as const).map((gateway) => (
                  <Button
                    key={gateway}
                    type="button"
                    variant={publishGateway === gateway ? "default" : "outline"}
                    className={`rounded-full px-3 text-xs uppercase tracking-[0.18em] ${
                      publishGateway === gateway
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                    onClick={() => setPublishGateway(gateway)}
                  >
                    {gateway === "native" ? t("publishing.gateway.native") : t("publishing.gateway.uploadPost")}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-4 border-t border-slate-100 pt-5">
            {publishGateway === "upload_post" ? (
              <div className="space-y-4">
                {uploadPostConnectionQuery.error ? (
                  <Alert className="border-amber-200 bg-amber-50/90 text-amber-900">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t("publishing.uploadPost.unavailableTitle")}</AlertTitle>
                    <AlertDescription>
                      {uploadPostConnectionQuery.error.message}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {uploadPostConnectionQuery.isLoading ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    {t("publishing.uploadPost.loadingConnection")}
                  </div>
                ) : uploadPostConnectionQuery.data ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{t("publishing.uploadPost.selectedProfile")}</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">
                        {uploadPostSelectedProfile?.displayName || uploadPostSelectedProfile?.platformPageId || t("publishing.uploadPost.noProfileSelected")}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {uploadPostSelectedProfile ? `${uploadPostSelectedProfile.platform} · ${uploadPostSelectedProfile.status}` : t("publishing.uploadPost.createOneInSettings")}
                      </div>
                    </div>
                    <label className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{t("publishing.uploadPost.profile")}</span>
                      <select
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                        value={selectedUploadPostProfileId ?? ""}
                        onChange={(event) => setSelectedUploadPostProfileId(event.target.value ? Number(event.target.value) : undefined)}
                      >
                        <option value="" disabled>
                          {uploadPostProfiles.length === 0 ? t("publishing.uploadPost.noProfiles") : t("publishing.uploadPost.chooseProfile")}
                        </option>
                        {uploadPostProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.displayName || profile.platformPageId} · {profile.platform}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{t("publishing.uploadPost.platform")}</span>
                      <select
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                        value={uploadPostPlatform}
                        onChange={(event) => setUploadPostPlatform(event.target.value as UploadPostPlatform)}
                      >
                        {(["facebook", "instagram", "threads", "tiktok", "youtube", "linkedin", "x", "pinterest", "other"] as UploadPostPlatform[]).map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                  {t("publishing.uploadPost.laneDescription")}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    className="gap-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={() => void handleUploadPostPublishNow()}
                    disabled={uploadPostPublishNowMutation.isPending || !uploadPostSelectedProfile || !uploadPostHasContent}
                  >
                    <Send className="h-4 w-4" />
                    {t("publishing.uploadPost.now")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 rounded-xl border-emerald-200 bg-white"
                    onClick={() => void handleUploadPostSchedule()}
                    disabled={uploadPostScheduleMutation.isPending || !uploadPostSelectedProfile || !uploadPostHasContent || !uploadPostCanSchedule}
                  >
                    <CalendarDays className="h-4 w-4" />
                    {t("publishing.uploadPost.schedule")}
                  </Button>
                  <p className="text-sm text-slate-500">
                    {t("publishing.uploadPost.jobsInHistory", { count: uploadPostJobs.length })}
                  </p>
                </div>

                {uploadPostJobs.length > 0 ? (
                  <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        {t("publishing.uploadPost.history")}
                      </p>
                      <Badge className="rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                        {uploadPostJobs.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {uploadPostJobs.slice(0, 3).map((job) => (
                        <div key={job.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-emerald-950">{job.contentText || job.contentLink || t("publishing.uploadPost.untitledJob")}</p>
                            <p className="text-xs text-emerald-700">
                              {job.platform} · {job.status} · {formatRelativeTime(job.createdAt)}
                            </p>
                          </div>
                          <Badge className="rounded-full bg-white text-emerald-700 hover:bg-white">
                            {job.providerJobId ? t("publishing.uploadPost.synced") : t("publishing.uploadPost.local")}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
                {t("publishing.nativeDescription")}
              </div>
            )}
          </div>
        </DashboardCard>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <DashboardCard className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg text-slate-900">{t("publishing.composer.title")}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t("publishing.composer.description")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-slate-500" />
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    {t("publishing.composer.characterCount", { count: contentLength, limit: DRAFT_CHARACTER_LIMIT })}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{t("publishing.composer.page")}</span>
                  <select
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                    value={selectedPageId ?? ""}
                    onChange={(event) => setSelectedPageId(event.target.value ? Number(event.target.value) : undefined)}
                    disabled={pages.length === 0}
                    aria-label={t("publishing.composer.page")}
                  >
                    <option value="" disabled>
                      {pages.length === 0 ? t("publishing.composer.noPublishingPages") : t("publishing.composer.choosePage")}
                    </option>
                    {pages.map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{t("publishing.composer.pageStatus")}</span>
                  <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
                    {selectedPage ? (
                      <div className="flex items-center gap-2">
                        <Badge className="rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                          {selectedPage.status}
                        </Badge>
                        <Badge className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">
                          {selectedPage.provider}
                        </Badge>
                        <Badge
                          className={`rounded-full hover:bg-transparent ${selectedPageReady
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {selectedPageReady ? t("publishing.readyToPublish") : t("publishing.actionRequired")}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-500">{t("publishing.composer.selectConnectedPage")}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t("publishing.composer.connectedPages")}
                  </p>
                  <Badge className="rounded-full bg-white/90 text-slate-600 hover:bg-white/90">
                    {t("publishing.composer.connectedCount", { count: pages.length })}
                  </Badge>
                </div>
                <div className="mt-3 max-h-36 space-y-2 overflow-y-auto pr-1">
                  {pages.map((page) => {
                    const ready = page.publishingReady !== false;
                    return (
                      <div
                        key={page.id}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
                          page.id === selectedPageId ? "border-slate-300 bg-white shadow-sm" : "border-slate-200 bg-white/80"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{page.pageName || page.label}</p>
                          <p className="text-xs text-slate-500">
                            {page.provider} · {page.pageCategory || t("publishing.composer.noCategory")}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <Badge className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">
                            {page.status}
                          </Badge>
                          <Badge className={`rounded-full hover:bg-transparent ${getPublishingReadinessTone(page.publishingIssueCode)}`}>
                            {formatPublishingReadiness(page.publishingIssueCode)}
                          </Badge>
                          <Badge className={`rounded-full hover:bg-transparent ${
                            ready ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}>
                            {ready ? t("publishing.composer.ready") : t("publishing.composer.needsAccess")}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedPage && !selectedPageReady ? (
                <Alert className="border-amber-200 bg-amber-50/90 text-amber-900">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{selectedPageIssueTitle}</AlertTitle>
                  <AlertDescription>
                    {selectedPageIssue}
                    <span className="mt-1 block">
                      {t("publishing.composer.reconnectHint")}
                    </span>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>

            <div className="space-y-4 border-t border-slate-100 pt-5">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{t("publishing.composer.postContent")}</label>
                <Textarea
                  value={contentText}
                  onChange={(event) => setContentText(event.target.value.slice(0, DRAFT_CHARACTER_LIMIT))}
                  placeholder={t("publishing.composer.contentPlaceholder")}
                  className="min-h-44 rounded-2xl border-slate-200 bg-white text-slate-900 shadow-sm"
                />
                <p className="text-xs text-slate-500">
                  {t("publishing.composer.contentHint")}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_280px]">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{t("publishing.composer.link")}</span>
                  <Input
                    type="url"
                    value={contentLink}
                    onChange={(event) => setContentLink(event.target.value)}
                    placeholder={t("publishing.composer.linkPlaceholder")}
                    aria-label={t("publishing.composer.link")}
                    className="h-11 rounded-xl border-slate-200 bg-white"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{t("publishing.composer.scheduleTime")}</span>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    aria-label={t("publishing.composer.scheduleTime")}
                    className="h-11 rounded-xl border-slate-200 bg-white"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  {t("publishing.composer.mediaUrls")}
                </label>
                <Textarea
                  value={mediaRefsText}
                  onChange={(event) => setMediaRefsText(event.target.value)}
                  placeholder={t("publishing.composer.mediaPlaceholder")}
                  className="min-h-24 rounded-2xl border-slate-200 bg-white text-slate-900 shadow-sm"
                />
                <p className="text-xs text-slate-500">
                  {requiresMediaRefs
                    ? t("publishing.composer.mediaRequired")
                    : t("publishing.composer.mediaOptional")}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  className="gap-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                  onClick={() => void handlePublishNow()}
                  disabled={isBusy || pages.length === 0 || !canAutoPublish}
                >
                  <Send className="h-4 w-4" />
                  {t("publishing.composer.publishNow")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 rounded-xl border-slate-200 bg-white"
                  onClick={() => void handleSchedule()}
                  disabled={isBusy || pages.length === 0 || selectedPage?.provider === "tiktok" || !canAutoPublish}
                >
                  <CalendarDays className="h-4 w-4" />
                  {t("publishing.composer.schedule")}
                </Button>
                {selectedPage ? (
                  <p className="text-sm text-slate-500">
                    {selectedPageReady
                      ? t("publishing.composer.pageReady", { name: selectedPage.pageName || selectedPage.label })
                      : t("publishing.composer.pageNeedsAccess", { name: selectedPage.pageName || selectedPage.label })}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">{t("publishing.composer.noConnectedPageSelected")}</p>
                )}
              </div>

              {selectedPageId ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 text-slate-500" />
                    <div className="space-y-1">
                      <p className="font-medium text-slate-900">{t("publishing.composer.publishingWindow")}</p>
                      <p>{t("publishing.composer.publishingWindowDescription")}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </DashboardCard>

          <DashboardCard className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg text-slate-900">{t("publishing.history.title")}</h3>
                  <p className="mt-1 text-sm text-slate-500">{t("publishing.history.description")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["all", "draft", "scheduled", "published", "failed"] as const).map((status) => (
                    <Button
                      key={status}
                      type="button"
                      variant={statusFilter === status ? "default" : "outline"}
                      className={`rounded-full px-3 text-xs uppercase tracking-[0.18em] ${
                        statusFilter === status
                          ? "bg-slate-900 text-white hover:bg-slate-800"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                      onClick={() => setStatusFilter(status)}
                    >
                      {t(`publishing.history.filter.${status}`)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 p-0">
              <div className="overflow-hidden rounded-b-3xl">
                <table className="w-full text-left">
                  <thead className="border-b border-slate-200 bg-slate-50/90 text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">{t("publishing.history.columns.status")}</th>
                      <th className="px-4 py-3">{t("publishing.history.columns.content")}</th>
                      <th className="px-4 py-3">{t("publishing.history.columns.page")}</th>
                      <th className="px-4 py-3">{t("publishing.history.columns.provider")}</th>
                      <th className="px-4 py-3">{t("publishing.history.columns.created")}</th>
                      <th className="px-4 py-3">{t("publishing.history.columns.publishedScheduled")}</th>
                      <th className="px-4 py-3 text-right">{t("publishing.history.columns.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {posts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                          {postsQuery.isLoading ? t("publishing.history.loading") : t("publishing.history.empty")}
                        </td>
                      </tr>
                    ) : null}
                    {posts.map((post) => (
                      <tr key={post.id} className="align-top">
                        <td className="px-4 py-4">
                          <PublishingStatusBadge status={post.status} />
                          {post.errorMessage ? (
                            <p className="mt-2 max-w-[220px] text-xs text-rose-600">
                              {truncateText(post.errorMessage, 80)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4">
                          <div className="max-w-[320px] space-y-1">
                            <p className="text-sm font-medium text-slate-900">
                              {truncateText(post.contentText || post.contentLink || t("publishing.history.untitledPost"), 90)}
                            </p>
                            {post.contentLink ? (
                              <p className="text-xs text-slate-500">{truncateText(post.contentLink, 70)}</p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">{post.pageName || t("publishing.history.pageFallback", { pageId: post.pageId })}</td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          <Badge className="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">
                            {post.provider}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-500">{formatRelativeTime(post.createdAt)}</td>
                        <td className="px-4 py-4 text-sm text-slate-500">
                          {formatRelativeTime(post.publishedAt || post.scheduledAt)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {post.status === "scheduled" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-xl border-slate-200 bg-white text-xs"
                              onClick={() => void handleCancel(post.id)}
                              disabled={isBusy}
                            >
                              <X className="mr-2 h-3.5 w-3.5" />
                              {t("publishing.history.cancel")}
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-4">
                <p className="text-sm text-slate-500">
                  {t("publishing.history.visiblePosts", { count: posts.length })}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-slate-200 bg-white"
                  onClick={() => void postsQuery.fetchNextPage()}
                  disabled={!postsQuery.hasNextPage || postsQuery.isFetchingNextPage}
                >
                  {postsQuery.isFetchingNextPage ? t("publishing.history.loadingMore") : postsQuery.hasNextPage ? t("publishing.history.loadMore") : t("publishing.history.noMore")}
                </Button>
              </div>
            </div>
          </DashboardCard>
        </div>
    </SocialPageShell>
  );
}
