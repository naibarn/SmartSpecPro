import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@smartspec/ui/src/components/ui/button";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { FeedbackButton } from "./FeedbackButton";

export function RouteAwareFeedbackButton() {
  const [location] = useLocation();
  const [loginAssistantRequested, setLoginAssistantRequested] = useState(false);
  const pathname = location.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  const { t } = useScopedTranslation("settings");

  if (pathname.toLowerCase() === "/login") {
    if (loginAssistantRequested) {
      return <FeedbackButton initiallyOpen />;
    }

    // Keep the sign-in page free of the assistant's auth, portal, and mascot
    // lifecycles until the visitor explicitly opens the assistant.
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t("assistantAppearance.launcherAriaLabel")}
        className="fixed bottom-4 right-4 z-50 h-16 w-16 rounded-full bg-white text-slate-900 shadow-lg hover:bg-slate-100 md:h-20 md:w-20"
        onClick={() => setLoginAssistantRequested(true)}
      >
        <span aria-hidden="true" className="text-2xl leading-none">
          ✦
        </span>
      </Button>
    );
  }

  return <FeedbackButton />;
}
