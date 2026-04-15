"use strict";
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
exports.normalizePrivateVaultPrefs = normalizePrivateVaultPrefs;
exports.sanitizeUserPreferences = sanitizeUserPreferences;
exports.isPrivateVaultEnabled = isPrivateVaultEnabled;
exports.getPrivateVaultPinVersion = getPrivateVaultPinVersion;
exports.hashPrivateVaultPin = hashPrivateVaultPin;
exports.verifyPrivateVaultPin = verifyPrivateVaultPin;
exports.issuePrivateVaultAccessToken = issuePrivateVaultAccessToken;
exports.validatePrivateVaultAccessToken = validatePrivateVaultAccessToken;
var crypto_1 = require("crypto");
var bcrypt_1 = require("bcrypt");
var tokens_1 = require("../_core/tokens");
var PRIVATE_VAULT_TOKEN_TTL = "12h";
function normalizePrivateVaultPrefs(prefs) {
    if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
        return null;
    }
    var raw = prefs;
    var privateVault = raw.privateVault;
    if (!privateVault || typeof privateVault !== "object" || Array.isArray(privateVault)) {
        return null;
    }
    var vault = privateVault;
    return {
        enabled: vault.enabled === true,
        pinHash: typeof vault.pinHash === "string" ? vault.pinHash : undefined,
        pinVersion: Number.isFinite(Number(vault.pinVersion)) ? Number(vault.pinVersion) : undefined,
        pinUpdatedAt: typeof vault.pinUpdatedAt === "string" ? vault.pinUpdatedAt : undefined,
    };
}
function sanitizeUserPreferences(prefs) {
    var _a;
    var privateVault = normalizePrivateVaultPrefs(prefs);
    if (!privateVault) {
        return prefs;
    }
    var sanitized = __assign(__assign({}, prefs), { privateVault: {
            enabled: (_a = privateVault.enabled) !== null && _a !== void 0 ? _a : false,
            pinVersion: privateVault.pinVersion,
            pinUpdatedAt: privateVault.pinUpdatedAt,
        } });
    return sanitized;
}
function isPrivateVaultEnabled(prefs) {
    var privateVault = normalizePrivateVaultPrefs(prefs);
    return Boolean((privateVault === null || privateVault === void 0 ? void 0 : privateVault.enabled) && privateVault.pinHash);
}
function getPrivateVaultPinVersion(prefs) {
    var privateVault = normalizePrivateVaultPrefs(prefs);
    return Number.isFinite(privateVault === null || privateVault === void 0 ? void 0 : privateVault.pinVersion) && (privateVault === null || privateVault === void 0 ? void 0 : privateVault.pinVersion) ? Number(privateVault.pinVersion) : 1;
}
function hashPrivateVaultPin(pin) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, bcrypt_1.default.hash(pin, 10)];
        });
    });
}
function verifyPrivateVaultPin(pin, hash) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (!hash)
                return [2 /*return*/, false];
            return [2 /*return*/, bcrypt_1.default.compare(pin, hash)];
        });
    });
}
function issuePrivateVaultAccessToken(params) {
    return (0, tokens_1.signBearerToken)({
        sub: String(params.userId),
        type: "private_vault",
        scopes: ["private_vault:".concat(params.tenantId, ":").concat(params.pinVersion)],
        jti: "private_vault_".concat(Date.now(), "_").concat(crypto_1.default.randomBytes(10).toString("hex")),
    }, PRIVATE_VAULT_TOKEN_TTL);
}
function validatePrivateVaultAccessToken(params) {
    return __awaiter(this, void 0, void 0, function () {
        var claims, expectedScope, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, tokens_1.verifyBearerToken)(params.token)];
                case 1:
                    claims = _c.sent();
                    if (claims.sub !== String(params.userId))
                        return [2 /*return*/, false];
                    if (claims.type !== "private_vault")
                        return [2 /*return*/, false];
                    expectedScope = "private_vault:".concat(params.tenantId, ":").concat(params.pinVersion);
                    return [2 /*return*/, Boolean((_b = claims.scopes) === null || _b === void 0 ? void 0 : _b.includes(expectedScope))];
                case 2:
                    _a = _c.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
