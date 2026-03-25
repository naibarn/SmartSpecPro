import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, FileText, Megaphone, RefreshCcw, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SocialPageShell } from "@/components/social/SocialPageShell";
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
      toast.error(error.message || "Failed to create draft");
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
      toast.error(error.message || "Failed to publish post");
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
      toast.error(error.message || "Failed to schedule post");
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
      toast.error(error.message || "Failed to cancel scheduled post");
    },
  });

  const uploadPostConnectionQuery = trpc.uploadPost.getConnection.useQuery(undefined, {
    enabled: publishGateway === "upload_post",
    refetchInterval: publishGateway === "upload_post" ? 15_000 : false,
  });
  const uploadPostPublishNowMutation = trpc.uploadPost.publishNow.useMutation({
    onSuccess: async () => {
      await uploadPostConnectionQuery.refetch();
      toast.success("Upload-Post job published");
    },
    onError: (error) => toast.error(error.message || "Failed to publish Upload-Post job"),
  });
  const uploadPostScheduleMutation = trpc.uploadPost.schedulePost.useMutation({
    onSuccess: async () => {
      await uploadPostConnectionQuery.refetch();
      toast.success("Upload-Post job scheduled");
    },
    onError: (error) => toast.error(error.message || "Failed to schedule Upload-Post job"),
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
  const selectedPageReadyLabel = selectedPageReady ? "Ready to publish" : "Action required";
  const selectedPageIssue = selectedPage?.publishingIssue ?? null;
  const selectedPageIssueTitle = selectedPage?.publishingIssueCode === "missing_page_access"
    ? "Facebook Page access is missing"
    : selectedPage?.publishingIssueCode === "expired_page_access"
      ? "Facebook Page access has expired"
      : selectedPage?.publishingIssueCode === "missing_provider_access"
        ? "Provider access is missing"
        : selectedPage?.publishingIssueCode === "expired_provider_access"
          ? "Provider access has expired"
          : selectedPage?.publishingIssueCode === "publishing_disabled"
            ? "Publishing is disabled for this page"
            : selectedPage?.publishingIssueCode === "page_inactive"
              ? "Page is inactive"
              : "Publishing is not ready";

  const draftCount = posts.filter((post) => post.status === "draft").length;
  const scheduledCount = posts.filter((post) => post.status === "scheduled").length;
  const publishedCount = posts.filter((post) => post.status === "published").length;
  const failedCount = posts.filter((post) => post.status === "failed").length;
  const publishingStats = [
    { label: "Draft", value: draftCount, color: "bg-slate-500" },
    { label: "Scheduled", value: scheduledCount, color: "bg-amber-500" },
    { label: "Published", value: publishedCount, color: "bg-emerald-500" },
    { label: "Failed", value: failedCount, color: "bg-rose-500" },
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
            Publishing lane
          </p>
        </div>
        <p className="mt-2 text-2xl font-semibold text-slate-900">
          {posts.length} post{posts.length === 1 ? "" : "s"} in history
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Draft once, then decide whether to publish right away or schedule for the window between 10 minutes and 30 days.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {selectedPage?.label ?? "No page selected"}
          </Badge>
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            Draft limit {DRAFT_CHARACTER_LIMIT}
          </Badge>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {[
            { label: "Draft", icon: FileText, tone: "text-slate-600" },
            { label: "Publish", icon: Send, tone: "text-cyan-700" },
            { label: "Schedule", icon: CalendarDays, tone: "text-amber-700" },
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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Drafts</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{draftCount}</p>
        <p className="mt-2 text-sm text-slate-500">Posts still waiting for a publish action.</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-700">
          <FileText className="h-4 w-4" />
          Composer queue
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scheduled</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{scheduledCount}</p>
        <p className="mt-2 text-sm text-slate-500">Queued to publish at a future time.</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-amber-700">
          <CalendarDays className="h-4 w-4" />
          Calendar lane
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Published / Failed</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          {publishedCount}
          <span className="text-slate-400"> / {failedCount}</span>
        </p>
        <p className="mt-2 text-sm text-slate-500">Live posts versus ones that need attention.</p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-700">
          <Send className="h-4 w-4" />
          Live feed
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
      throw new Error("Choose a page first");
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
      toast.error(requiresMediaRefs ? "Add at least one media URL first" : "Add post content first");
      return;
    }
    try {
      const draft = await createDraft();
      await publishNowMutation.mutateAsync({ postId: draft.id });
      resetComposer();
      toast.success("Post published");
    } catch {
      // handled by individual mutations
    }
  };

  const handleSchedule = async () => {
    if (selectedPage?.provider === "tiktok") {
      toast.error("TikTok does not support scheduled publishing yet");
      return;
    }
    if (!hasRequiredComposerContent) {
      toast.error(requiresMediaRefs ? "Add at least one media URL first" : "Add post content first");
      return;
    }
    if (!isScheduleInRange(scheduledAt)) {
      toast.error("Schedule between 10 minutes and 30 days from now");
      return;
    }

    try {
      const draft = await createDraft();
      await schedulePostMutation.mutateAsync({
        postId: draft.id,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      resetComposer();
      toast.success("Post scheduled");
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
      toast.error("Create or select an Upload-Post profile first");
      return;
    }
    if (!uploadPostHasContent) {
      toast.error("Add post content or media first");
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
      toast.error("Create or select an Upload-Post profile first");
      return;
    }
    if (!uploadPostHasContent) {
      toast.error("Add post content or media first");
      return;
    }
    if (!uploadPostCanSchedule) {
      toast.error("Schedule between 10 minutes and 30 days from now");
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
      title="Social Publishing"
      eyebrow="Content calendar"
      description="Draft a Page post, publish it immediately, or schedule it for later with a history feed that keeps the whole publishing lane visible."
      tone="publishing"
      badge={
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
            {selectedPage ? `${selectedPage.label} · ${selectedPage.provider}` : "No page selected"}
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
          Refresh
        </Button>
      }
      hero={hero}
    >
        {pagesQuery.error || postsQuery.error ? (
          <Card className="border-rose-200 bg-rose-50/90 text-rose-900 shadow-sm">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5" />
              <div>
                <p className="font-semibold">Unable to load publishing data</p>
                <p className="text-sm">
                  {(pagesQuery.error || postsQuery.error)?.message || "The publishing service is currently unavailable."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur">
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg text-slate-900">Publishing gateway</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Choose between the native Meta publishing lane and the Upload-Post universal gateway.
                </p>
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
                    {gateway === "native" ? "Native Meta" : "Upload-Post"}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 border-t border-slate-100 pt-5">
            {publishGateway === "upload_post" ? (
              <div className="space-y-4">
                {uploadPostConnectionQuery.error ? (
                  <Alert className="border-amber-200 bg-amber-50/90 text-amber-900">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Upload-Post is unavailable</AlertTitle>
                    <AlertDescription>
                      {uploadPostConnectionQuery.error.message}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {uploadPostConnectionQuery.isLoading ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Loading Upload-Post connection...
                  </div>
                ) : uploadPostConnectionQuery.data ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Selected profile</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">
                        {uploadPostSelectedProfile?.displayName || uploadPostSelectedProfile?.platformPageId || "No profile selected"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {uploadPostSelectedProfile ? `${uploadPostSelectedProfile.platform} · ${uploadPostSelectedProfile.status}` : "Create one in Settings"}
                      </div>
                    </div>
                    <label className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Profile</span>
                      <select
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                        value={selectedUploadPostProfileId ?? ""}
                        onChange={(event) => setSelectedUploadPostProfileId(event.target.value ? Number(event.target.value) : undefined)}
                      >
                        <option value="" disabled>
                          {uploadPostProfiles.length === 0 ? "No profiles" : "Choose a profile"}
                        </option>
                        {uploadPostProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.displayName || profile.platformPageId} · {profile.platform}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Platform</span>
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
                  Use the composer below, then click the Upload-Post publish buttons to send the same draft through the universal gateway.
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    className="gap-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={() => void handleUploadPostPublishNow()}
                    disabled={uploadPostPublishNowMutation.isPending || !uploadPostSelectedProfile || !uploadPostHasContent}
                  >
                    <Send className="h-4 w-4" />
                    Upload-Post now
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 rounded-xl border-emerald-200 bg-white"
                    onClick={() => void handleUploadPostSchedule()}
                    disabled={uploadPostScheduleMutation.isPending || !uploadPostSelectedProfile || !uploadPostHasContent || !uploadPostCanSchedule}
                  >
                    <CalendarDays className="h-4 w-4" />
                    Upload-Post schedule
                  </Button>
                  <p className="text-sm text-slate-500">
                    {uploadPostJobs.length} Upload-Post job{uploadPostJobs.length === 1 ? "" : "s"} in history.
                  </p>
                </div>

                {uploadPostJobs.length > 0 ? (
                  <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Upload-Post history
                      </p>
                      <Badge className="rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                        {uploadPostJobs.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {uploadPostJobs.slice(0, 3).map((job) => (
                        <div key={job.id} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-emerald-950">{job.contentText || job.contentLink || "Untitled Upload-Post job"}</p>
                            <p className="text-xs text-emerald-700">
                              {job.platform} · {job.status} · {formatRelativeTime(job.createdAt)}
                            </p>
                          </div>
                          <Badge className="rounded-full bg-white text-emerald-700 hover:bg-white">
                            {job.providerJobId ? "Synced" : "Local"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
                Native Meta mode stays unchanged. Use the composer below to draft, publish, or schedule posts for connected Pages.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg text-slate-900">Post Composer</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    Create a draft first, then choose whether to publish it now or schedule it for later.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-slate-500" />
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    {contentLength}/{DRAFT_CHARACTER_LIMIT}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Page</span>
                  <select
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                    value={selectedPageId ?? ""}
                    onChange={(event) => setSelectedPageId(event.target.value ? Number(event.target.value) : undefined)}
                    disabled={pages.length === 0}
                    aria-label="Publishing page"
                  >
                    <option value="" disabled>
                      {pages.length === 0 ? "No publishing pages available" : "Choose a page"}
                    </option>
                    {pages.map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Page status</span>
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
                          {selectedPageReady ? "Ready to publish" : "Action required"}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-500">Select a connected page</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Connected pages
                  </p>
                  <Badge className="rounded-full bg-white/90 text-slate-600 hover:bg-white/90">
                    {pages.length} connected
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
                            {page.provider} · {page.pageCategory || "No category"}
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
                            {ready ? "Ready" : "Needs access"}
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
                      Reconnect the Page or refresh the account access before using auto-post.
                    </span>
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardHeader>

            <CardContent className="space-y-4 border-t border-slate-100 pt-5">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Post content</label>
                <Textarea
                  value={contentText}
                  onChange={(event) => setContentText(event.target.value.slice(0, DRAFT_CHARACTER_LIMIT))}
                  placeholder="Write something thoughtful, clear, and ready for the feed..."
                  className="min-h-44 rounded-2xl border-slate-200 bg-white text-slate-900 shadow-sm"
                />
                <p className="text-xs text-slate-500">
                  Keep it concise and human. You can create a draft first and decide whether to publish immediately or queue it.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_280px]">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Link</span>
                  <Input
                    type="url"
                    value={contentLink}
                    onChange={(event) => setContentLink(event.target.value)}
                    placeholder="https://example.com/article"
                    aria-label="Link"
                    className="h-11 rounded-xl border-slate-200 bg-white"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Schedule time</span>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    aria-label="Schedule time"
                    className="h-11 rounded-xl border-slate-200 bg-white"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Media URLs
                </label>
                <Textarea
                  value={mediaRefsText}
                  onChange={(event) => setMediaRefsText(event.target.value)}
                  placeholder="https://cdn.example.com/video-1.mp4"
                  className="min-h-24 rounded-2xl border-slate-200 bg-white text-slate-900 shadow-sm"
                />
                <p className="text-xs text-slate-500">
                  {requiresMediaRefs
                    ? "TikTok and YouTube publishing require at least one media URL."
                    : "Optional for Meta posts. Separate multiple URLs with a newline or comma."}
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
                  Publish now
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 rounded-xl border-slate-200 bg-white"
                  onClick={() => void handleSchedule()}
                  disabled={isBusy || pages.length === 0 || selectedPage?.provider === "tiktok" || !canAutoPublish}
                >
                  <CalendarDays className="h-4 w-4" />
                  Schedule
                </Button>
                {selectedPage ? (
                  <p className="text-sm text-slate-500">
                    {selectedPageReady
                      ? `${selectedPage.pageName || selectedPage.label} is ready for publishing.`
                      : `${selectedPage.pageName || selectedPage.label} needs access before auto-posting.`}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">No connected page selected yet.</p>
                )}
              </div>

              {selectedPageId ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 text-slate-500" />
                    <div className="space-y-1">
                      <p className="font-medium text-slate-900">Publishing window</p>
                      <p>Schedule posts between 10 minutes and 30 days in the future to stay within Meta's scheduling rules.</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg text-slate-900">Post History</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    Track drafts, scheduled posts, published posts, and failures in one scrollable history feed.
                  </p>
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
                      {status}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="border-t border-slate-100 p-0">
              <div className="overflow-hidden rounded-b-3xl">
                <table className="w-full text-left">
                  <thead className="border-b border-slate-200 bg-slate-50/90 text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Content</th>
                      <th className="px-4 py-3">Page</th>
                      <th className="px-4 py-3">Provider</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Published / Scheduled</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {posts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                          {postsQuery.isLoading ? "Loading posts..." : "No posts found for this view."}
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
                              {truncateText(post.contentText || post.contentLink || "Untitled post", 90)}
                            </p>
                            {post.contentLink ? (
                              <p className="text-xs text-slate-500">{truncateText(post.contentLink, 70)}</p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">{post.pageName || `Page ${post.pageId}`}</td>
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
                              Cancel
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
                  {posts.length} post{posts.length === 1 ? "" : "s"} visible
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-slate-200 bg-white"
                  onClick={() => void postsQuery.fetchNextPage()}
                  disabled={!postsQuery.hasNextPage || postsQuery.isFetchingNextPage}
                >
                  {postsQuery.isFetchingNextPage ? "Loading..." : postsQuery.hasNextPage ? "Load more" : "No more posts"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
    </SocialPageShell>
  );
}
