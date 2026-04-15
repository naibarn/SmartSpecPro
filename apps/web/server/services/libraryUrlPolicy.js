"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyHostSafety = classifyHostSafety;
exports.validateLibraryUrl = validateLibraryUrl;
var BLOCKED_SCHEMES = new Set(["javascript:", "vbscript:", "file:", "data:"]);
var CONTEXT_POLICY = {
    library_source_url: {
        allowRelative: true,
        requirePublicHost: true,
    },
    library_thumbnail_url: {
        allowRelative: true,
        requirePublicHost: true,
    },
    office_preview_url: {
        allowRelative: false,
        requirePublicHost: true,
    },
    image_proxy_target_url: {
        allowRelative: false,
        requirePublicHost: true,
    },
};
function validationError(reason, message) {
    return {
        ok: false,
        reason: reason,
        message: message,
    };
}
function isPrivateIpv4(hostname) {
    var m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m)
        return false;
    var a = Number(m[1]);
    var b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0)
        return true;
    if (a === 169 && b === 254)
        return true;
    if (a === 192 && b === 168)
        return true;
    if (a === 172 && b >= 16 && b <= 31)
        return true;
    return false;
}
function isPrivateIpv6(hostname) {
    var host = hostname.toLowerCase();
    if (host === "::1")
        return true;
    if (host.startsWith("fc") || host.startsWith("fd"))
        return true;
    if (host.startsWith("fe80"))
        return true;
    return false;
}
function classifyHostSafety(hostname) {
    var host = hostname.trim().toLowerCase();
    if (!host)
        return "blocked_local_private_host";
    if (host === "localhost" ||
        host === "host.docker.internal" ||
        host.endsWith(".local")) {
        return "blocked_local_private_host";
    }
    if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
        return "blocked_local_private_host";
    }
    return "ok";
}
function validateLibraryUrl(rawUrl, context) {
    var policy = CONTEXT_POLICY[context];
    var candidate = rawUrl.trim();
    if (!candidate) {
        return validationError("empty_url", "URL is required");
    }
    if (candidate.startsWith("/")) {
        if (candidate.startsWith("//")) {
            return validationError("invalid_relative_path", "Relative URL must start with /");
        }
        if (!policy.allowRelative) {
            return validationError("relative_not_allowed", "Relative URL is not allowed in this context");
        }
        return {
            ok: true,
            normalizedUrl: candidate,
            classification: "relative_local_path",
        };
    }
    var schemeMatch = candidate.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/);
    var scheme = schemeMatch ? schemeMatch[1].toLowerCase() : null;
    if (!scheme) {
        return validationError("invalid_relative_path", "Relative URL must start with /");
    }
    if (scheme && BLOCKED_SCHEMES.has(scheme)) {
        return validationError("blocked_scheme", "URL scheme ".concat(scheme, " is not allowed"));
    }
    var parsed;
    try {
        parsed = new URL(candidate);
    }
    catch (_a) {
        return validationError("malformed_url", "URL is malformed");
    }
    if (parsed.protocol !== "https:") {
        if (BLOCKED_SCHEMES.has(parsed.protocol.toLowerCase())) {
            return validationError("blocked_scheme", "URL scheme ".concat(parsed.protocol, " is not allowed"));
        }
        return validationError("unsupported_protocol", "Only HTTPS URLs are allowed");
    }
    if (policy.requirePublicHost && classifyHostSafety(parsed.hostname) !== "ok") {
        return validationError("blocked_local_private_host", "Private or local hosts are not allowed");
    }
    return {
        ok: true,
        normalizedUrl: parsed.toString(),
        classification: "external_https_url",
    };
}
