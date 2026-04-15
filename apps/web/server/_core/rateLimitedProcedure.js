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
exports.createRateLimitMiddleware = createRateLimitMiddleware;
var server_1 = require("@trpc/server");
var buckets = new Map();
// Periodic cleanup: evict stale entries every 60 seconds to prevent memory leak
setInterval(function () {
    var cutoff = Date.now() - 5 * 60000;
    for (var _i = 0, buckets_1 = buckets; _i < buckets_1.length; _i++) {
        var _a = buckets_1[_i], key = _a[0], bucket = _a[1];
        bucket.ts = bucket.ts.filter(function (t) { return t > cutoff; });
        if (bucket.ts.length === 0)
            buckets.delete(key);
    }
}, 60000).unref();
function getIp(ctx) {
    // M-14 fix: Use req.ip which respects the trust proxy setting (set to 1 = trust
    // only Nginx). This returns the correct client IP without XFF spoofing risk.
    return ctx.req.ip || "unknown";
}
/**
 * Creates a tRPC middleware that enforces rate limiting per IP address.
 * Uses in-memory sliding window (same approach as limits.ts).
 * For multi-instance production, consider shared Redis-backed rate limiting.
 */
function createRateLimitMiddleware(opts) {
    var _this = this;
    return function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
        var ip, key, bucket, now;
        var _c;
        var ctx = _b.ctx, next = _b.next;
        return __generator(this, function (_d) {
            ip = getIp(ctx);
            key = "".concat(opts.namespace, ":").concat(ip);
            bucket = (_c = buckets.get(key)) !== null && _c !== void 0 ? _c : { ts: [] };
            now = Date.now();
            // Prune expired timestamps
            bucket.ts = bucket.ts.filter(function (t) { return t > now - opts.windowMs; });
            if (bucket.ts.length >= opts.limit) {
                throw new server_1.TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: "Rate limit exceeded. Please try again later.",
                });
            }
            bucket.ts.push(now);
            buckets.set(key, bucket);
            return [2 /*return*/, next()];
        });
    }); };
}
