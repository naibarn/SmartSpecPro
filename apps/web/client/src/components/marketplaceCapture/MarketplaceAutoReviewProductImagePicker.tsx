import { CheckCircle2, Circle, ImageIcon, LockKeyhole } from "lucide-react";
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
  onPrimaryChange: (imageId: string) => void;
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
            เลือกภาพหลักที่ต้องการให้ระบบยึดเป็น Product Anchor
            และเลือกภาพมุมเสริมที่จะส่งเข้า storyboard นี้โดยเฉพาะ
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
              ? "1 · เลือกภาพหลักและภาพมุมเสริม"
              : "เลือกภาพหลัก 1 ภาพ"}
          </p>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {images.map((image, index) => {
              const isPrimary = image.id === primaryImageId;
              const isSupporting = selectedSupportingImageIds.has(image.id);
              const angleLabel = angleLabelsByImageId[image.id];
              const canToggleSupporting = sequentialEnabled && !isPrimary;
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
                        if (canToggleSupporting) {
                          onToggleSupportingImage(image.id);
                        } else if (!sequentialEnabled) {
                          onPrimaryChange(image.id);
                        }
                      }}
                      aria-pressed={
                        sequentialEnabled
                          ? isPrimary || isSupporting
                          : isPrimary
                      }
                      aria-label={
                        sequentialEnabled
                          ? isPrimary
                            ? `ภาพสินค้า ${index + 1} เป็น Product Anchor หลัก`
                            : `${isSupporting ? "ยกเลิกเลือก" : "เลือก"}ภาพสินค้า ${index + 1} เป็นภาพมุมเสริม`
                          : `${isPrimary ? "เลือกแล้ว" : "เลือก"}ภาพสินค้า ${index + 1} เป็น Product Anchor`
                      }
                    >
                      <span className="relative block aspect-[4/3] bg-slate-50 p-2">
                        <img
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
                            <LockKeyhole className="h-3 w-3" /> Product Anchor
                            หลัก
                          </span>
                        ) : isSupporting ? (
                          <span className="mt-2 inline-flex rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-800">
                            ภาพมุมเสริมที่เลือก
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {sequentialEnabled && !isPrimary ? (
                      <button
                        type="button"
                        className="mx-3 mb-3 block w-[calc(100%-1.5rem)] rounded-md border border-sky-200 bg-white px-2 py-1.5 text-center text-xs font-semibold text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        onClick={() => onPrimaryChange(image.id)}
                      >
                        ใช้เป็น Product Anchor หลัก
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
              ? "ภาพหลักจะถูกล็อกเป็น Image 1 ส่วนภาพที่ติ๊กเลือกจะเป็น reference มุมเสริมของ Job นี้เท่านั้น ไม่เปลี่ยนข้อมูลสินค้าเดิม"
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
