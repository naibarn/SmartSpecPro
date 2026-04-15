"use strict";
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
// Security: All server-side env vars should use non-VITE_ names.
// VITE_ fallbacks are kept only for backwards compatibility — remove after .env migration.
// VITE_ prefix vars are bundled into the client JS by Vite, exposing them to browsers.
exports.ENV = {
    appId: (_b = (_a = process.env.APP_ID) !== null && _a !== void 0 ? _a : process.env.VITE_APP_ID) !== null && _b !== void 0 ? _b : "smartspec-local-dev",
    cookieSecret: (_c = process.env.JWT_SECRET) !== null && _c !== void 0 ? _c : "",
    jwtSecret: (_d = process.env.JWT_SECRET) !== null && _d !== void 0 ? _d : "",
    databaseUrl: (_e = process.env.DATABASE_URL) !== null && _e !== void 0 ? _e : "",
    ownerOpenId: (_f = process.env.OWNER_OPEN_ID) !== null && _f !== void 0 ? _f : "",
    isProduction: process.env.NODE_ENV === "production",
    // Admin user email for local development (defaults to admin@localhost.local)
    adminEmail: (_g = process.env.ADMIN_EMAIL) !== null && _g !== void 0 ? _g : "admin@localhost.local",
    // Optional bearer tokens for non-browser callers (e.g. LLM proxy -> website gateway / MCP).
    // If unset, only session-cookie auth is accepted.
    webGatewayToken: (_j = (_h = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN) !== null && _h !== void 0 ? _h : process.env.WEB_GATEWAY_TOKEN) !== null && _j !== void 0 ? _j : "",
    mcpServerToken: (_o = (_m = (_l = (_k = process.env.SMARTSPEC_MCP_TOKEN) !== null && _k !== void 0 ? _k : process.env.MCP_SERVER_TOKEN) !== null && _l !== void 0 ? _l : process.env.SMARTSPEC_WEB_GATEWAY_TOKEN) !== null && _m !== void 0 ? _m : process.env.WEB_GATEWAY_TOKEN) !== null && _o !== void 0 ? _o : "",
    // Forge API integration (server-side storage/media proxy path).
    forgeApiUrl: (_p = process.env.FORGE_API_URL) !== null && _p !== void 0 ? _p : "",
    forgeApiKey: (_q = process.env.FORGE_API_KEY) !== null && _q !== void 0 ? _q : "",
    // OAuth and workflow backend endpoints
    oAuthServerUrl: (_s = (_r = process.env.OAUTH_SERVER_URL) !== null && _r !== void 0 ? _r : process.env.VITE_OAUTH_SERVER_URL) !== null && _s !== void 0 ? _s : "",
    pythonBackendUrl: (_u = (_t = process.env.PYTHON_BACKEND_URL) !== null && _t !== void 0 ? _t : process.env.VITE_PYTHON_BACKEND_URL) !== null && _u !== void 0 ? _u : "",
    // OpenSandbox integration
    opensandboxEnabled: process.env.OPENSANDBOX_ENABLED === "true",
    opensandboxDispatchMode: (_v = process.env.OPENSANDBOX_DISPATCH_MODE) !== null && _v !== void 0 ? _v : "optional",
    sandboxDefaultProfile: (_w = process.env.SANDBOX_DEFAULT_PROFILE) !== null && _w !== void 0 ? _w : "code-default",
    sandboxRequireForSkills: process.env.SANDBOX_REQUIRE_FOR_SKILLS === "true",
    sandboxRequireForMedia: process.env.SANDBOX_REQUIRE_FOR_MEDIA === "true",
    // Public API key HMAC secret (server pepper for key hashing)
    apiKeyHmacSecret: (_x = process.env.API_KEY_HMAC_SECRET) !== null && _x !== void 0 ? _x : "",
};
