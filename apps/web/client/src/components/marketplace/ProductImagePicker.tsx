import { useState } from "react";

type CaptureAsset = {
  id: string;
  kind: string;
  section?: string | null;
  url: string;
  contentType?: string | null;
  metadataJson?: Record<string, unknown> | null;
};

export interface ProductImageSelection {
  main: string[];
  description: string[];
  review: string[];
  relatedExcluded: string[];
  coverAssetId?: string | null;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function ProductImagePicker({
  assets,
  extraction,
  value,
  onChange,
}: {
  assets: CaptureAsset[];
  extraction: any;
  value: ProductImageSelection;
  onChange: (value: ProductImageSelection) => void;
}) {
  const productImageAssets = assets.filter((asset) => ["main_image", "description_image", "review_image"].includes(String(asset.kind)));
  const candidates = dedupe([
    ...productImageAssets.filter((asset) => String(asset.contentType ?? "").startsWith("image/")).map((asset) => asset.id),
    ...(Array.isArray(extraction?.images?.main) ? extraction.images.main : []),
    ...(Array.isArray(extraction?.images?.description) ? extraction.images.description : []),
    ...(Array.isArray(extraction?.images?.review) ? extraction.images.review : []),
  ]);
  const assetById = new Map(productImageAssets.map((asset) => [asset.id, asset]));

  const setGroup = (id: string, group: keyof ProductImageSelection | "none") => {
    const next: ProductImageSelection = {
      main: value.main.filter((item) => item !== id),
      description: value.description.filter((item) => item !== id),
      review: value.review.filter((item) => item !== id),
      relatedExcluded: value.relatedExcluded.filter((item) => item !== id),
      coverAssetId: value.coverAssetId === id ? null : value.coverAssetId,
    };
    if (group !== "none" && group !== "coverAssetId") {
      next[group] = [...next[group], id];
      if (!next.coverAssetId && group === "main") next.coverAssetId = id;
    }
    onChange(next);
  };

  const currentGroup = (id: string) => value.main.includes(id)
    ? "main"
    : value.description.includes(id)
      ? "description"
      : value.review.includes(id)
        ? "review"
        : value.relatedExcluded.includes(id)
          ? "relatedExcluded"
          : "none";

  const move = (id: string, direction: -1 | 1) => {
    const group = currentGroup(id);
    if (group === "none") return;
    const list = [...value[group]];
    const index = list.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;
    [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
    onChange({ ...value, [group]: list });
  };

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Product Image Picker</h2>
          <p className="text-xs text-slate-500">
            Main {value.main.length} | Description {value.description.length} | Review {value.review.length} | Excluded {value.relatedExcluded.length}
            {value.coverAssetId ? " | System default image selected" : " | No system default image selected"}
          </p>
        </div>
        <button className="rounded-md border bg-white px-2 py-1 text-xs" onClick={() => onChange({ main: [], description: [], review: [], relatedExcluded: dedupe([...value.main, ...value.description, ...value.review, ...value.relatedExcluded]), coverAssetId: null })}>
          Exclude all
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {candidates.map((id) => {
          const asset = assetById.get(id);
          const url = asset?.url ?? id;
          const group = currentGroup(id);
          const isCover = value.coverAssetId === id;
          const isPayloadHero = asset?.metadataJson?.role === "hero";
          return (
            <div key={id} className={`rounded-md border p-3 ${isCover ? "border-emerald-400 bg-emerald-50" : "bg-slate-50"}`}>
              <button className="block w-full" onClick={() => setPreviewUrl(url)}>
                <img src={url} alt="" className="h-36 w-full rounded object-contain" />
              </button>
              {isCover ? (
                <div className="mt-2 rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                  รูปหลักของระบบ / Default image
                </div>
              ) : null}
              {isPayloadHero && !isCover ? (
                <div className="mt-2 rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                  Hero selected from extension
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select className="rounded-md border px-2 py-1 text-xs" value={group} onChange={(e) => setGroup(id, e.target.value as any)}>
                  <option value="none">Excluded</option>
                  <option value="main">Main</option>
                  <option value="description">Description</option>
                  <option value="review">Review</option>
                  <option value="relatedExcluded">Related excluded</option>
                </select>
                <button className="rounded-md border bg-white px-2 py-1 text-xs disabled:opacity-50" disabled={group === "none"} onClick={() => move(id, -1)}>Up</button>
                <button className="rounded-md border bg-white px-2 py-1 text-xs disabled:opacity-50" disabled={group === "none"} onClick={() => move(id, 1)}>Down</button>
                <button
                  className="rounded-md border bg-white px-2 py-1 text-xs disabled:opacity-50"
                  disabled={group === "none"}
                  onClick={() => onChange({ ...value, coverAssetId: id })}
                >
                  {isCover ? "Default image selected" : "Set as default image"}
                </button>
              </div>
              <p className="mt-2 break-all text-xs text-slate-500">{asset ? `${asset.kind} | ${asset.section ?? "general"}` : "remote URL"}</p>
            </div>
          );
        })}
        {candidates.length === 0 ? <p className="text-sm text-slate-500">ไม่มีรูปให้เลือก</p> : null}
      </div>
      {previewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6" onClick={() => setPreviewUrl(null)}>
          <div className="max-h-full max-w-5xl rounded-lg bg-white p-3" onClick={(event) => event.stopPropagation()}>
            <img src={previewUrl} alt="" className="max-h-[78vh] w-full object-contain" />
            <div className="mt-3 flex justify-end">
              <button className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white" onClick={() => setPreviewUrl(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
