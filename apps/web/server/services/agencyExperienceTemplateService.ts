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
      `Use library search first via builtin-rag-knowledge and builtin-document-search. Widen to web fallback (builtin-web-search) only when library results are insufficient.

When you finish researching, return your result as a JSON code block tagged \`\`\`agency-result with this exact structure:
{
  "version": "1.0",
  "intent": "research_report",
  "summary": "Executive summary of findings",
  "payload": {
    "title": "Report title",
    "executive_summary": "Concise executive summary",
    "sections": [
      {
        "heading": "Section heading",
        "content": "Section content (markdown supported)",
        "sources": ["source title 1", "source title 2"]
      }
    ],
    "key_findings": ["Finding 1", "Finding 2"],
    "recommendations": ["Recommendation 1", "Recommendation 2"]
  },
  "artifacts": [{"artifact_type": "research_report", "title": "Report title"}],
  "references": [
    {
      "source_title": "Document title",
      "source_id": "document-id",
      "source_uri": "https://...",
      "support_summary": "How this source supports findings"
    }
  ]
}

Every section MUST include heading, content, and sources array. key_findings and recommendations are required arrays.`,
    defaultTools: [
      "builtin-rag-knowledge",
      "builtin-document-search",
      "builtin-web-search",
      "builtin-skill-executor",
      "builtin-model-suggest",
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
      `Prefer library context when available. Use builtin-model-suggest to recommend appropriate video/image models for each scene.

When you finish planning, return your result as a JSON code block tagged \`\`\`agency-result with this exact structure:
{
  "version": "1.0",
  "intent": "video_storyboard",
  "summary": "Brief summary of the storyboard",
  "payload": {
    "title": "Storyboard title",
    "total_duration_seconds": 120,
    "style": "cinematic / documentary / animated / etc.",
    "scenes": [
      {
        "scene_number": 1,
        "duration_seconds": 15,
        "description": "What happens in this scene",
        "dialogue": "Optional spoken dialogue or null",
        "camera": "Camera angle/movement (e.g. Wide establishing shot, Close-up, Tracking)",
        "lighting": "Lighting description (e.g. Natural daylight, Dramatic low-key)",
        "video_prompt": "Detailed prompt for video generation",
        "audio_prompt": "Optional audio/music description or null"
      }
    ]
  },
  "artifacts": [{"artifact_type": "video_storyboard", "title": "Storyboard title"}],
  "references": []
}

Every scene MUST include: scene_number, duration_seconds, description, camera, lighting, and video_prompt. dialogue and audio_prompt are optional (use null if not needed).`,
    defaultTools: [
      "builtin-auto-draft",
      "builtin-rag-knowledge",
      "builtin-model-suggest",
      "builtin-skill-executor",
      "builtin-web-search",
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
      `Use library context and writing skills as needed.

You have two modes of operation:
1. **Quick mode (preferred)**: Use the builtin-auto-draft tool directly — it generates a full presentation deck and returns deckId, libraryItemId, and slideCount. Wrap the tool result in the envelope below.
2. **Preview mode**: Generate slide content yourself for user review before committing.

When you finish, return your result as a JSON code block tagged \`\`\`agency-result with this exact structure:
{
  "version": "1.0",
  "intent": "presentation_deck",
  "summary": "Brief description of the deck",
  "payload": {
    "title": "Presentation title",
    "description": "Optional description",
    "language": "auto",
    "style_preset": "professional",
    "slides": [
      {
        "templateId": "title-body",
        "title": "Slide title",
        "body": ["Bullet point 1", "Bullet point 2"],
        "notes": "Speaker notes",
        "graphicCategory": "business",
        "imagePromptKeywords": "descriptive keywords for visual"
      }
    ]
  },
  "artifacts": [{"artifact_type": "presentation_deck", "title": "Deck title"}],
  "references": []
}

Valid templateId values: "title-body", "section-header", "two-column", "image-focus", "quote", "blank".
Valid graphicCategory values: "business", "technology", "nature", "abstract", "people", "education", "medical", "finance", "food", "travel".
Each slide MUST include: templateId, title, body (array of strings), graphicCategory, imagePromptKeywords.`,
    defaultTools: [
      "builtin-auto-draft",
      "builtin-rag-knowledge",
      "builtin-document-search",
      "builtin-skill-executor",
      "builtin-model-suggest",
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
