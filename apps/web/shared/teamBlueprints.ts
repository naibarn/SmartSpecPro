import {
  PERSONA_TEMPLATES,
  buildPersonaApplication,
  type PersonaGender,
  type PersonaTemplateDefinition,
  type PersonaTone,
} from "@/components/settings/personaTemplates";

export type TeamBlueprintMemberRole =
  | "orchestrator"
  | "researcher"
  | "reviewer"
  | "publisher"
  | "specialist";

export interface TeamBlueprintPersonaSeed {
  name: string;
  description?: string;
  assistantNickname?: string;
  assistantGender?: PersonaGender;
  tone?: PersonaTone;
  templateIds: string[];
}

export interface TeamBlueprintMemberSeed {
  id: string;
  displayName: string;
  roleTitle: string;
  memberRole: TeamBlueprintMemberRole;
  isLead?: boolean;
  instructions: string;
  specialtyTags?: string[];
  persona: TeamBlueprintPersonaSeed;
}

export interface TeamBlueprintDefinition {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  defaultTeamName: string;
  defaultTeamDescription: string;
  members: TeamBlueprintMemberSeed[];
}

export interface BlueprintPersonaRecord {
  id: string;
  name: string;
  sourceTemplateIds?: string[] | null;
  tone?: string | null;
}

export interface BlueprintDraftAssistantMember {
  memberKey: string;
  memberKind: "assistant";
  memberRole: TeamBlueprintMemberRole;
  blueprintId: string;
  blueprintMemberId: string;
  personaId?: string;
  personaBlueprint: TeamBlueprintPersonaSeed;
  reusedPersonaName?: string;
  displayName: string;
  roleTitle: string;
  instructions: string;
  specialtyTags?: string[];
  isLead: boolean;
}

function getTemplatesByIds(templateIds: string[]): PersonaTemplateDefinition[] {
  const templates = templateIds.map((templateId) => {
    const template = PERSONA_TEMPLATES.find((item) => item.id === templateId);
    if (!template) {
      throw new Error(`Unknown persona template id: ${templateId}`);
    }
    return template;
  });

  return templates;
}

function sameTemplateSet(left: string[] | null | undefined, right: string[]): boolean {
  if (!left || left.length !== right.length) return false;
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

export function buildBlueprintPersonaInput(seed: TeamBlueprintPersonaSeed) {
  const templates = getTemplatesByIds(seed.templateIds);
  const application = buildPersonaApplication(templates);
  const assistantNickname = seed.assistantNickname ?? application.assistantNickname ?? null;

  return {
    name: seed.name,
    description: seed.description ?? application.description,
    assistantNickname,
    assistantGender: seed.assistantGender ?? application.assistantGender,
    sourceTemplateIds: application.sourceTemplateIds,
    sourceTemplateLabels: application.sourceTemplateLabels,
    sourceTemplateCategories: application.sourceTemplateCategories,
    systemPromptPrefix: application.prompt,
    tone: seed.tone ?? application.tone,
    language: application.language,
    restrictions: [...application.restrictions],
    scope: "user" as const,
  };
}

export function findReusablePersonaForBlueprint(
  personas: BlueprintPersonaRecord[],
  seed: TeamBlueprintPersonaSeed,
): BlueprintPersonaRecord | null {
  const blueprintInput = buildBlueprintPersonaInput(seed);

  const matchedByTemplate = personas.find((persona) =>
    sameTemplateSet(persona.sourceTemplateIds ?? [], blueprintInput.sourceTemplateIds) &&
    (persona.tone ?? null) === blueprintInput.tone,
  );
  if (matchedByTemplate) return matchedByTemplate;

  return personas.find((persona) => persona.name === seed.name) ?? null;
}

export function instantiateBlueprintAssistantDrafts(
  blueprint: TeamBlueprintDefinition,
  personas: BlueprintPersonaRecord[],
): BlueprintDraftAssistantMember[] {
  return blueprint.members.map((member) => {
    const reusablePersona = findReusablePersonaForBlueprint(personas, member.persona);
    return {
      memberKey: `blueprint:${blueprint.id}:${member.id}`,
      memberKind: "assistant",
      memberRole: member.memberRole,
      blueprintId: blueprint.id,
      blueprintMemberId: member.id,
      personaId: reusablePersona?.id,
      personaBlueprint: member.persona,
      reusedPersonaName: reusablePersona?.name,
      displayName: member.displayName,
      roleTitle: member.roleTitle,
      instructions: member.instructions,
      specialtyTags: member.specialtyTags,
      isLead: Boolean(member.isLead),
    };
  });
}

export const TEAM_BLUEPRINTS: TeamBlueprintDefinition[] = [
  {
    id: "creative-content-studio",
    name: "Creative Content Studio",
    category: "creative",
    icon: "🎬",
    description: "Cross-channel content team for Facebook pages, TikTok, YouTube, and daily creative publishing.",
    defaultTeamName: "Creative Content Studio",
    defaultTeamDescription: "Plans, researches, creates, reviews, and publishes daily creative content across social channels.",
    members: [
      {
        id: "content-director",
        displayName: "Content Director",
        roleTitle: "Content Director",
        memberRole: "orchestrator",
        isLead: true,
        instructions: "Break daily publishing goals into work items, assign them across the team, enforce review quality, and keep posting schedules on track.",
        specialtyTags: ["orchestration", "campaign-planning", "content-operations"],
        persona: {
          name: "Content Director",
          description: "Leads creative operations, editorial planning, and publishing cadence across channels.",
          templateIds: ["marketing-strategist", "project-manager"],
          tone: "friendly",
        },
      },
      {
        id: "trend-researcher",
        displayName: "Trend Researcher",
        roleTitle: "Trend Researcher",
        memberRole: "researcher",
        instructions: "Monitor trends, gather fresh topics, collect citations, and summarize what matters for today's content queue.",
        specialtyTags: ["research", "trend-analysis", "social-listening"],
        persona: {
          name: "Trend Researcher",
          description: "Finds emerging topics, verifies sources, and turns trends into practical content directions.",
          templateIds: ["research-assistant", "marketing-strategist"],
          tone: "technical",
        },
      },
      {
        id: "copywriter",
        displayName: "Creative Copywriter",
        roleTitle: "Creative Copywriter",
        memberRole: "specialist",
        instructions: "Draft hooks, captions, scripts, headlines, and CTA-driven copy tailored to each platform's audience.",
        specialtyTags: ["copywriting", "storytelling", "scripts"],
        persona: {
          name: "Creative Copywriter",
          description: "Writes attention-grabbing posts, scripts, and captions that fit short-form and social content.",
          templateIds: ["creative-writer", "marketing-strategist"],
          tone: "creative",
        },
      },
      {
        id: "graphic-designer",
        displayName: "Graphic Designer",
        roleTitle: "Graphic Designer",
        memberRole: "specialist",
        instructions: "Turn content ideas into visual concepts, thumbnail directions, infographic layouts, and image prompts for the production pipeline.",
        specialtyTags: ["graphics", "thumbnails", "infographics"],
        persona: {
          name: "Graphic Designer",
          description: "Designs social visuals, infographics, and thumbnail concepts that support content performance.",
          templateIds: ["graphic-designer", "marketing-strategist"],
          tone: "creative",
        },
      },
      {
        id: "video-producer",
        displayName: "Video Producer",
        roleTitle: "Video Producer",
        memberRole: "specialist",
        instructions: "Create short-form video concepts, scene outlines, shot lists, and editing briefs for reels, shorts, and TikTok posts.",
        specialtyTags: ["video", "short-form", "storyboards"],
        persona: {
          name: "Video Producer",
          description: "Develops short-form video concepts, hooks, shot lists, and editing plans for social platforms.",
          templateIds: ["video-producer", "creative-writer"],
          tone: "creative",
        },
      },
      {
        id: "publisher",
        displayName: "Channel Publisher",
        roleTitle: "Channel Publisher",
        memberRole: "publisher",
        instructions: "Review readiness, align deliverables to platform requirements, and prepare approved assets for publishing schedules.",
        specialtyTags: ["publishing", "channel-ops", "quality-control"],
        persona: {
          name: "Channel Publisher",
          description: "Checks cross-channel readiness, packaging, and publication details before content goes live.",
          templateIds: ["social-media-manager", "project-manager"],
          tone: "friendly",
        },
      },
    ],
  },
  {
    id: "research-insight-desk",
    name: "Research & Insight Desk",
    category: "research",
    icon: "🔎",
    description: "Finds evidence, synthesizes insight, and produces reviewed research deliverables.",
    defaultTeamName: "Research & Insight Desk",
    defaultTeamDescription: "Researches topics deeply, analyzes evidence, drafts findings, and reviews recommendations before delivery.",
    members: [
      {
        id: "research-lead",
        displayName: "Research Lead",
        roleTitle: "Research Lead",
        memberRole: "orchestrator",
        isLead: true,
        instructions: "Define the research objective, coordinate evidence gathering, and keep the team aligned on decision-quality output.",
        specialtyTags: ["research", "synthesis", "orchestration"],
        persona: {
          name: "Research Lead",
          description: "Coordinates evidence collection and synthesizes high-quality research outcomes.",
          templateIds: ["research-assistant", "project-manager"],
          tone: "technical",
        },
      },
      {
        id: "data-analyst",
        displayName: "Data Analyst",
        roleTitle: "Data Analyst",
        memberRole: "researcher",
        instructions: "Turn raw evidence into comparable findings, tables, metrics, and concise analytical summaries.",
        specialtyTags: ["analysis", "data", "comparison"],
        persona: {
          name: "Data Analyst",
          description: "Analyzes data, compares options, and extracts practical conclusions from evidence.",
          templateIds: ["data-analyst", "research-assistant"],
          tone: "technical",
        },
      },
      {
        id: "insight-writer",
        displayName: "Insight Writer",
        roleTitle: "Insight Writer",
        memberRole: "specialist",
        instructions: "Draft the narrative, recommendations, and executive summary based on the team's verified findings.",
        specialtyTags: ["writing", "summaries", "recommendations"],
        persona: {
          name: "Insight Writer",
          description: "Turns verified analysis into clear narratives, summaries, and recommendations.",
          templateIds: ["creative-writer", "research-assistant"],
          tone: "formal",
        },
      },
      {
        id: "review-editor",
        displayName: "Review Editor",
        roleTitle: "Review Editor",
        memberRole: "reviewer",
        instructions: "Challenge assumptions, identify missing evidence, and ensure the final answer is clear, safe, and well-supported.",
        specialtyTags: ["review", "fact-checking", "quality"],
        persona: {
          name: "Review Editor",
          description: "Checks evidence quality, identifies gaps, and improves clarity before delivery.",
          templateIds: ["code-reviewer", "research-assistant"],
          tone: "formal",
        },
      },
    ],
  },
  {
    id: "presentation-studio",
    name: "Presentation Studio",
    category: "presentations",
    icon: "🖼️",
    description: "Builds presentation-ready narratives, slide structure, and polished visual direction.",
    defaultTeamName: "Presentation Studio",
    defaultTeamDescription: "Shapes ideas into structured presentations, visual narratives, and reviewed deck-ready output.",
    members: [
      {
        id: "presentation-lead",
        displayName: "Presentation Lead",
        roleTitle: "Presentation Lead",
        memberRole: "orchestrator",
        isLead: true,
        instructions: "Translate the brief into a deck plan, coordinate content production, and keep the story arc coherent across slides.",
        specialtyTags: ["story-arc", "presentations", "orchestration"],
        persona: {
          name: "Presentation Lead",
          description: "Guides presentation story structure, slide flow, and delivery readiness.",
          templateIds: ["product-manager", "project-manager"],
          tone: "friendly",
        },
      },
      {
        id: "researcher",
        displayName: "Presentation Researcher",
        roleTitle: "Presentation Researcher",
        memberRole: "researcher",
        instructions: "Gather supporting evidence, source citations, and reference material for each major claim in the deck.",
        specialtyTags: ["research", "citations", "evidence"],
        persona: {
          name: "Presentation Researcher",
          description: "Finds supporting evidence, references, and context for persuasive presentations.",
          templateIds: ["research-assistant", "data-analyst"],
          tone: "technical",
        },
      },
      {
        id: "narrative-writer",
        displayName: "Narrative Writer",
        roleTitle: "Narrative Writer",
        memberRole: "specialist",
        instructions: "Write slide headlines, supporting bullets, speaker notes, and transitions with clear business storytelling.",
        specialtyTags: ["storytelling", "slides", "headlines"],
        persona: {
          name: "Narrative Writer",
          description: "Writes slide-ready narrative with strong headlines and concise supporting points.",
          templateIds: ["creative-writer", "product-manager"],
          tone: "formal",
        },
      },
      {
        id: "visual-designer",
        displayName: "Visual Designer",
        roleTitle: "Visual Designer",
        memberRole: "publisher",
        instructions: "Shape layout direction, visualization notes, and visual hierarchy so the final deck is polished and presentation-ready.",
        specialtyTags: ["visual-storytelling", "design", "layouts"],
        persona: {
          name: "Visual Designer",
          description: "Designs presentation visuals, layout hierarchy, and slide-ready visual direction.",
          templateIds: ["graphic-designer", "project-manager"],
          tone: "creative",
        },
      },
    ],
  },
  {
    id: "engineering-review-pod",
    name: "Engineering Review Pod",
    category: "engineering",
    icon: "🧪",
    description: "Coordinates technical review, risk checks, and final approval for code and architecture changes.",
    defaultTeamName: "Engineering Review Pod",
    defaultTeamDescription: "Reviews technical changes for correctness, security, and release readiness before approval.",
    members: [
      {
        id: "review-lead",
        displayName: "Lead Architect",
        roleTitle: "Lead Architect",
        memberRole: "orchestrator",
        isLead: true,
        instructions: "Break down the change, assign specialist reviews, and keep the team aligned on correctness and architectural impact.",
        specialtyTags: ["architecture", "orchestration", "technical-review"],
        persona: {
          name: "Lead Architect",
          description: "Coordinates architecture review and keeps technical quality decisions coherent.",
          templateIds: ["code-reviewer", "project-manager"],
          tone: "technical",
        },
      },
      {
        id: "security-reviewer",
        displayName: "Security Reviewer",
        roleTitle: "Security Reviewer",
        memberRole: "reviewer",
        instructions: "Focus on abuse paths, access control, data exposure, and operational safety concerns before approval.",
        specialtyTags: ["security", "risk", "review"],
        persona: {
          name: "Security Reviewer",
          description: "Reviews systems for security posture, abuse resistance, and operational risk.",
          templateIds: ["code-reviewer", "research-assistant"],
          tone: "technical",
        },
      },
      {
        id: "quality-reviewer",
        displayName: "Quality Reviewer",
        roleTitle: "Quality Reviewer",
        memberRole: "publisher",
        instructions: "Check regressions, test coverage, release readiness, and whether the final recommendation is actionable.",
        specialtyTags: ["quality", "testing", "release-readiness"],
        persona: {
          name: "Quality Reviewer",
          description: "Checks regression risk, test confidence, and release readiness for engineering changes.",
          templateIds: ["code-reviewer", "data-analyst"],
          tone: "formal",
        },
      },
    ],
  },
];

export const LEGACY_TEMPLATE_BLUEPRINT_MAP: Record<string, string> = {
  "tmpl-team-research-analysis": "research-insight-desk",
  "tmpl-team-content-creation": "creative-content-studio",
  "tmpl-team-code-review": "engineering-review-pod",
};

export function findTeamBlueprint(blueprintId: string): TeamBlueprintDefinition | null {
  return TEAM_BLUEPRINTS.find((blueprint) => blueprint.id === blueprintId) ?? null;
}

export function findTeamBlueprintMember(
  blueprintId: string,
  blueprintMemberId: string,
): TeamBlueprintMemberSeed | null {
  const blueprint = findTeamBlueprint(blueprintId);
  return blueprint?.members.find((member) => member.id === blueprintMemberId) ?? null;
}

export function resolveLegacyTemplateBlueprintId(templateId: string): string | null {
  return LEGACY_TEMPLATE_BLUEPRINT_MAP[templateId] ?? null;
}
