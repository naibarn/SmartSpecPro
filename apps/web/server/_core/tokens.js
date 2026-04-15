"use strict";
/**
 * Token and scope utilities for SmartAIHub Web
 * Handles authorization scopes for MCP and other features
 */
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
exports.verifyBearerToken = verifyBearerToken;
exports.verifyBearerTokenIgnoringExpiration = verifyBearerTokenIgnoringExpiration;
exports.signBearerToken = signBearerToken;
exports.hasScope = hasScope;
exports.parseScopes = parseScopes;
exports.isValidScope = isValidScope;
exports.getDefaultScopes = getDefaultScopes;
exports.createInternalTokenFromAuth = createInternalTokenFromAuth;
var crypto_1 = require("crypto");
var jsonwebtoken_1 = require("jsonwebtoken");
var jwtSecretEnv = process.env.JWT_SECRET;
if (!jwtSecretEnv || jwtSecretEnv.length < 32) {
    throw new Error("CRITICAL: JWT_SECRET must be set (min 32 characters) in all environments");
}
var JWT_SECRET = jwtSecretEnv;
/**
 * Verify a bearer JWT token
 * @param token - JWT token string
 * @returns Decoded token claims
 * @throws Error if token is invalid
 */
function verifyBearerToken(token) {
    return __awaiter(this, void 0, void 0, function () {
        var decoded;
        return __generator(this, function (_a) {
            try {
                decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
                return [2 /*return*/, decoded];
            }
            catch (error) {
                throw new Error("Invalid token: ".concat(error.message));
            }
            return [2 /*return*/];
        });
    });
}
/**
 * Verify a bearer JWT token while ignoring expiration.
 *
 * Used only for token renewal flows where the signature still matters but the
 * token may have aged out.
 */
function verifyBearerTokenIgnoringExpiration(token) {
    return __awaiter(this, void 0, void 0, function () {
        var decoded;
        return __generator(this, function (_a) {
            try {
                decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET, { ignoreExpiration: true });
                return [2 /*return*/, decoded];
            }
            catch (error) {
                throw new Error("Invalid token: ".concat(error.message));
            }
            return [2 /*return*/];
        });
    });
}
/**
 * Sign a bearer JWT token
 * @param claims - Token claims to sign
 * @param expiresIn - Token expiration (default: 1h)
 * @returns Signed JWT token
 */
function signBearerToken(claims, expiresIn) {
    if (expiresIn === void 0) { expiresIn = "1h"; }
    return jsonwebtoken_1.default.sign(claims, JWT_SECRET, { expiresIn: expiresIn });
}
/**
 * Check if a user has a specific scope
 * @param scopes - Array of scopes the user has
 * @param required - Required scope to check
 * @returns true if user has the required scope
 */
function hasScope(scopes, required) {
    if (!scopes || !Array.isArray(scopes)) {
        return false;
    }
    // Check for exact match
    if (scopes.includes(required)) {
        return true;
    }
    // Check for wildcard scope (e.g., "mcp:*" covers "mcp:read", "mcp:write")
    var requiredPrefix = required.split(":")[0];
    if (scopes.includes("".concat(requiredPrefix, ":*"))) {
        return true;
    }
    // Check for admin scope which grants all permissions
    if (scopes.includes("admin") || scopes.includes("*")) {
        return true;
    }
    return false;
}
/**
 * Parse scopes from a token or string
 * @param scopeString - Space or comma separated scope string
 * @returns Array of scopes
 */
function parseScopes(scopeString) {
    if (!scopeString) {
        return [];
    }
    // Support both space and comma separated scopes
    return scopeString
        .split(/[\s,]+/)
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
}
/**
 * Validate scope format
 * @param scope - Scope to validate
 * @returns true if scope format is valid
 */
function isValidScope(scope) {
    if (!scope || typeof scope !== "string") {
        return false;
    }
    // Scope should be alphanumeric with colons and wildcards
    return /^[a-zA-Z0-9:*_-]+$/.test(scope);
}
/**
 * Get default scopes for a new user or token
 * @returns Array of default scopes
 */
function getDefaultScopes() {
    return [
        "mcp:read",
        "profile:read",
    ];
}
/**
 * Create a short-lived internal bearer token from an AuthContext.
 * Used to call service functions that still expect a userToken string
 * (e.g., Python backend communication via X-User-Token header).
 */
function createInternalTokenFromAuth(auth, scopes) {
    return signBearerToken({
        sub: String(auth.userId),
        type: "access",
        scopes: scopes !== null && scopes !== void 0 ? scopes : ["media:generate", "presentation:export"],
        jti: "api_".concat(Date.now(), "_").concat(crypto_1.default.randomBytes(12).toString("hex")),
    }, "15m");
}
