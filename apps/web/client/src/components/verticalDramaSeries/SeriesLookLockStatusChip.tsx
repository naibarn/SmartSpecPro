import { Badge } from "@astryxdesign/core/Badge";
import { HStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";

import {
  getSeriesLookLockGenreIdentity,
  readSeriesLookLockControl,
  resolveEffectiveSeriesVisualIdentity,
} from "@shared/verticalDramaSeries/seriesLookLock";

export function SeriesLookLockStatusChip(props: {
  lang: "th" | "en";
  bible: unknown;
  lookLockEnabled: boolean;
  presetMixEnabled: boolean;
}) {
  if (!props.lookLockEnabled) return null;
  const record = props.bible && typeof props.bible === "object"
    ? props.bible as Record<string, unknown>
    : {};
  const control = readSeriesLookLockControl(record.lookLockControl);
  const identity = resolveEffectiveSeriesVisualIdentity({
    bible: record,
    presetMixEnabled: props.presetMixEnabled,
    lookLockEnabled: props.lookLockEnabled,
  });
  const label = control?.mode === "none"
    ? (props.lang === "th" ? "ไม่ล็อกลุค" : "No look lock")
    : control?.mode === "genre" && control.genreKey
      ? getSeriesLookLockGenreIdentity(control.genreKey).styleName
      : control?.mode === "manual"
        ? (props.lang === "th" ? "ลุคที่ปรับเอง" : "Custom look")
        : identity?.styleName ?? (props.lang === "th" ? "ลุคจากต้นทาง" : "Source look");

  return (
    <HStack gap={2} vAlign="center" wrap="wrap" aria-live="polite">
      <Text type="supporting" color="secondary">
        {props.lang === "th" ? "ลุคภาพซีรีส์" : "Series look"}
      </Text>
      <Badge
        variant={control?.mode === "none" ? "neutral" : identity ? "blue" : "warning"}
        label={label}
      />
    </HStack>
  );
}
