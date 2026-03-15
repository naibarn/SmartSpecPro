import { eq } from "drizzle-orm";

import { db } from "../db";
import { agencies, agencyTemplates, agentTemplates } from "../../drizzle/schema";

type DbClient = typeof db;

export type AgencyRetrievalScopeMode =
  | "tenant_accessible"
  | "library_only"
  | "web_fallback";

export interface ResolvedAgencyRetrievalScope {
  version: 1;
  experienceKey: string;
  templateDefault: AgencyRetrievalScopeMode;
  userOverride: AgencyRetrievalScopeMode | null;
  effectiveMode: AgencyRetrievalScopeMode;
  permissionFilter: {
    tenantId: string;
    userId: number;
  };
}

interface AgencyExperienceTemplateDefinition {
  templateId: string;
  agentTemplateId: string;
  name: string;
  description: string;
  category: string;
  systemPrompt: string;
  agentName: string;
  agentDescription: string;
  agentInstructions: string;
  defaultTools: string[];
  experienceKey: string;
  defaultIntent: string;
  retrievalScope: {
    templateDefault: AgencyRetrievalScopeMode;
    allowUserOverride: boolean;
  };
}

const EXPERIENCE_TEMPLATES: AgencyExperienceTemplateDefinition[] = [
  {
    templateId: "platform-deep-research",
    agentTemplateId: "platform-deep-research-agent",
    name: "Deep Research",
    description: "Platform starter for evidence-backed research synthesis with structured report previews.",
    category: "Research",
    systemPrompt: "Produce structured research summaries from tenant-authorized sources and optional web fallback.",
    agentName: "Deep Research Lead",
    agentDescription: "Synthesizes library evidence into a research report preview.",
    agentInstructions:
      "Use library search first, widen to web fallback only when needed, and return a structured research_report envelope.",
    defaultTools: [
      "builtin-rag-knowledge",
      "builtin-document-search",
      "builtin-web-search",
      "builtin-skill-executor",
    ],
    experienceKey: "deep_research",
    defaultIntent: "research_report",
    retrievalScope: {
      templateDefault: "tenant_accessible",
      allowUserOverride: true,
    },
  },
  {
    templateId: "platform-storyboard-planner",
    agentTemplateId: "platform-storyboard-planner-agent",
    name: "Storyboard Planner",
    description: "Platform starter for scene-by-scene storyboard previews and prompt planning.",
    category: "Media",
    systemPrompt: "Plan storyboard scenes and prompt-ready media guidance from a brief and optional library references.",
    agentName: "Storyboard Planner",
    agentDescription: "Builds structured storyboard previews from a brief.",
    agentInstructions:
      "Prefer library context when available, then create a structured video_storyboard envelope with prompt-ready scenes.",
    defaultTools: [
      "builtin-rag-knowledge",
      "builtin-skill-executor",
    ],
    experienceKey: "storyboard_planner",
    defaultIntent: "video_storyboard",
    retrievalScope: {
      templateDefault: "library_only",
      allowUserOverride: true,
    },
  },
  {
    templateId: "platform-deck-builder",
    agentTemplateId: "platform-deck-builder-agent",
    name: "Deck Builder",
    description: "Platform starter for `AIPresentationSlide[]` previews and presentation commits.",
    category: "Presentation",
    systemPrompt: "Generate presentation-ready deck previews that can be committed into the editor after confirmation.",
    agentName: "Deck Builder",
    agentDescription: "Builds structured slide previews from a topic or brief.",
    agentInstructions:
      "Use library context and writing skills as needed, then return a structured presentation_deck envelope with `AIPresentationSlide[]` payloads.",
    defaultTools: [
      "builtin-rag-knowledge",
      "builtin-document-search",
      "builtin-skill-executor",
    ],
    experienceKey: "deck_builder",
    defaultIntent: "presentation_deck",
    retrievalScope: {
      templateDefault: "tenant_accessible",
      allowUserOverride: true,
    },
  },
];

export async function ensureBuiltInAgencyExperienceTemplates(
  dbClient: DbClient = db,
): Promise<void> {
  const seededTemplates = EXPERIENCE_TEMPLATES.map((template) => ({
    id: template.templateId,
    name: template.name,
    description: template.description,
    systemPrompt: template.systemPrompt,
    category: template.category,
    isActive: true,
  }));
  await dbClient
    .insert(agencyTemplates)
    .values(seededTemplates)
    .onConflictDoNothing();

  for (const template of seededTemplates) {
    await dbClient
      .update(agencyTemplates)
      .set({
        name: template.name,
        description: template.description,
        systemPrompt: template.systemPrompt,
        category: template.category,
        isActive: true,
      })
      .where(eq(agencyTemplates.id, template.id));
  }

  const seededAgents = EXPERIENCE_TEMPLATES.map((template) => ({
    id: template.agentTemplateId,
    agencyTemplateId: template.templateId,
    name: template.agentName,
    role: template.agentName,
    description: template.agentDescription,
    instructions: template.agentInstructions,
    category: template.category,
    defaultModel: null,
    isEntryPoint: true,
    position: { x: 0, y: 0 },
    defaultTools: template.defaultTools,
  }));
  await dbClient
    .insert(agentTemplates)
    .values(seededAgents)
    .onConflictDoNothing();

  for (const agent of seededAgents) {
    await dbClient
      .update(agentTemplates)
      .set({
        agencyTemplateId: agent.agencyTemplateId,
        name: agent.name,
        role: agent.role,
        description: agent.description,
        instructions: agent.instructions,
        category: agent.category,
        defaultModel: agent.defaultModel,
        isEntryPoint: true,
        position: agent.position,
        defaultTools: agent.defaultTools,
      })
      .where(eq(agentTemplates.id, agent.id));
  }
}

export async function resolveAgencyRetrievalScope(params: {
  agencyId: string;
  tenantId: string;
  userId: number;
  overrideMode?: AgencyRetrievalScopeMode | null;
  dbClient?: DbClient;
}): Promise<ResolvedAgencyRetrievalScope | null> {
  const dbClient = params.dbClient ?? db;
  const [agencyRow] = await dbClient
    .select({
      sourceTemplateId: agencies.sourceTemplateId,
      slug: agencies.slug,
    })
    .from(agencies)
    .where(eq(agencies.id, params.agencyId))
    .limit(1);

  const persistedTemplateId = typeof agencyRow?.sourceTemplateId === "string" ? agencyRow.sourceTemplateId : null;
  const slug = String(agencyRow?.slug ?? "");
  const templateDefinition = (
    persistedTemplateId
      ? EXPERIENCE_TEMPLATES.find((template) => template.templateId === persistedTemplateId)
      : null
  ) ?? EXPERIENCE_TEMPLATES.find((template) => slug.startsWith(slugifyTemplateName(template.name)));
  if (!templateDefinition) {
    return null;
  }

  const allowUserOverride = templateDefinition.retrievalScope.allowUserOverride !== false;
  const normalizedOverride = allowUserOverride ? params.overrideMode ?? null : null;

  return {
    version: 1,
    experienceKey: templateDefinition.experienceKey,
    templateDefault: templateDefinition.retrievalScope.templateDefault,
    userOverride: normalizedOverride,
    effectiveMode: normalizedOverride ?? templateDefinition.retrievalScope.templateDefault,
    permissionFilter: {
      tenantId: params.tenantId,
      userId: params.userId,
    },
  };
}

function slugifyTemplateName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
