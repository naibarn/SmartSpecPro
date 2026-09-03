import { ImageIcon, Loader2, Pencil, Video } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ShotBrollTransform } from "@shared/verticalDramaSeries/visualSource";

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
  origin: "source_pack" | "episode_footage";
  durationSeconds: number | null;
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
  transform: ShotBrollTransform;
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
  onUpdateBinding?: (
    binding: VerticalDramaShotBrollBinding,
    patch: {
      fitMode?: string;
      inSeconds?: number | null;
      outSeconds?: number | null;
      displayDurationSeconds?: number | null;
      transform?: ShotBrollTransform;
    },
  ) => void;
}

function sourceKey(source: VerticalDramaShotBrollSource, segment?: VerticalDramaShotBrollSegment) {
  return `${source.slotId}:${segment?.segmentId ?? "still"}`;
}

const defaultBrollTransform: ShotBrollTransform = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotationDeg: 0,
  opacity: 1,
};

function parseNumberInput(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function BrollTransformEditor({
  binding,
  source,
  onCommit,
  disabled,
  language,
}: {
  binding: VerticalDramaShotBrollBinding;
  source?: VerticalDramaShotBrollSource;
  onCommit: (patch: {
    fitMode?: string;
    inSeconds?: number | null;
    outSeconds?: number | null;
    displayDurationSeconds?: number | null;
    transform?: ShotBrollTransform;
  }) => void;
  disabled: boolean;
  language: boolean;
}) {
  const [transform, setTransform] = React.useState<ShotBrollTransform>({
    ...defaultBrollTransform,
    ...(binding.transform ?? {}),
  });
  const [fitMode, setFitMode] = React.useState(binding.fitMode || "cover");
  const [inSeconds, setInSeconds] = React.useState(binding.inSeconds ?? 0);
  const [outSeconds, setOutSeconds] = React.useState(
    binding.outSeconds ?? source?.durationSeconds ?? 3,
  );
  const [displayDurationSeconds, setDisplayDurationSeconds] = React.useState(
    binding.displayDurationSeconds ?? 3,
  );

  React.useEffect(() => {
    setTransform({ ...defaultBrollTransform, ...(binding.transform ?? {}) });
    setFitMode(binding.fitMode || "cover");
    setInSeconds(binding.inSeconds ?? 0);
    setOutSeconds(binding.outSeconds ?? source?.durationSeconds ?? 3);
    setDisplayDurationSeconds(binding.displayDurationSeconds ?? 3);
  }, [binding, source?.durationSeconds]);

  const commit = () => {
    const safeInSeconds = Number.isFinite(inSeconds) ? Math.max(0, inSeconds) : 0;
    const safeOutSeconds = Number.isFinite(outSeconds)
      ? Math.max(safeInSeconds + 0.05, outSeconds)
      : Math.max(safeInSeconds + 0.05, source?.durationSeconds ?? 3);
    const clean = {
      x: Number.isFinite(transform.x) ? transform.x : 0,
      y: Number.isFinite(transform.y) ? transform.y : 0,
      width: Number.isFinite(transform.width) ? Math.max(0.01, transform.width) : 100,
      height: Number.isFinite(transform.height) ? Math.max(0.01, transform.height) : 100,
      rotationDeg: Number.isFinite(transform.rotationDeg) ? transform.rotationDeg : 0,
      opacity: Number.isFinite(transform.opacity)
        ? Math.min(1, Math.max(0, transform.opacity))
        : 1,
    } satisfies ShotBrollTransform;
    setTransform(clean);
    onCommit({
      fitMode,
      transform: clean,
      ...(binding.mediaType === "video"
        ? { inSeconds: safeInSeconds, outSeconds: safeOutSeconds }
        : {
            displayDurationSeconds: Number.isFinite(displayDurationSeconds)
              ? Math.max(0.05, displayDurationSeconds)
              : 3,
          }),
    });
  };

  const numberField = (
    key: keyof ShotBrollTransform,
    label: string,
    step = 1,
  ) => (
    <label className="grid gap-0.5 text-[10px] text-muted-foreground">
      <span>{label}</span>
      <input
        type="number"
        value={transform[key]}
        min={key === "opacity" ? 0 : undefined}
        max={key === "opacity" ? 1 : undefined}
        step={step}
        disabled={disabled}
        onChange={event =>
          setTransform(current => ({ ...current, [key]: parseNumberInput(event.target.value) }))
        }
        onBlur={commit}
        className="h-7 w-full rounded border border-input bg-background px-1.5 text-xs text-foreground"
      />
    </label>
  );

  return (
    <fieldset className="grid gap-2 rounded border border-sky-200 bg-sky-50/40 p-2">
      <legend className="px-1 text-[11px] font-medium text-sky-800">
        {language ? "ปรับขนาด ตำแหน่ง และเวลา" : "Size, position and timing"}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {numberField("x", "X (%)")}
        {numberField("y", "Y (%)")}
        {numberField("width", language ? "กว้าง (%)" : "Width (%)")}
        {numberField("height", language ? "สูง (%)" : "Height (%)")}
        {numberField("rotationDeg", language ? "หมุน (องศา)" : "Rotation (deg)")}
        {numberField("opacity", language ? "ทึบแสง (0–1)" : "Opacity (0–1)", 0.05)}
      </div>
      <label className="grid gap-0.5 text-[10px] text-muted-foreground">
        <span>{language ? "วิธีวางภาพ" : "Fit mode"}</span>
        <select
          value={fitMode}
          disabled={disabled}
          onChange={event => {
            setFitMode(event.target.value);
            onCommit({ fitMode: event.target.value, transform });
          }}
          className="h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground"
        >
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
          <option value="crop_safe">Crop safe</option>
        </select>
      </label>
      {binding.mediaType === "video" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-0.5 text-[10px] text-muted-foreground">
            <span>{language ? "เริ่มต้นวิดีโอ (วินาที)" : "Video in (sec)"}</span>
            <input type="number" min="0" step="0.01" value={inSeconds} disabled={disabled} onChange={event => setInSeconds(parseNumberInput(event.target.value))} onBlur={commit} className="h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground" />
          </label>
          <label className="grid gap-0.5 text-[10px] text-muted-foreground">
            <span>{language ? "สิ้นสุดวิดีโอ (วินาที)" : "Video out (sec)"}</span>
            <input type="number" min="0.05" step="0.01" value={outSeconds} disabled={disabled} onChange={event => setOutSeconds(parseNumberInput(event.target.value))} onBlur={commit} className="h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground" />
          </label>
        </div>
      ) : (
        <label className="grid gap-0.5 text-[10px] text-muted-foreground">
          <span>{language ? "ระยะเวลาแสดงภาพ (วินาที)" : "Still duration (sec)"}</span>
          <input type="number" min="0.05" step="0.05" value={displayDurationSeconds} disabled={disabled} onChange={event => setDisplayDurationSeconds(parseNumberInput(event.target.value))} onBlur={commit} className="h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground" />
        </label>
      )}
    </fieldset>
  );
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
  onUpdateBinding,
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
      const readySegments = source.segments
        .filter(segment => segment.status === "ready")
        .map(segment => ({ source, segment, key: sourceKey(source, segment) }));
      if (readySegments.length > 0) return readySegments;
      if (source.origin === "episode_footage" && source.mediaUrl) {
        return [{ source, key: sourceKey(source) }];
      }
      return [];
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
          {language ? "เพิ่มภาพหรือวิดีโอ B-roll ได้ทุกช็อต แม้เรื่องย่อจะไม่ได้กล่าวถึง" : "Add image or video B-roll to any shot, even when the story does not mention it."}
        </p>
      ) : null}

      <div className="grid gap-2">
        {bindings.map(binding => {
          const matchingSource = sources.find(source => source.mediaAssetId === binding.mediaAssetId);
          return (
            <div key={binding.bindingId} className="grid gap-2 rounded border bg-background p-2">
              <div className="flex items-center gap-2">
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
              {onUpdateBinding ? (
                <BrollTransformEditor
                  binding={binding}
                  source={matchingSource}
                  onCommit={patch => onUpdateBinding(binding, patch)}
                  disabled={saving}
                  language={language}
                />
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
        <p className="text-xs text-amber-700">{language ? "ยังไม่มีสื่อ B-roll ในคลังที่พร้อมใช้ — สามารถเพิ่ม footage จริงจาก Idea ได้เมื่อมีการเลือกไว้" : "No source-pack B-roll is ready yet. Selected Idea footage can also be added when available."}</p>
      )}
    </section>
  );
}
