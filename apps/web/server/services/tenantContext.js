"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTenantId = resolveTenantId;
exports.resolveTenantIdVarchar = resolveTenantIdVarchar;
function parseTenantId(value) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === "string") {
        var trimmed = value.trim();
        if (!trimmed)
            return null;
        if (/^\d+$/.test(trimmed)) {
            var parsed = Number.parseInt(trimmed, 10);
            if (Number.isInteger(parsed) && parsed > 0) {
                return parsed;
            }
        }
        return trimmed;
    }
    return null;
}
function normalizeTenantIdVarchar(value) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        return String(value);
    }
    if (typeof value === "string") {
        var trimmed = value.trim();
        if (!trimmed)
            return null;
        return trimmed;
    }
    return null;
}
/**
 * Resolve tenant ID for library/runtime operations.
 *
 * Prefer request tenant context first because it reflects current domain routing.
 * Fall back to user profile tenant when request context is unavailable.
 */
function resolveTenantId(ctxTenantId, userCurrentTenantId) {
    var ctxTenantIdParsed = parseTenantId(ctxTenantId);
    var userTenantIdParsed = parseTenantId(userCurrentTenantId);
    // Compatibility fallback:
    // In mixed-schema environments, request context can be a string tenant slug
    // while user profile still stores a numeric tenant ID. Prefer numeric profile ID
    // to avoid breaking integer-typed tenant foreign keys.
    if (typeof ctxTenantIdParsed === "string" &&
        typeof userTenantIdParsed === "number") {
        return userTenantIdParsed;
    }
    if (ctxTenantIdParsed !== null)
        return ctxTenantIdParsed;
    if (userTenantIdParsed !== null)
        return userTenantIdParsed;
    return null;
}
/**
 * Resolve tenant ID as a canonical varchar/string value.
 *
 * Use this for boundary flows backed by varchar tenant IDs.
 * Preference order: request tenant context, then user current tenant.
 */
function resolveTenantIdVarchar(ctxTenantId, userCurrentTenantId) {
    var fromContext = normalizeTenantIdVarchar(ctxTenantId);
    if (fromContext !== null)
        return fromContext;
    var fromUser = normalizeTenantIdVarchar(userCurrentTenantId);
    if (fromUser !== null)
        return fromUser;
    return null;
}
