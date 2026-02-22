import { protectedProcedure, router } from "../_core/trpc";
import {
  PRESENTATION_EDITOR_ROUTE_BASE,
  PRESENTATION_ERROR_CODE,
  isPresentationFeatureEnabled,
} from "@shared/presentation/constants";
import {
  isPresentationItemType,
  presentationAvailabilitySchema,
  presentationRouteGuardInputSchema,
  presentationRouteGuardResultSchema,
  type PresentationAvailability,
  type PresentationRouteBlockedResult,
  type PresentationRouteGuardResult,
} from "@shared/presentation/contracts";

const DOCUMENT_MANAGEMENT_ROUTE_BASE =
  "/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=";

function buildWrongTypeGuard(itemId: number, itemType: string): PresentationRouteBlockedResult {
  return {
    allowed: false,
    itemId,
    itemType,
    errorCode: PRESENTATION_ERROR_CODE.ITEM_TYPE_MISMATCH,
    message: `Presentation editor only supports itemType=\"presentation\". Received \"${itemType}\".`,
    recoveryCta: {
      label: "Open in Document Management",
      href: `${DOCUMENT_MANAGEMENT_ROUTE_BASE}${itemId}`,
    },
  };
}

function buildFeatureDisabledGuard(itemId: number, itemType: string): PresentationRouteBlockedResult {
  return {
    allowed: false,
    itemId,
    itemType,
    errorCode: PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
    message: "Presentation editor is currently disabled.",
    recoveryCta: {
      label: "Open in Document Management",
      href: `${DOCUMENT_MANAGEMENT_ROUTE_BASE}${itemId}`,
    },
  };
}

function getAvailability(): PresentationAvailability {
  if (!isPresentationFeatureEnabled()) {
    return {
      enabled: false,
      errorCode: PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
      message: "Presentation editor is currently disabled.",
    };
  }

  return { enabled: true };
}

export const presentationRouter = router({
  availability: protectedProcedure.query(() => {
    return presentationAvailabilitySchema.parse(getAvailability());
  }),

  guardEditorOpen: protectedProcedure
    .input(presentationRouteGuardInputSchema)
    .query(({ input }): PresentationRouteGuardResult => {
      const availability = getAvailability();
      if (!availability.enabled) {
        return presentationRouteGuardResultSchema.parse(
          buildFeatureDisabledGuard(input.itemId, input.itemType),
        );
      }

      if (!isPresentationItemType(input.itemType)) {
        return presentationRouteGuardResultSchema.parse(
          buildWrongTypeGuard(input.itemId, input.itemType),
        );
      }

      return presentationRouteGuardResultSchema.parse({
        allowed: true,
        itemId: input.itemId,
        editorRoute: `${PRESENTATION_EDITOR_ROUTE_BASE}/${input.itemId}`,
      });
    }),
});
