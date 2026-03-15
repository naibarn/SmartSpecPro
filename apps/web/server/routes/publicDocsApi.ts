import type { Express } from "express";
import swaggerUi from "swagger-ui-express";

// ---------------------------------------------------------------------------
// Common response headers component
// ---------------------------------------------------------------------------

const commonHeaders = {
  "X-Request-Id": {
    description: "Unique trace ID for this request (use for support enquiries)",
    schema: { type: "string" },
  },
  "X-Credits-Used": {
    description: "Credits consumed by this request",
    schema: { type: "integer" },
  },
  "X-Credits-Remaining": {
    description: "Remaining credit balance for the tenant",
    schema: { type: "integer" },
  },
  "X-RateLimit-Limit": {
    description: "Maximum requests per minute for this key",
    schema: { type: "integer" },
  },
  "X-RateLimit-Remaining": {
    description: "Requests remaining in the current window",
    schema: { type: "integer" },
  },
  "X-RateLimit-Reset": {
    description: "Unix timestamp (seconds) when the rate-limit window resets",
    schema: { type: "integer" },
  },
};

// ---------------------------------------------------------------------------
// Reusable response fragments
// ---------------------------------------------------------------------------

function errorResponse(description = "Error response") {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  };
}

const commonErrorResponses = {
  "400": errorResponse("Bad request — invalid parameters"),
  "401": errorResponse("Authentication failed — missing or invalid API key"),
  "403": errorResponse("Insufficient scopes for this operation"),
  "429": errorResponse("Rate limit exceeded"),
};

// ---------------------------------------------------------------------------
// buildOpenApiSpec
// ---------------------------------------------------------------------------

export function buildOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "SmartSpecPro Public API",
      version: "1.0.0",
      description: [
        "Programmatic access to SmartSpecPro skills, agencies, media generation, presentations, and automation.",
        "",
        "## Authentication",
        "All endpoints (except `/v1/openapi.json` and `/v1/docs`) require an API key.",
        "Two equivalent methods are accepted:",
        "",
        "| Method | Header | Example |",
        "|--------|--------|---------|",
        "| Bearer token | `Authorization: Bearer sk-ssp_...` | Standard OAuth2 / OpenAPI |",
        "| API key header | `X-Api-Key: sk-ssp_...` | n8n, Zapier, Make, gateways |",
        "",
        "Generate keys at **Admin → API Keys**.",
        "",
        "## OpenAPI Gateway / Agent Integration",
        "Point your gateway or agent (n8n, Zapier, Make, LangChain, OpenAI Custom GPT, etc.) to:",
        "- **Spec URL**: `https://smartaihub.app/v1/openapi.json`",
        "- **Auth**: `X-Api-Key: sk-ssp_<your_key>` or `Authorization: Bearer sk-ssp_<your_key>`",
        "",
        "## SDK Generation",
        "```",
        "npx @openapitools/openapi-generator-cli generate \\",
        "  -i https://smartaihub.app/v1/openapi.json \\",
        "  -g typescript-fetch -o ./smartspec-sdk",
        "```",
      ].join("\n"),
    },
    externalDocs: {
      description: "SmartSpecPro Developer Guide",
      url: "https://smartaihub.app/v1/docs",
    },
    servers: [
      { url: "https://smartaihub.app", description: "Production" },
    ],
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "API key in sk-ssp_ format passed as Bearer token. `Authorization: Bearer sk-ssp_...`",
        },
        apiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "X-Api-Key",
          description: "API key in sk-ssp_ format passed as X-Api-Key header. Compatible with n8n, Zapier, Make, and most OpenAPI gateways.",
        },
      },
      headers: commonHeaders,
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message", "type"],
              properties: {
                code: {
                  type: "string",
                  example: "invalid_request",
                  description: "Machine-readable error code",
                },
                message: {
                  type: "string",
                  example: "prompt is required",
                  description: "Human-readable error description",
                },
                type: {
                  type: "string",
                  enum: [
                    "invalid_request_error",
                    "authentication_error",
                    "billing_error",
                    "rate_limit_error",
                    "not_found_error",
                    "internal_error",
                    "feature_disabled_error",
                  ],
                },
              },
            },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 20 },
            total: { type: "integer", example: 42 },
            has_more: { type: "boolean", example: true },
          },
        },
        SkillSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            version: { type: "string" },
            enabled: { type: "boolean" },
          },
        },
        SkillDetail: {
          allOf: [
            { $ref: "#/components/schemas/SkillSummary" },
            {
              type: "object",
              properties: {
                input_schema: { type: "object", description: "JSON Schema for skill inputs" },
                credit_multiplier: { type: "number" },
                tags: { type: "array", items: { type: "string" } },
              },
            },
          ],
        },
        AgencySummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            status: { type: "string", enum: ["active", "inactive"] },
            created_at: { type: "string", format: "date-time" },
          },
        },
        JobStatus: {
          type: "object",
          properties: {
            job_id: { type: "string" },
            status: { type: "string", enum: ["pending", "running", "completed", "failed", "cancelled"] },
            progress_pct: { type: "integer", minimum: 0, maximum: 100 },
            result: { type: "object", nullable: true },
            error: { type: "string", nullable: true },
            created_at: { type: "string", format: "date-time" },
            completed_at: { type: "string", format: "date-time", nullable: true },
          },
        },
        WebhookEndpoint: {
          type: "object",
          properties: {
            id: { type: "string" },
            url: { type: "string", format: "uri" },
            events: { type: "array", items: { type: "string" } },
            retry_policy: { type: "string", enum: ["none", "exponential"] },
            is_active: { type: "boolean" },
            failure_count: { type: "integer" },
            last_delivered_at: { type: "string", format: "date-time", nullable: true },
            created_at: { type: "string", format: "date-time" },
          },
        },
        MediaTask: {
          type: "object",
          properties: {
            task_id: { type: "string" },
            status: { type: "string", enum: ["pending", "processing", "completed", "failed"] },
            progress_pct: { type: "integer", minimum: 0, maximum: 100 },
            result_url: { type: "string", format: "uri", nullable: true },
            credits_used: { type: "integer", nullable: true },
            created_at: { type: "string", format: "date-time" },
            completed_at: { type: "string", format: "date-time", nullable: true },
          },
        },
      },
    },
    paths: {
      // -----------------------------------------------------------------------
      // Skills
      // -----------------------------------------------------------------------
      "/v1/skills": {
        get: {
          operationId: "listSkills",
          tags: ["Skills"],
          summary: "List available skills",
          description: "Returns all skills accessible to this API key. Requires scope: `skills:read`.",
          parameters: [
            { name: "category", in: "query", schema: { type: "string" }, description: "Filter by skill category" },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: {
            "200": {
              description: "Skill list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      skills: { type: "array", items: { $ref: "#/components/schemas/SkillSummary" } },
                      pagination: { $ref: "#/components/schemas/Pagination" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/skills/{skillId}": {
        get: {
          operationId: "getSkill",
          tags: ["Skills"],
          summary: "Get skill details",
          description: "Returns full skill details including input schema. Requires scope: `skills:read`.",
          parameters: [
            { name: "skillId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Skill details",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SkillDetail" },
                },
              },
            },
            "404": errorResponse("Skill not found"),
            ...commonErrorResponses,
          },
        },
      },
      "/v1/skills/{skillId}/execute": {
        post: {
          operationId: "executeSkill",
          tags: ["Skills"],
          summary: "Execute a skill",
          description: "Runs a skill with provided inputs. Returns the LLM output. Requires scope: `skills:execute`.",
          parameters: [
            { name: "skillId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["inputs"],
                  properties: {
                    inputs: { type: "object", description: "Skill-specific inputs per the skill's input schema" },
                    model: { type: "string", description: "Override LLM model (optional)" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Skill execution result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      output: { type: "string" },
                      credits_used: { type: "integer" },
                      model_used: { type: "string" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/skills/detect": {
        post: {
          operationId: "detectSkill",
          tags: ["Skills"],
          summary: "Detect skill from natural language",
          description: "Determines which skill best matches user intent. Requires scope: `skills:read`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message"],
                  properties: {
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Detected skill",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      skill_id: { type: "string", nullable: true },
                      confidence: { type: "number" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Agencies
      // -----------------------------------------------------------------------
      "/v1/agencies": {
        get: {
          operationId: "listAgencies",
          tags: ["Agencies"],
          summary: "List agencies",
          description: "Returns active agencies for the tenant. Requires scope: `agencies:list`.",
          responses: {
            "200": {
              description: "Agency list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      agencies: { type: "array", items: { $ref: "#/components/schemas/AgencySummary" } },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/agencies/{agencyId}/invoke": {
        post: {
          operationId: "invokeAgency",
          tags: ["Agencies"],
          summary: "Invoke an agency",
          description: "Starts an asynchronous agency run. Returns a run ID. Requires scope: `agencies:invoke`.",
          parameters: [
            { name: "agencyId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message"],
                  properties: {
                    message: { type: "string" },
                    context: { type: "object", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Agency run started",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      run_id: { type: "string" },
                      status: { type: "string", example: "pending" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/agencies/{agencyId}/runs/{runId}": {
        get: {
          operationId: "getAgencyRun",
          tags: ["Agencies"],
          summary: "Get agency run status",
          description: "Returns current status and result for a run. Requires scope: `agencies:list`.",
          parameters: [
            { name: "agencyId", in: "path", required: true, schema: { type: "string" } },
            { name: "runId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Run status",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobStatus" },
                },
              },
            },
            "404": errorResponse("Run not found"),
            ...commonErrorResponses,
          },
        },
      },
      "/v1/agencies/{agencyId}/runs/{runId}/stream": {
        get: {
          operationId: "streamAgencyRun",
          tags: ["Agencies"],
          summary: "Stream agency run events",
          description: "Server-Sent Events stream for a run. Connect with `Accept: text/event-stream`. Requires scope: `agencies:list`.",
          parameters: [
            { name: "agencyId", in: "path", required: true, schema: { type: "string" } },
            { name: "runId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "SSE stream",
              content: {
                "text/event-stream": {
                  schema: { type: "string" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Presentations
      // -----------------------------------------------------------------------
      "/v1/presentations/generate": {
        post: {
          operationId: "generatePresentation",
          tags: ["Presentations"],
          summary: "Generate a presentation",
          description: "Starts async AI presentation generation. Requires scope: `presentations:generate`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["topic"],
                  properties: {
                    topic: { type: "string" },
                    slide_count: { type: "integer", minimum: 2, maximum: 50 },
                    style: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Generation started",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      task_id: { type: "string" },
                      status: { type: "string", example: "pending" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/presentations/tasks/{taskId}/progress": {
        get: {
          operationId: "getPresentationProgress",
          tags: ["Presentations"],
          summary: "Get presentation generation progress",
          description: "Polls generation task status. Requires scope: `presentations:read`.",
          parameters: [
            { name: "taskId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Task progress",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobStatus" },
                },
              },
            },
            "404": errorResponse("Task not found"),
            ...commonErrorResponses,
          },
        },
      },
      "/v1/presentations/decks/{deckId}": {
        get: {
          operationId: "getPresentation",
          tags: ["Presentations"],
          summary: "Get presentation deck",
          description: "Returns presentation data. Requires scope: `presentations:read`.",
          parameters: [
            { name: "deckId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Presentation deck",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      slides: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
            "404": errorResponse("Deck not found"),
            ...commonErrorResponses,
          },
        },
      },
      "/v1/presentations/decks/{deckId}/export": {
        post: {
          operationId: "exportPresentation",
          tags: ["Presentations"],
          summary: "Export presentation to file",
          description: "Starts async export to PDF/PPTX. Requires scope: `presentations:export`.",
          parameters: [
            { name: "deckId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    format: { type: "string", enum: ["pdf", "pptx"], default: "pdf" },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Export started",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { task_id: { type: "string" } },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/presentations/decks/{deckId}/export/download": {
        get: {
          operationId: "downloadPresentation",
          tags: ["Presentations"],
          summary: "Download exported presentation",
          description: "Returns binary file for completed export. Requires scope: `presentations:export`.",
          parameters: [
            { name: "deckId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "File download",
              content: {
                "application/pdf": { schema: { type: "string", format: "binary" } },
                "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
            "404": errorResponse("Export not ready"),
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Video Projects
      // -----------------------------------------------------------------------
      "/v1/video-projects": {
        post: {
          operationId: "createVideoProject",
          tags: ["Video Projects"],
          summary: "Create a video project",
          description: "Queues a video generation task. Requires scope: `media:generate`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt"],
                  properties: {
                    prompt: { type: "string" },
                    duration_seconds: { type: "integer", minimum: 1, maximum: 300 },
                    model: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Project created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/video-projects/{id}": {
        get: {
          operationId: "getVideoProject",
          tags: ["Video Projects"],
          summary: "Get video project status",
          description: "Requires scope: `media:generate`.",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Project status",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            "404": errorResponse("Project not found"),
            ...commonErrorResponses,
          },
        },
      },
      "/v1/video-projects/{id}/export/download": {
        get: {
          operationId: "downloadVideoProject",
          tags: ["Video Projects"],
          summary: "Download completed video",
          description: "Requires scope: `media:generate`.",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Video file",
              content: {
                "video/mp4": { schema: { type: "string", format: "binary" } },
              },
            },
            "404": errorResponse("Video not ready"),
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Media
      // -----------------------------------------------------------------------
      "/v1/media/images/generate": {
        post: {
          operationId: "generateImage",
          tags: ["Media"],
          summary: "Generate an image",
          description: "Submits an async image generation task. Requires scope: `media:generate`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt"],
                  properties: {
                    prompt: { type: "string" },
                    model: { type: "string" },
                    width: { type: "integer" },
                    height: { type: "integer" },
                    reference_image_urls: {
                      type: "array",
                      items: { type: "string", format: "uri" },
                      maxItems: 5,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Task queued",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/media/videos/generate": {
        post: {
          operationId: "generateVideo",
          tags: ["Media"],
          summary: "Generate a video",
          description: "Requires scope: `media:generate`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt"],
                  properties: {
                    prompt: { type: "string" },
                    model: { type: "string" },
                    duration_seconds: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Task queued",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/media/audio/generate": {
        post: {
          operationId: "generateAudio",
          tags: ["Media"],
          summary: "Generate audio via TTS",
          description: "Requires scope: `media:generate`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["text"],
                  properties: {
                    text: { type: "string" },
                    voice: { type: "string" },
                    model: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Task queued",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/media/{taskId}/status": {
        get: {
          operationId: "getMediaTaskStatus",
          tags: ["Media"],
          summary: "Get media task status",
          description: "Polls task progress and retrieves result URL when complete. Requires scope: `media:generate`.",
          parameters: [
            { name: "taskId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Task status",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MediaTask" },
                },
              },
            },
            "404": errorResponse("Task not found"),
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // MCP
      // -----------------------------------------------------------------------
      "/v1/mcp": {
        post: {
          operationId: "mcpEndpoint",
          tags: ["MCP"],
          summary: "MCP protocol endpoint",
          description: "Handles Model Context Protocol tool calls. Requires scope: `mcp:read`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["jsonrpc", "method"],
                  properties: {
                    jsonrpc: { type: "string", example: "2.0" },
                    id: { type: "string" },
                    method: { type: "string", example: "tools/list" },
                    params: { type: "object" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "MCP response",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Jobs
      // -----------------------------------------------------------------------
      "/v1/jobs": {
        post: {
          operationId: "createJob",
          tags: ["Jobs"],
          summary: "Create an automation job",
          description: "Queues a background automation job. Requires scope: `jobs:create`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["type", "payload"],
                  properties: {
                    type: { type: "string", description: "Job type identifier" },
                    payload: { type: "object" },
                    schedule_at: { type: "string", format: "date-time", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            "202": {
              description: "Job queued",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobStatus" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
        get: {
          operationId: "listJobs",
          tags: ["Jobs"],
          summary: "List automation jobs",
          description: "Returns jobs for the current tenant. Requires scope: `jobs:read`.",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          ],
          responses: {
            "200": {
              description: "Job list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      jobs: { type: "array", items: { $ref: "#/components/schemas/JobStatus" } },
                      pagination: { $ref: "#/components/schemas/Pagination" },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/jobs/{jobId}": {
        get: {
          operationId: "getJob",
          tags: ["Jobs"],
          summary: "Get job details",
          description: "Requires scope: `jobs:read`.",
          parameters: [
            { name: "jobId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Job details",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobStatus" },
                },
              },
            },
            "404": errorResponse("Job not found"),
            ...commonErrorResponses,
          },
        },
        delete: {
          operationId: "cancelJob",
          tags: ["Jobs"],
          summary: "Cancel or delete a job",
          description: "Cancels a pending job or deletes a completed one. Requires scope: `jobs:create`.",
          parameters: [
            { name: "jobId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "204": { description: "Job cancelled" },
            "404": errorResponse("Job not found"),
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Webhooks
      // -----------------------------------------------------------------------
      "/v1/webhooks": {
        post: {
          operationId: "createWebhook",
          tags: ["Webhooks"],
          summary: "Register a webhook endpoint",
          description: "Creates a new webhook subscription. Requires scope: `webhooks:manage`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url", "events"],
                  properties: {
                    url: { type: "string", format: "uri", description: "HTTPS endpoint URL" },
                    events: {
                      type: "array",
                      items: { type: "string" },
                      description: "Event types to subscribe to",
                    },
                    retry_policy: { type: "string", enum: ["none", "exponential"], default: "exponential" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Webhook created",
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { $ref: "#/components/schemas/WebhookEndpoint" },
                      {
                        type: "object",
                        properties: {
                          secret: { type: "string", description: "Signing secret (shown once only)" },
                        },
                      },
                    ],
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
        get: {
          operationId: "listWebhooks",
          tags: ["Webhooks"],
          summary: "List webhook endpoints",
          description: "Requires scope: `webhooks:manage`.",
          responses: {
            "200": {
              description: "Webhook list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      webhooks: { type: "array", items: { $ref: "#/components/schemas/WebhookEndpoint" } },
                    },
                  },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
      "/v1/webhooks/{id}": {
        patch: {
          operationId: "updateWebhook",
          tags: ["Webhooks"],
          summary: "Update or re-enable a webhook endpoint",
          description: "Updates events, retry policy, or re-enables a disabled endpoint. Requires scope: `webhooks:manage`.",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    events: { type: "array", items: { type: "string" } },
                    retry_policy: { type: "string", enum: ["none", "exponential"] },
                    is_active: { type: "boolean", description: "Set to true to re-enable a disabled endpoint" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Webhook updated",
              content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookEndpoint" } } },
            },
            "404": errorResponse("Webhook not found"),
            ...commonErrorResponses,
          },
        },
        delete: {
          operationId: "deleteWebhook",
          tags: ["Webhooks"],
          summary: "Delete a webhook endpoint",
          description: "Requires scope: `webhooks:manage`.",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "204": { description: "Webhook deleted" },
            "404": errorResponse("Webhook not found"),
            ...commonErrorResponses,
          },
        },
      },
      // -----------------------------------------------------------------------
      // Events (SSE)
      // -----------------------------------------------------------------------
      "/v1/events": {
        get: {
          operationId: "streamEvents",
          tags: ["Events"],
          summary: "Subscribe to real-time events via Server-Sent Events",
          description: "Connect with `Accept: text/event-stream`. Each event is a JSON payload. Requires scope: `events:read`.",
          parameters: [
            {
              name: "types",
              in: "query",
              schema: { type: "string" },
              description: "Comma-separated event types to filter (e.g. `job.completed,credits.low`)",
            },
          ],
          responses: {
            "200": {
              description: "SSE stream",
              content: {
                "text/event-stream": {
                  schema: { type: "string", description: "Server-Sent Events stream" },
                },
              },
            },
            ...commonErrorResponses,
          },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerPublicDocsRoutes(app: Express): void {
  const spec = buildOpenApiSpec();

  // GET /v1/openapi.json — raw spec (unauthenticated)
  app.get("/v1/openapi.json", (_req, res) => {
    res.json(spec);
  });

  // GET /v1/docs — interactive Swagger UI (unauthenticated)
  app.use(
    "/v1/docs",
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: "SmartSpecPro API Docs",
      customCss: ".swagger-ui .topbar { display: none }",
      swaggerOptions: {
        persistAuthorization: true,
        url: "/v1/openapi.json",
      },
    }),
  );
}
