/**
 * AutomationPage — Thin wrapper that opens AutomationChatModal as a full-page overlay.
 * Guards access via a lightweight analyze call — if the feature flag is disabled,
 * the backend will return FORBIDDEN and the user gets redirected.
 */

import { useLocation, useRoute } from "wouter";
import { AutomationChatModal } from "@/components/automation/AutomationChatModal";

export default function AutomationPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/automation/live/:sessionId");
  const initialLiveSessionId = params?.sessionId ?? null;

  return (
    <AutomationChatModal
      open={true}
      initialLiveSessionId={initialLiveSessionId}
      onLiveSessionOpen={(sessionId) => setLocation(`/automation/live/${sessionId}`)}
      onOpenChange={(open) => {
        if (!open) setLocation("/dashboard");
      }}
    />
  );
}
