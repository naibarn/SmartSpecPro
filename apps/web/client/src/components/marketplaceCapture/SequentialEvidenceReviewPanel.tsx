/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §6.4. Collapsible "evidence & conflict review" section
 * (default collapsed, interview decision 9): disclosure header -> guardian
 * notice (when active) -> verified highlights (read-only) -> needsConfirmation
 * rows (ยืนยัน / ตัดออก) -> forbidden-claims / targetAudience /
 * userRequirements free-text fields. Renders `null` when `!enabled` or no
 * `evidencePreview` is supplied.
 *
 * Object/array overrides (`confirmedAttributes`, `forbiddenClaims`) are
 * owned EXCLUSIVELY here (binding decision §3.4) via
 * `applySequentialOverrideChange`, an immutable updater that deletes the
 * key when the next value is empty and never routes through the advanced
 * panel's `overrideValueString` string-compare helpers.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { HyperframesAutoPlanOverrideInput } from "@shared/hyperframes/autoPlan";
import type { SequentialEvidencePreview } from "@shared/marketplaceCapture/sequentialEvidencePreview";
import { SequentialGuardianNotice } from "./SequentialGuardianNotice";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

export interface SequentialEvidenceReviewPanelProps {
  enabled: boolean;
  evidencePreview?: SequentialEvidencePreview | null;
  value: HyperframesAutoPlanOverrideInput;
  onChange: (next: HyperframesAutoPlanOverrideInput) => void;
  guardian: { active: boolean; guardianReferenceAttached: boolean };
  onOpenCharacterUpload?: () => void;
  locale?: MarketplaceHyperframesUiLocale | string;
}

type SequentialOverridePatch = Partial<
  Pick<
    HyperframesAutoPlanOverrideInput,
    "confirmedAttributes" | "forbiddenClaims" | "targetAudience" | "userRequirements"
  >
>;

/**
 * Immutable override update. Deletes the key when the next value is empty
 * (empty string after trim, empty array, empty record) so the plan payload
 * never carries no-op overrides. Preserves every other key untouched.
 */
export function applySequentialOverrideChange(
  value: HyperframesAutoPlanOverrideInput,
  patch: SequentialOverridePatch
): HyperframesAutoPlanOverrideInput {
  const next: HyperframesAutoPlanOverrideInput = { ...value };

  if ("confirmedAttributes" in patch) {
    const record = patch.confirmedAttributes ?? {};
    if (Object.keys(record).length === 0) {
      delete next.confirmedAttributes;
    } else {
      next.confirmedAttributes = record;
    }
  }
  if ("forbiddenClaims" in patch) {
    const list = patch.forbiddenClaims ?? [];
    if (list.length === 0) {
      delete next.forbiddenClaims;
    } else {
      next.forbiddenClaims = list;
    }
  }
  if ("targetAudience" in patch) {
    const text = (patch.targetAudience ?? "").trim();
    if (!text) {
      delete next.targetAudience;
    } else {
      next.targetAudience = text;
    }
  }
  if ("userRequirements" in patch) {
    const text = (patch.userRequirements ?? "").trim();
    if (!text) {
      delete next.userRequirements;
    } else {
      next.userRequirements = text;
    }
  }
  return next;
}

function splitForbiddenClaimsText(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map(entry => entry.trim())
    .filter(Boolean);
}

export function SequentialEvidenceReviewPanel({
  enabled,
  evidencePreview,
  value,
  onChange,
  guardian,
  onOpenCharacterUpload,
  locale,
}: SequentialEvidenceReviewPanelProps) {
  const [open, setOpen] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const copy = getMarketplaceHyperframesUiCopy(locale);

  // Local typing buffer for the free-text "forbidden claims" field, kept
  // separate from the emitted `string[]`. A controlled textarea whose value
  // is re-derived from `(value.forbiddenClaims ?? []).join(", ")` on every
  // keystroke would lose in-progress text (e.g. a trailing ", " while
  // typing a third entry gets silently dropped by the split/rejoin) and,
  // in tests, can desync React's controlled-input value tracker across
  // consecutive `fireEvent.change` calls. The ref lets a genuinely EXTERNAL
  // value change (e.g. "reset to auto") still resync the buffer, while an
  // echo of our own last emission does not clobber what the user is typing.
  const lastEmittedForbiddenClaimsRef = useRef<string[] | null>(null);
  const [forbiddenClaimsText, setForbiddenClaimsText] = useState(() =>
    (value.forbiddenClaims ?? []).join(", ")
  );
  const forbiddenClaimsSignature = JSON.stringify(value.forbiddenClaims ?? []);
  useEffect(() => {
    const incoming = value.forbiddenClaims ?? [];
    const lastEmitted = lastEmittedForbiddenClaimsRef.current;
    const matchesLastEmitted =
      lastEmitted !== null &&
      lastEmitted.length === incoming.length &&
      lastEmitted.every((entry, index) => entry === incoming[index]);
    if (!matchesLastEmitted) {
      setForbiddenClaimsText(incoming.join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forbiddenClaimsSignature]);

  if (!enabled || !evidencePreview) return null;

  const confirmedAttributes = value.confirmedAttributes ?? {};

  const toggleConfirmed = (attribute: string, claimText: string) => {
    const next = { ...confirmedAttributes };
    if (Object.prototype.hasOwnProperty.call(next, attribute)) {
      delete next[attribute];
    } else {
      next[attribute] = claimText;
    }
    onChange(applySequentialOverrideChange(value, { confirmedAttributes: next }));
  };

  const excludeItem = (id: string) => {
    setExcludedIds(previous => {
      const next = new Set(previous);
      next.add(id);
      return next;
    });
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
    >
      {/*
        Deliberately OUTSIDE CollapsibleContent. The guardian notice is a
        child-safety disclosure, so it must not sit behind a collapsed
        section the user has to discover and expand. The panel stays
        collapsed by default; this one notice does not.
      */}
      <SequentialGuardianNotice
        active={guardian.active}
        guardianReferenceAttached={guardian.guardianReferenceAttached}
        onOpenCharacterUpload={onOpenCharacterUpload}
        locale={locale}
      />

      <CollapsibleTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-slate-100"
        >
          <span>{copy.evidenceReviewTitle}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {copy.evidenceReviewDescription}
        </p>

        {evidencePreview.verifiedHighlights.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {copy.evidenceVerifiedHighlights}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {evidencePreview.verifiedHighlights.map((highlight, index) => (
                <Badge
                  key={`${highlight.attribute}-${index}`}
                  variant="secondary"
                  className="gap-1"
                >
                  <span className="font-semibold">{highlight.attribute}:</span>
                  <span>{highlight.value}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    ({highlight.source})
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {evidencePreview.needsConfirmation.length > 0 ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {copy.evidenceNeedsConfirmation}
            </p>
            <ul className="mt-2 space-y-2">
              {evidencePreview.needsConfirmation.map(item => {
                const isConfirmed = Object.prototype.hasOwnProperty.call(
                  confirmedAttributes,
                  item.attribute
                );
                const isExcluded = excludedIds.has(item.id);
                return (
                  <li
                    key={item.id}
                    className="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <p className="text-slate-800 dark:text-slate-100">{item.claimText}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {item.sources.join(", ")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        aria-pressed={isConfirmed}
                        onClick={() => toggleConfirmed(item.attribute, item.claimText)}
                        className={`rounded-md border px-3 py-1 text-xs font-semibold transition ${
                          isConfirmed
                            ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        }`}
                      >
                        {copy.evidenceConfirm}
                      </button>
                      <button
                        type="button"
                        onClick={() => excludeItem(item.id)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        {copy.evidenceReject}
                      </button>
                      {isExcluded ? (
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {copy.evidenceExcluded}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {copy.forbiddenClaimsLabel}
          </span>
          <Textarea
            aria-label={copy.forbiddenClaimsLabel}
            value={forbiddenClaimsText}
            onChange={event => {
              setForbiddenClaimsText(event.target.value);
              const list = splitForbiddenClaimsText(event.target.value);
              lastEmittedForbiddenClaimsRef.current = list;
              onChange(applySequentialOverrideChange(value, { forbiddenClaims: list }));
            }}
            className="min-h-16"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {copy.targetAudienceLabel}
          </span>
          <Input
            aria-label={copy.targetAudienceLabel}
            value={value.targetAudience ?? ""}
            onChange={event =>
              onChange(
                applySequentialOverrideChange(value, {
                  targetAudience: event.target.value,
                })
              )
            }
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {copy.userRequirementsLabel}
          </span>
          <Textarea
            aria-label={copy.userRequirementsLabel}
            value={value.userRequirements ?? ""}
            onChange={event =>
              onChange(
                applySequentialOverrideChange(value, {
                  userRequirements: event.target.value,
                })
              )
            }
            className="min-h-16"
          />
        </label>
      </CollapsibleContent>
    </Collapsible>
  );
}
