import { useEffect, useMemo, useState } from "react";
import {
  EyeOff,
  MessageCircleReply,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm/ConfirmProvider";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SocialPageShell } from "@/components/social/SocialPageShell";
import { DashboardCard } from "@/components/dashboard";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  formatCommentStatus,
  formatRelativeTime,
  getCommentStatusTone,
  truncateText,
  type SocialModerationCommentSummary,
  type SocialModerationPageOption,
} from "@/types/social";

const COMMENT_LIMIT = 15;

function CommentStatusBadge({
  status,
}: {
  status: SocialModerationCommentSummary["status"];
}) {
  const { t } = useScopedTranslation("social");

  return (
    <Badge
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getCommentStatusTone(status)}`}
      title={t("moderation.comments.columns.status")}
    >
      {formatCommentStatus(status)}
    </Badge>
  );
}

export default function SocialModeration() {
  const { confirm } = useConfirm();
  const { t } = useScopedTranslation("social");
  const utils = trpc.useUtils();
  const [selectedPageId, setSelectedPageId] = useState<number | undefined>(
    undefined
  );
  const [replyTarget, setReplyTarget] =
    useState<SocialModerationCommentSummary | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const pagesQuery = trpc.socialModeration.listPages.useQuery();
  const commentsQuery = trpc.socialModeration.listComments.useInfiniteQuery(
    {
      pageId: selectedPageId ?? 0,
      limit: COMMENT_LIMIT,
    },
    {
      enabled: selectedPageId !== undefined,
      initialCursor: null,
      refetchInterval: 20_000,
      refetchIntervalInBackground: false,
      getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    }
  );

  const replyMutation = trpc.socialModeration.replyToComment.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialModeration.listPages.invalidate(),
        utils.socialModeration.listComments.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message || t("moderation.toasts.replyFailed"));
    },
  });

  const hideMutation = trpc.socialModeration.hideComment.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialModeration.listPages.invalidate(),
        utils.socialModeration.listComments.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message || t("moderation.toasts.hideFailed"));
    },
  });

  const deleteMutation = trpc.socialModeration.deleteComment.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.socialModeration.listPages.invalidate(),
        utils.socialModeration.listComments.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message || t("moderation.toasts.deleteFailed"));
    },
  });

  const pages = useMemo<SocialModerationPageOption[]>(
    () => pagesQuery.data ?? [],
    [pagesQuery.data]
  );
  useEffect(() => {
    if (selectedPageId !== undefined) return;
    if (pages.length === 0) return;
    setSelectedPageId(pages[0]?.id);
  }, [pages, selectedPageId]);

  useEffect(() => {
    if (selectedPageId === undefined) return;
    if (pages.some(page => page.id === selectedPageId)) return;
    setSelectedPageId(pages[0]?.id);
  }, [pages, selectedPageId]);

  const comments = useMemo(
    () => commentsQuery.data?.pages.flatMap(page => page.items) ?? [],
    [commentsQuery.data?.pages]
  );
  const selectedPage = pages.find(page => page.id === selectedPageId) ?? null;
  const visibleComments = comments.filter(
    comment => comment.status === "visible"
  ).length;
  const hiddenComments = comments.filter(
    comment => comment.status === "hidden"
  ).length;
  const deletedComments = comments.filter(
    comment => comment.status === "deleted"
  ).length;
  const actionedComments = hiddenComments + deletedComments;
  const moderationStats = [
    {
      label: t("moderation.status.visible"),
      value: visibleComments,
      color: "bg-emerald-500",
    },
    {
      label: t("moderation.status.hidden"),
      value: hiddenComments,
      color: "bg-amber-500",
    },
    {
      label: t("moderation.status.deleted"),
      value: deletedComments,
      color: "bg-rose-500",
    },
  ];
  const moderationMax = Math.max(...moderationStats.map(stat => stat.value), 1);
  const hero = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 xl:col-span-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-emerald-600 shadow-sm shadow-emerald-200/60">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {t("moderation.hero.lane")}
          </p>
        </div>
        <p className="mt-2 text-2xl font-semibold text-slate-900">
          {t("moderation.hero.reviewedHere", { count: comments.length })}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          {t("moderation.hero.description")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {selectedPage?.label ?? t("moderation.noPageSelected")}
          </Badge>
          <Badge className="rounded-full bg-white/80 text-slate-700 hover:bg-white/80">
            {t("moderation.hero.actioned", { count: actionedComments })}
          </Badge>
        </div>
        <div className="mt-4 space-y-2">
          {moderationStats.map(stat => (
            <div key={stat.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{stat.label}</span>
                <span>{stat.value}</span>
              </div>
              <div className="h-2 rounded-full bg-white/90">
                <div
                  className={`h-2 rounded-full ${stat.color}`}
                  style={{
                    width: `${Math.max((stat.value / moderationMax) * 100, stat.value > 0 ? 22 : 8)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("moderation.cards.visible.title")}
        </p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          {visibleComments}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {t("moderation.cards.visible.description")}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-700">
          <EyeOff className="h-4 w-4" />
          {t("moderation.cards.visible.footer")}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("moderation.cards.hidden.title")}
        </p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          {hiddenComments}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {t("moderation.cards.hidden.description")}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-amber-700">
          <ShieldAlert className="h-4 w-4" />
          {t("moderation.cards.hidden.footer")}
        </div>
      </div>

      <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/60">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("moderation.cards.deleted.title")}
        </p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          {deletedComments}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {t("moderation.cards.deleted.description")}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-rose-700">
          <Trash2 className="h-4 w-4" />
          {t("moderation.cards.deleted.footer")}
        </div>
      </div>
    </div>
  );

  const closeReply = () => {
    setReplyTarget(null);
    setReplyBody("");
  };

  const sendReply = async () => {
    if (!replyTarget) return;
    if (!replyBody.trim()) {
      toast.error(t("moderation.toasts.addReplyFirst"));
      return;
    }

    try {
      await replyMutation.mutateAsync({
        commentId: replyTarget.id,
        body: replyBody.trim(),
      });
      closeReply();
      toast.success(t("moderation.toasts.replySent"));
    } catch {
      // handled by mutation
    }
  };

  const handleHide = async (commentId: number) => {
    const confirmed = await confirm({ title: t("moderation.confirm.hide") });
    if (!confirmed) return;
    await hideMutation.mutateAsync({ commentId });
  };

  const handleDelete = async (commentId: number) => {
    const confirmed = await confirm({
      title: t("moderation.confirm.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    await deleteMutation.mutateAsync({ commentId });
  };

  return (
    <SocialPageShell
      icon={Users}
      title={t("moderation.title")}
      eyebrow={t("moderation.eyebrow")}
      description={t("moderation.description")}
      tone="moderation"
      badge={
        <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
          {selectedPage ? selectedPage.label : t("moderation.noPageSelected")}
        </Badge>
      }
      actions={
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-xl border-slate-200 bg-white"
          onClick={() => {
            void pagesQuery.refetch();
            void commentsQuery.refetch();
          }}
        >
          <RefreshCcw className="h-4 w-4" />
          {t("moderation.refresh")}
        </Button>
      }
      hero={hero}
    >
      <DashboardCard
        className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur"
        title={t("moderation.pages.title")}
        description={t("moderation.pages.description")}
        trailing={<ShieldAlert className="h-5 w-5 text-slate-400" />}
      >
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {t("moderation.pages.page")}
              </span>
              <select
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                value={selectedPageId ?? ""}
                onChange={event =>
                  setSelectedPageId(
                    event.target.value ? Number(event.target.value) : undefined
                  )
                }
                disabled={pages.length === 0}
                aria-label={t("moderation.pages.page")}
              >
                <option value="" disabled>
                  {pages.length === 0
                    ? t("moderation.pages.noPages")
                    : t("moderation.pages.pagePlaceholder")}
                </option>
                {pages.map(page => (
                  <option key={page.id} value={page.id}>
                    {page.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {t("moderation.pages.pageStatus")}
              </span>
              <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
                {selectedPage ? (
                  <Badge className="rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                    {selectedPage.status}
                  </Badge>
                ) : (
                  <span className="text-sm text-slate-500">
                    {t("moderation.pages.selectConnectedPage")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard
        className="border-slate-200/80 bg-white/85 shadow-lg shadow-slate-200/60 backdrop-blur"
        title={t("moderation.comments.title")}
        description={t("moderation.comments.description")}
        trailing={
          <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
            {t("moderation.comments.shown", { count: comments.length })}
          </Badge>
        }
        bodyClassName="space-y-4"
      >
        {comments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm text-slate-500">
            {t("moderation.comments.empty")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 bg-white">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {t("moderation.comments.columns.author")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {t("moderation.comments.columns.comment")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {t("moderation.comments.columns.post")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {t("moderation.comments.columns.status")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {t("moderation.comments.columns.date")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {t("moderation.comments.columns.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comments.map(comment => (
                  <tr key={comment.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-4 align-top">
                      <div className="font-medium text-slate-900">
                        {comment.authorDisplayName ||
                          t("moderation.comments.unknownAuthor")}
                      </div>
                      <div className="text-xs text-slate-500">
                        #{comment.id}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-slate-600">
                      {truncateText(comment.body || "", 88)}
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-slate-600">
                      {comment.providerObjectId || "—"}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <CommentStatusBadge status={comment.status} />
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-slate-500">
                      {formatRelativeTime(comment.createdAt)}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-2 rounded-lg border-slate-200 bg-white"
                          onClick={() => {
                            setReplyTarget(comment);
                            setReplyBody("");
                          }}
                        >
                          <MessageCircleReply className="h-4 w-4" />
                          {t("moderation.comments.reply")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-2 rounded-lg border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                          onClick={() => void handleHide(comment.id)}
                        >
                          <EyeOff className="h-4 w-4" />
                          {t("moderation.comments.hide")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-2 rounded-lg border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                          onClick={() => void handleDelete(comment.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("moderation.comments.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {commentsQuery.hasNextPage ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-slate-200 bg-white"
              onClick={() => commentsQuery.fetchNextPage()}
              disabled={commentsQuery.isFetchingNextPage}
            >
              {commentsQuery.isFetchingNextPage
                ? t("moderation.comments.loading")
                : t("moderation.comments.loadMore")}
            </Button>
          </div>
        ) : null}
      </DashboardCard>
      {replyTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
                  {t("moderation.replyDialog.title")}
                </div>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">
                  {replyTarget.authorDisplayName ||
                    t("moderation.comments.unknownAuthor")}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {truncateText(replyTarget.body || "", 140)}
                </p>
              </div>
              <Button type="button" variant="ghost" onClick={closeReply}>
                {t("moderation.replyDialog.close")}
              </Button>
            </div>

            <div className="mt-5 space-y-2">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                {t("moderation.replyDialog.message")}
              </label>
              <Textarea
                value={replyBody}
                onChange={event =>
                  setReplyBody(event.target.value.slice(0, 2000))
                }
                placeholder={t("moderation.replyDialog.placeholder")}
                aria-label={t("moderation.replyDialog.message")}
                className="min-h-40 rounded-2xl border-slate-200 bg-white text-slate-900 shadow-sm"
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <Button type="button" variant="outline" onClick={closeReply}>
                {t("moderation.replyDialog.cancel")}
              </Button>
              <Button
                type="button"
                className="gap-2 rounded-xl"
                onClick={() => void sendReply()}
                disabled={replyMutation.isPending}
              >
                <MessageCircleReply className="h-4 w-4" />
                {t("moderation.replyDialog.send")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </SocialPageShell>
  );
}
