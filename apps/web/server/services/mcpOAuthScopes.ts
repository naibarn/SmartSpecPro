export const MCP_OAUTH_DEFAULT_SCOPES = [
  "mcp:read",
  "mcp:write",
  "llm:chat",
  "media:read",
  "media:generate",
  "media:download",
  "remotion:submit",
  "remotion:read",
  "remotion:cancel",
  "library:read",
  "library:download",
  "library:search",
  "library:upload",
  "hermes:connect",
  "hermes:read",
  "hermes:generate",
  "hermes:disconnect",
] as const;

export const MCP_OAUTH_LEGACY_SCOPE_ALIASES = {
  "models:read": "llm:chat",
  "render:submit": "remotion:submit",
  "render:read": "remotion:read",
  "render:cancel": "remotion:cancel",
} as const;
