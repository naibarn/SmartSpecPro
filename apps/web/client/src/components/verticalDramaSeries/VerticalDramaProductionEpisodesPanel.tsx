/**
 * VerticalDramaProductionEpisodesPanel (Phase D′-1,
 * `planning/vertical-drama-production-episodes/plan.md`) — the PUBLIC
 * deliverable surface for a Vertical Drama series, distinct from the
 * per-Sub-Episode workspace (`VerticalDramaEpisodeWorkspace.tsx`).
 *
 * MODEL (see `memory/project_vd_episode_terminology.md` + the plan doc):
 *  - "Sub-Episode" (ตอนย่อย) = today's "ตอน"/EP N — a `vertical_drama_episodes`
 *    row, ~9 shots, one short compiled video
 *    (`episode.assemblyManifest.compiledVideo.videoUrl`).
 *  - "Production Episode" (ตอนเต็ม / ตอนสำหรับเผยแพร่) = a GROUP of 5 or 10
 *    CONSECUTIVE Sub-Episodes' own compiled videos, concatenated into ONE
 *    4–10 minute video — the actual publishable unit for public/social
 *    release. Group size is user-selectable per assemble call.
 * This panel labels both terms explicitly throughout so a user coming from
 * the Sub-Episode workspace is never confused about which surface they are
 * on.
 *
 * Render-options LEVEL (plan.md "Render-options LEVEL" section, added
 * 2026-07-13): the public deliverable is the Production Episode, so the
 * render STYLING options (subtitle preset + font size, age badge,
 * include-dialogue-audio + loudness) are set ONCE here — this is the
 * AUTHORITATIVE public styling, distinct from the Sub-Episode workspace's own
 * Phase-A options section (`VerticalDramaFinalRenderOptionsSection`,
 * `VerticalDramaEpisodeWorkspace.tsx`), which remains an internal preview
 * render only. That section is NOT exported (private to that file), so this
 * panel MIRRORS its control set + reuses its exact copy source
 * (`vdCopy(lang)` / `VD_FINAL_RENDER_SUBTITLE_PRESET_IDS` /
 * `VD_FINAL_RENDER_SUBTITLE_FONT_SIZE_IDS` from `verticalDramaWorkspaceCopy.ts`)
 * rather than duplicating the label strings — same "duplicate small
 * per-surface JSX, share the copy source" convention this feature already
 * establishes (see `VerticalDramaLocationStockPanel.tsx`'s own doc comment).
 *
 * BACKEND NOTE (as of this panel's authoring): `assembleProductionEpisodes`'s
 * zod input is currently `{ seriesId, groupSize, allowPartial? }` — the
 * `renderOptions` field referenced by plan.md's "Render-options LEVEL"
 * section has NOT landed on this mutation yet (a parallel increment). This
 * panel already SENDS `renderOptions` in its mutate payload (via a
 * non-literal `payload` variable, so TypeScript's structural assignability —
 * not excess-property literal checking — allows the extra key against
 * today's narrower inferred input type); zod silently strips unknown keys
 * server-side today, so this is a harmless no-op until that field lands, at
 * which point this panel starts working with zero further client changes.
 *
 * Assembly is in-process fire-and-forget server-side (see
 * `assembleProductionEpisodesForSeries`'s own header doc comment,
 * `server/services/verticalDramaProductionEpisodeAssembly.ts`): the mutation
 * response's `manifest` may still show newly-created groups as `"pending"`;
 * this panel polls `verticalDramaSeries.get` (5s interval) while any group is
 * `"pending"`, same convention as `VerticalDramaSeriesTrailerPanel.tsx`'s own
 * `getTrailerStatus` polling.
 *
 * The compact compiled-video player (play/download/fullscreen) mirrors
 * `VerticalDramaSeriesDetailPage.tsx`'s own `EpisodeCompiledVideoPlayer`
 * pattern byte-for-byte (that component is private/unexported, so it is
 * re-implemented here rather than imported — same "duplicate, don't couple
 * surfaces" convention referenced above).
 */

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Download,
  Expand,
  Loader2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import {
  useVerticalDramaLang,
  type VerticalDramaLang,
} from "@/components/verticalDramaSeries/verticalDramaCopy";
import {
  VD_FINAL_RENDER_SUBTITLE_FONT_SIZE_IDS,
  VD_FINAL_RENDER_SUBTITLE_PRESET_IDS,
  vdCopy,
  vdFinalRenderSubtitleFontSizeLabel,
  vdFinalRenderSubtitlePresetLabel,
  type VdFinalRenderSubtitleFontSizeValue,
  type VdFinalRenderSubtitlePresetValue,
} from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";
import type {
  VerticalDramaProductionEpisodeGroupState,
  VerticalDramaProductionEpisodesManifest,
} from "@shared/verticalDramaSeries/assembly";

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported for direct unit testing — this feature's                                      */
/* established convention for extracted pure helpers, see e.g.                */
/* `VerticalDramaLocationStockPanel.guessLocationImageMimeTypeFromUrl.test.ts`).*/
/* -------------------------------------------------------------------------- */

/**
 * Formats a Production Episode group's member Sub-Episode numbers as a
 * compact range label: a single number ("3") when the group has exactly one
 * member, or "first–last" ("3–7") for a contiguous run of several.
 * `subEpisodeNumbers` always arrives already in playback/ascending order
 * (`chunkSubEpisodesIntoGroups`,
 * `server/services/verticalDramaProductionEpisodeAssembly.ts`), so only the
 * first/last elements are read — no sort/dedupe here. Returns `""` for an
 * empty array (defensive; should not occur for a real persisted group).
 */
export function formatSubEpisodeRangeLabel(subEpisodeNumbers: number[]): string {
  if (subEpisodeNumbers.length === 0) return "";
  const first = subEpisodeNumbers[0];
  const last = subEpisodeNumbers[subEpisodeNumbers.length - 1];
  return first === last ? String(first) : `${first}–${last}`;
}

/** `mm:ss` formatting for a group's `durationSeconds` — same rounding rule as
 *  the display already used elsewhere for compiled-video durations. */
function formatDurationLabel(durationSeconds: number): string {
  const total = Math.max(0, Math.round(durationSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function productionEpisodeTitle(
  lang: VerticalDramaLang,
  index: number,
  subEpisodeNumbers: number[],
): string {
  const range = formatSubEpisodeRangeLabel(subEpisodeNumbers);
  return lang === "th"
    ? `Production Episode ${index + 1} · ตอนย่อย ${range}`
    : `Production Episode ${index + 1} · Sub-Episodes ${range}`;
}

/* -------------------------------------------------------------------------- */
/* Render-options local state (mirrors `VerticalDramaFinalRenderOptionsView`, */
/* `VerticalDramaEpisodeWorkspace.tsx` — see this file's own header doc       */
/* comment for why it is not imported/reused directly).                      */
/* -------------------------------------------------------------------------- */

interface ProductionRenderOptionsState {
  subtitlePreset: VdFinalRenderSubtitlePresetValue;
  subtitleFontSize: VdFinalRenderSubtitleFontSizeValue;
  showAgeBadge: boolean;
  includeDialogueAudio: boolean;
  loudnessNormalize: boolean;
}

const DEFAULT_RENDER_OPTIONS: ProductionRenderOptionsState = {
  subtitlePreset: "classic_box",
  subtitleFontSize: "medium",
  showAgeBadge: false,
  includeDialogueAudio: false,
  loudnessNormalize: false,
};

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaProductionEpisodesPanelProps {
  seriesId: string;
  readOnly?: boolean;
}

export function VerticalDramaProductionEpisodesPanel({
  seriesId,
  readOnly = false,
}: VerticalDramaProductionEpisodesPanelProps) {
  const lang = useVerticalDramaLang();
  const t = useMemo(() => vdCopy(lang), [lang]);
  // Same direct `useTenantFeatureFlag` gate convention as
  // `VerticalDramaSeriesDetailPage.tsx`'s own `EpisodesTab` component (which
  // resolves its season-render dialog's own flags itself rather than
  // requiring the parent page to thread them through) — this panel's own
  // prop contract stays exactly `{ seriesId, readOnly }`.
  const voiceChainEnabled = useTenantFeatureFlag("verticalDramaSeriesVoiceChain");
  const utils = trpc.useUtils();

  const [groupSize, setGroupSize] = useState<5 | 10>(10);
  const [renderOptions, setRenderOptions] = useState<ProductionRenderOptionsState>(
    DEFAULT_RENDER_OPTIONS,
  );
  const [lastResult, setLastResult] = useState<{
    groupsCreated: number;
    groupsSkipped: number;
  } | null>(null);

  // Self-contained query (same base procedure the page itself already reads
  // `productionEpisodesManifest` off of) — polls every 5s while any group is
  // `"pending"` (in-process fire-and-forget assembly, see this file's own
  // header doc comment), same convention as
  // `VerticalDramaSeriesTrailerPanel.tsx`'s `getTrailerStatus` polling.
  const detailQuery = trpc.verticalDramaSeries.get.useQuery(
    { seriesId },
    {
      enabled: Boolean(seriesId),
      staleTime: 30_000,
      refetchInterval: (query) => {
        const data = query.state.data as
          | {
              series?: {
                productionEpisodesManifest?: VerticalDramaProductionEpisodesManifest | null;
              };
            }
          | undefined;
        const hasPending =
          data?.series?.productionEpisodesManifest?.episodes?.some(
            (group) => group.status === "pending",
          ) ?? false;
        return hasPending ? 5000 : false;
      },
    },
  );

  const series = detailQuery.data?.series as
    | { productionEpisodesManifest?: VerticalDramaProductionEpisodesManifest | null }
    | undefined;
  const manifest = series?.productionEpisodesManifest ?? null;
  const groups = manifest?.episodes ?? [];
  const hasInFlightGroups = groups.some((group) => group.status === "pending");

  const assembleMutation = trpc.verticalDramaSeries.assembleProductionEpisodes.useMutation({
    onSuccess: (data: { groupsCreated: number; groupsSkipped: number }) => {
      setLastResult({ groupsCreated: data.groupsCreated, groupsSkipped: data.groupsSkipped });
      if (data.groupsCreated === 0) {
        toast.warning(
          lang === "th"
            ? "ไม่มีกลุ่มใหม่ให้สร้าง (อาจสร้างครบแล้ว หรือยังไม่มีตอนย่อยที่ประกอบวิดีโอเสร็จเพียงพอ)"
            : "No new groups were created (either everything is already up to date, or there aren't enough compiled Sub-Episodes yet).",
        );
      } else {
        toast.success(
          lang === "th"
            ? `กำลังประกอบ Production Episode ${data.groupsCreated} ชุด`
            : `Assembling ${data.groupsCreated} Production Episode(s)`,
        );
      }
      void utils.verticalDramaSeries.get.invalidate();
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message ||
          (lang === "th"
            ? "สร้าง Production Episodes ไม่สำเร็จ"
            : "Failed to assemble Production Episodes"),
      );
    },
  });

  function handleAssemble() {
    // Built as a standalone variable (not an inline object literal in the
    // `.mutate()` call) so TypeScript's normal structural assignability —
    // not excess-property literal checking — is what applies here: the extra
    // `renderOptions` key is tolerated against today's narrower inferred
    // input type, and this same code starts actually taking effect
    // server-side with zero further client changes once the parallel
    // `renderOptions` backend increment lands (see this file's own header
    // doc comment).
    const payload = {
      seriesId,
      groupSize,
      renderOptions: {
        subtitlePreset: renderOptions.subtitlePreset,
        subtitleFontSize: renderOptions.subtitleFontSize,
        showAgeBadge: renderOptions.showAgeBadge,
        // Belt-and-suspenders re-check mirroring `EpisodesTab`'s own
        // `handleConfirmSeasonRender` — the checkbox itself only ever
        // renders while `voiceChainEnabled` is true (JSX below).
        includeDialogueAudio: voiceChainEnabled && renderOptions.includeDialogueAudio,
        loudnessNormalize: renderOptions.loudnessNormalize,
      },
    };
    assembleMutation.mutate(payload);
  }

  const controlsDisabled = assembleMutation.isPending || hasInFlightGroups;

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" data-testid="vd-production-episodes-loading">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data?.series) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {lang === "th"
            ? "โหลดข้อมูล Production Episodes ไม่สำเร็จ"
            : "Failed to load Production Episodes."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="vd-production-episodes-panel">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">
          {lang === "th" ? "ตอนเต็ม (Production Episodes)" : "Production Episodes"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {lang === "th"
            ? 'ตอนเต็ม คือการนำ "ตอนย่อย" (ตอน ~9 ช็อตที่ประกอบวิดีโอเสร็จแล้ว) หลายตอนมาต่อกันเป็นวิดีโอเดียวยาว 4–10 นาที สำหรับเผยแพร่สู่สาธารณะ/โซเชียล — เลือกได้ว่าจะรวมทีละ 5 หรือ 10 ตอนย่อย'
            : 'A Production Episode groups several already-compiled "Sub-Episodes" (today\'s ~9-shot episodes) into one 4–10 minute video for public/social release. Choose whether to group every 5 or 10 Sub-Episodes.'}
        </p>
      </div>

      {!readOnly ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {lang === "th" ? "สร้าง Production Episodes ใหม่" : "Assemble new Production Episodes"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5 sm:max-w-xs">
              <Label
                htmlFor="vd-production-group-size"
                className="text-xs font-medium text-muted-foreground"
              >
                {lang === "th" ? "จำนวนตอนย่อยต่อ 1 ตอนเต็ม" : "Sub-Episodes per Production Episode"}
              </Label>
              <Select
                value={String(groupSize)}
                onValueChange={(v) => setGroupSize(v === "5" ? 5 : 10)}
                disabled={controlsDisabled}
              >
                <SelectTrigger id="vd-production-group-size" data-testid="vd-production-group-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">{lang === "th" ? "5 ตอนย่อย" : "5 sub-episodes"}</SelectItem>
                  <SelectItem value="10">{lang === "th" ? "10 ตอนย่อย" : "10 sub-episodes"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <VerticalDramaProductionRenderOptionsSection
              lang={lang}
              t={t}
              voiceChainEnabled={voiceChainEnabled}
              value={renderOptions}
              onChange={setRenderOptions}
              disabled={controlsDisabled}
            />

            {lastResult ? (
              <p className="text-xs text-muted-foreground" data-testid="vd-production-assemble-result">
                {lang === "th"
                  ? `ส่งสร้างใหม่ ${lastResult.groupsCreated} ชุด · ข้าม (มีอยู่แล้ว) ${lastResult.groupsSkipped} ชุด`
                  : `${lastResult.groupsCreated} new group(s) submitted · ${lastResult.groupsSkipped} already up to date`}
              </p>
            ) : null}

            {hasInFlightGroups ? (
              <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                {lang === "th"
                  ? "กำลังประกอบ Production Episode อยู่ — รอให้เสร็จก่อนจึงจะสร้างชุดใหม่ได้"
                  : "A Production Episode is still being assembled — wait for it to finish before starting a new batch."}
              </p>
            ) : null}

            <Button
              type="button"
              className="gap-2"
              onClick={handleAssemble}
              disabled={controlsDisabled}
              data-testid="vd-production-assemble-button"
            >
              {controlsDisabled ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Clapperboard className="h-4 w-4" aria-hidden="true" />
              )}
              {lang === "th" ? "สร้าง Production Episodes" : "Assemble Production Episodes"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {groups.length > 0 ? (
        <ul className="space-y-3">
          {groups.map((group) => (
            <li key={group.index}>
              <ProductionEpisodeCard lang={lang} group={group} />
            </li>
          ))}
        </ul>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm font-medium">
              {lang === "th" ? "ยังไม่มีตอนเต็ม (Production Episodes)" : "No Production Episodes yet"}
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              {lang === "th"
                ? 'ตอนเต็ม (Production Episode) จะนำวิดีโอที่ "ประกอบ" (compiled) เสร็จแล้วของตอนย่อยหลาย ๆ ตอนมาต่อกันเป็นวิดีโอเดียว ก่อนสร้างตอนเต็ม ต้องมีตอนย่อยที่ประกอบวิดีโอเสร็จอย่างน้อย 1 ตอนก่อน (ดูที่แท็บ "ตอน")'
                : 'A Production Episode concatenates several Sub-Episodes\' own compiled videos into one video. You need at least one Sub-Episode with a completed compiled video before you can assemble a Production Episode — see the "Episodes" tab.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Render-options section — mirrors `VerticalDramaFinalRenderOptionsSection`  */
/* (`VerticalDramaEpisodeWorkspace.tsx`, private/unexported there) using the  */
/* SAME copy source (`vdCopy(lang)` + the subtitle preset/font-size id lists  */
/* + label helpers from `verticalDramaWorkspaceCopy.ts`) so the labels are    */
/* byte-identical to the Sub-Episode workspace's own Phase-A options.         */
/* -------------------------------------------------------------------------- */

function VerticalDramaProductionRenderOptionsSection({
  lang,
  t,
  voiceChainEnabled,
  value,
  onChange,
  disabled = false,
}: {
  lang: VerticalDramaLang;
  t: ReturnType<typeof vdCopy>;
  voiceChainEnabled: boolean;
  value: ProductionRenderOptionsState;
  onChange: (next: ProductionRenderOptionsState) => void;
  disabled?: boolean;
}) {
  function emit(patch: Partial<ProductionRenderOptionsState>) {
    onChange({ ...value, ...patch });
  }

  return (
    <section
      className="space-y-3 rounded-lg border bg-card p-3"
      aria-label={t.finalRenderOptionsTitle}
      data-testid="vd-production-render-options-section"
    >
      <div>
        <h3 className="text-sm font-medium">{t.finalRenderOptionsTitle}</h3>
        <p className="text-[11px] text-muted-foreground">
          {lang === "th"
            ? "ตัวเลือกนี้ใช้กับวิดีโอทุกตอนย่อยในกลุ่มนี้ตอนประกอบเป็นตอนเต็ม — เป็นค่าที่ใช้จริงสำหรับเผยแพร่สู่สาธารณะ (ต่างจากตัวเลือกในหน้าตอนย่อยซึ่งเป็นแค่พรีวิวภายใน)"
            : "These options apply to every Sub-Episode in the group when assembled into this Production Episode — this is the authoritative public-render styling (the Sub-Episode page's own options are an internal preview only)."}
        </p>
      </div>

      {voiceChainEnabled ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="vd-production-render-include-audio"
              checked={value.includeDialogueAudio}
              disabled={disabled}
              onCheckedChange={(checked) => emit({ includeDialogueAudio: checked === true })}
              data-testid="vd-production-render-include-audio"
            />
            <label htmlFor="vd-production-render-include-audio" className="text-sm">
              {t.finalRenderIncludeDialogueAudioLabel}
            </label>
          </div>
          <div className="flex items-center gap-2 pl-6">
            <Checkbox
              id="vd-production-render-loudness-normalize"
              checked={value.loudnessNormalize}
              disabled={disabled || !value.includeDialogueAudio}
              onCheckedChange={(checked) => emit({ loudnessNormalize: checked === true })}
              data-testid="vd-production-render-loudness-normalize"
            />
            <label
              htmlFor="vd-production-render-loudness-normalize"
              className="text-sm text-muted-foreground"
            >
              {t.finalRenderLoudnessNormalizeLabel}
            </label>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="vd-production-render-subtitle-preset"
          className="text-xs font-medium text-muted-foreground"
        >
          {t.finalRenderSubtitlePresetLabel}
        </label>
        <Select
          value={value.subtitlePreset}
          onValueChange={(v) => emit({ subtitlePreset: v as VdFinalRenderSubtitlePresetValue })}
          disabled={disabled}
        >
          <SelectTrigger
            id="vd-production-render-subtitle-preset"
            data-testid="vd-production-render-subtitle-preset"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t.finalRenderSubtitlePresetNone}</SelectItem>
            {VD_FINAL_RENDER_SUBTITLE_PRESET_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {vdFinalRenderSubtitlePresetLabel(id, lang)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="vd-production-render-subtitle-font-size"
          className="text-xs font-medium text-muted-foreground"
        >
          {t.finalRenderSubtitleFontSizeLabel}
        </label>
        <Select
          value={value.subtitleFontSize}
          disabled={disabled || value.subtitlePreset === "none"}
          onValueChange={(v) =>
            emit({ subtitleFontSize: v as VdFinalRenderSubtitleFontSizeValue })
          }
        >
          <SelectTrigger
            id="vd-production-render-subtitle-font-size"
            data-testid="vd-production-render-subtitle-font-size"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VD_FINAL_RENDER_SUBTITLE_FONT_SIZE_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {vdFinalRenderSubtitleFontSizeLabel(id, lang)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id="vd-production-render-show-age-badge"
            checked={value.showAgeBadge}
            disabled={disabled}
            onCheckedChange={(checked) => emit({ showAgeBadge: checked === true })}
            data-testid="vd-production-render-show-age-badge"
          />
          <label htmlFor="vd-production-render-show-age-badge" className="text-sm">
            {t.finalRenderShowAgeBadgeLabel}
          </label>
        </div>
        <p className="pl-6 text-[11px] text-muted-foreground">{t.finalRenderShowAgeBadgeHelp}</p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Group card + status pill + video player                                   */
/* -------------------------------------------------------------------------- */

function ProductionEpisodeStatusPill({
  lang,
  status,
}: {
  lang: VerticalDramaLang;
  status: VerticalDramaProductionEpisodeGroupState["status"];
}) {
  if (status === "completed") {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        {lang === "th" ? "เสร็จสมบูรณ์" : "Completed"}
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {lang === "th" ? "ล้มเหลว" : "Failed"}
      </Badge>
    );
  }
  // "pending" covers both "not started yet" and "currently running" — the
  // in-process fire-and-forget assembler processes groups sequentially in
  // the background and this manifest has no separate "running" state (see
  // this file's own header doc comment).
  return (
    <Badge variant="outline" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      {lang === "th" ? "กำลังประกอบ…" : "Assembling…"}
    </Badge>
  );
}

function ProductionEpisodeCard({
  lang,
  group,
}: {
  lang: VerticalDramaLang;
  group: VerticalDramaProductionEpisodeGroupState;
}) {
  const title = productionEpisodeTitle(lang, group.index, group.subEpisodeNumbers);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{title}</p>
          <ProductionEpisodeStatusPill lang={lang} status={group.status} />
        </div>

        {group.status === "failed" && group.error ? (
          <p className="text-xs font-medium text-destructive" role="alert">
            {group.error}
          </p>
        ) : null}

        {group.status === "completed" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {typeof group.durationSeconds === "number" ? (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {formatDurationLabel(group.durationSeconds)}
              </Badge>
            ) : null}
            {group.assembledAt ? (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {lang === "th" ? "สร้างเมื่อ " : "Created "}
                {new Date(group.assembledAt).toLocaleString(lang === "th" ? "th-TH" : "en-US")}
              </Badge>
            ) : null}
          </div>
        ) : null}

        {group.status === "completed" && group.videoUrl ? (
          <VerticalDramaProductionEpisodeVideoPlayer lang={lang} title={title} videoUrl={group.videoUrl} />
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Compact compiled-video player — mirrors
 * `VerticalDramaSeriesDetailPage.tsx`'s own `EpisodeCompiledVideoPlayer`
 * (private/unexported there, so re-implemented here rather than imported;
 * see this file's own header doc comment). Same icons/copy/behavior:
 * `Download` for the download action, `Expand` for the explicit fullscreen
 * action, same `<video controls>` element + `requestFullscreen` /
 * `webkitEnterFullscreen` (iOS Safari) fallback.
 */
function VerticalDramaProductionEpisodeVideoPlayer({
  lang,
  title,
  videoUrl,
}: {
  lang: VerticalDramaLang;
  title: string;
  videoUrl: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (typeof video.requestFullscreen === "function") {
      void video.requestFullscreen();
      return;
    }
    // iOS Safari has no standard `Element.requestFullscreen`; its <video>
    // elements expose this vendor-prefixed method instead.
    const iosVideo = video as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    };
    if (typeof iosVideo.webkitEnterFullscreen === "function") {
      iosVideo.webkitEnterFullscreen();
    }
  };

  return (
    <div className="border-t border-border pt-3">
      <div className="mx-auto w-36 max-w-full overflow-hidden rounded-md border border-border bg-black sm:mx-0">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          preload="none"
          className="aspect-[9/16] max-h-[40vh] w-full bg-black"
          aria-label={lang === "th" ? `วิดีโอ ${title}` : `${title} video`}
          data-testid="vd-production-episode-video-player"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <a
            href={videoUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            aria-label={lang === "th" ? `ดาวน์โหลด ${title}` : `Download ${title}`}
            data-testid="vd-production-episode-video-download"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {lang === "th" ? "ดาวน์โหลด" : "Download"}
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleFullscreen}
          aria-label={lang === "th" ? `เปิด ${title} แบบเต็มจอ` : `Open ${title} fullscreen`}
          data-testid="vd-production-episode-video-fullscreen"
        >
          <Expand className="h-3.5 w-3.5" aria-hidden="true" />
          {lang === "th" ? "เต็มจอ" : "Fullscreen"}
        </Button>
      </div>
    </div>
  );
}

export default VerticalDramaProductionEpisodesPanel;
