import { CheckCircle2, Circle, ImageIcon } from "lucide-react";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import {
  isSequentialEvidenceOnlyAngleLabel,
  SEQUENTIAL_ANGLE_LABELS,
  type SequentialAngleLabel,
} from "@/lib/marketplaceSequentialStoryboardUi";
import {
  SequentialProductAngleChips,
  type SequentialProductAngleChipsCapacity,
} from "./SequentialProductAngleChips";

export interface MarketplaceAutoReviewProductImageOption {
  id: string;
  url: string;
  type?: string;
  source?: string;
  isHero?: boolean;
}

interface MarketplaceAutoReviewProductImagePickerProps {
  images: MarketplaceAutoReviewProductImageOption[];
  primaryImageId: string | null;
  selectedSupportingImageIds: Set<string>;
  angleLabelsByImageId: Record<string, SequentialAngleLabel | undefined>;
  sequentialEnabled: boolean;
  capacity: SequentialProductAngleChipsCapacity;
  modelLabel: string;
  onPrimaryChange: (imageId: string | null) => void;
  onToggleSupportingImage: (imageId: string) => void;
  onAngleLabelChange: (
    imageId: string,
    label: SequentialAngleLabel | undefined
  ) => void;
}

function imageLabel(
  image: MarketplaceAutoReviewProductImageOption,
  index: number
) {
  return image.type || `ภาพสินค้า ${index + 1}`;
}

export function MarketplaceAutoReviewProductImagePicker({
  images,
  primaryImageId,
  selectedSupportingImageIds,
  angleLabelsByImageId,
  sequentialEnabled,
  capacity,
  modelLabel,
  onPrimaryChange,
  onToggleSupportingImage,
  onAngleLabelChange,
}: MarketplaceAutoReviewProductImagePickerProps) {
  const primaryImage =
    images.find(image => image.id === primaryImageId) ?? null;

  return (
    <section
      className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 shadow-sm md:p-5"
      aria-label="เลือกภาพสินค้าเพื่อสร้าง Job Review"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <span>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-sky-950">
            <ImageIcon className="h-4 w-4 text-sky-600" />
            ภาพสินค้าอ้างอิง
          </span>
          <span className="mt-1 block max-w-3xl text-xs leading-5 text-sky-800">
            คลิกภาพเพื่อเลือกเป็น Product Anchor และ Hero หลัก
            แตะภาพหลักอีกครั้งเพื่อยกเลิก และใช้ปุ่มภาพมุมเสริมเพื่อเพิ่ม reference
            ให้ storyboard นี้
          </span>
        </span>
        <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-800">
          {images.length} ภาพในสินค้า
        </span>
      </header>

      {images.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-sky-300 bg-white p-4 text-sm text-sky-900">
          ยังไม่มีภาพสินค้า กรุณากลับไปเพิ่มภาพใน Product Detail ก่อนสร้าง Job
        </p>
      ) : (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-sky-800">
            {sequentialEnabled
              ? "1 · เลือก Product Anchor / Hero และภาพมุมเสริม"
              : "เลือกภาพหลัก 1 ภาพ"}
          </p>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {images.map((image, index) => {
              const isPrimary = image.id === primaryImageId;
              const isSupporting = selectedSupportingImageIds.has(image.id);
              const angleLabel = angleLabelsByImageId[image.id];
              return (
                <li key={image.id}>
                  <article
                    className={`relative overflow-hidden rounded-xl border bg-white transition ${
                      isPrimary
                        ? "border-sky-500 ring-2 ring-sky-200"
                        : isSupporting
                          ? "border-violet-500 ring-2 ring-violet-100"
                          : "border-slate-200"
                    }`}
                  >
                    <button
                      type="button"
                      className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-inset"
                      onClick={() => {
                        onPrimaryChange(isPrimary ? null : image.id);
                      }}
                      aria-pressed={isPrimary}
                      aria-label={
                        isPrimary
                          ? `ยกเลิกภาพสินค้า ${index + 1} จาก Product Anchor / Hero หลัก`
                          : `เลือกภาพสินค้า ${index + 1} เป็น Product Anchor / Hero หลัก`
                      }
                    >
                      <span className="relative block aspect-[4/3] bg-slate-50 p-2">
                        <AuthenticatedMediaImage
                          src={image.url}
                          alt={imageLabel(image, index)}
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                        <span className="absolute left-2 top-2 rounded-full bg-white/95 p-1.5 text-slate-600 shadow-sm">
                          {isPrimary || isSupporting ? (
                            <CheckCircle2
                              className={`h-4 w-4 ${isPrimary ? "text-sky-600" : "text-violet-600"}`}
                            />
                          ) : (
                            <Circle className="h-4 w-4" />
                          )}
                        </span>
                      </span>
                      <span className="block p-3">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {imageLabel(image, index)}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {image.source || "Product image"}
                        </span>
                        {isPrimary ? (
                          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 text-[11px] font-semibold text-sky-800">
                            <CheckCircle2 className="h-3 w-3" /> Product Anchor
                            / Hero หลัก
                          </span>
                        ) : isSupporting ? (
                          <span className="mt-2 inline-flex rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-800">
                            ภาพมุมเสริมที่เลือก
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {isPrimary ? (
                      <button
                        type="button"
                        className="mx-3 mb-3 block w-[calc(100%-1.5rem)] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-center text-xs font-semibold text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        onClick={() => onPrimaryChange(null)}
                      >
                        ยกเลิก Product Anchor / Hero หลัก
                      </button>
                    ) : sequentialEnabled ? (
                      <button
                        type="button"
                        className={`mx-3 mb-3 block w-[calc(100%-1.5rem)] rounded-md border px-2 py-1.5 text-center text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500 ${isSupporting ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100" : "border-sky-200 bg-white text-sky-700 hover:bg-sky-50"}`}
                        onClick={() => onToggleSupportingImage(image.id)}
                        aria-pressed={isSupporting}
                      >
                        {isSupporting
                          ? "ยกเลิกภาพมุมเสริม"
                          : "เลือกเป็นภาพมุมเสริม"}
                      </button>
                    ) : null}
                    {sequentialEnabled && isSupporting ? (
                      <label className="block border-t bg-slate-50 p-3 text-xs text-slate-600">
                        <span className="sr-only">
                          ประเภทมุมภาพ {index + 1}
                        </span>
                        <select
                          value={angleLabel ?? ""}
                          onChange={event => {
                            const value = event.target.value;
                            onAngleLabelChange(
                              image.id,
                              value
                                ? (value as SequentialAngleLabel)
                                : undefined
                            );
                          }}
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                          aria-label={`กำหนดประเภทมุมภาพสินค้า ${index + 1}`}
                        >
                          <option value="">ให้ระบบวิเคราะห์มุมภาพ</option>
                          {SEQUENTIAL_ANGLE_LABELS.map(label => (
                            <option key={label} value={label}>
                              {label}
                              {isSequentialEvidenceOnlyAngleLabel(label)
                                ? " (evidence only)"
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs leading-5 text-sky-800">
            {sequentialEnabled
              ? "คลิกภาพเพื่อเลือกเป็น Product Anchor / Hero หลัก แตะซ้ำเพื่อยกเลิก; ปุ่มภาพมุมเสริมใช้เพิ่ม reference เข้า Job โดยไม่เปลี่ยนข้อมูลสินค้าเดิม"
              : `ภาพที่เลือก: ${primaryImage ? imageLabel(primaryImage, images.indexOf(primaryImage)) : "ยังไม่ได้เลือก"}`}
          </p>
          <div className="mt-3">
            <SequentialProductAngleChips
              enabled={sequentialEnabled}
              capacity={capacity}
              modelLabel={modelLabel}
              showDiscoverabilityHint={
                images.length > 1 && selectedSupportingImageIds.size === 0
              }
            />
          </div>
        </>
      )}
    </section>
  );
}
