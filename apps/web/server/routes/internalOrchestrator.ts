/**
 * Internal Orchestrator REST Routes — Express routes for 046 integration.
 * Auth: SMARTSPEC_WEB_GATEWAY_TOKEN header.
 */

import { Router, type Request, type Response } from "express";
import * as interAgentService from "../services/interAgentService";
import { getPreferredInternalToken } from "../services/appRuntimeConfig";

const internalOrchestratorRouter = Router();

async function validateGatewayToken(req: Request, res: Response): Promise<boolean> {
  const gatewayToken = await getPreferredInternalToken();
  const token = req.headers["x-gateway-token"] as string;
  if (!token || token !== gatewayToken) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

internalOrchestratorRouter.post("/api/internal/orchestrator/system-impact", async (req, res) => {
  if (!(await validateGatewayToken(req, res))) return;

  const { tenantId, incidentType, affectedResources, recommendedAction } = req.body;
  if (!tenantId || !incidentType) {
    return res.status(400).json({ error: "tenantId and incidentType required" });
  }

  const result = await interAgentService.assessImpact(
    tenantId,
    incidentType,
    affectedResources ?? [],
    recommendedAction ?? "notify",
  );

  res.json({ affectedRuns: result, messagesDelivered: result.length });
});

internalOrchestratorRouter.post("/api/internal/orchestrator/system-broadcast", async (req, res) => {
  if (!(await validateGatewayToken(req, res))) return;

  const { tenantId, targetRoomIds, messageType, displayMessage, severity, relatedIncidentId } = req.body;
  if (!tenantId || !targetRoomIds?.length || !messageType) {
    return res.status(400).json({ error: "tenantId, targetRoomIds, and messageType required" });
  }

  const result = await interAgentService.sendSystemBroadcast(
    tenantId,
    targetRoomIds,
    messageType,
    displayMessage ?? "",
    severity ?? "normal",
    relatedIncidentId,
  );

  res.json(result);
});

internalOrchestratorRouter.post("/api/internal/virtual-admin/team-escalation", async (req, res) => {
  if (!(await validateGatewayToken(req, res))) return;

  const { tenantId, roomId, runId, assistantId, escalationType, context } = req.body;
  if (!tenantId || !roomId || !escalationType) {
    return res.status(400).json({ error: "tenantId, roomId, and escalationType required" });
  }

  const result = await interAgentService.handleTeamEscalation(
    tenantId,
    roomId,
    runId ?? "",
    assistantId ?? "system",
    escalationType,
    context ?? {},
  );

  res.json({ ...result, status: "received", estimatedResponseTime: "30s" });
});

export default internalOrchestratorRouter;
