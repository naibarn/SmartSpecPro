import type { Express, Request, Response } from "express";

import { clearTenantCache } from "../_core/tenant";
import { contentAutomationGate } from "../middleware/contentAutomationGate";
import { SmartAiHubContentManifestSchema } from "../../shared/smartaihubContentManifest";
import { getDb } from "../db";
import { importSmartAiHubContentManifest } from "../services/smartaihubContentImport";
import { pingSmartAiHubSearchEngines } from "../services/sitemapPing";
import { compareCachedInternalToken } from "../services/appRuntimeConfig";

function verifyInternalToken(req: Request): boolean {
  const token = req.headers["x-internal-token"] as string | undefined;
  return compareCachedInternalToken(token);
}

async function handleImport(req: Request, res: Response, tenantDomain?: string): Promise<void> {
  const parsed = SmartAiHubContentManifestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "Invalid manifest",
      details: parsed.error.flatten(),
    });
    return;
  }

  const db = await getDb();
  if (!db) {
    res.status(503).json({ success: false, error: "Database unavailable" });
    return;
  }

  try {
    const result = await importSmartAiHubContentManifest(db, parsed.data, tenantDomain);
    clearTenantCache();
    void pingSmartAiHubSearchEngines(tenantDomain || parsed.data.tenantDomain || "smartaihub.app").catch(() => {});
    res.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown import error";
    res.status(400).json({ success: false, error: message });
  }
}

export function registerContentManifestImportRoutes(app: Express): void {
  app.post("/api/internal/tools/content-manifest/import", contentAutomationGate, async (req, res) => {
    if (!verifyInternalToken(req)) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }
    await handleImport(req, res);
  });
}
