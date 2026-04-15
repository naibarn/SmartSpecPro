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
exports.sdk = void 0;
var const_1 = require("@shared/const");
var errors_1 = require("@shared/_core/errors");
var axios_1 = require("axios");
var cookie_1 = require("cookie");
var jose_1 = require("jose");
var node_crypto_1 = require("node:crypto");
var db = require("../db");
var env_1 = require("./env");
// Utility function
var isNonEmptyString = function (value) {
    return typeof value === "string" && value.length > 0;
};
var EXCHANGE_TOKEN_PATH = "/webdev.v1.WebDevAuthPublicService/ExchangeToken";
var GET_USER_INFO_PATH = "/webdev.v1.WebDevAuthPublicService/GetUserInfo";
var GET_USER_INFO_WITH_JWT_PATH = "/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt";
var OAuthService = /** @class */ (function () {
    function OAuthService(client) {
        this.client = client;
        // OAuth service initialized (no external OAuth server required)
    }
    OAuthService.prototype.decodeState = function (state) {
        var redirectUri = atob(state);
        return redirectUri;
    };
    OAuthService.prototype.getTokenByCode = function (code, state) {
        return __awaiter(this, void 0, void 0, function () {
            var payload, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        payload = {
                            clientId: env_1.ENV.appId,
                            grantType: "authorization_code",
                            code: code,
                            redirectUri: this.decodeState(state),
                        };
                        return [4 /*yield*/, this.client.post(EXCHANGE_TOKEN_PATH, payload)];
                    case 1:
                        data = (_a.sent()).data;
                        return [2 /*return*/, data];
                }
            });
        });
    };
    OAuthService.prototype.getUserInfoByToken = function (token) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.post(GET_USER_INFO_PATH, {
                            accessToken: token.accessToken,
                        })];
                    case 1:
                        data = (_a.sent()).data;
                        return [2 /*return*/, data];
                }
            });
        });
    };
    return OAuthService;
}());
var createOAuthHttpClient = function () {
    return axios_1.default.create({
        baseURL: env_1.ENV.oAuthServerUrl,
        timeout: const_1.AXIOS_TIMEOUT_MS,
    });
};
var SDKServer = /** @class */ (function () {
    function SDKServer(client) {
        if (client === void 0) { client = createOAuthHttpClient(); }
        this.client = client;
        this.oauthService = new OAuthService(this.client);
    }
    SDKServer.prototype.deriveLoginMethod = function (platforms, fallback) {
        if (fallback && fallback.length > 0)
            return fallback;
        if (!Array.isArray(platforms) || platforms.length === 0)
            return null;
        var set = new Set(platforms.filter(function (p) { return typeof p === "string"; }));
        if (set.has("REGISTERED_PLATFORM_EMAIL"))
            return "email";
        if (set.has("REGISTERED_PLATFORM_GOOGLE"))
            return "google";
        if (set.has("REGISTERED_PLATFORM_APPLE"))
            return "apple";
        if (set.has("REGISTERED_PLATFORM_MICROSOFT") ||
            set.has("REGISTERED_PLATFORM_AZURE"))
            return "microsoft";
        if (set.has("REGISTERED_PLATFORM_GITHUB"))
            return "github";
        var first = Array.from(set)[0];
        return first ? first.toLowerCase() : null;
    };
    /**
     * Exchange OAuth authorization code for access token
     * @example
     * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
     */
    SDKServer.prototype.exchangeCodeForToken = function (code, state) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.oauthService.getTokenByCode(code, state)];
            });
        });
    };
    /**
     * Get user information using access token
     * @example
     * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
     */
    SDKServer.prototype.getUserInfo = function (accessToken) {
        return __awaiter(this, void 0, void 0, function () {
            var data, loginMethod;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.oauthService.getUserInfoByToken({
                            accessToken: accessToken,
                        })];
                    case 1:
                        data = _c.sent();
                        loginMethod = this.deriveLoginMethod(data === null || data === void 0 ? void 0 : data.platforms, (_b = (_a = data === null || data === void 0 ? void 0 : data.platform) !== null && _a !== void 0 ? _a : data.platform) !== null && _b !== void 0 ? _b : null);
                        return [2 /*return*/, __assign(__assign({}, data), { platform: loginMethod, loginMethod: loginMethod })];
                }
            });
        });
    };
    SDKServer.prototype.parseCookies = function (cookieHeader) {
        if (!cookieHeader) {
            return new Map();
        }
        var parsed = (0, cookie_1.parse)(cookieHeader);
        return new Map(Object.entries(parsed));
    };
    SDKServer.prototype.getSessionSecret = function () {
        var secret = env_1.ENV.cookieSecret;
        return new TextEncoder().encode(secret);
    };
    /**
     * Create a session token for a Manus user openId
     * @example
     * const sessionToken = await sdk.createSessionToken(userInfo.openId);
     */
    SDKServer.prototype.createSessionToken = function (openId_1) {
        return __awaiter(this, arguments, void 0, function (openId, options) {
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                return [2 /*return*/, this.signSession({
                        openId: openId,
                        appId: env_1.ENV.appId,
                        name: options.name || "",
                    }, options)];
            });
        });
    };
    SDKServer.prototype.signSession = function (payload_1) {
        return __awaiter(this, arguments, void 0, function (payload, options) {
            var issuedAt, expiresInMs, expirationSeconds, secretKey;
            var _a, _b;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_c) {
                issuedAt = Date.now();
                expiresInMs = (_a = options.expiresInMs) !== null && _a !== void 0 ? _a : const_1.ONE_YEAR_MS;
                expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
                secretKey = this.getSessionSecret();
                return [2 /*return*/, new jose_1.SignJWT({
                        openId: payload.openId,
                        appId: payload.appId,
                        name: payload.name,
                        jti: (_b = payload.jti) !== null && _b !== void 0 ? _b : (0, node_crypto_1.randomUUID)(),
                    })
                        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
                        .setExpirationTime(expirationSeconds)
                        .sign(secretKey)];
            });
        });
    };
    SDKServer.prototype.verifySession = function (cookieValue) {
        return __awaiter(this, void 0, void 0, function () {
            var secretKey, payload, _a, openId, appId, name_1, jti, userId, role, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!cookieValue) {
                            console.warn("[Auth] Missing session cookie");
                            return [2 /*return*/, null];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        secretKey = this.getSessionSecret();
                        return [4 /*yield*/, (0, jose_1.jwtVerify)(cookieValue, secretKey, {
                                algorithms: ["HS256"],
                            })];
                    case 2:
                        payload = (_b.sent()).payload;
                        _a = payload, openId = _a.openId, appId = _a.appId, name_1 = _a.name, jti = _a.jti, userId = _a.userId, role = _a.role;
                        // System user JWT uses userId + role instead of openId + appId
                        if (userId === -1 && role === "system_agent") {
                            return [2 /*return*/, { openId: "", appId: "", name: "System Guardian", userId: userId, role: role }];
                        }
                        // Only openId and appId are required - name can be empty
                        if (!isNonEmptyString(openId) || !isNonEmptyString(appId)) {
                            console.warn("[Auth] Session payload missing required fields (openId or appId)");
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/, {
                                openId: openId,
                                appId: appId,
                                name: typeof name_1 === "string" ? name_1 : "",
                                jti: typeof jti === "string" ? jti : undefined,
                            }];
                    case 3:
                        error_1 = _b.sent();
                        console.warn("[Auth] Session verification failed", String(error_1));
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    SDKServer.prototype.getUserInfoWithJwt = function (jwtToken) {
        return __awaiter(this, void 0, void 0, function () {
            var payload, data, loginMethod;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        payload = {
                            jwtToken: jwtToken,
                            projectId: env_1.ENV.appId,
                        };
                        return [4 /*yield*/, this.client.post(GET_USER_INFO_WITH_JWT_PATH, payload)];
                    case 1:
                        data = (_c.sent()).data;
                        loginMethod = this.deriveLoginMethod(data === null || data === void 0 ? void 0 : data.platforms, (_b = (_a = data === null || data === void 0 ? void 0 : data.platform) !== null && _a !== void 0 ? _a : data.platform) !== null && _b !== void 0 ? _b : null);
                        return [2 /*return*/, __assign(__assign({}, data), { platform: loginMethod, loginMethod: loginMethod })];
                }
            });
        });
    };
    SDKServer.prototype.authenticateRequest = function (req) {
        return __awaiter(this, void 0, void 0, function () {
            var cookies, sessionCookie, authHeader, tokenToVerify, session, systemUser, sessionUserId, user, userInfo, error_2;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        cookies = this.parseCookies(req.headers.cookie);
                        sessionCookie = cookies.get(const_1.COOKIE_NAME);
                        authHeader = req.headers.authorization;
                        tokenToVerify = (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer "))
                            ? authHeader.substring(7)
                            : sessionCookie;
                        return [4 /*yield*/, this.verifySession(tokenToVerify)];
                    case 1:
                        session = _d.sent();
                        if (!session) {
                            throw (0, errors_1.ForbiddenError)("Invalid session cookie");
                        }
                        if (!(session.userId === -1 && session.role === "system_agent")) return [3 /*break*/, 3];
                        return [4 /*yield*/, db.getUserById(-1)];
                    case 2:
                        systemUser = _d.sent();
                        if (systemUser)
                            return [2 /*return*/, systemUser];
                        throw (0, errors_1.ForbiddenError)("System user not found");
                    case 3:
                        sessionUserId = session.openId;
                        return [4 /*yield*/, db.getUserByOpenId(sessionUserId)];
                    case 4:
                        user = (_d.sent());
                        if (!user) return [3 /*break*/, 6];
                        // Update last signed-in timestamp (non-blocking, uses dedicated update function)
                        return [4 /*yield*/, db.updateLastSignedIn(user.openId)];
                    case 5:
                        // Update last signed-in timestamp (non-blocking, uses dedicated update function)
                        _d.sent();
                        return [2 /*return*/, user];
                    case 6:
                        _d.trys.push([6, 10, , 11]);
                        return [4 /*yield*/, this.getUserInfoWithJwt(sessionCookie !== null && sessionCookie !== void 0 ? sessionCookie : "")];
                    case 7:
                        userInfo = _d.sent();
                        return [4 /*yield*/, db.upsertUser({
                                openId: userInfo.openId,
                                name: userInfo.name || null,
                                email: (_a = userInfo.email) !== null && _a !== void 0 ? _a : null,
                                loginMethod: (_c = (_b = userInfo.loginMethod) !== null && _b !== void 0 ? _b : userInfo.platform) !== null && _c !== void 0 ? _c : null,
                                lastSignedIn: new Date(),
                            })];
                    case 8:
                        _d.sent();
                        return [4 /*yield*/, db.getUserByOpenId(userInfo.openId)];
                    case 9:
                        user = (_d.sent());
                        return [3 /*break*/, 11];
                    case 10:
                        error_2 = _d.sent();
                        console.error("[Auth] Failed to sync user from OAuth:", error_2);
                        throw (0, errors_1.ForbiddenError)("Failed to sync user info");
                    case 11:
                        if (!user) {
                            throw (0, errors_1.ForbiddenError)("User not found");
                        }
                        return [2 /*return*/, user];
                }
            });
        });
    };
    return SDKServer;
}());
exports.sdk = new SDKServer();
