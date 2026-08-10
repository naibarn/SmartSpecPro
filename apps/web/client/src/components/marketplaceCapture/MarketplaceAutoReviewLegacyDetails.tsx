import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Film,
  Image as ImageIcon,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { projectSequentialShotCards } from "@/lib/marketplaceSequentialStoryboardUi";
import { SequentialShotReviewSection } from "./SequentialShotReviewSection";
import type {
  SequentialShotEditorCardSaveInput,
  SequentialShotEditorCardShotError,
} from "./SequentialShotEditorCard";

type LegacyDetailsProps = {
  run: Record<string, any>;
  productName: string;
  onCreateStaged: () => void;
  onRegenerateShot?: (shotId: number) => void;
  onSaveShotEdits?: (input: SequentialShotEditorCardSaveInput) => void;
  onGenerateShotPrompt?: (input: {
    shotId: number;
    stage: "image" | "video";
  }) => void;
  onGenerateShotContent?: (input: {
    shotId: number;
    stage: "summary" | "dialogue";
  }) => void;
  generatingPrompt?: {
    shotId: number;
    stage: "image" | "video" | "summary" | "dialogue";
  } | null;
  languagePlan?: {
    summaryLanguage: "th" | "en";
    dialogueLanguage: "th" | "en";
    promptLanguage: "th" | "en";
  };
  onLanguagePlanChange?: (plan: {
    summaryLanguage: "th" | "en";
    dialogueLanguage: "th" | "en";
    promptLanguage: "th" | "en";
  }) => void;
  onSelectShotAlternate?: (input: { shotId: number; attempt: number }) => void;
  onEditShotImage?: (input: { shotId: number; instruction: string }) => void;
  onAcceptEditedShotImage?: (shotId: number) => void;
  onDiscardEditedShotImage?: (shotId: number) => void;
  onPollEditedShotImage?: (shotId: number) => void;
  imageEditSubmittingShotId?: number | null;
  imageEditResultByShot?: Record<number, { beforeUrl: string; afterUrl: string }>;
  busyShotId?: number | null;
  savingShotId?: number | null;
  swappingShotId?: number | null;
  shotError?: SequentialShotEditorCardShotError | null;
  className?: string;
};

type TimelineItem = Record<string, any>;

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function text(...values: unknown[]): string {
  return (
    values
      .find(value => typeof value === "string" && value.trim())
      ?.toString()
      .trim() ?? ""
  );
}

function numberValue(...values: unknown[]): number {
  const value = values.find(item => item !== null && item !== undefined);
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeUrl(value: unknown): string {
  const candidate = text(value);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate, "https://smartaihub.app");
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return candidate;
  } catch {
    return "";
  }
}

function formatDate(value: unknown): string {
  const candidate = text(value);
  if (!candidate) return "ยังไม่มีเวลา";
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return "ยังไม่มีเวลา";
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusPresentation(status: unknown) {
  switch (text(status)) {
    case "completed":
    case "completed_with_warnings":
      return {
        label: status === "completed" ? "เสร็จแล้ว" : "เสร็จพร้อมคำเตือน",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        Icon: CheckCircle2,
      };
    case "failed":
    case "terminal_failure":
      return {
        label: "ต้องแก้ไข",
        className: "border-red-200 bg-red-50 text-red-800",
        Icon: XCircle,
      };
    case "blocked_needs_user":
    case "blocked":
    case "qa_pending":
    case "repairing":
      return {
        label: "รอตรวจ/แก้ไข",
        className: "border-amber-200 bg-amber-50 text-amber-800",
        Icon: AlertTriangle,
      };
    case "cancelled":
      return {
        label: "ยกเลิกแล้ว",
        className: "border-slate-200 bg-slate-100 text-slate-700",
        Icon: XCircle,
      };
    case "running":
      return {
        label: "กำลังทำงาน",
        className: "border-violet-200 bg-violet-50 text-violet-800",
        Icon: RefreshCw,
      };
    case "waiting_provider":
      return {
        label: "รอผู้ให้บริการ",
        className: "border-sky-200 bg-sky-50 text-sky-800",
        Icon: Clock3,
      };
    case "skipped":
      return {
        label: "ข้ามขั้นตอน",
        className: "border-slate-200 bg-slate-100 text-slate-700",
        Icon: Clock3,
      };
    default:
      return {
        label: "รอเริ่มงาน",
        className: "border-slate-200 bg-slate-50 text-slate-700",
        Icon: Clock3,
      };
  }
}

function collectImageUrls(run: Record<string, any>): string[] {
  const metadata = asRecord(run.metadataJson);
  const result = asRecord(run.resultJson);
  const values: unknown[] = [
    ...asArray(result.frameUrls),
    ...asArray(result.startFrameUrls),
    ...asArray(result.stopFrameUrls),
    ...asArray(metadata.storyboardFrameUrls),
    ...asArray(metadata.startFrameUrls),
    ...asArray(metadata.stopFrameUrls),
  ];

  for (const review of asArray(metadata.imageAttemptReviews)) {
    const reviewRecord = asRecord(review);
    values.push(
      ...asArray(reviewRecord.storyboardFrameUrls),
      ...asArray(reviewRecord.resultUrls),
      ...asArray(reviewRecord.thumbnailUrls)
    );
  }

  return Array.from(new Set(values.map(safeUrl).filter(Boolean))).slice(0, 24);
}

function timelineItems(run: Record<string, any>): TimelineItem[] {
  const timeline = asRecord(run.timeline);
  const projectionTimeline = asRecord(asRecord(run.apiProjection).timeline);
  const items = asArray(timeline.items ?? projectionTimeline.items);
  if (items.length > 0) {
    return items.map(asRecord).sort((left, right) => {
      return numberValue(left.order) - numberValue(right.order);
    });
  }

  return asArray(run.stages).map((stage, index) => {
    const item = asRecord(stage);
    return {
      ...item,
      order: numberValue(item.stageOrder, index + 1),
      stageKey: text(item.stageKey),
      label: text(item.label, item.stageKey),
      status: text(item.status),
    };
  });
}

function creditSummary(run: Record<string, any>): Record<string, any> {
  return asRecord(
    run.creditSummary ?? asRecord(run.apiProjection).creditSummary
  );
}

function outputLinks(run: Record<string, any>): Record<string, any>[] {
  const links = asArray(run.outputLinks ?? run.apiProjection?.outputLinks);
  return links.map(asRecord).filter(link => safeUrl(link.url));
}

function outputLinkFor(
  links: Record<string, any>[],
  kind: string
): Record<string, any> | null {
  return links.find(link => text(link.kind) === kind) ?? null;
}

function collectSequentialReferenceImages(run: Record<string, any>) {
  const metadata = asRecord(run.metadataJson);
  const sequential = asRecord(metadata.sequentialStoryboard);
  return asArray(sequential.referenceManifest)
    .map(entry => asRecord(entry))
    .map(entry => ({
      role: text(entry.role) || "reference",
      url: safeUrl(entry.url),
    }))
    .filter(entry => entry.url);
}

function stageLabel(stage: unknown): string {
  const labels: Record<string, string> = {
    product_preflight: "ตรวจข้อมูลสินค้า",
    production_project: "เตรียมโปรเจกต์การผลิต",
    concept_story: "สร้างแนวคิดและโครงเรื่อง",
    prompt_plan: "วางแผนช็อต บทพูด และสื่อ",
    image_generation: "สร้างภาพและเฟรมอ้างอิง",
    storyboard_review: "ส่งเข้า Storyboard Review",
    video_generation: "สร้างวิดีโอรายช็อต",
    audio_generation: "เตรียมเสียงและจังหวะพูด",
    video_edit: "ประกอบไทม์ไลน์วิดีโอ",
    render: "เรนเดอร์วิดีโอ",
    library_finalize: "บันทึกเข้า Library",
  };
  return labels[text(stage)] ?? text(stage) ?? "ยังไม่ระบุขั้นตอน";
}

function timelineStatusLabel(status: unknown): string {
  return statusPresentation(status).label;
}

export function MarketplaceAutoReviewLegacyDetails({
  run,
  productName,
  onCreateStaged,
  onRegenerateShot,
  onSaveShotEdits,
  onGenerateShotPrompt,
  onGenerateShotContent,
  generatingPrompt,
  languagePlan,
  onLanguagePlanChange,
  onSelectShotAlternate,
  onEditShotImage,
  onAcceptEditedShotImage,
  onDiscardEditedShotImage,
  onPollEditedShotImage,
  imageEditSubmittingShotId,
  imageEditResultByShot,
  busyShotId,
  savingShotId,
  swappingShotId,
  shotError,
  className = "",
}: LegacyDetailsProps) {
  const metadata = asRecord(run.metadataJson);
  const timeline = asRecord(run.timeline);
  const projectionTimeline = asRecord(asRecord(run.apiProjection).timeline);
  const items = timelineItems(run);
  const links = outputLinks(run);
  const storyboardLink = outputLinkFor(links, "storyboard_review");
  const videoEditorLink = outputLinkFor(links, "video_editor");
  const productionLink = outputLinkFor(links, "production_project");
  const libraryLink = outputLinkFor(links, "library_item");
  const images = collectImageUrls(run);
  const sequentialShots = projectSequentialShotCards(run.metadataJson);
  const sequentialReferenceImages = collectSequentialReferenceImages(run);
  const credits = creditSummary(run);
  const statusDetail = asRecord(
    run.statusDetail ?? timeline.statusDetail ?? projectionTimeline.statusDetail
  );
  const progress = Math.max(
    0,
    Math.min(
      100,
      numberValue(
        timeline.progressPercent,
        projectionTimeline.progressPercent,
        run.status === "completed" ? 100 : 0
      )
    )
  );
  const currentStage = text(
    timeline.currentStage,
    projectionTimeline.currentStage,
    run.currentStage
  );
  const status = statusPresentation(run.status);
  const StatusIcon = status.Icon;
  const errorMessage = text(run.errorMessage, statusDetail.safeMessage);
  const [showLegacyHistory, setShowLegacyHistory] = useState(false);
  const [failedImageUrls, setFailedImageUrls] = useState<Record<string, boolean>>({});

  return (
    <section
      className={`mt-4 space-y-4 ${className}`}
      aria-label="รายละเอียด Legacy Auto Review"
    >
      <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 rounded-xl bg-amber-100 p-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                Legacy Auto Review
              </p>
              <h2 className="mt-1 text-lg font-semibold text-amber-950">
                รายละเอียดงานเดิม: {productName}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900">
                งานนี้ถูกสร้างด้วยระบบเดิมที่รันต่อเนื่องจนจบ จึงไม่มี
                checkpoint สำหรับ approve / reject / edit / retry
                ย้อนหลังและไม่สามารถหยุดเครดิตระหว่างทางได้ แต่ถ้ามีข้อมูล
                sequential storyboard ระบบยังแสดงและแก้ไข prompt
                รายช็อตได้ด้านล่าง
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCreateStaged}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <Sparkles className="h-4 w-4" />
            เปิด Job Workbench ใหม่ · 9 ช็อต
          </button>
        </div>
        <div className="mt-4 grid gap-2 text-xs text-amber-900 sm:grid-cols-3">
          <p className="rounded-lg border border-amber-200 bg-white/60 p-3">
            <strong className="block text-amber-950">แก้ไขงานนี้</strong>
            {sequentialShots.length > 0
              ? "แก้ prompt รายช็อตหรือเปิดผลต่อใน Storyboard Review ได้"
              : "เปิดดู output เดิมได้ แต่ไม่มีข้อมูลรายช็อตให้แก้ย้อนหลัง"}
          </p>
          <p className="rounded-lg border border-amber-200 bg-white/60 p-3">
            <strong className="block text-amber-950">ทำงานใหม่</strong>
            ใช้ปุ่มด้านบนเพื่อเริ่ม staged job ที่หยุดรอได้ทุก checkpoint
          </p>
          <p className="rounded-lg border border-amber-200 bg-white/60 p-3">
            <strong className="block text-amber-950">เครดิต</strong>
            การแก้ prompt ไม่ใช้เครดิต; สร้างภาพใหม่จะใช้เครดิตตามระบบเดิม
          </p>
        </div>
      </article>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="สรุป Legacy Auto Review"
      >
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            สถานะงาน
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <StatusIcon className="h-4 w-4 text-violet-600" /> {status.label}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            อัปเดตล่าสุด {formatDate(run.updatedAt ?? run.createdAt)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            ความคืบหน้า
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {progress}%
          </p>
          <progress
            className="mt-2 h-2 w-full accent-violet-600"
            value={progress}
            max={100}
            aria-label={`ความคืบหน้า ${progress}%`}
          />
          <p className="mt-1 text-xs text-slate-500">
            ขั้นตอนปัจจุบัน: {stageLabel(currentStage)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            เครดิตของงาน
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            ใช้แล้ว {numberValue(credits.spentCredits)} เครดิต
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            ประมาณ {numberValue(credits.estimateCredits)} · จองไว้{" "}
            {numberValue(credits.reservedCredits)} · คืนแล้ว{" "}
            {numberValue(credits.refundedCredits)} · ค้าง{" "}
            {numberValue(credits.outstandingCredits)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            ผลลัพธ์
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {images.length} ภาพที่พบ
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {links.length > 0
              ? `มีปลายทาง ${links.length} รายการสำหรับเปิดงานต่อ`
              : "ยังไม่มีลิงก์ output ที่เปิดต่อได้"}
          </p>
        </article>
      </section>

      {errorMessage &&
      (run.status === "failed" || statusDetail.severity === "error") ? (
        <article
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          <p className="font-semibold">ข้อความจากระบบ</p>
          <p className="mt-1 leading-6">{errorMessage}</p>
          {text(statusDetail.nextAction) ? (
            <p className="mt-2 text-xs leading-5">
              ทางไปต่อ: {statusDetail.nextAction}
            </p>
          ) : null}
        </article>
      ) : null}

      {sequentialShots.length > 0 ? (
        <article
          className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5 shadow-sm sm:p-6"
          aria-label="รีวิว storyboard รายช็อตของงานเดิม"
        >
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                Shot-level review · Legacy data
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">
                ภาพ Prompt และวิดีโอแยกตามช็อต
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                แสดงข้อมูลที่งานเดิมบันทึกไว้จริงทีละช็อต แก้บทพูดและ Prompt
                ได้โดยไม่เริ่มงานใหม่ ส่วนการตรวจ approve/reject และการสร้าง
                วิดีโอแบบหยุดรอเครดิต ให้สร้าง Job แบบ staged
              </p>
            </div>
            <span className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-800">
              {sequentialShots.length} ช็อต
            </span>
          </header>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Product references ของ Job นี้
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  ภาพชุดนี้คือภาพสินค้าที่ถูกเลือกตอนสร้าง Job
                  และถูกล็อกไว้กับงานเดิม
                  ส่วนภาพสำรองในแต่ละช็อตด้านล่างคือภาพที่ระบบสร้างไว้แล้ว
                  ไม่ใช่ภาพสินค้าใหม่
                </p>
              </div>
              {sequentialReferenceImages.length > 0 ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {sequentialReferenceImages.length} ภาพอ้างอิง
                </span>
              ) : null}
            </div>
            {sequentialReferenceImages.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {sequentialReferenceImages.map((reference, index) => (
                  <figure
                    key={`${reference.url}-${index}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5"
                  >
                    <img
                      src={reference.url}
                      alt={`ภาพอ้างอิงสินค้า ${index + 1}`}
                      className="h-16 w-12 rounded object-cover"
                    />
                    <figcaption className="pr-2 text-xs text-slate-600">
                      {reference.role}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-amber-700">
                งานเดิมไม่ได้เก็บรายการภาพอ้างอิงแยกไว้
                จึงเลือกย้อนหลังจากหน้านี้ไม่ได้
              </p>
            )}
          </div>
          {onRegenerateShot && onSaveShotEdits ? (
            <div className="mt-5">
              <SequentialShotReviewSection
                key={text(run.id) || "legacy-sequential"}
                shots={sequentialShots}
                loopReport={null}
                budgets={{ imageMaxChars: 4000, videoMaxChars: 2000 }}
                busyShotId={busyShotId}
                savingShotId={savingShotId}
                swappingShotId={swappingShotId}
                shotError={shotError}
                onRegenerateShot={onRegenerateShot}
                onSaveShotEdits={onSaveShotEdits}
                onGenerateShotPrompt={onGenerateShotPrompt}
                onGenerateShotContent={onGenerateShotContent}
                generatingPrompt={generatingPrompt}
                languagePlan={languagePlan}
                onLanguagePlanChange={onLanguagePlanChange}
                onSelectShotAlternate={
                  onSelectShotAlternate ?? (() => undefined)
                }
                onEditShotImage={onEditShotImage}
                onAcceptEditedShotImage={onAcceptEditedShotImage}
                onDiscardEditedShotImage={onDiscardEditedShotImage}
                onPollEditedShotImage={onPollEditedShotImage}
                imageEditSubmittingShotId={imageEditSubmittingShotId}
                imageEditResultByShot={imageEditResultByShot}
                locale="th"
              />
            </div>
          ) : null}
        </article>
      ) : null}

      {sequentialShots.length === 0 ? (
        <article
          className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-5 shadow-sm sm:p-6"
          aria-label="Shot Workbench ต้องสร้าง Job ใหม่"
        >
          <div className="flex flex-wrap items-start gap-3">
            <span className="rounded-xl bg-violet-100 p-2 text-violet-700">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
                Shot Production Board
              </p>
              <h2 className="mt-1 text-lg font-semibold text-violet-950">
                งานนี้ยังไม่มีข้อมูล 9 ช็อตสำหรับทำงานรายช็อต
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-violet-900">
                Job นี้เป็น Legacy จึงเก็บเพียงผลลัพธ์และ timeline รวม
                ไม่ได้เก็บ story / Prompt ภาพ / Prompt วิดีโอ / checkpoint
                แยกช็อตไว้ให้แก้ ย้อนหลัง ปุ่มสร้างภาพจาก timeline
                เดิมจึงไม่สามารถทำงานแบบ credit-safe ได้
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {[
              ["01", "ตรวจเรื่องย่อ", "แก้เรื่องและบทพูดรายช็อต"],
              ["02", "Prompt ภาพ", "สร้างและแก้ Prompt ภาพ"],
              ["03", "ภาพอ้างอิง", "ยืนยันก่อนใช้เครดิตภาพ"],
              ["04", "Prompt / วิดีโอ", "สร้างและตรวจวิดีโอรายช็อต"],
            ].map(([number, title, description]) => (
              <div
                key={number}
                className="rounded-xl border border-violet-200 bg-white p-3"
              >
                <span className="text-xs font-bold text-violet-600">
                  {number}
                </span>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {title}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {description}
                </p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onCreateStaged}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <Sparkles className="h-4 w-4" />
            สร้าง Job ใหม่เพื่อเปิดบอร์ด 9 ช็อต
          </button>
        </article>
      ) : null}

      <section
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        aria-label="ตัวควบคุมประวัติ Legacy"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              ประวัติ Legacy เดิม
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              timeline รวมนี้เป็นข้อมูลอ่านย้อนหลัง ไม่ใช่ Shot Workbench
              และไม่สามารถยืนยันหรือสร้างสื่อจากแต่ละ stage ได้
            </p>
          </div>
          <button
            type="button"
            aria-expanded={showLegacyHistory}
            aria-controls="legacy-run-history"
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            onClick={() => setShowLegacyHistory(current => !current)}
          >
            {showLegacyHistory
              ? "ซ่อนประวัติ Legacy เดิม"
              : "ดูประวัติ Legacy เดิม"}
          </button>
        </div>
      </section>

      <div id="legacy-run-history" hidden={!showLegacyHistory}>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
                Run history
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">
                สิ่งที่เกิดขึ้นแล้วในงานนี้
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                แสดงครบทุก stage จาก run เดิม
                เพื่อให้ตรวจสอบย้อนหลังได้ว่าเสียเครดิตและหยุดอยู่ที่จุดใด
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              {items.length} ขั้นตอน
            </span>
          </header>
          {items.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
              ยังไม่มี timeline ที่ระบบส่งกลับมา แต่สามารถเปิด output
              ที่มีอยู่จากปุ่มด้านบนได้
            </p>
          ) : (
            <ol className="mt-5 space-y-3">
              {items.map((item, index) => {
                const itemStatus = statusPresentation(item.status);
                const ItemStatusIcon = itemStatus.Icon;
                const isCurrent = text(item.stageKey) === currentStage;
                const detail = asRecord(item.detail);
                const itemProgress = numberValue(item.progressPercent);
                return (
                  <li key={`${text(item.stageKey)}-${index}`}>
                    <article
                      className={`rounded-xl border p-4 transition ${
                        isCurrent
                          ? "border-violet-300 bg-violet-50/60 shadow-sm"
                          : "border-slate-200 bg-slate-50/60"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                            {numberValue(item.order, index + 1)}
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-slate-900">
                              {text(item.label) || stageLabel(item.stageKey)}
                            </h3>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatDate(item.startedAt)}
                              {item.completedAt
                                ? ` → ${formatDate(item.completedAt)}`
                                : ""}
                              {text(item.activeSubstep)
                                ? ` · ${item.activeSubstep}`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${itemStatus.className}`}
                        >
                          <ItemStatusIcon className="h-3.5 w-3.5" />
                          {timelineStatusLabel(item.status)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <progress
                          className="h-1.5 min-w-0 flex-1 accent-violet-600"
                          value={itemProgress}
                          max={100}
                          aria-label={`${text(item.label) || stageLabel(item.stageKey)} ${itemProgress}%`}
                        />
                        <span className="w-10 text-right text-xs font-medium text-slate-500">
                          {itemProgress}%
                        </span>
                      </div>
                      {text(detail.safeMessage) ? (
                        <p className="mt-3 text-sm leading-6 text-slate-700">
                          {detail.safeMessage}
                        </p>
                      ) : null}
                      {text(detail.nextAction) ? (
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          ทางไปต่อ: {detail.nextAction}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-slate-500">
                        เครดิต stage นี้: ใช้แล้ว{" "}
                        {numberValue(item.credit?.spentCredits)} · คืนแล้ว{" "}
                        {numberValue(item.credit?.refundedCredits)} · หลักฐาน{" "}
                        {asArray(item.evidenceRefs).length} รายการ
                      </p>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
              Outputs
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              ผลลัพธ์ที่เปิดดูหรือแก้ต่อได้
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
            <ImageIcon className="h-3.5 w-3.5" /> {images.length} ภาพ
          </span>
        </header>
        {images.length > 0 ? (
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((url, index) => (
              <li key={`${url}-${index}`}>
                {failedImageUrls[url] ? (
                  <div className="flex aspect-[9/16] items-center justify-center rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-center text-xs leading-5 text-amber-800">
                    ภาพนี้หมดอายุหรือเปิดไม่ได้แล้ว
                  </div>
                ) : (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="group block overflow-hidden rounded-xl border border-slate-200 bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                    aria-label={`เปิดภาพผลลัพธ์ที่ ${index + 1}`}
                  >
                    <img
                      src={url}
                      alt={`ผลลัพธ์ภาพที่ ${index + 1}`}
                      loading="lazy"
                      onError={() =>
                        setFailedImageUrls(current => ({ ...current, [url]: true }))
                      }
                      className="aspect-[9/16] w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                    />
                    <span className="block truncate px-2 py-1.5 text-[11px] text-slate-500">
                      ภาพที่ {index + 1}
                    </span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-500">
            run นี้ยังไม่มี URL ภาพที่เปิดได้จากข้อมูลที่ส่งกลับมา
          </p>
        )}
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="ลิงก์ผลลัพธ์">
          {storyboardLink ? (
            <a
              href={safeUrl(storyboardLink.url)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <Film className="h-4 w-4" /> เปิด Storyboard Review
              <ArrowUpRight className="h-4 w-4" />
            </a>
          ) : null}
          {videoEditorLink ? (
            <a
              href={safeUrl(videoEditorLink.url)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              เปิด Video Editor <ArrowUpRight className="h-4 w-4" />
            </a>
          ) : null}
          {productionLink ? (
            <a
              href={safeUrl(productionLink.url)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              เปิด Production Project <ArrowUpRight className="h-4 w-4" />
            </a>
          ) : null}
          {libraryLink ? (
            <a
              href={safeUrl(libraryLink.url)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              เปิด Library <ArrowUpRight className="h-4 w-4" />
            </a>
          ) : null}
        </nav>
      </article>

      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        Job ID: <span className="font-mono text-slate-800">{text(run.id)}</span>
        {text(statusDetail.nextAction) ? ` · ${statusDetail.nextAction}` : ""}
      </p>
    </section>
  );
}
