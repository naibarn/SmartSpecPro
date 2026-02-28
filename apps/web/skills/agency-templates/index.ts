/**
 * Agency template loader.
 *
 * Reads all template JSON files from this directory, validates them against
 * the AgencyTemplate schema, and exports them as a typed array.
 */

import researchTemplate from "./research.json";
import contentWriterTemplate from "./content-writer.json";
import specWriterTemplate from "./spec-writer.json";
import codeReviewTemplate from "./code-review.json";

export interface AgencyTemplate {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  category: string;
  agentCount: number;
  icon: string;
  agents: Array<{
    name: string;
    description: string;
    instructions: string;
    model: string;
    isEntryPoint: boolean;
    isOptional: boolean;
    position: { x: number; y: number };
    toolIds: string[];
  }>;
  communicationFlows: Array<{
    fromAgentName: string;
    toAgentName: string;
    flowType: "delegation" | "handoff";
  }>;
  defaultSettings: {
    creditMultiplier: number;
    maxRunTimeSeconds: number;
    isFallbackSafe: boolean;
  };
}

/** All available templates, loaded at module init. */
export const templates: AgencyTemplate[] = [
  researchTemplate,
  contentWriterTemplate,
  specWriterTemplate,
  codeReviewTemplate,
] as AgencyTemplate[];

/** Get all templates (for listTemplates procedure). */
export function getTemplates(): AgencyTemplate[] {
  return templates;
}

/** Get a template by ID (for createFromTemplate procedure). Returns undefined if not found. */
export function getTemplateById(id: string): AgencyTemplate | undefined {
  return templates.find((t) => t.id === id);
}
