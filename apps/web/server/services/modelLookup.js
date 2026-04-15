"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildModelLookupCandidates = buildModelLookupCandidates;
exports.buildModelProviderMapLookupCondition = buildModelProviderMapLookupCondition;
var drizzle_orm_1 = require("drizzle-orm");
var schema_1 = require("../../drizzle/schema");
function buildModelLookupCandidates(modelId) {
    var trimmed = modelId.trim();
    var candidates = new Set();
    if (trimmed.length > 0) {
        candidates.add(trimmed);
    }
    var unprefixed = trimmed.includes("/")
        ? trimmed.slice(trimmed.lastIndexOf("/") + 1).trim()
        : "";
    if (unprefixed.length > 0) {
        candidates.add(unprefixed);
    }
    return Array.from(candidates);
}
function buildModelProviderMapLookupCondition(modelId) {
    var lookupCandidates = buildModelLookupCandidates(modelId);
    if (lookupCandidates.length === 0) {
        return (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.modelId, "__missing_model__");
    }
    if (lookupCandidates.length === 1) {
        return (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.modelProviderMap.modelId, lookupCandidates[0]), (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.providerModelId, lookupCandidates[0]), (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " ? ", ""], ["", " ? ", ""])), schema_1.modelProviderMap.legacyModelAliases, lookupCandidates[0]));
    }
    return drizzle_orm_1.or.apply(void 0, lookupCandidates.flatMap(function (candidate) { return [
        (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.modelId, candidate),
        (0, drizzle_orm_1.eq)(schema_1.modelProviderMap.providerModelId, candidate),
        (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["", " ? ", ""], ["", " ? ", ""])), schema_1.modelProviderMap.legacyModelAliases, candidate),
    ]; }));
}
var templateObject_1, templateObject_2;
