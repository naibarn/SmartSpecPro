/**
 * VerticalDramaContactSheetPicker — start-frame candidate review & selection
 * (spec feature 131, section-05, §7.5 / §11.6 / §16).
 *
 * Owns: mode selection (single_frame_per_shot vs contact_sheet_3x3_batch,
 * default contact-sheet), prompt/model/credit visibility BEFORE any paid
 * generation, batch status, the candidate grid, per-frame reject/flag + repair,
 * the per-shot version/lineage strip with old-vs-new compare, and the
 * "show replaced / all candidates" archive toggle.
 *
 * This component is PROP-DRIVEN: all data and every mutating action arrive via
 * props (dependency injection), so it renders and tests without a wired tRPC
 * router and never triggers generation on its own — paid actions stay behind the
 * caller-supplied approval gate. Copy is bilingual (Thai / English) driven by
 * the active i18n language.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* View-model types (client mirrors of the shared/service contracts)           */
/* -------------------------------------------------------------------------- */

export type VerticalDramaStartFrameMode = "single_frame_per_shot" | "contact_sheet_3x3_batch";

export type ImageModelReasonCode =
  | "no_9_16_support"
  | "crop_pad_resize_unavailable"
  | "unsupported_output_dimensions";

export interface PickerImageModel {
  id: string;
  name: string;
  provider: string;
  creditCost: number;
  compatibility: "direct" | "crop_pad_resize" | "incompatible";
  reasonCode?: ImageModelReasonCode;
  reasonText?: string;
  approveDisabled: boolean;
  isDefault: boolean;
}

export interface PickerPromptSet {
  promptSetId: string;
  sheetIndex: number;
  contactSheetPrompt: string;
  negativePrompt: string;
}

export interface PickerCandidateFrame {
  candidateFrameId: string;
  sourceContactSheetId: string;
  shotNumber: number;
  cellIndex: number;
  sheetIndex: number;
  previewUrl?: string;
  qcStatus: "pending" | "passed" | "failed" | "needs_repair";
  /** "active" | "superseded" — archived candidates keep rendering under the toggle. */
  state?: "active" | "superseded";
  rejectReason?: string;
  rejectReasonCode?: ImageModelReasonCode | string;
  /** Prefill for the repair dialog (per-frame repair-prompt template). */
  repairPromptTemplate?: { imagePrompt: string; negativePrompt: string };
}

export interface PickerCandidateVersion {
  candidateFrameId: string;
  shotNumber: number;
  state: "active" | "superseded";
  mediaAssetId: string;
  previewUrl?: string;
  createdAt: string;
}

export type PickerBatchStatus =
  | "planned"
  | "approved"
  | "generating"
  | "cropping"
  | "ready_for_selection"
  | "failed"
  | "cancelled";

export interface RejectCandidatePayload {
  candidateFrameId: string;
  shotNumber: number;
  reason: string;
  reasonCode?: string;
}

export interface RepairFramePayload {
  shotNumber: number;
  candidateFrameId: string;
  instruction: string;
  targetImageModelId: string;
  approved: boolean;
}

export interface RegeneratePayload {
  scope: "whole_sheet" | "single_prompt_set" | "single_frame";
  sheetIndex?: number;
  promptSetId?: string;
  candidateFrameId?: string;
  approved: boolean;
}

export interface VerticalDramaContactSheetPickerProps {
  /** loading | empty | error | success drive the top-level surface state. */
  status: "loading" | "empty" | "error" | "success";
  errorMessage?: string;
  errorKind?: "provider_failure" | "crop_failure" | "wrong_aspect_ratio" | "rejected_candidate";

  mode: VerticalDramaStartFrameMode;
  onModeChange?: (mode: VerticalDramaStartFrameMode) => void;

  imageModels: PickerImageModel[];
  selectedImageModelId: string;
  onImageModelChange?: (id: string) => void;

  sheetCountPresets: number[];
  sheetCount: number;
  onSheetCountChange?: (n: number) => void;

  promptSets: PickerPromptSet[];
  /** Explicit gate: paid generation stays blocked until prompts+model approved. */
  promptModelApproved: boolean;
  onApprovePromptModel?: (approved: boolean) => void;
  creditEstimate: number;

  batchStatus: PickerBatchStatus;
  expectedCandidateFrameCount: number;
  completedCandidateFrameCount: number;

  candidates: PickerCandidateFrame[];
  selectedByShot: Record<number, string>; // shotNumber -> candidateFrameId
  onSelectCandidate?: (frame: PickerCandidateFrame) => void;
  onRejectCandidate?: (payload: RejectCandidatePayload) => void;
  onRepairFrame?: (payload: RepairFramePayload) => void;
  onRegenerate?: (payload: RegeneratePayload) => void;

  /** Per-shot version lineage (superseded + current) for the strip / compare. */
  versionsByShot?: Record<number, PickerCandidateVersion[]>;
  onReselectVersion?: (shotNumber: number, version: PickerCandidateVersion) => void;

  /** Completed episodes render read-only: actions disabled, archive still shown. */
  readOnly?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Bilingual copy                                                              */
/* -------------------------------------------------------------------------- */

type Copy = typeof COPY_EN;

const COPY_EN = {
  title: "Start-frame candidates",
  subtitle: "Compare candidates and select the best frame per shot.",
  modeLabel: "Generation mode",
  modeContactSheet: "3x3 contact sheet (batch)",
  modeSingle: "Single frame per shot",
  modelLabel: "Image model",
  sheetCountLabel: "Sheet count",
  candidatesFor: (n: number) => `${n} candidates`,
  promptVisibility: "Prompts and model are shown below. Paid generation has NOT happened yet.",
  creditEstimate: (n: number) => `Estimated credits: ${n}`,
  approveGate: "Approve prompts & model to enable generation",
  approved: "Prompts & model approved",
  generateBlocked: "Generation is disabled until you approve the prompts and model.",
  loading: "Loading candidates…",
  emptyTitle: "No candidates yet",
  emptyCta: "Generate or import start frames",
  errorTitle: "Something went wrong",
  errorProvider: "Provider failure while generating this sheet.",
  errorCrop: "Crop failed — the full contact sheet is preserved for repair.",
  errorAspect: "Wrong aspect ratio — candidate must be 9:16.",
  errorRejected: "This candidate was rejected.",
  retry: "Retry",
  cancel: "Cancel",
  batchStatus: "Batch status",
  progress: (a: number, b: number) => `${a} of ${b} frames ready`,
  shot: (n: number) => `Shot ${n}`,
  cell: (s: number, c: number) => `Sheet ${s + 1}, cell ${c}`,
  select: "Select",
  selected: "Selected",
  reject: "Reject / flag",
  repair: "Repair this frame",
  needsRepair: "Needs repair",
  regenSheet: "Regenerate whole sheet",
  regenPromptSet: "Regenerate prompt set",
  replaceFrame: "Replace this frame",
  archiveToggle: "Show replaced / all candidates",
  archiveNote:
    "Replaced and superseded candidates are retained for audit and stay viewable, including on completed episodes.",
  versionStrip: "Version history",
  compare: "Compare old vs new",
  original: "Superseded original",
  repaired: "Repaired candidate",
  reselect: "Use this version",
  readOnlyNote: "This episode is completed — actions are disabled. Archived candidates remain viewable.",
  rejectTitle: "Reject / flag candidate",
  rejectReasonLabel: "Reason",
  rejectReasonPlaceholder: "Why is this candidate wrong?",
  rejectCodeLabel: "Reason code",
  repairTitle: "Repair this frame",
  repairPrefillNote:
    "The instruction is prefilled from this frame's repair template. Repair creates a NEW version — it never overwrites or deletes the original.",
  repairInstruction: "Repair instruction",
  repairModel: (m: string) => `Target model: ${m}`,
  repairCredit: (n: number) => `Repair credit estimate: ${n}`,
  repairApprove: "Approve instruction & model",
  submit: "Submit",
  reasonCodes: {
    no_9_16_support: "No 9:16 support",
    crop_pad_resize_unavailable: "Crop/pad/resize unavailable",
    unsupported_output_dimensions: "Unsupported output dimensions",
  } as Record<string, string>,
};

const COPY_TH: Copy = {
  title: "เฟรมเริ่มต้น (ตัวเลือก)",
  subtitle: "เปรียบเทียบตัวเลือกและเลือกเฟรมที่ดีที่สุดของแต่ละช็อต",
  modeLabel: "โหมดการสร้าง",
  modeContactSheet: "คอนแทกต์ชีต 3x3 (แบตช์)",
  modeSingle: "เฟรมเดียวต่อช็อต",
  modelLabel: "โมเดลภาพ",
  sheetCountLabel: "จำนวนชีต",
  candidatesFor: (n: number) => `${n} ตัวเลือก`,
  promptVisibility: "แสดงพรอมป์และโมเดลด้านล่าง ยังไม่มีการสร้างที่เสียเครดิต",
  creditEstimate: (n: number) => `ประมาณเครดิต: ${n}`,
  approveGate: "อนุมัติพรอมป์และโมเดลเพื่อเปิดการสร้าง",
  approved: "อนุมัติพรอมป์และโมเดลแล้ว",
  generateBlocked: "การสร้างถูกปิดไว้จนกว่าจะอนุมัติพรอมป์และโมเดล",
  loading: "กำลังโหลดตัวเลือก…",
  emptyTitle: "ยังไม่มีตัวเลือก",
  emptyCta: "สร้างหรือนำเข้าเฟรมเริ่มต้น",
  errorTitle: "เกิดข้อผิดพลาด",
  errorProvider: "ผู้ให้บริการล้มเหลวขณะสร้างชีตนี้",
  errorCrop: "ครอปล้มเหลว — คอนแทกต์ชีตเต็มถูกเก็บไว้สำหรับซ่อม",
  errorAspect: "อัตราส่วนผิด — ตัวเลือกต้องเป็น 9:16",
  errorRejected: "ตัวเลือกนี้ถูกปฏิเสธ",
  retry: "ลองใหม่",
  cancel: "ยกเลิก",
  batchStatus: "สถานะแบตช์",
  progress: (a: number, b: number) => `พร้อม ${a} จาก ${b} เฟรม`,
  shot: (n: number) => `ช็อต ${n}`,
  cell: (s: number, c: number) => `ชีต ${s + 1}, เซลล์ ${c}`,
  select: "เลือก",
  selected: "เลือกแล้ว",
  reject: "ปฏิเสธ / ตั้งค่าสถานะ",
  repair: "ซ่อมเฟรมนี้",
  needsRepair: "ต้องซ่อม",
  regenSheet: "สร้างชีตใหม่ทั้งชีต",
  regenPromptSet: "สร้างชุดพรอมป์ใหม่",
  replaceFrame: "แทนที่เฟรมนี้",
  archiveToggle: "แสดงตัวเลือกที่ถูกแทนที่ / ทั้งหมด",
  archiveNote:
    "ตัวเลือกที่ถูกแทนที่และเลิกใช้จะถูกเก็บไว้เพื่อการตรวจสอบและยังดูได้ รวมถึงบนตอนที่เสร็จสมบูรณ์",
  versionStrip: "ประวัติเวอร์ชัน",
  compare: "เปรียบเทียบเก่ากับใหม่",
  original: "ต้นฉบับที่ถูกแทนที่",
  repaired: "ตัวเลือกที่ซ่อมแล้ว",
  reselect: "ใช้เวอร์ชันนี้",
  readOnlyNote: "ตอนนี้เสร็จสมบูรณ์แล้ว — การกระทำถูกปิด ตัวเลือกที่เก็บถาวรยังดูได้",
  rejectTitle: "ปฏิเสธ / ตั้งค่าสถานะตัวเลือก",
  rejectReasonLabel: "เหตุผล",
  rejectReasonPlaceholder: "ทำไมตัวเลือกนี้จึงไม่ถูกต้อง?",
  rejectCodeLabel: "รหัสเหตุผล",
  repairTitle: "ซ่อมเฟรมนี้",
  repairPrefillNote:
    "คำสั่งถูกกรอกล่วงหน้าจากเทมเพลตการซ่อมของเฟรมนี้ การซ่อมสร้างเวอร์ชันใหม่ ไม่เขียนทับหรือลบต้นฉบับ",
  repairInstruction: "คำสั่งซ่อม",
  repairModel: (m: string) => `โมเดลเป้าหมาย: ${m}`,
  repairCredit: (n: number) => `ประมาณเครดิตการซ่อม: ${n}`,
  repairApprove: "อนุมัติคำสั่งและโมเดล",
  submit: "ส่ง",
  reasonCodes: {
    no_9_16_support: "ไม่รองรับ 9:16",
    crop_pad_resize_unavailable: "ครอป/แพด/รีไซซ์ไม่ได้",
    unsupported_output_dimensions: "ขนาดผลลัพธ์ไม่รองรับ",
  },
};

const REJECT_REASON_CODES = [
  "identity_drift",
  "wrong_aspect_ratio",
  "crop_artifact",
  "wrong_pose",
  "product_mismatch",
  "other",
] as const;

/* -------------------------------------------------------------------------- */
/* Main component                                                              */
/* -------------------------------------------------------------------------- */

export function VerticalDramaContactSheetPicker(props: VerticalDramaContactSheetPickerProps) {
  const { i18n } = useTranslation();
  const t: Copy = i18n.language?.startsWith("th") ? COPY_TH : COPY_EN;
  const readOnly = props.readOnly === true;

  const [showArchived, setShowArchived] = useState(false);
  const [repairTarget, setRepairTarget] = useState<PickerCandidateFrame | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PickerCandidateFrame | null>(null);
  const [compareShot, setCompareShot] = useState<number | null>(null);

  const isContactSheet = props.mode === "contact_sheet_3x3_batch";

  const visibleCandidates = useMemo(() => {
    if (showArchived) return props.candidates;
    return props.candidates.filter((c) => c.state !== "superseded");
  }, [props.candidates, showArchived]);

  const shotsWithCandidates = useMemo(() => {
    const set = new Set<number>();
    for (const c of visibleCandidates) set.add(c.shotNumber);
    return [...set].sort((a, b) => a - b);
  }, [visibleCandidates]);

  const generationDisabled = readOnly || !props.promptModelApproved;

  return (
    <section aria-label={t.title} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        {readOnly && (
          <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
            {t.readOnlyNote}
          </p>
        )}
      </header>

      {/* Mode + model + credit visibility gate (before any paid generation) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.modeLabel}</CardTitle>
          <CardDescription>{t.promptVisibility}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.modeLabel}>
            <Button
              type="button"
              variant={isContactSheet ? "default" : "outline"}
              role="radio"
              aria-checked={isContactSheet}
              disabled={readOnly}
              onClick={() => props.onModeChange?.("contact_sheet_3x3_batch")}
            >
              {t.modeContactSheet}
            </Button>
            <Button
              type="button"
              variant={!isContactSheet ? "default" : "outline"}
              role="radio"
              aria-checked={!isContactSheet}
              disabled={readOnly}
              onClick={() => props.onModeChange?.("single_frame_per_shot")}
            >
              {t.modeSingle}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t.modelLabel}</span>
              <Select
                value={props.selectedImageModelId}
                onValueChange={(v) => props.onImageModelChange?.(v)}
                disabled={readOnly}
              >
                <SelectTrigger aria-label={t.modelLabel}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {props.imageModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        {m.name}
                        {m.isDefault && <Badge variant="secondary">default</Badge>}
                        {m.compatibility === "incompatible" && m.reasonCode && (
                          <Badge
                            variant="destructive"
                            title={m.reasonText}
                            aria-label={t.reasonCodes[m.reasonCode] ?? m.reasonCode}
                          >
                            {t.reasonCodes[m.reasonCode] ?? m.reasonCode}
                          </Badge>
                        )}
                        {m.compatibility === "crop_pad_resize" && (
                          <Badge variant="outline" title={m.reasonText}>
                            crop/pad/resize
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            {isContactSheet && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{t.sheetCountLabel}</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.sheetCountLabel}>
                  {props.sheetCountPresets.map((n) => (
                    <Button
                      key={n}
                      type="button"
                      size="sm"
                      variant={props.sheetCount === n ? "default" : "outline"}
                      role="radio"
                      aria-checked={props.sheetCount === n}
                      disabled={readOnly}
                      onClick={() => props.onSheetCountChange?.(n)}
                    >
                      {n} — {t.candidatesFor(n * 9)}
                    </Button>
                  ))}
                </div>
              </label>
            )}
          </div>

          {/* Prompt visibility */}
          <div className="flex flex-col gap-2 rounded-md border p-3">
            {props.promptSets.map((ps) => (
              <details key={ps.promptSetId} className="text-sm">
                <summary className="cursor-pointer font-medium">
                  {t.cell(ps.sheetIndex, 0).replace(", cell 0", "").replace(", เซลล์ 0", "")}
                </summary>
                <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {ps.contactSheetPrompt}
                  {ps.negativePrompt ? `\n\n(-) ${ps.negativePrompt}` : ""}
                </pre>
              </details>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">{t.creditEstimate(props.creditEstimate)}</span>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={props.promptModelApproved}
                onCheckedChange={(v) => props.onApprovePromptModel?.(v)}
                disabled={readOnly}
                aria-label={t.approveGate}
              />
              <span>{props.promptModelApproved ? t.approved : t.approveGate}</span>
            </label>
          </div>
          {generationDisabled && !readOnly && (
            <p role="note" className="text-xs text-muted-foreground">
              {t.generateBlocked}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Batch status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.batchStatus}</CardTitle>
          <CardDescription>
            <Badge variant="outline" className="mr-2">
              {props.batchStatus}
            </Badge>
            {t.progress(props.completedCandidateFrameCount, props.expectedCandidateFrameCount)}
          </CardDescription>
        </CardHeader>
        {isContactSheet && (
          <CardContent className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={generationDisabled}
              onClick={() =>
                props.onRegenerate?.({
                  scope: "whole_sheet",
                  sheetIndex: 0,
                  approved: props.promptModelApproved,
                })
              }
            >
              {t.regenSheet}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={generationDisabled}
              onClick={() =>
                props.onRegenerate?.({
                  scope: "single_prompt_set",
                  promptSetId: props.promptSets[0]?.promptSetId,
                  approved: props.promptModelApproved,
                })
              }
            >
              {t.regenPromptSet}
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Archive toggle */}
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={showArchived}
            onCheckedChange={setShowArchived}
            aria-label={t.archiveToggle}
          />
          <span>{t.archiveToggle}</span>
        </label>
        <p className="text-xs text-muted-foreground">{t.archiveNote}</p>
      </div>

      {/* Body states */}
      {props.status === "loading" && <LoadingState label={t.loading} />}
      {props.status === "error" && (
        <ErrorState
          copy={t}
          message={props.errorMessage}
          kind={props.errorKind}
          onRetry={readOnly ? undefined : () => props.onRegenerate?.({ scope: "whole_sheet", sheetIndex: 0, approved: props.promptModelApproved })}
        />
      )}
      {props.status === "empty" && <EmptyState label={t.emptyCta} disabled={readOnly} />}

      {props.status === "success" && (
        <div className="flex flex-col gap-6">
          {shotsWithCandidates.map((shotNumber) => {
            const frames = visibleCandidates.filter((c) => c.shotNumber === shotNumber);
            const versions = props.versionsByShot?.[shotNumber] ?? [];
            return (
              <div key={shotNumber} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold" id={`vd-shot-${shotNumber}`}>
                  {t.shot(shotNumber)}
                </h3>
                <ul
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  aria-labelledby={`vd-shot-${shotNumber}`}
                >
                  {frames.map((frame) => (
                    <li key={frame.candidateFrameId}>
                      <FrameCandidateCard
                        copy={t}
                        frame={frame}
                        selected={props.selectedByShot[shotNumber] === frame.candidateFrameId}
                        readOnly={readOnly}
                        onSelect={() => props.onSelectCandidate?.(frame)}
                        onReject={() => setRejectTarget(frame)}
                        onRepair={() => setRepairTarget(frame)}
                        onReplace={() =>
                          props.onRegenerate?.({
                            scope: "single_frame",
                            candidateFrameId: frame.candidateFrameId,
                            approved: props.promptModelApproved,
                          })
                        }
                        generationDisabled={generationDisabled}
                      />
                    </li>
                  ))}
                </ul>

                {versions.length > 0 && (
                  <CandidateVersionStrip
                    copy={t}
                    shotNumber={shotNumber}
                    versions={versions}
                    readOnly={readOnly}
                    onReselect={(v) => props.onReselectVersion?.(shotNumber, v)}
                    onCompare={() => setCompareShot(shotNumber)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reject / flag dialog */}
      <RejectDialog
        copy={t}
        frame={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSubmit={(payload) => {
          props.onRejectCandidate?.(payload);
          setRejectTarget(null);
        }}
      />

      {/* Repair dialog */}
      <FrameRepairDialog
        copy={t}
        frame={repairTarget}
        targetImageModelId={props.selectedImageModelId}
        creditEstimate={props.creditEstimate}
        onClose={() => setRepairTarget(null)}
        onSubmit={(payload) => {
          props.onRepairFrame?.(payload);
          setRepairTarget(null);
        }}
      />

      {/* Old-vs-new compare */}
      <CompareDialog
        copy={t}
        shotNumber={compareShot}
        versions={compareShot != null ? props.versionsByShot?.[compareShot] ?? [] : []}
        onClose={() => setCompareShot(null)}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                               */
/* -------------------------------------------------------------------------- */

function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full rounded-md" />
      ))}
    </div>
  );
}

function EmptyState({ label, disabled }: { label: string; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed p-8 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Button type="button" disabled={disabled}>
        {label}
      </Button>
    </div>
  );
}

function ErrorState({
  copy,
  message,
  kind,
  onRetry,
}: {
  copy: Copy;
  message?: string;
  kind?: VerticalDramaContactSheetPickerProps["errorKind"];
  onRetry?: () => void;
}) {
  const kindCopy =
    kind === "provider_failure"
      ? copy.errorProvider
      : kind === "crop_failure"
        ? copy.errorCrop
        : kind === "wrong_aspect_ratio"
          ? copy.errorAspect
          : kind === "rejected_candidate"
            ? copy.errorRejected
            : undefined;
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-destructive/50 p-4">
      <p className="text-sm font-medium text-destructive">{copy.errorTitle}</p>
      {kindCopy && <p className="text-sm">{kindCopy}</p>}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      <div className="flex gap-2">
        {onRetry && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry} aria-label={copy.retry}>
            {copy.retry}
          </Button>
        )}
      </div>
    </div>
  );
}

function FrameCandidateCard({
  copy,
  frame,
  selected,
  readOnly,
  generationDisabled,
  onSelect,
  onReject,
  onRepair,
  onReplace,
}: {
  copy: Copy;
  frame: PickerCandidateFrame;
  selected: boolean;
  readOnly: boolean;
  generationDisabled: boolean;
  onSelect: () => void;
  onReject: () => void;
  onRepair: () => void;
  onReplace: () => void;
}) {
  const label = `${copy.shot(frame.shotNumber)} — ${copy.cell(frame.sheetIndex, frame.cellIndex)}`;
  const needsRepair = frame.qcStatus === "needs_repair" || frame.qcStatus === "failed";
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border p-2",
        selected && "ring-2 ring-primary",
        frame.state === "superseded" && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={readOnly}
        aria-pressed={selected}
        aria-label={`${copy.select}: ${label}`}
        className={cn(
          "relative flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {frame.previewUrl ? (
          <img src={frame.previewUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">{label}</span>
        )}
        {selected && (
          <span className="absolute right-1 top-1">
            <Badge>{copy.selected}</Badge>
          </span>
        )}
      </button>

      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="text-muted-foreground">{label}</span>
        {needsRepair && (
          <Badge variant="destructive" aria-label={copy.needsRepair}>
            {copy.needsRepair}
          </Badge>
        )}
        {frame.rejectReason && (
          <span className="text-destructive" title={frame.rejectReason}>
            ⚑ {frame.rejectReasonCode ?? ""}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant={selected ? "secondary" : "default"}
          onClick={onSelect}
          disabled={readOnly}
        >
          {selected ? copy.selected : copy.select}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onReject} disabled={readOnly}>
          {copy.reject}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onRepair} disabled={readOnly}>
          {copy.repair}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onReplace}
          disabled={generationDisabled}
        >
          {copy.replaceFrame}
        </Button>
      </div>
    </div>
  );
}

function RejectDialog({
  copy,
  frame,
  onClose,
  onSubmit,
}: {
  copy: Copy;
  frame: PickerCandidateFrame | null;
  onClose: () => void;
  onSubmit: (payload: RejectCandidatePayload) => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState<string>("other");
  const open = frame != null;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          setReasonCode("other");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.rejectTitle}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>{copy.rejectCodeLabel}</span>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger aria-label={copy.rejectCodeLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REJECT_REASON_CODES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{copy.rejectReasonLabel}</span>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={copy.rejectReasonPlaceholder}
              aria-label={copy.rejectReasonLabel}
            />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button
            type="button"
            disabled={reason.trim().length === 0 || !frame}
            onClick={() =>
              frame &&
              onSubmit({
                candidateFrameId: frame.candidateFrameId,
                shotNumber: frame.shotNumber,
                reason: reason.trim(),
                reasonCode,
              })
            }
          >
            {copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FrameRepairDialog({
  copy,
  frame,
  targetImageModelId,
  creditEstimate,
  onClose,
  onSubmit,
}: {
  copy: Copy;
  frame: PickerCandidateFrame | null;
  targetImageModelId: string;
  creditEstimate: number;
  onClose: () => void;
  onSubmit: (payload: RepairFramePayload) => void;
}) {
  const prefill = frame?.repairPromptTemplate?.imagePrompt ?? "";
  const seededReason = frame?.rejectReason ? `\n\n[reason] ${frame.rejectReason}` : "";
  const [instruction, setInstruction] = useState("");
  const [approved, setApproved] = useState(false);
  const open = frame != null;

  // Prefill on open (keyed by frame id).
  const initial = prefill + seededReason;
  const value = instruction.length > 0 ? instruction : initial;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setInstruction("");
          setApproved(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.repairTitle}</DialogTitle>
          <DialogDescription>{copy.repairPrefillNote}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>{copy.repairInstruction}</span>
            <Textarea
              value={value}
              onChange={(e) => setInstruction(e.target.value)}
              aria-label={copy.repairInstruction}
              rows={5}
            />
          </label>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>{copy.repairModel(targetImageModelId)}</span>
            <span>{copy.repairCredit(creditEstimate)}</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={approved} onCheckedChange={setApproved} aria-label={copy.repairApprove} />
            <span>{copy.repairApprove}</span>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button
            type="button"
            disabled={!approved || value.trim().length === 0 || !frame}
            onClick={() =>
              frame &&
              onSubmit({
                shotNumber: frame.shotNumber,
                candidateFrameId: frame.candidateFrameId,
                instruction: value.trim(),
                targetImageModelId,
                approved,
              })
            }
          >
            {copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CandidateVersionStrip({
  copy,
  shotNumber,
  versions,
  readOnly,
  onReselect,
  onCompare,
}: {
  copy: Copy;
  shotNumber: number;
  versions: PickerCandidateVersion[];
  readOnly: boolean;
  onReselect: (v: PickerCandidateVersion) => void;
  onCompare: () => void;
}) {
  const hasSuperseded = versions.some((v) => v.state === "superseded");
  return (
    <div
      className="flex flex-col gap-2 rounded-md border p-2"
      role="group"
      aria-label={`${copy.versionStrip} — ${copy.shot(shotNumber)}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{copy.versionStrip}</span>
        {hasSuperseded && (
          <Button type="button" size="sm" variant="outline" onClick={onCompare}>
            {copy.compare}
          </Button>
        )}
      </div>
      <ul className="flex flex-wrap gap-2">
        {versions.map((v) => (
          <li key={v.candidateFrameId}>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onReselect(v)}
              aria-label={`${copy.reselect}: ${v.state === "superseded" ? copy.original : copy.repaired}`}
              className={cn(
                "flex aspect-[9/16] w-16 items-center justify-center overflow-hidden rounded border text-[10px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                v.state === "superseded" ? "opacity-60" : "ring-1 ring-primary",
              )}
            >
              {v.previewUrl ? (
                <img src={v.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{v.state === "superseded" ? copy.original : copy.repaired}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompareDialog({
  copy,
  shotNumber,
  versions,
  onClose,
}: {
  copy: Copy;
  shotNumber: number | null;
  versions: PickerCandidateVersion[];
  onClose: () => void;
}) {
  const open = shotNumber != null;
  const original = versions.find((v) => v.state === "superseded");
  const repaired = versions.find((v) => v.state === "active");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {copy.compare}
            {shotNumber != null ? ` — ${copy.shot(shotNumber)}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <figure className="flex flex-col gap-1">
            <div className="flex aspect-[9/16] items-center justify-center overflow-hidden rounded bg-muted">
              {original?.previewUrl ? (
                <img src={original.previewUrl} alt={copy.original} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">{copy.original}</span>
              )}
            </div>
            <figcaption className="text-center text-xs">{copy.original}</figcaption>
          </figure>
          <figure className="flex flex-col gap-1">
            <div className="flex aspect-[9/16] items-center justify-center overflow-hidden rounded bg-muted">
              {repaired?.previewUrl ? (
                <img src={repaired.previewUrl} alt={copy.repaired} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">{copy.repaired}</span>
              )}
            </div>
            <figcaption className="text-center text-xs">{copy.repaired}</figcaption>
          </figure>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {copy.cancel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default VerticalDramaContactSheetPicker;
