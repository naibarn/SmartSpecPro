import type { Edge, Node } from "@xyflow/react";
import type { AgencyNodeData } from "./nodes/types";

export interface AgencySkillExportInput {
  skillName: string;
  description: string;
  category: string;
  agencyName: string;
  agencyId?: string | null;
  nodes: Array<Node<AgencyNodeData>>;
  edges: Array<Edge>;
  includedEdgeIds?: string[];
  defaultEngine?: string;
  documentVersion?: number;
  compileMode?: string;
  compatibilityMode?: string;
}

export interface AgencySkillExportPayload {
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  tags: string[];
  systemPrompt: string;
  skillContent: string;
  configJson: Record<string, unknown>;
}

function slugifySkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "exported-skill";
}

function formatNodeSummary(node: Node<AgencyNodeData>): string {
  const bits = [
    node.data.nodeType ?? "agent",
    node.data.description?.trim() || "",
    node.data.instructions?.trim() || "",
  ].filter(Boolean);
  return bits.join(" · ");
}

function indentBlock(text: string, indent = "  "): string[] {
  return text.split(/\r?\n/).map((line) => `${indent}${line}`);
}

export function buildAgencySkillExportPayload(input: AgencySkillExportInput): AgencySkillExportPayload {
  const selectedNodeNames = input.nodes.map((node) => node.data.name).filter(Boolean);
  const internalNodeIds = new Set(input.nodes.map((node) => node.id));
  const internalEdges = input.edges.filter(
    (edge) => internalNodeIds.has(edge.source) && internalNodeIds.has(edge.target),
  );
  const includedEdgeIds = new Set(
    input.includedEdgeIds?.length ? input.includedEdgeIds : internalEdges.map((edge) => edge.id),
  );
  const exportedEdges = internalEdges.filter((edge) => includedEdgeIds.has(edge.id));
  const tags = [...new Set(input.nodes.map((node) => node.data.nodeType ?? "agent").filter(Boolean))];
  const description = input.description.trim() || `Exported from ${input.agencyName || "Agency Builder"}`;
  const name = input.skillName.trim() || selectedNodeNames[0] || "Exported Skill";
  const slug = slugifySkillName(name);

  const nodeLines = input.nodes.length > 0
    ? input.nodes.map((node) => `- ${node.data.name} (${formatNodeSummary(node)})`)
    : ["- No nodes selected."];

  const edgeLines = exportedEdges.length > 0
    ? exportedEdges.map((edge) => `- ${edge.source} -> ${edge.target}${edge.data?.flowType ? ` (${String(edge.data.flowType)})` : ""}`)
    : ["- No internal edges selected."];

  const skillContent = [
    "---",
    `name: ${name}`,
    `category: ${input.category}`,
    `description: |`,
    ...indentBlock(description),
    "---",
    "",
    `# ${name}`,
    "",
    `Exported from Agency Builder${input.agencyName ? ` for ${input.agencyName}` : ""}.`,
    "",
    "## Selected nodes",
    ...nodeLines,
    "",
    "## Internal connections",
    ...edgeLines,
    "",
    "## Operating notes",
    description,
    "",
    "## Runtime context",
    `- documentVersion: ${input.documentVersion ?? 1}`,
    `- compileMode: ${input.compileMode ?? "legacy_agency"}`,
    `- compatibilityMode: ${input.compatibilityMode ?? "preserve_agency_swarm"}`,
    `- defaultEngine: ${input.defaultEngine ?? "agency_swarm"}`,
  ].join("\n");

  return {
    slug,
    name,
    description,
    category: input.category,
    icon: "package",
    tags,
    systemPrompt: [
      `You are the exported skill "${name}".`,
      `Follow the selected agency subgraph faithfully.`,
      `Preserve node intent, ordering, and any explicit instructions.`,
      description,
    ].join(" "),
    skillContent,
    configJson: {
      source: "agency_export",
      sourceAgencyId: input.agencyId ?? null,
      sourceAgencyName: input.agencyName,
      agencyName: input.agencyName,
      documentVersion: input.documentVersion ?? 1,
      compileMode: input.compileMode ?? "legacy_agency",
      compatibilityMode: input.compatibilityMode ?? "preserve_agency_swarm",
      defaultEngine: input.defaultEngine ?? "agency_swarm",
      selectedNodeIds: input.nodes.map((node) => node.id),
      selectedEdgeIds: exportedEdges.map((edge) => edge.id),
      exportedAt: new Date().toISOString(),
      nodes: input.nodes.map((node) => ({
        id: node.id,
        name: node.data.name,
        nodeType: node.data.nodeType ?? "agent",
        description: node.data.description ?? null,
        instructions: node.data.instructions ?? null,
        subgraphId: node.data.subgraphId ?? null,
        engineHint: node.data.engineHint ?? null,
        isEntryPoint: node.data.isEntryPoint ?? false,
        isOptional: node.data.isOptional ?? false,
        model: node.data.model ?? null,
        modelSettings: node.data.modelSettings ?? null,
        modelRequirements: node.data.modelRequirements ?? null,
        parallelToolCalls: node.data.parallelToolCalls ?? null,
        maxTurns: node.data.maxTurns ?? null,
        tools: node.data.tools ?? [],
        toolIds: node.data.toolIds ?? [],
        nodeConfig: node.data.nodeConfig ?? {},
        guardrailIds: node.data.guardrailIds ?? [],
        examples: node.data.examples ?? [],
        outputSchema: node.data.outputSchema ?? null,
        mcpServers: node.data.mcpServers ?? [],
        runtimeConfig: node.data.runtimeConfig ?? null,
      })),
      edges: exportedEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        flowType: edge.data?.flowType ?? "delegation",
      })),
    },
  };
}
