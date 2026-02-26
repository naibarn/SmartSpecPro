export const ENV = {
  // Use VITE_APP_ID if available, fall back to sensible default for local development
  appId: process.env.VITE_APP_ID ?? "smartspec-local-dev",
  cookieSecret: process.env.JWT_SECRET ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // Admin user email for local development (defaults to admin@localhost.local)
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@localhost.local",

  // Optional bearer tokens for non-browser callers (e.g. LLM proxy -> website gateway / MCP).
  // If unset, only session-cookie auth is accepted.
  webGatewayToken:
    process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ??
    process.env.WEB_GATEWAY_TOKEN ??
    "",
  mcpServerToken:
    process.env.SMARTSPEC_MCP_TOKEN ??
    process.env.MCP_SERVER_TOKEN ??
    process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ??
    process.env.WEB_GATEWAY_TOKEN ??
    "",

  // Forge API integration (server-side storage/media proxy path).
  forgeApiUrl:
    process.env.FORGE_API_URL ?? "",
  forgeApiKey:
    process.env.FORGE_API_KEY ?? "",

  // OAuth and workflow backend endpoints
  oAuthServerUrl:
    process.env.OAUTH_SERVER_URL ??
    process.env.VITE_OAUTH_SERVER_URL ??
    "",
  pythonBackendUrl:
    process.env.PYTHON_BACKEND_URL ??
    process.env.VITE_PYTHON_BACKEND_URL ??
    "",

  // OpenSandbox integration
  opensandboxEnabled: process.env.OPENSANDBOX_ENABLED === "true",
  opensandboxDispatchMode: process.env.OPENSANDBOX_DISPATCH_MODE ?? "optional",
  sandboxDefaultProfile: process.env.SANDBOX_DEFAULT_PROFILE ?? "code-default",
  sandboxRequireForSkills: process.env.SANDBOX_REQUIRE_FOR_SKILLS === "true",
  sandboxRequireForMedia: process.env.SANDBOX_REQUIRE_FOR_MEDIA === "true",
};
