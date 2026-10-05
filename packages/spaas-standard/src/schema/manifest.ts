import { z } from "zod";

export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(),
  z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]));

const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
const safeTextMapSchema = z.record(z.string().min(1).max(128), z.string().max(4096));
const fallbackSchema = z.object({
  policy: z.string().min(1).max(128),
  preservesSemantics: z.boolean(),
}).strict();

const metadataSchema = z.object({
  id: z.string().regex(/^app_[A-Za-z0-9_-]{1,120}$/),
  name: z.string().min(1).max(256),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(128),
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
  description: z.string().max(8192).optional(),
  labels: safeTextMapSchema.optional(),
  annotations: safeTextMapSchema.optional(),
}).strict();

const compatibilitySchema = z.object({
  minimumPlatformVersion: z.string().min(1).max(64),
  manifestSchema: z.string().min(1).max(64),
  requiredFeatures: z.array(z.string().min(1).max(256)).max(256).optional(),
  optionalFeatures: z.array(z.string().min(1).max(256)).max(256).optional(),
  optionalFeatureFallbacks: z.record(z.string(), fallbackSchema).optional(),
}).strict();

const extensionRequirementSchema = z.object({
  version: z.string().min(1).max(128).optional(),
  extensionVersion: z.string().min(1).max(128).optional(),
  schema: z.string().min(1).max(128).optional(),
  settings: jsonObjectSchema.optional(),
  requiredSettings: jsonObjectSchema.optional(),
  fallback: z.string().min(1).max(128).optional(),
  omissionSafe: z.boolean().optional(),
  securityCritical: z.boolean().optional(),
}).strict();

const mcpSchema = z.object({
  role: z.array(z.enum(["client", "server"])).min(1).max(2),
  protocol: z.object({
    preferred: z.string().min(1).max(128).optional(),
    minimum: z.string().min(1).max(128).optional(),
  }).strict(),
  extensions: z.object({
    required: z.record(z.string().min(3).max(256), extensionRequirementSchema).optional(),
    optional: z.record(z.string().min(3).max(256), extensionRequirementSchema).optional(),
  }).strict().optional(),
  unknownExtensionPolicy: z.object({
    optional: z.literal("PRESERVE_NO_EXECUTE").optional(),
    required: z.literal("FAIL_CLOSED").optional(),
  }).strict().optional(),
}).strict();

const componentSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  type: z.string().min(1).max(128),
  source: z.string().min(1).max(1024).optional(),
  version: z.string().min(1).max(128).optional(),
  digest: z.string().min(1).max(256).optional(),
  dependsOn: z.array(z.union([
    z.string().min(1).max(256),
    z.object({ component: z.string().min(1).max(128), versionRange: z.string().max(256).optional(), required: z.boolean().optional() }).strict(),
    z.object({ capability: z.string().min(1).max(256), versionRange: z.string().max(256).optional(), required: z.boolean().optional(), omissionSafe: z.boolean().optional() }).strict(),
    z.object({ skill: z.string().min(1).max(256), versionRange: z.string().max(256).optional(), required: z.boolean().optional(), omissionSafe: z.boolean().optional() }).strict(),
  ])).max(10_000).optional(),
  sideEffects: z.array(z.string().min(1).max(256)).max(1024).optional(),
  capabilities: z.array(z.union([z.string().min(1).max(256),jsonObjectSchema])).max(4096).optional(),
  requires: jsonObjectSchema.optional(),
  inputSchema: jsonObjectSchema.optional(),
  outputSchema: jsonObjectSchema.optional(),
  health: jsonObjectSchema.optional(),
  verification: jsonObjectSchema.optional(),
  executionPolicy: jsonObjectSchema.optional(),
}).strict();

const applicationSchema = z.object({
  kind: z.enum(["application", "mini_app", "agent_app", "service", "extension", "bundle"]),
  experience: z.enum(["traditional_ui", "chat_first", "dashboard", "workspace", "workflow", "headless", "hybrid"]),
  primarySurface: z.enum(["chat", "web", "desktop", "mobile", "dashboard", "map", "editor", "none"]),
}).strict();

const genericExtensionSchema = z.object({
  namespace: z.string().min(3).max(256),
  version: z.string().min(1).max(128),
  schema: z.string().min(1).max(128).optional(),
  criticality: z.enum(["required", "optional", "advisory", "security_critical"]),
  config: jsonObjectSchema,
  fallback: fallbackSchema.optional(),
}).strict();

export const manifestSchema = z.object({
  apiVersion: z.string().min(1).max(128),
  kind: z.literal("AIApplication"),
  metadata: metadataSchema,
  ownership: z.object({
    ownerType: z.enum(["user", "team", "tenant", "platform"]),
    ownerId: z.string().min(1).max(256),
    authors: z.array(z.string().min(1).max(256)).max(256).optional(),
  }).strict(),
  compatibility: compatibilitySchema,
  application: applicationSchema,
  targets: z.array(jsonObjectSchema).max(256).optional(),
  stack: jsonObjectSchema.optional(),
  platformStrategy: z.object({ mode: z.enum(["single_codebase", "shared_core", "web_plus_wrapper", "platform_specific", "service_only"]) }).passthrough().optional(),
  design: jsonObjectSchema.optional(),
  components: z.array(componentSchema).max(10_000),
  sections: z.array(z.object({ name: z.string().min(1).max(128), path: z.string().min(1).max(1024), required: z.boolean().optional() }).strict()).max(256).optional(),
  agents: z.array(jsonObjectSchema).max(10_000).optional(),
  orchestration: jsonObjectSchema.optional(),
  harnesses: jsonObjectSchema.optional(),
  interaction: jsonObjectSchema.optional(),
  communications: jsonObjectSchema.optional(),
  interop: z.object({ mcp: mcpSchema.optional(), a2a: jsonObjectSchema.optional() }).strict().optional(),
  wallet: jsonObjectSchema.optional(),
  requires: jsonObjectSchema.optional(),
  security: jsonObjectSchema.optional(),
  privacy: jsonObjectSchema.optional(),
  runtime: jsonObjectSchema.optional(),
  hosting: jsonObjectSchema.optional(),
  address: jsonObjectSchema.optional(),
  access: jsonObjectSchema.optional(),
  operations: jsonObjectSchema.optional(),
  tests: jsonObjectSchema.optional(),
  events: jsonObjectSchema.optional(),
  services: jsonObjectSchema.optional(),
  dataPolicy: jsonObjectSchema.optional(),
  lifecycle: jsonObjectSchema.optional(),
  observability: jsonObjectSchema.optional(),
  billing: jsonObjectSchema.optional(),
  commercialization: jsonObjectSchema.optional(),
  distribution: jsonObjectSchema.optional(),
  publication: jsonObjectSchema.optional(),
  provenance: jsonObjectSchema.optional(),
  extensions: z.array(genericExtensionSchema).max(1024).optional(),
}).strict();

export type ParsedManifest = z.infer<typeof manifestSchema>;
