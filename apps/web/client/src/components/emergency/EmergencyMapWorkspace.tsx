import { isEmergencyMapItemSelectable, toMapContextReference, type EmergencyMapItem } from "./emergencyMapFeatures";
import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

export default function EmergencyMapWorkspace({ items, visibleLayers, selectedItem, onClearSelection, onLayerChange, onSelectItem, onAskAI, canAskAI }: {
  items: EmergencyMapItem[];
  visibleLayers: { locations: boolean; alertAreas: boolean };
  selectedItem: EmergencyMapItem | null;
  onClearSelection: () => void;
  onLayerChange: (layer: "locations" | "alertAreas", visible: boolean) => void;
  onSelectItem: (item: EmergencyMapItem) => void;
  onAskAI: () => void;
  canAskAI: boolean;
}) {
  const { t } = useScopedTranslation("emergency");
  const locations = items.filter(item => Boolean(item.location));
  const selectableItems = items.filter(isEmergencyMapItemSelectable);
  const areas = items.filter(item => item.kind === "alert" && Boolean(item.publicGeometry));
  return <VStack as="section" gap={3} aria-label={t("map.workspaceLabel")}>
    <Grid columns={{ minWidth: 260, max: 2 }} gap={3}>
      <VStack as="section" gap={1}>
        <Heading level={3}>{t("map.layersTitle")}</Heading>
        <Switch label={t("map.locationsLayer")} value={visibleLayers.locations} onChange={checked => onLayerChange("locations", checked)} />
        <Switch label={t("map.alertAreasLayer")} value={visibleLayers.alertAreas} onChange={checked => onLayerChange("alertAreas", checked)} />
      </VStack>
      <VStack as="section" gap={1}>
        <Heading level={3}>{t("map.coverageTitle")}</Heading>
        <Text>{t("map.locationsCount", { count: locations.length })}</Text>
        <Text>{t("map.alertAreasCount", { count: areas.length })}</Text>
        <Button label={t("map.askAIAboutMap")} variant="primary" isDisabled={!canAskAI} onClick={onAskAI} />
      </VStack>
    </Grid>
    {selectedItem && <VStack as="section" gap={1} aria-live="polite" aria-label={t("map.selectedFeatureLabel")}>
      <Heading level={3}>{typeof selectedItem.title === "string" ? selectedItem.title.slice(0, 200) : t("map.untitledFeature")}</Heading>
      <Text>{[selectedItem.kind, selectedItem.status, selectedItem.freshness].filter(value => typeof value === "string" && value).join(" · ")}</Text>
      {!toMapContextReference(selectedItem) && <Text>{t("map.selectionContextUnavailable")}</Text>}
      <Button label={t("map.clearSelection")} variant="secondary" onClick={onClearSelection} />
    </VStack>}
    <VStack as="section" gap={1} aria-label={t("map.featureListLabel")}>
      <Heading level={3}>{t("map.featureListTitle")}</Heading>
      {selectableItems.length === 0 ? <Text>{t("map.noFeatures")}</Text> : selectableItems.map((item, index) => {
        const title = typeof item.title === "string" && item.title.trim() ? item.title.slice(0, 200) : t("map.untitledFeature");
        const details = [item.kind, item.status, item.freshness].filter(value => typeof value === "string" && value).join(" · ");
        const isSelected = selectedItem?.publicRef === item.publicRef;
        return <Button key={typeof item.publicRef === "string" ? item.publicRef : `${title}-${index}`} label={isSelected ? `${t("map.selectedFeature")}: ${title}` : title} variant={isSelected ? "primary" : "secondary"} onClick={() => onSelectItem(item)}>
          {details ? `${title} · ${details}` : title}
        </Button>;
      })}
    </VStack>
  </VStack>;
}
