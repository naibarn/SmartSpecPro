import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeminiTtsPromptGuidanceProps {
  className?: string;
}

export function GeminiTtsPromptGuidance({ className }: GeminiTtsPromptGuidanceProps) {
  return (
    <div className={cn("rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-sm text-sky-900", className)}>
      <div className="flex items-center gap-2 font-semibold">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Gemini TTS script tips
      </div>
      <p className="mt-2 text-xs leading-relaxed">
        Use speaker aliases at the start of each line, for example{" "}
        <span className="font-mono">Host: Welcome back.</span> /{" "}
        <span className="font-mono">Guest: Glad to be here.</span>
      </p>
      <p className="mt-1 text-xs leading-relaxed">
        <span className="font-medium">voice</span> is the single-speaker fallback,{" "}
        <span className="font-medium">language_code</span> can stay on Auto-detect, and{" "}
        <span className="font-medium">style_instructions</span> should stay plain text.
      </p>
      <p className="mt-1 text-xs leading-relaxed">
        Expressive tags like <span className="font-mono">[whispering]</span> and{" "}
        <span className="font-mono">[short pause]</span> are supported.
      </p>
    </div>
  );
}

