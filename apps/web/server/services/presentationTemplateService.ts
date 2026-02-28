import { PRESENTATION_ERROR_CODE } from "@shared/presentation/constants";
import type { PresentationAssetLink } from "../../drizzle/schema";

import { type LibraryItemDto, getLibraryItemById } from "./libraryService";
import {
  type PresentationActor,
  type AttachPresentationAssetInput,
  PresentationServiceError,
  attachAssetToDeck,
  listAssetsForDeck,
} from "./presentationService";
import {
  recordPresentationFailureMetric,
  recordPresentationLog,
} from "./presentationObservability";
import {
  validateTemplateAssetAgainstUploadPolicy,
  type TemplateAssetPolicyResult,
} from "./assetValidationPolicy";

export interface ApplyTemplateAssetToDeckInput {
  deckId: number;
  expectedVersion: number;
  templateAssetLibraryItemId: number;
  slideId?: number | null;
}

export interface ApplyTemplateAssetToDeckResult {
  applied: boolean;
  idempotent: boolean;
  link: PresentationAssetLink;
  totals?: {
    totalAssetBytes: number;
    warningExceeded: boolean;
    hardLimitExceeded: boolean;
  };
}

interface ApplyTemplateServiceDependencies {
  getLibraryItemById?: (itemId: number, actor: PresentationActor) => Promise<LibraryItemDto | null>;
  listAssetsForDeck?: (
    input: { deckId: number; slideId?: number | null },
    actor: PresentationActor,
  ) => Promise<PresentationAssetLink[]>;
  attachAssetToDeck?: (
    input: AttachPresentationAssetInput,
    actor: PresentationActor,
  ) => Promise<{
    link: PresentationAssetLink;
    totals: {
      totalAssetBytes: number;
      warningExceeded: boolean;
      hardLimitExceeded: boolean;
    };
  }>;
  validateTemplateAsset?: (item: LibraryItemDto) => TemplateAssetPolicyResult;
  recordLog?: (event: string, payload: Record<string, unknown>) => void;
  recordFailureMetric?: (errorCode: string) => void;
}

function resolveDependencies(
  dependencies?: ApplyTemplateServiceDependencies,
): Required<ApplyTemplateServiceDependencies> {
  return {
    getLibraryItemById: dependencies?.getLibraryItemById ?? getLibraryItemById,
    listAssetsForDeck: dependencies?.listAssetsForDeck ?? listAssetsForDeck,
    attachAssetToDeck: dependencies?.attachAssetToDeck ?? attachAssetToDeck,
    validateTemplateAsset: dependencies?.validateTemplateAsset ?? validateTemplateAssetAgainstUploadPolicy,
    recordLog: dependencies?.recordLog ?? recordPresentationLog,
    recordFailureMetric: dependencies?.recordFailureMetric ?? recordPresentationFailureMetric,
  };
}

function logTemplateApply(
  recordLog: (event: string, payload: Record<string, unknown>) => void,
  actor: PresentationActor,
  input: ApplyTemplateAssetToDeckInput,
  payload: Record<string, unknown>,
): void {
  recordLog("presentation_template_apply", {
    tenantId: actor.tenantId,
    userId: actor.userId,
    deckId: input.deckId,
    templateAssetLibraryItemId: input.templateAssetLibraryItemId,
    ...payload,
  });
}

function throwPermissionDenied(
  actor: PresentationActor,
  input: ApplyTemplateAssetToDeckInput,
  recordLog: (event: string, payload: Record<string, unknown>) => void,
  recordFailureMetric: (errorCode: string) => void,
): never {
  logTemplateApply(recordLog, actor, input, {
    outcome: "failed",
    errorCode: PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
    reasonCode: "template_scope_denied",
  });
  recordFailureMetric(PRESENTATION_ERROR_CODE.PERMISSION_DENIED);
  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.PERMISSION_DENIED,
    `${PRESENTATION_ERROR_CODE.PERMISSION_DENIED}: template attach is tenant scoped`,
  );
}

function throwPolicyFailure(
  actor: PresentationActor,
  input: ApplyTemplateAssetToDeckInput,
  policyResult: Extract<TemplateAssetPolicyResult, { ok: false }>,
  recordLog: (event: string, payload: Record<string, unknown>) => void,
  recordFailureMetric: (errorCode: string) => void,
): never {
  logTemplateApply(recordLog, actor, input, {
    outcome: "failed",
    errorCode: PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
    reasonCode: policyResult.reason,
    extension: policyResult.extension,
    mimeType: policyResult.mimeType,
  });
  recordFailureMetric(PRESENTATION_ERROR_CODE.VALIDATION_FAILED);
  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
    `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: template asset failed upload-equivalent validation`,
    {
      guidanceCode: "PRESENTATION_TEMPLATE_ASSET_POLICY_FAILED",
      policyReason: policyResult.reason,
    },
  );
}

function isSameScopeAsset(
  asset: Pick<PresentationAssetLink, "libraryItemId" | "slideId">,
  input: ApplyTemplateAssetToDeckInput,
): boolean {
  const targetSlideId = input.slideId ?? null;
  return asset.libraryItemId === input.templateAssetLibraryItemId
    && (asset.slideId ?? null) === targetSlideId;
}

export async function applyTemplateAssetToDeck(
  input: ApplyTemplateAssetToDeckInput,
  actor: PresentationActor,
  dependencies?: ApplyTemplateServiceDependencies,
): Promise<ApplyTemplateAssetToDeckResult> {
  const deps = resolveDependencies(dependencies);

  const templateItem = await deps.getLibraryItemById(input.templateAssetLibraryItemId, actor);
  if (!templateItem || templateItem.tenantId !== actor.tenantId) {
    throwPermissionDenied(actor, input, deps.recordLog, deps.recordFailureMetric);
  }

  const policyResult = deps.validateTemplateAsset(templateItem);
  if (!policyResult.ok) {
    throwPolicyFailure(actor, input, policyResult, deps.recordLog, deps.recordFailureMetric);
  }
  if (!Number.isFinite(policyResult.byteSize)) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: template asset byte_size is not finite`,
    );
  }

  const existingAssets = await deps.listAssetsForDeck(
    { deckId: input.deckId, slideId: input.slideId ?? null },
    actor,
  );
  const existing = existingAssets.find((asset) => isSameScopeAsset(asset, input));
  if (existing) {
    logTemplateApply(deps.recordLog, actor, input, {
      outcome: "idempotent",
      idempotent: true,
      linkId: existing.id,
    });
    return {
      applied: true,
      idempotent: true,
      link: existing,
    };
  }

  const attached = await deps.attachAssetToDeck(
    {
      deckId: input.deckId,
      expectedVersion: input.expectedVersion,
      slideId: input.slideId ?? null,
      libraryItemId: input.templateAssetLibraryItemId,
      byteSize: policyResult.byteSize,
    },
    actor,
  );

  logTemplateApply(deps.recordLog, actor, input, {
    outcome: "attached",
    idempotent: false,
    linkId: attached.link.id,
  });

  return {
    applied: true,
    idempotent: false,
    link: attached.link,
    totals: attached.totals,
  };
}
