"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
exports.createUserGroup = createUserGroup;
exports.getUserGroups = getUserGroups;
exports.addGroupMember = addGroupMember;
exports.removeGroupMember = removeGroupMember;
exports.deleteUserGroup = deleteUserGroup;
exports.approveJoinRequest = approveJoinRequest;
exports.rejectJoinRequest = rejectJoinRequest;
exports.updateUserGroup = updateUserGroup;
exports.updateGroupMemberRole = updateGroupMemberRole;
exports.joinOpenGroup = joinOpenGroup;
exports.requestJoinGroup = requestJoinGroup;
exports.getGroupMembers = getGroupMembers;
exports.searchTenantUsers = searchTenantUsers;
exports.searchPublicGroups = searchPublicGroups;
var server_1 = require("@trpc/server");
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("../db");
var redis_1 = require("./redis");
var schema_1 = require("../../drizzle/schema");
var GROUPS_CACHE_TTL_SECONDS = 60;
var MAX_GROUPS_PER_OWNER = 50;
var MAX_GROUP_MEMBERS = 100;
var MAX_GROUP_NAME_LENGTH = 128;
var MAX_GROUP_DESCRIPTION_LENGTH = 512;
function normalizeTenantId(tenantId) {
    var normalized = String(tenantId).trim();
    if (!normalized) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Tenant context is required for group operations",
        });
    }
    return normalized;
}
function validateGroupName(name) {
    var trimmed = name.trim();
    if (!trimmed) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Group name is required",
        });
    }
    if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Group name must be at most ".concat(MAX_GROUP_NAME_LENGTH, " characters"),
        });
    }
    // Block control characters (except normal whitespace)
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Group name contains invalid characters",
        });
    }
    // Block HTML tags
    if (/<[^>]*>/.test(trimmed)) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Group name must not contain HTML tags",
        });
    }
    // Normalize consecutive whitespace
    return trimmed.replace(/\s+/g, " ");
}
function validateGroupDescription(description) {
    if (description === undefined || description === null) {
        return null;
    }
    var trimmed = description.trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.length > MAX_GROUP_DESCRIPTION_LENGTH) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Group description must be at most ".concat(MAX_GROUP_DESCRIPTION_LENGTH, " characters"),
        });
    }
    // Block control characters (except normal whitespace)
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Group description contains invalid characters",
        });
    }
    // Block HTML tags
    if (/<[^>]*>/.test(trimmed)) {
        throw new server_1.TRPCError({
            code: "BAD_REQUEST",
            message: "Group description must not contain HTML tags",
        });
    }
    // Normalize consecutive whitespace
    return trimmed.replace(/\s+/g, " ");
}
function getGroupsCacheKey(userId, tenantId) {
    return "user:".concat(userId, ":groups:").concat(tenantId);
}
function getRedisOrNull() {
    if (!(0, redis_1.isRedisAvailable)()) {
        return null;
    }
    try {
        return (0, redis_1.getRedisClient)();
    }
    catch (_a) {
        return null;
    }
}
function invalidateUserGroupsCache(userId, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var redis;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    redis = getRedisOrNull();
                    if (!redis)
                        return [2 /*return*/];
                    return [4 /*yield*/, redis.del(getGroupsCacheKey(userId, tenantId))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function invalidateManyUsersGroupsCache(userIds, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var redis;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!userIds.length)
                        return [2 /*return*/];
                    redis = getRedisOrNull();
                    if (!redis)
                        return [2 /*return*/];
                    return [4 /*yield*/, Promise.all(userIds.map(function (userId) { return redis.del(getGroupsCacheKey(userId, tenantId)); }))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function resolveDb(dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (dbClient)
                        return [2 /*return*/, dbClient];
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [2 /*return*/, db];
            }
        });
    });
}
function getGroupForTenant(db, groupId, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.userGroups)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userGroups.id, groupId), (0, drizzle_orm_1.eq)(schema_1.userGroups.tenantId, tenantId), (0, drizzle_orm_1.isNull)(schema_1.userGroups.deletedAt)))
                        .limit(1)];
                case 1:
                    rows = _b.sent();
                    return [2 /*return*/, (_a = rows[0]) !== null && _a !== void 0 ? _a : null];
            }
        });
    });
}
function hasAdminMembership(db, groupId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.groupMembers)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.userId, userId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "active")))
                        .limit(1)];
                case 1:
                    rows = _b.sent();
                    return [2 /*return*/, ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.role) === "admin"];
            }
        });
    });
}
function requireAdminOrOwner(db, groupId, actor) {
    return __awaiter(this, void 0, void 0, function () {
        var tenantId, group, isAdmin;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    tenantId = normalizeTenantId(actor.tenantId);
                    return [4 /*yield*/, getGroupForTenant(db, groupId, tenantId)];
                case 1:
                    group = _a.sent();
                    if (!group) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Group not found",
                        });
                    }
                    if (group.ownerId === actor.userId) {
                        return [2 /*return*/, group];
                    }
                    return [4 /*yield*/, hasAdminMembership(db, groupId, actor.userId)];
                case 2:
                    isAdmin = _a.sent();
                    if (!isAdmin) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Only group admins can perform this action",
                        });
                    }
                    return [2 /*return*/, group];
            }
        });
    });
}
function getTenantDomains(db, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows, tenant, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select({ primaryDomain: schema_1.tenants.primaryDomain, domains: schema_1.tenants.domains })
                        .from(schema_1.tenants)
                        .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, tenantId))
                        .limit(1)];
                case 1:
                    rows = _a.sent();
                    tenant = rows[0];
                    result = [];
                    if (tenant === null || tenant === void 0 ? void 0 : tenant.primaryDomain)
                        result.push(tenant.primaryDomain);
                    if ((tenant === null || tenant === void 0 ? void 0 : tenant.domains) && Array.isArray(tenant.domains)) {
                        result.push.apply(result, tenant.domains);
                    }
                    return [2 /*return*/, result];
            }
        });
    });
}
function requireTargetUserInTenant(db, userId, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var rows, target, matchesByTenantId, tenantDomains, matchesByDomain;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db
                        .select({
                        id: schema_1.users.id,
                        currentTenantId: schema_1.users.currentTenantId,
                        registeredDomain: schema_1.users.registeredDomain,
                    })
                        .from(schema_1.users)
                        .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
                        .limit(1)];
                case 1:
                    rows = _a.sent();
                    target = rows[0];
                    if (!target) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "User not found",
                        });
                    }
                    matchesByTenantId = target.currentTenantId !== null && String(target.currentTenantId) === tenantId;
                    if (!!matchesByTenantId) return [3 /*break*/, 3];
                    return [4 /*yield*/, getTenantDomains(db, tenantId)];
                case 2:
                    tenantDomains = _a.sent();
                    matchesByDomain = target.registeredDomain !== null && tenantDomains.includes(target.registeredDomain);
                    if (!matchesByDomain) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Cannot add users from another tenant",
                        });
                    }
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
function mapRole(inputRole) {
    return inputRole === "admin" ? "admin" : "member";
}
function createUserGroup(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, tenantId, now, name, description, visibility, joinPolicy, ownedCountRows, ownedCount, createdGroup, error_1, message;
        var _this = this;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _e.sent();
                    tenantId = normalizeTenantId(actor.tenantId);
                    now = new Date();
                    name = validateGroupName(input.name);
                    description = validateGroupDescription(input.description);
                    visibility = (_a = input.visibility) !== null && _a !== void 0 ? _a : "private";
                    joinPolicy = (_b = input.joinPolicy) !== null && _b !== void 0 ? _b : "invite_only";
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.userGroups)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userGroups.tenantId, tenantId), (0, drizzle_orm_1.eq)(schema_1.userGroups.ownerId, actor.userId), (0, drizzle_orm_1.isNull)(schema_1.userGroups.deletedAt)))];
                case 2:
                    ownedCountRows = _e.sent();
                    ownedCount = Number((_d = (_c = ownedCountRows[0]) === null || _c === void 0 ? void 0 : _c.count) !== null && _d !== void 0 ? _d : 0);
                    if (ownedCount >= MAX_GROUPS_PER_OWNER) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Maximum ".concat(MAX_GROUPS_PER_OWNER, " groups per user"),
                        });
                    }
                    _e.label = 3;
                case 3:
                    _e.trys.push([3, 6, , 7]);
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var inserted, group;
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0: return [4 /*yield*/, tx
                                            .insert(schema_1.userGroups)
                                            .values({
                                            tenantId: tenantId,
                                            name: name,
                                            description: description,
                                            ownerId: actor.userId,
                                            iconUrl: (_a = input.iconUrl) !== null && _a !== void 0 ? _a : null,
                                            settings: {
                                                visibility: visibility,
                                                joinPolicy: joinPolicy,
                                            },
                                            memberCount: 0,
                                            createdAt: now,
                                            updatedAt: now,
                                        })
                                            .returning()];
                                    case 1:
                                        inserted = _b.sent();
                                        group = inserted[0];
                                        if (!group) {
                                            throw new Error("Failed to create group");
                                        }
                                        return [4 /*yield*/, tx.insert(schema_1.groupMembers).values({
                                                groupId: group.id,
                                                userId: actor.userId,
                                                role: "admin",
                                                addedBy: actor.userId,
                                                status: "active",
                                                joinedAt: now,
                                            })];
                                    case 2:
                                        _b.sent();
                                        return [4 /*yield*/, tx
                                                .update(schema_1.userGroups)
                                                .set({
                                                memberCount: 1,
                                                updatedAt: now,
                                            })
                                                .where((0, drizzle_orm_1.eq)(schema_1.userGroups.id, group.id))];
                                    case 3:
                                        _b.sent();
                                        return [2 /*return*/, __assign(__assign({}, group), { memberCount: 1 })];
                                }
                            });
                        }); })];
                case 4:
                    createdGroup = _e.sent();
                    return [4 /*yield*/, invalidateUserGroupsCache(actor.userId, tenantId)];
                case 5:
                    _e.sent();
                    return [2 /*return*/, createdGroup];
                case 6:
                    error_1 = _e.sent();
                    message = error_1 instanceof Error ? error_1.message.toLowerCase() : "";
                    if (message.includes("duplicate key")) {
                        throw new server_1.TRPCError({
                            code: "CONFLICT",
                            message: "A group with this name already exists in your workspace",
                        });
                    }
                    throw error_1;
                case 7: return [2 /*return*/];
            }
        });
    });
}
function getUserGroups(actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, tenantId, cacheKey, redis, cached, _a, rows, result;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _b.sent();
                    tenantId = normalizeTenantId(actor.tenantId);
                    cacheKey = getGroupsCacheKey(actor.userId, tenantId);
                    redis = getRedisOrNull();
                    if (!redis) return [3 /*break*/, 6];
                    return [4 /*yield*/, redis.get(cacheKey)];
                case 2:
                    cached = _b.sent();
                    if (!cached) return [3 /*break*/, 6];
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 4, , 6]);
                    return [2 /*return*/, JSON.parse(cached)];
                case 4:
                    _a = _b.sent();
                    return [4 /*yield*/, redis.del(cacheKey)];
                case 5:
                    _b.sent();
                    return [3 /*break*/, 6];
                case 6: return [4 /*yield*/, db
                        .select({
                        group: schema_1.userGroups,
                        role: schema_1.groupMembers.role,
                    })
                        .from(schema_1.groupMembers)
                        .innerJoin(schema_1.userGroups, (0, drizzle_orm_1.eq)(schema_1.userGroups.id, schema_1.groupMembers.groupId))
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.userId, actor.userId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "active"), (0, drizzle_orm_1.eq)(schema_1.userGroups.tenantId, tenantId), (0, drizzle_orm_1.isNull)(schema_1.userGroups.deletedAt)))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.userGroups.updatedAt), (0, drizzle_orm_1.asc)(schema_1.userGroups.id))];
                case 7:
                    rows = _b.sent();
                    result = rows.map(function (row) { return (__assign(__assign({}, row.group), { role: mapRole(row.role) })); });
                    if (!redis) return [3 /*break*/, 9];
                    return [4 /*yield*/, redis.setex(cacheKey, GROUPS_CACHE_TTL_SECONDS, JSON.stringify(result))];
                case 8:
                    _b.sent();
                    _b.label = 9;
                case 9: return [2 /*return*/, result];
            }
        });
    });
}
function addGroupMember(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, group, tenantId, now;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, requireAdminOrOwner(db, input.groupId, actor)];
                case 2:
                    group = _a.sent();
                    tenantId = normalizeTenantId(group.tenantId);
                    return [4 /*yield*/, requireTargetUserInTenant(db, input.userId, tenantId)];
                case 3:
                    _a.sent();
                    now = new Date();
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var activeMemberCountRows, memberCount, existingRows, existing;
                            var _a, _b, _c, _d;
                            return __generator(this, function (_e) {
                                switch (_e.label) {
                                    case 0: 
                                    // Lock the group row to serialize concurrent member additions
                                    return [4 /*yield*/, tx.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["SELECT 1 FROM ", " WHERE ", " = ", " FOR UPDATE"], ["SELECT 1 FROM ", " WHERE ", " = ", " FOR UPDATE"])), schema_1.userGroups, schema_1.userGroups.id, input.groupId))];
                                    case 1:
                                        // Lock the group row to serialize concurrent member additions
                                        _e.sent();
                                        return [4 /*yield*/, tx
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.groupMembers)
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, input.groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "active")))];
                                    case 2:
                                        activeMemberCountRows = _e.sent();
                                        memberCount = Number((_b = (_a = activeMemberCountRows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0);
                                        if (memberCount >= MAX_GROUP_MEMBERS) {
                                            throw new server_1.TRPCError({
                                                code: "FORBIDDEN",
                                                message: "Maximum ".concat(MAX_GROUP_MEMBERS, " members per group"),
                                            });
                                        }
                                        return [4 /*yield*/, tx
                                                .select()
                                                .from(schema_1.groupMembers)
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, input.groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.userId, input.userId)))
                                                .limit(1)];
                                    case 3:
                                        existingRows = _e.sent();
                                        existing = existingRows[0];
                                        if ((existing === null || existing === void 0 ? void 0 : existing.status) === "active") {
                                            throw new server_1.TRPCError({
                                                code: "CONFLICT",
                                                message: "User is already a group member",
                                            });
                                        }
                                        if (!existing) return [3 /*break*/, 5];
                                        return [4 /*yield*/, tx
                                                .update(schema_1.groupMembers)
                                                .set({
                                                role: (_c = input.role) !== null && _c !== void 0 ? _c : "member",
                                                addedBy: actor.userId,
                                                status: "active",
                                                joinedAt: now,
                                                removedAt: null,
                                            })
                                                .where((0, drizzle_orm_1.eq)(schema_1.groupMembers.id, existing.id))];
                                    case 4:
                                        _e.sent();
                                        return [3 /*break*/, 7];
                                    case 5: return [4 /*yield*/, tx.insert(schema_1.groupMembers).values({
                                            groupId: input.groupId,
                                            userId: input.userId,
                                            role: (_d = input.role) !== null && _d !== void 0 ? _d : "member",
                                            addedBy: actor.userId,
                                            status: "active",
                                            joinedAt: now,
                                        })];
                                    case 6:
                                        _e.sent();
                                        _e.label = 7;
                                    case 7: return [4 /*yield*/, tx
                                            .update(schema_1.userGroups)
                                            .set({
                                            memberCount: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.userGroups.memberCount),
                                            updatedAt: now,
                                        })
                                            .where((0, drizzle_orm_1.eq)(schema_1.userGroups.id, input.groupId))];
                                    case 8:
                                        _e.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, invalidateUserGroupsCache(input.userId, tenantId)];
                case 5:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
function removeGroupMember(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, group, isSelfRemoval, membershipRows, membership, now;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, getGroupForTenant(db, input.groupId, normalizeTenantId(actor.tenantId))];
                case 2:
                    group = _a.sent();
                    if (!group) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Group not found",
                        });
                    }
                    isSelfRemoval = input.userId === actor.userId;
                    if (!!isSelfRemoval) return [3 /*break*/, 4];
                    return [4 /*yield*/, requireAdminOrOwner(db, input.groupId, actor)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    if (input.userId === group.ownerId) {
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "Owner cannot leave or be removed from the group",
                        });
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.groupMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, input.groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.userId, input.userId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "active")))
                            .limit(1)];
                case 5:
                    membershipRows = _a.sent();
                    membership = membershipRows[0];
                    if (!membership) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Member not found",
                        });
                    }
                    now = new Date();
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, tx
                                            .update(schema_1.groupMembers)
                                            .set({
                                            status: "removed",
                                            removedAt: now,
                                        })
                                            .where((0, drizzle_orm_1.eq)(schema_1.groupMembers.id, membership.id))];
                                    case 1:
                                        _a.sent();
                                        return [4 /*yield*/, tx
                                                .update(schema_1.userGroups)
                                                .set({
                                                memberCount: (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["GREATEST(", " - 1, 0)"], ["GREATEST(", " - 1, 0)"])), schema_1.userGroups.memberCount),
                                                updatedAt: now,
                                            })
                                                .where((0, drizzle_orm_1.eq)(schema_1.userGroups.id, input.groupId))];
                                    case 2:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 6:
                    _a.sent();
                    return [4 /*yield*/, invalidateUserGroupsCache(input.userId, group.tenantId)];
                case 7:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
function deleteUserGroup(groupId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, group, permCountRows, permCount, memberRows, memberIds, now;
        var _this = this;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _c.sent();
                    return [4 /*yield*/, getGroupForTenant(db, groupId, normalizeTenantId(actor.tenantId))];
                case 2:
                    group = _c.sent();
                    if (!group) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Group not found",
                        });
                    }
                    if (group.ownerId !== actor.userId) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Only group owner can delete this group",
                        });
                    }
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.libraryPermissions)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.tenantId, group.tenantId), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "group"), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectId, String(groupId))))];
                case 3:
                    permCountRows = _c.sent();
                    permCount = Number((_b = (_a = permCountRows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0);
                    if (permCount > 0) {
                        throw new server_1.TRPCError({
                            code: "PRECONDITION_FAILED",
                            message: "Cannot delete group with ".concat(permCount, " active shared permission(s). Remove shares first."),
                        });
                    }
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.groupMembers.userId,
                        })
                            .from(schema_1.groupMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "active")))];
                case 4:
                    memberRows = _c.sent();
                    memberIds = Array.from(new Set(memberRows.map(function (row) { return row.userId; })));
                    now = new Date();
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, tx
                                            .update(schema_1.userGroups)
                                            .set({
                                            deletedAt: now,
                                            updatedAt: now,
                                        })
                                            .where((0, drizzle_orm_1.eq)(schema_1.userGroups.id, groupId))];
                                    case 1:
                                        _a.sent();
                                        return [4 /*yield*/, tx
                                                .delete(schema_1.libraryPermissions)
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.libraryPermissions.tenantId, group.tenantId), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectType, "group"), (0, drizzle_orm_1.eq)(schema_1.libraryPermissions.subjectId, String(groupId))))];
                                    case 2:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 5:
                    _c.sent();
                    return [4 /*yield*/, invalidateManyUsersGroupsCache(memberIds, group.tenantId)];
                case 6:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
function approveJoinRequest(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, group, pendingRows, pending, now;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, requireAdminOrOwner(db, input.groupId, actor)];
                case 2:
                    group = _a.sent();
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.groupMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, input.groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.userId, input.userId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "pending")))
                            .limit(1)];
                case 3:
                    pendingRows = _a.sent();
                    pending = pendingRows[0];
                    if (!pending) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Pending join request not found",
                        });
                    }
                    now = new Date();
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var activeMemberCountRows;
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: 
                                    // Lock the group row to serialize concurrent approvals
                                    return [4 /*yield*/, tx.execute((0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["SELECT 1 FROM ", " WHERE ", " = ", " FOR UPDATE"], ["SELECT 1 FROM ", " WHERE ", " = ", " FOR UPDATE"])), schema_1.userGroups, schema_1.userGroups.id, input.groupId))];
                                    case 1:
                                        // Lock the group row to serialize concurrent approvals
                                        _c.sent();
                                        return [4 /*yield*/, tx
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.groupMembers)
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, input.groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "active")))];
                                    case 2:
                                        activeMemberCountRows = _c.sent();
                                        if (Number((_b = (_a = activeMemberCountRows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0) >= MAX_GROUP_MEMBERS) {
                                            throw new server_1.TRPCError({
                                                code: "FORBIDDEN",
                                                message: "Maximum ".concat(MAX_GROUP_MEMBERS, " members per group"),
                                            });
                                        }
                                        return [4 /*yield*/, tx
                                                .update(schema_1.groupMembers)
                                                .set({
                                                status: "active",
                                                removedAt: null,
                                                joinedAt: now,
                                            })
                                                .where((0, drizzle_orm_1.eq)(schema_1.groupMembers.id, pending.id))];
                                    case 3:
                                        _c.sent();
                                        return [4 /*yield*/, tx
                                                .update(schema_1.userGroups)
                                                .set({
                                                memberCount: (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.userGroups.memberCount),
                                                updatedAt: now,
                                            })
                                                .where((0, drizzle_orm_1.eq)(schema_1.userGroups.id, input.groupId))];
                                    case 4:
                                        _c.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, invalidateUserGroupsCache(input.userId, group.tenantId)];
                case 5:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
function rejectJoinRequest(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, requireAdminOrOwner(db, input.groupId, actor)];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, db
                            .delete(schema_1.groupMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, input.groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.userId, input.userId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "pending")))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
function updateUserGroup(groupId, input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, group, tenantId, updatePayload, currentSettings, memberRows;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _b.sent();
                    return [4 /*yield*/, requireAdminOrOwner(db, groupId, actor)];
                case 2:
                    group = _b.sent();
                    tenantId = normalizeTenantId(group.tenantId);
                    updatePayload = { updatedAt: new Date() };
                    if (input.name !== undefined) {
                        updatePayload.name = validateGroupName(input.name);
                    }
                    if (input.description !== undefined) {
                        updatePayload.description = validateGroupDescription(input.description);
                    }
                    if (input.visibility !== undefined || input.joinPolicy !== undefined) {
                        currentSettings = ((_a = group.settings) !== null && _a !== void 0 ? _a : { visibility: "private", joinPolicy: "invite_only" });
                        updatePayload.settings = __assign(__assign(__assign({}, currentSettings), (input.visibility !== undefined ? { visibility: input.visibility } : {})), (input.joinPolicy !== undefined ? { joinPolicy: input.joinPolicy } : {}));
                    }
                    if (input.iconUrl !== undefined) {
                        updatePayload.iconUrl = input.iconUrl;
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.userGroups)
                            .set(updatePayload)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userGroups.id, groupId), (0, drizzle_orm_1.eq)(schema_1.userGroups.tenantId, tenantId)))];
                case 3:
                    _b.sent();
                    return [4 /*yield*/, db
                            .select({ userId: schema_1.groupMembers.userId })
                            .from(schema_1.groupMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "active")))];
                case 4:
                    memberRows = _b.sent();
                    return [4 /*yield*/, invalidateManyUsersGroupsCache(memberRows.map(function (r) { return r.userId; }), tenantId)];
                case 5:
                    _b.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
function updateGroupMemberRole(groupId, userId, role, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, group, tenantId, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    return [4 /*yield*/, requireAdminOrOwner(db, groupId, actor)];
                case 2:
                    group = _a.sent();
                    tenantId = normalizeTenantId(group.tenantId);
                    // Prevent changing the owner's role
                    if (userId === group.ownerId) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Cannot change the group owner's role",
                        });
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.groupMembers)
                            .set({ role: role })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.userId, userId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "active")))
                            .returning({ id: schema_1.groupMembers.id })];
                case 3:
                    updated = _a.sent();
                    if (!updated[0]) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Active member not found in group",
                        });
                    }
                    return [4 /*yield*/, invalidateUserGroupsCache(userId, tenantId)];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
function joinOpenGroup(groupId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, tenantId, group, settings, joinPolicy, now;
        var _this = this;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _c.sent();
                    tenantId = normalizeTenantId(actor.tenantId);
                    return [4 /*yield*/, getGroupForTenant(db, groupId, tenantId)];
                case 2:
                    group = _c.sent();
                    if (!group) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Group not found",
                        });
                    }
                    settings = ((_a = group.settings) !== null && _a !== void 0 ? _a : {});
                    joinPolicy = (_b = settings.joinPolicy) !== null && _b !== void 0 ? _b : "invite_only";
                    if (joinPolicy !== "open") {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: joinPolicy === "request_to_join"
                                ? "This group requires a join request. Use requestJoin instead."
                                : "This group is invite-only",
                        });
                    }
                    now = new Date();
                    return [4 /*yield*/, db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var activeMemberCountRows, existingRows, existing;
                            var _a, _b;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: 
                                    // Lock the group row to serialize concurrent join operations
                                    return [4 /*yield*/, tx.execute((0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["SELECT 1 FROM ", " WHERE ", " = ", " FOR UPDATE"], ["SELECT 1 FROM ", " WHERE ", " = ", " FOR UPDATE"])), schema_1.userGroups, schema_1.userGroups.id, groupId))];
                                    case 1:
                                        // Lock the group row to serialize concurrent join operations
                                        _c.sent();
                                        return [4 /*yield*/, tx
                                                .select({ count: (0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                                                .from(schema_1.groupMembers)
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "active")))];
                                    case 2:
                                        activeMemberCountRows = _c.sent();
                                        if (Number((_b = (_a = activeMemberCountRows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0) >= MAX_GROUP_MEMBERS) {
                                            throw new server_1.TRPCError({
                                                code: "FORBIDDEN",
                                                message: "Maximum ".concat(MAX_GROUP_MEMBERS, " members per group"),
                                            });
                                        }
                                        return [4 /*yield*/, tx
                                                .select()
                                                .from(schema_1.groupMembers)
                                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.userId, actor.userId)))
                                                .limit(1)];
                                    case 3:
                                        existingRows = _c.sent();
                                        existing = existingRows[0];
                                        if ((existing === null || existing === void 0 ? void 0 : existing.status) === "active") {
                                            throw new server_1.TRPCError({
                                                code: "CONFLICT",
                                                message: "You are already a member of this group",
                                            });
                                        }
                                        if (!existing) return [3 /*break*/, 5];
                                        return [4 /*yield*/, tx
                                                .update(schema_1.groupMembers)
                                                .set({ role: "member", status: "active", joinedAt: now, removedAt: null })
                                                .where((0, drizzle_orm_1.eq)(schema_1.groupMembers.id, existing.id))];
                                    case 4:
                                        _c.sent();
                                        return [3 /*break*/, 7];
                                    case 5: return [4 /*yield*/, tx.insert(schema_1.groupMembers).values({
                                            groupId: groupId,
                                            userId: actor.userId,
                                            role: "member",
                                            addedBy: null,
                                            status: "active",
                                            joinedAt: now,
                                        })];
                                    case 6:
                                        _c.sent();
                                        _c.label = 7;
                                    case 7: return [4 /*yield*/, tx
                                            .update(schema_1.userGroups)
                                            .set({ memberCount: (0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.userGroups.memberCount), updatedAt: now })
                                            .where((0, drizzle_orm_1.eq)(schema_1.userGroups.id, groupId))];
                                    case 8:
                                        _c.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, invalidateUserGroupsCache(actor.userId, tenantId)];
                case 4:
                    _c.sent();
                    return [2 /*return*/, { success: true }];
            }
        });
    });
}
function requestJoinGroup(groupId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, tenantId, group, settings, joinPolicy, existingRows, existing;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _c.sent();
                    tenantId = normalizeTenantId(actor.tenantId);
                    return [4 /*yield*/, getGroupForTenant(db, groupId, tenantId)];
                case 2:
                    group = _c.sent();
                    if (!group) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Group not found",
                        });
                    }
                    settings = ((_a = group.settings) !== null && _a !== void 0 ? _a : {});
                    joinPolicy = (_b = settings.joinPolicy) !== null && _b !== void 0 ? _b : "invite_only";
                    if (joinPolicy === "invite_only") {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "This group is invite-only",
                        });
                    }
                    if (joinPolicy === "open") {
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "This group is open. Use join instead of requestJoin.",
                        });
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.groupMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.userId, actor.userId)))
                            .limit(1)];
                case 3:
                    existingRows = _c.sent();
                    existing = existingRows[0];
                    if ((existing === null || existing === void 0 ? void 0 : existing.status) === "active") {
                        throw new server_1.TRPCError({
                            code: "CONFLICT",
                            message: "You are already a member of this group",
                        });
                    }
                    if ((existing === null || existing === void 0 ? void 0 : existing.status) === "pending") {
                        throw new server_1.TRPCError({
                            code: "CONFLICT",
                            message: "You already have a pending join request",
                        });
                    }
                    if (!existing) return [3 /*break*/, 5];
                    return [4 /*yield*/, db
                            .update(schema_1.groupMembers)
                            .set({ status: "pending", role: "member", joinedAt: new Date(), removedAt: null })
                            .where((0, drizzle_orm_1.eq)(schema_1.groupMembers.id, existing.id))];
                case 4:
                    _c.sent();
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, db.insert(schema_1.groupMembers).values({
                        groupId: groupId,
                        userId: actor.userId,
                        role: "member",
                        addedBy: null,
                        status: "pending",
                        joinedAt: new Date(),
                    })];
                case 6:
                    _c.sent();
                    _c.label = 7;
                case 7: return [2 /*return*/, { success: true }];
            }
        });
    });
}
function getGroupMembers(groupId, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, tenantId, group, membershipRows, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    tenantId = normalizeTenantId(actor.tenantId);
                    return [4 /*yield*/, getGroupForTenant(db, groupId, tenantId)];
                case 2:
                    group = _a.sent();
                    if (!group) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Group not found",
                        });
                    }
                    return [4 /*yield*/, db
                            .select({ userId: schema_1.groupMembers.userId })
                            .from(schema_1.groupMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, groupId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.userId, actor.userId), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "active")))
                            .limit(1)];
                case 3:
                    membershipRows = _a.sent();
                    if (membershipRows.length === 0) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "You must be a member to view group members",
                        });
                    }
                    return [4 /*yield*/, db
                            .select({
                            userId: schema_1.groupMembers.userId,
                            userName: schema_1.users.name,
                            userEmail: schema_1.users.email,
                            role: schema_1.groupMembers.role,
                            status: schema_1.groupMembers.status,
                            joinedAt: schema_1.groupMembers.joinedAt,
                        })
                            .from(schema_1.groupMembers)
                            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.groupMembers.userId))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.groupMembers.groupId, groupId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "active"), (0, drizzle_orm_1.eq)(schema_1.groupMembers.status, "pending"))))
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.groupMembers.role), (0, drizzle_orm_1.asc)(schema_1.users.name))];
                case 4:
                    rows = _a.sent();
                    return [2 /*return*/, rows.map(function (r) { return (__assign(__assign({}, r), { role: mapRole(r.role) })); })];
            }
        });
    });
}
function searchTenantUsers(query, tenantId, excludeGroupId, limit, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, normalizedTenantId, escaped, searchPattern, conditions, tenantDomains, tenantConditions, rows;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _a.sent();
                    normalizedTenantId = normalizeTenantId(tenantId);
                    escaped = query.trim().replace(/%/g, "\\%").replace(/_/g, "\\_");
                    searchPattern = "%".concat(escaped, "%");
                    conditions = [
                        (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.users.name, searchPattern), (0, drizzle_orm_1.ilike)(schema_1.users.email, searchPattern)),
                    ];
                    return [4 /*yield*/, getTenantDomains(db, normalizedTenantId)];
                case 2:
                    tenantDomains = _a.sent();
                    tenantConditions = [];
                    if (tenantDomains.length > 0) {
                        tenantConditions.push((0, drizzle_orm_1.inArray)(schema_1.users.registeredDomain, tenantDomains));
                    }
                    tenantConditions.push((0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["", "::text = ", ""], ["", "::text = ", ""])), schema_1.users.currentTenantId, normalizedTenantId));
                    conditions.push(drizzle_orm_1.or.apply(void 0, tenantConditions));
                    if (excludeGroupId) {
                        // Exclude users already in the group
                        conditions.push((0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["", " NOT IN (\n        SELECT ", " FROM ", "\n        WHERE ", " = ", "\n          AND ", " IN ('active', 'pending')\n      )"], ["", " NOT IN (\n        SELECT ", " FROM ", "\n        WHERE ", " = ", "\n          AND ", " IN ('active', 'pending')\n      )"])), schema_1.users.id, schema_1.groupMembers.userId, schema_1.groupMembers, schema_1.groupMembers.groupId, excludeGroupId, schema_1.groupMembers.status));
                    }
                    return [4 /*yield*/, db
                            .select({
                            id: schema_1.users.id,
                            name: schema_1.users.name,
                            email: schema_1.users.email,
                        })
                            .from(schema_1.users)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .limit(Math.min(limit, 20))];
                case 3:
                    rows = _a.sent();
                    return [2 /*return*/, rows];
            }
        });
    });
}
function searchPublicGroups(input, actor, dbClient) {
    return __awaiter(this, void 0, void 0, function () {
        var db, tenantId, query, limit, offset, conditions, escaped, pattern, whereCondition, rows;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, resolveDb(dbClient)];
                case 1:
                    db = _e.sent();
                    tenantId = normalizeTenantId(actor.tenantId);
                    query = (_b = (_a = input.query) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "";
                    limit = Math.max(1, Math.min(100, (_c = input.limit) !== null && _c !== void 0 ? _c : 20));
                    offset = Math.max(0, (_d = input.offset) !== null && _d !== void 0 ? _d : 0);
                    conditions = [
                        (0, drizzle_orm_1.eq)(schema_1.userGroups.tenantId, tenantId),
                        (0, drizzle_orm_1.isNull)(schema_1.userGroups.deletedAt),
                        (0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["", "->>'visibility' = 'public'"], ["", "->>'visibility' = 'public'"])), schema_1.userGroups.settings),
                    ];
                    if (query) {
                        escaped = query.replace(/%/g, "\\%").replace(/_/g, "\\_");
                        pattern = "%".concat(escaped, "%");
                        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.userGroups.name, pattern), (0, drizzle_orm_1.ilike)(schema_1.userGroups.description, pattern)));
                    }
                    whereCondition = conditions.length === 1 ? conditions[0] : drizzle_orm_1.and.apply(void 0, conditions);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.userGroups)
                            .where(whereCondition)
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.userGroups.memberCount), (0, drizzle_orm_1.asc)(schema_1.userGroups.name))
                            .limit(limit)
                            .offset(offset)];
                case 2:
                    rows = _e.sent();
                    return [2 /*return*/, rows];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15;
