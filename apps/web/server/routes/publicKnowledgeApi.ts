import { Router } from "express";
import { z } from "zod";

import { requireScopes } from "../middleware/requireScopes";
import { sendApiError } from "../middleware/publicApiHeaders";
import {
  calculateLibraryUploadCreditCost,
  chargeForRagQuery,
  getCreditBalance,
} from "../services/creditService";
import {
  searchLibraryItems,
  uploadLibraryFile,
  type LibraryActor,
} from "../services/libraryService";
import {
  assertDelegatedWorkerGrant,
  WorkerDelegationError,
} from "../services/workerDelegationService";
import {
  buildDelegatedWorkerOriginMetadata,
  DelegatedWorkerPlatformError,
  enforceDelegatedWorkerSpendGuardrails,
  runWithDelegatedWorkerExecution,
} from "../services/delegatedWorkerPlatformService";

const SearchBodySchema = z.object({
  query: z.string().max(1000).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
  itemType: z.string().min(1).max(32).optional(),
  folderId: z.number().int().positive().nullable().optional(),
});

const UploadBodySchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(255),
  fileBase64: z.string().min(1).max(68_000_000),
  title: z.string().min(1).max(255).optional(),
  visibility: z.enum(["private", "team", "public"]).optional(),
  parentId: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const RagSearchBodySchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().min(1).max(20).optional(),
  offset: z.number().int().min(0).optional(),
});

function toOwnerActor(auth: Record<string, unknown>): LibraryActor {
  return {
    userId: Number(auth.userId),
    tenantId: String(auth.tenantId),
    role: "user",
  };
}

function ownerFilter(auth: Record<string, unknown>): { ownerUserId: number } {
  const ownerUserId = Number(auth.ownerUserId ?? auth.userId);
  return { ownerUserId };
}

function handleKnowledgeRouteError(res: Parameters<typeof sendApiError>[0], error: unknown): void {
  if (error instanceof WorkerDelegationError || error instanceof DelegatedWorkerPlatformError) {
    sendApiError(res, error.statusCode, error.code, error.message, error.type);
    return;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("insufficient credits")) {
      sendApiError(res, 402, "insufficient_credits", error.message, "billing_error");
      return;
    }
    if (
      message.includes("file type is not supported")
      || message.includes("file extension")
      || message.includes("unsafe svg")
      || message.includes("file too large")
      || message.includes("private vault")
    ) {
      sendApiError(res, 400, "invalid_request", error.message);
      return;
    }
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  sendApiError(res, 500, "internal_error", message, "internal_error");
}

export function createPublicKnowledgeRouter(): Router {
  const router = Router();

  router.post("/library/search", requireScopes("library:search"), async (req, res) => {
    try {
      const parsed = SearchBodySchema.parse(req.body ?? {});
      const auth = req.auth! as Record<string, unknown>;
      await assertDelegatedWorkerGrant(auth as any, {
        grantType: "library_search_scope",
      });

      const result = await runWithDelegatedWorkerExecution({
        auth: auth as any,
        actionClass: "read",
      }, async () =>
        searchLibraryItems(
          {
            query: parsed.query,
            limit: parsed.limit,
            offset: parsed.offset,
            folderId: parsed.folderId,
            scope: "my_library",
            filters: {
              ...(parsed.itemType ? { itemType: parsed.itemType } : {}),
              ...ownerFilter(auth),
            },
          },
          toOwnerActor(auth),
        ));

      res.json(result);
    } catch (error) {
      handleKnowledgeRouteError(res, error);
    }
  });

  router.post("/library/upload", requireScopes("library:upload"), async (req, res) => {
    try {
      const parsed = UploadBodySchema.parse(req.body ?? {});
      const auth = req.auth! as Record<string, unknown>;
      const idempotencyKey = req.get("Idempotency-Key") || undefined;
      await assertDelegatedWorkerGrant(auth as any, {
        grantType: "library_upload_policy",
      });

      const fileBase64 = parsed.fileBase64.includes(",")
        ? parsed.fileBase64.split(",", 2)[1]
        : parsed.fileBase64;
      const estimatedSizeBytes = Buffer.byteLength(fileBase64, "base64");
      const estimatedBilling = await calculateLibraryUploadCreditCost(parsed.fileType, estimatedSizeBytes);
      const result = await runWithDelegatedWorkerExecution({
        auth: auth as any,
        actionClass: "compute",
        estimatedCredits: estimatedBilling.totalCredits,
        idempotencyKey,
      }, async () =>
        uploadLibraryFile(
          {
            ...parsed,
            metadata: {
              ...(parsed.metadata ?? {}),
              ownerUserId: Number(auth.userId),
            },
            billingMetadata: buildDelegatedWorkerOriginMetadata(auth as any, "library.upload", {
              endpoint: "/v1/knowledge/library/upload",
              estimatedCredits: estimatedBilling.totalCredits,
              fileName: parsed.fileName,
              fileType: parsed.fileType,
              estimatedSizeBytes,
            }),
          },
          toOwnerActor(auth),
        ));

      let remaining = 0;
      try {
        const balance = await getCreditBalance(Number(auth.userId));
        remaining = balance?.credits ?? 0;
      } catch {
        // Non-fatal for upload response.
      }
      res.setHeader("X-Credits-Used", String(result.billing.creditsCharged));
      res.setHeader("X-Credits-Remaining", String(remaining));
      res.status(201).json(result);
    } catch (error) {
      handleKnowledgeRouteError(res, error);
    }
  });

  router.post("/rag/search", requireScopes("rag:search"), async (req, res) => {
    try {
      const parsed = RagSearchBodySchema.parse(req.body ?? {});
      const auth = req.auth! as Record<string, unknown>;
      const idempotencyKey = req.get("Idempotency-Key") || undefined;
      await assertDelegatedWorkerGrant(auth as any, {
        grantType: "rag_scope",
        requireScopeFlag: "search",
      });
      const { result, billing } = await runWithDelegatedWorkerExecution({
        auth: auth as any,
        actionClass: "read",
        estimatedCredits: 1,
        idempotencyKey,
      }, async () => {
        const result = await searchLibraryItems(
          {
            query: parsed.query,
            limit: parsed.limit ?? 10,
            offset: parsed.offset,
            scope: "my_library",
            filters: ownerFilter(auth),
          },
          toOwnerActor(auth),
        );

        const billing = await chargeForRagQuery({
          userId: Number(auth.userId),
          service: "rag.semantic_search",
          tenantId: String(auth.tenantId),
          idempotencyKey,
          metadata: buildDelegatedWorkerOriginMetadata(auth as any, "rag.search", {
            endpoint: "/v1/knowledge/rag/search",
            query: parsed.query.slice(0, 200),
          }),
        });

        return { result, billing };
      });

      let remaining = 0;
      try {
        const balance = await getCreditBalance(Number(auth.userId));
        remaining = balance?.credits ?? 0;
      } catch {
        // Non-fatal for search response.
      }

      res.setHeader("X-Credits-Used", String(billing.creditsUsed));
      res.setHeader("X-Credits-Remaining", String(remaining));
      res.json({
        ...result,
        credits_used: billing.creditsUsed,
      });
    } catch (error) {
      handleKnowledgeRouteError(res, error);
    }
  });

  return router;
}
