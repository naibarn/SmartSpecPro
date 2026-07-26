import { Sparkles, SlidersHorizontal } from "lucide-react";
import type { MarketplaceAutoReviewLaunchMode } from "@shared/hyperframes/contracts";
import {
  getMarketplaceHyperframesUiCopy,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

interface MarketplaceAutoReviewLaunchModeSwitchProps {
  value: MarketplaceAutoReviewLaunchMode;
  onChange: (value: MarketplaceAutoReviewLaunchMode) => void;
  autoEnabled: boolean;
  standardAvailable: boolean;
  showStandardOption?: boolean;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function MarketplaceAutoReviewLaunchModeSwitch({
  value,
  onChange,
  autoEnabled,
  standardAvailable,
  showStandardOption = true,
  locale,
}: MarketplaceAutoReviewLaunchModeSwitchProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const modes = [
    {
      value: "auto_storyboard_review" as const,
      label: "Auto",
      description: autoEnabled
        ? copy.locale === "th"
          ? "แนะนำ"
          : "Recommended"
        : copy.locale === "th"
          ? "ดูเหตุผล"
          : "Review blockers",
      icon: Sparkles,
      disabled: false,
      unavailable: !autoEnabled,
    },
    ...(showStandardOption
      ? [
          {
            value: "standard_order" as const,
            label: "Standard",
            description: standardAvailable
              ? copy.locale === "th"
                ? "ใช้ control เดิม"
                : "Manual controls"
              : copy.locale === "th"
                ? "ยังไม่พร้อม"
                : "Unavailable",
            icon: SlidersHorizontal,
            disabled: !standardAvailable,
            unavailable: !standardAvailable,
          },
        ]
      : []),
  ];

  return (
    <div
      className={`grid w-full rounded-lg border bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900 ${showStandardOption ? "grid-cols-2" : "grid-cols-1"}`}
      role="group"
      aria-label={copy.launchModeGroup}
    >
      {modes.map(mode => {
        const Icon = mode.icon;
        const active = value === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            aria-label={
              mode.value === "auto_storyboard_review"
                ? copy.autoModeLabel
                : copy.standardModeLabel
            }
            aria-pressed={active}
            aria-disabled={mode.unavailable}
            title={
              mode.unavailable
                ? mode.value === "auto_storyboard_review"
                  ? copy.autoBlockedStandardAvailable
                  : mode.description
                : undefined
            }
            disabled={mode.disabled}
            onClick={() => onChange(mode.value)}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? "bg-white text-slate-950 shadow-sm dark:bg-slate-100 dark:text-slate-950"
                : mode.unavailable
                  ? "text-amber-700 hover:bg-white/70 dark:text-amber-300 dark:hover:bg-slate-800"
                  : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 text-left">
              <span className="block leading-5">{mode.label}</span>
              <span className="block text-xs font-normal leading-4 text-slate-500 dark:text-slate-400">
                {mode.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
