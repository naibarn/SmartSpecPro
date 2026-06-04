import {
  type HyperframesPlatformPresetId,
  type HyperframesRenderIntent,
  type HyperframesTemplateDescriptor,
  type MarketplaceAutoReviewCompositionMode,
  type MarketplaceAutoReviewLaunchMode,
} from "@shared/hyperframes/contracts";
import {
  getDefaultHyperframesTemplate,
  getHyperframesPlatformPreset,
  isHyperframesTemplateCompatible,
  listHyperframesBuiltInTemplates,
  listHyperframesPlatformPresets,
} from "@shared/hyperframes/templates";

const runtimeDisabledTemplates = new Map<string, string>();

export function listHyperframesTemplateRegistry(input: {
  includeDisabled?: boolean;
  launchMode?: MarketplaceAutoReviewLaunchMode;
  compositionMode?: MarketplaceAutoReviewCompositionMode;
  renderIntent?: HyperframesRenderIntent;
  platformPresetId?: HyperframesPlatformPresetId;
  allowlist?: string[];
} = {}): HyperframesTemplateDescriptor[] {
  const allowlist = input.allowlist?.filter(Boolean) ?? [];
  return listHyperframesBuiltInTemplates({
    includeDisabled: input.includeDisabled,
    launchMode: input.launchMode,
    compositionMode: input.compositionMode,
    renderIntent: input.renderIntent,
    platformPresetId: input.platformPresetId,
  })
    .filter(template => allowlist.length === 0 || allowlist.includes(template.templateId))
    .map(template => {
      const disabledReason = runtimeDisabledTemplates.get(template.templateId);
      if (!disabledReason) return template;
      return {
        ...template,
        enabled: false,
        lifecycleState: "disabled" as const,
        disabledReason,
      };
    })
    .filter(template => input.includeDisabled || template.enabled);
}

export function selectHyperframesTemplate(input: {
  launchMode?: MarketplaceAutoReviewLaunchMode;
  compositionMode?: MarketplaceAutoReviewCompositionMode;
  renderIntent?: HyperframesRenderIntent;
  platformPresetId?: HyperframesPlatformPresetId;
  allowlist?: string[];
} = {}): HyperframesTemplateDescriptor {
  const template = listHyperframesTemplateRegistry({
    launchMode: input.launchMode ?? "auto_storyboard_review",
    compositionMode: input.compositionMode ?? "storyboard_motion_preview",
    renderIntent: input.renderIntent ?? "preview",
    platformPresetId: input.platformPresetId ?? "generic_vertical_9_16",
    allowlist: input.allowlist,
  })[0];
  return (
    template ??
    getDefaultHyperframesTemplate({
      launchMode: input.launchMode ?? "auto_storyboard_review",
      compositionMode: input.compositionMode ?? "storyboard_motion_preview",
      renderIntent: input.renderIntent ?? "preview",
      platformPresetId: input.platformPresetId ?? "generic_vertical_9_16",
    })
  );
}

export function disableHyperframesTemplate(
  templateId: string,
  reason: string
): void {
  runtimeDisabledTemplates.set(templateId, reason || "Disabled by operator");
}

export function enableHyperframesTemplate(templateId: string): void {
  runtimeDisabledTemplates.delete(templateId);
}

export {
  getHyperframesPlatformPreset,
  isHyperframesTemplateCompatible,
  listHyperframesPlatformPresets,
};
