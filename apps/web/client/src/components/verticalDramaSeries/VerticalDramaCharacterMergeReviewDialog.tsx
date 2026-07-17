/**
 * VerticalDramaCharacterMergeReviewDialog
 * (`planning/vd-character-identity-repair/plan.md` Phase 3.4).
 *
 * The "รวมตัวละครซ้ำ" (merge duplicate characters) review surface for
 * `trpc.verticalDramaCharacters.analyzeCharacterDuplicates` /
 * `mergeCharacters`. USER-DECIDED FLOW (binding, see that plan's
 * "Decisions" section): **propose -> the user confirms EACH GROUP
 * individually -> then merge.** There is deliberately NO auto-apply and NO
 * single "merge everything" button — `mergeCharacters` DELETES roster rows,
 * so every merge is an explicit, per-group, human-confirmed action.
 *
 * Fully self-contained: owns both mutations directly (same pattern as
 * `VerticalDramaCharacterReferencePanel.tsx`'s own tRPC calls, since this
 * is a standalone workflow triggered from one button rather than a
 * per-character embedded card like `VerticalDramaCharacterVoiceCastingCard`).
 * Mounted unconditionally from `VerticalDramaCharacterStockPanel.tsx`,
 * visibility governed by the `open` prop — mirrors that panel's own
 * variant/twin `<Dialog>`s, which stay mounted and only toggle `open`.
 *
 * Server contract (backend is DONE + LIVE, frozen — do not assume shapes,
 * verified directly against `server/routers/verticalDramaCharacters.ts` and
 * `server/services/verticalDramaCharacterMerge.ts`):
 * - `analyzeCharacterDuplicates` returns EVERY id (`canonicalCharacterId`,
 *   `duplicateCharacterIds`, `evidence[].characterId`, etc.) as a STRING,
 *   not a number — the router explicitly `String()`s every id before
 *   returning. `mergeCharacters` likewise takes `keepCharacterId`/
 *   `mergeCharacterIds[]` as strings. (A draft of this task's brief assumed
 *   numbers; the code is the source of truth.)
 * - `groups[]` is a FULL PARTITION of the roster — every character appears
 *   in exactly one group, singletons included (`isSingleton: true`, no
 *   duplicates). This dialog renders singletons as a single reassuring
 *   summary line, never as individual confirm-required cards.
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Merge,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { resolveVdCharacterMutationErrorMessage } from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";

type Lang = "th" | "en";
const t = (lang: Lang, th: string, en: string) => (lang === "th" ? th : en);

/* -------------------------------------------------------------------------- */
/* Pure helpers (exported for direct unit testing — no DB/tRPC access)        */
/* -------------------------------------------------------------------------- */

/** Structural subset of a proposed group needed to split a full-roster
 *  partition into "needs a human decision" vs "already fine, no duplicates". */
export interface VdMergeGroupForPartition {
  isSingleton: boolean;
}

/** Splits `analyzeCharacterDuplicates`'s full-roster-partition `groups[]`
 *  into the groups that need a per-group confirm (`actionableGroups`) and
 *  the ones that don't (`singletonGroups`) — every group is a FULL
 *  partition, so `actionableGroups.length === 0` is the "nothing to merge"
 *  outcome the dialog must render as reassuring, not blank/erroring. */
export function partitionDuplicateGroups<T extends VdMergeGroupForPartition>(
  groups: readonly T[]
): { actionableGroups: T[]; singletonGroups: T[] } {
  const actionableGroups: T[] = [];
  const singletonGroups: T[] = [];
  for (const group of groups) {
    (group.isSingleton ? singletonGroups : actionableGroups).push(group);
  }
  return { actionableGroups, singletonGroups };
}

/** Initial per-duplicate selection state for a freshly-rendered group — every
 *  proposed duplicate starts SELECTED (the analyzer's own recommendation),
 *  the user may deselect individual rows before confirming. */
export function defaultSelectedDuplicateIds(
  duplicateCharacterIds: readonly string[]
): Set<string> {
  return new Set(duplicateCharacterIds);
}

/** Toggles one duplicate's membership in the merge selection — pure, so the
 *  checkbox wiring is unit-testable without mounting the dialog. */
export function toggleDuplicateSelection(
  selected: ReadonlySet<string>,
  characterId: string
): Set<string> {
  const next = new Set(selected);
  if (next.has(characterId)) next.delete(characterId);
  else next.add(characterId);
  return next;
}

/** Structural subset of a proposed group needed to shape a `mergeCharacters`
 *  call — accepts the full group object too (structural typing). */
export interface VdMergeGroupForPayload {
  canonicalCharacterId: string;
  duplicateCharacterIds: readonly string[];
}

/**
 * Shapes the exact `mergeCharacters` mutation payload for one confirmed
 * group, honoring per-duplicate deselection: only duplicate ids still
 * present in `selectedDuplicateIds` are sent, in the group's own original
 * order (never re-sorted, so evidence order and payload order match).
 */
export function buildMergeCharactersPayload(
  seriesId: string,
  group: VdMergeGroupForPayload,
  selectedDuplicateIds: ReadonlySet<string>
): { seriesId: string; keepCharacterId: string; mergeCharacterIds: string[] } {
  return {
    seriesId,
    keepCharacterId: group.canonicalCharacterId,
    mergeCharacterIds: group.duplicateCharacterIds.filter((id) =>
      selectedDuplicateIds.has(id)
    ),
  };
}

/** `episodeNumbersSeenIn` rendered as a compact ascending, deduped list —
 *  e.g. `[9, 1, 1, 5]` -> `"1, 5, 9"`. Empty input -> empty string, so the
 *  caller can decide its own "not seen in any episode" copy. */
export function formatEpisodeNumbersSeenIn(
  episodeNumbers: readonly number[]
): string {
  if (episodeNumbers.length === 0) return "";
  return [...new Set(episodeNumbers)].sort((a, b) => a - b).join(", ");
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaCharacterMergeReviewDialogProps {
  seriesId: string;
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VerticalDramaCharacterMergeReviewDialog({
  seriesId,
  lang,
  open,
  onOpenChange,
}: VerticalDramaCharacterMergeReviewDialogProps) {
  const utils = trpc.useUtils();

  const onError = (err: { message?: string }) => {
    toast.error(resolveVdCharacterMutationErrorMessage(err, lang));
  };

  /** Per-group 2-step confirm toggle — mirrors this panel's existing
   *  `confirmingDeleteCharacterId` inline Cancel/Confirm pattern rather than
   *  inventing a new interaction, since `mergeCharacters` is just as
   *  destructive as `deleteCharacter` (it deletes roster rows). */
  const [confirmingCanonicalId, setConfirmingCanonicalId] = useState<
    string | null
  >(null);
  /** Canonical ids whose group has already been merged successfully this
   *  session — rendered as "done" instead of re-offering the confirm UI. */
  const [mergedCanonicalIds, setMergedCanonicalIds] = useState<Set<string>>(
    new Set()
  );
  /** Per-group duplicate selection state, lazily populated (see
   *  `getSelectedDuplicateIds` below) so a freshly-arrived group always
   *  starts with everything selected without a render-order-dependent
   *  effect. */
  const [selectedByGroup, setSelectedByGroup] = useState<
    Record<string, Set<string>>
  >({});

  const analyzeMutation =
    trpc.verticalDramaCharacters.analyzeCharacterDuplicates.useMutation({
      onSuccess: () => {
        // A fresh analysis is a new partition of the roster — old
        // per-group UI state (confirm-in-progress, prior merges, manual
        // deselection) no longer refers to anything meaningful.
        setConfirmingCanonicalId(null);
        setMergedCanonicalIds(new Set());
        setSelectedByGroup({});
      },
      onError,
    });

  const mergeMutation = trpc.verticalDramaCharacters.mergeCharacters.useMutation({
    onSuccess: (_result, variables) => {
      utils.verticalDramaCharacters.listCharacters.invalidate({ seriesId });
      setConfirmingCanonicalId(null);
      setMergedCanonicalIds((prev) => {
        const next = new Set(prev);
        next.add(variables.keepCharacterId);
        return next;
      });
      toast.success(
        t(lang, "รวมตัวละครสำเร็จแล้ว", "Characters merged successfully")
      );
    },
    onError,
  });

  const groups = analyzeMutation.data?.groups ?? [];
  const { actionableGroups, singletonGroups } = partitionDuplicateGroups(groups);

  const getSelectedDuplicateIds = (group: {
    canonicalCharacterId: string;
    duplicateCharacterIds: string[];
  }): Set<string> =>
    selectedByGroup[group.canonicalCharacterId] ??
    defaultSelectedDuplicateIds(group.duplicateCharacterIds);

  const setGroupSelection = (canonicalCharacterId: string, next: Set<string>) => {
    setSelectedByGroup((prev) => ({ ...prev, [canonicalCharacterId]: next }));
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) setConfirmingCanonicalId(null);
    onOpenChange(nextOpen);
  };

  const hasResult = analyzeMutation.data !== undefined;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
        data-testid="vd-character-merge-review-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t(lang, "รวมตัวละครซ้ำ", "Merge duplicate characters")}</DialogTitle>
          <DialogDescription>
            {t(
              lang,
              "ตรวจสอบตัวละครที่อาจเป็นคนเดียวกันแต่สะกดต่างกัน แล้วยืนยันการรวมทีละกลุ่ม — ระบบจะไม่รวมให้อัตโนมัติ และจะไม่แก้ไขบทที่เขียนไปแล้ว",
              "Review characters that may be the same person under a drifted spelling, and confirm each group individually — nothing is merged automatically, and the written story text is never rewritten."
            )}
          </DialogDescription>
        </DialogHeader>

        {!hasResult && (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-6 text-center">
            <Sparkles aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t(
                lang,
                "การตรวจสอบนี้ใช้ AI วิเคราะห์ชื่อตัวละครในบทที่ร่างไว้แล้ว และใช้เครดิต",
                "This analysis uses an AI call over the drafted script and costs credits."
              )}
            </p>
            <Button
              type="button"
              onClick={() => analyzeMutation.mutate({ seriesId })}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                  {t(lang, "กำลังตรวจสอบ...", "Analyzing...")}
                </>
              ) : (
                t(lang, "ตรวจสอบตัวละครซ้ำ", "Analyze for duplicates")
              )}
            </Button>
            {analyzeMutation.isError && (
              <p className="text-sm text-destructive" role="alert">
                {resolveVdCharacterMutationErrorMessage(analyzeMutation.error, lang)}
              </p>
            )}
          </div>
        )}

        {hasResult && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                {analyzeMutation.data?.model}
              </Badge>
              <span>
                {t(lang, "เครดิตที่ใช้", "Credits used")}: {analyzeMutation.data?.creditsUsed}
              </span>
            </div>

            {actionableGroups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
                <CheckCircle2
                  aria-hidden="true"
                  className="h-6 w-6 text-emerald-600 dark:text-emerald-400"
                />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  {t(lang, "ไม่พบตัวละครซ้ำ", "No duplicates found")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    lang,
                    `ตัวละครทั้ง ${singletonGroups.length} ตัวไม่มีตัวซ้ำ`,
                    `All ${singletonGroups.length} characters have no duplicates.`
                  )}
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-4" aria-label={t(lang, "กลุ่มตัวละครซ้ำที่เสนอ", "Proposed duplicate groups")}>
                {actionableGroups.map((group) => {
                  const merged = mergedCanonicalIds.has(group.canonicalCharacterId);
                  const confirming =
                    confirmingCanonicalId === group.canonicalCharacterId;
                  const selected = getSelectedDuplicateIds(group);
                  const mergingThis =
                    mergeMutation.isPending &&
                    mergeMutation.variables?.keepCharacterId ===
                      group.canonicalCharacterId;

                  return (
                    <li
                      key={group.canonicalCharacterId}
                      className="rounded-md border p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            {group.canonicalName}
                          </span>
                          {group.canonicalMatchesBibleCharacter && (
                            <Badge variant="outline" className="text-[10px]">
                              {t(lang, "ตรงกับ Bible", "Matches bible")}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            {t(lang, "ความมั่นใจ", "Confidence")}{" "}
                            {Math.round(group.confidence * 100)}%
                          </Badge>
                        </div>
                        {merged && (
                          <Badge className="gap-1 bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
                            <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                            {t(lang, "รวมแล้ว", "Merged")}
                          </Badge>
                        )}
                      </div>

                      {group.autoFallback && (
                        <p className="mt-2 flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {t(
                            lang,
                            "การวิเคราะห์นี้ไม่ครอบคลุมตัวละครนี้โดยตรง — เป็นข้อเสนอเชิงป้องกัน กรุณาตรวจสอบอย่างละเอียดเป็นพิเศษ",
                            "The analyzer didn't directly cover this character — this is a safety-net proposal. Review it especially carefully."
                          )}
                        </p>
                      )}

                      <p className="mt-2 text-xs text-muted-foreground">
                        {group.reasoning}{" "}
                        <span className="italic">
                          {t(lang, "(ข้อเสนอแนะจาก AI ไม่ใช่คำตัดสิน)", "(AI suggestion, not a verdict)")}
                        </span>
                      </p>

                      {group.aliasesToRecord.length > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t(
                            lang,
                            "บทที่เขียนไปแล้วจะไม่ถูกแก้ไข — ชื่อเดิมจะถูกบันทึกเป็นชื่อเล่น (alias) ของตัวละครหลัก:",
                            "The written story text is not rewritten — these names will be recorded as aliases of the surviving character:"
                          )}{" "}
                          <span className="font-medium text-foreground">
                            {group.aliasesToRecord.join(", ")}
                          </span>
                        </p>
                      )}

                      <Separator className="my-3" />

                      <ul className="flex flex-col gap-2" aria-label={t(lang, "หลักฐานต่อแถว", "Per-row evidence")}>
                        {group.evidence.map((row) => {
                          const isDuplicateRow = row.characterId !== group.canonicalCharacterId;
                          const isCanonicalRow = !isDuplicateRow;
                          const episodesText = formatEpisodeNumbersSeenIn(
                            row.episodeNumbersSeenIn
                          );
                          return (
                            <li
                              key={row.characterId}
                              className="flex items-start gap-2 rounded bg-muted/40 p-2 text-xs"
                            >
                              {isDuplicateRow && !merged && (
                                <Checkbox
                                  aria-label={t(
                                    lang,
                                    `รวม ${row.name} เข้ากับ ${group.canonicalName}`,
                                    `Merge ${row.name} into ${group.canonicalName}`
                                  )}
                                  checked={selected.has(row.characterId)}
                                  disabled={mergingThis}
                                  onCheckedChange={() =>
                                    setGroupSelection(
                                      group.canonicalCharacterId,
                                      toggleDuplicateSelection(selected, row.characterId)
                                    )
                                  }
                                  className="mt-0.5"
                                />
                              )}
                              <div className="flex flex-1 flex-col gap-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium">{row.name}</span>
                                  {isCanonicalRow && (
                                    <Badge variant="outline" className="text-[9px]">
                                      {t(lang, "คงไว้", "Keep")}
                                    </Badge>
                                  )}
                                  {row.matchesBibleCharacterExactly && (
                                    <Badge variant="outline" className="text-[9px]">
                                      {t(lang, "ตรงกับ Bible", "Matches bible")}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-muted-foreground">
                                  {t(lang, "พบในฉาก", "Shot appearances")}: {row.shotCharacterOccurrences}
                                  {" · "}
                                  {t(lang, "บทพูด", "Dialogue lines")}: {row.dialogueSpeakerOccurrences}
                                  {" · "}
                                  {t(lang, "ตอนที่พบ", "Episodes")}:{" "}
                                  {episodesText || t(lang, "ไม่พบ", "none")}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      {!merged && (
                        <div className="mt-3 flex justify-end gap-2">
                          {confirming ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={mergingThis}
                                onClick={() => setConfirmingCanonicalId(null)}
                              >
                                <X aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
                                {t(lang, "ยกเลิก", "Cancel")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={mergingThis || selected.size === 0}
                                onClick={() =>
                                  mergeMutation.mutate(
                                    buildMergeCharactersPayload(seriesId, group, selected)
                                  )
                                }
                              >
                                {mergingThis ? (
                                  <Loader2 aria-hidden="true" className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Merge aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
                                )}
                                {t(lang, "ยืนยันรวมกลุ่มนี้", "Confirm merge")}
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={selected.size === 0}
                              onClick={() =>
                                setConfirmingCanonicalId(group.canonicalCharacterId)
                              }
                            >
                              <Merge aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
                              {t(
                                lang,
                                `รวมกลุ่มนี้ (${selected.size} ตัว)`,
                                `Merge this group (${selected.size})`
                              )}
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {singletonGroups.length > 0 && actionableGroups.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t(
                  lang,
                  `อีก ${singletonGroups.length} ตัวละครไม่มีตัวซ้ำ`,
                  `${singletonGroups.length} other characters have no duplicates.`
                )}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {hasResult && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => analyzeMutation.mutate({ seriesId })}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? (
                <Loader2 aria-hidden="true" className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
              )}
              {t(lang, "วิเคราะห์อีกครั้ง", "Re-analyze")}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
            {t(lang, "ปิด", "Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
