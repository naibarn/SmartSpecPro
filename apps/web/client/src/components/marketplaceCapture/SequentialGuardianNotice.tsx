/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §6.3. §17.5 guardian informational notice. Renders `null`
 * unless `active`. NEVER renders a toggle, checkbox, or dismiss control —
 * the guardian policy has no opt-out (spec §17.2); the only interactive
 * element permitted is an optional link/button that focuses the existing
 * "อัปโหลด reference" character-mode flow.
 */
import { Info } from "lucide-react";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

export interface SequentialGuardianNoticeProps {
  active: boolean;
  guardianReferenceAttached: boolean;
  onOpenCharacterUpload?: () => void;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function SequentialGuardianNotice({
  active,
  guardianReferenceAttached,
  onOpenCharacterUpload,
  locale,
}: SequentialGuardianNoticeProps) {
  if (!active) return null;
  const copy = getMarketplaceHyperframesUiCopy(locale);

  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-100"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">{copy.guardianNoticeTitle}</p>
        <p className="leading-6">{copy.guardianNoticeBody}</p>
        {guardianReferenceAttached ? (
          <p className="font-medium text-emerald-700 dark:text-emerald-300">
            {copy.guardianNoticeAttached}
          </p>
        ) : onOpenCharacterUpload ? (
          <button
            type="button"
            onClick={onOpenCharacterUpload}
            className="font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-200 dark:hover:text-sky-50"
          >
            {copy.guardianNoticeAttach}
          </button>
        ) : (
          <p className="font-medium text-sky-800 dark:text-sky-200">
            {copy.guardianNoticeAttach}
          </p>
        )}
      </div>
    </div>
  );
}
