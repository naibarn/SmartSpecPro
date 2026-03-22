import {
  presentationCustomBlockRecordSchema,
  type PresentationCustomBlock,
} from "@shared/presentation/customBlocks";
import type { PresentationComponentSlotBinding } from "@shared/presentation/contracts";

const LEGACY_PRESENTATION_CUSTOM_BLOCKS_STORAGE_KEY = "smartspec:presentation-custom-blocks:v1";

export type PresentationCustomBlockDefinition = PresentationCustomBlock;

function cloneSlotBinding(binding: PresentationComponentSlotBinding): PresentationComponentSlotBinding {
  if (binding.type === "list") {
    return {
      ...binding,
      items: [...binding.items],
    };
  }
  return {
    ...binding,
  };
}

export function clonePresentationCustomBlock(
  block: PresentationCustomBlockDefinition,
): PresentationCustomBlockDefinition {
  return {
    ...block,
    favoriteUserIds: [...block.favoriteUserIds],
    preview: block.preview ? { ...block.preview } : undefined,
    previewSource: block.previewSource
      ? {
        canvas: { ...block.previewSource.canvas },
        fallbackElements: block.previewSource.fallbackElements.map((element) => ({ ...element })),
        background: block.previewSource.background ? { ...block.previewSource.background } : undefined,
      }
      : undefined,
    governanceEvents: (block.governanceEvents ?? []).map((event) => ({ ...event })),
    slotBindings: block.slotBindings.map(cloneSlotBinding),
  };
}

export function loadLegacyPresentationCustomBlocks(): PresentationCustomBlockDefinition[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_PRESENTATION_CUSTOM_BLOCKS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry, index) => {
      const result = presentationCustomBlockRecordSchema.safeParse(entry);
      if (!result.success) {
        return [];
      }
      return [{
        id: `legacy-${index + 1}`,
        ownerUserId: 0,
        canDelete: true,
        canFeature: false,
        canTransferOwnership: false,
        isFavorite: false,
        ...result.data,
      }];
    }).map(clonePresentationCustomBlock);
  } catch {
    return [];
  }
}
