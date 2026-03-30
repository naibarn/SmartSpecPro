import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { formatRelativeTime } from "@smartspec/shared";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, FileStack, LayoutTemplate, Loader2, Plus, Presentation, Search, Share2, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocaleToggle } from "@/components/LocaleToggle";
import { ShareDialog } from "@/components/library/ShareDialog";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { isPresentationTemplateItem } from "@shared/presentation/template";
import { toast } from "sonner";

type LibraryPresentationItem = {
  id: number;
  title: string;
  source: string;
  status: string;
  visibility: string;
  metadata: Record<string, unknown>;
  ownerUserId: number;
  permissionLevel: string;
  sharedOutCount: number;
  hasSharedOut: boolean;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
  searchText: string;
  createdAt: string;
  updatedAt: string;
  isTemplate: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toPresentationItem(row: any): LibraryPresentationItem | null {
  const id = Number(row?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  const source = String(row?.source || "unknown");
  const visibility = String(row?.visibility || "private");
  const parsedSharedOutCount = Number(row?.shared_out_count);
  const sharedOutCount = Number.isFinite(parsedSharedOutCount) ? parsedSharedOutCount : 0;
  const metadata = asRecord(row?.metadata);
  const title = String(row?.title || `Presentation #${id}`);
  const metadataSearchText = Object.values(metadata)
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return {
    id,
    title,
    source,
    status: String(row?.status || "unknown"),
    visibility,
    metadata,
    ownerUserId: Number(row?.owner_user_id || 0),
    permissionLevel: String(row?.permission_level || ""),
    sharedOutCount,
    hasSharedOut:
      row?.has_shared_out === true || sharedOutCount > 0,
    sourceUrl: typeof row?.source_url === "string" ? row.source_url : null,
    thumbnailUrl: typeof row?.thumbnail_url === "string" ? row.thumbnail_url : null,
    searchText: `${title} ${source} ${metadataSearchText}`.toLowerCase(),
    createdAt: String(row?.created_at || ""),
    updatedAt: String(row?.updated_at || ""),
    isTemplate: isPresentationTemplateItem({ source, metadata }),
  };
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function resolvePreview(item: LibraryPresentationItem): { kind: "image" | "video" | "none"; src: string | null; poster: string | null } {
  const metadata = asRecord(item.metadata);
  const poster = firstNonEmptyString(
    item.thumbnailUrl,
    metadata.thumbnail_url,
    metadata.thumbnailUrl,
    metadata.preview_image_url,
    metadata.previewImageUrl,
    metadata.cover_image,
    metadata.coverImage,
    metadata.poster_url,
    metadata.posterUrl,
  );
  const sourceUrl = firstNonEmptyString(
    item.sourceUrl,
    metadata.preview_video_url,
    metadata.previewVideoUrl,
    metadata.video_url,
    metadata.videoUrl,
    metadata.source_url,
    metadata.sourceUrl,
  );
  const previewType = String(
    metadata.preview_type
    || metadata.previewType
    || metadata.media_type
    || metadata.mediaType
    || metadata.mime_type
    || metadata.mimeType
    || metadata.file_type
    || metadata.fileType
    || "",
  ).toLowerCase();

  const videoHint =
    previewType.includes("video")
    || Boolean(sourceUrl && /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(sourceUrl));
  const imageHint =
    previewType.includes("image")
    || Boolean(poster && /\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?.*)?$/i.test(poster))
    || Boolean(sourceUrl && /\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?.*)?$/i.test(sourceUrl));

  if (videoHint && sourceUrl) {
    return { kind: "video", src: sourceUrl, poster };
  }
  if (poster) {
    return { kind: "image", src: poster, poster };
  }
  if (imageHint && sourceUrl) {
    return { kind: "image", src: sourceUrl, poster: null };
  }

  return { kind: "none", src: null, poster: null };
}

function resolvePreviewFromDeckData(deckData: any): { kind: "image" | "video" | "none"; src: string | null; poster: string | null } {
  const slides = Array.isArray(deckData?.slides) ? [...deckData.slides].sort((a, b) => Number(a?.orderIndex || 0) - Number(b?.orderIndex || 0)) : [];
  for (const slide of slides) {
    const content = asRecord(slide?.slideContent);
    const elements = Array.isArray(content.elements) ? content.elements : [];
    for (const element of elements) {
      const entry = asRecord(element);
      const type = String(entry.type || "").toLowerCase();
      if (type === "video") {
        const src = firstNonEmptyString(entry.src, entry.video_url, entry.videoUrl, entry.source_url, entry.sourceUrl);
        const poster = firstNonEmptyString(entry.poster, entry.poster_url, entry.posterUrl, entry.thumbnail_url, entry.thumbnailUrl);
        if (src) {
          return { kind: "video", src, poster };
        }
        if (poster) {
          return { kind: "image", src: poster, poster };
        }
      }
      if (type === "image") {
        const src = firstNonEmptyString(entry.src, entry.image_url, entry.imageUrl, entry.source_url, entry.sourceUrl);
        if (src) {
          return { kind: "image", src, poster: null };
        }
      }
    }
  }

  return { kind: "none", src: null, poster: null };
}

function PresentationCardPreview({ item }: { item: LibraryPresentationItem }) {
  const itemPreview = useMemo(() => resolvePreview(item), [item]);
  const deckPreviewQuery = trpc.presentation.getDeckByLibraryItem.useQuery(
    { libraryItemId: item.id },
    {
      enabled: itemPreview.kind === "none",
      retry: false,
    },
  );
  const deckPreview = useMemo(
    () => resolvePreviewFromDeckData(deckPreviewQuery.data),
    [deckPreviewQuery.data],
  );
  const preview = itemPreview.kind !== "none" ? itemPreview : deckPreview;

  if (preview.kind === "video" && preview.src) {
    return (
      <video
        src={preview.src}
        poster={preview.poster || undefined}
        className="h-full w-full object-cover"
        preload="metadata"
        muted
        playsInline
      />
    );
  }
  if (preview.kind === "image" && preview.src) {
    return (
      <img
        src={preview.src}
        alt={item.title}
        className="h-full w-full object-cover"
        loading="lazy"
        draggable={false}
      />
    );
  }
  if (deckPreviewQuery.isLoading && itemPreview.kind === "none") {
    return <div className="h-full w-full animate-pulse bg-slate-200" />;
  }

  return (
    <div className="grid h-full w-full place-items-center text-slate-500">
      <Presentation className="h-6 w-6" />
    </div>
  );
}

function PresentationGroup({
  title,
  description,
  icon,
  items,
  currentUserId,
  isAdmin,
  onOpen,
  onUseTemplate,
  onShare,
  onDelete,
  deletingItemId,
  useTemplateItemId,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  showSearch = true,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  items: LibraryPresentationItem[];
  currentUserId: number;
  isAdmin: boolean;
  onOpen: (item: LibraryPresentationItem) => void;
  onUseTemplate: (item: LibraryPresentationItem) => void;
  onShare: (item: LibraryPresentationItem) => void;
  onDelete: (item: LibraryPresentationItem) => void;
  deletingItemId: number | null;
  useTemplateItemId: number | null;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  showSearch?: boolean;
}) {
  const Icon = icon;
  const { t } = useScopedTranslation("presentation");

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-4 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-sky-100 p-2 text-sky-700">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
      </div>
      {showSearch ? (
        <div className="relative w-full md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-9"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
          {t("library.empty")}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((item) => {
            const indexed = item.status === "ready";
            const isOwner = item.ownerUserId === currentUserId;
            const canDeleteTemplate = item.isTemplate && isAdmin;
            const canDeleteProject = !item.isTemplate && (isOwner || isAdmin);
            const canDelete = canDeleteTemplate || canDeleteProject;
            const canShare = isOwner || isAdmin;
            const showSharedBadge = !item.isTemplate && item.hasSharedOut;

            return (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <PresentationCardPreview item={item} />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 font-medium text-slate-900">{item.title}</h3>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {showSharedBadge ? (
                      <span
                      className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700"
                        title={item.sharedOutCount > 0
                          ? t("library.sharedWithCount", { count: item.sharedOutCount })
                          : t("library.shared")}
                      >
                        <Users className="h-3 w-3" />
                        {t("library.shared")}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        indexed
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {indexed ? t("library.indexed") : item.status}
                    </span>
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-500">
                  <p>{t("library.id")}: {item.id}</p>
                  <p>{t("library.source")}: {item.source}</p>
                  <p>{t("library.updated")}: {item.updatedAt ? formatRelativeTime(item.updatedAt) : "-"}</p>
                </div>
                <div className="mt-4 flex gap-2">
                  {item.isTemplate ? (
                    <Button
                      onClick={() => onUseTemplate(item)}
                      className="flex-1"
                      size="sm"
                      aria-label={t("library.useTemplateFor", { title: item.title })}
                      disabled={useTemplateItemId === item.id}
                    >
                      {useTemplateItemId === item.id ? t("library.preparing") : t("library.useTemplate")}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => onOpen(item)}
                      className="flex-1"
                      size="sm"
                      aria-label={t("library.openPresentation", { title: item.title })}
                    >
                      {t("library.openEditor")}
                    </Button>
                  )}
                  {canShare ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onShare(item)}
                      aria-label={t("library.sharePresentation", { title: item.title })}
                      title={t("library.share")}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(item)}
                      aria-label={t("library.deletePresentationFor", { title: item.title })}
                      disabled={deletingItemId === item.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function PresentationLibrary() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { t } = useScopedTranslation("presentation");
  const trpcUtils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [projectQuery, setProjectQuery] = useState("");
  const [templateQuery, setTemplateQuery] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"split" | "global">("split");
  const [offset, setOffset] = useState(0);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [useTemplateItemId, setUseTemplateItemId] = useState<number | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: number; title: string } | null>(null);
  const limit = 50;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const listQuery = trpc.library.listDocuments.useQuery(
    {
      scope: "my_library",
      sort: "updated_desc",
      limit,
      offset,
      filters: { itemType: "presentation" },
    },
    {
      enabled: isAuthenticated,
    },
  );
  const trimmedProjectQuery = projectQuery.trim();
  const trimmedTemplateQuery = templateQuery.trim();
  const trimmedGlobalQuery = globalQuery.trim();
  const hasSplitSemanticSearch = searchMode === "split" && (trimmedProjectQuery.length > 0 || trimmedTemplateQuery.length > 0);
  const hasGlobalSemanticSearch = searchMode === "global" && trimmedGlobalQuery.length > 0;
  const hasSemanticSearch = hasSplitSemanticSearch || hasGlobalSemanticSearch;
  const globalSearchQuery = trpc.library.search.useQuery(
    {
      query: trimmedGlobalQuery || undefined,
      scope: "my_library",
      limit,
      offset: 0,
      filters: { itemType: "presentation" },
    },
    {
      enabled: Boolean(isAuthenticated && hasGlobalSemanticSearch),
    },
  );
  const projectSearchQuery = trpc.library.search.useQuery(
    {
      query: trimmedProjectQuery || undefined,
      scope: "my_library",
      limit,
      offset: 0,
      filters: { itemType: "presentation" },
    },
    {
      enabled: Boolean(isAuthenticated && searchMode === "split" && trimmedProjectQuery.length > 0),
    },
  );
  const templateSearchQuery = trpc.library.search.useQuery(
    {
      query: trimmedTemplateQuery || undefined,
      scope: "my_library",
      limit,
      offset: 0,
      filters: { itemType: "presentation" },
    },
    {
      enabled: Boolean(isAuthenticated && searchMode === "split" && trimmedTemplateQuery.length > 0),
    },
  );
  const useTemplateMutation = trpc.presentation.useTemplate.useMutation();
  const deleteItemMutation = trpc.library.deleteItem.useMutation();
  const createItemMutation = trpc.library.createItem.useMutation();
  const createDeckMutation = trpc.presentation.createDeck.useMutation();

  const browsePresentationItems = useMemo(() => {
    const rows = Array.isArray(listQuery.data?.results) ? listQuery.data.results : [];
    return rows
      .map(toPresentationItem)
      .filter((item): item is LibraryPresentationItem => Boolean(item));
  }, [listQuery.data?.results]);
  const globalSearchItems = useMemo(() => {
    const rows = Array.isArray(globalSearchQuery.data?.results)
      ? globalSearchQuery.data.results.map((row: any) => ({ ...row, id: row.id ?? row.item_id }))
      : [];
    return rows
      .map(toPresentationItem)
      .filter((item): item is LibraryPresentationItem => Boolean(item));
  }, [globalSearchQuery.data?.results]);
  const projectSearchItems = useMemo(() => {
    const rows = Array.isArray(projectSearchQuery.data?.results)
      ? projectSearchQuery.data.results.map((row: any) => ({ ...row, id: row.id ?? row.item_id }))
      : [];
    return rows
      .map(toPresentationItem)
      .filter((item): item is LibraryPresentationItem => Boolean(item));
  }, [projectSearchQuery.data?.results]);
  const templateSearchItems = useMemo(() => {
    const rows = Array.isArray(templateSearchQuery.data?.results)
      ? templateSearchQuery.data.results.map((row: any) => ({ ...row, id: row.id ?? row.item_id }))
      : [];
    return rows
      .map(toPresentationItem)
      .filter((item): item is LibraryPresentationItem => Boolean(item));
  }, [templateSearchQuery.data?.results]);

  const grouped = useMemo(() => {
    const templates = browsePresentationItems.filter((item) => item.isTemplate);
    const projects = browsePresentationItems.filter((item) => !item.isTemplate);
    return { projects, templates };
  }, [browsePresentationItems]);
  const filteredGrouped = useMemo(() => {
    if (searchMode === "global") {
      return {
        projects: globalSearchItems.filter((item) => !item.isTemplate),
        templates: globalSearchItems.filter((item) => item.isTemplate),
      };
    }

    const projectNeedle = trimmedProjectQuery.toLowerCase();
    const templateNeedle = trimmedTemplateQuery.toLowerCase();
    return {
      projects: projectNeedle
        ? projectSearchItems.filter((item) => !item.isTemplate)
        : grouped.projects,
      templates: templateNeedle
        ? templateSearchItems.filter((item) => item.isTemplate)
        : grouped.templates,
    };
  }, [
    globalSearchItems,
    grouped.projects,
    grouped.templates,
    projectSearchItems,
    searchMode,
    templateSearchItems,
    trimmedProjectQuery,
    trimmedTemplateQuery,
  ]);
  const activeError = hasGlobalSemanticSearch
    ? globalSearchQuery.error
    : searchMode === "split" && hasSplitSemanticSearch
      ? (projectSearchQuery.error ?? templateSearchQuery.error)
      : listQuery.error;
  const activeLoading = hasGlobalSemanticSearch
    ? globalSearchQuery.isLoading
    : searchMode === "split" && hasSplitSemanticSearch
      ? (projectSearchQuery.isLoading || templateSearchQuery.isLoading)
      : listQuery.isLoading;
  const activeTotal = hasGlobalSemanticSearch
    ? (globalSearchQuery.data?.total ?? 0)
    : searchMode === "split" && hasSplitSemanticSearch
      ? filteredGrouped.projects.length + filteredGrouped.templates.length
      : (listQuery.data?.total ?? 0);

  const currentUserId = Number(user?.id || 0);
  const isAdmin = user?.role === "admin";

  function handleOpenPresentation(item: LibraryPresentationItem) {
    setLocation(`/presentation-editor/${item.id}`);
  }

  function handleShareItem(item: LibraryPresentationItem) {
    setShareTarget({ id: item.id, title: item.title });
  }

  async function handleUseTemplate(item: LibraryPresentationItem) {
    setUseTemplateItemId(item.id);
    try {
      const baseTitle = item.title.replace(/\s+template$/i, "").trim();
      const title = baseTitle ? `${baseTitle} ${t("library.copySuffix")}` : `Presentation ${item.id} ${t("library.copySuffix")}`;
      const result = await useTemplateMutation.mutateAsync({
        templateLibraryItemId: item.id,
        title,
      });
      await trpcUtils.library.listDocuments.invalidate();
      await trpcUtils.library.search.invalidate();
      const nextId = Number((result as any)?.item?.id);
      if (Number.isFinite(nextId) && nextId > 0) {
        setLocation(`/presentation-editor/${nextId}`);
        return;
      }
      setLocation("/presentations");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("library.templateFailed"));
    } finally {
      setUseTemplateItemId(null);
    }
  }

  async function handleDeleteItem(item: LibraryPresentationItem) {
    const confirmed = window.confirm(
      item.isTemplate
        ? t("library.deleteTemplate", { title: item.title })
        : t("library.deletePresentation", { title: item.title }),
    );
    if (!confirmed) {
      return;
    }

    setDeletingItemId(item.id);
    try {
      await deleteItemMutation.mutateAsync({ id: item.id });
      await trpcUtils.library.listDocuments.invalidate();
      await trpcUtils.library.search.invalidate();
      toast.success(item.isTemplate ? t("library.templateDeleted") : t("library.presentationDeleted"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("library.deleteFailed"));
    } finally {
      setDeletingItemId(null);
    }
  }

  const isCreating = createItemMutation.isPending || createDeckMutation.isPending;

  async function handleCreateNewPresentation() {
    try {
      const now = new Date();
      const title = `${t("library.newPresentation")} ${now.toLocaleString()}`;
      const createResult = await createItemMutation.mutateAsync({
        itemType: "presentation",
        source: "presentation_library",
        title,
        description: t("library.deckDescription"),
        status: "ready",
        visibility: "private",
        metadata: {
          extension: "presentation",
          source_type: "presentation_document",
        },
      });

      try {
        await createDeckMutation.mutateAsync({
          libraryItemId: createResult.item.id,
          title: createResult.item.title || title,
        });
      } catch {
        // Non-fatal — editor will auto-init deck if needed
      }

      await trpcUtils.library.listDocuments.invalidate();
      await trpcUtils.library.search.invalidate();
      toast.success(t("library.presentationCreated"));
      setLocation(`/presentation-editor/${createResult.item.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("library.createFailed"));
    }
  }

  if (authLoading || (!isAuthenticated && !user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/40 to-cyan-50/30">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              {t("library.back")}
            </Button>
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 p-2 text-white">
                <Presentation className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">{t("library.title")}</h1>
                <p className="text-xs text-slate-600">{t("library.subtitle")}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LocaleToggle className="hidden sm:inline-flex" />
            <Button
              onClick={handleCreateNewPresentation}
              disabled={isCreating}
              size="sm"
              className="gap-1.5"
              aria-label={t("library.newPresentation")}
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t("library.newPresentation")}
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600 backdrop-blur-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              {t("library.showing", { count: filteredGrouped.projects.length + filteredGrouped.templates.length, total: activeTotal })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={searchMode === "split" ? "default" : "outline"}
                onClick={() => setSearchMode("split")}
                aria-label={t("library.splitSearch")}
              >
                {t("library.splitSearch")}
              </Button>
              <Button
                size="sm"
                variant={searchMode === "global" ? "default" : "outline"}
                onClick={() => setSearchMode("global")}
                aria-label={t("library.globalSearch")}
              >
                {t("library.globalSearch")}
              </Button>
            </div>
          </div>
          {searchMode === "global" ? (
            <div className="relative mt-3 w-full md:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={globalQuery}
                onChange={(event) => setGlobalQuery(event.target.value)}
                className="pl-9"
                placeholder={t("library.searchAll")}
                aria-label={t("library.searchAll")}
              />
            </div>
          ) : null}
        </div>

        {activeError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {t("library.loadingError", { message: activeError.message })}
          </div>
        ) : null}
        {activeLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("library.loading")}
            </div>
          </div>
        ) : null}

        <PresentationGroup
          title={t("library.projects.title")}
          description={t("library.projects.desc")}
          icon={FileStack}
          items={filteredGrouped.projects}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onOpen={handleOpenPresentation}
          onUseTemplate={handleUseTemplate}
          onShare={handleShareItem}
          onDelete={handleDeleteItem}
          deletingItemId={deletingItemId}
          useTemplateItemId={useTemplateItemId}
          searchValue={projectQuery}
          onSearchChange={(value) => setProjectQuery(value)}
          searchPlaceholder={t("library.projects.search")}
          showSearch={searchMode === "split"}
        />

        <PresentationGroup
          title={t("library.templates.title")}
          description={t("library.templates.desc")}
          icon={LayoutTemplate}
          items={filteredGrouped.templates}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onOpen={handleOpenPresentation}
          onUseTemplate={handleUseTemplate}
          onShare={handleShareItem}
          onDelete={handleDeleteItem}
          deletingItemId={deletingItemId}
          useTemplateItemId={useTemplateItemId}
          searchValue={templateQuery}
          onSearchChange={(value) => setTemplateQuery(value)}
          searchPlaceholder={t("library.templates.search")}
          showSearch={searchMode === "split"}
        />

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={hasSemanticSearch || offset === 0 || listQuery.isFetching}
            onClick={() => setOffset((previous) => Math.max(0, previous - limit))}
          >
            {t("library.previous")}
          </Button>
          <Button
            size="sm"
            disabled={hasSemanticSearch || !listQuery.data?.has_more || listQuery.isFetching}
            onClick={() => setOffset((previous) => previous + limit)}
          >
            {t("library.next")}
          </Button>
        </div>
      </main>
      {shareTarget ? (
        <ShareDialog
          itemId={shareTarget.id}
          itemTitle={shareTarget.title}
          isOpen={Boolean(shareTarget)}
          onClose={() => setShareTarget(null)}
        />
      ) : null}
    </div>
  );
}
