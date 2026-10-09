import { useEffect, useState } from "react";
import { Button as AstryxButton } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { AssistantMascot, ASSISTANT_MASCOT_STYLES } from "@/components/assistant-mascot/AssistantMascot";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { useTenantFeatureFlagStatus } from "@/hooks/useTenantFeatureFlag";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { ASSISTANT_MASCOT_GLOBAL_ALLOW, isAssistantMascotEnabled } from "@/lib/assistantMascotFeatureGate";
import { assistantMascotStorageKey, DEFAULT_ASSISTANT_MASCOT_PREFERENCES, loadAssistantMascotPreferences, type AssistantMascotPreferences } from "@/lib/assistantMascotPreferences";
import { ASSISTANT_MASCOT_PREFERENCES_CHANGED_EVENT, requestAssistantMascotDemo } from "@/lib/assistantMascotEvents";

export function AssistantAppearancePreferences() {
  const { t } = useScopedTranslation("settings");
  const { user } = useAuth();
  const flag = useTenantFeatureFlagStatus("livingMascotDualSurface");
  const enabled = isAssistantMascotEnabled({
    globalAllowed: ASSISTANT_MASCOT_GLOBAL_ALLOW,
    tenantEnabled: flag.enabled,
    tenantResolved: flag.isResolved,
    tenantError: flag.isError,
  });
  const identity = user?.id && user.currentTenantId
    ? assistantMascotStorageKey(user.id, user.currentTenantId)
    : null;
  const [loadedPreferences, setLoadedPreferences] = useState<{
    identity: string | null;
    preferences: AssistantMascotPreferences;
  }>({
    identity: null,
    preferences: DEFAULT_ASSISTANT_MASCOT_PREFERENCES,
  });
  const preferences = loadedPreferences.identity === identity
    ? loadedPreferences.preferences
    : DEFAULT_ASSISTANT_MASCOT_PREFERENCES;

  useEffect(() => {
    if (!enabled || !identity || typeof window === "undefined") {
      setLoadedPreferences({ identity: null, preferences: DEFAULT_ASSISTANT_MASCOT_PREFERENCES });
      return;
    }
    setLoadedPreferences({
      identity,
      preferences: loadAssistantMascotPreferences(window.localStorage, identity),
    });
  }, [enabled, identity]);

  const update = (patch: Partial<AssistantMascotPreferences>) => {
    if (!enabled) return;
    const next = { ...preferences, ...patch, version: 2 as const };
    setLoadedPreferences({ identity, preferences: next });
    if (!identity || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(identity, JSON.stringify(next));
    } catch {
      // Storage can be unavailable in private browsing; the in-memory setting still applies.
    }
    window.dispatchEvent(new CustomEvent(ASSISTANT_MASCOT_PREFERENCES_CHANGED_EVENT, { detail: { key: identity, preferences: next } }));
  };

  if (!enabled) return null;

  return (
    <VStack as="section" gap={4} aria-labelledby="assistant-appearance-title" data-testid="assistant-appearance-preferences">
      <VStack as="div" gap={1}>
        <Heading id="assistant-appearance-title" level={3}>{t("assistantAppearance.title")}</Heading>
        <Text type="supporting">{t("assistantAppearance.description")}</Text>
      </VStack>
      <HStack as="div" gap={4} align="center" justify="between">
        <Label htmlFor="assistant-mascot-enabled">{t("assistantAppearance.enabled")}</Label>
        <Switch id="assistant-mascot-enabled" checked={preferences.enabled} onCheckedChange={checked => update({ enabled: checked })} />
      </HStack>
      {preferences.enabled && (
        <VStack as="div" gap={4}>
          <VStack as="fieldset" gap={3}>
            <legend><Text as="span" type="label">{t("assistantAppearance.style")}</Text></legend>
            <RadioGroup
              aria-label={t("assistantAppearance.style")}
              value={preferences.style}
              onValueChange={value => {
                if (ASSISTANT_MASCOT_STYLES.includes(value as AssistantMascotPreferences["style"])) {
                  update({ style: value as AssistantMascotPreferences["style"] });
                }
              }}
              className="flex flex-wrap gap-3"
              data-testid="assistant-mascot-style-options"
            >
              {ASSISTANT_MASCOT_STYLES.map(style => (
                <Label
                  key={style}
                  htmlFor={`assistant-mascot-style-${style}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-2"
                  data-testid={`assistant-mascot-style-${style}-preview`}
                >
                  <RadioGroupItem
                    id={`assistant-mascot-style-${style}`}
                    value={style}
                    aria-label={t(`assistantAppearance.styles.${style}`)}
                  />
                  <AssistantMascot style={style} size={32} />
                  <Text>{t(`assistantAppearance.styles.${style}`)}</Text>
                </Label>
              ))}
            </RadioGroup>
          </VStack>
          <AstryxButton label={t("assistantAppearance.demo")} type="button" variant="secondary" onClick={requestAssistantMascotDemo} />
          <HStack as="div" gap={4} align="center" justify="between">
            <Label htmlFor="assistant-notification-reminders">{t("assistantAppearance.reminders")}</Label>
            <Switch id="assistant-notification-reminders" checked={preferences.notificationReminders} onCheckedChange={checked => update({ notificationReminders: checked })} />
          </HStack>
          <HStack as="div" gap={4} align="center" justify="between">
            <Label htmlFor="assistant-chat-onboarding">{t("assistantAppearance.onboarding")}</Label>
            <Switch id="assistant-chat-onboarding" checked={preferences.chatOnboarding} onCheckedChange={checked => update({ chatOnboarding: checked })} />
          </HStack>
          <HStack as="div" gap={4} align="center" justify="between">
            <Label htmlFor="assistant-motion">{t("assistantAppearance.motion")}</Label>
            <select id="assistant-motion" value={preferences.motion} onChange={event => update({ motion: event.target.value as AssistantMascotPreferences["motion"] })}>
              <option value="off">{t("assistantAppearance.off")}</option>
              <option value="subtle">{t("assistantAppearance.subtle")}</option>
              <option value="normal">{t("assistantAppearance.normal")}</option>
            </select>
          </HStack>
        </VStack>
      )}
    </VStack>
  );
}
