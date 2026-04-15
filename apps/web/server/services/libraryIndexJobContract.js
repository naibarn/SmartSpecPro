"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLibraryIndexJobPayload = buildLibraryIndexJobPayload;
exports.parseLibraryIndexJobPayload = parseLibraryIndexJobPayload;
exports.shouldThrottleLibraryEnqueue = shouldThrottleLibraryEnqueue;
function normalizeTenantId(tenantId) {
    return String(tenantId).trim();
}
function buildDedupeKey(params) {
    return "libidx:v2:".concat(params.domain, ":").concat(params.operation, ":").concat(params.tenantId, ":").concat(params.entityId);
}
function buildLibraryIndexJobPayload(input) {
    var tenantId = normalizeTenantId(input.tenantId);
    return {
        version: "v2",
        domain: input.domain,
        operation: input.operation,
        tenantId: tenantId,
        entityId: input.entityId,
        dedupeKey: buildDedupeKey({
            domain: input.domain,
            operation: input.operation,
            tenantId: tenantId,
            entityId: input.entityId,
        }),
        source: input.source,
        sourceMetadata: input.sourceMetadata || {},
        createdAt: new Date().toISOString(),
    };
}
function deriveLegacyDomain(jobType) {
    return jobType.startsWith("gallery") ? "gallery" : "library";
}
function deriveLegacyOperation(jobType) {
    return jobType.includes("delete") ? "delete" : "index";
}
function parseLibraryIndexJobPayload(raw) {
    if (raw &&
        typeof raw === "object" &&
        raw.version === "v2") {
        var payload = raw;
        return {
            version: "v2",
            domain: payload.domain,
            operation: payload.operation,
            tenantId: normalizeTenantId(payload.tenantId),
            entityId: payload.entityId,
            dedupeKey: payload.dedupeKey,
            source: payload.source,
            sourceMetadata: payload.sourceMetadata || {},
        };
    }
    if (raw && typeof raw === "object") {
        var legacy = raw;
        var tenantId = normalizeTenantId(legacy.tenantId || "");
        var jobType = (legacy.jobType || "initial_index").trim();
        var domain = deriveLegacyDomain(jobType);
        var operation = deriveLegacyOperation(jobType);
        var entityId = legacy.entityId ||
            (legacy.libraryItemId ? "library:".concat(legacy.libraryItemId) : legacy.galleryItemId ? "gallery:".concat(legacy.galleryItemId) : "unknown:0");
        var dedupeKey = legacy.dedupeKey ||
            buildDedupeKey({
                domain: domain,
                operation: operation,
                tenantId: tenantId,
                entityId: entityId,
            });
        return {
            version: "legacy",
            domain: domain,
            operation: operation,
            tenantId: tenantId,
            entityId: entityId,
            dedupeKey: dedupeKey,
            source: legacy.source || "legacy:".concat(jobType),
            sourceMetadata: legacy.sourceMetadata || {},
        };
    }
    throw new Error("Invalid library index job payload");
}
function shouldThrottleLibraryEnqueue(input) {
    if (!input.enabled) {
        return false;
    }
    return input.currentQueueLagMinutes > input.maxQueueLagMinutes;
}
