import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AlertCircle, BookOpen, Clock, Image, Library, Loader2, Plus, RefreshCcw, Send, Sparkles, Trash2, Users, Video } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { SafeHtml } from "@/components/ui/SafeHtml";
import { SkillAgencySelector } from "@/components/media/composer/SkillAgencySelector";
import { ContentTargetPicker } from "@/components/media/composer/ContentTargetPicker";
import { SocialPlatformPicker } from "@/components/media/composer/SocialPlatformPicker";
import { SocialAccountPicker, type SocialAccountPickerItem } from "@/components/media/composer/SocialAccountPicker";
import { composerReducer, initialComposerState } from "@/components/media/composerReducer";
import type { SocialPublishingPageOption } from "@/types/social";

import { generateArticleDraftHtml, makeComposerStateFromDraft, makeSaveDraftInput } from "./contentComposerPanelHelpers";

type AttachmentSource = "history" | "library" | "shared_groups";
type AttachmentMediaType = "image" | "video";

function parseComposerSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split("\n");
  let event = "message";
  const dataParts: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || event;
    } else if (line.startsWith("data:")) {
      dataParts.push(line.slice("data:".length).trim());
    }
  }

  if (dataParts.length === 0) {
    return null;
  }

  return { event, data: dataParts.join("\n") };
}

export interface ContentComposerPanelProps {
  className?: string;
}

export function ContentComposerPanel({ className }: ContentComposerPanelProps) {
  const { user } = useAuth();
  const { t } = useScopedTranslation(["media", "common"]);
  const utils = trpc.useUtils();
  const [state, dispatch] = useReducer(composerReducer, initialComposerState);
  const [draftSearch, setDraftSearch] = useState("");
  const [attachmentSearch, setAttachmentSearch] = useState("");
  const [attachmentSource, setAttachmentSource] = useState<AttachmentSource>("library");
  const [attachmentMediaType, setAttachmentMediaType] = useState<AttachmentMediaType>("image");
  const [attachmentLabels, setAttachmentLabels] = useState<Record<number, string>>({});
  const hydrateGuard = useRef<string | null>(null);
  const prevSocialTargetIdRef = useRef<number | null>(null);

  const draftsQuery = trpc.contentComposer.listDrafts.useQuery({ limit: 20 });
  const selectedDraftQuery = trpc.contentComposer.getDraft.useQuery(
    { id: state.activeDraftId ?? "" },
    { enabled: Boolean(state.activeDraftId) },
  );
  const librarySearchQuery = trpc.library.search.useQuery(
    {
      query: attachmentSearch.trim() || undefined,
      limit: 20,
      scope: attachmentSource === "shared_groups" ? "shared_groups" : "all",
      filters: {
        itemType: attachmentMediaType,
        status: "ready",
      },
    },
    { enabled: attachmentSource !== "history" },
  );
  const mediaHistoryQuery = trpc.media.listTasks.useQuery(
    {
      mediaType: attachmentMediaType,
      status: "completed",
      limit: 20,
      daysAgo: 12,
    },
    {
      enabled: attachmentSource === "history",
      refetchOnWindowFocus: false,
    },
  );
  const socialPagesQuery = trpc.socialPublishing.listPages.useQuery(undefined, {
    enabled: state.destinationKind === "social" && state.socialPlatform !== "upload_post",
  });
  const uploadPostConnectionQuery = trpc.uploadPost.getConnection.useQuery(undefined, {
    enabled: state.destinationKind === "social" && state.socialPlatform === "upload_post",
  });
  const docsTargetsQuery = trpc.contentComposer.listDocsTargets.useQuery(undefined, {
    enabled: Boolean(user && (user.role === "admin" || user.role === "domain_admin") && state.destinationKind === "docs"),
  });
  const blogTargetsQuery = trpc.contentComposer.listBlogTargets.useQuery(undefined, {
    enabled: Boolean(user && (user.role === "admin" || user.role === "domain_admin") && state.destinationKind === "blog"),
  });
  const generateCaptionMutation = trpc.contentComposer.generateSocialCaption.useMutation();
  const addTaskToLibraryMutation = trpc.media.addTaskToLibrary.useMutation({
    onSuccess: async () => {
      await utils.library.search.invalidate();
    },
  });
  const publishMutation = trpc.contentComposer.publish.useMutation({
    onSuccess: async () => {
      dispatch({ type: "PUBLISH_COMPLETE" });
      await Promise.all([
        utils.contentComposer.listDrafts.invalidate(),
        state.activeDraftId ? utils.contentComposer.getDraft.invalidate({ id: state.activeDraftId }) : Promise.resolve(),
      ]);
      toast.success(t("contentComposer.toasts.published"));
    },
    onError: (error) => {
      dispatch({ type: "PUBLISH_ERROR", payload: error.message || t("contentComposer.errors.publishFailed") });
      toast.error(error.message || t("contentComposer.errors.publishFailed"));
    },
  });
  const canUsePrivilegedDestinations = user?.role === "admin" || user?.role === "domain_admin";
  const destinationOptions = canUsePrivilegedDestinations ? (["docs", "blog", "social"] as const) : (["social"] as const);

  const docsTargetItems = useMemo(() => {
    const items = docsTargetsQuery.data ?? [];
    if (state.docsSubKind === "doc_page") {
      return items.filter((item) => item.pageKey?.startsWith("docs-"));
    }
    if (state.docsSubKind === "cms_page") {
      return items.filter((item) => !item.pageKey?.startsWith("docs-"));
    }
    return items;
  }, [docsTargetsQuery.data, state.docsSubKind]);

  const blogTargetItems = useMemo(() => blogTargetsQuery.data ?? [], [blogTargetsQuery.data]);

  const saveDraftMutation = trpc.contentComposer.saveDraft.useMutation({
    onSuccess: async (result) => {
      if (!state.activeDraftId) {
        dispatch({ type: "DRAFT_CREATED", payload: result.id });
      }
      dispatch({ type: "SAVE_COMPLETE", payload: new Date(result.updatedAt) });
      await utils.contentComposer.listDrafts.invalidate();
    },
    onError: (error) => {
      dispatch({ type: "SAVE_ERROR" });
      toast.error(error.message || t("contentComposer.errors.saveFailed"));
    },
  });

  const deleteDraftMutation = trpc.contentComposer.deleteDraft.useMutation({
    onSuccess: async () => {
      await utils.contentComposer.listDrafts.invalidate();
      toast.success(t("contentComposer.toasts.draftDeleted"));
      dispatch({ type: "START_NEW_DRAFT" });
    },
    onError: (error) => toast.error(error.message || t("contentComposer.errors.deleteFailed")),
  });

  useEffect(() => {
    if (!selectedDraftQuery.data) return;
    if (hydrateGuard.current === selectedDraftQuery.data.id) return;
    if (state.isDirty) return;
    hydrateGuard.current = selectedDraftQuery.data.id;
    dispatch({ type: "RESUME_DRAFT", payload: makeComposerStateFromDraft(selectedDraftQuery.data) });
  }, [selectedDraftQuery.data, state.isDirty]);

  useEffect(() => {
    const hasMeaningfulContent =
      Boolean(state.topic.trim()) ||
      Boolean(state.articleBody.trim()) ||
      state.attachmentIds.length > 0 ||
      Boolean(state.destinationKind) ||
      Boolean(state.docsTargetId) ||
      Boolean(state.blogTargetId) ||
      Boolean(state.socialTargetId);

    if (!hasMeaningfulContent) return;
    if (!state.isDirty || state.isSaving || state.isGenerating) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: "SAVE_START" });
      saveDraftMutation.mutate(makeSaveDraftInput(state));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state, saveDraftMutation]);

  const draftItems = draftsQuery.data?.drafts ?? [];
  const filteredDraftItems = draftSearch.trim()
    ? draftItems.filter((draft) => draft.topic.toLowerCase().includes(draftSearch.toLowerCase()))
    : draftItems;

  const attachmentResults = useMemo(() => {
    const results = librarySearchQuery.data?.results ?? [];
    return results.filter((item) => {
      const itemType = String(item.item_type ?? "").toLowerCase();
      const status = String(item.status ?? "").toLowerCase();
      return (itemType === "image" || itemType === "video") && status === "ready";
    });
  }, [librarySearchQuery.data?.results]);

  const selectedAttachmentBadges = useMemo(() => {
    const map = new Map<number, (typeof attachmentResults)[number]>();
    for (const item of attachmentResults) {
      const id = Number(item.item_id);
      map.set(id, item);
    }
    return state.attachmentIds.map((id) => ({
      id,
      title: String(map.get(id)?.title ?? attachmentLabels[id] ?? id),
    }));
  }, [attachmentLabels, state.attachmentIds, attachmentResults]);

  const handleAttachHistoryTask = async (task: { id: string; prompt?: string | null; model?: string | null }) => {
    try {
      const result = await addTaskToLibraryMutation.mutateAsync({
        taskId: task.id,
        title: task.prompt?.trim() || task.model?.trim() || t("contentComposer.attachments.historyAsset"),
      });
      const itemId = Number(result.itemId);
      if (Number.isFinite(itemId) && !state.attachmentIds.includes(itemId)) {
        setAttachmentLabels((prev) => ({
          ...prev,
          [itemId]: task.prompt?.trim() || task.model?.trim() || t("contentComposer.attachments.historyAsset"),
        }));
        dispatch({ type: "TOGGLE_ATTACHMENT", payload: itemId });
      }
      toast.success(t("contentComposer.toasts.historyAttached"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("contentComposer.errors.attachHistoryFailed"));
    }
  };

  const nativePages = (socialPagesQuery.data ?? []) as SocialPublishingPageOption[];
  const socialAccountItems = useMemo<SocialAccountPickerItem[]>(() => {
    if (state.socialPlatform === "upload_post") {
      const profiles = uploadPostConnectionQuery.data?.profiles ?? [];
      return profiles.map((profile) => ({
        id: profile.id,
        label: profile.displayName || profile.platformPageId || `Profile ${profile.id}`,
        provider: profile.platform,
        ready: true,
      }));
    }

    return nativePages
      .filter((page) => page.provider === state.socialPlatform)
      .map((page) => ({
        id: page.id,
        label: page.label,
        provider: page.provider,
        ready: page.publishingReady !== false,
        issue: page.publishingIssue ?? undefined,
      }));
  }, [nativePages, state.socialPlatform, uploadPostConnectionQuery.data?.profiles]);

  const socialTargetReady = useMemo(() => {
    const selected = socialAccountItems.find((item) => item.id === state.socialTargetId);
    return selected ? selected.ready : false;
  }, [socialAccountItems, state.socialTargetId]);

  useEffect(() => {
    const targetChanged = state.socialTargetId !== prevSocialTargetIdRef.current;
    prevSocialTargetIdRef.current = state.socialTargetId;

    if (!targetChanged) return;
    if (state.destinationKind !== "social") return;
    if (!state.socialTargetId || !state.socialPlatform) return;
    if (state.captionIsManuallyEdited || state.socialCaption.trim()) return;
    if (generateCaptionMutation.isPending) return;

    generateCaptionMutation.mutate({
      topic: state.topic,
      articleBody: state.articleBody,
      socialPlatform: state.socialPlatform,
      attachmentCount: state.attachmentIds.length,
      requiresWebSearch: state.requiresWebSearch,
      requiresThinking: state.requiresThinking,
    }, {
      onSuccess: (result) => {
        dispatch({ type: "CAPTION_GENERATION_COMPLETE", payload: result.caption });
      },
      onError: (error) => toast.error(error.message || t("contentComposer.errors.captionFailed")),
    });
  }, [
    state.articleBody,
    state.captionIsManuallyEdited,
    state.destinationKind,
    state.attachmentIds.length,
    state.requiresThinking,
    state.requiresWebSearch,
    state.socialCaption,
    state.socialPlatform,
    state.socialTargetId,
    state.topic,
    generateCaptionMutation,
  ]);

  const canPublish = Boolean(
    state.topic.trim() &&
      state.articleBody.trim() &&
      state.destinationKind &&
      state.attachmentIds.length > 0 &&
      (state.executionSource === "skill" ? Boolean(state.skillId) : Boolean(state.agencyId)) &&
      (canUsePrivilegedDestinations || state.destinationKind === "social") &&
      (state.destinationKind !== "social" || (state.socialPlatform && state.socialTargetId && socialTargetReady)) &&
      (state.destinationKind !== "docs" || Boolean(state.docsTargetId)) &&
      (state.destinationKind !== "blog" || Boolean(state.blogTargetId)),
  );

  const handleGenerateArticle = () => {
    if (!state.topic.trim()) {
      toast.error(t("contentComposer.errors.topicRequired"));
      return;
    }

    const startingArticle = state.articleBody;
    const shouldHydrateCaption = state.destinationKind === "social" && !state.captionIsManuallyEdited && !state.socialCaption.trim();

    const run = async () => {
      dispatch({ type: "START_GENERATION" });
      dispatch({ type: "SET_ARTICLE_BODY", payload: "" });

      let finalArticle = "";
      let generatedCaption = "";
      let sawChunk = false;

      try {
        const resp = await fetch("/api/content-composer/generate-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: state.topic,
            executionSource: state.executionSource,
            skillId: state.skillId,
            agencyId: state.agencyId,
            agencyName: state.agencyName,
            requiresWebSearch: state.requiresWebSearch,
            requiresThinking: state.requiresThinking,
            articleBody: state.articleBody,
            socialPlatform: state.socialPlatform,
            attachmentCount: state.attachmentIds.length,
          }),
        });

        if (!resp.ok || !resp.body) {
          const message = await resp.text().catch(() => t("contentComposer.errors.generateFailed"));
          throw new Error(message || t("contentComposer.errors.generateFailed"));
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const boundary = buffer.indexOf("\n\n");
            if (boundary < 0) break;
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const parsed = parseComposerSseBlock(block);
            if (!parsed) continue;
            if (parsed.event === "error") {
              let message = t("contentComposer.errors.generateFailed");
              try {
                const payload = JSON.parse(parsed.data) as { message?: string };
                if (typeof payload.message === "string" && payload.message.trim()) {
                  message = payload.message.trim();
                }
              } catch {
                // ignore parse issues and fall back to the generic message
              }
              throw new Error(message);
            }
            if (parsed.data === "[DONE]") {
              continue;
            }

            if (parsed.event === "article_chunk" || parsed.event === "message") {
              try {
                const payload = JSON.parse(parsed.data) as { delta?: string };
                if (typeof payload.delta === "string" && payload.delta.length > 0) {
                  sawChunk = true;
                  finalArticle += payload.delta;
                  dispatch({ type: "STREAMING_CHUNK", payload: payload.delta });
                }
              } catch {
                // ignore malformed chunks
              }
            } else if (parsed.event === "article") {
              try {
                const payload = JSON.parse(parsed.data) as { html?: string };
                if (typeof payload.html === "string") {
                  finalArticle = payload.html;
                  dispatch({ type: "SET_ARTICLE_BODY", payload: payload.html });
                }
              } catch {
                // ignore malformed article payloads
              }
            } else if (parsed.event === "caption") {
              try {
                const payload = JSON.parse(parsed.data) as { caption?: string };
                if (typeof payload.caption === "string") {
                  generatedCaption = payload.caption;
                }
              } catch {
                // ignore malformed caption payloads
              }
            } else if (parsed.event === "done") {
              // no-op
            }
          }
        }

        const trimmedArticle = finalArticle.trim();
        if (trimmedArticle) {
          dispatch({ type: "SET_ARTICLE_BODY", payload: trimmedArticle });
        } else if (!sawChunk && startingArticle) {
          dispatch({ type: "SET_ARTICLE_BODY", payload: startingArticle });
          throw new Error(t("contentComposer.errors.noGeneratedArticle"));
        }

        if (shouldHydrateCaption && generatedCaption.trim()) {
          dispatch({ type: "CAPTION_GENERATION_COMPLETE", payload: generatedCaption.trim() });
        }

        dispatch({ type: "GENERATION_COMPLETE" });
        dispatch({ type: "GO_TO_STEP", payload: 2 });
        toast.success(t("contentComposer.toasts.articleGenerated"));
      } catch (error) {
        if (!sawChunk && startingArticle) {
          dispatch({ type: "SET_ARTICLE_BODY", payload: startingArticle });
        }
        const message = error instanceof Error ? error.message : t("contentComposer.errors.generateFailed");
        dispatch({ type: "GENERATION_ERROR", payload: message });
        toast.error(message);
      }
    };

    void run();
  };

  const handlePublish = async () => {
      if (!canPublish) {
      toast.error(t("contentComposer.errors.completeRequired"));
      return;
    }

    dispatch({ type: "PUBLISH_START" });
    try {
      const saved = await saveDraftMutation.mutateAsync(makeSaveDraftInput(state));
      if (!state.activeDraftId) {
        dispatch({ type: "DRAFT_CREATED", payload: saved.id });
      }
      await publishMutation.mutateAsync({ id: saved.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("contentComposer.errors.publishFailed");
      dispatch({ type: "PUBLISH_ERROR", payload: message });
      toast.error(message);
    }
  };

  return (
    <div className={cn("space-y-6", className)} data-content-composer-panel="true">
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)_380px] lg:items-start">
        <DashboardCard className="h-fit lg:sticky lg:top-24">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base">{t("contentComposer.drafts.title")}</h3>
              <Button
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => dispatch({ type: "START_NEW_DRAFT" })}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("contentComposer.drafts.newArticle")}
              </Button>
            </div>
            <Input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder={t("contentComposer.drafts.searchPlaceholder")} />
          </div>
          <div>
            <ScrollArea className="h-[320px] pr-3 sm:h-[460px]">
              <div className="space-y-2">
                {filteredDraftItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("contentComposer.drafts.empty")}</p>
                ) : (
                  filteredDraftItems.map((draft) => (
                    <div
                      key={draft.id}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/60",
                        state.activeDraftId === draft.id && "border-cyan-400 bg-cyan-50/60",
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={() => dispatch({ type: "DRAFT_CREATED", payload: draft.id })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          dispatch({ type: "DRAFT_CREATED", payload: draft.id });
                        }
                      }}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <p className="min-w-0 truncate text-sm font-medium">{draft.topic || t("contentComposer.drafts.untitled")}</p>
                        <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                          <Badge variant="outline" className="text-[10px]">
                            {draft.status}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteDraftMutation.mutate({ id: draft.id });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("contentComposer.drafts.updated", { date: new Date(draft.updatedAt).toLocaleString() })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {draft.destinationKind ?? t("contentComposer.drafts.noDestination")} • {t("contentComposer.drafts.attachmentCount", { count: draft.attachmentCount })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DashboardCard>

        <div className="min-w-0 space-y-6 lg:contents">
          <DashboardCard className="lg:col-start-2 lg:row-start-1">
            <div>
              <h3 className="text-base">{t("contentComposer.editor.title")}</h3>
              <p className="text-sm text-muted-foreground">{t("contentComposer.editor.description")}</p>
            </div>
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">{t("contentComposer.editor.topic")}</label>
                  <Textarea
                    value={state.topic}
                    onChange={(event) => dispatch({ type: "SET_TOPIC", payload: event.target.value })}
                    placeholder={t("contentComposer.editor.topicPlaceholder")}
                    className="min-h-[120px]"
                  />
                </div>
                <SkillAgencySelector
                  executionSource={state.executionSource}
                  skillId={state.skillId}
                  agencyId={state.agencyId}
                  agencyName={state.agencyName}
                  topic={state.topic}
                  dispatch={dispatch}
                  className="md:col-span-2"
                />
                <div className="flex flex-wrap gap-3 md:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={state.requiresWebSearch}
                      onChange={() => dispatch({ type: "TOGGLE_WEB_SEARCH" })}
                    />
                    {t("contentComposer.editor.webSearch")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={state.requiresThinking}
                      onChange={() => dispatch({ type: "TOGGLE_THINKING" })}
                    />
                    {t("contentComposer.editor.thinking")}
                  </label>
                </div>
                <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row sm:flex-wrap">
                  <Button
                    className="w-full sm:w-auto"
                    onClick={handleGenerateArticle}
                    disabled={
                      !state.topic.trim() ||
                      state.isGenerating ||
                      (state.executionSource === "skill" ? !state.skillId : !state.agencyId)
                    }
                  >
                    {state.isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    {t("contentComposer.editor.generateArticle")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => dispatch({ type: "SET_ARTICLE_BODY", payload: generateArticleDraftHtml(state) })}
                    disabled={!state.topic.trim()}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {t("contentComposer.editor.regeneratePreview")}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-medium">{t("contentComposer.editor.articleHtml")}</h3>
                  <Badge variant="outline">{t("contentComposer.editor.charCount", { count: state.articleBody.length.toLocaleString() })}</Badge>
                </div>
                <Textarea
                  value={state.articleBody}
                  onChange={(event) => dispatch({ type: "SET_ARTICLE_BODY", payload: event.target.value })}
                  placeholder={t("contentComposer.editor.articlePlaceholder")}
                  className="min-h-[220px] font-mono text-sm"
                />
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <BookOpen className="h-4 w-4 text-cyan-600" />
                    {t("contentComposer.editor.preview")}
                  </div>
                  {state.articleBody.trim() ? (
                    <SafeHtml html={state.articleBody} profile="article" className="prose max-w-none" />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("contentComposer.editor.previewEmpty")}</p>
                  )}
                </div>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard className="lg:sticky lg:top-24 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            <div>
              <h3 className="text-base">{t("contentComposer.attachments.title")}</h3>
            </div>
            <div className="space-y-4">
              <Tabs value={attachmentMediaType} onValueChange={(value) => setAttachmentMediaType(value as AttachmentMediaType)}>
                <TabsList className="grid h-auto w-full grid-cols-2 bg-muted/50 p-1">
                  <TabsTrigger value="image" className="min-w-0 gap-1 px-2 py-2 text-xs sm:gap-2 sm:text-sm">
                    <Image className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("tabs.image")}</span>
                  </TabsTrigger>
                  <TabsTrigger value="video" className="min-w-0 gap-1 px-2 py-2 text-xs sm:gap-2 sm:text-sm">
                    <Video className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("tabs.video")}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs value={attachmentSource} onValueChange={(value) => setAttachmentSource(value as AttachmentSource)}>
                <TabsList className="grid h-auto w-full grid-cols-3 bg-muted/50 p-1">
                  <TabsTrigger value="history" className="min-w-0 gap-1 px-2 py-2 text-xs sm:gap-2 sm:text-sm">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("contentComposer.attachments.mediaHistory")}</span>
                  </TabsTrigger>
                  <TabsTrigger value="library" className="min-w-0 gap-1 px-2 py-2 text-xs sm:gap-2 sm:text-sm">
                    <Library className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("contentComposer.attachments.library")}</span>
                  </TabsTrigger>
                  <TabsTrigger value="shared_groups" className="min-w-0 gap-1 px-2 py-2 text-xs sm:gap-2 sm:text-sm">
                    <Users className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("contentComposer.attachments.sharedGroups")}</span>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="history" className="mt-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {t("contentComposer.attachments.historyHint", { type: t(`tabs.${attachmentMediaType}`) })}
                  </p>
                </TabsContent>
                <TabsContent value="library" className="mt-4 space-y-3">
                  <Input value={attachmentSearch} onChange={(event) => setAttachmentSearch(event.target.value)} placeholder={t("contentComposer.attachments.searchLibrary", { type: t(`tabs.${attachmentMediaType}`) })} />
                </TabsContent>
                <TabsContent value="shared_groups" className="mt-4 space-y-3">
                  <Input value={attachmentSearch} onChange={(event) => setAttachmentSearch(event.target.value)} placeholder={t("contentComposer.attachments.searchShared", { type: t(`tabs.${attachmentMediaType}`) })} />
                </TabsContent>
              </Tabs>
              <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>{t("contentComposer.attachments.hint")}</p>
                <Badge variant="outline">{t("contentComposer.attachments.selectedCount", { count: state.attachmentIds.length })}</Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedAttachmentBadges.map((item) => (
                  <Badge key={String(item.id)} variant="secondary" className="max-w-full gap-1">
                    <span className="truncate">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "TOGGLE_ATTACHMENT", payload: item.id })}
                      className="ml-1 rounded-full"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              {attachmentSource === "history" && (
                <div className="space-y-2">
                  {mediaHistoryQuery.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("contentComposer.attachments.loadingHistory")}
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {((mediaHistoryQuery.data?.tasks ?? []) as Array<{ id: string; prompt?: string | null; model?: string | null; resultUrl?: string | null }>).map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        className="rounded-xl border p-3 text-left transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void handleAttachHistoryTask(task)}
                        disabled={addTaskToLibraryMutation.isPending || !task.resultUrl}
                      >
                        {task.resultUrl && (
                          attachmentMediaType === "video" ? (
                            <video src={task.resultUrl} className="mb-2 aspect-video w-full rounded-lg object-cover" muted controls />
                          ) : (
                            <img src={task.resultUrl} alt={task.prompt || t("contentComposer.attachments.historyAsset")} className="mb-2 aspect-video w-full rounded-lg object-cover" />
                          )
                        )}
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.prompt || task.model || t("contentComposer.attachments.historyAsset")}</span>
                          <Badge variant="outline" className="text-[10px]">{t("contentComposer.attachments.historyBadge")}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{t("contentComposer.attachments.saveAndAdd")}</p>
                      </button>
                    ))}
                  </div>
                  {!mediaHistoryQuery.isLoading && (mediaHistoryQuery.data?.tasks ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("contentComposer.attachments.noHistory")}</p>
                  )}
                </div>
              )}

              {attachmentSource !== "history" && (
                <div className="space-y-2">
                  {librarySearchQuery.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("contentComposer.attachments.searchingLibrary")}
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {attachmentResults.map((item) => {
                      const itemId = Number(item.item_id);
                      const selected = state.attachmentIds.includes(itemId);
                      return (
                        <button
                          key={itemId}
                          type="button"
                          className={cn(
                            "rounded-xl border p-3 text-left transition-colors hover:bg-muted/60",
                            selected && "border-cyan-400 bg-cyan-50/60",
                          )}
                          onClick={() => {
                            setAttachmentLabels((prev) => ({
                              ...prev,
                              [itemId]: String(item.title ?? itemId),
                            }));
                            dispatch({ type: "TOGGLE_ATTACHMENT", payload: itemId });
                          }}
                        >
                          {item.thumbnail_url || item.source_url ? (
                            attachmentMediaType === "video" ? (
                              <video src={item.source_url || item.thumbnail_url || ""} className="mb-2 aspect-video w-full rounded-lg object-cover" muted controls />
                            ) : (
                              <img
                                src={item.thumbnail_url || item.source_url || ""}
                                alt={String(item.title ?? itemId)}
                                className="mb-2 aspect-video w-full rounded-lg object-cover"
                              />
                            )
                          ) : null}
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{String(item.title ?? itemId)}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {String(item.item_type ?? "asset")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selected ? t("contentComposer.attachments.remove") : t("contentComposer.attachments.add")}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {!librarySearchQuery.isLoading && attachmentResults.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("contentComposer.attachments.noReadyAssets")}</p>
                  )}
                </div>
              )}
            </div>
          </DashboardCard>

          <DashboardCard className="lg:col-start-2 lg:row-start-2">
            <div>
              <h3 className="text-base">{t("contentComposer.destination.title")}</h3>
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {destinationOptions.map((destination) => (
                  <Button
                    key={destination}
                    type="button"
                    className="w-full sm:w-auto"
                    variant={state.destinationKind === destination ? "default" : "outline"}
                    onClick={() => dispatch({ type: "SET_DESTINATION_KIND", payload: destination })}
                  >
                    {destination}
                  </Button>
                ))}
              </div>

              {state.destinationKind === "docs" && (
                <div className="space-y-4 rounded-2xl border bg-slate-50/60 p-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">{t("contentComposer.destination.docsTargetType")}</div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "doc_page" as const, label: t("contentComposer.destination.docPage") },
                        { value: "cms_page" as const, label: t("contentComposer.destination.cmsPage") },
                      ].map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant={state.docsSubKind === option.value ? "default" : "outline"}
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={() => dispatch({ type: "SET_DOCS_SUB_KIND", payload: option.value })}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <ContentTargetPicker
                    title={t("contentComposer.destination.docsTarget")}
                    items={docsTargetItems.map((item) => ({
                      id: item.id,
                      label: item.label,
                      providerLabel: item.pageKey,
                      ready: Boolean(item.isPublished),
                      detail: item.path,
                    }))}
                    selectedId={state.docsTargetId}
                    onSelect={(id) => dispatch({ type: "SET_DOCS_TARGET_ID", payload: id })}
                    emptyMessage={t("contentComposer.destination.noDocsTargets")}
                  />
                </div>
              )}

              {state.destinationKind === "blog" && (
                <div className="space-y-4 rounded-2xl border bg-slate-50/60 p-4">
                  <ContentTargetPicker
                    title={t("contentComposer.destination.blogTarget")}
                    items={blogTargetItems.map((item) => ({
                      id: item.id,
                      label: item.label,
                      providerLabel: item.isPublished ? t("contentComposer.status.published") : t("contentComposer.status.draft"),
                      ready: Boolean(item.isPublished),
                      detail: item.path,
                    }))}
                    selectedId={state.blogTargetId}
                    onSelect={(id) => dispatch({ type: "SET_BLOG_TARGET_ID", payload: id })}
                    emptyMessage={t("contentComposer.destination.noBlogTargets")}
                  />
                </div>
              )}

              {state.destinationKind === "social" && (
                <div className="space-y-4 rounded-2xl border bg-slate-50/60 p-4">
                  <SocialPlatformPicker
                    value={state.socialPlatform}
                    onChange={(value) => {
                      dispatch({ type: "SET_SOCIAL_PLATFORM", payload: value });
                      dispatch({ type: "SET_SOCIAL_TARGET_ID", payload: null });
                    }}
                  />

                  <SocialAccountPicker
                    items={socialAccountItems}
                    selectedId={state.socialTargetId}
                    onSelect={(id) => dispatch({ type: "SET_SOCIAL_TARGET_ID", payload: id })}
                    emptyMessage={state.socialPlatform === "upload_post" ? t("contentComposer.destination.noUploadPostProfiles") : t("contentComposer.destination.noSocialPages")}
                  />

                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h4 className="text-sm font-medium">{t("contentComposer.destination.socialCaption")}</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          generateCaptionMutation.mutate(
                            {
                              topic: state.topic,
                              articleBody: state.articleBody,
                              socialPlatform: state.socialPlatform,
                              attachmentCount: state.attachmentIds.length,
                              requiresWebSearch: state.requiresWebSearch,
                              requiresThinking: state.requiresThinking,
                            },
                            {
                              onSuccess: (result) => {
                                dispatch({ type: "SET_SOCIAL_CAPTION", payload: result.caption });
                                dispatch({ type: "SET_CAPTION_MANUALLY_EDITED", payload: false });
                              },
                              onError: (error) => toast.error(error.message || t("contentComposer.errors.captionFailed")),
                            },
                          );
                        }}
                        disabled={generateCaptionMutation.isPending}
                      >
                        {generateCaptionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        {t("contentComposer.destination.generateCaption")}
                      </Button>
                    </div>
                    <Textarea
                      value={state.socialCaption}
                      onChange={(event) => dispatch({ type: "SET_SOCIAL_CAPTION", payload: event.target.value })}
                      placeholder={t("contentComposer.destination.captionPlaceholder")}
                      className="min-h-[110px]"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => {
                    if (!state.topic.trim() && !state.articleBody.trim() && state.attachmentIds.length === 0 && !state.destinationKind && !state.socialTargetId && !state.blogTargetId && !state.docsTargetId) {
                      toast.error(t("contentComposer.errors.addContentBeforeSave"));
                      return;
                    }
                    saveDraftMutation.mutate(makeSaveDraftInput(state));
                  }}
                  variant="outline"
                  disabled={state.isSaving || state.isGenerating}
                >
                  {t("contentComposer.destination.saveDraft")}
                </Button>
                <Button className="w-full sm:w-auto" onClick={handlePublish} disabled={!canPublish || state.isPublishing || publishMutation.isPending}>
                  {state.isPublishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {t("contentComposer.destination.publish")}
                </Button>
              </div>

              {state.publishError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mr-2 inline-block h-4 w-4" />
                  {state.publishError}
                </div>
              )}
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
