import type { Application, Request, Response } from "express";

import { sdk } from "../_core/sdk";
import { signBearerToken } from "../_core/tokens";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { filterWorkflowNodeRegistryForFlags } from "../services/workflowBrowserSessionFlags";
import { filterWorkflowWorkerRuntimeRegistryForFlags } from "../services/workflowWorkerRuntimeFlags";

function buildForwardHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const key of ["content-type", "accept"] as const) {
    const value = req.headers[key];
    if (typeof value === "string" && value.trim()) {
      headers[key] = value;
    }
  }

  if (req.requestId) {
    headers["x-request-id"] = req.requestId;
  }

  return headers;
}

async function resolveForwardAuth(
  req: Request,
): Promise<{ headers: Record<string, string>; tenantId: string | null }> {
  const headers = buildForwardHeaders(req);
  const existingAuth = req.headers.authorization;
  if (typeof existingAuth === "string" && existingAuth.trim()) {
    headers.authorization = existingAuth;
  }

  try {
    const user = await sdk.authenticateRequest(req);
    const tenantId = user.currentTenantId ? String(user.currentTenantId) : null;
    if (!headers.authorization) {
      const token = signBearerToken(
        {
          sub: String(user.id),
          type: "access",
          scopes: ["media:generate"],
        },
        "15m",
      );
      headers.authorization = `Bearer ${token}`;
    }
    return { headers, tenantId };
  } catch {
    return { headers, tenantId: null };
  }
}

export function registerWorkflowNodeTypesRoute(app: Application): void {
  app.get("/api/v1/workflows/node-types", async (req: Request, res: Response) => {
    try {
      const runtime = await getAppRuntimeConfig();
      const { headers, tenantId } = await resolveForwardAuth(req);
      const response = await fetch(`${runtime.pythonBackendUrl}/api/v1/workflows/node-types`, {
        method: "GET",
        headers,
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        return res.status(response.status).json(body ?? {
          detail: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const flags = tenantId
        ? await getTenantFeatureFlags(tenantId)
        : {
            workflowBrowserSessionNodes: false,
            openClawExternalRuntime: false,
            desktopZeroClawWorker: false,
            nemoClawSecureWorkerPool: false,
            hiClawClusterRuntime: false,
          };

      const nodeTypes = Array.isArray(body?.node_types) ? body.node_types : [];

      return res.status(200).json({
        ...(body && typeof body === "object" ? body : {}),
        node_types: filterWorkflowWorkerRuntimeRegistryForFlags(
          filterWorkflowNodeRegistryForFlags(nodeTypes, flags),
          flags,
        ),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch workflow node types";
      console.error("[workflowNodeTypes] request failed:", message);
      return res.status(500).json({
        detail: "Failed to fetch workflow node types",
      });
    }
  });
}
