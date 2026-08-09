/**
 * VideoStudioWorkspacePage (Feature 133, section-08 §10.2) — the per-project
 * workspace: stage rail (Brief -> Scenes -> Narration -> Motion -> Captions
 * -> QA -> Render), per-stage panels operating on an in-memory draft of the
 * `VideoProjectDocument`, and explicit save (optimistic-concurrency
 * `saveDocument` with `baseRevision`). A `CONFLICT` response (stale
 * `baseRevision`) NEVER silently overwrites — it shows a banner and only
 * reloads the server's copy when the user explicitly clicks Reload.
 *
 * INTENTIONAL EXCEPTION: this file imports `@astryxdesign/core/*` components
 * directly below the `<AppPage>` shell. `AppPage.tsx`'s docstring states it
 * is "intentionally the ONLY app file... that imports @astryxdesign
 * directly" — Video Studio is a deliberate, explicit, twice-confirmed
 * user-directed exception to that rule (see
 * `planning/video-studio-astryx-migration/plan.md`). Do not treat this as
 * an accidental violation, and do not copy this pattern into other pages
 * without the same explicit sign-off.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRoute } from "wouter";
import { ArrowLeft, History, PackageSearch, Palette } from "lucide-react";
import { toast } from "sonner";

import { AppPage, type AppPageState } from "@/components/AppPage";
import { trpc } from "@/lib/trpc";
import { BrandKitDialog } from "@/components/videoStudio/BrandKitDialog";
import { BriefPanel } from "@/components/videoStudio/BriefPanel";
import { BrollPanel } from "@/components/videoStudio/BrollPanel";
import { CaptionsPanel } from "@/components/videoStudio/CaptionsPanel";
import { MotionPanel } from "@/components/videoStudio/MotionPanel";
import { NarrationPanel } from "@/components/videoStudio/NarrationPanel";
import { ProductLibraryPanel } from "@/components/videoStudio/ProductLibraryPanel";
import { QaPanel } from "@/components/videoStudio/QaPanel";
import { RenderPanel } from "@/components/videoStudio/RenderPanel";
import { RevisionHistoryDialog } from "@/components/videoStudio/RevisionHistoryDialog";
import { ScenesPanel } from "@/components/videoStudio/ScenesPanel";
import { deriveStageRailState } from "@/components/videoStudio/stageRailState";
import {
  StageRail,
  type VideoStudioStage,
} from "@/components/videoStudio/StageRail";
import { StageApprovalBar } from "@/components/videoStudio/StageApprovalBar";
import { TimelineStagePanel } from "@/components/videoStudio/TimelineStagePanel";
import { VideoStudioAssetDock } from "@/components/videoStudio/VideoStudioAssetDock";
import type { VideoStudioTimelineAsset } from "@/components/videoStudio/VideoStudioAssetPicker";
import { uploadMedia } from "@/components/editor/uploadMedia";
import {
  pickCopy,
  useVideoStudioLang,
  videoStudioCopy,
} from "@/components/videoStudio/videoStudioCopy";
import {
  VIDEO_AUTOMATION_MODES,
  type VideoAutomationMode,
} from "@shared/videoIntelligence/automationMode";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { isStageResultReady } from "@shared/videoIntelligence/stageApproval";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { VStack } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";

/**
 * Below this width the product library panel defaults to closed (it would
 * otherwise crowd out the main stage content on narrow viewports). Still
 * fully toggleable regardless of width via the header button.
 */
const PRODUCT_PANEL_DEFAULT_OPEN_MIN_WIDTH = 1100;

export default function VideoStudioWorkspacePage() {
  const [, params] = useRoute("/video-studio/:id");
  const projectId = params?.id ? Number(params.id) : NaN;
  const lang = useVideoStudioLang();
  const utils = trpc.useUtils();

  const [stage, setStage] = useState<VideoStudioStage>("brief");
  const [draftDocument, setDraftDocument] =
    useState<VideoProjectDocument | null>(null);
  const [baseRevision, setBaseRevision] = useState<number | null>(null);
  const [lastSavedJson, setLastSavedJson] = useState<string>("null");
  const [conflictBanner, setConflictBanner] = useState(false);
  const [acceptedDraftHandoff, setAcceptedDraftHandoff] = useState(false);
  const [isProductPanelOpen, setIsProductPanelOpen] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.innerWidth >= PRODUCT_PANEL_DEFAULT_OPEN_MIN_WIDTH
  );
  const [isRevisionHistoryOpen, setIsRevisionHistoryOpen] = useState(false);
  const [isBrandKitDialogOpen, setIsBrandKitDialogOpen] = useState(false);
  const [automationMode, setAutomationMode] =
    useState<VideoAutomationMode>("guided");
  const [mediaPanelWidth, setMediaPanelWidth] = useState(320);
  const [selectedMediaAsset, setSelectedMediaAsset] =
    useState<VideoStudioTimelineAsset | null>(null);
  const baseRevisionRef = useRef<number | null>(null);
  const brollSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mediaPanelResizeRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resize = mediaPanelResizeRef.current;
      if (!resize) return;
      const nextWidth = Math.min(
        480,
        Math.max(280, resize.startWidth + resize.startX - event.clientX)
      );
      setMediaPanelWidth(nextWidth);
    };
    const handlePointerUp = () => {
      if (!mediaPanelResizeRef.current) return;
      mediaPanelResizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  function startMediaPanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    mediaPanelResizeRef.current = {
      startX: event.clientX,
      startWidth: mediaPanelWidth,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function nudgeMediaPanel(delta: number) {
    setMediaPanelWidth(current =>
      Math.min(480, Math.max(280, current + delta))
    );
  }

  async function selectPersistentLocalMedia(file: File) {
    const kind = file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("image/")
        ? "image"
        : null;
    if (!kind) {
      toast.error(
        pickCopy(lang, {
          th: "รองรับเฉพาะไฟล์ภาพและวิดีโอ",
          en: "Only image and video files are supported",
        })
      );
      return;
    }
    try {
      const uploaded = await uploadMedia(file, {
        metadata: { videoStudioBroll: true },
      });
      setSelectedMediaAsset({
        assetId: uploaded.assetId,
        storageUrl: uploaded.url,
        sha256: "",
        kind,
        thumbnailUrl: uploaded.thumbnailUrl ?? undefined,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "นำเข้าสื่อไม่สำเร็จ"
      );
    }
  }

  const projectQuery = trpc.videoProjects.get.useQuery(
    { projectId },
    { enabled: Number.isFinite(projectId) }
  );
  const project = projectQuery.data;

  useEffect(() => {
    const nextMode = project?.automationMode;
    if (nextMode === "guided" || nextMode === "manual")
      setAutomationMode(nextMode);
  }, [project?.automationMode]);

  const updateAutomationMode =
    trpc.videoProjects.updateAutomationMode.useMutation({
      onSuccess: () => {
        toast.success(
          pickCopy(lang, {
            th: "บันทึกรูปแบบการทำงานแล้ว",
            en: "Workflow mode saved",
          })
        );
        void projectQuery.refetch();
      },
      onError: error => {
        toast.error(error.message);
        void projectQuery.refetch();
      },
    });

  // Stage rail per-stage progress dots (this task) — same underlying query
  // `useGenerationJobPoll` uses (`getActiveGenerationJob`), read here at the
  // page level too so the rail can reflect an in-flight job regardless of
  // which stage panel is currently mounted. No new server fields/queries.
  const activeJobQuery = trpc.videoProjects.getActiveGenerationJob.useQuery(
    { projectId },
    { enabled: Number.isFinite(projectId), staleTime: 0, refetchInterval: 2500 }
  );
  const stageState = deriveStageRailState({
    document: draftDocument,
    qaLedger: project?.qaLedger,
    activeJob: activeJobQuery.data,
  });
  // Feature 143 §4.13 "Generation job running" — any in-flight job that
  // rewrites scene timing (and therefore silently re-homes hand-authored
  // layers, §4.9.2) puts the compose stage's whole surface read-only.
  const activeJobKind = (
    activeJobQuery.data as { kind?: string } | null | undefined
  )?.kind;
  const isComposeGenerationJobActive =
    activeJobKind === "scene_plan" ||
    activeJobKind === "auto_draft" ||
    activeJobKind === "quality_repair";

  // Feature 143 §4.14 — auto-collapse the product library panel on entering
  // the compose stage; it would otherwise crowd out the timeline.
  useEffect(() => {
    if (stage === "compose") setIsProductPanelOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const projectBrief = (project?.brief ?? null) as Record<
    string,
    unknown
  > | null;
  const catalogProductId =
    project?.studioType === "catalog" &&
    typeof projectBrief?.productId === "string"
      ? (projectBrief.productId as string)
      : null;
  const projectSourceRefs = (project?.sourceRefs ?? null) as {
    productIds?: string[];
  } | null;

  useEffect(() => {
    if (project && baseRevision === null) {
      const doc = (project.document as VideoProjectDocument | null) ?? null;
      setDraftDocument(doc);
      setBaseRevision(project.revision);
      setLastSavedJson(JSON.stringify(doc));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.revision, baseRevision]);

  useEffect(() => {
    baseRevisionRef.current = baseRevision;
  }, [baseRevision]);

  const hasUnsavedChanges = JSON.stringify(draftDocument) !== lastSavedJson;

  const saveDocument = trpc.videoProjects.saveDocument.useMutation({
    onSuccess: (result, variables) => {
      baseRevisionRef.current = result.revision;
      setBaseRevision(result.revision);
      setLastSavedJson(JSON.stringify(variables.document));
      setConflictBanner(false);
      toast.success(pickCopy(lang, videoStudioCopy.saved));
      utils.videoProjects.get.invalidate({ projectId });
    },
    onError: error => {
      if (error.data?.code === "CONFLICT") {
        setConflictBanner(true);
      } else {
        toast.error(error.message);
      }
    },
  });

  /**
   * B-roll is inserted from a stage that unmounts when the user changes tabs.
   * Queue these small writes so two quick drops use consecutive revisions
   * instead of racing with the same optimistic-concurrency token.
   */
  const persistBrollDocument = useCallback(
    async (nextDocument: VideoProjectDocument): Promise<void> => {
      const operation = brollSaveQueueRef.current.then(async () => {
        const revision = baseRevisionRef.current ?? project?.revision;
        if (revision == null) return;
        await saveDocument.mutateAsync({
          projectId,
          baseRevision: revision,
          document: nextDocument,
        });
      });
      brollSaveQueueRef.current = operation.catch(() => undefined);
      await operation;
    },
    [project?.revision, projectId, saveDocument]
  );

  function handleReload() {
    setConflictBanner(false);
    setBaseRevision(null);
    projectQuery.refetch();
  }

  async function persistDocument(): Promise<number | undefined> {
    if (!draftDocument) return undefined;
    const revision = baseRevision ?? project?.revision;
    if (revision == null) return undefined;
    if (!hasUnsavedChanges) return revision;

    const result = await saveDocument.mutateAsync({
      projectId,
      baseRevision: revision,
      document: draftDocument,
    });
    return result.revision;
  }

  function handleSave() {
    void persistDocument();
  }

  const pageState: AppPageState = !Number.isFinite(projectId)
    ? "error"
    : projectQuery.isLoading
      ? "loading"
      : projectQuery.isError || !project
        ? "error"
        : "ready";

  return (
    <AppPage
      title={project?.name ?? pickCopy(lang, videoStudioCopy.pageTitle)}
      description={project?.studioType}
      breadcrumbs={[
        {
          label: pickCopy(lang, videoStudioCopy.dashboard),
          href: "/dashboard",
        },
        {
          label: pickCopy(lang, videoStudioCopy.pageTitle),
          href: "/video-studio",
        },
        { label: project?.name ?? "..." },
      ]}
      actions={
        <>
          {/*
           * No wrapping div here on purpose: AppPage's own header already
           * wraps `actions` in an Astryx HStack with `wrap="wrap"`, so the
           * back button and Save button wrap onto their own line on narrow
           * viewports instead of overflowing/cramping (the previous
           * shadcn-based row had zero responsive handling at all).
           */}
          <IconButton
            icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
            label={pickCopy(lang, { th: "ย้อนกลับ", en: "Back" })}
            variant="ghost"
            href="/video-studio"
          />
          {catalogProductId ? (
            <Button
              data-testid="video-studio-product-panel-toggle"
              type="button"
              variant={isProductPanelOpen ? "secondary" : "ghost"}
              icon={<PackageSearch className="h-4 w-4" aria-hidden="true" />}
              label={pickCopy(lang, videoStudioCopy.productLibraryToggle)}
              aria-pressed={isProductPanelOpen}
              onClick={() => setIsProductPanelOpen(prev => !prev)}
            />
          ) : null}
          <Button
            data-testid="brand-kit-open"
            type="button"
            variant="ghost"
            icon={<Palette className="h-4 w-4" aria-hidden="true" />}
            label={pickCopy(lang, videoStudioCopy.brandKitOpen)}
            onClick={() => setIsBrandKitDialogOpen(true)}
          />
          <Button
            data-testid="revision-history-open"
            type="button"
            variant="ghost"
            icon={<History className="h-4 w-4" aria-hidden="true" />}
            label={pickCopy(lang, videoStudioCopy.revisionHistoryOpen)}
            onClick={() => setIsRevisionHistoryOpen(true)}
          />
          <Selector
            label={pickCopy(lang, videoStudioCopy.automationModeLabel)}
            options={VIDEO_AUTOMATION_MODES.map(value => ({
              value,
              label: pickCopy(
                lang,
                value === "guided"
                  ? videoStudioCopy.automationModeGuided
                  : videoStudioCopy.automationModeManual
              ),
            }))}
            value={automationMode}
            onChange={value => {
              const nextMode = value as VideoAutomationMode;
              setAutomationMode(nextMode);
              updateAutomationMode.mutate({
                projectId,
                automationMode: nextMode,
              });
            }}
            isDisabled={updateAutomationMode.isPending}
            data-testid="video-studio-automation-mode"
          />
          <Button
            data-testid="video-studio-save-document"
            label={
              hasUnsavedChanges
                ? pickCopy(lang, videoStudioCopy.save)
                : pickCopy(lang, videoStudioCopy.saved)
            }
            variant="primary"
            isDisabled={
              !hasUnsavedChanges || saveDocument.isPending || !draftDocument
            }
            isLoading={saveDocument.isPending}
            onClick={handleSave}
          />
        </>
      }
      toolbar={
        project ? (
          <StageRail
            lang={lang}
            active={stage}
            onSelect={nextStage => {
              setStage(nextStage);
              if (nextStage !== "scenes") setAcceptedDraftHandoff(false);
            }}
            stageState={stageState}
          />
        ) : undefined
      }
      state={pageState}
      error={{
        title: pickCopy(lang, {
          th: "โหลดโปรเจกต์ไม่สำเร็จ",
          en: "Failed to load project",
        }),
        description: projectQuery.error?.message,
        onRetry: () => projectQuery.refetch(),
      }}
    >
      {project ? (
        <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start">
          <VStack gap={4} className="min-w-0 flex-1">
            <StageApprovalBar
              lang={lang}
              projectId={projectId}
              status={project.status}
              canApprove={
                !hasUnsavedChanges &&
                isStageResultReady(
                  project.status,
                  (project.document as VideoProjectDocument | null) ?? null
                )
              }
              onChanged={() => {
                setBaseRevision(null);
                void projectQuery.refetch();
              }}
            />

            {conflictBanner ? (
              <Banner
                data-testid="video-studio-conflict-banner"
                status="error"
                title={pickCopy(lang, videoStudioCopy.conflictTitle)}
                description={pickCopy(lang, videoStudioCopy.conflictBody)}
                endContent={
                  <Button
                    variant="secondary"
                    size="sm"
                    label={pickCopy(lang, videoStudioCopy.reload)}
                    onClick={handleReload}
                  />
                }
              />
            ) : null}

            {hasUnsavedChanges && !conflictBanner ? (
              <Badge
                data-testid="video-studio-unsaved-indicator"
                variant="warning"
                label={pickCopy(lang, videoStudioCopy.unsavedChanges)}
              />
            ) : null}

            {stage === "brief" ? (
              <BriefPanel
                lang={lang}
                project={project}
                document={draftDocument}
                onDocumentInitialized={doc => setDraftDocument(doc)}
                onDocumentChange={doc => setDraftDocument(doc)}
                projectRevision={baseRevision ?? project.revision}
                hasUnsavedChanges={hasUnsavedChanges}
                onSaveDocument={persistDocument}
                onDocumentSaved={(acceptedDocument, acceptedRevision) => {
                  // Accepting a content draft already promotes its exact scene
                  // list and narration into the canonical document. Consume the
                  // mutation response immediately instead of waiting for a
                  // refetch that can briefly re-render the old blank document.
                  if (acceptedDocument) {
                    setDraftDocument(acceptedDocument);
                    setLastSavedJson(JSON.stringify(acceptedDocument));
                  }
                  setBaseRevision(acceptedRevision ?? null);
                  setAcceptedDraftHandoff(true);
                  setStage("scenes");
                  void projectQuery.refetch();
                }}
              />
            ) : null}

            {stage !== "brief" && !draftDocument ? (
              <Banner
                status="warning"
                title={pickCopy(lang, {
                  th: "ยังไม่มีเอกสารวิดีโอ กรุณาเริ่มต้นในขั้นตอนโจทย์ก่อน",
                  en: "No video document yet — initialize it in the Brief stage first.",
                })}
              />
            ) : null}

            {stage === "scenes" && draftDocument ? (
              <VStack gap={3}>
                {acceptedDraftHandoff ? (
                  <Banner
                    status="success"
                    data-testid="video-studio-draft-accepted-handoff"
                    title={pickCopy(
                      lang,
                      videoStudioCopy.draftAcceptedHandoffTitle
                    )}
                    description={pickCopy(
                      lang,
                      videoStudioCopy.draftAcceptedHandoffBody
                    )}
                  />
                ) : null}
                <ScenesPanel
                  lang={lang}
                  projectId={projectId}
                  document={draftDocument}
                  onChange={setDraftDocument}
                  projectRevision={baseRevision ?? project.revision}
                  hasUnsavedChanges={hasUnsavedChanges}
                  onDocumentSaved={() => {
                    setBaseRevision(null);
                    projectQuery.refetch();
                  }}
                />
              </VStack>
            ) : null}

            {stage === "narration" && draftDocument ? (
              <NarrationPanel
                lang={lang}
                projectId={projectId}
                document={draftDocument}
                onDocumentSaved={() => {
                  setBaseRevision(null);
                  projectQuery.refetch();
                }}
                onGoToScenes={() => setStage("scenes")}
              />
            ) : null}

            {stage === "motion" && draftDocument ? (
              <MotionPanel
                lang={lang}
                projectId={projectId}
                document={draftDocument}
                onChange={setDraftDocument}
                projectRevision={baseRevision ?? project.revision}
                hasUnsavedChanges={hasUnsavedChanges}
                onDocumentSaved={() => {
                  setBaseRevision(null);
                  projectQuery.refetch();
                }}
                onGoToCompose={() => setStage("compose")}
              />
            ) : null}

            {stage === "broll" && draftDocument ? (
              <BrollPanel
                lang={lang}
                projectId={projectId}
                document={draftDocument}
                onChange={setDraftDocument}
                onSaveDocument={persistBrollDocument}
                selectedAsset={selectedMediaAsset}
                onConsumeSelectedAsset={() => setSelectedMediaAsset(null)}
              />
            ) : null}

            {stage === "captions" && draftDocument ? (
              <CaptionsPanel
                lang={lang}
                projectId={projectId}
                document={draftDocument}
                onChange={setDraftDocument}
              />
            ) : null}

            {stage === "compose" && draftDocument ? (
              <TimelineStagePanel
                lang={lang}
                projectId={projectId}
                document={draftDocument}
                hasUnsavedChanges={hasUnsavedChanges}
                isGenerationJobActive={isComposeGenerationJobActive}
                baseRevision={baseRevision}
                onDocumentChange={setDraftDocument}
                onRevisionSaved={(revision, document) => {
                  setBaseRevision(revision);
                  setLastSavedJson(JSON.stringify(document));
                  setConflictBanner(false);
                }}
              />
            ) : null}

            {stage === "qa" && draftDocument ? (
              <QaPanel
                lang={lang}
                projectId={projectId}
                document={draftDocument}
                onChange={setDraftDocument}
                qaLedger={project.qaLedger}
                projectRevision={baseRevision ?? project.revision}
                hasUnsavedChanges={hasUnsavedChanges}
                onDocumentSaved={() => {
                  setBaseRevision(null);
                  projectQuery.refetch();
                }}
              />
            ) : null}

            {stage === "render" && draftDocument ? (
              <RenderPanel
                lang={lang}
                projectId={projectId}
                hasUnsavedChanges={hasUnsavedChanges}
                onGoToQa={() => setStage("qa")}
              />
            ) : null}
          </VStack>

          <aside
            className="w-full min-h-0 shrink-0 self-start md:max-h-[34rem] lg:sticky lg:top-4 lg:h-[calc(100dvh-160px)] lg:max-h-none lg:w-[var(--video-media-panel-width)]"
            style={
              {
                "--video-media-panel-width": `${mediaPanelWidth}px`,
              } as CSSProperties
            }
          >
            <div className="flex h-full min-h-0 w-full items-stretch gap-2">
              <button
                type="button"
                role="separator"
                aria-orientation="vertical"
                aria-label="ปรับความกว้าง panel สื่อ"
                aria-valuemin={280}
                aria-valuemax={480}
                aria-valuenow={mediaPanelWidth}
                tabIndex={0}
                className="hidden w-2 shrink-0 cursor-col-resize items-center justify-center rounded-full text-muted-foreground/50 transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:flex"
                onPointerDown={startMediaPanelResize}
                onKeyDown={event => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    nudgeMediaPanel(16);
                  } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    nudgeMediaPanel(-16);
                  }
                }}
              >
                <span className="h-12 w-1 rounded-full bg-border" />
              </button>
              <VStack
                gap={4}
                className="min-h-0 min-w-0 flex-1 md:max-h-[34rem] lg:max-h-none"
              >
                {draftDocument ? (
                  <VideoStudioAssetDock
                    lang={lang}
                    projectId={projectId}
                    document={draftDocument}
                    className="h-full"
                    selectedAsset={selectedMediaAsset}
                    onAssetSelect={setSelectedMediaAsset}
                    onLocalFile={file => void selectPersistentLocalMedia(file)}
                  />
                ) : null}
                {catalogProductId && isProductPanelOpen ? (
                  <ProductLibraryPanel
                    lang={lang}
                    projectId={projectId}
                    productId={catalogProductId}
                    brief={projectBrief}
                    sourceRefs={projectSourceRefs}
                  />
                ) : null}
              </VStack>
            </div>
          </aside>
        </div>
      ) : null}

      {project ? (
        <RevisionHistoryDialog
          lang={lang}
          projectId={projectId}
          isOpen={isRevisionHistoryOpen}
          onOpenChange={setIsRevisionHistoryOpen}
          onRestored={() => {
            setBaseRevision(null);
            projectQuery.refetch();
          }}
        />
      ) : null}

      {project ? (
        <BrandKitDialog
          lang={lang}
          projectId={projectId}
          projectRevision={baseRevision ?? project.revision}
          currentBrandKitId={
            typeof project.brandKitId === "number" ? project.brandKitId : null
          }
          isOpen={isBrandKitDialogOpen}
          onOpenChange={setIsBrandKitDialogOpen}
          onAttached={() => {
            setBaseRevision(null);
            projectQuery.refetch();
          }}
        />
      ) : null}
    </AppPage>
  );
}
