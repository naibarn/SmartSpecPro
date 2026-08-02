/**
 * Per-shot character row for a Marketplace Auto Review staged shot card
 * (`planning/marketplace-four-character-cast/plan.md` §6).
 *
 * Deliberately the same shape as the Vertical Drama storyboard shot card the
 * user asked us to mirror: portrait chips for who is in this shot, a shirt
 * button per chip to switch that person's LOOK for this shot only, and a
 * pencil to open the who-is-in-this-shot picker. The look logic itself is the
 * shared `@/lib/shotCharacterLooks` used by both surfaces, so the two cannot
 * drift.
 *
 * The row is presentational — every mutation is delegated upward, matching how
 * the rest of `StagedCheckpointReviewPanel` handles manifest edits.
 */
import { useState } from "react";
import { Check, Pencil, Shirt, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  buildShotCharacterLookOptionsFromEntries,
  swapShotCharacterRefKey,
  type ShotCharacterLookOption,
  type ShotLookCharacterFields,
} from "@/lib/shotCharacterLooks";

/** One character in the run's roster, as the row needs to see it. */
export interface StagedShotRosterCharacter {
  /** Positional cast id (`cast-1`..`cast-4`). */
  castId: string;
  name: string;
  url: string;
  characterRole?: string;
  /** The VD row rendered — the look's own row when a look is in use. */
  vdCharacterId?: string;
  /** The look family's root; absent for uploaded characters (no looks). */
  vdBaseCharacterId?: string;
  variantLabel?: string;
}

/** A selectable look for one roster character, resolved from the VD picker
 *  data the panel already queries. */
export interface StagedShotLookSource {
  characterId: string;
  parentCharacterId?: string | null;
  name?: string;
  variantLabel?: string | null;
  portraitUrl?: string | null;
}

export interface StagedShotCharacterRowProps {
  shotId: number;
  roster: StagedShotRosterCharacter[];
  /** castIds present in this shot. `null`/absent = everyone (legacy runs). */
  castInShot?: string[] | null;
  /** Per-shot look override keyed by castId. */
  castLooks?: Record<string, { url?: string; variantLabel?: string }> | null;
  /** What each supporting character is doing here — rendered as a caption so
   *  the user can see WHY an extra is in the frame. */
  supportingBeats?: Array<{ castId: string; action: string; line?: string }> | null;
  /** Every VD character row for the series, keyed by that row's own id — the
   *  same `listDramaCharactersForPicker` data the picker dialog uses. */
  lookSourcesByCharacterId?: Record<string, StagedShotLookSource>;
  readOnly?: boolean;
  saving?: boolean;
  onChangeCastInShot: (shotId: number, castIds: string[]) => void;
  onChangeCastLook: (
    shotId: number,
    castId: string,
    look: { url: string; vdCharacterId: string; variantLabel?: string } | null
  ) => void;
}

/**
 * Which castIds are actually in this shot.
 *
 * Absent/empty means "everyone" — the legacy meaning, and what every
 * pre-existing run's persisted state says. Never read it as "nobody".
 */
export function resolveStagedShotPresentCastIds(params: {
  roster: ReadonlyArray<{ castId: string }>;
  castInShot?: string[] | null;
}): string[] {
  const declared = (params.castInShot ?? []).filter(Boolean);
  if (declared.length === 0) return params.roster.map(member => member.castId);
  const rosterIds = new Set(params.roster.map(member => member.castId));
  return declared.filter(castId => rosterIds.has(castId));
}

/**
 * The look options for one roster character, keyed the way the ROW needs them.
 *
 * The shared helper keys options by the VD character row id (that is what a VD
 * shot's cast list stores); here the shot stores positional castIds instead, so
 * the option key is only used to identify which look was picked.
 */
export function buildStagedShotLookOptions(params: {
  member: StagedShotRosterCharacter;
  lookSourcesByCharacterId?: Record<string, StagedShotLookSource>;
}): ShotCharacterLookOption[] {
  const sources = params.lookSourcesByCharacterId;
  // Uploaded characters have no VD family at all — nothing to switch between.
  if (!sources || !params.member.vdCharacterId) return [];
  const entries = Object.entries(sources).map(
    ([characterId, source]) =>
      [
        characterId,
        {
          characterId,
          parentCharacterId: source.parentCharacterId ?? null,
          name: source.name,
          variantLabel: source.variantLabel,
          portraitUrl: source.portraitUrl,
        } satisfies ShotLookCharacterFields,
      ] as const
  );
  return buildShotCharacterLookOptionsFromEntries(
    entries,
    params.member.vdCharacterId
  );
}

export function StagedShotCharacterRow({
  shotId,
  roster,
  castInShot,
  castLooks,
  supportingBeats,
  lookSourcesByCharacterId,
  readOnly = false,
  saving = false,
  onChangeCastInShot,
  onChangeCastLook,
}: StagedShotCharacterRowProps) {
  const [lookMenuForCastId, setLookMenuForCastId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (roster.length === 0) return null;

  const presentCastIds = resolveStagedShotPresentCastIds({ roster, castInShot });
  const present = roster.filter(member => presentCastIds.includes(member.castId));
  const beatByCastId = new Map(
    (supportingBeats ?? []).map(beat => [beat.castId, beat])
  );

  return (
    <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/40 p-2">
      <div className="flex flex-wrap items-start gap-2.5">
        <Users
          aria-hidden="true"
          className="mt-2 h-3.5 w-3.5 shrink-0 text-violet-500"
        />
        {present.map(member => {
          const override = castLooks?.[member.castId];
          const thumbnailUrl = override?.url || member.url;
          const lookLabel = override?.variantLabel ?? member.variantLabel;
          const options = buildStagedShotLookOptions({
            member,
            lookSourcesByCharacterId,
          });
          const menuOpen = lookMenuForCastId === member.castId;
          const beat = beatByCastId.get(member.castId);
          const activeLookCharacterId =
            override?.url && castLooks?.[member.castId]
              ? undefined
              : member.vdCharacterId;
          return (
            <div
              key={member.castId}
              className="relative flex w-16 flex-col items-center"
            >
              <div className="flex w-16 flex-col items-center gap-1 rounded-lg border border-violet-200 bg-white p-1 text-center text-[10px]">
                <img
                  src={thumbnailUrl}
                  alt={member.name}
                  className="aspect-[3/4] w-full rounded-md object-cover object-top"
                />
                <span className="w-full truncate leading-tight text-slate-700">
                  {lookLabel || member.name}
                </span>
                {member.characterRole === "support" ? (
                  <span className="w-full truncate rounded bg-violet-100 text-[8px] text-violet-700">
                    ตัวประกอบ
                  </span>
                ) : null}
              </div>
              {options.length > 0 && !readOnly ? (
                <button
                  type="button"
                  disabled={saving}
                  aria-expanded={menuOpen}
                  aria-label={`เปลี่ยนลุคของ ${member.name} เฉพาะช็อตที่ ${shotId}`}
                  title={`เปลี่ยนลุคของ ${member.name} เฉพาะช็อตที่ ${shotId}`}
                  onClick={() =>
                    setLookMenuForCastId(current =>
                      current === member.castId ? null : member.castId
                    )
                  }
                  className="absolute -right-1 -top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-600 shadow-sm hover:text-violet-900 disabled:opacity-50"
                  data-testid={`staged-look-switch-${shotId}-${member.castId}`}
                >
                  <Shirt aria-hidden="true" className="h-3 w-3" />
                </button>
              ) : null}
              {menuOpen ? (
                <div
                  className="absolute left-1/2 top-full z-30 mt-1 w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
                  data-testid={`staged-look-menu-${shotId}-${member.castId}`}
                >
                  <p className="px-1 pb-1 text-[10px] leading-tight text-slate-500">
                    ใช้เฉพาะช็อตที่ {shotId} — ช็อตอื่นไม่เปลี่ยน
                  </p>
                  {options.map(option => {
                    const isActive = option.isBase
                      ? !override?.url && activeLookCharacterId === option.characterId
                      : override?.url
                        ? option.label === override.variantLabel
                        : activeLookCharacterId === option.characterId;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setLookMenuForCastId(null);
                          onChangeCastLook(
                            shotId,
                            member.castId,
                            option.portraitUrl
                              ? {
                                  url: option.portraitUrl,
                                  vdCharacterId: option.characterId,
                                  ...(option.isBase
                                    ? {}
                                    : { variantLabel: option.label }),
                                }
                              : null
                          );
                        }}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[11px] hover:bg-slate-100 disabled:opacity-50",
                          isActive && "bg-slate-100 font-medium"
                        )}
                        data-testid={`staged-look-option-${shotId}-${member.castId}-${option.key}`}
                      >
                        {option.portraitUrl ? (
                          <img
                            src={option.portraitUrl}
                            alt=""
                            className="h-6 w-5 shrink-0 rounded object-cover object-top"
                          />
                        ) : (
                          <span className="flex h-6 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-[9px] text-slate-500">
                            ?
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {option.isBase ? "ลุคหลัก" : option.label}
                        </span>
                        {isActive ? (
                          <Check aria-hidden="true" className="h-3 w-3 shrink-0" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {beat ? (
                <span
                  className="mt-0.5 w-16 truncate text-center text-[9px] text-violet-700"
                  title={beat.line ? `${beat.action} — "${beat.line}"` : beat.action}
                >
                  {beat.action}
                </span>
              ) : null}
            </div>
          );
        })}
        {!readOnly ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => setPickerOpen(open => !open)}
            aria-expanded={pickerOpen}
            aria-label={`เลือกตัวละครที่อยู่ในช็อตที่ ${shotId}`}
            title={`เลือกตัวละครที่อยู่ในช็อตที่ ${shotId}`}
            className="flex aspect-[3/4] w-16 items-center justify-center rounded-lg border border-dashed border-violet-300 text-violet-500 hover:bg-violet-100 hover:text-violet-800 disabled:opacity-50"
            data-testid={`staged-shot-cast-edit-${shotId}`}
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {pickerOpen && !readOnly ? (
        <div
          className="mt-2 rounded-lg border border-slate-200 bg-white p-2"
          data-testid={`staged-shot-cast-picker-${shotId}`}
        >
          <p className="pb-1 text-[10px] text-slate-500">
            ใครอยู่ในช็อตที่ {shotId} — ตัวประกอบไม่จำเป็นต้องอยู่ครบทุกช็อต
          </p>
          {roster.map(member => {
            const checked = presentCastIds.includes(member.castId);
            return (
              <label
                key={member.castId}
                className="flex items-center gap-2 rounded px-1 py-1 text-[11px] hover:bg-slate-50"
                data-testid={`staged-shot-cast-option-${shotId}-${member.castId}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={() => {
                    const next = checked
                      ? presentCastIds.filter(castId => castId !== member.castId)
                      : [...presentCastIds, member.castId];
                    // Preserve roster order so `@ImageN` stays predictable.
                    const ordered = roster
                      .map(item => item.castId)
                      .filter(castId => next.includes(castId));
                    onChangeCastInShot(shotId, ordered);
                  }}
                />
                <img
                  src={castLooks?.[member.castId]?.url || member.url}
                  alt=""
                  className="h-6 w-5 shrink-0 rounded object-cover object-top"
                />
                <span className="min-w-0 flex-1 truncate">{member.name}</span>
                {member.characterRole === "support" ? (
                  <span className="shrink-0 rounded bg-violet-100 px-1 text-[9px] text-violet-700">
                    ตัวประกอบ
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export { swapShotCharacterRefKey };
