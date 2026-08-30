import { ImageIcon, Loader2, Pencil, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type VerticalDramaShotBrollSegment = {
  segmentId: string;
  revision: number;
  mediaType: "image" | "video";
  inSeconds: number | null;
  outSeconds: number | null;
  displayDurationSeconds: number | null;
  label: string;
  description: string | null;
  status: "draft" | "ready" | "stale" | "blocked";
};

export type VerticalDramaShotBrollSource = {
  slotId: string;
  slotKey: string;
  title: string;
  description: string | null;
  semanticRole: "b_roll_still" | "b_roll_footage";
  mediaType: "image" | "video";
  mediaAssetId: number | null;
  sourceAssetId: number | null;
  mediaUrl: string | null;
  segments: VerticalDramaShotBrollSegment[];
  rightsStatus: string;
  disclosureStatus: string;
};

export type VerticalDramaShotBrollBinding = {
  bindingId: string;
  shotNumber: number;
  order: number;
  fitMode: string;
  active: boolean;
  status: string;
  mediaType: "image" | "video";
  mediaAssetId: number | null;
  sourceAssetId: number | null;
  sourceSlotId: number | null;
  segmentId: string | null;
  inSeconds: number | null;
  outSeconds: number | null;
  displayDurationSeconds: number | null;
  audioPolicy: string;
  labelMode: string;
  mediaUrl: string | null;
  title: string | null;
};

export interface VerticalDramaShotBrollPanelProps {
  shotNumber: number;
  bindings: VerticalDramaShotBrollBinding[];
  sources: VerticalDramaShotBrollSource[];
  visible?: boolean;
  saving?: boolean;
  locale?: "th" | "en";
  onSelectSource: (
    source: VerticalDramaShotBrollSource,
    segment?: VerticalDramaShotBrollSegment,
    existing?: VerticalDramaShotBrollBinding,
  ) => void;
  onRemove?: (binding: VerticalDramaShotBrollBinding) => void;
}

function sourceKey(source: VerticalDramaShotBrollSource, segment?: VerticalDramaShotBrollSegment) {
  return `${source.slotId}:${segment?.segmentId ?? "still"}`;
}

export function VerticalDramaShotBrollPanel({
  shotNumber,
  bindings,
  sources,
  visible = true,
  saving = false,
  locale = "th",
  onSelectSource,
  onRemove,
}: VerticalDramaShotBrollPanelProps) {
  if (!visible) return null;
  const language = locale === "th";
  type SourceOption = {
    source: VerticalDramaShotBrollSource;
    segment?: VerticalDramaShotBrollSegment;
    key: string;
  };
  const sourceOptions: SourceOption[] = sources.filter(source =>
    Boolean(source.mediaUrl) &&
    (source.rightsStatus === "creator_owned" || source.rightsStatus === "licensed" ||
      (source.rightsStatus === "restricted" && source.disclosureStatus === "shown"))
  ).flatMap<SourceOption>(source => {
    if (source.mediaType === "video") {
      return source.segments
        .filter(segment => segment.status === "ready")
        .map(segment => ({ source, segment, key: sourceKey(source, segment) }));
    }
    return [{ source, key: sourceKey(source) }];
  });

  return (
    <section className="grid gap-2 rounded-md border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-900 dark:bg-sky-950/20" aria-label={language ? `สื่อ B-roll ของช็อต ${shotNumber}` : `B-roll for shot ${shotNumber}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <ImageIcon className="h-4 w-4 text-sky-600" aria-hidden="true" />
            {language ? "สื่อ B-roll ของช็อตนี้" : "Shot B-roll media"}
          </h4>
          <p className="text-[11px] text-muted-foreground">
            {language ? "สื่อจะถูกซ้อนบนช็อตตามเวลาที่ระบบคำนวณจากคลิปจริง และเปลี่ยนได้ภายหลัง" : "Media is overlaid using the measured clip timeline and can be changed later."}
          </p>
        </div>
        {saving ? <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-label={language ? "กำลังบันทึก" : "Saving"} /> : null}
      </div>

      {bindings.length === 0 ? (
        <p className="rounded border border-dashed border-sky-300 bg-background/70 p-2 text-xs text-muted-foreground">
          {language ? "ช็อตนี้มีคำอธิบายที่ต้องใช้ภาพ/วิดีโอประกอบ แต่ยังไม่ได้เลือกสื่อ" : "This shot calls for supporting media, but no B-roll is selected yet."}
        </p>
      ) : null}

      <div className="grid gap-2">
        {bindings.map(binding => {
          const matchingSource = sources.find(source => source.mediaAssetId === binding.mediaAssetId);
          return (
            <div key={binding.bindingId} className="flex items-center gap-2 rounded border bg-background p-2">
              {binding.mediaUrl && binding.mediaType === "video" ? (
                <video src={binding.mediaUrl} className="h-12 w-9 rounded object-cover" muted preload="metadata" aria-label={binding.title ?? "B-roll video"} />
              ) : binding.mediaUrl ? (
                <img src={binding.mediaUrl} alt={binding.title ?? "B-roll"} className="h-12 w-9 rounded object-cover" />
              ) : (
                <span className="flex h-12 w-9 items-center justify-center rounded bg-muted" aria-hidden="true">
                  {binding.mediaType === "video" ? <Video className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{binding.title ?? matchingSource?.title ?? (language ? "สื่อ B-roll" : "B-roll media")}</div>
                <div className="text-[10px] text-muted-foreground">
                  {binding.mediaType === "video" && binding.inSeconds != null && binding.outSeconds != null
                    ? `${language ? "ช่วงต้นฉบับ" : "Source"} ${binding.inSeconds.toFixed(2)}–${binding.outSeconds.toFixed(2)}s`
                    : `${language ? "ภาพนิ่ง" : "Still"} ${binding.displayDurationSeconds ?? 3}s`}
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">{binding.mediaType === "video" ? "B-roll video" : "B-roll image"}</Badge>
              {sourceOptions.length > 0 ? (
                <select
                  className="h-7 max-w-28 rounded border border-input bg-background px-1 text-[10px]"
                  value=""
                  disabled={saving}
                  onChange={event => {
                    const option = sourceOptions.find(item => item.key === event.target.value);
                    if (option) onSelectSource(option.source, option.segment, binding);
                  }}
                  aria-label={language ? `เปลี่ยนสื่อ B-roll รายการ ${binding.title ?? binding.bindingId}` : `Change B-roll ${binding.title ?? binding.bindingId}`}
                >
                  <option value="">{language ? "เปลี่ยน" : "Change"}</option>
                  {sourceOptions.map(option => (
                    <option key={option.key} value={option.key}>{option.source.title}{option.segment ? ` — ${option.segment.label}` : ""}</option>
                  ))}
                </select>
              ) : null}
              {onRemove ? (
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => onRemove(binding)} disabled={saving} aria-label={language ? "นำสื่อออก" : "Remove media"}>×</Button>
              ) : null}
            </div>
          );
        })}
      </div>

      {bindings.length === 0 && sourceOptions.length > 0 ? (
        <label className="grid gap-1 text-xs font-medium">
          <span className="flex items-center gap-1"><Pencil className="h-3 w-3" aria-hidden="true" />{language ? "เลือกหรือเปลี่ยนสื่อ" : "Choose or change media"}</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            value=""
            disabled={saving}
            onChange={event => {
              const option = sourceOptions.find(item => item.key === event.target.value);
              if (option) onSelectSource(option.source, option.segment, bindings[0]);
            }}
            aria-label={language ? "เลือกสื่อ B-roll" : "Choose B-roll media"}
          >
            <option value="">{language ? "เลือกสื่อ…" : "Choose media…"}</option>
            {sourceOptions.map(option => (
              <option key={option.key} value={option.key}>
                {option.source.title}{option.segment ? ` — ${option.segment.label}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-xs text-amber-700">{language ? "ยังไม่มีสื่อ B-roll ที่พร้อมใช้งานใน source pack" : "No ready B-roll media is available in the source pack."}</p>
      )}
    </section>
  );
}
