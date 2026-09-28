import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Film, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  episodeAssemblyTimelineSchema,
  validateEpisodeAssemblyTimeline,
  type EpisodeAssemblyFootageBlock,
  type EpisodeAssemblyTimeline,
} from "@shared/verticalDramaSeries/episodeAssemblyTimeline";

export interface VerticalDramaEpisodeAssemblyTimelineSourceView {
  mediaAssetId: number;
  title: string;
  description?: string | null;
  mediaUrl: string;
  durationSeconds: number | null;
  origin: "source_pack" | "episode_footage";
}

export interface VerticalDramaEpisodeAssemblyTimelineProps {
  timeline?: EpisodeAssemblyTimeline | null;
  sources: VerticalDramaEpisodeAssemblyTimelineSourceView[];
  loading?: boolean;
  saving?: boolean;
  error?: string | null;
  onSave?: (timeline: EpisodeAssemblyTimeline) => void;
}

function createBlock(
  source: VerticalDramaEpisodeAssemblyTimelineSourceView,
  index: number,
): EpisodeAssemblyFootageBlock | null {
  if (source.durationSeconds == null || source.durationSeconds <= 0) return null;
  const durationMs = Math.max(1, Math.round(source.durationSeconds * 1000));
  return {
    blockId: `footage-${source.mediaAssetId}-${Date.now()}-${index}`,
    mediaAssetId: source.mediaAssetId,
    title: source.title,
    sourceInMs: 0,
    sourceOutMs: durationMs,
    fitMode: "cover",
    audioPolicy: "keep",
  };
}

function totalDurationMs(
  blocks: readonly EpisodeAssemblyFootageBlock[],
): number {
  return blocks.reduce(
    (sum, block) => sum + Math.max(0, block.sourceOutMs - block.sourceInMs),
    0,
  );
}

function secondsLabel(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

export function VerticalDramaEpisodeAssemblyTimeline({
  timeline,
  sources,
  loading = false,
  saving = false,
  error = null,
  onSave,
}: VerticalDramaEpisodeAssemblyTimelineProps) {
  const [draft, setDraft] = useState<EpisodeAssemblyTimeline | null>(
    timeline ?? null,
  );

  useEffect(() => {
    setDraft(timeline ?? null);
  }, [timeline?.revision, timeline?.updatedAt]);

  const sourceById = useMemo(
    () => new Map(sources.map(source => [source.mediaAssetId, source])),
    [sources],
  );
  const validation = useMemo(() => {
    if (!draft) {
      return { valid: false, issues: [], totalFootageDurationMs: 0 };
    }
    return validateEpisodeAssemblyTimeline(
      draft,
      sources.map(source => ({
        mediaAssetId: source.mediaAssetId,
        durationMs:
          source.durationSeconds == null
            ? null
            : Math.round(source.durationSeconds * 1000),
        title: source.title,
      })),
    );
  }, [draft, sources]);

  if (loading && !draft) {
    return (
      <section className="rounded-xl border border-border/70 bg-background/60 p-3 text-xs text-muted-foreground">
        กำลังโหลด timeline footage…
      </section>
    );
  }
  if (!draft) return null;

  const updateDraft = (
    updater: (current: EpisodeAssemblyTimeline) => EpisodeAssemblyTimeline,
  ) => setDraft(current => (current ? updater(current) : current));

  const addSource = (mediaAssetId: number) => {
    const source = sourceById.get(mediaAssetId);
    if (!source) return;
    const block = createBlock(source, draft.footage.length);
    if (!block) return;
    const oldTotal = totalDurationMs(draft.footage);
    const newTotal = oldTotal + (block.sourceOutMs - block.sourceInMs);
    updateDraft(current => ({
      ...current,
      footage: [...current.footage, block],
      insertAtMs: current.insertAtMs === oldTotal ? newTotal : current.insertAtMs,
    }));
  };

  const removeBlock = (blockId: string) => {
    updateDraft(current => {
      const footage = current.footage.filter(block => block.blockId !== blockId);
      return {
        ...current,
        footage,
        insertAtMs: Math.min(current.insertAtMs, totalDurationMs(footage)),
      };
    });
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    updateDraft(current => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.footage.length) return current;
      const footage = current.footage.slice();
      [footage[index], footage[nextIndex]] = [footage[nextIndex], footage[index]];
      return { ...current, footage };
    });
  };

  const patchBlock = (
    blockId: string,
    patch: Partial<EpisodeAssemblyFootageBlock>,
  ) => {
    updateDraft(current => ({
      ...current,
      footage: current.footage.map(block =>
        block.blockId === blockId ? { ...block, ...patch } : block,
      ),
    }));
  };

  const canSave = validation.valid && !saving;

  return (
    <section
      className="rounded-xl border border-sky-300/70 bg-sky-50/40 p-3 dark:bg-sky-950/10"
      data-testid="vd-episode-assembly-timeline"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Film className="h-4 w-4 text-sky-600" aria-hidden="true" />
            Timeline footage ก่อน/หลัง compound 9 ช็อต
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            ระบบจะเล่น footage ก่อนจุดแทรก แล้วเล่น 9 ช็อต จากนั้นเล่น footage ที่เหลือต่อ
            โดยใช้ช่วง trim ที่กำหนดส่งให้ Worker ตัดแบบไม่แก้ไฟล์ต้นฉบับ
          </p>
        </div>
        <Badge variant="outline">แก้ไขได้ · revision {draft.revision}</Badge>
      </div>

      <div className="mt-3 grid gap-2 rounded-lg border border-border/70 bg-background/70 p-2 md:grid-cols-[1fr_auto_auto] md:items-end">
        <label className="text-xs">
          เพิ่ม footage
          <select
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value=""
            onChange={event => {
              const value = Number(event.target.value);
              if (value > 0) addSource(value);
            }}
            disabled={saving || sources.length === 0}
            data-testid="vd-assembly-timeline-add-source"
          >
            <option value="">เลือก footage ที่ต้องการเพิ่ม…</option>
            {sources.map(source => (
              <option
                key={source.mediaAssetId}
                value={source.mediaAssetId}
              >
                {source.title} ({source.durationSeconds?.toFixed(1) ?? "?"}s)
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          จุดแทรก compound (วินาที)
          <Input
            className="mt-1 h-9 w-32"
            type="number"
            min={0}
            max={validation.totalFootageDurationMs / 1000}
            step={0.1}
            value={(draft.insertAtMs / 1000).toFixed(1)}
            onChange={event =>
              updateDraft(current => ({
                ...current,
                insertAtMs: Math.max(
                  0,
                  Math.round(Number(event.target.value || 0) * 1000),
                ),
              }))
            }
            data-testid="vd-assembly-timeline-insert-at"
          />
        </label>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            const parsed = episodeAssemblyTimelineSchema.safeParse(draft);
            if (parsed.success) onSave?.(parsed.data);
          }}
          disabled={!canSave || !onSave}
          data-testid="vd-assembly-timeline-save"
        >
          <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {saving ? "กำลังบันทึก…" : "บันทึก timeline"}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>Footage รวมหลัง trim: {secondsLabel(validation.totalFootageDurationMs)}</span>
        <span>•</span>
        <span>9 ช็อตจะแทรกที่ {secondsLabel(draft.insertAtMs)}</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {draft.footage.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            ยังไม่มี footage ภายนอก — ระบบจะ render compound 9 ช็อตตาม flow เดิม
          </p>
        ) : (
          draft.footage.map((block, index) => {
            const source = sourceById.get(block.mediaAssetId);
            return (
              <article
                key={block.blockId}
                className="rounded-lg border border-border bg-background p-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {index + 1}. {block.title ?? source?.title ?? `Media ${block.mediaAssetId}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      source {secondsLabel(block.sourceInMs)} – {secondsLabel(block.sourceOutMs)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => moveBlock(index, -1)}
                      disabled={index === 0 || saving}
                      aria-label="เลื่อน footage ขึ้น"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => moveBlock(index, 1)}
                      disabled={index === draft.footage.length - 1 || saving}
                      aria-label="เลื่อน footage ลง"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeBlock(block.blockId)}
                      disabled={saving}
                      aria-label="ลบ footage"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <label className="text-[10px] text-muted-foreground">
                    เริ่ม (วินาที)
                    <Input
                      className="mt-1 h-8 text-xs"
                      type="number"
                      min={0}
                      step={0.1}
                      value={(block.sourceInMs / 1000).toFixed(1)}
                      onChange={event =>
                        patchBlock(block.blockId, {
                          sourceInMs: Math.max(
                            0,
                            Math.round(Number(event.target.value || 0) * 1000),
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="text-[10px] text-muted-foreground">
                    จบ (วินาที)
                    <Input
                      className="mt-1 h-8 text-xs"
                      type="number"
                      min={0}
                      step={0.1}
                      value={(block.sourceOutMs / 1000).toFixed(1)}
                      onChange={event =>
                        patchBlock(block.blockId, {
                          sourceOutMs: Math.max(
                            1,
                            Math.round(Number(event.target.value || 0) * 1000),
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="text-[10px] text-muted-foreground">
                    เสียง footage
                    <select
                      className="mt-1 flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      value={block.audioPolicy}
                      onChange={event =>
                        patchBlock(block.blockId, {
                          audioPolicy: event.target.value as "keep" | "mute",
                        })
                      }
                    >
                      <option value="keep">เก็บเสียง</option>
                      <option value="mute">ปิดเสียง</option>
                    </select>
                  </label>
                </div>
              </article>
            );
          })
        )}
      </div>

      {validation.issues.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-[11px] text-amber-700 dark:text-amber-400">
          {validation.issues.map(issue => (
            <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Plus className="h-3 w-3" aria-hidden="true" />
        ระบบไม่ตัดหรือแก้ไฟล์ต้นฉบับ การแก้ไขทั้งหมดเป็น non-destructive trim และส่งงานหนักให้ Worker
      </p>
    </section>
  );
}
