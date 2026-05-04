import { AlertCircle } from "lucide-react";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { cn } from "@/lib/utils";

interface GeminiTtsPromptGuidanceProps {
  className?: string;
}

export function GeminiTtsPromptGuidance({ className }: GeminiTtsPromptGuidanceProps) {
  const { t } = useScopedTranslation(["media"]);

  return (
    <div className={cn("rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-sm text-sky-900", className)}>
      <div className="flex items-center gap-2 font-semibold">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {t("ttsGuidance.title")}
      </div>
      <p className="mt-2 text-xs leading-relaxed">
        {t("ttsGuidance.speakerPrefix")}{" "}
        <span className="font-mono">Host: Welcome back.</span> /{" "}
        <span className="font-mono">Guest: Glad to be here.</span>
      </p>
      <p className="mt-1 text-xs leading-relaxed">
        <span className="font-medium">voice</span> {t("ttsGuidance.voiceFallback")}{" "}
        <span className="font-medium">language_code</span> {t("ttsGuidance.languageAuto")}{" "}
        <span className="font-medium">style_instructions</span> {t("ttsGuidance.stylePlainText")}
      </p>
      <p className="mt-1 text-xs leading-relaxed">
        {t("ttsGuidance.expressivePrefix")} <span className="font-mono">[whispering]</span>{" "}
        {t("ttsGuidance.expressiveAnd")} <span className="font-mono">[short pause]</span>{" "}
        {t("ttsGuidance.expressiveSuffix")}
      </p>
    </div>
  );
}
