/**
 * AutomationPage — Thin wrapper that opens AutomationChatModal as a full-page overlay.
 */

import { useLocation } from "wouter";
import { AutomationChatModal } from "@/components/automation/AutomationChatModal";

export default function AutomationPage() {
  const [, setLocation] = useLocation();

  return (
    <AutomationChatModal
      open={true}
      onOpenChange={(open) => {
        if (!open) setLocation("/dashboard");
      }}
    />
  );
}
