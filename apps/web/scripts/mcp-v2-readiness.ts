import { getCachedMcpRuntimeConfig, refreshMcpRuntimeConfigCache } from "../server/services/mcpRuntimeConfig";

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

await refreshMcpRuntimeConfigCache();
const config = getCachedMcpRuntimeConfig();
const missing: string[] = [];
const invalid: string[] = [];

if (config.source !== "db") missing.push("MCP settings saved in Admin UI (system_settings category=mcp)");
if (!config.publicBaseUrl || !validUrl(config.publicBaseUrl)) invalid.push("publicBaseUrl must be an HTTPS URL");
if (config.modernProtocolEnabled && (!config.oauthResource || !validUrl(config.oauthResource))) invalid.push("oauthResource must be an HTTPS URL when Modern MCP is enabled");
if (config.oauthInboundEnabled) {
  if (!config.oauthIssuer || !validUrl(config.oauthIssuer)) invalid.push("oauthIssuer must be an HTTPS URL when OAuth inbound is enabled");
  if (!config.oauthJwksUri || !validUrl(config.oauthJwksUri)) invalid.push("oauthJwksUri must be an HTTPS URL when OAuth inbound is enabled");
  if (!config.oauthAudience) missing.push("oauthAudience");
}
if (config.oauthAuthorizationServerEnabled && !config.oauthPrivateJwk) missing.push("OAuth signing key (generate from Admin UI)");
if (!config.oauthScopesSupported.includes("mcp:read")) invalid.push("oauthScopesSupported must include mcp:read");

const report = {
  ready: missing.length === 0 && invalid.length === 0,
  mode: "production-ui",
  source: config.source,
  enabled: {
    modern: config.modernProtocolEnabled,
    oauthInbound: config.oauthInboundEnabled,
    protectedResourceMetadata: config.oauthProtectedResourceEnabled,
    authorizationServer: config.oauthAuthorizationServerEnabled,
  },
  missing,
  invalid,
};
console.log(JSON.stringify(report, null, 2));
if (!report.ready) process.exit(1);
