import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Eye,
  ChevronDown,
  ChevronUp,
  Copy,
  Merge,
  Lock,
  Settings2,
  Trash2,
  Save,
  Split,
  Unlock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionFlowNode, ProductionSpace } from "@shared/mediaProduction";
import { shotToDraft, type ProductionLocale, type ProductionShotDraft, type VideoShotWorkspaceCallbacks } from "./types";

export interface VideoShotWorkspaceProps extends VideoShotWorkspaceCallbacks {
  space?: ProductionSpace | null;
  selectedShotId?: string | null;
  onBackToProduction: () => void;
  locale?: ProductionLocale;
}

function nodeStatusTone(status: string) {
  if (status === "blocked" || status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "warning" || status === "disabled") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "ready" || status === "approved" || status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function VideoShotWorkspace({
  space,
  selectedShotId,
  onBackToProduction,
  locale,
  onSelectShot,
  onSaveShot,
  onDuplicateShot,
  onSplitShot,
  onToggleShotLock,
  onDeleteShot,
  onReorderShot,
  onMergeShot,
  onConfigureShot,
  onOpenShot,
}: VideoShotWorkspaceProps) {
  const isThai = locale === "th";
  const shots = useMemo(() => [...(space?.shots ?? [])].sort((a, b) => a.order - b.order), [space?.shots]);
  const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? shots[0] ?? null;
  const childNodes = useMemo<ProductionFlowNode[]>(
    () =>
      selectedShot && space
        ? selectedShot.nodeIds
            .map((nodeId) => space.flowNodes.find((node) => node.id === nodeId))
            .filter((node): node is ProductionFlowNode => Boolean(node))
        : [],
    [selectedShot, space],
  );
  const initialDraft = useMemo(() => (selectedShot ? shotToDraft(selectedShot) : null), [selectedShot]);
  const [draft, setDraft] = useState<ProductionShotDraft | null>(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  const updateDraft = (patch: Partial<ProductionShotDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };
  const isDraftStale = Boolean(draft && selectedShot?.version !== undefined && draft.version !== undefined && draft.version < selectedShot.version);

  const handleOpenShot = (shotId: string) => {
    onOpenShot?.(shotId);
    onSelectShot?.(shotId);
  };

  const handleConfigureShot = (shotId: string) => {
    onConfigureShot?.(shotId);
    onSelectShot?.(shotId);
  };

  return (
    <div className="space-y-4" data-testid="video-shot-workspace">
      {!space ? (
        <div className="rounded-lg border bg-white p-4 text-sm text-muted-foreground" data-testid="video-shot-no-project">
          {isThai ? "ยังไม่มี Production Space ให้แก้ไขช็อต" : "No production space is available for shot editing."}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-sky-50 text-sky-700">
              Video Shot
            </Badge>
            <Badge variant="outline">{selectedShot?.status ?? "no-shot"}</Badge>
            {selectedShot?.locked ? <Badge variant="outline">locked</Badge> : null}
          </div>
          <h2 className="mt-2 text-lg font-semibold">{selectedShot?.title ?? (isThai ? "ยังไม่ได้เลือกช็อต" : "No shot selected")}</h2>
          <p className="text-sm text-muted-foreground">
            {isThai ? "แก้ story, cast/product intent, audio และ child node ของแต่ละช็อต" : "Edit shot story, product use, audio intent, and child nodes."}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onBackToProduction}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {isThai ? "กลับ Production" : "Back to Production"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2 rounded-lg border bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">{isThai ? "Shot List" : "Shot List"}</div>
            <Badge variant="outline">{shots.length}</Badge>
          </div>
          {shots.length === 0 ? (
            <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">{isThai ? "ยังไม่มีช็อต" : "No shots yet."}</div>
          ) : (
            shots.map((shot) => {
              const isSelected = selectedShot?.id === shot.id;
              const shotIndex = shots.findIndex((item) => item.id === shot.id);
              return (
                <div
                  key={shot.id}
                  className={`rounded border p-3 ${isSelected ? "border-sky-300 bg-sky-50" : "bg-slate-50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {shot.order}. {shot.title}
                    </span>
                    {shot.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {shot.durationSeconds ?? 0}s · {shot.nodeIds.length} nodes
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => handleOpenShot(shot.id)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "เปิด" : "Open"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleConfigureShot(shot.id)}>
                      <Settings2 className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "กำหนดค่า" : "Configure"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={shot.locked}
                      onClick={() => onDeleteShot?.(shot.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "ลบ" : "Delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!onReorderShot || shotIndex === 0}
                      onClick={() => onReorderShot?.(shot.id, "up")}
                    >
                      <ChevronUp className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "ย้ายขึ้น" : "Move up"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!onReorderShot || shotIndex === shots.length - 1}
                      onClick={() => onReorderShot?.(shot.id, "down")}
                    >
                      <ChevronDown className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "ย้ายลง" : "Move down"}
                    </Button>
                    {onMergeShot ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={shotIndex === shots.length - 1}
                        onClick={() => {
                          const targetShotId = shots[shotIndex + 1]?.id;
                          if (targetShotId) {
                            onMergeShot(shot.id, targetShotId);
                          }
                        }}
                      >
                        <Merge className="mr-1 h-3.5 w-3.5" />
                        {isThai ? "Merge ต่อ" : "Merge next"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-4 rounded-lg border bg-white p-4">
          {draft ? (
            <>
              {isDraftStale ? (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="video-shot-stale-warning">
                  {isThai ? "ช็อตนี้มีเวอร์ชันใหม่กว่า กรุณาโหลดล่าสุดก่อนบันทึก" : "This shot has a newer version. Reload before saving."}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_120px]">
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-title">{isThai ? "ชื่อช็อต" : "Shot title"}</Label>
                  <Input id="shot-title" value={draft.title} disabled={draft.locked} onChange={(event) => updateDraft({ title: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-duration">{isThai ? "วินาที" : "Seconds"}</Label>
                  <Input
                    id="shot-duration"
                    type="number"
                    min={0}
                    value={draft.durationSeconds ?? 0}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ durationSeconds: Number(event.target.value) || 0 })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-status">{isThai ? "สถานะ" : "Status"}</Label>
                  <select
                    id="shot-status"
                    value={draft.status ?? "draft"}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ status: event.target.value as ProductionShotDraft["status"] })}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    {["draft", "ready", "blocked", "approved", "completed"].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-type">{isThai ? "ประเภทช็อต" : "Shot type"}</Label>
                  <select
                    id="shot-type"
                    value={draft.shotType ?? "custom"}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ shotType: event.target.value as ProductionShotDraft["shotType"] })}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    {["hook", "problem", "proof", "demo", "transition", "cta", "broll", "interview", "custom"].map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-journey">{isThai ? "Journey stage" : "Journey stage"}</Label>
                  <Input
                    id="shot-journey"
                    value={draft.customerJourneyStage ?? ""}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ customerJourneyStage: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-source-mode">{isThai ? "Source video mode" : "Source video mode"}</Label>
                  <select
                    id="shot-source-mode"
                    value={draft.sourceVideoControl?.mode ?? "reference_only"}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ sourceVideoControl: { ...(draft.sourceVideoControl ?? {}), mode: event.target.value as NonNullable<ProductionShotDraft["sourceVideoControl"]>["mode"] } })}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    {["reference_only", "first_frame", "last_frame", "clip_segment", "video_to_video"].map((mode) => (
                      <option key={mode} value={mode}>{mode}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-story-beat">{isThai ? "Story beat" : "Story beat"}</Label>
                  <Textarea
                    id="shot-story-beat"
                    value={draft.storyBeat ?? ""}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ storyBeat: event.target.value })}
                    className="min-h-[120px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-camera-intent">{isThai ? "Camera intent" : "Camera intent"}</Label>
                  <Textarea
                    id="shot-camera-intent"
                    value={draft.cameraIntent ?? ""}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ cameraIntent: event.target.value })}
                    className="min-h-[120px]"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-visual-intent">{isThai ? "Visual intent" : "Visual intent"}</Label>
                  <Textarea
                    id="shot-visual-intent"
                    value={draft.visualIntent ?? ""}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ visualIntent: event.target.value })}
                    className="min-h-[120px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-audio-intent">{isThai ? "Audio intent" : "Audio intent"}</Label>
                  <Textarea
                    id="shot-audio-intent"
                    value={draft.audioIntent ?? ""}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ audioIntent: event.target.value })}
                    className="min-h-[120px]"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="shot-script">{isThai ? "Script" : "Script"}</Label>
                <Textarea
                  id="shot-script"
                  value={draft.script ?? ""}
                  disabled={draft.locked}
                  onChange={(event) => updateDraft({ script: event.target.value })}
                  className="min-h-[120px]"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-must-show">{isThai ? "Must show" : "Must show"}</Label>
                  <Textarea
                    id="shot-must-show"
                    value={draft.mustShow.join("\n")}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ mustShow: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })}
                    className="min-h-[92px]"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="shot-must-avoid">{isThai ? "Must avoid" : "Must avoid"}</Label>
                  <Textarea
                    id="shot-must-avoid"
                    value={draft.mustAvoid.join("\n")}
                    disabled={draft.locked}
                    onChange={(event) => updateDraft({ mustAvoid: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })}
                    className="min-h-[92px]"
                  />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-4">
                <Button type="button" onClick={() => onSaveShot?.(draft)} disabled={draft.locked || isDraftStale}>
                  <Save className="mr-2 h-4 w-4" />
                  {isThai ? "Save Shot" : "Save Shot"}
                </Button>
                <Button type="button" variant="outline" onClick={() => onDuplicateShot?.(draft.id)}>
                  <Copy className="mr-2 h-4 w-4" />
                  {isThai ? "Duplicate" : "Duplicate"}
                </Button>
                <Button type="button" variant="outline" onClick={() => onSplitShot?.(draft.id)} disabled={draft.locked}>
                  <Split className="mr-2 h-4 w-4" />
                  {isThai ? "Split" : "Split"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const nextLocked = !draft.locked;
                    updateDraft({ locked: nextLocked });
                    onToggleShotLock?.(draft.id, nextLocked);
                  }}
                >
                  {draft.locked ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
                  {draft.locked ? (isThai ? "Unlock" : "Unlock") : isThai ? "Lock" : "Lock"}
                </Button>
              </div>
              <div className="rounded border border-dashed bg-slate-50 p-3 text-sm">
                <div className="mb-1 font-medium">{isThai ? "สินค้าในช็อต" : "Shot products"}</div>
                <div className="flex flex-wrap gap-2">
                  {draft.productAssetIds.length ? (
                    draft.productAssetIds.map((productAssetId) => (
                      <Badge key={productAssetId} variant="outline" className="rounded bg-white px-2 py-0.5 text-xs">
                        {productAssetId}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {isThai ? "ยังไม่มี product asset สำหรับช็อตนี้" : "No product assets assigned."}
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">{isThai ? "เลือกช็อตเพื่อแก้ไข" : "Select a shot to edit."}</div>
          )}

          <div className="grid gap-2">
            <div className="text-sm font-semibold">{isThai ? "Child Nodes" : "Child Nodes"}</div>
            {childNodes.length === 0 ? (
              <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">{isThai ? "ยังไม่มี child nodes" : "No child nodes for this shot."}</div>
            ) : (
              childNodes.map((node) => (
                <div key={node.id} className="rounded border bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{node.title}</span>
                    <Badge variant="outline" className={nodeStatusTone(node.status)}>
                      {node.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{node.kind}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
