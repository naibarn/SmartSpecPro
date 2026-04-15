"use strict";
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
exports.createContext = createContext;
var sdk_1 = require("./sdk");
var logger_1 = require("./logger");
var const_1 = require("@shared/const");
var cookie_1 = require("cookie");
function createContext(opts) {
    return __awaiter(this, void 0, void 0, function () {
        var user, userToken, privateVaultToken, authHeader, cookieHeader, cookies, sessionCookie, vaultTokenHeader, error_1, tenantReq, tenantId, publicUrl, origin_1, host, protocol;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    user = null;
                    userToken = null;
                    privateVaultToken = null;
                    authHeader = opts.req.headers.authorization;
                    if (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer ")) {
                        userToken = authHeader.substring(7);
                    }
                    else {
                        cookieHeader = opts.req.headers.cookie;
                        if (cookieHeader) {
                            cookies = (0, cookie_1.parse)(cookieHeader);
                            sessionCookie = cookies[const_1.COOKIE_NAME];
                            if (sessionCookie) {
                                userToken = sessionCookie;
                            }
                        }
                    }
                    vaultTokenHeader = opts.req.headers["x-private-vault-token"];
                    if (typeof vaultTokenHeader === "string" && vaultTokenHeader.trim()) {
                        privateVaultToken = vaultTokenHeader.trim();
                    }
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, sdk_1.sdk.authenticateRequest(opts.req)];
                case 2:
                    user = _d.sent();
                    (0, logger_1.debugLog)("Context", "User authenticated", { id: user === null || user === void 0 ? void 0 : user.id, email: user === null || user === void 0 ? void 0 : user.email });
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _d.sent();
                    // Authentication is optional for public procedures.
                    (0, logger_1.debugLog)("Context", "Auth failed (optional)", error_1 instanceof Error ? error_1.message : error_1);
                    user = null;
                    userToken = null; // Clear token if auth failed
                    privateVaultToken = null;
                    return [3 /*break*/, 4];
                case 4:
                    tenantReq = opts.req;
                    tenantId = (_b = (_a = tenantReq.tenant) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
                    publicUrl = null;
                    if ((_c = tenantReq.tenant) === null || _c === void 0 ? void 0 : _c.primaryDomain) {
                        // Use tenant's configured primary domain with https
                        publicUrl = "https://".concat(tenantReq.tenant.primaryDomain);
                    }
                    else {
                        origin_1 = opts.req.headers.origin;
                        if (origin_1) {
                            publicUrl = origin_1;
                        }
                        else {
                            host = opts.req.headers.host;
                            protocol = opts.req.secure || opts.req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
                            if (host) {
                                publicUrl = "".concat(protocol, "://").concat(host);
                            }
                        }
                    }
                    return [2 /*return*/, {
                            req: opts.req,
                            res: opts.res,
                            user: user,
                            userToken: userToken,
                            privateVaultToken: privateVaultToken,
                            tenantId: tenantId,
                            publicUrl: publicUrl,
                        }];
            }
        });
    });
}
