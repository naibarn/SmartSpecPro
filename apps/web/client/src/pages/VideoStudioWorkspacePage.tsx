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
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { AppPage, type AppPageState } from "@/components/AppPage";
import { trpc } from "@/lib/trpc";
import { BriefPanel } from "@/components/videoStudio/BriefPanel";
import { CaptionsPanel } from "@/components/videoStudio/CaptionsPanel";
import { MotionPanel } from "@/components/videoStudio/MotionPanel";
import { NarrationPanel } from "@/components/videoStudio/NarrationPanel";
import { QaPanel } from "@/components/videoStudio/QaPanel";
import { RenderPanel } from "@/components/videoStudio/RenderPanel";
import { ScenesPanel } from "@/components/videoStudio/ScenesPanel";
import { StageRail, type VideoStudioStage } from "@/components/videoStudio/StageRail";
import { pickCopy, useVideoStudioLang, videoStudioCopy } from "@/components/videoStudio/videoStudioCopy";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { VStack } from "@astryxdesign/core/Layout";

export default function VideoStudioWorkspacePage() {
  const [, params] = useRoute("/video-studio/:id");
  const projectId = params?.id ? Number(params.id) : NaN;
  const lang = useVideoStudioLang();
  const utils = trpc.useUtils();

  const [stage, setStage] = useState<VideoStudioStage>("brief");
  const [draftDocument, setDraftDocument] = useState<VideoProjectDocument | null>(null);
  const [baseRevision, setBaseRevision] = useState<number | null>(null);
  const [lastSavedJson, setLastSavedJson] = useState<string>("null");
  const [conflictBanner, setConflictBanner] = useState(false);

  const projectQuery = trpc.videoProjects.get.useQuery(
    { projectId },
    { enabled: Number.isFinite(projectId) },
  );
  const project = projectQuery.data;

  useEffect(() => {
    if (project && baseRevision === null) {
      const doc = (project.document as VideoProjectDocument | null) ?? null;
      setDraftDocument(doc);
      setBaseRevision(project.revision);
      setLastSavedJson(JSON.stringify(doc));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.revision, baseRevision]);

  const hasUnsavedChanges = JSON.stringify(draftDocument) !== lastSavedJson;

  const saveDocument = trpc.videoProjects.saveDocument.useMutation({
    onSuccess: (result) => {
      setBaseRevision(result.revision);
      setLastSavedJson(JSON.stringify(draftDocument));
      setConflictBanner(false);
      toast.success(pickCopy(lang, videoStudioCopy.saved));
      utils.videoProjects.get.invalidate({ projectId });
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        setConflictBanner(true);
      } else {
        toast.error(error.message);
      }
    },
  });

  function handleReload() {
    setConflictBanner(false);
    setBaseRevision(null);
    projectQuery.refetch();
  }

  function handleSave() {
    if (!draftDocument || baseRevision === null) return;
    saveDocument.mutate({ projectId, baseRevision, document: draftDocument });
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
        { label: pickCopy(lang, videoStudioCopy.dashboard), href: "/dashboard" },
        { label: pickCopy(lang, videoStudioCopy.pageTitle), href: "/video-studio" },
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
          <Button
            data-testid="video-studio-save-document"
            label={hasUnsavedChanges ? pickCopy(lang, videoStudioCopy.save) : pickCopy(lang, videoStudioCopy.saved)}
            variant="primary"
            isDisabled={!hasUnsavedChanges || saveDocument.isPending || !draftDocument}
            isLoading={saveDocument.isPending}
            onClick={handleSave}
          />
        </>
      }
      toolbar={
        project ? (
          <StageRail lang={lang} active={stage} onSelect={setStage} />
        ) : undefined
      }
      state={pageState}
      error={{
        title: pickCopy(lang, { th: "โหลดโปรเจกต์ไม่สำเร็จ", en: "Failed to load project" }),
        description: projectQuery.error?.message,
        onRetry: () => projectQuery.refetch(),
      }}
    >
      {project ? (
        <VStack gap={4}>
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
              onDocumentInitialized={(doc) => setDraftDocument(doc)}
              onDocumentChange={(doc) => setDraftDocument(doc)}
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
            <ScenesPanel
              lang={lang}
              projectId={projectId}
              document={draftDocument}
              onChange={setDraftDocument}
            />
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
            />
          ) : null}

          {stage === "motion" && draftDocument ? (
            <MotionPanel lang={lang} document={draftDocument} onChange={setDraftDocument} />
          ) : null}

          {stage === "captions" && draftDocument ? (
            <CaptionsPanel
              lang={lang}
              projectId={projectId}
              document={draftDocument}
              onChange={setDraftDocument}
            />
          ) : null}

          {stage === "qa" && draftDocument ? (
            <QaPanel lang={lang} projectId={projectId} document={draftDocument} onChange={setDraftDocument} />
          ) : null}

          {stage === "render" ? (
            <RenderPanel lang={lang} projectId={projectId} hasUnsavedChanges={hasUnsavedChanges} />
          ) : null}
        </VStack>
      ) : null}
    </AppPage>
  );
}
