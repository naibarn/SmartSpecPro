/**
 * VerticalDramaSettingsTab (spec feature 131, section-10/11 — Series detail
 * "Settings" tab).
 *
 * Minimal series-level configuration: title + status. Saves via the existing
 * `verticalDramaSeries.updateSeries` mutation (title/status fields only —
 * `bible`/`policy`/`productTieIn` are left untouched by omitting them from the
 * payload). Disabled entirely when the series is archived (`readOnly`).
 */

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Loader2, Save, Sparkles, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  createVerticalDramaDurationProfileOptions,
  formatVerticalDramaDurationPlan,
  resolveVerticalDramaDurationPlan,
} from "@shared/verticalDramaSeries/durationProfiles";
import {
  pickCopy,
  seriesStatusCopy,
  verticalDramaCopy,
  verticalDramaRoutes,
  type VerticalDramaSeriesStatus,
} from "@/components/verticalDramaSeries/verticalDramaCopy";
import { VerticalDramaDeleteSeriesDialog } from "@/components/verticalDramaSeries/VerticalDramaDeleteSeriesDialog";
import {
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH,
  normalizeTargetAudienceRegion,
  type VerticalDramaTargetAudienceRegion,
} from "@shared/verticalDramaSeries/targetAudienceRegion";
import {
  VERTICAL_DRAMA_DIALOGUE_LANGUAGE_NATIVE_NAMES,
  type VerticalDramaSeriesLlmModelPolicy,
  type VerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries/contracts";
import {
  readVerticalDramaDialogueLanguageProfile,
  VERTICAL_DRAMA_SPOKEN_LOCALE_GROUP_LABELS_EN,
  VERTICAL_DRAMA_SPOKEN_LOCALE_GROUP_LABELS_TH,
  VERTICAL_DRAMA_SPOKEN_LOCALE_OPTIONS,
  type VerticalDramaSpokenLocaleId,
} from "@shared/verticalDramaSeries/dialogueLanguageProfile";
import {
  DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY,
  readVerticalDramaWorkflowPolicy,
} from "@shared/verticalDramaMedia/workflow";
import { workerSeriesAccessPolicySchema } from "@shared/workerSeriesControlPlane";
// Text Overlay Suite (F131AB, task #34) — series watermark card. Pure/
// isomorphic module, safe as a normal static import (same posture as
// `targetAudienceRegion.ts` above).
import {
  parseSeriesWatermarkConfig,
  VD_WATERMARK_POSITIONS,
  type VdSeriesWatermarkConfig,
  type VdSeriesWatermarkSlot,
  type VdSeriesWatermarkSlotId,
  type VdWatermarkPosition,
} from "@shared/verticalDramaSeries/textOverlay";
import { vdTextOverlayCopy } from "@/components/verticalDramaSeries/verticalDramaTextOverlayCopy";
import {
  readSeriesLookLockControl,
  type VdLookLockGenre,
} from "@shared/verticalDramaSeries/seriesLookLock";
import {
  SeriesLookLockPicker,
  type SeriesLookLockPickerValue,
} from "./SeriesLookLockPicker";
import { VerticalDramaLogoGenerationDialog } from "./VerticalDramaLogoGenerationDialog";

const STATUS_OPTIONS: VerticalDramaSeriesStatus[] = [
  "draft",
  "planning",
  "story_ready",
  "active",
  "paused",
  "completed",
  "archived",
];

const WORKER_WORKFLOW_OPERATION_FIELDS = [
  { id: "broll_preprocess", th: "เตรียม B-roll", en: "B-roll preprocess" },
  { id: "shot_generation", th: "สร้าง Shot", en: "Shot generation" },
  { id: "image_to_video", th: "ภาพเป็นวิดีโอ", en: "Image to video" },
  { id: "reference_to_video", th: "Reference เป็นวิดีโอ", en: "Reference to video" },
] as const;

/**
 * Manual LLM model override (added 2026-07-11 — see
 * `/home/dev/.claude/plans/polished-toasting-gadget.md`) — sentinel `<Select>`
 * value standing in for "automatic" (`null`/unset in `llmModelPolicy`), since
 * Radix `Select.Item` doesn't accept an empty-string value.
 */
const AUTOMATIC_LLM_MODEL_VALUE = "__automatic__";

/**
 * `bible` jsonb fields captured at series-creation time that we surface
 * read-only in the "Series Origin" section below. Other (LLM-expanded)
 * bible fields are shown by the Bible tab, not here.
 */
interface SeriesOriginBible {
  logline?: string | null;
  mainPlot?: string | null;
  visualStyle?: string | null;
  cliffhangerStyle?: string | null;
}

export interface VerticalDramaSettingsTabProps {
  lang: "th" | "en";
  seriesId: string;
  title: string;
  status: string;
  readOnly: boolean;
  onSaved?: () => void;
  /** Creation-time fields — read-only "Series Origin" traceability section. */
  genre?: string | null;
  tone?: string | null;
  targetAudience?: string | null;
  targetEpisodeCount?: number | null;
  /** Legacy DB timing is used only to label old records; never rendered as a selectable input. */
  legacyDurationSeconds?: number | null;
  locale?: string | null;
  bible?: unknown;
  /** Manual LLM model override (added 2026-07-11 — see
   *  `/home/dev/.claude/plans/polished-toasting-gadget.md`) — raw
   *  `series.llmModelPolicy` jsonb value. Parsed defensively below (never
   *  trust a jsonb column's runtime shape client-side, same convention as
   *  `watermark`/`bible` in this same file). Absent/`null` field = automatic. */
  llmModelPolicy?: unknown;
  /** Series-level Worker/ComfyUI workflow policy, stored under policy JSONB. */
  policy?: unknown;
  /** Text Overlay Suite (F131AB, task #34) — gates the watermark card
   *  entirely (fail-closed, default `false`, same convention as every other
   *  Vertical Drama flag threaded into this component's siblings). */
  textOverlaySuiteEnabled?: boolean;
  lookLockEnabled?: boolean;
  /** Raw `series.watermark` jsonb value — parsed defensively via
   *  `parseSeriesWatermarkConfig` inside this component (never trust a
   *  jsonb column's runtime shape client-side either). */
  watermark?: unknown;
}

/**
 * Labels for the 3x3 watermark anchor grid (widened from four corners on
 * 2026-07-30). Kept as a data map rather than a nested ternary so adding an
 * anchor cannot silently fall through to the wrong label.
 */
const VD_WATERMARK_POSITION_LABELS: Record<
  (typeof VD_WATERMARK_POSITIONS)[number],
  { th: string; en: string }
> = {
  top_left: { th: "บน–ซ้าย", en: "Top left" },
  top_center: { th: "บน–กลาง", en: "Top centre" },
  top_right: { th: "บน–ขวา", en: "Top right" },
  middle_left: { th: "กลางจอ–ซ้าย", en: "Middle left" },
  middle_center: { th: "กลางจอ–กลาง", en: "Middle centre" },
  middle_right: { th: "กลางจอ–ขวา", en: "Middle right" },
  bottom_left: { th: "ล่าง–ซ้าย", en: "Bottom left" },
  bottom_center: { th: "ล่าง–กลาง", en: "Bottom centre" },
  bottom_right: { th: "ล่าง–ขวา", en: "Bottom right" },
};

/**
 * Dual watermark (planning/vd-dual-watermark/plan.md) — UI-only fallback
 * values for a slot that has never been configured. Slot 1 (series/title
 * logo) defaults to `top_right`; slot 2 (channel logo) seeds `bottom_right`
 * so a fresh pair does not stack in the same corner. These are display
 * defaults ONLY — a slot is never written into the saved payload until the
 * user actually touches one of its controls (see `patchSecondary` below).
 */
const DEFAULT_PRIMARY_WATERMARK_SLOT: VdSeriesWatermarkSlot = {
  enabled: false,
  type: "text",
  text: "",
  position: "top_right",
  opacity: 0.45,
  scalePct: 10,
  marginPx: 32,
};
const DEFAULT_SECONDARY_WATERMARK_SLOT: VdSeriesWatermarkSlot = {
  ...DEFAULT_PRIMARY_WATERMARK_SLOT,
  position: "bottom_right",
};

export function VerticalDramaSettingsTab({
  lang,
  seriesId,
  title,
  status,
  readOnly,
  onSaved,
  genre,
  tone,
  targetAudience,
  targetEpisodeCount,
  legacyDurationSeconds,
  locale,
  bible,
  llmModelPolicy,
  policy,
  textOverlaySuiteEnabled = false,
  lookLockEnabled = false,
  watermark,
}: VerticalDramaSettingsTabProps) {
  const [, setLocation] = useLocation();
  const [titleInput, setTitleInput] = useState(title);
  const [statusInput, setStatusInput] = useState<VerticalDramaSeriesStatus>(
    (status as VerticalDramaSeriesStatus) ?? "draft"
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const durationPlan = useMemo(
    () =>
      resolveVerticalDramaDurationPlan(bible, legacyDurationSeconds),
    [bible, legacyDurationSeconds]
  );
  const [shotDurationInput, setShotDurationInput] = useState(
    String(durationPlan?.shotDurationSeconds ?? 8)
  );
  const [durationTouched, setDurationTouched] = useState(false);
  useEffect(() => {
    setShotDurationInput(String(durationPlan?.shotDurationSeconds ?? 8));
    setDurationTouched(false);
  }, [durationPlan]);

  const bibleRegion = normalizeTargetAudienceRegion(
    (bible as { targetAudienceRegion?: unknown } | null | undefined)
      ?.targetAudienceRegion
  );
  const [regionInput, setRegionInput] =
    useState<VerticalDramaTargetAudienceRegion>(bibleRegion);

  // Manual LLM model override (added 2026-07-11, collapsed to a single
  // series-wide field 2026-07-11 — see
  // `planning/vertical-drama-centralized-model-policy/plan.md`) — parsed
  // defensively from the raw jsonb prop; `typeof === "string"` doubles as
  // the "absent/null = automatic" normalization (undefined, null, or any
  // non-string all fall through to `null`).
  const llmPolicyObj = (llmModelPolicy ??
    null) as VerticalDramaSeriesLlmModelPolicy | null;
  const defaultModelIdFromProps =
    typeof llmPolicyObj?.defaultModelId === "string"
      ? llmPolicyObj.defaultModelId
      : null;
  const [defaultModelInput, setDefaultModelInput] = useState<string | null>(
    defaultModelIdFromProps
  );
  const workflowPolicyFromProps = useMemo(
    () => readVerticalDramaWorkflowPolicy(policy),
    [policy]
  );
  const workerAccessPolicyFromProps = useMemo(() => {
    const raw = policy && typeof policy === "object" && !Array.isArray(policy)
      ? (policy as Record<string, unknown>).workerAccess
      : null;
    const parsed = workerSeriesAccessPolicySchema.safeParse(raw);
    return parsed.success
      ? parsed.data
      : { mode: "private" as const, userIds: [], groupIds: [], revision: "worker-access-v1" };
  }, [policy]);
  const [workerDefaultWorkflowInput, setWorkerDefaultWorkflowInput] = useState(
    workflowPolicyFromProps.defaultWorkflowId
  );
  const [workerAllowedWorkflowsInput, setWorkerAllowedWorkflowsInput] = useState(
    workflowPolicyFromProps.allowedWorkflowIds.join(", ")
  );
  const [workerAllowOverrideInput, setWorkerAllowOverrideInput] = useState(
    workflowPolicyFromProps.allowUserOverride
  );
  const [workerOperationDefaultsInput, setWorkerOperationDefaultsInput] = useState<Record<string, string>>(
    Object.fromEntries(WORKER_WORKFLOW_OPERATION_FIELDS.map(({ id }) => [
      id,
      workflowPolicyFromProps.workflowDefaults[id] ?? workflowPolicyFromProps.defaultWorkflowId,
    ]))
  );
  const [workerAccessModeInput, setWorkerAccessModeInput] = useState(workerAccessPolicyFromProps.mode);
  const [workerAccessUserIdsInput, setWorkerAccessUserIdsInput] = useState(workerAccessPolicyFromProps.userIds.join(", "));
  const [workerAccessGroupIdsInput, setWorkerAccessGroupIdsInput] = useState(workerAccessPolicyFromProps.groupIds.join(", "));
  const bibleRecord = bible && typeof bible === "object"
    ? bible as Record<string, unknown>
    : {};
  const dialogueLanguageProfile = readVerticalDramaDialogueLanguageProfile(
    bibleRecord.dialogueLanguageProfile
  );
  const [dialogueSpokenInput, setDialogueSpokenInput] =
    useState<VerticalDramaSpokenLocaleId>(
      dialogueLanguageProfile.spokenLocale ?? "auto"
    );
  const lookControl = readSeriesLookLockControl(bibleRecord.lookLockControl);
  const visualNarrativeEnabledFromBible =
    typeof bibleRecord.visualNarrativeProfile === "object" &&
    bibleRecord.visualNarrativeProfile !== null;
  const lookValueFromProps: SeriesLookLockPickerValue = lookControl
    ? {
        mode: lookControl.mode,
        genreKey: lookControl.genreKey,
        visualNarrativeEnabled:
          lookControl.visualNarrativeEnabled ?? visualNarrativeEnabledFromBible,
      }
    : bibleRecord.presetVisualIdentity
      ? { mode: "inherit_source", visualNarrativeEnabled: visualNarrativeEnabledFromBible }
      : { mode: "none", visualNarrativeEnabled: false };
  const [lookInput, setLookInput] = useState<SeriesLookLockPickerValue>(lookValueFromProps);

  // Keep local form state in sync when the parent series data changes
  // (e.g. after a refetch triggered elsewhere).
  useEffect(() => {
    setTitleInput(title);
  }, [title]);
  useEffect(() => {
    setStatusInput((status as VerticalDramaSeriesStatus) ?? "draft");
  }, [status]);
  useEffect(() => {
    setRegionInput(bibleRegion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bibleRegion]);
  useEffect(() => {
    setDefaultModelInput(defaultModelIdFromProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultModelIdFromProps]);
  useEffect(() => {
    setWorkerDefaultWorkflowInput(workflowPolicyFromProps.defaultWorkflowId);
    setWorkerAllowedWorkflowsInput(workflowPolicyFromProps.allowedWorkflowIds.join(", "));
    setWorkerAllowOverrideInput(workflowPolicyFromProps.allowUserOverride);
    setWorkerOperationDefaultsInput(Object.fromEntries(WORKER_WORKFLOW_OPERATION_FIELDS.map(({ id }) => [
      id,
      workflowPolicyFromProps.workflowDefaults[id] ?? workflowPolicyFromProps.defaultWorkflowId,
    ])));
  }, [workflowPolicyFromProps]);
  useEffect(() => {
    setWorkerAccessModeInput(workerAccessPolicyFromProps.mode);
    setWorkerAccessUserIdsInput(workerAccessPolicyFromProps.userIds.join(", "));
    setWorkerAccessGroupIdsInput(workerAccessPolicyFromProps.groupIds.join(", "));
  }, [workerAccessPolicyFromProps]);
  useEffect(() => {
    setDialogueSpokenInput(dialogueLanguageProfile.spokenLocale ?? "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bibleRecord.dialogueLanguageProfile]);
  useEffect(() => {
    setLookInput(lookValueFromProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lookControl?.mode,
    lookControl?.genreKey,
    lookControl?.visualNarrativeEnabled,
    lookControl?.revision,
    bibleRecord.presetVisualIdentity,
    bibleRecord.visualNarrativeProfile,
  ]);

  // Text Overlay Suite (F131AB, task #34) — series watermark local draft,
  // seeded from the parsed persisted config (never trust the raw jsonb
  // shape — `parseSeriesWatermarkConfig` never throws, same convention as
  // every other Vertical Drama jsonb reader).
  const parsedWatermark = useMemo(
    () => parseSeriesWatermarkConfig(watermark) ?? DEFAULT_PRIMARY_WATERMARK_SLOT,
    [watermark]
  );
  const [watermarkDraft, setWatermarkDraft] =
    useState<VdSeriesWatermarkConfig>(parsedWatermark);
  useEffect(() => {
    setWatermarkDraft(parsedWatermark);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedWatermark]);

  const utils = trpc.useUtils();
  const updateMutation = trpc.verticalDramaSeries.updateSeries.useMutation();
  const regionMutation =
    trpc.verticalDramaSeries.setSeriesTargetAudienceRegion.useMutation();
  // Manual LLM model override (added 2026-07-11, collapsed to a single
  // series-wide dropdown 2026-07-11) — eligible model list for the dropdown
  // below, and the dedicated mutation that persists it onto
  // `llmModelPolicy`. `includeModelId` grandfathers this series' already-
  // persisted pin into the list even if it's since fallen out of the
  // admin-curated recommended set (2026-07-31 quality-picker narrowing —
  // see `listQualityPlanningModels`'s own doc comment), so this controlled
  // `<Select value={defaultModelInput}>` always has a matching option.
  const planningModelsQuery =
    trpc.verticalDramaSeries.listQualityPlanningModels.useQuery({
      includeModelId: defaultModelIdFromProps,
    });
  const planningModels = planningModelsQuery.data ?? [];
  const llmModelPolicyMutation =
    trpc.verticalDramaSeries.setSeriesLlmModelPolicy.useMutation();
  // Optional chaining keeps older test doubles/older clients renderable while
  // the server router is rolled forward. The production tRPC client always
  // exposes this mutation.
  const workerWorkflowPolicyMutation =
    trpc.verticalDramaSeries.setSeriesWorkerMediaWorkflowPolicy?.useMutation?.();
  const workerAccessPolicyMutation =
    trpc.verticalDramaSeries.setSeriesWorkerAccessPolicy?.useMutation?.();
  const durationProfileMutation =
    trpc.verticalDramaSeries.setSeriesDurationProfile.useMutation();
  const dialogueLanguageProfileMutation =
    trpc.verticalDramaSeries.setSeriesDialogueLanguageProfile.useMutation();
  const lookLockMutation = trpc.verticalDramaSeries.setSeriesLookLock.useMutation();
  const updateWatermarkMutation =
    trpc.verticalDramaSeries.updateSeriesWatermark.useMutation({
      onSuccess: () => {
        toast.success(lang === "th" ? "บันทึกลายน้ำแล้ว" : "Watermark saved");
        void utils.verticalDramaSeries.get.invalidate();
        onSaved?.();
      },
      onError: err => {
        toast.error(
          err.message ||
            (lang === "th"
              ? "บันทึกลายน้ำไม่สำเร็จ"
              : "Failed to save watermark")
        );
      },
    });

  const dirty = titleInput !== title || statusInput !== status;
  const regionDirty = regionInput !== bibleRegion;
  const llmModelPolicyDirty = defaultModelInput !== defaultModelIdFromProps;
  const workerWorkflowPolicyDirty =
    workerDefaultWorkflowInput !== workflowPolicyFromProps.defaultWorkflowId ||
    workerAllowedWorkflowsInput !== workflowPolicyFromProps.allowedWorkflowIds.join(", ") ||
    workerAllowOverrideInput !== workflowPolicyFromProps.allowUserOverride ||
    WORKER_WORKFLOW_OPERATION_FIELDS.some(({ id }) => workerOperationDefaultsInput[id] !== (workflowPolicyFromProps.workflowDefaults[id] ?? workflowPolicyFromProps.defaultWorkflowId));
  const workerAccessPolicyDirty =
    workerAccessModeInput !== workerAccessPolicyFromProps.mode ||
    workerAccessUserIdsInput !== workerAccessPolicyFromProps.userIds.join(", ") ||
    workerAccessGroupIdsInput !== workerAccessPolicyFromProps.groupIds.join(", ");
  const durationDirty =
    durationTouched && Number.isFinite(Number(shotDurationInput));
  const dialogueLanguageProfileDirty =
    dialogueSpokenInput !== (dialogueLanguageProfile.spokenLocale ?? "auto");
  const lookLockDirty = lookInput.mode !== lookValueFromProps.mode
    || lookInput.genreKey !== lookValueFromProps.genreKey
    || lookInput.visualNarrativeEnabled !== lookValueFromProps.visualNarrativeEnabled;
  const isSaving =
    updateMutation.isPending ||
    regionMutation.isPending ||
    llmModelPolicyMutation.isPending ||
    Boolean(workerWorkflowPolicyMutation?.isPending) ||
    Boolean(workerAccessPolicyMutation?.isPending) ||
    durationProfileMutation.isPending ||
    dialogueLanguageProfileMutation.isPending ||
    lookLockMutation.isPending;

  const handleSave = async () => {
    try {
      const mutations: Array<Promise<unknown>> = [
        updateMutation.mutateAsync({
          seriesId,
          title: titleInput.trim() || undefined,
          status: statusInput,
        }),
      ];
      // Region and duration both use read-modify-write updates on the same
      // bible JSONB field. Chain them instead of sending both snapshots at
      // once, otherwise saving both controls together can make one setting
      // erase the other depending on database completion order.
      let bibleMutation: Promise<unknown> | null = null;
      if (regionDirty) {
        bibleMutation = regionMutation.mutateAsync({
          seriesId,
          targetAudienceRegion: regionInput,
        });
      }
      if (durationDirty) {
        const saveDuration = () =>
          durationProfileMutation.mutateAsync({
            seriesId,
            shotDurationSeconds: Number(shotDurationInput),
          });
        bibleMutation = bibleMutation
          ? bibleMutation.then(saveDuration)
          : saveDuration();
      }
      if (dialogueLanguageProfileDirty) {
        const saveDialogueLanguageProfile = () =>
          dialogueLanguageProfileMutation.mutateAsync({
            seriesId,
            spokenLocale: dialogueSpokenInput,
          });
        bibleMutation = bibleMutation
          ? bibleMutation.then(saveDialogueLanguageProfile)
          : saveDialogueLanguageProfile();
      }
      if (bibleMutation) {
        mutations.push(bibleMutation);
      }
      if (llmModelPolicyDirty) {
        // Single required-but-nullable field now (no more partial merge of
        // two independently-dirty fields) — the mutation overwrites
        // `llmModelPolicy` wholesale.
        mutations.push(
          llmModelPolicyMutation.mutateAsync({
            seriesId,
            defaultModelId: defaultModelInput,
          })
        );
      }
      if (workerWorkflowPolicyDirty && workerWorkflowPolicyMutation) {
        const allowedWorkflowIds = Array.from(new Set(
          workerAllowedWorkflowsInput.split(",").map(value => value.trim()).filter(Boolean)
        )).slice(0, 32);
        const defaultWorkflowId = workerDefaultWorkflowInput.trim();
        if (!defaultWorkflowId || !allowedWorkflowIds.includes(defaultWorkflowId)) {
          throw new Error(lang === "th"
            ? "Default workflow ต้องอยู่ในรายการ workflow ที่อนุญาต"
            : "The default workflow must be included in the allowed workflow list");
        }
        const workflowDefaults = Object.fromEntries(WORKER_WORKFLOW_OPERATION_FIELDS.map(({ id }) => {
          const workflowId = (workerOperationDefaultsInput[id] ?? "").trim();
          if (!workflowId || !allowedWorkflowIds.includes(workflowId)) {
            throw new Error(lang === "th"
              ? `Workflow ของ ${id} ต้องอยู่ในรายการ workflow ที่อนุญาต`
              : `The workflow for ${id} must be included in the allowed workflow list`);
          }
          return [id, workflowId];
        }));
        mutations.push(workerWorkflowPolicyMutation.mutateAsync({
          seriesId,
          policy: {
            ...workflowPolicyFromProps,
            defaultWorkflowId,
            allowedWorkflowIds,
            allowUserOverride: workerAllowOverrideInput,
            workflowDefaults,
          },
          expectedRevision: workflowPolicyFromProps.policyRevision,
        }));
      }
      if (workerAccessPolicyDirty && workerAccessPolicyMutation) {
        const userIds = workerAccessUserIdsInput.split(",").map(value => Number(value.trim())).filter(value => Number.isSafeInteger(value) && value > 0).slice(0, 100);
        const groupIds = workerAccessGroupIdsInput.split(",").map(value => value.trim()).filter(Boolean).slice(0, 100);
        mutations.push(workerAccessPolicyMutation.mutateAsync({
          seriesId,
          mode: workerAccessModeInput,
          userIds,
          groupIds,
          expectedRevision: workerAccessPolicyFromProps.revision,
        }));
      }
      if (lookLockEnabled && lookLockDirty) {
        const hasPersistedVisualNarrativePreference =
          lookControl?.visualNarrativeEnabled !== undefined ||
          visualNarrativeEnabledFromBible ||
          lookInput.visualNarrativeEnabled === true;
        mutations.push(
          lookLockMutation.mutateAsync({
            seriesId,
            mode: lookInput.mode,
            genreKey: lookInput.mode === "genre"
              ? lookInput.genreKey as VdLookLockGenre
              : undefined,
            ...(hasPersistedVisualNarrativePreference
              ? { visualNarrativeEnabled: lookInput.visualNarrativeEnabled }
              : {}),
            expectedRevision: lookControl?.revision ?? 0,
          })
        );
      }
      await Promise.all(mutations);
      toast.success(lang === "th" ? "บันทึกการตั้งค่าแล้ว" : "Settings saved");
      void utils.verticalDramaSeries.get.invalidate();
      // A title change must also refresh the series LIST cache — the create
      // wizard's "source series" (sequel/special-edition) dropdown reads its
      // option labels from `verticalDramaSeries.list`, so without this it
      // keeps showing the pre-rename title until that cache expires.
      void utils.verticalDramaSeries.list.invalidate();
      onSaved?.();
    } catch (err) {
      const code = (err as { data?: { code?: string } } | null)?.data?.code;
      if (code === "CONFLICT") {
        toast.error(
          lang === "th"
            ? "ลุคซีรีส์ถูกแก้จากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่"
            : "The series look changed elsewhere. Reload the latest data and try again."
        );
        void utils.verticalDramaSeries.get.invalidate();
        onSaved?.();
        return;
      }
      const message = err instanceof Error ? err.message : undefined;
      toast.error(
        message ||
          (lang === "th" ? "บันทึกไม่สำเร็จ" : "Failed to save settings")
      );
    }
  };

  const b = (bible ?? {}) as SeriesOriginBible;
  const notSet = lang === "th" ? "ไม่ได้ระบุ" : "Not set";
  const originFields: Array<{
    label: { th: string; en: string };
    value: string | number | null | undefined;
  }> = [
    { label: { th: "แนวเรื่อง", en: "Genre" }, value: genre },
    { label: { th: "โทนเรื่อง", en: "Tone" }, value: tone },
    {
      label: { th: "กลุ่มเป้าหมาย", en: "Target audience" },
      value: targetAudience,
    },
    {
      label: { th: "จำนวนตอนย่อยที่วางแผน", en: "Planned Sub-episode count" },
      value: targetEpisodeCount,
    },
    {
      label: { th: "ภาษา", en: "Locale" },
      value: locale
        ? (VERTICAL_DRAMA_DIALOGUE_LANGUAGE_NATIVE_NAMES[
            locale as VerticalDramaSeriesLocale
          ] ?? locale)
        : locale,
    },
    { label: { th: "โลจไลน์", en: "Logline" }, value: b.logline },
    { label: { th: "โครงเรื่องหลัก", en: "Main plot" }, value: b.mainPlot },
    { label: { th: "สไตล์ภาพ", en: "Visual style" }, value: b.visualStyle },
    {
      label: { th: "สไตล์ปมค้างตอนจบ", en: "Cliffhanger style" },
      value: b.cliffhangerStyle,
    },
  ];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {lang === "th" ? "ที่มาของซีรีย์" : "Series origin"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-2xl gap-3 sm:grid-cols-2">
          {originFields.map(field => (
            <div key={field.label.en} className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {pickCopy(lang, field.label)}
              </span>
              <span className="text-sm">
                {field.value === null ||
                field.value === undefined ||
                field.value === ""
                  ? notSet
                  : String(field.value)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card data-testid="vd-settings-duration-profile">
        <CardHeader>
          <CardTitle className="text-base">
            {lang === "th" ? "ความยาวจาก 9 ช็อต" : "Nine-shot duration"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-md gap-3">
          <Badge variant={durationPlan ? "secondary" : "outline"} className="w-fit">
            {formatVerticalDramaDurationPlan(durationPlan, lang)}
          </Badge>
          {durationDirty && (
            <Badge variant="outline" className="w-fit" data-testid="vd-settings-duration-pending">
              {lang === "th" ? "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" : "Unsaved duration change"}
            </Badge>
          )}
          {durationPlan?.status === "legacy_compat" && (
            <p className="text-xs text-muted-foreground">
              {lang === "th"
                ? "ซีรีย์เก่าจะคงความหมายเดิมไว้ การเลือกด้านล่างใช้กับการวางตอนใหม่เท่านั้น"
                : "Existing episodes keep their original meaning. The selection below applies only to newly planned episodes."}
            </p>
          )}
          <Label
            htmlFor="vd-settings-shot-duration"
            className="text-xs font-medium text-muted-foreground"
          >
            {lang === "th" ? "วินาทีต่อช็อต" : "Seconds per shot"}
          </Label>
          <Select
            value={shotDurationInput}
            onValueChange={value => {
              setShotDurationInput(value);
              setDurationTouched(true);
            }}
            disabled={readOnly || isSaving}
          >
            <SelectTrigger
              id="vd-settings-shot-duration"
              aria-describedby="vd-settings-shot-duration-help"
              data-testid="vd-settings-shot-duration"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {createVerticalDramaDurationProfileOptions().map(option => (
                <SelectItem
                  key={option.profileId}
                  value={String(option.shotDurationSeconds)}
                >
                  {lang === "th" ? option.labelTh : option.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="vd-settings-shot-duration-help" className="text-xs text-muted-foreground">
            {lang === "th"
              ? "ระบบจะวาง 9 ช็อตต่อหนึ่งตอน และคำนวณ runtime จาก duration ที่เลือก ไม่ใช้ค่าความยาวต่อตอนแบบเดิม"
              : "Each episode is planned as nine shots; runtime is derived from the selected shot duration, not a fixed episode duration."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {lang === "th" ? "ตั้งค่าซีรีย์" : "Series settings"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-md gap-4">
          {readOnly && (
            <Badge variant="outline" className="w-fit">
              {pickCopy(lang, verticalDramaCopy.readOnly)}
            </Badge>
          )}

          <div className="grid gap-1.5">
            <Label
              htmlFor="series-settings-title"
              className="text-xs font-medium text-muted-foreground"
            >
              {lang === "th" ? "ชื่อซีรีย์" : "Series title"}
            </Label>
            <Input
              id="series-settings-title"
              value={titleInput}
              onChange={e => setTitleInput(e.target.value)}
              disabled={readOnly || isSaving}
            />
          </div>

          <Card className="border-primary/30 bg-primary/5" data-testid="vd-settings-worker-workflow-policy">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {lang === "th" ? "ค่าเริ่มต้น Worker / ComfyUI MCP" : "Worker / ComfyUI MCP defaults"}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {lang === "th"
                  ? "กำหนด workflow ที่ server จะเลือกก่อน ผู้ใช้ยังเปลี่ยนได้ในรายละเอียด Shot ถ้าเปิด override และ workflow ผ่าน capability probe"
                  : "Set the server default first. Users can override it in the Shot details drawer when allowed and compatible with the live capability probe."}
              </p>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="vd-settings-worker-default-workflow">Default workflow</Label>
                <Input
                  id="vd-settings-worker-default-workflow"
                  value={workerDefaultWorkflowInput}
                  onChange={event => setWorkerDefaultWorkflowInput(event.target.value)}
                  disabled={readOnly || isSaving}
                  placeholder={DEFAULT_VERTICAL_DRAMA_WORKFLOW_POLICY.defaultWorkflowId}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vd-settings-worker-allowed-workflows">Allowed workflows (comma-separated)</Label>
                <Input
                  id="vd-settings-worker-allowed-workflows"
                  value={workerAllowedWorkflowsInput}
                  onChange={event => setWorkerAllowedWorkflowsInput(event.target.value)}
                  disabled={readOnly || isSaving}
                />
              </div>
              <div className="grid gap-3 rounded-md border p-3">
                <div>
                  <Label>{lang === "th" ? "ค่าเริ่มต้นแยกตามฟังก์ชัน" : "Per-operation defaults"}</Label>
                  <p className="text-xs text-muted-foreground">
                    {lang === "th" ? "เลือก workflow เริ่มต้นให้แต่ละงาน โดยต้องอยู่ใน allowlist ด้านบน" : "Choose a default workflow for each operation; every value must be in the allowlist above."}
                  </p>
                </div>
                {WORKER_WORKFLOW_OPERATION_FIELDS.map(({ id, th, en }) => (
                  <div className="grid gap-1.5" key={id}>
                    <Label htmlFor={`vd-settings-worker-operation-${id}`}>{lang === "th" ? th : en}</Label>
                    <Input
                      id={`vd-settings-worker-operation-${id}`}
                      value={workerOperationDefaultsInput[id] ?? ""}
                      onChange={event => setWorkerOperationDefaultsInput(current => ({ ...current, [id]: event.target.value }))}
                      disabled={readOnly || isSaving}
                    />
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={workerAllowOverrideInput} onCheckedChange={setWorkerAllowOverrideInput} disabled={readOnly || isSaving} />
                {lang === "th" ? "อนุญาตให้ผู้ใช้เลือก workflow ใน Shot ได้" : "Allow user workflow override in Shot"}
              </label>
              <p className="text-xs text-muted-foreground">
                {lang === "th" ? "การบันทึกจะเพิ่ม policy revision ใหม่และไม่แก้ค่า setting อื่นของ Series" : "Saving creates a new policy revision and preserves unrelated Series settings."}
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-primary/5" data-testid="vd-settings-worker-access-policy">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{lang === "th" ? "สิทธิ์ Worker ของ Series" : "Series Worker access"}</CardTitle>
              <p className="text-xs text-muted-foreground">{lang === "th" ? "กำหนดว่า Worker ของเจ้าของ กลุ่ม หรือ tenant นี้จะเห็นและประมวลผล Series ได้หรือไม่" : "Choose which Worker principals may discover and operate this Series."}</p>
            </CardHeader>
            <CardContent className="grid max-w-2xl gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="vd-settings-worker-access-mode">Access mode</Label>
                <Select value={workerAccessModeInput} onValueChange={value => setWorkerAccessModeInput(value as "private" | "group" | "tenant")} disabled={readOnly || isSaving}>
                  <SelectTrigger id="vd-settings-worker-access-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private / explicit users</SelectItem>
                    <SelectItem value="group">Worker group</SelectItem>
                    <SelectItem value="tenant">Tenant workers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vd-settings-worker-access-users">User IDs (comma-separated)</Label>
                <Input id="vd-settings-worker-access-users" value={workerAccessUserIdsInput} onChange={event => setWorkerAccessUserIdsInput(event.target.value)} disabled={readOnly || isSaving} placeholder="เช่น 12, 34" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vd-settings-worker-access-groups">Group IDs (comma-separated)</Label>
                <Input id="vd-settings-worker-access-groups" value={workerAccessGroupIdsInput} onChange={event => setWorkerAccessGroupIdsInput(event.target.value)} disabled={readOnly || isSaving} placeholder="เช่น team-editors" />
              </div>
              <p className="text-xs text-muted-foreground">{lang === "th" ? "ระบบจะตรวจสิทธิ์และ revision อีกครั้งตอน bind/process/publish ทุกครั้ง" : "Access and revision are rechecked at bind/process/publish time."}</p>
            </CardContent>
          </Card>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th" ? "สถานะ" : "Status"}
            </Label>
            <Select
              value={statusInput}
              onValueChange={v =>
                setStatusInput(v as VerticalDramaSeriesStatus)
              }
              disabled={readOnly || isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt} value={opt}>
                    {pickCopy(lang, seriesStatusCopy[opt])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th"
                ? "กลุ่มผู้ชมเป้าหมาย (ภูมิภาค)"
                : "Target audience (region)"}
            </Label>
            <Select
              value={regionInput}
              onValueChange={v =>
                setRegionInput(v as VerticalDramaTargetAudienceRegion)
              }
              disabled={readOnly || isSaving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS.map(opt => (
                  <SelectItem key={opt} value={opt}>
                    {lang === "th"
                      ? VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH[opt]
                      : VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_EN[opt]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {lang === "th"
                ? "ใช้เป็นค่าเริ่มต้นสำหรับรูปลักษณ์/เชื้อชาติของภาพตัวละครทุกภาพ — คำอธิบายตัวละครที่ระบุเชื้อชาติ/สัญชาติไว้แล้วจะมีผลเหนือกว่าค่านี้เสมอ"
                : "Used as the default look/ethnicity for every character image — a character's own description (when it states an ethnicity/nationality) always takes precedence over this default."}
            </p>
          </div>

          <div
            className="grid gap-1.5 rounded-lg border bg-muted/20 p-3"
            data-testid="vd-settings-dialogue-language-profile"
          >
            <Label
              htmlFor="vd-settings-dialogue-language-profile-select"
              className="text-xs font-medium text-muted-foreground"
            >
              {lang === "th"
                ? "ภาษาพูดของตัวละคร (ไม่บังคับ)"
                : "Character spoken language (optional)"}
            </Label>
            <Select
              value={dialogueSpokenInput}
              onValueChange={value =>
                setDialogueSpokenInput(value as VerticalDramaSpokenLocaleId)
              }
              disabled={readOnly || isSaving}
            >
              <SelectTrigger id="vd-settings-dialogue-language-profile-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[min(70vh,32rem)]">
                {Array.from(
                  new Set(
                    VERTICAL_DRAMA_SPOKEN_LOCALE_OPTIONS.map(
                      option => option.group,
                    ),
                  ),
                ).map(group => (
                  <SelectGroup key={group}>
                    <SelectLabel>
                      {(lang === "th"
                        ? VERTICAL_DRAMA_SPOKEN_LOCALE_GROUP_LABELS_TH
                        : VERTICAL_DRAMA_SPOKEN_LOCALE_GROUP_LABELS_EN)[group] ??
                        group}
                    </SelectLabel>
                    {VERTICAL_DRAMA_SPOKEN_LOCALE_OPTIONS.filter(
                      option => option.group === group,
                    ).map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {lang === "th" ? option.labelTh : option.labelEn}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {lang === "th"
                ? "ใช้เฉพาะบทพูด subtitle และเสียงพากย์ — Auto วิเคราะห์จาก setting ตลาด และตัวละคร ไม่สุ่ม และไม่เปลี่ยนภาษาเนื้อเรื่อง"
                : "Applies only to dialogue, subtitles, and voice — Auto infers from setting, market, and characters without changing the narrative language."}
            </p>
            <p className="text-xs text-muted-foreground">
              {VERTICAL_DRAMA_SPOKEN_LOCALE_OPTIONS.find(
                option => option.id === dialogueSpokenInput,
              )?.prompt}
            </p>
            {dialogueLanguageProfileDirty && (
              <Badge variant="outline" className="w-fit">
                {lang === "th"
                  ? "มีการเปลี่ยนแปลงที่ยังไม่บันทึก"
                  : "Unsaved dialogue profile change"}
              </Badge>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {lang === "th"
                ? "โมเดล LLM สำหรับสร้างเนื้อหาละคร (แต่งบท/ตัวละคร/storyboard)"
                : "LLM model for drama content generation (script/characters/storyboard)"}
            </Label>
            <Select
              value={defaultModelInput ?? AUTOMATIC_LLM_MODEL_VALUE}
              onValueChange={v =>
                setDefaultModelInput(v === AUTOMATIC_LLM_MODEL_VALUE ? null : v)
              }
              disabled={readOnly || isSaving}
            >
              <SelectTrigger data-testid="vd-settings-default-llm-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTOMATIC_LLM_MODEL_VALUE}>
                  {lang === "th"
                    ? "อัตโนมัติ (เลือกโมเดลที่ดีที่สุดให้อัตโนมัติ)"
                    : "Automatic (best model auto-selected)"}
                </SelectItem>
                {planningModels.map(model => (
                  <SelectItem key={model.modelId} value={model.modelId}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {lang === "th"
                ? "มีผลกับทุกขั้นตอนของซีรีย์นี้ที่ใช้ LLM — แต่งบท, วิเคราะห์/สร้างตัวละคร, storyboard และอื่นๆ ตั้งครั้งเดียวใช้ได้ทั้งหมด"
                : "Applies to every LLM-driven step of this series — script writing, character analysis/generation, storyboard, and more. Set it once, it covers everything."}
            </p>
          </div>

          {lookLockEnabled ? (
            <SeriesLookLockPicker
              lang={lang}
              value={lookInput}
              hasInheritedLook={Boolean(
                lookControl?.inheritedIdentity || bibleRecord.presetVisualIdentity
              )}
              isDisabled={readOnly || isSaving}
              onChange={setLookInput}
            />
          ) : null}

          {!readOnly && (
            <Button
              onClick={() => void handleSave()}
              disabled={
                isSaving ||
                (!dirty &&
                  !regionDirty &&
                  !llmModelPolicyDirty &&
                  !workerWorkflowPolicyDirty &&
                  !workerAccessPolicyDirty &&
                  !durationDirty &&
                  !dialogueLanguageProfileDirty &&
                  !lookLockDirty) ||
                titleInput.trim().length === 0
              }
              className="w-fit gap-2"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {isSaving
                ? lang === "th"
                  ? "กำลังบันทึก…"
                  : "Saving…"
                : lang === "th"
                  ? "บันทึก"
                  : "Save"}
            </Button>
          )}
        </CardContent>
      </Card>

      {textOverlaySuiteEnabled ? (
        <VerticalDramaSeriesWatermarkCard
          lang={lang}
          readOnly={readOnly}
          seriesId={seriesId}
          seriesTitle={title}
          draft={watermarkDraft}
          onChange={setWatermarkDraft}
          saving={updateWatermarkMutation.isPending}
          onSave={() =>
            updateWatermarkMutation.mutate({
              seriesId,
              watermark: watermarkDraft,
            })
          }
        />
      ) : null}

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            {pickCopy(lang, verticalDramaCopy.dangerZoneTitle)}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-2xl gap-3">
          <p className="text-sm text-muted-foreground">
            {pickCopy(lang, verticalDramaCopy.deleteSeriesBody)}
          </p>
          <Button
            type="button"
            variant="destructive"
            className="w-fit gap-2"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {pickCopy(lang, verticalDramaCopy.deleteSeries)}
          </Button>
        </CardContent>
      </Card>

      <VerticalDramaDeleteSeriesDialog
        lang={lang}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        seriesId={seriesId}
        seriesTitle={title}
        onDeleted={() => setLocation(verticalDramaRoutes.seriesList())}
      />
    </div>
  );
}

/** Corner -> Tailwind absolute-position classes for the 9:16 mock preview
 *  box below (`VerticalDramaSeriesWatermarkCard`'s own small helper). */
/** Preview placement for all NINE anchors. `Record<VdWatermarkPosition, …>`
 *  makes a missing entry a compile error, which is why widening the enum to a
 *  3x3 grid had to update this map in the same change. */
const WATERMARK_PREVIEW_CORNER_CLASS: Record<VdWatermarkPosition, string> = {
  top_left: "left-1 top-1",
  top_center: "left-1/2 top-1 -translate-x-1/2",
  top_right: "right-1 top-1",
  middle_left: "left-1 top-1/2 -translate-y-1/2",
  middle_center: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
  middle_right: "right-1 top-1/2 -translate-y-1/2",
  bottom_left: "left-1 bottom-1",
  bottom_center: "left-1/2 bottom-1 -translate-x-1/2",
  bottom_right: "right-1 bottom-1",
};

/** Client-side cap for the watermark upload. Kept in sync with the server's
 *  `uploadSeriesWatermarkImage` decoded-byte cap AND with the dedicated
 *  `express.json` limit registered for that tRPC route in `server/_core/index.ts`
 *  (base64 inflates by ~4/3, so the route limit must exceed this). */
const WATERMARK_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Fallback MIME for OS drags that report an empty `File.type`. */
function guessImageMimeFromName(name: string | undefined): string {
  const ext = (name || "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  return "image/png";
}

/**
 * Pulls an image URL out of a non-file drag (an image dragged from another tab
 * or from the app's own galleries). Returns null when the payload isn't a
 * usable image reference, so the caller can surface a real error instead of
 * silently writing junk into the URL field.
 */
function readDroppedImageUrl(dt: DataTransfer | null | undefined): string | null {
  if (!dt) return null;
  const raw = (dt.getData?.("text/uri-list") || dt.getData?.("text/plain") || "")
    .split(/[\r\n]+/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith("#"));
  if (!raw) return null;
  if (/^data:image\//i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

/**
 * Text Overlay Suite (F131AB, task #34, plan.md v2 "ลายน้ำ") — the series
 * watermark settings card, rendered on the Settings tab (see
 * `VerticalDramaSettingsTab`'s own render call above for the flag gate).
 * Local-draft + explicit-Save convention, mirroring
 * `VerticalDramaEpisodeWorkspace.tsx`'s `VerticalDramaAdBannerPlanSection`/
 * `VerticalDramaTextOverlayPlanSection` (draft passed up from the parent —
 * this card is a pure, controlled sub-component so the parent owns the
 * `useEffect` re-sync-on-fresh-query-data logic once, not duplicated here).
 */
function VerticalDramaSeriesWatermarkCard({
  lang,
  readOnly,
  seriesId,
  seriesTitle,
  draft,
  onChange,
  saving,
  onSave,
}: {
  lang: "th" | "en";
  readOnly: boolean;
  seriesId: string;
  seriesTitle: string;
  draft: VdSeriesWatermarkConfig;
  onChange: (next: VdSeriesWatermarkConfig) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const t = vdTextOverlayCopy(lang);

  // Dual watermark (planning/vd-dual-watermark/plan.md) — slot 1 (series/
  // title logo) stays inline at the top level of `draft`; slot 2 (channel
  // logo) lives under `draft.secondary` and is only materialized into the
  // draft the first time the user actually edits one of ITS controls (see
  // `patchSecondary`) — a series that never touches slot 2 keeps saving a
  // payload with no `secondary` key at all.
  const primaryValue: VdSeriesWatermarkSlot = draft;
  const secondaryValue: VdSeriesWatermarkSlot =
    draft.secondary ?? DEFAULT_SECONDARY_WATERMARK_SLOT;

  function patchPrimary(next: Partial<VdSeriesWatermarkSlot>) {
    onChange({ ...draft, ...next });
  }
  function patchSecondary(next: Partial<VdSeriesWatermarkSlot>) {
    onChange({ ...draft, secondary: { ...secondaryValue, ...next } });
  }

  const primaryHeading =
    lang === "th"
      ? "ลายน้ำเรื่อง (โลโก้ชื่อเรื่อง)"
      : "Title watermark (series logo)";
  const secondaryHeading =
    lang === "th" ? "ลายน้ำช่อง (โลโก้ช่อง)" : "Channel watermark (channel logo)";

  const previewVisible = primaryValue.enabled || secondaryValue.enabled;

  return (
    <Card data-testid="vd-watermark-card">
      <CardHeader>
        <CardTitle className="text-base">{t.watermarkCardTitle}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t.watermarkCardDescription}
        </p>
      </CardHeader>
      <CardContent className="grid max-w-4xl gap-6">
        {/* `flex flex-col`, NOT `grid`, for the two slot columns and their
            inner stacks: a grid container that ends up TALLER than its content
            (which the short column always is, next to the tall one) stretches
            its auto rows to fill that height, which shoved the second slot's
            controls into the vertical middle of the card. Flex columns size to
            their content and stay top-aligned. */}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-lg border border-border/60 p-4">
            <h4 className="text-sm font-semibold">{primaryHeading}</h4>
            <VerticalDramaWatermarkSlotForm
              lang={lang}
              readOnly={readOnly}
              seriesId={seriesId}
              seriesTitle={seriesTitle}
              slotId="primary"
              value={primaryValue}
              onPatch={patchPrimary}
            />
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-border/60 p-4">
            <h4 className="text-sm font-semibold">{secondaryHeading}</h4>
            <VerticalDramaWatermarkSlotForm
              lang={lang}
              readOnly={readOnly}
              seriesId={seriesId}
              seriesTitle={seriesTitle}
              slotId="secondary"
              value={secondaryValue}
              onPatch={patchSecondary}
            />
          </div>
        </div>

        {previewVisible ? (
          <div className="flex flex-col items-start gap-1 border-t pt-4">
            <Label className="text-xs font-medium text-muted-foreground">
              {t.watermarkPreviewLabel}
            </Label>
            {/* ONE combined 9:16 preview showing both slots' markers at once
                (rather than a preview per slot) — the whole point of the
                preview is letting the user see whether the two logos would
                overlap, which a split preview can't show. */}
            <div
              className="relative h-40 w-[90px] shrink-0 overflow-hidden rounded-md border bg-muted"
              data-testid="vd-watermark-preview"
            >
              {primaryValue.enabled ? (
                <span
                  className={`absolute rounded bg-foreground/70 px-1 py-0.5 text-[9px] text-background ${WATERMARK_PREVIEW_CORNER_CLASS[primaryValue.position]}`}
                  style={{ opacity: primaryValue.opacity }}
                  data-testid="vd-watermark-preview-marker-primary"
                >
                  {primaryValue.type === "text" ? primaryValue.text || "LOGO" : "IMG"}
                </span>
              ) : null}
              {secondaryValue.enabled ? (
                <span
                  className={`absolute rounded bg-primary/70 px-1 py-0.5 text-[9px] text-primary-foreground ${WATERMARK_PREVIEW_CORNER_CLASS[secondaryValue.position]}`}
                  style={{ opacity: secondaryValue.opacity }}
                  data-testid="vd-watermark-preview-marker-secondary"
                >
                  {secondaryValue.type === "text" ? secondaryValue.text || "CH" : "IMG"}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {!readOnly && (
          <Button
            onClick={onSave}
            disabled={saving}
            className="w-fit gap-2"
            data-testid="vd-watermark-save"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? t.watermarkSaving : t.watermarkSaveButton}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Dual watermark (planning/vd-dual-watermark/plan.md) — the per-slot form
 * (enable switch, type select, text/image field with drag-and-drop upload,
 * position select, opacity/scale sliders, margin input). Rendered TWICE by
 * `VerticalDramaSeriesWatermarkCard` (once per slot) so the two slots can
 * never visually drift apart — there is exactly one JSX definition of "what
 * a watermark slot's controls look like".
 *
 * Upload busy/error/drag state is LOCAL to this component instance, so the
 * two rendered instances (primary/secondary) never share one flag — a
 * shared busy flag would freeze BOTH slots' upload UI while either one was
 * in flight (see MEMORY.md "Panel-wide pending dead button").
 */
function VerticalDramaWatermarkSlotForm({
  lang,
  readOnly,
  seriesId,
  seriesTitle,
  slotId,
  value,
  onPatch,
}: {
  lang: "th" | "en";
  readOnly: boolean;
  seriesId: string;
  seriesTitle: string;
  slotId: VdSeriesWatermarkSlotId;
  value: VdSeriesWatermarkSlot;
  onPatch: (next: Partial<VdSeriesWatermarkSlot>) => void;
}) {
  const t = vdTextOverlayCopy(lang);
  const uploadWatermarkImageMutation =
    trpc.verticalDramaSeries.uploadSeriesWatermarkImage.useMutation();
  const [watermarkUploadBusy, setWatermarkUploadBusy] = useState(false);
  const [watermarkUploadError, setWatermarkUploadError] = useState<
    string | null
  >(null);
  const [watermarkDragActive, setWatermarkDragActive] = useState(false);
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const watermarkFileInputRef = useRef<HTMLInputElement | null>(null);

  const testId = (name: string) => `vd-watermark-${name}-${slotId}`;

  const handleWatermarkFile = async (file: File | null | undefined) => {
    if (!file) return;
    setWatermarkUploadError(null);
    // Some OS drags report an empty `type` (notably `.svg` on Windows), so fall
    // back to the extension rather than rejecting a legitimate image outright —
    // the server re-validates extension + magic bytes either way.
    const looksLikeImage =
      file.type.toLowerCase().startsWith("image/") ||
      (!file.type &&
        /\.(png|jpe?g|webp|svg)$/i.test(file.name || ""));
    if (!looksLikeImage) {
      setWatermarkUploadError(
        lang === "th"
          ? "ไฟล์ต้องเป็นรูปภาพ (PNG / JPG / WebP / SVG)"
          : "File must be an image (PNG / JPG / WebP / SVG)"
      );
      return;
    }
    if (file.size > WATERMARK_MAX_UPLOAD_BYTES) {
      setWatermarkUploadError(
        lang === "th"
          ? "ไฟล์ใหญ่เกิน 10MB"
          : "File is larger than the 10MB limit"
      );
      return;
    }
    setWatermarkUploadBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read_failed"));
        reader.readAsDataURL(file);
      });
      const result = await uploadWatermarkImageMutation.mutateAsync({
        seriesId,
        fileName: file.name || "watermark.png",
        fileType: file.type || guessImageMimeFromName(file.name),
        fileBase64: base64,
      });
      const url = typeof result?.url === "string" ? result.url : "";
      if (!url) throw new Error("no_url");
      // Fill the field only — saving stays an explicit user action.
      onPatch(acceptImagePatch({ imageUrl: url }));
    } catch (error) {
      setWatermarkUploadError(
        `${lang === "th" ? "อัปโหลดไม่สำเร็จ" : "Upload failed"}${
          error instanceof Error && error.message ? `: ${error.message}` : ""
        }`
      );
    } finally {
      setWatermarkUploadBusy(false);
    }
  };

  /**
   * An image arriving by drop/upload is an unambiguous "make this an image
   * watermark" instruction, so it also flips the slot into image mode and
   * turns it on. Without this, dropping a logo on a slot left in the default
   * TEXT mode silently did nothing visible — the image field (and its
   * dropzone) is only rendered in image mode, so the user had no target and
   * no feedback. Nothing is persisted until "บันทึกลายน้ำ", so a mis-drop is
   * still fully recoverable.
   */
  const acceptImagePatch = (
    patch: Partial<VdSeriesWatermarkSlot>
  ): Partial<VdSeriesWatermarkSlot> => ({
    ...patch,
    type: "image",
    enabled: true,
  });

  const handleWatermarkDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (readOnly || watermarkUploadBusy) return;
    // Cancelling BOTH dragenter and dragover is what makes the element a real
    // drop target; without it the browser keeps its default handler and opens
    // the dropped file instead (navigating away from the settings page).
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setWatermarkDragActive(true);
  };

  const handleWatermarkDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (readOnly || watermarkUploadBusy) return;
    event.preventDefault();
    event.stopPropagation();
    setWatermarkDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void handleWatermarkFile(file);
      return;
    }
    const droppedUrl = readDroppedImageUrl(event.dataTransfer);
    if (droppedUrl) {
      setWatermarkUploadError(null);
      onPatch(acceptImagePatch({ imageUrl: droppedUrl }));
      return;
    }
    setWatermarkUploadError(
      lang === "th"
        ? "ไม่พบไฟล์รูปในสิ่งที่ลากมา — ลากไฟล์จากเครื่อง หรือกดเลือกไฟล์"
        : "No image found in the drop — drag a file from your computer or pick one"
    );
  };

  return (
    // `flex flex-col`, not `grid` — see the two-column wrapper's own comment in
    // `VerticalDramaSeriesWatermarkCard`: a stretched grid container pushes
    // these controls apart vertically when this slot is the shorter of the two.
    //
    // The drop handlers sit on the WHOLE slot, not on the image field alone:
    // the image field only exists in image mode, so a slot in text mode (or a
    // disabled one) had no drop target at all. Dropping anywhere in the slot
    // now accepts the image and switches the slot to image mode.
    <div
      className={`flex flex-col gap-4 rounded-md transition-colors ${
        watermarkDragActive ? "bg-primary/5 ring-2 ring-primary" : ""
      }`}
      onDragEnter={handleWatermarkDragOver}
      onDragOver={handleWatermarkDragOver}
      onDragLeave={event => {
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        setWatermarkDragActive(false);
      }}
      onDrop={handleWatermarkDrop}
      data-testid={testId("slot")}
    >
      <div className="flex items-center gap-2">
        <Switch
          checked={value.enabled}
          onCheckedChange={next => onPatch({ enabled: Boolean(next) })}
          disabled={readOnly}
          data-testid={testId("enabled-toggle")}
        />
        <Label className="text-sm font-medium">{t.watermarkEnableLabel}</Label>
      </div>

      {!readOnly ? (
        <Button
          type="button"
          variant="outline"
          className="w-fit gap-1.5"
          onClick={() => setLogoDialogOpen(true)}
          data-testid={testId("generate-logo")}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {lang === "th" ? "สร้างโลโก้ด้วย AI" : "Generate logo with AI"}
        </Button>
      ) : null}

      {logoDialogOpen ? (
        <VerticalDramaLogoGenerationDialog
          lang={lang}
          open={logoDialogOpen}
          onOpenChange={setLogoDialogOpen}
          seriesId={seriesId}
          seriesTitle={seriesTitle}
          slotId={slotId}
          onApplied={imageUrl => {
            onPatch({ enabled: true, type: "image", imageUrl });
          }}
        />
      ) : null}

      {value.enabled ? (
        <>
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t.watermarkTypeLabel}
            </Label>
            <Select
              value={value.type}
              onValueChange={v => onPatch({ type: v as "text" | "image" })}
              disabled={readOnly}
            >
              <SelectTrigger data-testid={testId("type")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">{t.watermarkTypeText}</SelectItem>
                <SelectItem value="image">{t.watermarkTypeImage}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {value.type === "text" ? (
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t.watermarkTextLabel}
              </Label>
              <Input
                value={value.text ?? ""}
                placeholder={t.watermarkTextPlaceholder}
                onChange={e => onPatch({ text: e.target.value })}
                disabled={readOnly}
                data-testid={testId("text")}
              />
            </div>
          ) : null}

          {/* The logo drop area is rendered in BOTH modes, not only in image
              mode. Hiding it in text mode left a slot with no drop target and
              no upload button at all, so "drag a logo here" was impossible to
              discover or perform without first knowing to flip the type
              select. Dropping/picking an image flips the type itself (see
              `acceptImagePatch`), so showing it in text mode is coherent.

              The drop handlers sit on THIS wrapper, not on the dashed hint
              alone, so dropping anywhere in the image field (hint strip, URL
              input, preview) is accepted — users aimed at the URL box and the
              file fell through to the browser, which then navigated away from
              the page. `dragenter` + `dropEffect` are both required for
              Chrome to treat the element as a real drop target. The drop only
              fills the field — saving stays an explicit action, so a mis-drop
              is recoverable. */}
          {(
            <div
              className={`grid gap-1.5 rounded-md p-1 transition-colors ${
                watermarkDragActive ? "bg-primary/5 ring-2 ring-primary" : ""
              }`}
              onDragEnter={handleWatermarkDragOver}
              onDragOver={handleWatermarkDragOver}
              onDragLeave={event => {
                const next = event.relatedTarget as Node | null;
                if (next && event.currentTarget.contains(next)) return;
                setWatermarkDragActive(false);
              }}
              onDrop={handleWatermarkDrop}
              data-testid={testId("dropzone")}
            >
              <Label className="text-xs font-medium text-muted-foreground">
                {t.watermarkImageUrlLabel}
              </Label>
              <div
                className={`rounded-md border-2 border-dashed p-3 text-xs ${
                  watermarkDragActive
                    ? "border-primary bg-primary/10"
                    : "border-border bg-muted/30"
                }`}
                data-testid={testId("dropzone-hint")}
              >
                <p className="text-muted-foreground">
                  {watermarkDragActive
                    ? lang === "th"
                      ? "วางไฟล์ที่นี่เพื่ออัปโหลด"
                      : "Drop the file here to upload"
                    : lang === "th"
                      ? "ลากไฟล์จากเครื่องมาวางที่นี่ (อัปโหลดอัตโนมัติ) หรือกดเลือกไฟล์ · PNG / JPG / WebP / SVG · ไม่เกิน 10MB · แนะนำ PNG พื้นหลังโปร่งใส"
                      : "Drag an image here (uploads automatically) or pick a file · PNG / JPG / WebP / SVG · max 10MB · transparent PNG recommended"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={readOnly || watermarkUploadBusy}
                    onClick={() => watermarkFileInputRef.current?.click()}
                    data-testid={testId("file-picker")}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {lang === "th" ? "เลือกไฟล์" : "Choose file"}
                  </Button>
                  <input
                    ref={watermarkFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    disabled={readOnly || watermarkUploadBusy}
                    onChange={event => {
                      void handleWatermarkFile(event.target.files?.[0]);
                      // Allow re-picking the same file after an error.
                      event.target.value = "";
                    }}
                    data-testid={testId("file-input")}
                  />
                  {watermarkUploadBusy ? (
                    <span className="text-primary" role="status">
                      {lang === "th" ? "กำลังอัปโหลด…" : "Uploading…"}
                    </span>
                  ) : null}
                </div>
                {value.type !== "image" ? (
                  <p
                    className="mt-1.5 text-[11px] text-primary"
                    data-testid={testId("drop-anywhere-hint")}
                  >
                    {lang === "th"
                      ? "ชุดนี้ตั้งเป็นลายน้ำข้อความอยู่ — วางรูปที่นี่แล้วจะสลับเป็นลายน้ำรูปภาพให้อัตโนมัติ"
                      : "This slot is set to a text watermark — dropping an image here switches it to image mode automatically"}
                  </p>
                ) : null}
                {watermarkUploadError ? (
                  <p className="mt-1 text-destructive" role="alert">
                    {watermarkUploadError}
                  </p>
                ) : null}
              </div>
              <Input
                value={value.imageUrl ?? ""}
                placeholder="https://…/logo.png"
                onChange={e => onPatch({ imageUrl: e.target.value })}
                disabled={readOnly}
                data-testid={testId("image-url")}
              />
              {value.imageUrl ? (
                <AuthenticatedMediaImage
                  src={value.imageUrl}
                  alt=""
                  className="h-14 w-14 rounded border border-border bg-muted object-contain"
                  style={{ opacity: value.opacity ?? 1 }}
                />
              ) : null}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t.watermarkPositionLabel}
            </Label>
            <Select
              value={value.position}
              onValueChange={v => onPatch({ position: v as VdWatermarkPosition })}
              disabled={readOnly}
            >
              <SelectTrigger data-testid={testId("position")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VD_WATERMARK_POSITIONS.map(pos => (
                  <SelectItem key={pos} value={pos}>
                    {VD_WATERMARK_POSITION_LABELS[pos][lang === "th" ? "th" : "en"]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">
                {t.watermarkOpacityLabel}
              </Label>
              <span className="text-xs text-muted-foreground">
                {Math.round(value.opacity * 100)}%
              </span>
            </div>
            <Slider
              min={0.2}
              max={0.8}
              step={0.05}
              value={[value.opacity]}
              onValueChange={([v]) => onPatch({ opacity: v ?? value.opacity })}
              disabled={readOnly}
              data-testid={testId("opacity")}
            />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">
                {t.watermarkScalePctLabel}
              </Label>
              <span className="text-xs text-muted-foreground">
                {value.scalePct}%
              </span>
            </div>
            <Slider
              min={5}
              max={20}
              step={1}
              value={[value.scalePct]}
              onValueChange={([v]) => onPatch({ scalePct: v ?? value.scalePct })}
              disabled={readOnly}
              data-testid={testId("scale")}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t.watermarkMarginPxLabel}
            </Label>
            <Input
              type="number"
              min={0}
              max={200}
              className="w-24"
              value={value.marginPx}
              onChange={e => onPatch({ marginPx: Number(e.target.value) })}
              disabled={readOnly}
              data-testid={testId("margin")}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
