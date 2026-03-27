import { z } from "zod";

export const SmartAiHubPageSectionSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(["hero", "features", "testimonials", "cta", "content", "gallery", "pricing", "faq", "team", "contact", "custom", "stats", "process"]),
  title: z.string().max(200).optional(),
  subtitle: z.string().max(400).optional(),
  content: z.string().max(5000).optional(),
  image: z.string().max(2000).optional(),
  buttons: z.array(
    z.object({
      text: z.string().min(1).max(120),
      link: z.string().min(1).max(500),
      style: z.string().max(40).optional(),
    }),
  ).max(10).optional(),
  items: z.array(z.any()).max(100).optional(),
  settings: z.record(z.any()).optional(),
});

export const SmartAiHubGenerationPolicySchema = z.object({
  mode: z.enum(["standard", "news", "mixed", "auto"]).default("standard"),
  skillId: z.string().min(1).max(120),
  skillLabel: z.string().max(200).optional(),
  route: z.enum(["skill", "agency", "hybrid"]).default("skill"),
  requiresWebSearch: z.boolean().optional(),
  requiresThinking: z.boolean().optional(),
  thinkingLevelHint: z.enum(["low", "medium", "high"]).optional(),
  freshnessDays: z.number().int().min(0).max(3650).optional(),
  toolIds: z.array(z.string().min(1).max(120)).max(10).optional(),
  rationale: z.string().max(500).optional(),
});

export const SmartAiHubAutoContentConfigSchema = z.object({
  topicCount: z.number().int().min(1).max(100),
  mode: z.enum(["standard", "news", "mixed", "auto"]).default("standard"),
  freshnessDays: z.number().int().min(0).max(3650).optional(),
});

export const SmartAiHubPageBlueprintSchema = z.object({
  pageKey: z.string().min(1).max(100),
  path: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(400),
  keywords: z.array(z.string().min(1).max(120)).max(40),
  aiContext: z.string().min(1).max(1000),
  keyFacts: z.array(z.string().min(1).max(300)).max(20),
  content: z.string().min(1).max(50000),
  sections: z.array(SmartAiHubPageSectionSchema).max(50).optional(),
  generation: SmartAiHubGenerationPolicySchema.optional(),
  mediaPrompts: z.object({
    imagePrompt: z.string().max(4000).optional(),
    videoPrompt: z.string().max(4000).optional(),
    referenceKeywords: z.array(z.string().min(1).max(120)).max(20).optional(),
  }).optional(),
  metadata: z.object({
    description: z.string().max(400).optional(),
    keywords: z.array(z.string().min(1).max(120)).max(40).optional(),
    author: z.string().max(120).optional(),
    ogImage: z.string().max(2000).optional(),
    customMeta: z.record(z.string()).optional(),
  }).optional(),
  isPublished: z.boolean().optional(),
  showInMenu: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  faqs: z.array(
    z.object({
      question: z.string().min(1).max(300),
      answer: z.string().min(1).max(1000),
    }),
  ).max(50).optional(),
  structuredData: z.record(z.any()).optional(),
});

export const SmartAiHubDocBlueprintSchema = z.object({
  pageKey: z.string().min(1).max(100),
  slug: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  sortOrder: z.number().int().min(0).max(10000),
  description: z.string().min(1).max(400),
  keywords: z.array(z.string().min(1).max(120)).max(40),
  aiContext: z.string().min(1).max(1000),
  keyFacts: z.array(z.string().min(1).max(300)).max(20),
  content: z.string().min(1).max(50000),
  generation: SmartAiHubGenerationPolicySchema.optional(),
  mediaPrompts: z.object({
    imagePrompt: z.string().max(4000).optional(),
    videoPrompt: z.string().max(4000).optional(),
    referenceKeywords: z.array(z.string().min(1).max(120)).max(20).optional(),
  }).optional(),
  faqs: z.array(
    z.object({
      question: z.string().min(1).max(300),
      answer: z.string().min(1).max(1000),
    }),
  ).optional(),
});

export const SmartAiHubBlogBlueprintSchema = z.object({
  slug: z.string().min(1).max(120),
  title: z.string().min(1).max(220),
  excerpt: z.string().min(1).max(500),
  metaDescription: z.string().min(1).max(500),
  metaKeywords: z.string().min(1).max(1000),
  content: z.string().min(1).max(50000),
  coverImage: z.string().max(2000),
  author: z.string().min(1).max(120),
  authorAvatar: z.string().max(2000),
  category: z.string().min(1).max(120),
  tags: z.array(z.string().min(1).max(80)).max(20),
  readTime: z.string().min(1).max(40),
  isPublished: z.boolean(),
  isFeatured: z.boolean(),
  generation: SmartAiHubGenerationPolicySchema.optional(),
  mediaPrompts: z.object({
    imagePrompt: z.string().max(4000).optional(),
    videoPrompt: z.string().max(4000).optional(),
    referenceKeywords: z.array(z.string().min(1).max(120)).max(20).optional(),
  }).optional(),
});

export const SmartAiHubContentManifestSchema = z.object({
  tenantDomain: z.string().min(1).max(255).optional(),
  generation: SmartAiHubAutoContentConfigSchema.optional(),
  pages: z.array(SmartAiHubPageBlueprintSchema).max(500).optional(),
  docs: z.array(SmartAiHubDocBlueprintSchema).max(500).optional(),
  blog: z.array(SmartAiHubBlogBlueprintSchema).max(500).optional(),
});

export type SmartAiHubPageSection = z.infer<typeof SmartAiHubPageSectionSchema>;
export type SmartAiHubPageBlueprint = z.infer<typeof SmartAiHubPageBlueprintSchema>;
export type SmartAiHubDocBlueprint = z.infer<typeof SmartAiHubDocBlueprintSchema>;
export type SmartAiHubBlogBlueprint = z.infer<typeof SmartAiHubBlogBlueprintSchema>;
export type SmartAiHubGenerationPolicy = z.infer<typeof SmartAiHubGenerationPolicySchema>;
export type SmartAiHubAutoContentConfig = z.infer<typeof SmartAiHubAutoContentConfigSchema>;
export type SmartAiHubContentManifest = z.infer<typeof SmartAiHubContentManifestSchema>;
