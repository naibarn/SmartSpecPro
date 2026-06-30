"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTO_TEAM_MEDIA_TYPES = exports.AUTO_TEAM_FINAL_RESULT_STATUSES = exports.AUTO_TEAM_STAGE_STATUSES = exports.AUTO_TEAM_STAGE_TYPES = exports.AUTO_TEAM_CAPABILITY_FAMILIES = exports.AUTO_TEAM_ROUTE_CLASSES = void 0;
exports.getRequiredEvidenceForRoute = getRequiredEvidenceForRoute;
exports.routeRequiresMediaJob = routeRequiresMediaJob;
exports.routeAllowsCapability = routeAllowsCapability;
exports.getAllowedCapabilityFamilies = getAllowedCapabilityFamilies;
exports.isTerminalStageStatus = isTerminalStageStatus;
exports.isTerminalMediaStatus = isTerminalMediaStatus;
exports.isFinalResultTerminal = isFinalResultTerminal;
exports.validateArtifactRef = validateArtifactRef;
exports.assertCanonicalArtifactRef = assertCanonicalArtifactRef;
exports.AUTO_TEAM_ROUTE_CLASSES = [
    "media.video",
    "media.image",
    "agency.swarm",
    "workflow.automation",
    "research.synthesis",
    "document.writing",
    "unknown.blocked",
];
exports.AUTO_TEAM_CAPABILITY_FAMILIES = [
    "media.video",
    "media.image",
    "video.prompt",
    "image.prompt",
    "research.synthesis",
    "document.writing",
    "writing.review",
    "agency.swarm",
    "workflow.automation",
];
exports.AUTO_TEAM_STAGE_TYPES = [
    "route",
    "plan",
    "research",
    "storyboard",
    "prompt",
    "media_submit",
    "media_poll",
    "agency_delegate",
    "review",
    "repair",
    "human_approval",
    "finalize",
];
exports.AUTO_TEAM_STAGE_STATUSES = [
    "queued",
    "in_progress",
    "waiting_provider",
    "waiting_human",
    "reviewing",
    "completed",
    "needs_revision",
    "blocked",
    "failed",
    "cancelled",
    "superseded",
];
exports.AUTO_TEAM_FINAL_RESULT_STATUSES = [
    "completed",
    "failed",
    "cancelled",
    "legacy_unverified",
];
exports.AUTO_TEAM_MEDIA_TYPES = ["image", "video"];
function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
}
function getRequiredEvidenceForRoute(routeClass) {
    switch (routeClass) {
        case "media.video":
        case "media.image":
            return {
                requiresMediaJob: true,
                requiresPromptArtifact: true,
                requiresReview: true,
                requiresHumanApproval: routeClass === "media.video",
                requiresAgencyHandle: false,
                requiresFinalArtifact: true,
                promptOnlyInsufficient: true,
                requiredArtifactTypes: routeClass === "media.video"
                    ? ["research_summary", "storyboard", "media_prompt", "media_result"]
                    : ["media_prompt", "media_result"],
            };
        case "agency.swarm":
            return {
                requiresMediaJob: false,
                requiresPromptArtifact: false,
                requiresReview: true,
                requiresHumanApproval: true,
                requiresAgencyHandle: true,
                requiresFinalArtifact: true,
                promptOnlyInsufficient: false,
                requiredArtifactTypes: ["research_summary", "review_note", "final_result"],
            };
        case "workflow.automation":
            return {
                requiresMediaJob: false,
                requiresPromptArtifact: false,
                requiresReview: true,
                requiresHumanApproval: false,
                requiresAgencyHandle: false,
                requiresFinalArtifact: true,
                promptOnlyInsufficient: false,
                requiredArtifactTypes: ["review_note", "final_result"],
            };
        case "research.synthesis":
            return {
                requiresMediaJob: false,
                requiresPromptArtifact: false,
                requiresReview: true,
                requiresHumanApproval: false,
                requiresAgencyHandle: false,
                requiresFinalArtifact: true,
                promptOnlyInsufficient: false,
                requiredArtifactTypes: ["research_summary", "review_note", "final_result"],
            };
        case "document.writing":
            return {
                requiresMediaJob: false,
                requiresPromptArtifact: false,
                requiresReview: true,
                requiresHumanApproval: false,
                requiresAgencyHandle: false,
                requiresFinalArtifact: true,
                promptOnlyInsufficient: false,
                requiredArtifactTypes: ["review_note", "final_result"],
            };
        case "unknown.blocked":
        default:
            return {
                requiresMediaJob: false,
                requiresPromptArtifact: false,
                requiresReview: false,
                requiresHumanApproval: false,
                requiresAgencyHandle: false,
                requiresFinalArtifact: false,
                promptOnlyInsufficient: false,
                requiredArtifactTypes: [],
            };
    }
}
function routeRequiresMediaJob(routeClass) {
    return routeClass === "media.video" || routeClass === "media.image";
}
function routeAllowsCapability(routeClass, capabilityFamily) {
    var allowed = getAllowedCapabilityFamilies(routeClass);
    return allowed.includes(capabilityFamily);
}
function getAllowedCapabilityFamilies(routeClass) {
    switch (routeClass) {
        case "media.video":
            return ["video.prompt", "research.synthesis", "writing.review", "media.video"];
        case "media.image":
            return ["image.prompt", "research.synthesis", "writing.review", "media.image"];
        case "agency.swarm":
            return ["agency.swarm", "research.synthesis", "writing.review"];
        case "workflow.automation":
            return ["workflow.automation", "document.writing", "research.synthesis", "writing.review"];
        case "research.synthesis":
            return ["research.synthesis", "writing.review"];
        case "document.writing":
            return ["document.writing", "research.synthesis", "writing.review"];
        case "unknown.blocked":
        default:
            return [];
    }
}
function isTerminalStageStatus(status) {
    return [
        "completed",
        "needs_revision",
        "blocked",
        "failed",
        "cancelled",
        "superseded",
    ].includes(status);
}
function isTerminalMediaStatus(status) {
    var normalized = normalizeString(status).toLowerCase();
    return ["succeeded", "failed", "cancelled", "expired"].includes(normalized);
}
function isFinalResultTerminal(status) {
    return [
        "completed",
        "failed",
        "cancelled",
        "legacy_unverified",
    ].includes(status);
}
function validateArtifactRef(ref) {
    if (!ref)
        return false;
    if (!normalizeString(ref.tenantId))
        return false;
    if (!normalizeString(ref.artifactType))
        return false;
    if (!normalizeString(ref.artifactRole))
        return false;
    if (!normalizeString(ref.visibility))
        return false;
    if (!normalizeString(ref.safetyStatus))
        return false;
    if (!normalizeString(ref.storageRef) && !normalizeString(ref.externalRef)) {
        return false;
    }
    if (ref.retentionPolicyJson !== null && ref.retentionPolicyJson !== undefined) {
        if (typeof ref.retentionPolicyJson !== "object")
            return false;
    }
    return true;
}
function assertCanonicalArtifactRef(ref) {
    if (!validateArtifactRef(ref)) {
        throw new Error("Invalid canonical auto-team artifact ref");
    }
    return ref;
}
