import { and, eq } from "drizzle-orm";

import { getDb } from "../../db";
import { invoiceAuditLogs, invoiceDocuments } from "../../../drizzle/schema";
import { storagePresignGet, storageResolveUrl } from "../../storage";

export async function listInvoiceDocuments(invoiceId: number) {
  const db = getDb();
  return db
    .select()
    .from(invoiceDocuments)
    .where(eq(invoiceDocuments.invoiceId, invoiceId));
}

export async function resolveInvoiceDocumentAccess(params: {
  invoiceId: number;
  documentId: number;
  ttlSeconds?: number;
  actorUserId?: number | null;
  actorType?: "system" | "admin" | "user";
}) {
  const db = getDb();
  const [document] = await db
    .select()
    .from(invoiceDocuments)
    .where(
      and(
        eq(invoiceDocuments.id, params.documentId),
        eq(invoiceDocuments.invoiceId, params.invoiceId),
      ),
    )
    .limit(1);

  if (!document) {
    return null;
  }

  if (!document.pdfFileUrl) {
    if (params.actorUserId) {
      await db.insert(invoiceAuditLogs).values({
        invoiceId: params.invoiceId,
        action: "invoice_document_accessed",
        actorType: params.actorType ?? "user",
        actorId: params.actorUserId,
        afterJson: {
          documentId: document.id,
          documentLanguage: document.documentLanguage,
          documentVersion: document.documentVersion,
          urlResolved: false,
        },
      });
    }
    return {
      document,
      url: null,
    };
  }

  let url: string;
  if (/^https?:\/\//i.test(document.pdfFileUrl)) {
    url = document.pdfFileUrl;
  } else {
    const presigned = await storagePresignGet(document.pdfFileUrl, params.ttlSeconds ?? 900);
    if (presigned?.url) {
      url = presigned.url;
    } else {
      const resolvedUrl = await storageResolveUrl(document.pdfFileUrl);
      if (!resolvedUrl) {
        throw new Error("Failed to resolve invoice document URL");
      }
      url = resolvedUrl;
    }
  }

  if (params.actorUserId) {
    await db.insert(invoiceAuditLogs).values({
      invoiceId: params.invoiceId,
      action: "invoice_document_accessed",
      actorType: params.actorType ?? "user",
      actorId: params.actorUserId,
      afterJson: {
        documentId: document.id,
        documentLanguage: document.documentLanguage,
        documentVersion: document.documentVersion,
        pdfFileUrl: document.pdfFileUrl,
      },
    });
  }

  return {
    document,
    url,
  };
}
