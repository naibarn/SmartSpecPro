import { useEffect, useMemo, useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

type EpisodeChoice = {
  id: string | number;
  episodeNumber: number;
  episodeKind?: string;
  specialSequence?: number | null;
  title?: string | null;
};

type BookDocument = {
  schemaVersion: 1;
  metadata: { title: string; author: string; [key: string]: unknown };
  source: { seriesId: number; sourceFingerprint: string; episodeIds: number[] };
  chapters: Array<{ id: string; title: string; sourceEpisodeIds: number[]; blocks: Array<Record<string, any>> }>;
};

function newDraftId(prefix: string): string {
  const unique = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${unique}`;
}

export function VerticalDramaBookStudio({
  seriesId,
  episodes,
  lang,
  readOnly = false,
}: {
  seriesId: string;
  episodes: EpisodeChoice[];
  lang: "th" | "en";
  readOnly?: boolean;
}) {
  const numericSeriesId = Number(seriesId);
  const booksQuery = trpc.verticalDramaBooks.list.useQuery({ seriesId: numericSeriesId });
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [compositionJobId, setCompositionJobId] = useState<string | null>(null);
  const [coverJobId, setCoverJobId] = useState<string | null>(null);
  const jobQuery = trpc.workerJobs.detail.useQuery(
    { jobId: compositionJobId ?? "" },
    {
      enabled: Boolean(compositionJobId),
      refetchInterval: query => {
        const status = (query.state.data as any)?.status;
        return ["succeeded", "failed", "cancelled", "expired"].includes(status) ? false : 1500;
      },
    },
  );
  const coverJobQuery = trpc.workerJobs.detail.useQuery({ jobId: coverJobId ?? "" }, {
    enabled: Boolean(coverJobId),
    refetchInterval: query => ["succeeded", "failed", "cancelled", "expired"].includes(String((query.state.data as any)?.status ?? "")) ? false : 1500,
  });
  const bookQuery = trpc.verticalDramaBooks.get.useQuery(
    { bookId: selectedBookId ?? 0 },
    {
      enabled: selectedBookId !== null,
      refetchInterval: query => {
        const exports = (query.state.data as any)?.exports ?? [];
        const exporting = exports.some((item: any) => ["queued", "running", "validating"].includes(item.status));
        const composing = Boolean(compositionJobId && !["succeeded", "failed", "cancelled", "expired"].includes((jobQuery.data as any)?.status));
        const generatingCover = Boolean(coverJobId && !["succeeded", "failed", "cancelled", "expired"].includes(String((coverJobQuery.data as any)?.status ?? "")));
        return exporting || composing || generatingCover ? 2500 : false;
      },
    },
  );
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [copyrightText, setCopyrightText] = useState("");
  const [density, setDensity] = useState<"none" | "chapter_openers" | "occasional" | "all_shots">("occasional");
  const [coverAssetId, setCoverAssetId] = useState<string>("");
  const [coverAltText, setCoverAltText] = useState("");
  const [novelizerModelId, setNovelizerModelId] = useState("");
  const [coverModelId, setCoverModelId] = useState("");
  const [document, setDocument] = useState<BookDocument | null>(null);
  const novelizerModelsQuery = trpc.verticalDramaBooks.novelizerModels.useQuery(undefined, { staleTime: 60_000 });
  const coverModelsQuery = trpc.verticalDramaBooks.coverModels.useQuery(undefined, { staleTime: 60_000 });
  const availableAssetsQuery = trpc.verticalDramaBooks.availableAssets.useQuery(
    { seriesId: numericSeriesId, episodeIds: selectedEpisodeIds },
    { enabled: selectedEpisodeIds.length > 0 },
  );

  const activeRevision = bookQuery.data?.revisions?.[0];

  useEffect(() => {
    if (activeRevision?.document) {
      const nextDocument = activeRevision.document as BookDocument;
      setDocument(nextDocument);
      setCoverAssetId(nextDocument.metadata.coverMediaAssetId ? String(nextDocument.metadata.coverMediaAssetId) : "");
    }
    const jobId = (bookQuery.data?.book.sourceSelection as { compositionJobId?: string } | undefined)?.compositionJobId;
    if (jobId) setCompositionJobId(jobId);
    const episodeIds = (bookQuery.data?.book.sourceSelection as { episodeIds?: unknown } | undefined)?.episodeIds;
    if (Array.isArray(episodeIds)) setSelectedEpisodeIds(episodeIds.map(Number));
    const coverModel = (bookQuery.data?.book.sourceSelection as { coverModelId?: unknown } | undefined)?.coverModelId;
    if (typeof coverModel === "string") setCoverModelId(coverModel);
    const coverJob = (bookQuery.data?.book.sourceSelection as { coverJobId?: unknown } | undefined)?.coverJobId;
    if (typeof coverJob === "string") setCoverJobId(coverJob);
  }, [activeRevision?.id, bookQuery.data?.book.sourceSelection]);

  const createMutation = trpc.verticalDramaBooks.create.useMutation({
    onSuccess: result => {
      setSelectedBookId(result.book.id);
      setDocument(result.revision.document as BookDocument);
      void booksQuery.refetch();
    },
  });
  const composeMutation = trpc.verticalDramaBooks.compose.useMutation({
    onSuccess: result => {
      setCompositionJobId(result.jobId);
      void bookQuery.refetch();
    },
  });
  const reNovelizeMutation = trpc.verticalDramaBooks.reNovelizeChapter.useMutation({ onSuccess: result => { setCompositionJobId(result.jobId); void bookQuery.refetch(); } });
  const applyCandidateMutation = trpc.verticalDramaBooks.applyNovelizedCandidate.useMutation({ onSuccess: () => void bookQuery.refetch() });
  const discardCandidateMutation = trpc.verticalDramaBooks.discardNovelizedCandidate.useMutation({ onSuccess: result => { if (result.discarded) setCompositionJobId(null); void bookQuery.refetch(); } });
  const cancelCompositionMutation = trpc.verticalDramaBooks.cancelComposition.useMutation({ onSuccess: () => void bookQuery.refetch() });
  const retryCompositionMutation = trpc.verticalDramaBooks.retryComposition.useMutation({ onSuccess: result => { setCompositionJobId(result.jobId); void bookQuery.refetch(); } });
  const saveMutation = trpc.verticalDramaBooks.saveRevision.useMutation({
    onSuccess: () => void bookQuery.refetch(),
  });
  const approveMutation = trpc.verticalDramaBooks.approve.useMutation({
    onSuccess: () => void bookQuery.refetch(),
  });
  const exportMutation = trpc.verticalDramaBooks.export.useMutation({ onSettled: () => void bookQuery.refetch() });
  const downloadMutation = trpc.verticalDramaBooks.download.useMutation();
  const cancelExportMutation = trpc.verticalDramaBooks.cancelExport.useMutation({ onSuccess: () => void bookQuery.refetch() });
  const coverMutation = trpc.verticalDramaBooks.generateCover.useMutation({ onSuccess: result => { setCoverJobId(result.jobId); void bookQuery.refetch(); } });
  const cancelCoverMutation = trpc.verticalDramaBooks.cancelCoverGeneration.useMutation({ onSuccess: () => void bookQuery.refetch() });

  const currentBooks = booksQuery.data ?? [];
  const currentDocument = document;
  const isReviewCandidate = activeRevision?.status === "candidate";
  const previousRevisionDocument = isReviewCandidate ? bookQuery.data?.revisions?.[1]?.document as BookDocument | undefined : undefined;
  const persistedCoverDocument = activeRevision?.document as BookDocument | undefined;
  const coverTextUnsaved = Boolean(currentDocument && persistedCoverDocument && (
    currentDocument.metadata.title !== persistedCoverDocument.metadata.title ||
    currentDocument.metadata.author !== persistedCoverDocument.metadata.author ||
    currentDocument.metadata.subtitle !== persistedCoverDocument.metadata.subtitle
  ));
  const compositionQuote = bookQuery.data?.book.sourceSelection as { estimatedCompositionCredits?: unknown; compositionModelId?: unknown; novelizedChapterId?: unknown } | undefined;
  useEffect(() => {
    const storedModel = typeof compositionQuote?.compositionModelId === "string" ? compositionQuote.compositionModelId : "";
    if (storedModel && novelizerModelsQuery.data?.models.some(model => model.id === storedModel)) setNovelizerModelId(storedModel);
    else if (novelizerModelsQuery.data?.models[0]) setNovelizerModelId(novelizerModelsQuery.data.models[0].id);
  }, [selectedBookId, novelizerModelsQuery.data]);
  const novelizationQuoteQuery = trpc.verticalDramaBooks.quoteNovelization.useQuery(
    { bookId: selectedBookId ?? 0, modelId: novelizerModelId },
    { enabled: Boolean(selectedBookId && novelizerModelId), staleTime: 30_000 },
  );
  const coverQuoteQuery = trpc.verticalDramaBooks.quoteCoverGeneration.useQuery(
    { bookId: selectedBookId ?? 0, modelId: coverModelId },
    { enabled: Boolean(selectedBookId && coverModelId), staleTime: 30_000 },
  );
  useEffect(() => {
    if (!coverModelId && coverModelsQuery.data?.models[0]) setCoverModelId(coverModelsQuery.data.models[0].id);
  }, [coverModelId, coverModelsQuery.data]);
  const jobStatus = (jobQuery.data as any)?.status as string | undefined;
  const isComposing = Boolean(compositionJobId && !["succeeded", "failed", "cancelled", "expired"].includes(jobStatus ?? ""));
  const coverJobStatus = (coverJobQuery.data as any)?.status as string | undefined;
  const isGeneratingCover = Boolean(coverJobId && !["succeeded", "failed", "cancelled", "expired"].includes(coverJobStatus ?? ""));
  const statusText = useMemo(() => {
    if (booksQuery.isLoading) return lang === "th" ? "กำลังโหลดหนังสือ…" : "Loading books…";
    if (booksQuery.error) return lang === "th" ? "โหลดหนังสือไม่สำเร็จ ลองใหม่อีกครั้ง" : "Could not load books. Try again.";
    return "";
  }, [booksQuery.error, booksQuery.isLoading, lang]);

  const toggleEpisode = (episodeId: number) => {
    setSelectedEpisodeIds(current => current.includes(episodeId) ? current.filter(id => id !== episodeId) : [...current, episodeId]);
  };

  const moveSelectedEpisode = (episodeId: number, direction: -1 | 1) => {
    setSelectedEpisodeIds(current => {
      const index = current.indexOf(episodeId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const reorderChapter = (chapterId: string, direction: -1 | 1) => {
    setDocument(current => {
      if (!current) return current;
      const index = current.chapters.findIndex(chapter => chapter.id === chapterId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.chapters.length) return current;
      const chapters = [...current.chapters];
      [chapters[index], chapters[target]] = [chapters[target], chapters[index]];
      return { ...current, chapters, source: { ...current.source, episodeIds: [...new Set(chapters.flatMap(chapter => chapter.sourceEpisodeIds))] } };
    });
  };

  const splitChapter = (chapterId: string) => setDocument(current => {
    if (!current) return current;
    const index = current.chapters.findIndex(chapter => chapter.id === chapterId);
    const chapter = current.chapters[index];
    if (!chapter || chapter.blocks.length < 2) return current;
    const midpoint = Math.ceil(chapter.blocks.length / 2);
    const nextChapter = { ...chapter, id: newDraftId(`${chapter.id}-part`), title: `${chapter.title} (Part 2)`, blocks: chapter.blocks.slice(midpoint) };
    const chapters = [...current.chapters];
    chapters[index] = { ...chapter, blocks: chapter.blocks.slice(0, midpoint) };
    chapters.splice(index + 1, 0, nextChapter);
    return { ...current, chapters, source: { ...current.source, episodeIds: [...new Set(chapters.flatMap(item => item.sourceEpisodeIds))] } };
  });

  const mergeWithPreviousChapter = (chapterId: string) => setDocument(current => {
    if (!current) return current;
    const index = current.chapters.findIndex(chapter => chapter.id === chapterId);
    if (index < 1) return current;
    const chapters = [...current.chapters];
    const previous = chapters[index - 1];
    const chapter = chapters[index];
    chapters[index - 1] = { ...previous, blocks: [...previous.blocks, ...chapter.blocks], sourceEpisodeIds: [...new Set([...previous.sourceEpisodeIds, ...chapter.sourceEpisodeIds])] };
    chapters.splice(index, 1);
    return { ...current, chapters, source: { ...current.source, episodeIds: [...new Set(chapters.flatMap(item => item.sourceEpisodeIds))] } };
  });

  const addChapterBlock = (chapterId: string, type: "paragraph" | "scene_break") => setDocument(current => {
    if (!current) return current;
    const chapter = current.chapters.find(item => item.id === chapterId);
    if (!chapter) return current;
    const sourceRefs = chapter.blocks.find(block => block.sourceRefs?.length)?.sourceRefs ?? [];
    const block = type === "paragraph"
      ? { id: newDraftId("author-paragraph"), type: "paragraph" as const, text: "", sourceRefs }
      : { id: newDraftId("author-scene-break"), type: "scene_break" as const, sourceRefs };
    return { ...current, chapters: current.chapters.map(item => item.id === chapterId ? { ...item, blocks: [...item.blocks, block] } : item) };
  });

  const updateBlock = (chapterId: string, blockId: string, text: string) => {
    setDocument(current => current ? {
      ...current,
      chapters: current.chapters.map(chapter => chapter.id !== chapterId ? chapter : {
        ...chapter,
        blocks: chapter.blocks.map(block => block.id !== blockId ? block : { ...block, text }),
      }),
    } : current);
  };

  const reorderBlock = (chapterId: string, blockId: string, direction: -1 | 1) => setDocument(current => current ? {
    ...current,
    chapters: current.chapters.map(chapter => {
      if (chapter.id !== chapterId) return chapter;
      const index = chapter.blocks.findIndex(block => block.id === blockId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= chapter.blocks.length) return chapter;
      const blocks = [...chapter.blocks];
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...chapter, blocks };
    }),
  } : current);

  return (
    <VStack as="section" gap={4} aria-label={lang === "th" ? "สตูดิโอหนังสือ" : "Book Studio"}>
      <HStack as="header" gap={3} wrap="wrap" align="center">
        <h2 className="text-lg font-semibold">{lang === "th" ? "Book Studio" : "Book Studio"}</h2>
        <p className="text-sm text-muted-foreground">
          {lang === "th" ? "สร้างต้นฉบับภาพประกอบจากตอนที่เลือก แล้วตรวจแก้ก่อนอนุมัติ" : "Compose an illustrated draft from selected episodes, then review it before approval."}
        </p>
      </HStack>

      <VStack as="section" gap={3} aria-label={lang === "th" ? "หนังสือในซีรีย์นี้" : "Books in this series"}>
        {statusText ? <p role={booksQuery.error ? "alert" : undefined}>{statusText}</p> : null}
        <HStack gap={2} wrap="wrap" aria-label={lang === "th" ? "รายการหนังสือ" : "Book list"}>
          {currentBooks.map(book => (
            <Button key={book.id} variant={selectedBookId === book.id ? "default" : "outline"} onClick={() => { setCompositionJobId(null); setCoverJobId(null); setDocument(null); setSelectedBookId(book.id); }}>
              {book.title}
            </Button>
          ))}
        </HStack>
      </VStack>

      {!readOnly && (
        <VStack as="form" gap={3} onSubmit={event => {
          event.preventDefault();
          createMutation.mutate({ seriesId: numericSeriesId, episodeIds: selectedEpisodeIds, title: title.trim(), subtitle: subtitle.trim() || null, author: author.trim(), description: description.trim() || null, copyrightText: copyrightText.trim() || null, coverMediaAssetId: coverAssetId ? Number(coverAssetId) : null, coverAltText: coverAssetId ? coverAltText.trim() || (lang === "th" ? "ภาพปกหนังสือ" : "Book cover") : null, imageDensity: density });
        }} aria-label={lang === "th" ? "สร้างหนังสือ" : "Create a book"}>
          <HStack gap={3} wrap="wrap">
            <VStack gap={1}>
              <Label htmlFor="book-title">{lang === "th" ? "ชื่อหนังสือ" : "Book title"}</Label>
              <Input id="book-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={255} required />
            </VStack>
            <VStack gap={1}>
              <Label htmlFor="book-author">{lang === "th" ? "ชื่อผู้เขียน" : "Author name"}</Label>
              <Input id="book-author" value={author} onChange={event => setAuthor(event.target.value)} maxLength={255} required />
            </VStack>
            <VStack gap={1}>
              <Label htmlFor="book-subtitle">{lang === "th" ? "คำโปรยรอง" : "Subtitle"}</Label>
              <Input id="book-subtitle" value={subtitle} onChange={event => setSubtitle(event.target.value)} maxLength={255} />
            </VStack>
            <VStack gap={1}>
              <Label htmlFor="book-image-density">{lang === "th" ? "ภาพประกอบ" : "Illustration density"}</Label>
              <Select value={density} onValueChange={value => setDensity(value as typeof density)}>
                <SelectTrigger id="book-image-density" aria-label={lang === "th" ? "ความหนาแน่นภาพประกอบ" : "Illustration density"}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{lang === "th" ? "ไม่มีภาพ" : "No illustrations"}</SelectItem>
                  <SelectItem value="chapter_openers">{lang === "th" ? "ภาพเปิดบท" : "Chapter openers"}</SelectItem>
                  <SelectItem value="occasional">{lang === "th" ? "ภาพเป็นครั้งคราว" : "Occasional"}</SelectItem>
                  <SelectItem value="all_shots">{lang === "th" ? "ทุกช็อตที่มีภาพ" : "Every storyboard shot"}</SelectItem>
                </SelectContent>
              </Select>
            </VStack>
            <VStack gap={1}>
              <Label htmlFor="book-cover-asset">{lang === "th" ? "ภาพปก" : "Book cover"}</Label>
              <Select value={coverAssetId || "none"} onValueChange={value => setCoverAssetId(value === "none" ? "" : value)}>
                <SelectTrigger id="book-cover-asset" aria-label={lang === "th" ? "เลือกภาพปก" : "Choose a cover image"}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{lang === "th" ? "ไม่ใช้ภาพปก" : "No cover image"}</SelectItem>
                  {(availableAssetsQuery.data?.assets ?? []).map(asset => <SelectItem key={asset.mediaAssetId} value={String(asset.mediaAssetId)}>{asset.purpose === "cover" ? (lang === "th" ? "ภาพปกตอน" : "Episode cover") : (lang === "th" ? "ภาพช็อต" : "Shot image")} #{asset.mediaAssetId}</SelectItem>)}
                </SelectContent>
              </Select>
              {coverAssetId ? <><Label htmlFor="book-cover-alt-create">{lang === "th" ? "คำอธิบายภาพปก" : "Cover alternative text"}</Label><Input id="book-cover-alt-create" value={coverAltText} onChange={event => setCoverAltText(event.target.value)} maxLength={2000} /></> : null}
              {availableAssetsQuery.error ? <p role="alert">{lang === "th" ? "โหลดภาพปกไม่สำเร็จ" : "Could not load available cover images."}</p> : null}
            </VStack>
          </HStack>
          <VStack gap={1}>
            <Label htmlFor="book-description">{lang === "th" ? "คำอธิบายหนังสือ" : "Book description"}</Label>
            <Textarea id="book-description" value={description} onChange={event => setDescription(event.target.value)} maxLength={5000} rows={3} />
          </VStack>
          <VStack gap={1}>
            <Label htmlFor="book-copyright">{lang === "th" ? "ข้อความลิขสิทธิ์" : "Copyright page text"}</Label>
            <Textarea id="book-copyright" value={copyrightText} onChange={event => setCopyrightText(event.target.value)} maxLength={3000} rows={2} />
          </VStack>
          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{lang === "th" ? "เลือกตอนและเรียงลำดับบท" : "Select episodes and chapter order"}</legend>
            {episodes.map(episode => {
              const id = Number(episode.id);
              const checked = selectedEpisodeIds.includes(id);
              return (
                <HStack key={id} as="label" gap={2} align="center" className="min-h-10 cursor-pointer">
                  <Checkbox checked={checked} onCheckedChange={() => toggleEpisode(id)} aria-label={episode.title || `Episode ${episode.episodeNumber}`} />
                  <p>{episode.episodeKind === "special_tie_in" ? `Special ${episode.specialSequence ?? episode.episodeNumber}` : `Episode ${episode.episodeNumber}`}{episode.title ? ` · ${episode.title}` : ""}</p>
                </HStack>
              );
            })}
          </fieldset>
          {selectedEpisodeIds.length > 1 ? (
            <VStack as="ol" gap={1} aria-label={lang === "th" ? "ลำดับบทที่เลือก" : "Selected chapter order"}>
              {selectedEpisodeIds.map((id, index) => {
                const episode = episodes.find(item => Number(item.id) === id);
                return <HStack as="li" key={id} gap={2} align="center">
                  <p>{index + 1}. {episode?.title || `${lang === "th" ? "ตอน" : "Episode"} ${episode?.episodeNumber ?? id}`}</p>
                  <Button type="button" variant="outline" size="sm" aria-label={lang === "th" ? `เลื่อนบท ${index + 1} ขึ้น` : `Move chapter ${index + 1} up`} disabled={index === 0} onClick={() => moveSelectedEpisode(id, -1)}>↑</Button>
                  <Button type="button" variant="outline" size="sm" aria-label={lang === "th" ? `เลื่อนบท ${index + 1} ลง` : `Move chapter ${index + 1} down`} disabled={index === selectedEpisodeIds.length - 1} onClick={() => moveSelectedEpisode(id, 1)}>↓</Button>
                </HStack>;
              })}
            </VStack>
          ) : null}
          {density === "all_shots" ? <p className="text-sm text-muted-foreground" role="status">{availableAssetsQuery.data ? (lang === "th" ? `ภาพครบ ${availableAssetsQuery.data.imageCoverage.usableShots}/${availableAssetsQuery.data.imageCoverage.totalShots} ช็อต` : `Image coverage: ${availableAssetsQuery.data.imageCoverage.usableShots}/${availableAssetsQuery.data.imageCoverage.totalShots} shots`) : (lang === "th" ? "ต้องมีภาพที่อนุมัติครบทุกช็อตในตอนที่เลือก" : "All selected shots need an approved image.")}</p> : null}
          {availableAssetsQuery.data ? <p className="text-sm text-muted-foreground">{lang === "th" ? `ภาพที่ใช้ได้ ${availableAssetsQuery.data.assets.length} ไฟล์ · ขนาดรวมสูงสุดประมาณ ${(availableAssetsQuery.data.assets.reduce((sum, asset) => sum + Number(asset.fileSize || 0), 0) / (1024 * 1024)).toFixed(1)} MB รวมภาพปก` : `${availableAssetsQuery.data.assets.length} available image files · up to ${(availableAssetsQuery.data.assets.reduce((sum, asset) => sum + Number(asset.fileSize || 0), 0) / (1024 * 1024)).toFixed(1)} MB including cover`}</p> : null}
          {density === "all_shots" && (availableAssetsQuery.data?.imageCoverage.missing.length ?? 0) > 0 ? <p role="alert" className="text-sm text-destructive">{lang === "th" ? `ยังไม่มีภาพใน ${availableAssetsQuery.data?.imageCoverage.missing.length} ช็อตที่เลือก` : `${availableAssetsQuery.data?.imageCoverage.missing.length} selected shots have no approved image.`}</p> : null}
          <Button type="submit" disabled={createMutation.isPending || selectedEpisodeIds.length === 0 || !title.trim() || !author.trim() || (density === "all_shots" && (!availableAssetsQuery.data || availableAssetsQuery.data.imageCoverage.missing.length > 0))}>
            {createMutation.isPending ? (lang === "th" ? "กำลังสร้าง…" : "Creating…") : (lang === "th" ? "สร้างหนังสือ" : "Create book")}
          </Button>
          {createMutation.error ? <p role="alert" className="text-sm text-destructive">{createMutation.error.message}</p> : null}
        </VStack>
      )}

      {selectedBookId && bookQuery.isLoading ? <p role="status">{lang === "th" ? "กำลังโหลดฉบับ…" : "Loading revision…"}</p> : null}
      {selectedBookId && bookQuery.error ? <p role="alert">{lang === "th" ? "โหลดหนังสือไม่สำเร็จ" : "Could not load this book."}</p> : null}
      {selectedBookId && bookQuery.data && currentDocument ? (
        <VStack as="article" gap={4} aria-label={currentDocument.metadata.title}>
          {bookQuery.data.book.stale ? <p role="alert" className="text-sm text-destructive">{lang === "th" ? "แหล่งข้อมูลต้นฉบับเปลี่ยนแปลงแล้ว กรุณาสร้างฉบับใหม่จากตอนปัจจุบันก่อนอนุมัติ" : "Source episodes changed. Create a fresh book revision from the current episodes before approval."}</p> : null}
          {!readOnly && activeRevision?.status === "draft" ? <VStack as="section" gap={2} aria-label={lang === "th" ? "ข้อมูลหนังสือ" : "Book metadata"}>
            <Label htmlFor="book-editor-title">{lang === "th" ? "ชื่อหนังสือ" : "Book title"}</Label>
            <Input id="book-editor-title" value={currentDocument.metadata.title} maxLength={255} disabled={isGeneratingCover} onChange={event => setDocument(current => current ? { ...current, metadata: { ...current.metadata, title: event.target.value } } : current)} />
            <Label htmlFor="book-editor-subtitle">{lang === "th" ? "คำโปรยรอง" : "Subtitle"}</Label>
            <Input id="book-editor-subtitle" value={String(currentDocument.metadata.subtitle ?? "")} maxLength={255} disabled={isGeneratingCover} onChange={event => setDocument(current => current ? { ...current, metadata: { ...current.metadata, subtitle: event.target.value || null } } : current)} />
            <Label htmlFor="book-editor-author">{lang === "th" ? "ชื่อผู้เขียน" : "Author"}</Label>
            <Input id="book-editor-author" value={currentDocument.metadata.author} maxLength={255} disabled={isGeneratingCover} onChange={event => setDocument(current => current ? { ...current, metadata: { ...current.metadata, author: event.target.value } } : current)} />
            <Label htmlFor="book-editor-description">{lang === "th" ? "คำอธิบายหนังสือ" : "Description"}</Label>
            <Textarea id="book-editor-description" rows={3} maxLength={5000} value={String(currentDocument.metadata.description ?? "")} onChange={event => setDocument(current => current ? { ...current, metadata: { ...current.metadata, description: event.target.value || null } } : current)} />
            <Label htmlFor="book-editor-copyright">{lang === "th" ? "ข้อความลิขสิทธิ์" : "Copyright page text"}</Label>
            <Textarea id="book-editor-copyright" rows={2} maxLength={3000} value={String(currentDocument.metadata.copyrightText ?? "")} onChange={event => setDocument(current => current ? { ...current, metadata: { ...current.metadata, copyrightText: event.target.value || null } } : current)} />
          </VStack> : null}
          <HStack gap={2} wrap="wrap" align="center">
            <h3 className="text-base font-semibold">{currentDocument.metadata.title}</h3>
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {isComposing ? (lang === "th" ? "กำลังเรียบเรียงบท…" : "Composing chapters…") : jobStatus === "failed" ? (lang === "th" ? "เรียบเรียงไม่สำเร็จ" : "Composition failed") : (activeRevision?.status ?? "draft")}
            </p>
            {!readOnly && isComposing ? <Button type="button" variant="outline" onClick={() => cancelCompositionMutation.mutate({ bookId: selectedBookId })} disabled={cancelCompositionMutation.isPending}>{lang === "th" ? "ยกเลิกการเรียบเรียง" : "Cancel composition"}</Button> : null}
            {!readOnly && activeRevision?.status === "candidate" && !compositionQuote?.novelizedChapterId && ["failed", "cancelled", "expired"].includes(jobStatus ?? "") ? <Button type="button" variant="outline" onClick={() => retryCompositionMutation.mutate({ bookId: selectedBookId, modelId: novelizerModelId || undefined })} disabled={retryCompositionMutation.isPending || bookQuery.data.book.stale}>{lang === "th" ? "ลองเรียบเรียงต่อ" : "Retry composition"}</Button> : null}
            {!readOnly && isReviewCandidate && jobStatus === "succeeded" ? <>
              <Button type="button" onClick={() => applyCandidateMutation.mutate({ bookId: selectedBookId, revisionId: activeRevision.id })} disabled={applyCandidateMutation.isPending}>{lang === "th" ? "ใช้ฉบับใหม่นี้" : "Apply this version"}</Button>
              <Button type="button" variant="outline" onClick={() => discardCandidateMutation.mutate({ bookId: selectedBookId, revisionId: activeRevision.id })} disabled={discardCandidateMutation.isPending}>{lang === "th" ? "เก็บฉบับเดิม" : "Keep previous version"}</Button>
            </> : null}
            {!readOnly && isReviewCandidate && ["failed", "cancelled", "expired"].includes(jobStatus ?? "") ? <Button type="button" variant="outline" onClick={() => discardCandidateMutation.mutate({ bookId: selectedBookId, revisionId: activeRevision.id })} disabled={discardCandidateMutation.isPending}>{lang === "th" ? "กลับไปฉบับเดิม" : "Return to previous version"}</Button> : null}
          </HStack>
          {retryCompositionMutation.error || reNovelizeMutation.error || applyCandidateMutation.error || discardCandidateMutation.error ? <p role="alert" className="text-sm text-destructive">{retryCompositionMutation.error?.message ?? reNovelizeMutation.error?.message ?? applyCandidateMutation.error?.message ?? discardCandidateMutation.error?.message}</p> : null}
          {currentDocument.chapters.map(chapter => (
            <VStack key={chapter.id} as="section" gap={3} aria-label={chapter.title}>
              {isReviewCandidate && previousRevisionDocument ? <details><summary>{lang === "th" ? "เปรียบเทียบกับฉบับก่อนหน้า" : "Compare with previous version"}</summary><VStack gap={2}>{(previousRevisionDocument.chapters.find(item => item.id === chapter.id)?.blocks ?? []).filter((block: any) => block.type === "paragraph" || block.type === "dialogue").map((block: any) => <p key={block.id}>{block.type === "dialogue" && block.speaker ? <strong>{block.speaker}: </strong> : null}{block.text}</p>)}</VStack></details> : null}
              <VStack as="article" gap={2} aria-label={lang === "th" ? `ตัวอย่างการอ่าน ${chapter.title}` : `Reading preview: ${chapter.title}`}>
                <h4 className="font-semibold">{chapter.title}</h4>
                {chapter.blocks.map((block: any) => block.type === "paragraph" ? <p key={block.id}>{block.text}</p> : block.type === "dialogue" ? <p key={block.id}>{block.speaker ? <strong>{block.speaker}: </strong> : null}{block.text}</p> : block.type === "scene_break" ? <p aria-label={lang === "th" ? "จุดเปลี่ยนฉาก" : "Scene break"} key={block.id}>＊ ＊ ＊</p> : block.type === "illustration" ? <img key={block.id} src={availableAssetsQuery.data?.assets.find(asset => asset.mediaAssetId === block.mediaAssetId)?.url ?? ""} alt={block.decorative ? "" : block.altText} loading="lazy" /> : null)}
              </VStack>
              {chapter.qualityReview ? <details>
                <summary>{lang === "th" ? "ผลประเมินคุณภาพฉบับร่าง" : "Draft quality review"}</summary>
                <VStack as="ul" gap={1}>
                  <li>{lang === "th" ? `ความลื่นไหล ${chapter.qualityReview.flow}/5 · อ่านเข้าใจ ${chapter.qualityReview.readability}/5 · ความต่อเนื่อง ${chapter.qualityReview.continuity}/5` : `Flow ${chapter.qualityReview.flow}/5 · Readability ${chapter.qualityReview.readability}/5 · Continuity ${chapter.qualityReview.continuity}/5`}</li>
                  <li>{lang === "th" ? `บทพูด ${chapter.qualityReview.dialogue}/5 · อิงต้นฉบับ ${chapter.qualityReview.sourceCoverage}/5 · ควบคุมข้อมูลที่แต่งเพิ่ม ${chapter.qualityReview.unsupportedDetail}/5` : `Dialogue ${chapter.qualityReview.dialogue}/5 · Source coverage ${chapter.qualityReview.sourceCoverage}/5 · Unsupported-detail control ${chapter.qualityReview.unsupportedDetail}/5`}</li>
                  {chapter.qualityReview.findings.map((finding: string, findingIndex: number) => <li key={`${chapter.id}-finding-${findingIndex}`}>{finding}</li>)}
                </VStack>
              </details> : null}
              {!readOnly && activeRevision?.status === "draft" ? <HStack gap={2} wrap="wrap">
                <Button type="button" variant="outline" size="sm" onClick={() => reNovelizeMutation.mutate({ bookId: selectedBookId, chapterId: chapter.id, modelId: novelizerModelId })} disabled={isComposing || !novelizerModelId || bookQuery.data.book.stale || reNovelizeMutation.isPending}>{lang === "th" ? "แปลงตอนนี้ใหม่" : "Re-novelize this episode"}</Button>
              </HStack> : null}
              {!readOnly && activeRevision?.status === "draft" ? <HStack gap={2} wrap="wrap">
                <Button type="button" variant="outline" size="sm" aria-label={lang === "th" ? "เลื่อนบทขึ้น" : "Move chapter up"} disabled={currentDocument.chapters[0].id === chapter.id} onClick={() => reorderChapter(chapter.id, -1)}>↑</Button>
                <Button type="button" variant="outline" size="sm" aria-label={lang === "th" ? "เลื่อนบทลง" : "Move chapter down"} disabled={currentDocument.chapters.at(-1)?.id === chapter.id} onClick={() => reorderChapter(chapter.id, 1)}>↓</Button>
                <Button type="button" variant="outline" size="sm" disabled={chapter.blocks.length < 2} onClick={() => splitChapter(chapter.id)}>{lang === "th" ? "แยกบท" : "Split chapter"}</Button>
                {currentDocument.chapters[0].id !== chapter.id ? <Button type="button" variant="outline" size="sm" onClick={() => mergeWithPreviousChapter(chapter.id)}>{lang === "th" ? "รวมกับบทก่อนหน้า" : "Merge with previous"}</Button> : null}
                <Button type="button" variant="outline" size="sm" onClick={() => addChapterBlock(chapter.id, "paragraph")}>{lang === "th" ? "เพิ่มย่อหน้า" : "Add paragraph"}</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addChapterBlock(chapter.id, "scene_break")}>{lang === "th" ? "เพิ่มจุดเปลี่ยนฉาก" : "Add scene break"}</Button>
              </HStack> : null}
              {activeRevision?.status === "draft" ? <><Label htmlFor={`chapter-title-${chapter.id}`}>{lang === "th" ? "ชื่อบท" : "Chapter title"}</Label>
              <Input id={`chapter-title-${chapter.id}`} value={chapter.title} disabled={readOnly || isComposing} onChange={event => setDocument(current => current ? { ...current, chapters: current.chapters.map(item => item.id === chapter.id ? { ...item, title: event.target.value } : item) } : current)} /></> : null}
              {activeRevision?.status === "draft" ? chapter.blocks.map(block => block.type === "paragraph" || block.type === "dialogue" ? (
                <VStack key={block.id} gap={1}>
                  <Label htmlFor={`block-${block.id}`}>{block.type === "dialogue" ? (block.speaker || (lang === "th" ? "บทพูด" : "Dialogue")) : (lang === "th" ? "เนื้อหา" : "Narrative")}</Label>
                  <Textarea id={`block-${block.id}`} rows={5} value={block.text} disabled={readOnly || isComposing || activeRevision?.status === "approved"} onChange={event => updateBlock(chapter.id, block.id, event.target.value)} />
                </VStack>
              ) : block.type === "scene_break" ? <HStack key={block.id} gap={2} align="center"><p aria-label={lang === "th" ? "จุดเปลี่ยนฉาก" : "Scene break"}>＊ ＊ ＊</p>{!readOnly && activeRevision?.status !== "approved" ? <Button type="button" variant="outline" size="sm" onClick={() => setDocument(current => current ? { ...current, chapters: current.chapters.map(item => item.id === chapter.id ? { ...item, blocks: item.blocks.filter(candidate => candidate.id !== block.id) } : item) } : current)}>{lang === "th" ? "นำออก" : "Remove"}</Button> : null}</HStack> : block.type === "illustration" ? (
                <VStack key={block.id} as="figure" gap={2} aria-label={lang === "th" ? "ภาพประกอบในบท" : "Chapter illustration"}>
                  {availableAssetsQuery.data?.assets.find(asset => asset.mediaAssetId === block.mediaAssetId)?.url ? <img src={availableAssetsQuery.data.assets.find(asset => asset.mediaAssetId === block.mediaAssetId)?.url ?? ""} alt={block.decorative ? "" : block.altText} loading="lazy" className="max-h-80 max-w-full object-contain" /> : <p role="status">{lang === "th" ? "ไม่พบภาพตัวอย่าง" : "Image preview unavailable"}</p>}
                  <HStack gap={2} wrap="wrap" align="center">
                    <Button type="button" variant="outline" size="sm" aria-label={lang === "th" ? "เลื่อนภาพขึ้น" : "Move image earlier"} disabled={readOnly || isComposing || activeRevision?.status === "approved" || chapter.blocks[0].id === block.id} onClick={() => reorderBlock(chapter.id, block.id, -1)}>↑</Button>
                    <Button type="button" variant="outline" size="sm" aria-label={lang === "th" ? "เลื่อนภาพลง" : "Move image later"} disabled={readOnly || isComposing || activeRevision?.status === "approved" || chapter.blocks.at(-1)?.id === block.id} onClick={() => reorderBlock(chapter.id, block.id, 1)}>↓</Button>
                    <Select value={String(block.mediaAssetId)} disabled={readOnly || isComposing || activeRevision?.status === "approved"} onValueChange={value => {
                      const asset = availableAssetsQuery.data?.assets.find(item => String(item.mediaAssetId) === value);
                      if (asset) setDocument(current => current ? { ...current, chapters: current.chapters.map(item => item.id === chapter.id ? { ...item, blocks: item.blocks.map(candidate => candidate.id === block.id ? { ...candidate, mediaAssetId: asset.mediaAssetId, mediaChecksum: asset.checksum, sourceRefs: asset.sourceRefs } : candidate) } : item) } : current);
                    }}>
                      <SelectTrigger aria-label={lang === "th" ? "เปลี่ยนภาพประกอบ" : "Change illustration"}><SelectValue /></SelectTrigger>
                      <SelectContent>{(availableAssetsQuery.data?.assets ?? []).map(asset => <SelectItem key={asset.mediaAssetId} value={String(asset.mediaAssetId)}>Artwork #{asset.mediaAssetId}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button type="button" variant="outline" disabled={readOnly || isComposing || activeRevision?.status === "approved"} onClick={() => setDocument(current => current ? { ...current, chapters: current.chapters.map(item => item.id === chapter.id ? { ...item, blocks: item.blocks.filter(candidate => candidate.id !== block.id) } : item) } : current)}>{lang === "th" ? "นำภาพออก" : "Remove image"}</Button>
                  </HStack>
                  <VStack gap={1}>
                    <Label htmlFor={`alt-${block.id}`}>{lang === "th" ? "คำอธิบายภาพ" : "Alternative text"}</Label>
                    <Input id={`alt-${block.id}`} value={block.altText} disabled={readOnly || isComposing || activeRevision?.status === "approved" || block.decorative} onChange={event => setDocument(current => current ? { ...current, chapters: current.chapters.map(item => item.id === chapter.id ? { ...item, blocks: item.blocks.map(candidate => candidate.id === block.id ? { ...candidate, altText: event.target.value } : candidate) } : item) } : current)} />
                    <Label htmlFor={`caption-${block.id}`}>{lang === "th" ? "คำบรรยายภาพ" : "Caption"}</Label>
                    <Input id={`caption-${block.id}`} value={block.caption ?? ""} disabled={readOnly || isComposing || activeRevision?.status === "approved"} onChange={event => setDocument(current => current ? { ...current, chapters: current.chapters.map(item => item.id === chapter.id ? { ...item, blocks: item.blocks.map(candidate => candidate.id === block.id ? { ...candidate, caption: event.target.value || null } : candidate) } : item) } : current)} />
                    <HStack as="label" gap={2} align="center"><Checkbox checked={block.decorative} disabled={readOnly || isComposing || activeRevision?.status === "approved"} onCheckedChange={checked => setDocument(current => current ? { ...current, chapters: current.chapters.map(item => item.id === chapter.id ? { ...item, blocks: item.blocks.map(candidate => candidate.id === block.id ? { ...candidate, decorative: checked === true } : candidate) } : item) } : current)} /><p>{lang === "th" ? "ภาพตกแต่ง ไม่ต้องมีคำอธิบาย" : "Decorative image"}</p></HStack>
                  </VStack>
                </VStack>
              ) : null) : null}
            </VStack>
          ))}
          {!readOnly && activeRevision?.status === "draft" ? (
            <HStack gap={3} wrap="wrap">
              <VStack as="section" gap={2} aria-label={lang === "th" ? "สร้างภาพปกหนังสือ" : "Generate book cover artwork"}>
                <h4 className="font-semibold">{lang === "th" ? "สร้างภาพปกหนังสือโดยเฉพาะ" : "Create a dedicated book cover"}</h4>
                <Label htmlFor="book-cover-model">{lang === "th" ? "โมเดลสร้างภาพ" : "Image model"}</Label>
                <Select value={coverModelId} onValueChange={setCoverModelId} disabled={isGeneratingCover || coverModelsQuery.isLoading}>
                  <SelectTrigger id="book-cover-model"><SelectValue placeholder={lang === "th" ? "เลือกโมเดลที่รองรับภาพอ้างอิง" : "Choose a reference image model"} /></SelectTrigger>
                  <SelectContent>{(coverModelsQuery.data?.models ?? []).map(model => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">{coverQuoteQuery.data ? (lang === "th" ? `สร้าง 3 แบบ · ใช้ภาพอ้างอิง ${coverQuoteQuery.data.referenceImageCount} ภาพ · ประมาณ ${coverQuoteQuery.data.estimatedCredits} เครดิต` : `3 options · ${coverQuoteQuery.data.referenceImageCount} shot references · about ${coverQuoteQuery.data.estimatedCredits} credits`) : (lang === "th" ? "เลือกโมเดลภาพอ้างอิงเพื่อดูราคาและจำนวนภาพ" : "Choose a reference image model to see cost and source coverage")}</p>
                {coverQuoteQuery.data?.mayReuseReferences ? <p role="status">{lang === "th" ? "จำนวนภาพต้นฉบับมีจำกัด รอบถัดไปอาจต้องใช้ชุดภาพอ้างอิงเดิม" : "The source image pool is small, so a later round may reuse the same shot references."}</p> : null}
                {coverTextUnsaved ? <p role="status">{lang === "th" ? "บันทึกชื่อเรื่อง ผู้เขียน และคำโปรยก่อนสร้างปก เพื่อให้ข้อความบนปกตรงกับหนังสือ" : "Save title, author, and blurb edits before generating the cover so its text matches the book."}</p> : null}
                <HStack gap={2} wrap="wrap">
                  <Button type="button" onClick={() => selectedBookId && activeRevision && coverMutation.mutate({ bookId: selectedBookId, revisionId: activeRevision.id, modelId: coverModelId })} disabled={!selectedBookId || !coverModelId || !coverQuoteQuery.data?.referenceImageCount || isGeneratingCover || coverMutation.isPending || coverTextUnsaved || bookQuery.data.book.stale}>
                    {isGeneratingCover ? (lang === "th" ? `กำลังสร้างปก ${String((coverJobQuery.data as any)?.progress ?? "")}%` : `Generating covers ${String((coverJobQuery.data as any)?.progress ?? "")}%`) : (lang === "th" ? "สร้างตัวเลือกปก 3 แบบ" : "Generate 3 cover options")}
                  </Button>
                  {isGeneratingCover ? <Button type="button" variant="outline" onClick={() => selectedBookId && cancelCoverMutation.mutate({ bookId: selectedBookId })} disabled={cancelCoverMutation.isPending}>{lang === "th" ? "ยกเลิก" : "Cancel"}</Button> : null}
                </HStack>
                {coverMutation.error || coverModelsQuery.error || coverQuoteQuery.error ? <p role="alert" className="text-sm text-destructive">{coverMutation.error?.message ?? coverModelsQuery.error?.message ?? coverQuoteQuery.error?.message}</p> : null}
                {!isGeneratingCover && coverJobStatus === "failed" && bookQuery.data.coverCandidates?.length ? <p role="status">{lang === "th" ? "งานรอบล่าสุดไม่สำเร็จทั้งหมด แต่ภาพที่สร้างสำเร็จยังเลือกใช้ได้" : "The latest round did not finish, but completed cover options remain available."}</p> : null}
                {bookQuery.data.coverCandidates?.length ? <HStack as="ul" gap={3} wrap="wrap" aria-label={lang === "th" ? "ตัวเลือกภาพปก" : "Cover candidates"}>
                  {bookQuery.data.coverCandidates.map((candidate: any) => {
                    const overlayMatches = candidate.overlayText?.title === currentDocument.metadata.title && candidate.overlayText?.author === currentDocument.metadata.author && candidate.overlayText?.blurb === String(currentDocument.metadata.subtitle ?? "");
                    return <VStack as="li" key={`${candidate.roundId}-${candidate.outputIndex}`} gap={2}>
                    {typeof candidate.url === "string" ? <img src={candidate.url} alt={`${currentDocument.metadata.title} · ${lang === "th" ? "ตัวเลือกปก" : "Cover option"} ${Number(candidate.outputIndex) + 1}`} loading="lazy" /> : null}
                    <p className="text-xs text-muted-foreground">{String(candidate.modelId)} · {lang === "th" ? `ภาพอ้างอิง ${Array.isArray(candidate.referenceAssetIds) ? candidate.referenceAssetIds.length : 0} ภาพ` : `${Array.isArray(candidate.referenceAssetIds) ? candidate.referenceAssetIds.length : 0} shot references`}</p>
                    {!overlayMatches ? <p role="alert">{lang === "th" ? "ปกนี้สร้างจากชื่อหรือคำโปรยฉบับเดิม กรุณาสร้างใหม่เพื่อให้ข้อความตรงกัน" : "This cover uses older title or blurb text. Generate a fresh option to match the current book."}</p> : null}
                    <Button type="button" variant="outline" size="sm" disabled={!overlayMatches} onClick={() => setDocument(current => current ? { ...current, metadata: { ...current.metadata, coverMediaAssetId: Number(candidate.mediaAssetId), coverChecksum: String(candidate.checksum), coverAltText: `${current.metadata.title} — ${lang === "th" ? "ภาพปกหนังสือ" : "book cover"}` } } : current)}>{lang === "th" ? "เลือกภาพปกนี้" : "Choose this cover"}</Button>
                  </VStack>;
                  })}
                </HStack> : null}
                {currentDocument.metadata.coverMediaAssetId ? <p role="status">{lang === "th" ? `เลือกภาพปก #${currentDocument.metadata.coverMediaAssetId} แล้ว · บันทึกฉบับเพื่อใช้ภาพนี้` : `Cover #${currentDocument.metadata.coverMediaAssetId} selected · save the revision to keep it`}</p> : null}
              </VStack>
              <VStack gap={1}>
                <Label htmlFor="book-cover-editor">{lang === "th" ? "ภาพปก" : "Book cover"}</Label>
                <Select value={currentDocument.metadata.coverMediaAssetId ? String(currentDocument.metadata.coverMediaAssetId) : "none"} disabled={readOnly || activeRevision?.status === "approved" || isGeneratingCover} onValueChange={value => {
                  const asset = availableAssetsQuery.data?.assets.find(item => String(item.mediaAssetId) === value);
                  const candidate = bookQuery.data.coverCandidates?.find((item: any) => String(item.mediaAssetId) === value);
                  const mediaAssetId = asset?.mediaAssetId ?? (candidate ? Number(candidate.mediaAssetId) : null);
                  const checksum = asset?.checksum ?? (candidate ? String(candidate.checksum) : null);
                  setDocument(current => current ? { ...current, metadata: { ...current.metadata, coverMediaAssetId: mediaAssetId, coverChecksum: checksum, coverAltText: mediaAssetId ? current.metadata.coverAltText || `${current.metadata.title} — ${lang === "th" ? "ภาพปกหนังสือ" : "book cover"}` : null } } : current);
                }}>
                  <SelectTrigger id="book-cover-editor"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">{lang === "th" ? "ไม่ใช้ภาพปก" : "No cover image"}</SelectItem>{(availableAssetsQuery.data?.assets ?? []).map(asset => <SelectItem key={asset.mediaAssetId} value={String(asset.mediaAssetId)}>{asset.purpose === "cover" ? "Episode cover" : "Shot image"} #{asset.mediaAssetId}</SelectItem>)}{(bookQuery.data.coverCandidates ?? []).map((candidate: any) => <SelectItem key={`generated-cover-${candidate.mediaAssetId}`} value={String(candidate.mediaAssetId)}>{lang === "th" ? "ภาพปกที่สร้าง" : "Generated cover"} #{Number(candidate.outputIndex) + 1}</SelectItem>)}</SelectContent>
                </Select>
              </VStack>
              {currentDocument.metadata.coverMediaAssetId ? <VStack gap={1}>
                <Label htmlFor="book-cover-alt">{lang === "th" ? "คำอธิบายภาพปก" : "Cover alternative text"}</Label>
                <Input id="book-cover-alt" value={String(currentDocument.metadata.coverAltText ?? "")} disabled={readOnly || activeRevision?.status === "approved" || isGeneratingCover} onChange={event => setDocument(current => current ? { ...current, metadata: { ...current.metadata, coverAltText: event.target.value } } : current)} />
              </VStack> : null}
            </HStack>
          ) : null}
          {!readOnly && activeRevision?.status === "draft" ? (
            <HStack gap={2} wrap="wrap">
              <VStack gap={1}>
                <Label htmlFor="book-novelizer-model">{lang === "th" ? "โมเดล AI สำหรับเรียบเรียงนิยาย" : "Novelization vision model"}</Label>
                <Select value={novelizerModelId} onValueChange={setNovelizerModelId} disabled={isComposing || novelizerModelsQuery.isLoading}>
                  <SelectTrigger id="book-novelizer-model"><SelectValue placeholder={lang === "th" ? "เลือกโมเดลที่รองรับภาพ" : "Choose a vision model"} /></SelectTrigger>
                  <SelectContent>{(novelizerModelsQuery.data?.models ?? []).map(model => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectContent>
                </Select>
              </VStack>
              <p className="text-sm text-muted-foreground">
                {Number.isFinite(Number(novelizationQuoteQuery.data?.estimatedCredits))
                  ? (lang === "th"
                    ? `ประมาณไม่เกิน ${Number(novelizationQuoteQuery.data?.estimatedCredits)} เครดิต สำหรับ ${currentDocument.chapters.length} ตอน · แปลงซ้ำรายตอนประมาณ ${Number(novelizationQuoteQuery.data?.perChapterEstimatedCredits)} เครดิต`
                    : `Estimated up to ${Number(novelizationQuoteQuery.data?.estimatedCredits)} credits for ${currentDocument.chapters.length} episodes · one-episode re-novelization about ${Number(novelizationQuoteQuery.data?.perChapterEstimatedCredits)} credits`)
                  : (lang === "th" ? "จะแสดงราคาประเมินก่อนเริ่มเรียบเรียง" : "A credit estimate will be checked before composition starts")}
              </p>
              <Button onClick={() => composeMutation.mutate({ bookId: selectedBookId, modelId: novelizerModelId })} disabled={isComposing || composeMutation.isPending || bookQuery.data.book.stale || !novelizerModelId}>
                {lang === "th" ? "เรียบเรียงต้นฉบับ" : "Compose draft"}
              </Button>
              <Button variant="outline" onClick={() => saveMutation.mutate({ bookId: selectedBookId, document: currentDocument })} disabled={saveMutation.isPending || isComposing || isGeneratingCover || bookQuery.data.book.stale}>
                {lang === "th" ? "บันทึกฉบับแก้ไข" : "Save revision"}
              </Button>
              {saveMutation.isSuccess ? <p role="status">{lang === "th" ? "บันทึกแล้ว" : "Saved"}</p> : null}
              {composeMutation.error || saveMutation.error || cancelCompositionMutation.error ? <p role="alert" className="text-sm text-destructive">{composeMutation.error?.message ?? saveMutation.error?.message ?? cancelCompositionMutation.error?.message}</p> : null}
            </HStack>
          ) : null}
          {!readOnly && activeRevision?.status === "draft" ? (
            <Button variant="secondary" onClick={() => approveMutation.mutate({ bookId: selectedBookId, revisionId: activeRevision.id })} disabled={approveMutation.isPending || isComposing || bookQuery.data.book.stale}>
              {lang === "th" ? "อนุมัติฉบับนี้" : "Approve this revision"}
            </Button>
          ) : null}
          {approveMutation.error ? <p role="alert" className="text-sm text-destructive">{approveMutation.error.message}</p> : null}
          {!readOnly && activeRevision?.status === "approved" ? (
            <VStack as="section" gap={2} aria-label={lang === "th" ? "ส่งออกหนังสือ" : "Export book"}>
              <HStack gap={2} wrap="wrap">
                <Button onClick={() => exportMutation.mutate({ bookId: selectedBookId, revisionId: activeRevision.id, formats: ["epub"] })} disabled={exportMutation.isPending}>{lang === "th" ? "ส่งออก EPUB" : "Export EPUB"}</Button>
                <Button onClick={() => exportMutation.mutate({ bookId: selectedBookId, revisionId: activeRevision.id, formats: ["pdf"] })} disabled={exportMutation.isPending}>{lang === "th" ? "ส่งออก PDF" : "Export PDF"}</Button>
                <Button variant="secondary" onClick={() => exportMutation.mutate({ bookId: selectedBookId, revisionId: activeRevision.id, formats: ["epub", "pdf"] })} disabled={exportMutation.isPending}>{lang === "th" ? "ส่งออกทั้งสองรูปแบบ" : "Export both"}</Button>
              </HStack>
              {bookQuery.data.exports.map((artifact: any) => (
                <HStack key={artifact.id} gap={2} align="center">
                  <p role="status">{artifact.format.toUpperCase()} · {artifact.status}{artifact.errorCode ? ` · ${artifact.errorCode}` : ""}</p>
                  {artifact.status === "available" ? (
                    <Button variant="outline" onClick={async () => {
                      const result = await downloadMutation.mutateAsync({ artifactId: artifact.id });
                      window.open(result.url, "_blank", "noopener,noreferrer");
                    }} disabled={downloadMutation.isPending}>{lang === "th" ? "ดาวน์โหลด" : "Download"}</Button>
                  ) : null}
                  {["queued", "running", "validating"].includes(artifact.status) ? <Button variant="outline" onClick={() => cancelExportMutation.mutate({ artifactId: artifact.id })} disabled={cancelExportMutation.isPending}>{lang === "th" ? "ยกเลิก" : "Cancel"}</Button> : null}
                </HStack>
              ))}
              {exportMutation.error || downloadMutation.error || cancelExportMutation.error ? <p role="alert">{exportMutation.error?.message ?? downloadMutation.error?.message ?? cancelExportMutation.error?.message}</p> : null}
            </VStack>
          ) : null}
        </VStack>
      ) : null}
    </VStack>
  );
}
