import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AlertCircle, BookOpen, Loader2, Plus, RefreshCcw, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SafeHtml } from "@/components/ui/SafeHtml";
import { SkillAgencySelector } from "@/components/media/composer/SkillAgencySelector";
import { ContentTargetPicker } from "@/components/media/composer/ContentTargetPicker";
import { SocialPlatformPicker } from "@/components/media/composer/SocialPlatformPicker";
import { SocialAccountPicker, type SocialAccountPickerItem } from "@/components/media/composer/SocialAccountPicker";
import { composerReducer, initialComposerState } from "@/components/media/composerReducer";
import type { SocialPublishingPageOption } from "@/types/social";

import { generateArticleDraftHtml, makeComposerStateFromDraft, makeSaveDraftInput } from "./contentComposerPanelHelpers";

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
  const utils = trpc.useUtils();
  const [state, dispatch] = useReducer(composerReducer, initialComposerState);
  const [draftSearch, setDraftSearch] = useState("");
  const [attachmentSearch, setAttachmentSearch] = useState("");
  const hydrateGuard = useRef<string | null>(null);
  const prevSocialTargetIdRef = useRef<number | null>(null);

  const draftsQuery = trpc.contentComposer.listDrafts.useQuery({ limit: 20 });
  const selectedDraftQuery = trpc.contentComposer.getDraft.useQuery(
    { id: state.activeDraftId ?? "" },
    { enabled: Boolean(state.activeDraftId) },
  );
  const librarySearchQuery = trpc.library.search.useQuery(
    { query: attachmentSearch.trim() || undefined, limit: 20 },
    { enabled: attachmentSearch.trim().length > 0 },
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
  const publishMutation = trpc.contentComposer.publish.useMutation({
    onSuccess: async () => {
      dispatch({ type: "PUBLISH_COMPLETE" });
      await Promise.all([
        utils.contentComposer.listDrafts.invalidate(),
        state.activeDraftId ? utils.contentComposer.getDraft.invalidate({ id: state.activeDraftId }) : Promise.resolve(),
      ]);
      toast.success("Content published");
    },
    onError: (error) => {
      dispatch({ type: "PUBLISH_ERROR", payload: error.message || "Failed to publish draft" });
      toast.error(error.message || "Failed to publish draft");
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
      toast.error(error.message || "Failed to save draft");
    },
  });

  const deleteDraftMutation = trpc.contentComposer.deleteDraft.useMutation({
    onSuccess: async () => {
      await utils.contentComposer.listDrafts.invalidate();
      toast.success("Draft deleted");
      dispatch({ type: "START_NEW_DRAFT" });
    },
    onError: (error) => toast.error(error.message || "Failed to delete draft"),
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

  const selectedAttachments = useMemo(() => {
    const map = new Map<number, (typeof attachmentResults)[number]>();
    for (const item of attachmentResults) {
      const id = Number(item.item_id);
      map.set(id, item);
    }
    return state.attachmentIds.map((id) => map.get(id)).filter(Boolean) as (typeof attachmentResults)[number][];
  }, [state.attachmentIds, attachmentResults]);

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
      onError: (error) => toast.error(error.message || "Failed to generate caption"),
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
      toast.error("Please enter a topic first");
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
          const message = await resp.text().catch(() => "Failed to generate article");
          throw new Error(message || "Failed to generate article");
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
              let message = "Failed to generate article";
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
          throw new Error("No article content was generated");
        }

        if (shouldHydrateCaption && generatedCaption.trim()) {
          dispatch({ type: "CAPTION_GENERATION_COMPLETE", payload: generatedCaption.trim() });
        }

        dispatch({ type: "GENERATION_COMPLETE" });
        dispatch({ type: "GO_TO_STEP", payload: 2 });
        toast.success("Article generated");
      } catch (error) {
        if (!sawChunk && startingArticle) {
          dispatch({ type: "SET_ARTICLE_BODY", payload: startingArticle });
        }
        const message = error instanceof Error ? error.message : "Failed to generate article";
        dispatch({ type: "GENERATION_ERROR", payload: message });
        toast.error(message);
      }
    };

    void run();
  };

  const handlePublish = async () => {
      if (!canPublish) {
      toast.error("Complete the required fields before publishing");
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
      const message = error instanceof Error ? error.message : "Failed to publish draft";
      dispatch({ type: "PUBLISH_ERROR", payload: message });
      toast.error(message);
    }
  };

  return (
    <div className={cn("space-y-6", className)} data-content-composer-panel="true">
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <DashboardCard className="h-fit">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base">Drafts</h3>
              <Button size="sm" variant="outline" onClick={() => dispatch({ type: "START_NEW_DRAFT" })}>
                <Plus className="mr-2 h-4 w-4" />
                New Article
              </Button>
            </div>
            <Input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Search drafts..." />
          </div>
          <div>
            <ScrollArea className="h-[460px] pr-3">
              <div className="space-y-2">
                {filteredDraftItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No drafts yet.</p>
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
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{draft.topic || "Untitled draft"}</p>
                        <div className="flex items-center gap-1">
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
                        Updated {new Date(draft.updatedAt).toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {draft.destinationKind ?? "No destination"} • {draft.attachmentCount} attachments
                      </p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DashboardCard>

        <div className="space-y-6">
          <DashboardCard>
            <div>
              <h3 className="text-base">Article Composer</h3>
              <p className="text-sm text-muted-foreground">Draft an article, attach library assets, and route it to the right destination.</p>
            </div>
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Topic</label>
                  <Textarea
                    value={state.topic}
                    onChange={(event) => dispatch({ type: "SET_TOPIC", payload: event.target.value })}
                    placeholder="Describe the article topic..."
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
                    Web search
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={state.requiresThinking}
                      onChange={() => dispatch({ type: "TOGGLE_THINKING" })}
                    />
                    Thinking
                  </label>
                </div>
                <div className="md:col-span-2 flex flex-wrap gap-2">
                  <Button
                    onClick={handleGenerateArticle}
                    disabled={
                      !state.topic.trim() ||
                      state.isGenerating ||
                      (state.executionSource === "skill" ? !state.skillId : !state.agencyId)
                    }
                  >
                    {state.isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generate Article
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => dispatch({ type: "SET_ARTICLE_BODY", payload: generateArticleDraftHtml(state) })}
                    disabled={!state.topic.trim()}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Regenerate Preview
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Article HTML</h3>
                  <Badge variant="outline">{state.articleBody.length.toLocaleString()} chars</Badge>
                </div>
                <Textarea
                  value={state.articleBody}
                  onChange={(event) => dispatch({ type: "SET_ARTICLE_BODY", payload: event.target.value })}
                  placeholder="Generated article HTML will appear here..."
                  className="min-h-[220px] font-mono text-sm"
                />
                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <BookOpen className="h-4 w-4 text-cyan-600" />
                    Preview
                  </div>
                  {state.articleBody.trim() ? (
                    <SafeHtml html={state.articleBody} profile="article" className="prose max-w-none" />
                  ) : (
                    <p className="text-sm text-muted-foreground">Generate or paste article HTML to preview it here.</p>
                  )}
                </div>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard>
            <div>
              <h3 className="text-base">Attachments</h3>
            </div>
            <div className="space-y-4">
              <Input value={attachmentSearch} onChange={(event) => setAttachmentSearch(event.target.value)} placeholder="Search library assets..." />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <p>Select 1 to 6 ready assets from the library.</p>
                <Badge variant="outline">{state.attachmentIds.length}/6 selected</Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedAttachments.map((item) => (
                  <Badge key={String(item.item_id)} variant="secondary" className="gap-1">
                    {String(item.title ?? item.item_id)}
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "TOGGLE_ATTACHMENT", payload: Number(item.item_id) })}
                      className="ml-1 rounded-full"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              {attachmentSearch.trim().length > 0 && (
                <div className="space-y-2">
                  {librarySearchQuery.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching library...
                    </div>
                  )}
                  <div className="grid gap-2 md:grid-cols-2">
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
                          onClick={() => dispatch({ type: "TOGGLE_ATTACHMENT", payload: itemId })}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{String(item.title ?? itemId)}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {String(item.item_type ?? "asset")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selected ? "Remove from article" : "Add to article"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </DashboardCard>

          <DashboardCard>
            <div>
              <h3 className="text-base">Destination</h3>
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {destinationOptions.map((destination) => (
                  <Button
                    key={destination}
                    type="button"
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
                    <div className="text-sm font-medium">Docs target type</div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "doc_page" as const, label: "Doc page" },
                        { value: "cms_page" as const, label: "CMS page" },
                      ].map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant={state.docsSubKind === option.value ? "default" : "outline"}
                          size="sm"
                          onClick={() => dispatch({ type: "SET_DOCS_SUB_KIND", payload: option.value })}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <ContentTargetPicker
                    title="Docs target"
                    items={docsTargetItems.map((item) => ({
                      id: item.id,
                      label: item.label,
                      providerLabel: item.pageKey,
                      ready: Boolean(item.isPublished),
                      detail: item.path,
                    }))}
                    selectedId={state.docsTargetId}
                    onSelect={(id) => dispatch({ type: "SET_DOCS_TARGET_ID", payload: id })}
                    emptyMessage="No docs pages available for this target type."
                  />
                </div>
              )}

              {state.destinationKind === "blog" && (
                <div className="space-y-4 rounded-2xl border bg-slate-50/60 p-4">
                  <ContentTargetPicker
                    title="Blog target"
                    items={blogTargetItems.map((item) => ({
                      id: item.id,
                      label: item.label,
                      providerLabel: item.isPublished ? "published" : "draft",
                      ready: Boolean(item.isPublished),
                      detail: item.path,
                    }))}
                    selectedId={state.blogTargetId}
                    onSelect={(id) => dispatch({ type: "SET_BLOG_TARGET_ID", payload: id })}
                    emptyMessage="No blog posts available for this tenant."
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
                    emptyMessage={state.socialPlatform === "upload_post" ? "No Upload-Post profiles connected." : "No social pages connected for this platform."}
                  />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Social Caption</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
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
                              onError: (error) => toast.error(error.message || "Failed to generate caption"),
                            },
                          );
                        }}
                        disabled={generateCaptionMutation.isPending}
                      >
                        {generateCaptionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Generate Caption
                      </Button>
                    </div>
                    <Textarea
                      value={state.socialCaption}
                      onChange={(event) => dispatch({ type: "SET_SOCIAL_CAPTION", payload: event.target.value })}
                      placeholder="Caption for the social post..."
                      className="min-h-[110px]"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    if (!state.topic.trim() && !state.articleBody.trim() && state.attachmentIds.length === 0 && !state.destinationKind && !state.socialTargetId && !state.blogTargetId && !state.docsTargetId) {
                      toast.error("Add some content before saving the draft");
                      return;
                    }
                    saveDraftMutation.mutate(makeSaveDraftInput(state));
                  }}
                  variant="outline"
                  disabled={state.isSaving || state.isGenerating}
                >
                  Save Draft
                </Button>
                <Button onClick={handlePublish} disabled={!canPublish || state.isPublishing || publishMutation.isPending}>
                  {state.isPublishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Publish
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
