import {
  PRESENTATION_EDITOR_ROUTE_BASE,
  PRESENTATION_ERROR_CODE,
  PRESENTATION_ITEM_TYPE,
} from "@shared/presentation/constants";
import type { PresentationRouteBlockedResult } from "@shared/presentation/contracts";

const DOCUMENT_MANAGEMENT_FALLBACK_PREFIX =
  "/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=";

export interface EditorOpenTarget {
  kind: "presentation" | "document_management";
  href: string;
}

export function getEditorOpenRouteForItem(item: { id: number; item_type: string }): EditorOpenTarget {
  if (item.item_type === PRESENTATION_ITEM_TYPE) {
    return {
      kind: "presentation",
      href: `${PRESENTATION_EDITOR_ROUTE_BASE}/${item.id}`,
    };
  }

  return {
    kind: "document_management",
    href: `${DOCUMENT_MANAGEMENT_FALLBACK_PREFIX}${item.id}`,
  };
}

export function buildWrongEditorOpenGuard(itemId: number, itemType: string): PresentationRouteBlockedResult {
  return {
    allowed: false,
    itemId,
    itemType,
    errorCode: PRESENTATION_ERROR_CODE.ITEM_TYPE_MISMATCH,
    message: `Presentation editor only supports itemType=\"presentation\". Received \"${itemType}\".`,
    recoveryCta: {
      label: "Open in Document Management",
      href: `${DOCUMENT_MANAGEMENT_FALLBACK_PREFIX}${itemId}`,
    },
  };
}
