import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

export default function MapContextDraft({ contextText, onRemove }: { contextText: string; onRemove: () => void }) {
  const { t } = useScopedTranslation("chat");
  return <HStack as="section" gap={2} wrap="wrap" align="center" aria-label={t("mapContext.label")}>
    <StatusDot variant="accent" label={t("mapContext.badge")} />
    <Text>{t("mapContext.reviewBeforeSend")}</Text>
    <Text>{contextText}</Text>
    <Button label={t("mapContext.remove")} variant="ghost" size="sm" onClick={onRemove} />
  </HStack>;
}
