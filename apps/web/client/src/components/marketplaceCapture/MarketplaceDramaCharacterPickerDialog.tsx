/**
 * MarketplaceDramaCharacterPickerDialog — Marketplace Auto Review
 * two-character-conversation feature (planning/marketplace-two-character-
 * conversation/plan.md §3.7/§3.8), Wave 3 frontend.
 *
 * Lets the user pick up to `maxSelectable` characters from one of their
 * existing Vertical Drama series so the Marketplace Auto Review conversation
 * uses the characters' real story names instead of an anonymous uploaded
 * photo. Two-step flow: (1) pick a series (auto-picked when there is exactly
 * one), (2) pick characters from that series' roster — a character with no
 * portrait, and no "look"/variant with a portrait either, is shown disabled
 * with a short explanatory note, since the paid render has nothing to
 * reference for it.
 *
 * Data shaping note: `listDramaCharactersForPicker` already returns each
 * character's "looks" (outfit/age-stage variants) NESTED under their parent
 * character — unlike `VerticalDramaStoryboardPanel`'s per-shot reference
 * picker, which has to re-group a FLAT `characterPortraits` record via
 * `buildShotCharacterReferencePickerGroups`. Since this procedure's output is
 * already in the nested shape that grouping function produces, calling it
 * here would mean flattening this data back down just to re-nest it —
 * strictly loses information for no benefit. This component instead renders
 * the already-nested shape directly, matching that function's OUTPUT
 * contract (base character + a per-character "look" selector) rather than
 * its input. `VerticalDramaReferenceFrameDialog` (the sibling multi-select
 * dialog) was also considered, but its two-step "select → generate a NEW
 * prompt/image via an LLM call → confirm paid render" flow doesn't fit here
 * at all — this dialog only needs to select existing, already-generated
 * portraits, never generate anything.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ReferenceManifestItem } from "./StagedCheckpointReviewPanel";
import { MARKETPLACE_CHARACTER_DESCRIPTOR_MAX } from "@shared/hyperframes/characterCast";

// Mirrors `DramaSeriesCharacterLookForPicker` / `DramaSeriesCharacterForPicker`
// (server/services/verticalDramaExtensionReadService.ts) exactly. The
// `listDramaCharactersForPicker` procedure is declared `.output(z.any())`
// server-side, so the trpc client can't infer this shape — duplicated here
// rather than imported (that service module lives under `server/`).
interface DramaCharacterLook {
  characterId: string;
  variantLabel: string | null;
  variantType: string | null;
  portraitUrl: string | null;
  portraitAssetId: string | null;
}

interface DramaCharacter {
  characterId: string;
  characterKey: string;
  name: string;
  role: string | null;
  narrativeRole: string | null;
  roleTier: string | null;
  occupation: string | null;
  description: string | null;
  ageRange: string | null;
  portraitUrl: string | null;
  portraitAssetId: string | null;
  hasPortrait: boolean;
  looks: DramaCharacterLook[];
}

interface DramaCharactersForPickerResponse {
  seriesId: string;
  seriesTitle: string;
  characters: DramaCharacter[];
}

type PickerSelection = {
  /** The VD row this selection RENDERS as — the look's own row when a look is
   *  chosen, so the manifest keeps the variant's identity
   *  (`planning/marketplace-four-character-cast/plan.md` §4). This used to
   *  always be the base character id, which is why a per-shot look switcher
   *  had nothing to switch between. */
  characterId: string;
  /** The look family's root. Equal to `characterId` for a base pick. */
  baseCharacterId: string;
  /** The look's own label, when a look was chosen. */
  variantLabel?: string;
  name: string;
  ageRange: string | null;
  /** Who this person IS — occupation / narrative role / description, joined.
   *  The planner needs this or the story is generic with a name attached. */
  descriptor?: string;
  /** `true` only when the series data says so — never guessed from a photo. */
  depictsMinor?: boolean;
  portraitUrl: string;
  portraitAssetId: string | null;
};

/**
 * Seed the minor-safety fact from the series' own `ageRange` text.
 *
 * Returns `undefined` — meaning "not stated" — for anything it cannot read
 * confidently, because silence and "adult" must stay distinguishable
 * downstream (`project_marketplace_minor_safety_qa_grounding`). The user can
 * always override it in the cast card; this only saves them a click on the
 * obvious cases.
 */
export function inferDepictsMinorFromAgeRange(
  ageRange: string | null | undefined
): boolean | undefined {
  const text = (ageRange ?? "").trim().toLowerCase();
  if (!text) return undefined;
  if (/(เด็ก|child|kid|teen|วัยรุ่น|เยาวชน|น้อง)/.test(text)) return true;
  // Leading number wins over prose: "8 ขวบ", "6-9", "อายุ 12 ปี".
  const firstNumber = text.match(/\d{1,2}/);
  if (firstNumber) {
    const age = Number(firstNumber[0]);
    if (Number.isFinite(age)) return age < 18;
  }
  if (/(ผู้ใหญ่|adult|วัยทำงาน|\d0s|late \d|early \d)/.test(text)) return false;
  return undefined;
}

/**
 * One line describing who a Drama Series character is, for the story planner.
 *
 * Joins only FACTS the series already holds — deduped and bounded by
 * `MARKETPLACE_CHARACTER_DESCRIPTOR_MAX`.
 */
export function buildDramaCharacterDescriptor(character: {
  role?: string | null;
  narrativeRole?: string | null;
  occupation?: string | null;
  description?: string | null;
}): string | undefined {
  // `description` comes FIRST because it is the field that actually carries
  // personality: the picker builds it as
  // `Description | Personality | Backstory | Identity lock | Wardrobe rules`
  // (`extractCharacterDescriptionForPicker`), falling back to the series
  // bible's `refinedCharacters` entry when the roster row is bare — which is
  // the common case in practice. It used to go LAST, so on a character with a
  // full profile the clamp cut the personality away and left only job titles,
  // which is exactly the "generic story with a name attached" that this field
  // exists to prevent.
  const parts = [
    character.description,
    character.occupation,
    character.narrativeRole,
    character.role,
  ]
    .map(part => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  const deduped = parts.filter(
    (part, index) => parts.findIndex(other => other === part) === index
  );
  const joined = deduped
    .join(" — ")
    .slice(0, MARKETPLACE_CHARACTER_DESCRIPTOR_MAX)
    .trim();
  return joined || undefined;
}

export interface MarketplaceDramaCharacterPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many more character slots are actually available — the panel caps the
   *  TOTAL character count at `MARKETPLACE_CHARACTER_CAST_MAX`, so this is
   *  `MAX - <current character count>`. Selection is disabled past this. */
  maxSelectable: number;
  /** Roles already taken by the run's existing cast, so a new pick never mints
   *  a second host. Omit for a fresh/unknown roster (positional fallback). */
  existingRoles?: Array<"host" | "guest" | "support">;
  onConfirm: (items: ReferenceManifestItem[]) => void;
}

export function MarketplaceDramaCharacterPickerDialog({
  open,
  onOpenChange,
  maxSelectable,
  existingRoles = [],
  onConfirm,
}: MarketplaceDramaCharacterPickerDialogProps) {
  const [seriesId, setSeriesId] = useState("");
  const [selections, setSelections] = useState<PickerSelection[]>([]);
  // Which "look"/variant (index into `character.looks`) is currently chosen
  // per character, prior to selecting it — `null`/absent means "use the
  // base portrait". Selecting a look writes the LOOK's own portrait but
  // still the base character's own name (design doc §3.7).
  const [lookChoiceByCharacterId, setLookChoiceByCharacterId] = useState<
    Record<string, number | null>
  >({});

  // Reset all local state whenever the dialog is (re)opened/closed so a
  // stale selection from a previous product/run never leaks in.
  useEffect(() => {
    if (!open) {
      setSeriesId("");
      setSelections([]);
      setLookChoiceByCharacterId({});
    }
  }, [open]);

  const seriesQuery = trpc.verticalDramaSeries.list.useQuery(undefined, {
    enabled: open,
    staleTime: 30_000,
  });
  const seriesList = seriesQuery.data?.series ?? [];

  // Auto-pick the only series so the common case (one drama series) skips
  // straight to the character list.
  useEffect(() => {
    if (!open) return;
    if (seriesId) return;
    if (seriesList.length === 1) setSeriesId(seriesList[0].id);
  }, [open, seriesId, seriesList]);

  const charactersQuery = trpc.marketplaceCapture.listDramaCharactersForPicker.useQuery(
    { seriesId },
    { enabled: open && Boolean(seriesId) }
  );
  const charactersData = charactersQuery.data as
    | DramaCharactersForPickerResponse
    | undefined;
  const characters = charactersData?.characters ?? [];

  const atCap = selections.length >= maxSelectable;

  function toggleCharacter(character: DramaCharacter) {
    const alreadySelected = selections.some(
      selection => selection.baseCharacterId === character.characterId
    );
    if (alreadySelected) {
      setSelections(prev =>
        prev.filter(
          selection => selection.baseCharacterId !== character.characterId
        )
      );
      return;
    }
    if (atCap) return;
    const lookIndex = lookChoiceByCharacterId[character.characterId] ?? null;
    const look = lookIndex != null ? character.looks[lookIndex] : undefined;
    const portraitUrl = look?.portraitUrl ?? character.portraitUrl;
    const portraitAssetId = look?.portraitAssetId ?? character.portraitAssetId;
    if (!portraitUrl) return; // defensive — the row should already be disabled
    setSelections(prev => [
      ...prev,
      {
        // A look is its OWN character row in VD; keeping its id is what lets a
        // per-shot switcher find the family and swap between siblings later.
        characterId: look?.characterId ?? character.characterId,
        baseCharacterId: character.characterId,
        ...(look?.variantLabel ? { variantLabel: look.variantLabel } : {}),
        name: character.name,
        ageRange: character.ageRange,
        descriptor: buildDramaCharacterDescriptor(character),
        // Grounded on the series' own age data, never on the portrait. Left
        // undefined when the series does not say — "not stated" must stay
        // distinguishable from "adult"
        // (`project_marketplace_minor_safety_qa_grounding`).
        ...(inferDepictsMinorFromAgeRange(character.ageRange) === undefined
          ? {}
          : { depictsMinor: inferDepictsMinorFromAgeRange(character.ageRange) }),
        portraitUrl,
        portraitAssetId,
      },
    ]);
  }

  /**
   * Re-point an ALREADY-SELECTED character at a different look.
   *
   * Without this, changing the look after ticking the character did nothing to
   * the selection — which is why the control used to be disabled once selected.
   * Keeps the selection's position (and therefore its lead/support ordering)
   * intact; only the rendered row, portrait and label move.
   */
  function applyLookToSelection(
    character: DramaCharacter,
    lookIndex: number | null
  ) {
    const look = lookIndex != null ? character.looks[lookIndex] : undefined;
    const portraitUrl = look?.portraitUrl ?? character.portraitUrl;
    if (!portraitUrl) return;
    setSelections(prev =>
      prev.map(selection =>
        selection.baseCharacterId === character.characterId
          ? {
              ...selection,
              characterId: look?.characterId ?? character.characterId,
              variantLabel: look?.variantLabel ?? undefined,
              portraitUrl,
              portraitAssetId:
                look?.portraitAssetId ?? character.portraitAssetId ?? null,
            }
          : selection
      )
    );
  }

  function handleConfirm() {
    if (selections.length === 0 || !seriesId) return;
    // Roles are assigned against the roster the panel ALREADY holds, not by
    // pick order — with a 4-person cast the 3rd and 4th picks are supporting
    // characters, and picking into a run that already has a host must not mint
    // a second one (`planning/marketplace-four-character-cast/plan.md` P1).
    const items: ReferenceManifestItem[] = selections.map((selection, index) => ({
      url: selection.portraitUrl,
      role: "character",
      label: selection.variantLabel
        ? `${selection.name} — ${selection.variantLabel}`
        : selection.name,
      active: true,
      characterName: selection.name,
      characterRole: resolveIncomingCastRole(index),
      vdCharacterId: selection.characterId,
      vdBaseCharacterId: selection.baseCharacterId,
      ...(selection.variantLabel ? { variantLabel: selection.variantLabel } : {}),
      vdSeriesId: seriesId,
      ...(selection.portraitAssetId
        ? { portraitAssetId: selection.portraitAssetId }
        : {}),
      ...(selection.ageRange ? { ageRange: selection.ageRange } : {}),
      ...(selection.descriptor ? { descriptor: selection.descriptor } : {}),
      ...(typeof selection.depictsMinor === "boolean"
        ? { depictsMinor: selection.depictsMinor }
        : {}),
    }));
    onConfirm(items);
    onOpenChange(false);
  }

  /** Which role the Nth NEW pick should take, given how many leads the run
   *  already has. Falls back to positional assignment when the caller does not
   *  tell us (older mounts), which reproduces the previous behavior. */
  function resolveIncomingCastRole(index: number): "host" | "guest" | "support" {
    const takenHost = existingRoles.includes("host");
    const takenGuest = existingRoles.includes("guest");
    const freeLeadSeats = [
      ...(takenHost ? [] : (["host"] as const)),
      ...(takenGuest ? [] : (["guest"] as const)),
    ];
    return freeLeadSeats[index] ?? "support";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="marketplace-drama-picker-desc"
        className="max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>เลือกตัวละครจาก Vertical Drama Series</DialogTitle>
          <DialogDescription id="marketplace-drama-picker-desc">
            เลือกได้สูงสุด {maxSelectable} ตัว — ระบบจะใช้ชื่อจริงของตัวละครในบทสนทนา
          </DialogDescription>
        </DialogHeader>

        {maxSelectable <= 0 ? (
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-amber-700"
          >
            ตัวละครครบ 2 คนแล้ว — ลบตัวใดตัวหนึ่งออกก่อนจึงเลือกเพิ่มได้
          </p>
        ) : seriesQuery.isLoading ? (
          <p className="text-sm text-slate-600">กำลังโหลดรายชื่อซีรีส์…</p>
        ) : seriesQuery.isError ? (
          <p className="text-sm text-rose-700">
            โหลดรายชื่อซีรีส์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
          </p>
        ) : seriesList.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              ยังไม่มีซีรีส์ Vertical Drama ที่คุณเป็นเจ้าของ — สร้างซีรีส์ก่อนจึงเลือกตัวละครได้
            </p>
            <Link
              href="/drama-series"
              className="inline-flex items-center gap-1 rounded border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 shadow-2xs transition hover:border-violet-400 hover:bg-violet-50"
            >
              🎬 ไปหน้าจัดการซีรีส์ Vertical Drama
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-700">
              ซีรีส์
              <select
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
                value={seriesId}
                onChange={event => {
                  setSeriesId(event.target.value);
                  setSelections([]);
                }}
                aria-label="เลือกซีรีส์ Vertical Drama"
              >
                <option value="">— เลือกซีรีส์ —</option>
                {seriesList.map(series => (
                  <option key={series.id} value={series.id}>
                    {series.title}
                  </option>
                ))}
              </select>
            </label>

            {seriesId ? (
              charactersQuery.isLoading ? (
                <p className="text-sm text-slate-600">กำลังโหลดตัวละคร…</p>
              ) : charactersQuery.isError ? (
                <p className="text-sm text-rose-700">
                  โหลดตัวละครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
                </p>
              ) : characters.length === 0 ? (
                <p className="text-sm text-slate-600">ซีรีส์นี้ยังไม่มีตัวละคร</p>
              ) : (
                <div className="space-y-1.5">
                  <p
                    role="status"
                    aria-live="polite"
                    className="text-xs text-slate-500"
                  >
                    เลือกได้สูงสุด {maxSelectable} ตัว ({selections.length}/
                    {maxSelectable})
                  </p>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto">
                    {characters.map(character => {
                      // Matched on the FAMILY root: picking a look still marks
                      // its base character's row as selected.
                      const selected = selections.some(
                        selection =>
                          selection.baseCharacterId === character.characterId
                      );
                      const lookIndex =
                        lookChoiceByCharacterId[character.characterId] ?? null;
                      const look =
                        lookIndex != null ? character.looks[lookIndex] : undefined;
                      const effectivePortraitUrl =
                        look?.portraitUrl ?? character.portraitUrl;
                      const hasAnyPortrait =
                        character.hasPortrait ||
                        character.looks.some(item => Boolean(item.portraitUrl));
                      const disabled = !hasAnyPortrait || (!selected && atCap);
                      const noPortraitReasonId = `no-portrait-${character.characterId}`;
                      return (
                        <div
                          key={character.characterId}
                          aria-disabled={disabled}
                          className={`flex min-h-11 items-center gap-2 rounded-md border px-2 py-1.5 ${
                            selected
                              ? "border-violet-400 bg-violet-50"
                              : disabled
                                ? "border-slate-200 bg-slate-100"
                                : "border-slate-200 bg-white"
                          }`}
                        >
                          {/* The whole label region (checkbox + avatar +
                              text) is the click target — not just the tiny
                              native checkbox — while the "look" select stays
                              outside the label so its own clicks are never
                              forwarded into a double-toggle. */}
                          <label
                            className={`flex min-w-0 flex-1 items-center gap-2 ${
                              disabled ? "cursor-not-allowed" : "cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={disabled}
                              onChange={() => toggleCharacter(character)}
                              aria-label={`เลือก ${character.name}`}
                              aria-describedby={
                                !hasAnyPortrait ? noPortraitReasonId : undefined
                              }
                            />
                            {effectivePortraitUrl ? (
                              <img
                                src={effectivePortraitUrl}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] text-slate-700">
                                ไม่มีภาพ
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <p
                                className={`truncate text-sm font-medium ${
                                  disabled ? "text-slate-600" : "text-slate-800"
                                }`}
                              >
                                {character.name}
                              </p>
                              {character.narrativeRole || character.role ? (
                                <p className="truncate text-[11px] text-slate-600">
                                  {character.narrativeRole || character.role}
                                </p>
                              ) : null}
                              {!hasAnyPortrait ? (
                                <p
                                  id={noPortraitReasonId}
                                  className="text-[10px] text-rose-700"
                                >
                                  ไม่มีภาพอ้างอิง — ใช้ตัวละครนี้ไม่ได้
                                </p>
                              ) : null}
                            </div>
                          </label>
                          {character.looks.length > 0 ? (
                            <select
                              className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-1.5 text-[11px] text-slate-800"
                              value={lookIndex ?? ""}
                              // Was `disabled={selected}` — ticking a character
                              // FROZE their look, so the only way to change it
                              // was to untick and start over, and a character
                              // with looks looked broken
                              // (`planning/marketplace-four-character-cast/plan.md`).
                              // Changing a look now re-points the existing
                              // selection in place.
                              onChange={event => {
                                const rawValue = event.target.value;
                                const nextIndex =
                                  rawValue === "" ? null : Number(rawValue);
                                setLookChoiceByCharacterId(prev => ({
                                  ...prev,
                                  [character.characterId]: nextIndex,
                                }));
                                applyLookToSelection(character, nextIndex);
                              }}
                              aria-label={`เลือกลุคของ ${character.name}`}
                              data-testid={`picker-look-${character.characterId}`}
                            >
                              <option value="">ภาพต้นแบบ</option>
                              {character.looks.map((lookOption, index) => (
                                <option
                                  key={index}
                                  value={index}
                                  disabled={!lookOption.portraitUrl}
                                >
                                  {lookOption.variantLabel || `ลุคที่ ${index + 1}`}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            ) : null}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-2.5 text-sm text-slate-700"
            onClick={() => onOpenChange(false)}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className="rounded bg-violet-700 px-3 py-2.5 text-sm font-semibold text-white shadow-2xs transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={selections.length === 0}
            onClick={handleConfirm}
          >
            เพิ่มตัวละคร ({selections.length})
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MarketplaceDramaCharacterPickerDialog;
