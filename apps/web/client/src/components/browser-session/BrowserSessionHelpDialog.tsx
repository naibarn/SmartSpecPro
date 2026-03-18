import { useState } from "react";
import {
  Globe,
  HelpCircle,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n, AVAILABLE_LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

interface BrowserSessionHelpDialogProps {
  buttonClassName?: string;
  buttonLabel?: string;
  buttonSize?: "default" | "sm" | "lg" | "icon";
  buttonVariant?: "default" | "secondary" | "outline" | "ghost" | "link";
}

export function BrowserSessionHelpDialog({
  buttonClassName,
  buttonLabel = "Help",
  buttonSize = "sm",
  buttonVariant = "outline",
}: BrowserSessionHelpDialogProps) {
  const [open, setOpen] = useState(false);
  const { t, locale, setLocale } = useI18n();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        className={buttonClassName}
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="h-4 w-4" />
        {buttonLabel}
      </Button>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[85vw] lg:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2">
              <MonitorPlay className="h-5 w-5 text-cyan-700" />
              {t("bsHelp.title")}
            </DialogTitle>

            {/* ── Language toggle ── */}
            <div className="flex items-center gap-1 shrink-0">
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              {AVAILABLE_LOCALES.map((loc: Locale) => (
                <Button
                  key={loc}
                  type="button"
                  variant={locale === loc ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setLocale(loc)}
                >
                  {LOCALE_LABELS[loc]}
                </Button>
              ))}
            </div>
          </div>
          <DialogDescription>{t("bsHelp.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 text-sm text-slate-700">
          {/* What Browser Session does */}
          <section className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {t("bsHelp.what.title")}
            </h3>
            <p className="mt-2">{t("bsHelp.what.body")}</p>
          </section>

          {/* Quick start */}
          <section>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-700" />
              <h3 className="text-sm font-semibold text-slate-900">
                {t("bsHelp.quickStart.title")}
              </h3>
            </div>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              {[1, 2, 3, 4, 5].map((n) => (
                <li key={n}>{t(`bsHelp.quickStart.${n}`)}</li>
              ))}
            </ol>
          </section>

          {/* How to write a strong request */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              {t("bsHelp.request.title")}
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {[1, 2, 3].map((n) => (
                <li key={n}>{t(`bsHelp.request.${n}`)}</li>
              ))}
            </ul>
          </section>

          {/* Prompt examples */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              {t("bsHelp.prompts.title")}
            </h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600"
                >
                  {t(`bsHelp.prompts.${n}`)}
                </div>
              ))}
            </div>
          </section>

          {/* While the session is running */}
          <section>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-700" />
              <h3 className="text-sm font-semibold text-slate-900">
                {t("bsHelp.running.title")}
              </h3>
            </div>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {[1, 2, 3, 4].map((n) => (
                <li key={n}>{t(`bsHelp.running.${n}`)}</li>
              ))}
            </ul>
          </section>

          {/* Best practices */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              {t("bsHelp.best.title")}
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {[1, 2, 3, 4, 5].map((n) => (
                <li key={n}>{t(`bsHelp.best.${n}`)}</li>
              ))}
            </ul>
          </section>

          {/* Diverse use cases */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900">
              {t("bsHelp.useCases.title")}
            </h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {Array.from({ length: 18 }, (_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  {t(`bsHelp.useCases.${i + 1}`)}
                </div>
              ))}
            </div>
          </section>

          {/* When the AI should pause */}
          <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {t("bsHelp.pause.title")}
            </h3>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {[1, 2, 3].map((n) => (
                <li key={n}>{t(`bsHelp.pause.${n}`)}</li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
