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
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
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
/* Background-music (BGM) local state — additive control: attaches an        */
/* optional music track to the whole assembled Production Episode, with      */
/* ducking under dialogue/clip audio. Mirrors the parallel                   */
/* `assembleProductionEpisodes` mutation-input field                         */
/* `bgm?: { url, volumePercent, duckUnderVideoAudio }` (see `handleAssemble` */
/* below for the same "non-literal payload variable" structural-             */
/* assignability note this file's header doc comment already documents for  */
/* `renderOptions`).                                                         */
/* -------------------------------------------------------------------------- */

interface ProductionBgmState {
  enabled: boolean;
  url: string;
  volumePercent: number;
  duckUnderVideoAudio: boolean;
}

const DEFAULT_BGM_OPTIONS: ProductionBgmState = {
  enabled: false,
  url: "",
  volumePercent: 35,
  duckUnderVideoAudio: true,
};

/* -------------------------------------------------------------------------- */
/* End-credits local state — additive control: attaches an optional scrolling */
/* credits roll to the end of the assembled Production Episode. Mirrors the   */
/* parallel `assembleProductionEpisodes` mutation-input field                 */
/* `credits?: { text: string }` (see `handleAssemble` below for the same      */
/* "non-literal payload variable" structural-assignability note this file's  */
/* header doc comment already documents for `renderOptions`/`bgm`).          */
/* -------------------------------------------------------------------------- */

interface ProductionCreditsState {
  enabled: boolean;
  text: string;
}

const DEFAULT_CREDITS_OPTIONS: ProductionCreditsState = {
  enabled: false,
  text: "",
};

/* -------------------------------------------------------------------------- */
/* Timed text overlays local state — additive control: attaches any number of */
/* time-stamped text overlays to the assembled Production Episode. Mirrors    */
/* the parallel `assembleProductionEpisodes` mutation-input field             */
/* `overlays?: Array<{ atSeconds, durationSeconds?, text, style? }>` (see     */
/* `handleAssemble` below for the same "non-literal payload variable"         */
/* structural-assignability note this file's header doc comment already      */
/* documents for `renderOptions`/`bgm`/`credits`) — as of this section's      */
/* authoring, `assembleProductionEpisodes`'s zod input has no `overlays`      */
/* field yet (a parallel backend increment); zod strips unknown keys          */
/* server-side today, so sending it is a harmless no-op until that field      */
/* lands, at which point overlays start working with zero further client      */
/* changes. This panel does not expose a `durationSeconds` control (not part  */
/* of this row's field set) — every row omitted it, which the backend         */
/* field's own optionality already tolerates.                                 */
/* -------------------------------------------------------------------------- */

type ProductionOverlayStyle = "lower_third" | "top_bar" | "centered";

interface ProductionOverlayRow {
  /** Locally-generated stable id (never sent to the server) — used as the
   *  React list key and to target add/update/remove by row rather than by
   *  array index, avoiding input-focus loss when a row in the middle of the
   *  list is removed. Same generation shape as
   *  `VerticalDramaEpisodeWorkspace.tsx`'s own per-row `addCard`
   *  (`card-${Date.now()}-${random}`). */
  id: string;
  atSeconds: number;
  text: string;
  style: ProductionOverlayStyle;
}

interface ProductionOverlaysState {
  enabled: boolean;
  rows: ProductionOverlayRow[];
}

const DEFAULT_OVERLAYS_OPTIONS: ProductionOverlaysState = {
  enabled: false,
  rows: [],
};

const PRODUCTION_OVERLAYS_MAX_ROWS = 50;
const PRODUCTION_OVERLAY_TEXT_MAX_LENGTH = 300;

function makeProductionOverlayRowId(): string {
  return `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function newProductionOverlayRow(): ProductionOverlayRow {
  return {
    id: makeProductionOverlayRowId(),
    atSeconds: 0,
    text: "",
    style: "lower_third",
  };
}

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
  const [bgmOptions, setBgmOptions] = useState<ProductionBgmState>(DEFAULT_BGM_OPTIONS);
  const [creditsOptions, setCreditsOptions] =
    useState<ProductionCreditsState>(DEFAULT_CREDITS_OPTIONS);
  const [overlaysOptions, setOverlaysOptions] =
    useState<ProductionOverlaysState>(DEFAULT_OVERLAYS_OPTIONS);
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

  // Trimmed once and reused both to gate the assemble button below and to
  // decide whether `handleAssemble` includes `bgm` in its payload.
  const trimmedBgmUrl = bgmOptions.url.trim();
  // Same trim-once convention for the end-credits text — reused both to gate
  // the assemble button below and to decide whether `handleAssemble`
  // includes `credits` in its payload.
  const trimmedCreditsText = creditsOptions.text.trim();
  // Filtered + mapped once and reused solely to decide whether
  // `handleAssemble` includes `overlays` in its payload. Unlike
  // `trimmedBgmUrl`/`trimmedCreditsText` above, this is NOT used to gate the
  // assemble button (see `assembleDisabled` below, which intentionally does
  // not factor in overlays) — rows with empty trimmed text are simply
  // dropped rather than treated as a validation error.
  const validOverlayRows = overlaysOptions.rows
    .filter((row) => row.text.trim().length > 0)
    .map((row) => ({
      atSeconds: Number.isFinite(row.atSeconds) ? Math.max(0, row.atSeconds) : 0,
      text: row.text.trim(),
      style: row.style,
    }));

  function handleAssemble() {
    // Built as a standalone variable (not an inline object literal in the
    // `.mutate()` call) so TypeScript's normal structural assignability —
    // not excess-property literal checking — is what applies here: the extra
    // `renderOptions` key is tolerated against today's narrower inferred
    // input type, and this same code starts actually taking effect
    // server-side with zero further client changes once the parallel
    // `renderOptions` backend increment lands (see this file's own header
    // doc comment). `bgm` and `credits` below ride the exact same mechanism:
    // as of this panel's authoring, `assembleProductionEpisodes`'s zod input
    // has no `bgm` or `credits` field yet (parallel backend increments); zod
    // strips unknown keys server-side today, so sending them is a harmless
    // no-op until those fields land, at which point BGM/credits start
    // working with zero further client changes. `overlays` below rides the
    // exact same mechanism (see its own local-state doc comment above).
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
      // Omitted entirely (rather than sent with an empty `url`) unless BGM
      // is toggled on AND a non-empty URL was entered — default behavior
      // (no `bgm` key) stays "no music", matching every pre-existing caller.
      ...(bgmOptions.enabled && trimmedBgmUrl
        ? {
            bgm: {
              url: trimmedBgmUrl,
              volumePercent: bgmOptions.volumePercent,
              duckUnderVideoAudio: bgmOptions.duckUnderVideoAudio,
            },
          }
        : {}),
      // Omitted entirely (rather than sent with empty `text`) unless credits
      // are toggled on AND non-empty text was entered — default behavior (no
      // `credits` key) stays "no end-credits roll", matching every
      // pre-existing caller.
      ...(creditsOptions.enabled && trimmedCreditsText
        ? { credits: { text: trimmedCreditsText } }
        : {}),
      // Omitted entirely unless overlays are toggled on AND at least one row
      // has non-empty trimmed text — rows with empty text are simply
      // dropped (see `validOverlayRows` above); default behavior (no
      // `overlays` key) stays "no timed overlays", matching every
      // pre-existing caller.
      ...(overlaysOptions.enabled && validOverlayRows.length > 0
        ? { overlays: validOverlayRows }
        : {}),
    };
    assembleMutation.mutate(payload);
  }

  const controlsDisabled = assembleMutation.isPending || hasInFlightGroups;
  // BGM is toggled on but no URL was entered yet — block the mutate call
  // instead of sending an empty `url` (see `handleAssemble` above); the BGM
  // section itself also surfaces this as an inline hint next to the field.
  const bgmUrlMissing = bgmOptions.enabled && trimmedBgmUrl.length === 0;
  // Same gate for credits: toggled on but no text was entered yet — block
  // the mutate call instead of sending empty `text` (see `handleAssemble`
  // above); the credits section itself also surfaces this as an inline hint
  // next to the field.
  const creditsMissing = creditsOptions.enabled && trimmedCreditsText.length === 0;
  const assembleDisabled = controlsDisabled || bgmUrlMissing || creditsMissing;

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
            : 'A Production Episode groups several already-compiled "Sub-Episodes" (today\'s ~9-shot Sub-episodes) into one 4–10 minute video for public/social release. Choose whether to group every 5 or 10 Sub-Episodes.'}
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

            <VerticalDramaProductionBgmSection
              lang={lang}
              value={bgmOptions}
              onChange={setBgmOptions}
              disabled={controlsDisabled}
            />

            <VerticalDramaProductionCreditsSection
              lang={lang}
              value={creditsOptions}
              onChange={setCreditsOptions}
              disabled={controlsDisabled}
            />

            <VerticalDramaProductionOverlaysSection
              lang={lang}
              value={overlaysOptions}
              onChange={setOverlaysOptions}
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
              disabled={assembleDisabled}
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
                ? 'ตอนเต็ม (Production Episode) จะนำวิดีโอที่ "ประกอบ" (compiled) เสร็จแล้วของตอนย่อยหลาย ๆ ตอนมาต่อกันเป็นวิดีโอเดียว ก่อนสร้างตอนเต็ม ต้องมีตอนย่อยที่ประกอบวิดีโอเสร็จอย่างน้อย 1 ตอนก่อน (ดูที่แท็บ "ตอนย่อย")'
                : 'A Production Episode concatenates several Sub-Episodes\' own compiled videos into one video. You need at least one Sub-Episode with a completed compiled video before you can assemble a Production Episode — see the "Sub-episodes" tab.'}
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
/* Background-music (BGM) section — additive control that sits alongside     */
/* `VerticalDramaProductionRenderOptionsSection` above (same local           */
/* `value`/`onChange`/`disabled` prop shape, same card/label/checkbox        */
/* styling) so it reads as a natural continuation of the render-options      */
/* section rather than a bolted-on control. `handleAssemble`                 */
/* (`VerticalDramaProductionEpisodesPanel` above) only sends `bgm` in the    */
/* mutate payload when `value.enabled` is true AND the URL is non-empty      */
/* after trimming — this section mirrors that same gate as an inline hint    */
/* next to the URL field so the user sees why the assemble button is         */
/* disabled instead of a silently-ignored empty `url`.                       */
/* -------------------------------------------------------------------------- */

function VerticalDramaProductionBgmSection({
  lang,
  value,
  onChange,
  disabled = false,
}: {
  lang: VerticalDramaLang;
  value: ProductionBgmState;
  onChange: (next: ProductionBgmState) => void;
  disabled?: boolean;
}) {
  function emit(patch: Partial<ProductionBgmState>) {
    onChange({ ...value, ...patch });
  }

  const trimmedUrl = value.url.trim();
  const urlMissing = value.enabled && trimmedUrl.length === 0;

  return (
    <section
      className="space-y-3 rounded-lg border bg-card p-3"
      aria-label={lang === "th" ? "เพลงประกอบ" : "Background music"}
      data-testid="vd-production-bgm-section"
    >
      <div>
        <h3 className="text-sm font-medium">
          {lang === "th" ? "เพลงประกอบ (Background music)" : "Background music"}
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {lang === "th"
            ? "เพิ่มเพลงประกอบให้ตอนเต็ม (Production Episode) ที่ประกอบขึ้น พร้อมหลบเสียงพูดอัตโนมัติ"
            : "Attaches background music to the assembled Production Episode, with automatic ducking under dialogue."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="vd-production-bgm-enabled"
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(checked) => emit({ enabled: checked === true })}
          data-testid="vd-production-bgm-enabled"
        />
        <label htmlFor="vd-production-bgm-enabled" className="text-sm">
          {lang === "th" ? "ใส่เพลงประกอบ" : "Add background music"}
        </label>
      </div>

      {value.enabled ? (
        <div className="space-y-3 pl-6">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="vd-production-bgm-url"
              className="text-xs font-medium text-muted-foreground"
            >
              {lang === "th" ? "ลิงก์เพลง (mp3/wav)" : "Music URL (mp3/wav)"}
            </label>
            <Input
              id="vd-production-bgm-url"
              placeholder="https://…/track.mp3"
              value={value.url}
              disabled={disabled}
              onChange={(e) => emit({ url: e.target.value })}
              data-testid="vd-production-bgm-url"
            />
            <p className="text-[11px] text-muted-foreground">
              {lang === "th"
                ? "ต้องเป็นลิงก์ไฟล์เสียงสาธารณะที่เข้าถึงได้ (mp3 หรือ wav)"
                : "Expects a public, reachable audio file URL (mp3 or wav)."}
            </p>
            {urlMissing ? (
              <p
                className="text-xs font-medium text-destructive"
                role="alert"
                data-testid="vd-production-bgm-url-required-hint"
              >
                {lang === "th"
                  ? "กรอกลิงก์เพลงก่อนสร้าง Production Episodes"
                  : "Enter a music URL before assembling Production Episodes."}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {lang === "th" ? "ความดังเพลง (%)" : "Music volume (%)"}
              </span>
              <span className="text-xs text-muted-foreground">{value.volumePercent}%</span>
            </div>
            <Slider
              min={1}
              max={100}
              step={1}
              value={[value.volumePercent]}
              disabled={disabled}
              onValueChange={([v]) => emit({ volumePercent: v ?? value.volumePercent })}
              aria-label={lang === "th" ? "ความดังเพลง" : "Music volume"}
              data-testid="vd-production-bgm-volume"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="vd-production-bgm-duck"
                checked={value.duckUnderVideoAudio}
                disabled={disabled}
                onCheckedChange={(checked) => emit({ duckUnderVideoAudio: checked === true })}
                data-testid="vd-production-bgm-duck"
              />
              <label htmlFor="vd-production-bgm-duck" className="text-sm">
                {lang === "th" ? "หลบเสียงพูดอัตโนมัติ (ducking)" : "Auto-duck under speech"}
              </label>
            </div>
            <p className="pl-6 text-[11px] text-muted-foreground">
              {lang === "th"
                ? "ลดเสียงเพลงลงเองตอนมีคนพูดหรือมีเสียงในคลิป"
                : "Lowers music when there's dialogue or clip audio."}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* End-credits section — sits alongside `VerticalDramaProductionBgmSection`   */
/* above (same local `value`/`onChange`/`disabled` prop shape, same          */
/* card/label/checkbox styling) so it reads as a natural continuation of the */
/* render-options/BGM sections rather than a bolted-on control.              */
/* `handleAssemble` (`VerticalDramaProductionEpisodesPanel` above) only      */
/* sends `credits` in the mutate payload when `value.enabled` is true AND    */
/* the text is non-empty after trimming — this section mirrors that same    */
/* gate as an inline hint next to the textarea so the user sees why the      */
/* assemble button is disabled instead of a silently-ignored empty `text`.   */
/* -------------------------------------------------------------------------- */

const PRODUCTION_CREDITS_MAX_LENGTH = 4000;

function VerticalDramaProductionCreditsSection({
  lang,
  value,
  onChange,
  disabled = false,
}: {
  lang: VerticalDramaLang;
  value: ProductionCreditsState;
  onChange: (next: ProductionCreditsState) => void;
  disabled?: boolean;
}) {
  function emit(patch: Partial<ProductionCreditsState>) {
    onChange({ ...value, ...patch });
  }

  const trimmedText = value.text.trim();
  const textMissing = value.enabled && trimmedText.length === 0;

  return (
    <section
      className="space-y-3 rounded-lg border bg-card p-3"
      aria-label={lang === "th" ? "เครดิต / ทีมงาน" : "Credits"}
      data-testid="vd-production-credits-section"
    >
      <div>
        <h3 className="text-sm font-medium">
          {lang === "th" ? "เครดิต / ทีมงาน (Credits)" : "Credits"}
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {lang === "th"
            ? "แสดงเป็นเครดิตเลื่อนช่วงท้ายวิดีโอ Production Episode"
            : "Shown as a scrolling credits roll at the end of the Production Episode."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="vd-production-credits-enabled"
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(checked) => emit({ enabled: checked === true })}
          data-testid="vd-production-credits-enabled"
        />
        <label htmlFor="vd-production-credits-enabled" className="text-sm">
          {lang === "th" ? "ใส่เครดิตท้ายตอน" : "Add end credits"}
        </label>
      </div>

      {value.enabled ? (
        <div className="space-y-1.5 pl-6">
          <label
            htmlFor="vd-production-credits-text"
            className="text-xs font-medium text-muted-foreground"
          >
            {lang === "th" ? "เครดิต (บรรทัดละ 1 รายการ)" : "Credits (one line each)"}
          </label>
          <Textarea
            id="vd-production-credits-text"
            value={value.text}
            disabled={disabled}
            rows={5}
            maxLength={PRODUCTION_CREDITS_MAX_LENGTH}
            placeholder={
              lang === "th" ? "กำกับ: ...\nนักพากย์: ..." : "Director: ...\nVoice cast: ..."
            }
            onChange={(e) => emit({ text: e.target.value })}
            data-testid="vd-production-credits-text"
          />
          <p className="text-[11px] text-muted-foreground">
            {value.text.length}/{PRODUCTION_CREDITS_MAX_LENGTH}
          </p>
          {textMissing ? (
            <p
              className="text-xs font-medium text-destructive"
              role="alert"
              data-testid="vd-production-credits-text-required-hint"
            >
              {lang === "th"
                ? "กรอกข้อความเครดิตก่อนสร้าง Production Episodes"
                : "Enter credits text before assembling Production Episodes."}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Timed text overlays section — sits alongside                              */
/* `VerticalDramaProductionCreditsSection` above (same local                 */
/* `value`/`onChange`/`disabled` prop shape, same card/label/checkbox        */
/* styling) so it reads as a natural continuation of the render-options/     */
/* BGM/credits sections rather than a bolted-on control. Unlike those        */
/* sections, `handleAssemble` (`VerticalDramaProductionEpisodesPanel` above) */
/* never blocks the assemble button over this section's contents — rows      */
/* with empty trimmed text are simply dropped from the payload (see          */
/* `validOverlayRows` above), so there is no "required" hint here the way    */
/* BGM/credits have one.                                                     */
/* -------------------------------------------------------------------------- */

function VerticalDramaProductionOverlaysSection({
  lang,
  value,
  onChange,
  disabled = false,
}: {
  lang: VerticalDramaLang;
  value: ProductionOverlaysState;
  onChange: (next: ProductionOverlaysState) => void;
  disabled?: boolean;
}) {
  function emit(patch: Partial<ProductionOverlaysState>) {
    onChange({ ...value, ...patch });
  }

  function updateRow(id: string, patch: Partial<ProductionOverlayRow>) {
    emit({
      rows: value.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  }

  function addRow() {
    if (value.rows.length >= PRODUCTION_OVERLAYS_MAX_ROWS) return;
    emit({ rows: [...value.rows, newProductionOverlayRow()] });
  }

  function removeRow(id: string) {
    emit({ rows: value.rows.filter((row) => row.id !== id) });
  }

  const canAddRow = value.rows.length < PRODUCTION_OVERLAYS_MAX_ROWS;

  return (
    <section
      className="space-y-3 rounded-lg border bg-card p-3"
      aria-label={lang === "th" ? "ข้อความซ้อนตามเวลา" : "Timed text overlays"}
      data-testid="vd-production-overlays-section"
    >
      <div>
        <h3 className="text-sm font-medium">
          {lang === "th" ? "ข้อความซ้อน (Timed overlays)" : "Timed text overlays"}
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {lang === "th"
            ? "เพิ่มข้อความซ้อนตามเวลาที่กำหนดเอง ซ้อนทับวิดีโอ Production Episode ที่ประกอบขึ้น"
            : "Adds timed text overlays burned into the assembled Production Episode at the seconds you choose."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="vd-production-overlays-enabled"
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(checked) => emit({ enabled: checked === true })}
          data-testid="vd-production-overlays-enabled"
        />
        <label htmlFor="vd-production-overlays-enabled" className="text-sm">
          {lang === "th" ? "ใส่ข้อความซ้อนตามเวลา" : "Add timed overlays"}
        </label>
      </div>

      {value.enabled ? (
        <div
          className="space-y-2 rounded-md border p-2 pl-6"
          data-testid="vd-production-overlay-rows"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {lang === "th"
                ? `รายการ (${value.rows.length}/${PRODUCTION_OVERLAYS_MAX_ROWS})`
                : `Rows (${value.rows.length}/${PRODUCTION_OVERLAYS_MAX_ROWS})`}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || !canAddRow}
              onClick={addRow}
              data-testid="vd-production-overlay-add"
            >
              {lang === "th" ? "+ เพิ่มข้อความ" : "+ Add overlay"}
            </Button>
          </div>

          {value.rows.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {lang === "th"
                ? "ยังไม่มีข้อความซ้อน — กด “+ เพิ่มข้อความ” เพื่อเริ่มต้น"
                : "No overlays yet — click “+ Add overlay” to start."}
            </p>
          ) : (
            <div className="space-y-2">
              {value.rows.map((row, index) => (
                <div
                  key={row.id}
                  className="space-y-2 rounded-md border p-2"
                  data-testid={`vd-production-overlay-row-${index}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {lang === "th" ? "วินาที" : "At (sec)"}
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="h-8 w-20"
                        value={row.atSeconds}
                        disabled={disabled}
                        onChange={(e) =>
                          updateRow(row.id, { atSeconds: Number(e.target.value) })
                        }
                        data-testid={`vd-production-overlay-at-${index}`}
                      />
                    </label>
                    <label className="flex min-w-[160px] flex-1 items-center gap-1 text-[11px] text-muted-foreground">
                      {lang === "th" ? "ข้อความ" : "Text"}
                      <Input
                        type="text"
                        className="h-8 flex-1"
                        maxLength={PRODUCTION_OVERLAY_TEXT_MAX_LENGTH}
                        value={row.text}
                        disabled={disabled}
                        placeholder={lang === "th" ? "ข้อความที่จะซ้อน" : "Overlay text"}
                        onChange={(e) => updateRow(row.id, { text: e.target.value })}
                        data-testid={`vd-production-overlay-text-${index}`}
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {lang === "th" ? "รูปแบบ" : "Style"}
                      <Select
                        value={row.style}
                        disabled={disabled}
                        onValueChange={(v) =>
                          updateRow(row.id, { style: v as ProductionOverlayStyle })
                        }
                      >
                        <SelectTrigger
                          className="h-8 w-[140px]"
                          data-testid={`vd-production-overlay-style-${index}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lower_third">
                            {lang === "th" ? "แถบล่าง" : "Lower third"}
                          </SelectItem>
                          <SelectItem value="top_bar">
                            {lang === "th" ? "แถบบน" : "Top bar"}
                          </SelectItem>
                          <SelectItem value="centered">
                            {lang === "th" ? "กลางจอ" : "Centered"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={disabled}
                      onClick={() => removeRow(row.id)}
                      aria-label={lang === "th" ? "ลบข้อความซ้อนนี้" : "Remove this overlay"}
                      data-testid={`vd-production-overlay-remove-${index}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
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
