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
exports.rateLimitedDomainAdminProcedure = exports.workIntakeProcedure = exports.domainAdminProcedure = exports.rateLimitedAdminProcedure = exports.resetPasswordProcedure = exports.verifyEmailProcedure = exports.registerProcedure = exports.loginProcedure = exports.adminProcedure = exports.protectedProcedure = exports.publicProcedure = exports.middleware = exports.router = void 0;
var const_1 = require("@shared/const");
var server_1 = require("@trpc/server");
var superjson_1 = require("superjson");
var rateLimitedProcedure_1 = require("./rateLimitedProcedure");
var t = server_1.initTRPC.context().create({
    transformer: superjson_1.default,
});
exports.router = t.router;
exports.middleware = t.middleware;
exports.publicProcedure = t.procedure;
var requireUser = t.middleware(function (opts) { return __awaiter(void 0, void 0, void 0, function () {
    var ctx, next;
    return __generator(this, function (_a) {
        ctx = opts.ctx, next = opts.next;
        if (!ctx.user) {
            throw new server_1.TRPCError({ code: "UNAUTHORIZED", message: const_1.UNAUTHED_ERR_MSG });
        }
        return [2 /*return*/, next({
                ctx: __assign(__assign({}, ctx), { user: ctx.user }),
            })];
    });
}); });
exports.protectedProcedure = t.procedure.use(requireUser);
exports.adminProcedure = t.procedure.use(t.middleware(function (opts) { return __awaiter(void 0, void 0, void 0, function () {
    var ctx, next;
    return __generator(this, function (_a) {
        ctx = opts.ctx, next = opts.next;
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'system_agent')) {
            throw new server_1.TRPCError({ code: "FORBIDDEN", message: const_1.NOT_ADMIN_ERR_MSG });
        }
        return [2 /*return*/, next({
                ctx: __assign(__assign({}, ctx), { user: ctx.user }),
            })];
    });
}); }));
// Rate-limited auth procedures (public, no auth required)
exports.loginProcedure = t.procedure.use((0, rateLimitedProcedure_1.createRateLimitMiddleware)({ namespace: "login", limit: 10, windowMs: 60000 }));
exports.registerProcedure = t.procedure.use((0, rateLimitedProcedure_1.createRateLimitMiddleware)({ namespace: "register", limit: 5, windowMs: 60000 }));
exports.verifyEmailProcedure = t.procedure.use((0, rateLimitedProcedure_1.createRateLimitMiddleware)({ namespace: "verify-email", limit: 10, windowMs: 60000 }));
exports.resetPasswordProcedure = t.procedure.use((0, rateLimitedProcedure_1.createRateLimitMiddleware)({ namespace: "reset-password", limit: 5, windowMs: 60000 }));
// Rate-limited admin procedure — auth check first (rejects unauthenticated
// before consuming a rate-limit bucket), then rate limit to prevent abuse
exports.rateLimitedAdminProcedure = t.procedure
    .use(t.middleware(function (opts) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        if (!opts.ctx.user || (opts.ctx.user.role !== 'admin' && opts.ctx.user.role !== 'system_agent')) {
            throw new server_1.TRPCError({ code: "FORBIDDEN", message: const_1.NOT_ADMIN_ERR_MSG });
        }
        return [2 /*return*/, opts.next({ ctx: __assign(__assign({}, opts.ctx), { user: opts.ctx.user }) })];
    });
}); }))
    .use((0, rateLimitedProcedure_1.createRateLimitMiddleware)({ namespace: "admin", limit: 60, windowMs: 60000 }));
// Domain admin procedure - has access to manage users in their domain
exports.domainAdminProcedure = t.procedure.use(t.middleware(function (opts) { return __awaiter(void 0, void 0, void 0, function () {
    var ctx, next;
    return __generator(this, function (_a) {
        ctx = opts.ctx, next = opts.next;
        if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'domain_admin' && ctx.user.role !== 'system_agent')) {
            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "Domain admin access required" });
        }
        return [2 /*return*/, next({
                ctx: __assign(__assign({}, ctx), { user: ctx.user }),
            })];
    });
}); }));
// Work intake procedures - authenticated users can create and inspect their own requests
exports.workIntakeProcedure = exports.protectedProcedure;
// Rate-limited domain admin procedure - auth check first, then rate limit
// Used for sensitive export and query operations that need abuse protection
exports.rateLimitedDomainAdminProcedure = t.procedure
    .use(t.middleware(function (opts) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        if (!opts.ctx.user || (opts.ctx.user.role !== 'admin' && opts.ctx.user.role !== 'domain_admin' && opts.ctx.user.role !== 'system_agent')) {
            throw new server_1.TRPCError({ code: "FORBIDDEN", message: "Domain admin access required" });
        }
        return [2 /*return*/, opts.next({ ctx: __assign(__assign({}, opts.ctx), { user: opts.ctx.user }) })];
    });
}); }))
    .use((0, rateLimitedProcedure_1.createRateLimitMiddleware)({ namespace: "domain-admin", limit: 20, windowMs: 60000 }));
