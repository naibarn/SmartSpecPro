/**
 * Motion stage panel (Feature 133, section-08; reworked for the motion
 * multi-variant picker follow-on). Two layers, top to bottom:
 *
 * 1. AI variant picker (this task) — `runMotionStage` proposes 2-3 motion
 *    template candidates per scene into `scene.motionCandidates` (never
 *    touches `scene.visual`/`scene.motion` itself, see
 *    `server/services/videoProjectMotionDirector.ts`). Wired EXACTLY like
 *    `ScenesPanel`'s scene_plan launcher: `StageLaunchCard` opens
 *    `StageEstimateDialog`, `onConfirm` dispatches `runMotionStage`,
 *    `useGenerationJobPoll` polls to completion, then the document is
 *    refetched via `onDocumentSaved`. Applying a candidate is a SEPARATE,
 *    cheap, synchronous, non-LLM mutation (`selectMotionCandidate`) — the
 *    ONLY thing that ever writes `scene.visual`/`scene.motion` from a
 *    candidate.
 * 2. The pre-existing manual template picker + JSON params editor ("advanced"
 *    path) — kept exactly as-is below the variants, for scenes the AI picker
 *    doesn't cover or a user who wants to hand-tune a template's params.
 *
 * Lists the ~10 registry templates via `trpc.videoProjects.listMotionTemplates`
 * (client-safe metadata, `shared/videoIntelligence/motionTemplates.ts`).
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";

import { trpc } from "@/lib/trpc";
import type { MotionCandidate, VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import { StageEstimateDialog, type StageEstimate } from "./StageEstimateDialog";
import { StageLaunchCard } from "./StageLaunchCard";
import { useGenerationJobPoll } from "./useGenerationJobPoll";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

const NO_TEMPLATE_VALUE = "__none__";

/** Thai/English display names for the ~10 registry motion templates
 *  (`shared/videoIntelligence/motionTemplates.ts` `MOTION_TEMPLATE_IDS`).
 *  `listMotionTemplates`/`MotionTemplateMeta` carries no human name or
 *  description field (only id/kind/categories/durations/etc — confirmed by
 *  reading both the router procedure and the registry), so this is a
 *  client-side id -> Thai name map with a raw-id fallback for any template
 *  the registry adds later. Also reused by the AI variant cards below so a
 *  candidate's template shows the same human name as the manual picker. */
const MOTION_TEMPLATE_LABEL: Record<string, { th: string; en: string }> = {
  product_hero: { th: "ฮีโร่สินค้า", en: "Product hero" },
  glass_feature_cards: { th: "การ์ดฟีเจอร์กระจกใส", en: "Glass feature cards" },
  how_to_steps: { th: "ขั้นตอนวิธีใช้", en: "How-to steps" },
  comparison_stage: { th: "เวทีเปรียบเทียบ", en: "Comparison stage" },
  review_highlight: { th: "ไฮไลต์รีวิว", en: "Review highlight" },
  kinetic_typography: { th: "ตัวอักษรเคลื่อนไหว", en: "Kinetic typography" },
  floating_gallery: { th: "แกลเลอรีลอยตัว", en: "Floating gallery" },
  luxury_end_card: { th: "การ์ดปิดท้ายสไตล์หรู", en: "Luxury end card" },
  data_flow: { th: "แผนภาพการไหลของข้อมูล", en: "Data flow" },
  animated_chart_basic: { th: "กราฟเคลื่อนไหวพื้นฐาน", en: "Animated chart (basic)" },
  particle_field: { th: "สนามอนุภาคพลังงาน", en: "Particle energy field" },
  network_graph: { th: "เครือข่ายข้อมูล", en: "Network graph" },
  glowing_sphere: { th: "ทรงกลมเรืองแสง", en: "Glowing sphere" },
};

const PROCEDURAL_MOTION_TEMPLATE_IDS = ["particle_field", "network_graph", "glowing_sphere"] as const;

function motionTemplateLabel(lang: VideoStudioLang, templateId: string): string {
  const known = MOTION_TEMPLATE_LABEL[templateId];
  return known ? pickCopy(lang, known) : templateId;
}

const MOTION_INTENSITY_LABEL_KEY = {
  low: "motionVariantIntensityLow",
  medium: "motionVariantIntensityMedium",
  high: "motionVariantIntensityHigh",
} as const satisfies Record<string, keyof typeof videoStudioCopy>;

function motionIntensityLabel(lang: VideoStudioLang, intensity: string): string {
  const key = (MOTION_INTENSITY_LABEL_KEY as Record<string, keyof typeof videoStudioCopy>)[intensity];
  return key ? pickCopy(lang, videoStudioCopy[key]) : intensity;
}

/** Short Thai/English example JSON per template, keyed to each builder's
 *  real `paramsSchema` (read from `server/remotion/templates/<id>.ts` — not
 *  edited here, client-side reference only). Templates without a known
 *  example fall back to a generic helper line instead of a bogus example. */
const MOTION_TEMPLATE_PARAMS_EXAMPLE: Record<string, string> = {
  product_hero: JSON.stringify(
    { assetId: 123, mediaKind: "image", headline: "หัวข้อสินค้า", subheadline: "รายละเอียดเสริม (ไม่บังคับ)" },
    null,
    2,
  ),
  glass_feature_cards: JSON.stringify(
    { cards: [{ title: "ฟีเจอร์ 1", description: "คำอธิบายสั้น ๆ" }] },
    null,
    2,
  ),
  how_to_steps: JSON.stringify({ steps: ["ขั้นตอนที่ 1", "ขั้นตอนที่ 2"] }, null, 2),
  comparison_stage: JSON.stringify(
    { items: [{ assetId: 123, label: "ตัวเลือกที่ 1" }, { assetId: 456, label: "ตัวเลือกที่ 2" }] },
    null,
    2,
  ),
  review_highlight: JSON.stringify(
    { rating: 5, quote: "สินค้าดีมาก แนะนำเลย", authorName: "ลูกค้า A" },
    null,
    2,
  ),
  kinetic_typography: JSON.stringify({ words: ["คำ", "ที่", "จะ", "เคลื่อนไหว"] }, null, 2),
  floating_gallery: JSON.stringify({ assetIds: [123, 456, 789], caption: "คำบรรยายแกลเลอรี" }, null, 2),
  luxury_end_card: JSON.stringify({ ctaText: "สั่งซื้อตอนนี้", logoAssetId: 123 }, null, 2),
  data_flow: JSON.stringify({ nodes: ["ขั้นตอน 1", "ขั้นตอน 2", "ขั้นตอน 3"] }, null, 2),
  animated_chart_basic: JSON.stringify(
    { values: [{ label: "ก", value: 40 }, { label: "ข", value: 60 }] },
    null,
    2,
  ),
  particle_field: JSON.stringify(
    {
      seed: 42,
      density: "medium",
      speed: 1,
      palette: ["#60a5fa", "#22d3ee", "#facc15"],
      title: "หัวข้อการเปลี่ยนแปลง",
      subtitle: "อนุภาคเคลื่อนตามจังหวะเนื้อหา",
      events: [{ frame: 0, kind: "enter", strength: 1 }],
    },
    null,
    2,
  ),
  network_graph: JSON.stringify(
    {
      seed: 7,
      nodes: ["ปัญหา", "ข้อมูล", "วิเคราะห์", "ผลลัพธ์"],
      palette: ["#60a5fa", "#22d3ee", "#facc15"],
      speed: 1,
      linkDistance: 0.34,
      title: "ความสัมพันธ์ของข้อมูล",
      subtitle: "แสดงการไหลจากเหตุผลไปสู่ผลลัพธ์",
      events: [{ frame: 0, kind: "reveal", strength: 1 }],
    },
    null,
    2,
  ),
  glowing_sphere: JSON.stringify(
    {
      seed: 11,
      density: "medium",
      color: "#38bdf8",
      secondaryColor: "#60a5fa",
      rotationSpeed: 0.35,
      title: "ภาพรวมระบบ",
      subtitle: "จุดข้อมูลเชื่อมโยงกันอย่างต่อเนื่อง",
    },
    null,
    2,
  ),
};

const MOTION_PARAMS_HELPER = {
  th: "กรอกพารามิเตอร์เป็น JSON ตามโครงสร้างของเทมเพลตที่เลือก",
  en: "Enter params as a JSON object matching this template's shape.",
};

type MotionVariantMode = "fill_empty" | "replace";

/** `executeMotionStage`'s (`server/routers/videoProjects.ts`) job result
 *  shape — read defensively (this file never imports server code). */
type MotionJobResult = {
  kind?: string;
  rejectedSceneIds?: string[];
};

export function MotionPanel({
  lang,
  projectId,
  document,
  onChange,
  projectRevision,
  hasUnsavedChanges,
  onDocumentSaved,
  onGoToCompose,
}: {
  lang: VideoStudioLang;
  projectId: number;
  document: VideoProjectDocument;
  onChange: (next: VideoProjectDocument) => void;
  projectRevision: number;
  hasUnsavedChanges: boolean;
  /** Fired once per terminal `motion` job AND per successful
   *  `selectMotionCandidate` call so the draft is refreshed from the server
   *  — otherwise the next Save silently overwrites either the AI's
   *  candidates or the just-applied selection (same convention as every
   *  other stage panel, spec §6.4). */
  onDocumentSaved: () => void;
  /** Opens the single Remotion-backed preview surface in Compose. */
  onGoToCompose?: () => void;
}) {
  const templatesQuery = trpc.videoProjects.listMotionTemplates.useQuery({});
  const templates = templatesQuery.data ?? [];
  const [paramsDraft, setParamsDraft] = useState<Record<string, string>>({});
  const [paramsError, setParamsError] = useState<Record<string, string | null>>({});
  // Client-only, session-local tracking of which scenes the user has
  // touched in THIS panel — used purely to withhold the "auto-drafted"
  // badge once a user has actively edited a scene here. No new document
  // field: the schema has no source-of-template flag, and the task brief
  // says not to invent server plumbing for this.
  const [touchedSceneIds, setTouchedSceneIds] = useState<Set<string>>(new Set());

  function markTouched(sceneId: string) {
    setTouchedSceneIds((prev) => (prev.has(sceneId) ? prev : new Set(prev).add(sceneId)));
  }

  /* -------------------------------------------------------------------- */
  /* AI motion variants — launcher                                        */
  /* -------------------------------------------------------------------- */

  const motionPoll = useGenerationJobPoll(projectId, "motion");
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [mode, setMode] = useState<MotionVariantMode>("fill_empty");
  const handledJobId = useRef<string | null>(null);

  const estimateQuery = trpc.videoProjects.getStageEstimate.useQuery(
    { projectId, stage: "motion" },
    { enabled: estimateOpen, staleTime: 0 },
  );

  const runMotion = trpc.videoProjects.runMotionStage.useMutation({
    onSuccess: (result: { jobId: string }) => {
      motionPoll.setJobId(result.jobId);
      setEstimateOpen(false);
    },
  });

  useEffect(() => {
    if (
      motionPoll.jobStatus?.status === "succeeded" &&
      motionPoll.jobId &&
      handledJobId.current !== motionPoll.jobId
    ) {
      handledJobId.current = motionPoll.jobId;
      onDocumentSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionPoll.jobStatus?.status, motionPoll.jobId]);

  const jobResult =
    motionPoll.jobStatus?.status === "succeeded"
      ? (motionPoll.jobStatus.result as MotionJobResult | undefined)
      : undefined;
  const rejectedSceneIds = new Set(jobResult?.rejectedSceneIds ?? []);

  const blockedReason = hasUnsavedChanges
    ? { title: pickCopy(lang, videoStudioCopy.unsavedChanges), body: pickCopy(lang, videoStudioCopy.saveBeforeRunning) }
    : null;

  const destructive =
    mode === "replace"
      ? {
          title: pickCopy(lang, videoStudioCopy.motionVariantModeReplace),
          body: pickCopy(lang, videoStudioCopy.motionVariantReplaceWarning),
        }
      : null;

  const usesCaptionSync = document.scenes.some((scene) => scene.motion.sync !== "scene");

  function setMotionSync(sync: "scene" | "captions") {
    onChange({
      ...document,
      scenes: document.scenes.map((scene) => ({
        ...scene,
        motion: { ...scene.motion, sync },
      })),
    });
  }

  function setSceneMotionSync(sceneId: string, sync: "scene" | "captions") {
    markTouched(sceneId);
    onChange({
      ...document,
      scenes: document.scenes.map((scene) =>
        scene.sceneId === sceneId ? { ...scene, motion: { ...scene.motion, sync } } : scene,
      ),
    });
  }

  /* -------------------------------------------------------------------- */
  /* AI motion variants — apply one candidate                             */
  /* -------------------------------------------------------------------- */

  const [applyError, setApplyError] = useState<Record<string, string | null>>({});

  const selectCandidate = trpc.videoProjects.selectMotionCandidate.useMutation({
    onSuccess: (_result: unknown, variables: { sceneId: string }) => {
      setApplyError((prev) => ({ ...prev, [variables.sceneId]: null }));
      onDocumentSaved();
    },
    onError: (error: { message: string }, variables: { sceneId: string }) => {
      setApplyError((prev) => ({
        ...prev,
        [variables.sceneId]: pickCopy(lang, videoStudioCopy.motionVariantApplyError) || error.message,
      }));
    },
  });

  // Per-scene pending guard (never panel-wide — a known anti-pattern in this
  // repo, see memory `project_panel_wide_pending_dead_button`): this shared
  // mutation instance only ever has ONE in-flight call at a time, so the
  // scene whose Apply button was clicked is read straight off `variables`.
  function isApplyingFor(sceneId: string): boolean {
    return selectCandidate.isPending && selectCandidate.variables?.sceneId === sceneId;
  }

  function applyCandidate(sceneId: string, candidate: MotionCandidate) {
    selectCandidate.mutate({
      projectId,
      baseRevision: projectRevision,
      sceneId,
      candidateId: candidate.candidateId,
    });
  }

  /* -------------------------------------------------------------------- */
  /* Manual template picker (advanced) — unchanged from before this task  */
  /* -------------------------------------------------------------------- */

  function setSceneTemplate(sceneId: string, templateId: string | null) {
    markTouched(sceneId);
    const scenes = document.scenes.map((scene) => {
      if (scene.sceneId !== sceneId) return scene;
      if (!templateId) {
        return { ...scene, visual: { kind: "layers" as const } };
      }
      return {
        ...scene,
        visual: {
          kind: "template" as const,
          templateId,
          params: scene.visual.kind === "template" ? scene.visual.params : {},
        },
      };
    });
    onChange({ ...document, scenes });
  }

  function setSceneParams(sceneId: string, raw: string) {
    markTouched(sceneId);
    setParamsDraft((prev) => ({ ...prev, [sceneId]: raw }));
    try {
      const parsed = raw.trim() ? JSON.parse(raw) : {};
      setParamsError((prev) => ({ ...prev, [sceneId]: null }));
      const scenes = document.scenes.map((scene) =>
        scene.sceneId === sceneId && scene.visual.kind === "template"
          ? { ...scene, visual: { ...scene.visual, params: parsed } }
          : scene,
      );
      onChange({ ...document, scenes });
    } catch {
      setParamsError((prev) => ({
        ...prev,
        [sceneId]: pickCopy(lang, { th: "JSON ไม่ถูกต้อง", en: "Invalid JSON" }),
      }));
    }
  }

  return (
    <VStack gap={4} data-testid="video-studio-motion-panel">
      <Card variant="muted" padding={2} data-testid="motion-autodraft-banner">
        <Text type="body" color="secondary">
          {pickCopy(lang, videoStudioCopy.motionAutoDraftBanner)}
        </Text>
      </Card>

      <Card variant="muted" padding={2} data-testid="motion-sync-settings">
        <VStack gap={2}>
          <Heading level={5}>{pickCopy(lang, { th: "จังหวะ Motion", en: "Motion pacing" })}</Heading>
          <Text type="supporting" color="secondary">
            {pickCopy(lang, {
              th: "เลือกให้ภาพและกราฟิกเริ่มจังหวะใหม่ตาม cue ของบทพูด/ซับที่ได้จากเสียงจริง หรือใช้ motion ต่อเนื่องแบบเรียบง่าย",
              en: "Restart visual motion on real narration/caption cue boundaries, or keep a calm continuous scene motion.",
            })}
          </Text>
          <select
            data-testid="motion-sync-select"
            value={usesCaptionSync ? "captions" : "scene"}
            onChange={(event) => setMotionSync(event.target.value as "scene" | "captions")}
            className="rounded-md border px-3 py-2"
          >
            <option value="captions">ตามบทพูด / ซับ (แนะนำ)</option>
            <option value="scene">ต่อเนื่องทั้งฉาก</option>
          </select>
        </VStack>
      </Card>

      <Card padding={3} data-testid="motion-graphics-section">
        <VStack gap={2}>
          <HStack justify="between" align="center" wrap="wrap">
            <VStack gap={0.5}>
              <Heading level={4}>Motion graphics ตามบทพูด</Heading>
              <Text type="supporting" color="secondary">
                กราฟิกจะถูกสร้างแบบ declarative โดย Remotion จากเทมเพลตที่เลือก ไม่ใช่ไฟล์ media แยก และจะขยับตาม cue ของเสียงพากย์/ซับใน preview และตอน render
              </Text>
            </VStack>
            <Badge variant="info" label="Remotion · preview = render" />
          </HStack>
          <HStack gap={1.5} wrap="wrap" data-testid="motion-graphics-procedural-templates">
            {PROCEDURAL_MOTION_TEMPLATE_IDS.map((templateId) => (
              <Badge
                key={templateId}
                variant="neutral"
                label={motionTemplateLabel(lang, templateId)}
              />
            ))}
          </HStack>
          <HStack justify="between" align="center" wrap="wrap">
            <Text type="supporting" color="secondary">
              กดสร้างตัวเลือก AI ด้านล่าง แล้วกด “ใช้ตัวเลือกนี้” ในแต่ละฉาก จากนั้นเปิด Preview ในแท็บจัดวาง & ไทม์ไลน์เพื่อตรวจสอบจังหวะจริงก่อน render
            </Text>
            {onGoToCompose ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                label="ดู Preview ในไทม์ไลน์"
                onClick={onGoToCompose}
                data-testid="motion-graphics-open-preview"
              />
            ) : null}
          </HStack>
        </VStack>
      </Card>

      <StageLaunchCard
        lang={lang}
        title={pickCopy(lang, videoStudioCopy.motionVariantsTitle)}
        buttonLabel={pickCopy(lang, videoStudioCopy.runMotionVariants)}
        icon={<Sparkles className="h-4 w-4" />}
        testId="motion-generate-launch"
        jobStatus={motionPoll.jobStatus}
        blockedReason={blockedReason}
        isPending={runMotion.isPending}
        onRun={() => setEstimateOpen(true)}
      >
        <Selector
          label={pickCopy(lang, videoStudioCopy.motionVariantMode)}
          data-testid="video-studio-motion-variant-mode"
          options={[
            { value: "fill_empty", label: pickCopy(lang, videoStudioCopy.motionVariantModeFillEmpty) },
            { value: "replace", label: pickCopy(lang, videoStudioCopy.motionVariantModeReplace) },
          ]}
          value={mode}
          onChange={(value) => setMode(value as MotionVariantMode)}
        />
      </StageLaunchCard>

      {estimateOpen ? (
        <StageEstimateDialog
          lang={lang}
          open={estimateOpen}
          onOpenChange={setEstimateOpen}
          stage="motion"
          estimate={estimateQuery.data as StageEstimate | undefined}
          isLoading={estimateQuery.isLoading}
          error={estimateQuery.error?.message}
          destructive={destructive}
          isConfirming={runMotion.isPending}
          onConfirm={() =>
            runMotion.mutate({ projectId, baseRevision: projectRevision, mode, variantsPerScene: { min: 2, max: 3 } })
          }
        />
      ) : null}

      {document.scenes.map((scene, sceneIndex) => {
        const templateId = scene.visual.kind === "template" ? scene.visual.templateId : NO_TEMPLATE_VALUE;
        const meta = templates.find((t) => t.id === templateId);
        const isAutoDrafted = scene.visual.kind === "template" && !touchedSceneIds.has(scene.sceneId);
        const paramsText =
          paramsDraft[scene.sceneId] ??
          (scene.visual.kind === "template" ? JSON.stringify(scene.visual.params ?? {}, null, 2) : "{}");
        const trimmedNarration = scene.narration?.trim() ?? "";
        const narrationExcerpt =
          trimmedNarration.length > 0
            ? trimmedNarration.length > 40
              ? `${trimmedNarration.slice(0, 40)}…`
              : trimmedNarration
            : null;
        const paramsExample = MOTION_TEMPLATE_PARAMS_EXAMPLE[templateId];
        const candidates = scene.motionCandidates ?? [];
        const selectedCandidateId = scene.selectedMotionCandidateId ?? null;
        const isRejected = rejectedSceneIds.has(scene.sceneId);
        const isProcedural = meta?.kind === "procedural";
        const eventCount =
          scene.visual.kind === "template" && Array.isArray(scene.visual.params?.events)
            ? scene.visual.params.events.length
            : 0;
        // An omitted sync field is the compiler's narration-safe default:
        // caption cue boundaries. Keep this card consistent with the actual
        // render path and with the global selector above.
        const sceneSync = scene.motion.sync ?? "captions";

        return (
          <Card key={scene.sceneId} data-testid={`video-studio-motion-scene-${scene.sceneId}`}>
            <VStack gap={3}>
              <HStack justify="between" align="center">
                <Heading level={4}>
                  {pickCopy(lang, { th: `ฉากที่ ${sceneIndex + 1}`, en: `Scene ${sceneIndex + 1}` })}
                  {narrationExcerpt ? ` — ${narrationExcerpt}` : ""}
                </Heading>
                {isAutoDrafted ? (
                  <Badge variant="info" label={pickCopy(lang, videoStudioCopy.motionAutoDraftBadge)} />
                ) : null}
              </HStack>

              {/* AI variant picker */}
              <VStack gap={2}>
                <Heading level={5}>{pickCopy(lang, videoStudioCopy.motionVariantsHeading)}</Heading>

                {candidates.length === 0 ? (
                  <Text
                    type="supporting"
                    color="secondary"
                    data-testid={`motion-variants-empty-${scene.sceneId}`}
                  >
                    {isRejected
                      ? pickCopy(lang, videoStudioCopy.motionVariantsRejected)
                      : pickCopy(lang, videoStudioCopy.motionVariantsEmpty)}
                  </Text>
                ) : (
                  <>
                    {isRejected ? (
                      <Banner
                        status="warning"
                        data-testid={`motion-variants-rejected-${scene.sceneId}`}
                        title={pickCopy(lang, videoStudioCopy.motionVariantsRejected)}
                      />
                    ) : null}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {candidates.map((candidate) => {
                        const isSelected = candidate.candidateId === selectedCandidateId;
                        return (
                          <Card
                            key={candidate.candidateId}
                            variant={isSelected ? "green" : "default"}
                            padding={2}
                            data-testid="motion-candidate-option"
                            data-scene-id={scene.sceneId}
                            data-candidate-id={candidate.candidateId}
                          >
                            <VStack gap={1.5}>
                              <HStack justify="between" align="center">
                                <Text type="body" weight="bold">
                                  {motionTemplateLabel(lang, candidate.templateId)}
                                </Text>
                                {isSelected ? (
                                  <Badge
                                    variant="success"
                                    data-testid="motion-candidate-selected"
                                    label={pickCopy(lang, videoStudioCopy.motionVariantSelected)}
                                  />
                                ) : null}
                              </HStack>
                              <Text type="supporting" color="secondary">
                                {candidate.label}
                              </Text>
                              <HStack gap={1.5} wrap="wrap">
                                <Badge
                                  variant="neutral"
                                  label={`${pickCopy(lang, videoStudioCopy.motionVariantIntensity)}: ${motionIntensityLabel(lang, candidate.motion.intensity)}`}
                                />
                                <Badge
                                  variant="neutral"
                                  label={`${pickCopy(lang, videoStudioCopy.motionVariantCamera)}: ${candidate.motion.camera}`}
                                />
                              </HStack>
                              {candidate.rationale ? (
                                <Text type="supporting" color="secondary">
                                  {candidate.rationale}
                                </Text>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant={isSelected ? "secondary" : "primary"}
                                label={
                                  isSelected
                                    ? pickCopy(lang, videoStudioCopy.motionVariantSelected)
                                    : pickCopy(lang, videoStudioCopy.motionVariantApply)
                                }
                                isDisabled={isSelected || hasUnsavedChanges || isApplyingFor(scene.sceneId)}
                                isLoading={isApplyingFor(scene.sceneId)}
                                onClick={() => applyCandidate(scene.sceneId, candidate)}
                                className="self-start"
                              />
                            </VStack>
                          </Card>
                        );
                      })}
                    </div>
                  </>
                )}

                {hasUnsavedChanges ? (
                  <Text type="supporting" color="secondary">
                    {pickCopy(lang, videoStudioCopy.saveBeforeRunning)}
                  </Text>
                ) : null}

                {applyError[scene.sceneId] ? (
                  <Banner
                    status="error"
                    data-testid={`motion-candidate-apply-error-${scene.sceneId}`}
                    title={applyError[scene.sceneId]!}
                  />
                ) : null}
              </VStack>

              <Card
                variant="muted"
                padding={2}
                data-testid={`motion-graphics-scene-${scene.sceneId}`}
              >
                <VStack gap={1.5}>
                  <HStack justify="between" align="center" wrap="wrap">
                    <Heading level={5}>Motion graphics ของฉากนี้</Heading>
                    {isProcedural ? (
                      <Badge variant="success" label="กราฟิกเคลื่อนไหว" />
                    ) : scene.visual.kind === "template" ? (
                      <Badge variant="neutral" label="เทมเพลตเลเยอร์" />
                    ) : (
                      <Badge variant="warning" label="ยังไม่ได้เลือก" />
                    )}
                  </HStack>
                  <Text type="supporting" color="secondary">
                    {scene.visual.kind === "template"
                      ? `${motionTemplateLabel(lang, scene.visual.templateId)} · ${sceneSync === "captions" ? "เริ่มจังหวะตามบทพูด/ซับ" : "เคลื่อนไหวต่อเนื่องทั้งฉาก"}${isProcedural ? ` · ${eventCount} จุดกระตุ้น` : ""}`
                      : "เลือกตัวเลือก AI หรือเทมเพลตด้านล่างก่อน Motion graphics จึงจะแสดงใน Preview และ Render"}
                  </Text>
                  <HStack gap={1.5} align="center" wrap="wrap">
                    {sceneSync === "captions" ? (
                      <Badge variant="info" label="sync กับบทพูดแล้ว" />
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        label="ใช้จังหวะบทพูดกับฉากนี้"
                        onClick={() => setSceneMotionSync(scene.sceneId, "captions")}
                        data-testid={`motion-graphics-sync-scene-${scene.sceneId}`}
                      />
                    )}
                    {isProcedural ? (
                      <Text type="supporting" color="secondary">
                        Remotion จะใช้ events ในพารามิเตอร์เพื่อ pulse/reveal ตาม cue
                      </Text>
                    ) : null}
                  </HStack>
                </VStack>
              </Card>

              {/* Manual editor (advanced) */}
              <VStack gap={2}>
                <Heading level={5}>{pickCopy(lang, videoStudioCopy.motionManualEditorHeading)}</Heading>

                <Selector
                  label={pickCopy(lang, { th: "เทมเพลตโมชัน", en: "Motion template" })}
                  options={[
                    {
                      value: NO_TEMPLATE_VALUE,
                      label: pickCopy(lang, { th: "ไม่ใช้เทมเพลต (ว่าง)", en: "No template (blank)" }),
                    },
                    ...templates.map((template) => ({
                      value: template.id,
                      label: motionTemplateLabel(lang, template.id),
                    })),
                  ]}
                  value={templateId}
                  onChange={(value) =>
                    setSceneTemplate(scene.sceneId, value === NO_TEMPLATE_VALUE ? null : value)
                  }
                  data-testid={`video-studio-motion-select-${scene.sceneId}`}
                />

                {meta ? (
                  <HStack gap={1.5} wrap="wrap">
                    {meta.categories.map((category) => (
                      <Badge key={category} variant="neutral" label={category} />
                    ))}
                    <Badge variant="info" label={`${meta.minDurationMs}-${meta.maxDurationMs}ms`} />
                  </HStack>
                ) : null}

                {scene.visual.kind === "template" ? (
                  <VStack gap={1}>
                    <Text type="supporting" color="secondary">
                      {pickCopy(lang, MOTION_PARAMS_HELPER)}
                    </Text>
                    {paramsExample ? (
                      <Text
                        type="supporting"
                        color="secondary"
                        className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-[11px]"
                        data-testid={`video-studio-motion-params-example-${scene.sceneId}`}
                      >
                        {paramsExample}
                      </Text>
                    ) : null}
                    <TextArea
                      label={pickCopy(lang, { th: "พารามิเตอร์ (JSON)", en: "Params (JSON)" })}
                      rows={4}
                      value={paramsText}
                      onChange={(value) => setSceneParams(scene.sceneId, value)}
                      className="font-mono text-xs"
                      status={
                        paramsError[scene.sceneId]
                          ? { type: "error", message: paramsError[scene.sceneId]! }
                          : undefined
                      }
                    />
                  </VStack>
                ) : null}
              </VStack>
            </VStack>
          </Card>
        );
      })}
    </VStack>
  );
}
