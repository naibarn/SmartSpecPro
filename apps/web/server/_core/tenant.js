"use strict";
/**
 * Multi-Tenant Middleware
 * Identifies tenant from domain and attaches to request context
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearTenantCache = clearTenantCache;
exports.tenantMiddleware = tenantMiddleware;
exports.requireTenant = requireTenant;
exports.getTenantTheme = getTenantTheme;
exports.getTenantSeo = getTenantSeo;
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var drizzle_orm_1 = require("drizzle-orm");
// Cache for tenant lookups (5 minutes TTL)
var tenantCache = new Map();
var CACHE_TTL = 5 * 60 * 1000; // 5 minutes
/**
 * Get tenant from cache or database
 */
function getTenantByDomain(domain) {
    return __awaiter(this, void 0, void 0, function () {
        var cached, dbInstance, result, tenant, allTenants, _i, allTenants_1, t;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cached = tenantCache.get(domain);
                    if (cached && cached.tenant && Date.now() - cached.timestamp < CACHE_TTL) {
                        return [2 /*return*/, cached.tenant];
                    }
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    dbInstance = _a.sent();
                    if (!dbInstance)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, dbInstance
                            .select()
                            .from(schema_1.tenants)
                            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.tenants.primaryDomain, domain)))
                            .limit(1)];
                case 2:
                    result = _a.sent();
                    tenant = result[0] || null;
                    if (!!tenant) return [3 /*break*/, 4];
                    return [4 /*yield*/, dbInstance.select().from(schema_1.tenants).where((0, drizzle_orm_1.eq)(schema_1.tenants.isActive, true))];
                case 3:
                    allTenants = _a.sent();
                    for (_i = 0, allTenants_1 = allTenants; _i < allTenants_1.length; _i++) {
                        t = allTenants_1[_i];
                        if (t.domains && Array.isArray(t.domains) && t.domains.includes(domain)) {
                            tenantCache.set(domain, { tenant: t, timestamp: Date.now() });
                            return [2 /*return*/, t];
                        }
                    }
                    _a.label = 4;
                case 4:
                    // Cache result
                    tenantCache.set(domain, { tenant: tenant, timestamp: Date.now() });
                    return [2 /*return*/, tenant];
            }
        });
    });
}
/**
 * Clear tenant cache (useful for admin updates)
 */
function clearTenantCache(domain) {
    if (domain) {
        tenantCache.delete(domain);
    }
    else {
        tenantCache.clear();
    }
}
/**
 * Tenant middleware - identifies tenant from hostname
 */
function tenantMiddleware(req, res, next) {
    return __awaiter(this, void 0, void 0, function () {
        var urlPath, hostname, dbInstance, defaultTenant, tenant, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 5, , 6]);
                    urlPath = req.path || req.url;
                    if (/\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|woff2?|ttf|eot|map)(\?.*)?$/.test(urlPath)) {
                        return [2 /*return*/, next()];
                    }
                    hostname = req.hostname || ((_a = req.get("host")) === null || _a === void 0 ? void 0 : _a.split(":")[0]) || "localhost";
                    if (!(hostname === "localhost" || hostname === "127.0.0.1" || hostname === "host.docker.internal")) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    dbInstance = _b.sent();
                    if (!dbInstance)
                        return [2 /*return*/, next()];
                    return [4 /*yield*/, dbInstance
                            .select()
                            .from(schema_1.tenants)
                            .where((0, drizzle_orm_1.eq)(schema_1.tenants.isActive, true))
                            .limit(1)];
                case 2:
                    defaultTenant = (_b.sent())[0];
                    if (defaultTenant) {
                        req.tenant = defaultTenant;
                        req.tenantId = defaultTenant.id;
                    }
                    return [2 /*return*/, next()];
                case 3: return [4 /*yield*/, getTenantByDomain(hostname)];
                case 4:
                    tenant = _b.sent();
                    if (tenant && tenant.isActive) {
                        req.tenant = tenant;
                        req.tenantId = tenant.id;
                    }
                    else {
                        // No tenant found or inactive
                        return [2 /*return*/, res.status(404).json({
                                error: "Tenant not found",
                                message: "No active tenant found for domain: ".concat(hostname),
                            })];
                    }
                    next();
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _b.sent();
                    console.error("[Tenant Middleware] Error:", error_1);
                    next(error_1);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * Require tenant middleware - ensures tenant is present
 */
function requireTenant(req, res, next) {
    if (!req.tenant || !req.tenantId) {
        return res.status(400).json({
            error: "Tenant required",
            message: "This endpoint requires a valid tenant context",
        });
    }
    next();
}
/**
 * Get tenant theme configuration with defaults
 */
function getTenantTheme(tenant) {
    var defaultTheme = {
        primaryColor: "#2563eb",
        secondaryColor: "#06b6d4",
        accentColor: "#14b8a6",
        backgroundColor: "#ffffff",
        textColor: "#0f172a",
        fontFamily: "Inter, system-ui, sans-serif",
        headingFont: "Inter, system-ui, sans-serif",
        layout: "modern",
        headerStyle: "blur",
        footerStyle: "detailed",
        buttonStyle: "rounded",
        cardStyle: "elevated",
    };
    return __assign(__assign({}, defaultTheme), (tenant.themeConfig || {}));
}
/**
 * Get tenant SEO configuration with defaults
 */
function getTenantSeo(tenant) {
    var defaultSeo = {
        defaultTitle: "".concat(tenant.name, " | Skill Marketplace & Workflow Swarms"),
        defaultDescription: "Discover reusable skills, build virtual workflows, and run coordinated swarms across chat, presentation, and video outputs with ".concat(tenant.name, "."),
        defaultKeywords: [
            tenant.name,
            "skill marketplace",
            "virtual workflow",
            "swarm execution",
            "AI orchestration",
            "chat output",
            "presentation output",
            "video output",
        ],
        twitterCard: "summary_large_image",
        aiContext: "".concat(tenant.name, " is a skill marketplace platform for building virtual workflows and swarm executions that produce chat, presentation, and video outputs."),
        aiKeyFacts: [
            "".concat(tenant.name, " lets teams publish reusable skills."),
            "".concat(tenant.name, " supports virtual workflow orchestration."),
            "".concat(tenant.name, " can coordinate swarm execution for multiple outputs."),
        ],
    };
    return __assign(__assign({}, defaultSeo), (tenant.seoConfig || {}));
}
