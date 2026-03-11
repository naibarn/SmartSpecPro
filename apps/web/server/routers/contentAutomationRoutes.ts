import type { Express } from "express";
import { contentAutomationGate } from "../middleware/contentAutomationGate";

/**
 * Register content automation internal tool routes.
 *
 * Applies the feature-flag gate middleware to all /api/internal/tools/* paths.
 * Actual tool handlers are registered by their dedicated router files (sections 02-05, 08).
 */
export function registerContentAutomationRoutes(app: Express): void {
  app.use("/api/internal/tools", contentAutomationGate);
}
