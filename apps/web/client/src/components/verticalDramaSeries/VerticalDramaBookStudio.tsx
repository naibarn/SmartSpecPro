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
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [createFormOpen, setCreateFormOpen] = useState(false);
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
      setSelectedChapterId(current => nextDocument.chapters.some(chapter => chapter.id === current) ? current : nextDocument.chapters[0]?.id ?? "");
      setCoverAssetId(nextDocument.metadata.coverMediaAssetId ? String(nextDocument.metadata.coverMediaAssetId) : "");
    }
  }, [activeRevision?.id]);

  useEffect(() => {
    const sourceSelection = bookQuery.data?.book.sourceSelection as { compositionJobId?: string; episodeIds?: unknown; coverModelId?: unknown; coverJobId?: unknown } | undefined;
    if (!sourceSelection) return;
    const jobId = sourceSelection.compositionJobId;
    if (jobId) setCompositionJobId(jobId);
    const episodeIds = sourceSelection.episodeIds;
    if (Array.isArray(episodeIds)) setSelectedEpisodeIds(episodeIds.map(Number));
    const coverModel = sourceSelection.coverModelId;
    if (typeof coverModel === "string") setCoverModelId(coverModel);
    const coverJob = sourceSelection.coverJobId;
    if (typeof coverJob === "string") setCoverJobId(coverJob);
  }, [bookQuery.data?.book.sourceSelection]);

  const createMutation = trpc.verticalDramaBooks.create.useMutation({
    onSuccess: result => {
      setSelectedBookId(result.book.id);
      setCreateFormOpen(false);
      setDocument(result.revision.document as BookDocument);
      setSelectedChapterId((result.revision.document as BookDocument).chapters[0]?.id ?? "");
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
  const selectedChapter = currentDocument?.chapters.find(chapter => chapter.id === selectedChapterId) ?? currentDocument?.chapters[0];
  const selectedChapterIndex = selectedChapter ? currentDocument?.chapters.findIndex(chapter => chapter.id === selectedChapter.id) ?? -1 : -1;
  const selectedCoverId = Number(currentDocument?.metadata.coverMediaAssetId ?? 0);
  const selectedCoverCandidate = (bookQuery.data?.coverCandidates ?? []).find((candidate: any) => Number(candidate.mediaAssetId) === selectedCoverId);
  const selectedCoverAsset = availableAssetsQuery.data?.assets.find(asset => asset.mediaAssetId === selectedCoverId);
  const selectedCoverUrl = typeof selectedCoverCandidate?.url === "string" ? selectedCoverCandidate.url : selectedCoverAsset?.url;
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
        <HStack gap={3} wrap="wrap" align="center" justify="between">
          <VStack gap={1}>
            <h3 className="font-semibold">{lang === "th" ? "เลือกหนังสือเพื่อทำงานต่อ" : "Choose a book to continue"}</h3>
            <p className="text-sm text-muted-foreground">{lang === "th" ? "เลือกฉบับเดิมเพื่อเขียน ตรวจเนื้อหา เลือกปก และส่งออกต่อได้" : "Open an existing draft to write, review, choose a cover, or export."}</p>
          </VStack>
          {!readOnly ? <Button type="button" variant={createFormOpen ? "outline" : "default"} onClick={() => setCreateFormOpen(current => !current)}>
            {createFormOpen ? (lang === "th" ? "ปิดฟอร์มสร้างหนังสือ" : "Close new book form") : (lang === "th" ? "สร้างหนังสือใหม่" : "Create a new book")}
          </Button> : null}
        </HStack>
        {currentBooks.length === 0 && !booksQuery.isLoading ? <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{lang === "th" ? "ยังไม่มีหนังสือในซีรีย์นี้ เริ่มจากสร้างหนังสือใหม่และเลือกตอนที่ต้องการ" : "This series has no books yet. Create one and select the episodes to include."}</p> : null}
        <HStack gap={2} wrap="wrap" aria-label={lang === "th" ? "รายการหนังสือ" : "Book list"}>
          {currentBooks.map(book => {
            const metadata = book.metadata as { author?: unknown };
            return <Button key={book.id} type="button" variant={selectedBookId === book.id ? "default" : "outline"} className="h-auto min-w-48 justify-start px-4 py-3 text-left" onClick={() => { setCompositionJobId(null); setCoverJobId(null); setDocument(null); setCreateFormOpen(false); setSelectedBookId(book.id); }}>
              <VStack gap={1} align="start">
                <p className="font-medium">{book.title}</p>
                <p className="text-xs opacity-80">{typeof metadata?.author === "string" ? metadata.author : (lang === "th" ? `ฉบับ ${book.currentRevisionNumber}` : `Revision ${book.currentRevisionNumber}`)} · {book.stale ? (lang === "th" ? "ต้นฉบับเปลี่ยนแล้ว" : "Source changed") : new Date(book.updatedAt).toLocaleDateString(lang === "th" ? "th-TH" : "en-US")}</p>
              </VStack>
            </Button>;
          })}
        </HStack>
      </VStack>

        {!readOnly && (!selectedBookId || createFormOpen) && (
        <VStack as="form" gap={4} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5" onSubmit={event => {
          event.preventDefault();
          createMutation.mutate({ seriesId: numericSeriesId, episodeIds: selectedEpisodeIds, title: title.trim(), subtitle: subtitle.trim() || null, author: author.trim(), description: description.trim() || null, copyrightText: copyrightText.trim() || null, coverMediaAssetId: coverAssetId ? Number(coverAssetId) : null, coverAltText: coverAssetId ? coverAltText.trim() || (lang === "th" ? "ภาพปกหนังสือ" : "Book cover") : null, imageDensity: density });
        }} aria-label={lang === "th" ? "สร้างหนังสือ" : "Create a book"}>
          <VStack gap={1}>
            <h3 className="text-base font-semibold">{lang === "th" ? "ตั้งค่าหนังสือและเลือกตอน" : "Set up the book and choose episodes"}</h3>
            <p className="text-sm text-muted-foreground">{lang === "th" ? "หลังสร้างเล่มแล้ว คุณจะเลือกโมเดลเพื่อเรียบเรียงนิยาย อ่านตรวจทีละตอน และเลือกภาพปกก่อนอนุมัติได้" : "After creating the book, choose a writing model, review each episode, select a cover, and approve it."}</p>
          </VStack>
          <HStack gap={3} wrap="wrap">
            <VStack gap={1} className="min-w-44 flex-1">
              <Label htmlFor="book-title">{lang === "th" ? "ชื่อหนังสือ" : "Book title"}</Label>
              <Input id="book-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={255} required />
            </VStack>
            <VStack gap={1} className="min-w-44 flex-1">
              <Label htmlFor="book-author">{lang === "th" ? "ชื่อผู้เขียน" : "Author name"}</Label>
              <Input id="book-author" value={author} onChange={event => setAuthor(event.target.value)} maxLength={255} required />
            </VStack>
            <VStack gap={1} className="min-w-44 flex-1">
              <Label htmlFor="book-subtitle">{lang === "th" ? "คำโปรยรอง" : "Subtitle"}</Label>
              <Input id="book-subtitle" value={subtitle} onChange={event => setSubtitle(event.target.value)} maxLength={255} />
            </VStack>
            <VStack gap={1} className="min-w-44 flex-1">
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
            <VStack gap={1} className="min-w-44 flex-1">
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
          {!readOnly && activeRevision?.status === "draft" ? (
            <VStack as="section" gap={2} className="rounded-lg border bg-muted/30 p-4" aria-label={lang === "th" ? "เรียบเรียงเนื้อหาเป็นนิยาย" : "Compose the novel draft"}>
              <h4 className="font-semibold">{lang === "th" ? "ขั้นตอนถัดไป: สร้างเนื้อหานิยาย" : "Next step: create the novel text"}</h4>
              <p className="text-sm text-muted-foreground">
                {lang === "th" ? `ส่งเรื่องย่อ บทพูด และภาพประกอบจาก ${currentDocument.chapters.length} ตอนให้ AI เรียบเรียงเป็นต้นฉบับนิยาย จากนั้นอ่านและตรวจแก้ทีละตอนด้านล่าง ก่อนอนุมัติหนังสือ` : `Use the selected episodes' synopses, dialogue, and images to write a novel draft. Then read and edit each episode below before approving the book.`}
              </p>
              <HStack gap={3} wrap="wrap" align="end">
                <VStack gap={1}>
                  <Label htmlFor="book-novelizer-model">{lang === "th" ? "เลือกโมเดลสำหรับเขียนนิยาย" : "Novel-writing model"}</Label>
                  <Select value={novelizerModelId} onValueChange={setNovelizerModelId} disabled={isComposing || novelizerModelsQuery.isLoading}>
                    <SelectTrigger id="book-novelizer-model"><SelectValue placeholder={lang === "th" ? "เลือกโมเดลที่รองรับภาพ" : "Choose a vision model"} /></SelectTrigger>
                    <SelectContent>{(novelizerModelsQuery.data?.models ?? []).map(model => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectContent>
                  </Select>
                </VStack>
                <p className="text-sm text-muted-foreground">
                  {Number.isFinite(Number(novelizationQuoteQuery.data?.estimatedCredits))
                    ? (lang === "th"
                      ? `ประมาณไม่เกิน ${Number(novelizationQuoteQuery.data?.estimatedCredits)} เครดิต สำหรับ ${currentDocument.chapters.length} ตอน · แปลงซ้ำตอนที่เลือกประมาณ ${Number(novelizationQuoteQuery.data?.perChapterEstimatedCredits)} เครดิต`
                      : `Up to ${Number(novelizationQuoteQuery.data?.estimatedCredits)} credits for ${currentDocument.chapters.length} episodes · re-novelizing the selected episode about ${Number(novelizationQuoteQuery.data?.perChapterEstimatedCredits)} credits`)
                    : (lang === "th" ? "เลือกโมเดลเพื่อดูเครดิตก่อนเริ่มงาน" : "Choose a model to see the estimate before starting")}
                </p>
                <Button type="button" onClick={() => composeMutation.mutate({ bookId: selectedBookId, modelId: novelizerModelId })} disabled={isComposing || composeMutation.isPending || bookQuery.data.book.stale || !novelizerModelId}>
                  {isComposing ? (lang === "th" ? "กำลังเขียนนิยาย…" : "Writing novel…") : (lang === "th" ? "เขียนนิยายครบทุกตอน" : "Write all episodes as a novel")}
                </Button>
                <Button type="button" variant="outline" onClick={() => saveMutation.mutate({ bookId: selectedBookId, document: currentDocument })} disabled={saveMutation.isPending || isComposing || isGeneratingCover || bookQuery.data.book.stale}>
                  {lang === "th" ? "บันทึกฉบับแก้ไข" : "Save edits"}
                </Button>
                {isComposing ? <Button type="button" variant="outline" onClick={() => cancelCompositionMutation.mutate({ bookId: selectedBookId })} disabled={cancelCompositionMutation.isPending}>{lang === "th" ? "ยกเลิก" : "Cancel"}</Button> : null}
              </HStack>
              {novelizerModelsQuery.error || novelizationQuoteQuery.error || composeMutation.error || saveMutation.error || cancelCompositionMutation.error ? <p role="alert" className="text-sm text-destructive">{novelizerModelsQuery.error?.message ?? novelizationQuoteQuery.error?.message ?? composeMutation.error?.message ?? saveMutation.error?.message ?? cancelCompositionMutation.error?.message}</p> : null}
              {!novelizerModelsQuery.isLoading && novelizerModelsQuery.data?.models.length === 0 ? <p role="alert" className="text-sm text-destructive">{lang === "th" ? "ยังไม่มีโมเดลที่รองรับการอ่านภาพสำหรับเรียบเรียงนิยาย กรุณาเปิดใช้งานโมเดลภาพก่อน" : "No vision model is enabled for novelization. Enable a vision-capable model first."}</p> : null}
            </VStack>
          ) : null}
          {!readOnly && activeRevision?.status === "draft" ? (
            <VStack as="section" gap={3} className="rounded-lg border p-4" aria-label={lang === "th" ? "สร้างและตรวจปกหนังสือ" : "Generate and review book covers"}>
              <VStack gap={1}>
                <h4 className="font-semibold">{lang === "th" ? "สร้างภาพปกหนังสือ" : "Create the book cover"}</h4>
                <p className="text-sm text-muted-foreground">{lang === "th" ? "เลือกโมเดล ระบบจะสุ่มภาพจากหลายช็อตมาสร้างปก 3 แบบให้เปรียบเทียบ เลือกแบบที่ชอบหรือสร้างชุดใหม่ได้" : "Choose a model. The system samples shot images and creates 3 cover options to compare. Choose one or generate another set."}</p>
              </VStack>
              <HStack gap={4} wrap="wrap" align="start">
                <VStack as="figure" gap={2} aria-label={lang === "th" ? "ภาพปกที่เลือก" : "Selected book cover"}>
                  <p className="text-sm font-medium">{lang === "th" ? "ตัวอย่างปกที่เลือก" : "Selected cover preview"}</p>
                  {selectedCoverUrl ? <img src={selectedCoverUrl} alt={String(currentDocument.metadata.coverAltText ?? `${currentDocument.metadata.title} · ${lang === "th" ? "ภาพปกที่เลือก" : "Selected book cover"}`)} loading="lazy" className="max-h-72 max-w-52 rounded-md border object-contain" /> : <p role="status" className="flex min-h-56 w-44 items-center justify-center rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{lang === "th" ? "ยังไม่ได้เลือกภาพปก เลือกภาพจากตัวเลือกด้านล่าง" : "No cover selected. Choose an option below."}</p>}
                </VStack>
                <VStack gap={2} className="min-w-64 flex-1">
                  <Label htmlFor="book-cover-model">{lang === "th" ? "โมเดลสร้างภาพ" : "Image generation model"}</Label>
                  <Select value={coverModelId} onValueChange={setCoverModelId} disabled={isGeneratingCover || coverModelsQuery.isLoading}>
                    <SelectTrigger id="book-cover-model"><SelectValue placeholder={lang === "th" ? "เลือกโมเดลสร้างภาพ" : "Choose an image model"} /></SelectTrigger>
                    <SelectContent>{(coverModelsQuery.data?.models ?? []).map(model => <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">{coverQuoteQuery.data ? (lang === "th" ? `สร้าง 3 แบบ · ใช้ภาพอ้างอิง ${coverQuoteQuery.data.referenceImageCount} ภาพ · ประมาณ ${coverQuoteQuery.data.estimatedCredits} เครดิต` : `3 options · ${coverQuoteQuery.data.referenceImageCount} shot references · about ${coverQuoteQuery.data.estimatedCredits} credits`) : (lang === "th" ? "เลือกโมเดลเพื่อดูจำนวนภาพอ้างอิงและเครดิต" : "Choose a model to see reference coverage and credits")}</p>
                  {coverQuoteQuery.data?.mayReuseReferences ? <p role="status" className="text-sm text-muted-foreground">{lang === "th" ? "ภาพต้นฉบับมีจำนวนจำกัด รอบถัดไปอาจสุ่มได้ภาพซ้ำ" : "The source image pool is small, so a later round may reuse some references."}</p> : null}
                  {coverTextUnsaved ? <p role="status" className="text-sm text-muted-foreground">{lang === "th" ? "บันทึกชื่อเรื่อง ผู้เขียน และคำโปรยก่อนสร้างปก เพื่อให้ตัวอักษรบนปกตรงกับหนังสือ" : "Save title, author, and blurb edits before generating so the cover text matches."}</p> : null}
                  <Label htmlFor="book-cover-editor">{lang === "th" ? "เลือกภาพปกที่มีอยู่" : "Choose an existing cover"}</Label>
                  <Select value={currentDocument.metadata.coverMediaAssetId ? String(currentDocument.metadata.coverMediaAssetId) : "none"} disabled={isGeneratingCover} onValueChange={value => {
                    const asset = availableAssetsQuery.data?.assets.find(item => String(item.mediaAssetId) === value);
                    const candidate = bookQuery.data.coverCandidates?.find((item: any) => String(item.mediaAssetId) === value);
                    const mediaAssetId = asset?.mediaAssetId ?? (candidate ? Number(candidate.mediaAssetId) : null);
                    const checksum = asset?.checksum ?? (candidate ? String(candidate.checksum) : null);
                    setDocument(current => current ? { ...current, metadata: { ...current.metadata, coverMediaAssetId: mediaAssetId, coverChecksum: checksum, coverAltText: mediaAssetId ? current.metadata.coverAltText || `${current.metadata.title} — ${lang === "th" ? "ภาพปกหนังสือ" : "Book cover"}` : null } } : current);
                  }}>
                    <SelectTrigger id="book-cover-editor"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">{lang === "th" ? "ยังไม่เลือกภาพปก" : "No cover selected"}</SelectItem>{(availableAssetsQuery.data?.assets ?? []).map(asset => <SelectItem key={asset.mediaAssetId} value={String(asset.mediaAssetId)}>{asset.purpose === "cover" ? (lang === "th" ? "ภาพปกตอน" : "Episode cover") : (lang === "th" ? "ภาพช็อต" : "Shot image")} #{asset.mediaAssetId}</SelectItem>)}{(bookQuery.data.coverCandidates ?? []).map((candidate: any, index: number) => <SelectItem key={`generated-cover-${candidate.mediaAssetId}`} value={String(candidate.mediaAssetId)}>{lang === "th" ? `ปกที่สร้าง แบบ ${Number(candidate.outputIndex ?? index) + 1}` : `Generated cover ${Number(candidate.outputIndex ?? index) + 1}`}</SelectItem>)}</SelectContent>
                  </Select>
                  {currentDocument.metadata.coverMediaAssetId ? <VStack gap={1}>
                    <Label htmlFor="book-cover-alt">{lang === "th" ? "คำอธิบายภาพปก" : "Cover alternative text"}</Label>
                    <Input id="book-cover-alt" value={String(currentDocument.metadata.coverAltText ?? "")} disabled={isGeneratingCover} onChange={event => setDocument(current => current ? { ...current, metadata: { ...current.metadata, coverAltText: event.target.value } } : current)} />
                  </VStack> : null}
                  <HStack gap={2} wrap="wrap">
                    <Button type="button" onClick={() => selectedBookId && activeRevision && coverMutation.mutate({ bookId: selectedBookId, revisionId: activeRevision.id, modelId: coverModelId })} disabled={!selectedBookId || !coverModelId || !coverQuoteQuery.data?.referenceImageCount || isGeneratingCover || coverMutation.isPending || coverTextUnsaved || bookQuery.data.book.stale}>
                      {isGeneratingCover ? (lang === "th" ? `กำลังสร้างปก ${String((coverJobQuery.data as any)?.progress ?? "")}%` : `Generating covers ${String((coverJobQuery.data as any)?.progress ?? "")}%`) : (lang === "th" ? "สุ่มสร้างปก 3 แบบ" : "Generate 3 random covers")}
                    </Button>
                    {isGeneratingCover ? <Button type="button" variant="outline" onClick={() => selectedBookId && cancelCoverMutation.mutate({ bookId: selectedBookId })} disabled={cancelCoverMutation.isPending}>{lang === "th" ? "ยกเลิก" : "Cancel"}</Button> : null}
                  </HStack>
                  {coverMutation.error || coverModelsQuery.error || coverQuoteQuery.error ? <p role="alert" className="text-sm text-destructive">{coverMutation.error?.message ?? coverModelsQuery.error?.message ?? coverQuoteQuery.error?.message}</p> : null}
                  {!coverModelsQuery.isLoading && coverModelsQuery.data?.models.length === 0 ? <p role="alert" className="text-sm text-destructive">{lang === "th" ? "ยังไม่มีโมเดลสร้างภาพที่เปิดใช้งาน กรุณาเปิดใช้งานโมเดลภาพก่อน" : "No image generation model is enabled. Enable an image model first."}</p> : null}
                  {!isGeneratingCover && coverJobStatus === "failed" ? <p role="status" className="text-sm text-destructive">{lang === "th" ? "สร้างปกไม่สำเร็จ กรุณาตรวจสอบโมเดลและเครดิต แล้วลองสร้างชุดใหม่" : "Cover generation failed. Check the model and credits, then try a new set."}</p> : null}
                </VStack>
              </HStack>
              {bookQuery.data.coverCandidates?.length ? <VStack gap={2}>
                <p className="text-sm font-medium">{lang === "th" ? `ตัวเลือกปก ${bookQuery.data.coverCandidates.length} แบบ` : `${bookQuery.data.coverCandidates.length} cover options`}</p>
                <HStack as="ul" gap={3} wrap="wrap" aria-label={lang === "th" ? "ตัวเลือกภาพปก" : "Cover candidates"}>
                  {bookQuery.data.coverCandidates.map((candidate: any) => {
                    const overlayMatches = candidate.overlayText?.title === currentDocument.metadata.title && candidate.overlayText?.author === currentDocument.metadata.author && candidate.overlayText?.blurb === String(currentDocument.metadata.subtitle ?? "");
                    const isSelected = Number(candidate.mediaAssetId) === selectedCoverId;
                    return <VStack as="li" key={`${candidate.roundId}-${candidate.outputIndex}`} gap={2} className="w-44 rounded-lg border p-3">
                      {typeof candidate.url === "string" ? <img src={candidate.url} alt={`${currentDocument.metadata.title} · ${lang === "th" ? "ตัวเลือกปก" : "Cover option"} ${Number(candidate.outputIndex) + 1}`} loading="lazy" className="h-56 w-full rounded-md object-contain" /> : <p role="status" className="flex h-56 items-center justify-center text-sm text-muted-foreground">{lang === "th" ? "โหลดภาพตัวอย่างไม่สำเร็จ" : "Preview unavailable"}</p>}
                      <p className="text-xs text-muted-foreground">{lang === "th" ? `แบบ ${Number(candidate.outputIndex) + 1} · ภาพอ้างอิง ${Array.isArray(candidate.referenceAssetIds) ? candidate.referenceAssetIds.length : 0} ภาพ` : `Option ${Number(candidate.outputIndex) + 1} · ${Array.isArray(candidate.referenceAssetIds) ? candidate.referenceAssetIds.length : 0} shot references`}</p>
                      {!overlayMatches ? <p role="alert" className="text-xs text-destructive">{lang === "th" ? "ชื่อหรือคำโปรยเปลี่ยนแล้ว สร้างปกใหม่เพื่อให้ข้อความตรงกัน" : "Book text changed. Generate a new cover to match it."}</p> : null}
                      <Button type="button" variant={isSelected ? "default" : "outline"} size="sm" disabled={!overlayMatches} onClick={() => setDocument(current => current ? { ...current, metadata: { ...current.metadata, coverMediaAssetId: Number(candidate.mediaAssetId), coverChecksum: String(candidate.checksum), coverAltText: `${current.metadata.title} — ${lang === "th" ? "ภาพปกหนังสือ" : "Book cover"}` } } : current)}>{isSelected ? (lang === "th" ? "เลือกปกนี้แล้ว" : "Selected") : (lang === "th" ? "เลือกภาพปกนี้" : "Choose this cover")}</Button>
                    </VStack>;
                  })}
                </HStack>
              </VStack> : <p role="status" className="text-sm text-muted-foreground">{lang === "th" ? "ยังไม่มีภาพตัวเลือกปก กด “สุ่มสร้างปก 3 แบบ” เพื่อเริ่ม" : "No generated covers yet. Choose a model and generate 3 options."}</p>}
              {currentDocument.metadata.coverMediaAssetId ? <p role="status" className="text-sm text-muted-foreground">{lang === "th" ? `เลือกภาพปก #${currentDocument.metadata.coverMediaAssetId} แล้ว · กดบันทึกฉบับแก้ไขเพื่อเก็บภาพนี้` : `Cover #${currentDocument.metadata.coverMediaAssetId} selected · save edits to keep it`}</p> : null}
            </VStack>
          ) : null}
          {retryCompositionMutation.error || reNovelizeMutation.error || applyCandidateMutation.error || discardCandidateMutation.error ? <p role="alert" className="text-sm text-destructive">{retryCompositionMutation.error?.message ?? reNovelizeMutation.error?.message ?? applyCandidateMutation.error?.message ?? discardCandidateMutation.error?.message}</p> : null}
          {currentDocument.chapters.length > 0 ? <HStack gap={2} wrap="wrap" align="end" aria-label={lang === "th" ? "เลือกบทเพื่อตรวจอ่าน" : "Choose a chapter to review"}>
            <VStack gap={1}>
              <Label htmlFor="book-review-chapter">{lang === "th" ? `อ่านและตรวจทีละตอน (${currentDocument.chapters.length} ตอน)` : `Read and review an episode (${currentDocument.chapters.length} total)`}</Label>
              <Select value={selectedChapter?.id ?? ""} onValueChange={setSelectedChapterId}>
                <SelectTrigger id="book-review-chapter"><SelectValue /></SelectTrigger>
                <SelectContent>{currentDocument.chapters.map((chapter, index) => <SelectItem key={chapter.id} value={chapter.id}>{index + 1}. {chapter.title}</SelectItem>)}</SelectContent>
              </Select>
            </VStack>
            <Button type="button" variant="outline" disabled={selectedChapterIndex <= 0} onClick={() => setSelectedChapterId(currentDocument.chapters[selectedChapterIndex - 1]?.id ?? "")}>{lang === "th" ? "ตอนก่อนหน้า" : "Previous episode"}</Button>
            <Button type="button" variant="outline" disabled={selectedChapterIndex < 0 || selectedChapterIndex >= currentDocument.chapters.length - 1} onClick={() => setSelectedChapterId(currentDocument.chapters[selectedChapterIndex + 1]?.id ?? "")}>{lang === "th" ? "ตอนถัดไป" : "Next episode"}</Button>
          </HStack> : null}
          {selectedChapter ? [selectedChapter].map(chapter => (
            <VStack key={chapter.id} as="section" gap={3} aria-label={chapter.title}>
              {isReviewCandidate && previousRevisionDocument ? <details><summary>{lang === "th" ? "เปรียบเทียบกับฉบับก่อนหน้า" : "Compare with previous version"}</summary><VStack gap={2}>{(previousRevisionDocument.chapters.find(item => item.id === chapter.id)?.blocks ?? []).filter((block: any) => block.type === "paragraph" || block.type === "dialogue").map((block: any) => <p key={block.id}>{block.type === "dialogue" && block.speaker ? <strong>{block.speaker}: </strong> : null}{block.text}</p>)}</VStack></details> : null}
              <VStack as="article" gap={2} aria-label={lang === "th" ? `ตัวอย่างการอ่าน ${chapter.title}` : `Reading preview: ${chapter.title}`}>
                <h4 className="font-semibold">{chapter.title}</h4>
                {!chapter.blocks.some((block: any) => (block.type === "paragraph" || block.type === "dialogue") && String(block.text ?? "").trim()) ? <p role="status" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{lang === "th" ? "ตอนนี้ยังไม่มีเนื้อหานิยาย กด “เขียนนิยายครบทุกตอน” ด้านบน หรือเขียนเฉพาะตอนนี้จากปุ่มด้านล่าง" : "This episode has no novel text yet. Use “Write all episodes as a novel” above or write this episode below."}</p> : null}
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
                <Button type="button" variant="outline" size="sm" onClick={() => reNovelizeMutation.mutate({ bookId: selectedBookId, chapterId: chapter.id, modelId: novelizerModelId })} disabled={isComposing || !novelizerModelId || bookQuery.data.book.stale || reNovelizeMutation.isPending}>{chapter.qualityReview ? (lang === "th" ? "เขียนตอนนี้ใหม่" : "Rewrite this episode") : (lang === "th" ? "เขียนนิยายตอนนี้" : "Write this episode")}</Button>
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
          )) : null}
          {saveMutation.isSuccess ? <p role="status">{lang === "th" ? "บันทึกแล้ว" : "Saved"}</p> : null}
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
