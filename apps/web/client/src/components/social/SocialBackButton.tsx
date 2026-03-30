import { ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

export function SocialBackButton() {
  const { t } = useScopedTranslation("social");
  const [, setLocation] = useLocation();

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => setLocation("/dashboard")}
      className="gap-2 rounded-full border border-slate-200/80 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur transition hover:bg-slate-50 hover:text-slate-900"
    >
      <ChevronLeft className="h-4 w-4" />
      {t("backToDashboard")}
    </Button>
  );
}
