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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERSONAL_PROJECT_ID = void 0;
exports.isPersonalProjectId = isPersonalProjectId;
exports.createConversation = createConversation;
exports.createPersonalConversation = createPersonalConversation;
exports.getPersonalConversation = getPersonalConversation;
exports.getConversations = getConversations;
exports.getConversationById = getConversationById;
exports.updateConversation = updateConversation;
exports.deleteConversation = deleteConversation;
exports.restoreConversation = restoreConversation;
exports.permanentlyDeleteConversation = permanentlyDeleteConversation;
exports.emptyTrash = emptyTrash;
exports.purgeOldTrash = purgeOldTrash;
exports.deleteEmptyConversations = deleteEmptyConversations;
exports.getConversationCount = getConversationCount;
exports.createMessage = createMessage;
exports.getMessages = getMessages;
exports.getRecentMessages = getRecentMessages;
exports.getMessageById = getMessageById;
exports.updateMessage = updateMessage;
exports.deleteMessage = deleteMessage;
exports.updateConversationCredits = updateConversationCredits;
exports.createSummary = createSummary;
exports.getSummaries = getSummaries;
exports.upsertEntityMemory = upsertEntityMemory;
exports.getEntityMemories = getEntityMemories;
exports.touchEntityMemory = touchEntityMemory;
exports.deleteEntityMemory = deleteEntityMemory;
exports.getSkillPreferences = getSkillPreferences;
exports.updateSkillPreference = updateSkillPreference;
exports.buildChatContext = buildChatContext;
exports.needsSummarization = needsSummarization;
/**
 * Chat Service - Database operations for conversations, messages, and memory
 */
var server_1 = require("@trpc/server");
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var modelLookup_1 = require("./modelLookup");
var enabledLlmModels_1 = require("./enabledLlmModels");
var appRuntimeConfig_1 = require("./appRuntimeConfig");
var tokenEstimator_1 = require("../utils/tokenEstimator");
exports.PERSONAL_PROJECT_ID = "personal";
function isPersonalProjectId(projectId) {
    return projectId === exports.PERSONAL_PROJECT_ID;
}
function buildConversationInsertData(data) {
    var _a;
    return {
        userId: data.userId,
        title: data.title || "New Chat",
        model: data.model || null,
        skillSettings: data.skillSettings,
        systemPrompt: data.systemPrompt,
        projectId: (_a = data.projectId) !== null && _a !== void 0 ? _a : null,
        tenantId: data.tenantId || null,
        personaId: data.personaId || null,
    };
}
function insertConversationRow(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, resolvedModel, conversation;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, (0, enabledLlmModels_1.resolveEnabledLlmModelId)([data.model])];
                case 2:
                    resolvedModel = _a.sent();
                    return [4 /*yield*/, db
                            .insert(schema_1.conversations)
                            .values(buildConversationInsertData(__assign(__assign({}, data), { model: resolvedModel || null })))
                            .returning()];
                case 3:
                    conversation = (_a.sent())[0];
                    return [2 /*return*/, conversation];
            }
        });
    });
}
// ==================== Google Drive Integration ====================
function checkUserHasDriveTools(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var runtime, controller_1, timeout, resp, data, _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, (0, appRuntimeConfig_1.getAppRuntimeConfig)()];
                case 1:
                    runtime = _d.sent();
                    controller_1 = new AbortController();
                    timeout = setTimeout(function () { return controller_1.abort(); }, 2000);
                    return [4 /*yield*/, fetch("".concat(runtime.pythonBackendUrl, "/api/internal/mcp/tools?user_id=").concat(userId), {
                            headers: runtime.proxyToken ? { "x-proxy-token": runtime.proxyToken } : undefined,
                            signal: controller_1.signal,
                        })];
                case 2:
                    resp = _d.sent();
                    clearTimeout(timeout);
                    if (!resp.ok)
                        return [2 /*return*/, false];
                    return [4 /*yield*/, resp.json()];
                case 3:
                    data = (_d.sent());
                    return [2 /*return*/, ((_c = (_b = data.tools) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 0) > 0];
                case 4:
                    _a = _d.sent();
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Create a new conversation
 */
function createConversation(data) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (isPersonalProjectId(data.projectId)) {
                        throw new server_1.TRPCError({
                            code: "BAD_REQUEST",
                            message: "Use the personal chat creation flow to create a personal conversation",
                        });
                    }
                    return [4 /*yield*/, insertConversationRow(data)];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Create a new locked personal conversation.
 */
function createPersonalConversation(data) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, insertConversationRow(__assign(__assign({}, data), { title: data.title || "Personal Chat", projectId: exports.PERSONAL_PROJECT_ID }))];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Get the active personal conversation for a user in a tenant.
 * Returns the most recently updated locked personal conversation, if any.
 */
function getPersonalConversation(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, resolvedTenantId, conditions, conversation;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        return [2 /*return*/, undefined];
                    resolvedTenantId = ((_a = data.tenantId) === null || _a === void 0 ? void 0 : _a.trim()) || null;
                    conditions = [
                        (0, drizzle_orm_1.eq)(schema_1.conversations.userId, data.userId),
                        (0, drizzle_orm_1.eq)(schema_1.conversations.projectId, exports.PERSONAL_PROJECT_ID),
                        (0, drizzle_orm_1.isNull)(schema_1.conversations.trashedAt),
                    ];
                    if (resolvedTenantId) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.conversations.tenantId, resolvedTenantId));
                    }
                    else {
                        conditions.push((0, drizzle_orm_1.isNull)(schema_1.conversations.tenantId));
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.conversations)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.conversations.updatedAt), (0, drizzle_orm_1.desc)(schema_1.conversations.id))
                            .limit(1)];
                case 2:
                    conversation = (_b.sent())[0];
                    return [2 /*return*/, conversation];
            }
        });
    });
}
/**
 * Get conversations for a user with filters
 */
function getConversations(filters) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conditions, query;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    conditions = [(0, drizzle_orm_1.eq)(schema_1.conversations.userId, filters.userId)];
                    // Exclude trashed conversations by default
                    if (filters.trashedOnly) {
                        conditions.push((0, drizzle_orm_1.isNotNull)(schema_1.conversations.trashedAt));
                    }
                    else {
                        conditions.push((0, drizzle_orm_1.isNull)(schema_1.conversations.trashedAt));
                    }
                    if (filters.isArchived !== undefined) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.conversations.isArchived, filters.isArchived));
                    }
                    if (filters.isPinned !== undefined) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.conversations.isPinned, filters.isPinned));
                    }
                    if (filters.search) {
                        // Use parameterized ilike to prevent SQL injection
                        conditions.push((0, drizzle_orm_1.ilike)(schema_1.conversations.title, "%".concat(filters.search, "%")));
                    }
                    query = db
                        .select()
                        .from(schema_1.conversations)
                        .where(drizzle_orm_1.and.apply(void 0, conditions))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.conversations.isPinned), (0, drizzle_orm_1.desc)(schema_1.conversations.updatedAt));
                    if (filters.limit) {
                        query = query.limit(filters.limit);
                    }
                    if (filters.offset) {
                        query = query.offset(filters.offset);
                    }
                    return [4 /*yield*/, query];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Get a single conversation by ID
 */
function getConversationById(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conversation;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.id, id), (0, drizzle_orm_1.eq)(schema_1.conversations.userId, userId)))
                            .limit(1)];
                case 2:
                    conversation = (_a.sent())[0];
                    return [2 /*return*/, conversation];
            }
        });
    });
}
/**
 * Update conversation
 */
function updateConversation(id, userId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updateData, _a, currentConversation, nextProjectId;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Database not available");
                    updateData = __assign({}, data);
                    if (!("model" in updateData)) return [3 /*break*/, 3];
                    _a = updateData;
                    return [4 /*yield*/, (0, enabledLlmModels_1.resolveEnabledLlmModelId)([updateData.model])];
                case 2:
                    _a.model =
                        (_c.sent()) || null;
                    _c.label = 3;
                case 3: return [4 /*yield*/, db
                        .select({
                        id: schema_1.conversations.id,
                        projectId: schema_1.conversations.projectId,
                    })
                        .from(schema_1.conversations)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.id, id), (0, drizzle_orm_1.eq)(schema_1.conversations.userId, userId)))
                        .limit(1)];
                case 4:
                    currentConversation = (_c.sent())[0];
                    if (!currentConversation) {
                        throw new server_1.TRPCError({
                            code: "NOT_FOUND",
                            message: "Conversation not found",
                        });
                    }
                    nextProjectId = "projectId" in updateData ? ((_b = updateData.projectId) !== null && _b !== void 0 ? _b : null) : undefined;
                    if (isPersonalProjectId(currentConversation.projectId) &&
                        nextProjectId !== undefined &&
                        !isPersonalProjectId(nextProjectId)) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Personal chat projectId is locked",
                        });
                    }
                    if (nextProjectId === exports.PERSONAL_PROJECT_ID && !isPersonalProjectId(currentConversation.projectId)) {
                        throw new server_1.TRPCError({
                            code: "FORBIDDEN",
                            message: "Use the personal chat creation flow to create a personal conversation",
                        });
                    }
                    return [4 /*yield*/, db
                            .update(schema_1.conversations)
                            .set(__assign(__assign({}, updateData), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.id, id), (0, drizzle_orm_1.eq)(schema_1.conversations.userId, userId)))];
                case 5:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Delete conversation
 */
/**
 * Soft-delete: move conversation to trash (sets trashedAt)
 */
function deleteConversation(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .update(schema_1.conversations)
                            .set({ trashedAt: new Date() })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.id, id), (0, drizzle_orm_1.eq)(schema_1.conversations.userId, userId)))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Restore a trashed conversation
 */
function restoreConversation(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .update(schema_1.conversations)
                            .set({ trashedAt: null })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.id, id), (0, drizzle_orm_1.eq)(schema_1.conversations.userId, userId)))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Permanently delete a conversation (from trash)
 */
function permanentlyDeleteConversation(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .delete(schema_1.conversations)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.id, id), (0, drizzle_orm_1.eq)(schema_1.conversations.userId, userId)))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Empty trash — permanently delete all trashed conversations
 */
function emptyTrash(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .delete(schema_1.conversations)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.userId, userId), (0, drizzle_orm_1.isNotNull)(schema_1.conversations.trashedAt)))
                            .returning({ id: schema_1.conversations.id })];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length];
            }
        });
    });
}
/**
 * Auto-purge conversations trashed more than 30 days ago
 */
function purgeOldTrash() {
    return __awaiter(this, void 0, void 0, function () {
        var db, thirtyDaysAgo, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, 0];
                    thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                    return [4 /*yield*/, db
                            .delete(schema_1.conversations)
                            .where((0, drizzle_orm_1.lt)(schema_1.conversations.trashedAt, thirtyDaysAgo))
                            .returning({ id: schema_1.conversations.id })];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length];
            }
        });
    });
}
/**
 * Soft-delete empty conversations (0 messages) for a user
 */
function deleteEmptyConversations(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .update(schema_1.conversations)
                            .set({ trashedAt: new Date() })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.conversations.userId, userId), (0, drizzle_orm_1.eq)(schema_1.conversations.messageCount, 0), (0, drizzle_orm_1.isNull)(schema_1.conversations.trashedAt)))
                            .returning({ id: schema_1.conversations.id })];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length];
            }
        });
    });
}
/**
 * Get conversation count for user
 */
function getConversationCount(userId, isArchived) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conditions, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, 0];
                    conditions = [(0, drizzle_orm_1.eq)(schema_1.conversations.userId, userId)];
                    if (isArchived !== undefined) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.conversations.isArchived, isArchived));
                    }
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.conversations)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))];
                case 2:
                    result = (_a.sent())[0];
                    return [2 /*return*/, Number(result === null || result === void 0 ? void 0 : result.count) || 0];
            }
        });
    });
}
// ==================== Message Operations ====================
/**
 * Create a new message
 */
function createMessage(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, message;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.insert(schema_1.messages).values(data).returning()];
                case 2:
                    message = (_a.sent())[0];
                    // Update conversation message count and updatedAt
                    return [4 /*yield*/, db
                            .update(schema_1.conversations)
                            .set({
                            messageCount: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.conversations.messageCount),
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, data.conversationId))];
                case 3:
                    // Update conversation message count and updatedAt
                    _a.sent();
                    return [2 /*return*/, message];
            }
        });
    });
}
/**
 * Get messages for a conversation
 */
function getMessages(conversationId_1) {
    return __awaiter(this, arguments, void 0, function (conversationId, options) {
        var db, conditions, query;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    conditions = [(0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversationId)];
                    if (options.beforeId) {
                        conditions.push((0, drizzle_orm_1.lt)(schema_1.messages.id, options.beforeId));
                    }
                    if (options.afterId) {
                        conditions.push((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["", " > ", ""], ["", " > ", ""])), schema_1.messages.id, options.afterId));
                    }
                    query = db
                        .select()
                        .from(schema_1.messages)
                        .where(drizzle_orm_1.and.apply(void 0, conditions))
                        .orderBy((0, drizzle_orm_1.asc)(schema_1.messages.createdAt));
                    if (options.limit) {
                        query = query.limit(options.limit);
                    }
                    if (options.offset) {
                        query = query.offset(options.offset);
                    }
                    return [4 /*yield*/, query];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Get recent messages for context building
 */
function getRecentMessages(conversationId_1) {
    return __awaiter(this, arguments, void 0, function (conversationId, limit) {
        var db, result;
        if (limit === void 0) { limit = 20; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.messages)
                            .where((0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversationId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.messages.createdAt))
                            .limit(limit)];
                case 2:
                    result = _a.sent();
                    // Reverse to get chronological order
                    return [2 /*return*/, result.reverse()];
            }
        });
    });
}
/**
 * Get message by ID
 */
function getMessageById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, message;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.messages).where((0, drizzle_orm_1.eq)(schema_1.messages.id, id)).limit(1)];
                case 2:
                    message = (_a.sent())[0];
                    return [2 /*return*/, message];
            }
        });
    });
}
/**
 * Update message
 */
function updateMessage(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.update(schema_1.messages).set(data).where((0, drizzle_orm_1.eq)(schema_1.messages.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Delete message
 */
function deleteMessage(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, message;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getMessageById(id)];
                case 2:
                    message = _a.sent();
                    if (!message)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.messages).where((0, drizzle_orm_1.eq)(schema_1.messages.id, id))];
                case 3:
                    _a.sent();
                    // Update conversation message count
                    return [4 /*yield*/, db
                            .update(schema_1.conversations)
                            .set({
                            messageCount: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["GREATEST(", " - 1, 0)"], ["GREATEST(", " - 1, 0)"])), schema_1.conversations.messageCount),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, message.conversationId))];
                case 4:
                    // Update conversation message count
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Update conversation credits after message
 */
function updateConversationCredits(conversationId, creditsUsed) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db
                            .update(schema_1.conversations)
                            .set({
                            totalCreditsUsed: (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["", " + ", ""], ["", " + ", ""])), schema_1.conversations.totalCreditsUsed, creditsUsed),
                        })
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== Summary Operations ====================
/**
 * Create a conversation summary
 */
function createSummary(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, summary;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.insert(schema_1.conversationSummaries).values(data).returning()];
                case 2:
                    summary = (_a.sent())[0];
                    return [2 /*return*/, summary];
            }
        });
    });
}
/**
 * Get summaries for a conversation
 */
function getSummaries(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.conversationSummaries)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversationSummaries.conversationId, conversationId))
                            .orderBy((0, drizzle_orm_1.asc)(schema_1.conversationSummaries.messageRangeStart))];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// ==================== Entity Memory Operations ====================
/**
 * Get or create entity memory
 */
function upsertEntityMemory(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, projectId, personaId, conv, _a, existing, mergedFacts, memory;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _e.sent();
                    if (!db)
                        throw new Error("Database not available");
                    projectId = (_b = data.projectId) !== null && _b !== void 0 ? _b : null;
                    personaId = data.personaId;
                    if (!(!projectId && data.sourceConversationId)) return [3 /*break*/, 5];
                    _e.label = 2;
                case 2:
                    _e.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select({ projectId: schema_1.conversations.projectId, personaId: schema_1.conversations.personaId })
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, data.sourceConversationId))
                            .limit(1)];
                case 3:
                    conv = (_e.sent())[0];
                    projectId = (_c = conv === null || conv === void 0 ? void 0 : conv.projectId) !== null && _c !== void 0 ? _c : null;
                    if (personaId === undefined) {
                        personaId = (_d = conv === null || conv === void 0 ? void 0 : conv.personaId) !== null && _d !== void 0 ? _d : null;
                    }
                    return [3 /*break*/, 5];
                case 4:
                    _a = _e.sent();
                    return [3 /*break*/, 5];
                case 5:
                    if (personaId === undefined) {
                        personaId = null;
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.entityMemories)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.entityMemories.userId, data.userId), (0, drizzle_orm_1.eq)(schema_1.entityMemories.entityType, data.entityType), (0, drizzle_orm_1.eq)(schema_1.entityMemories.entityName, data.entityName), personaId === null
                            ? (0, drizzle_orm_1.isNull)(schema_1.entityMemories.personaId)
                            : (0, drizzle_orm_1.eq)(schema_1.entityMemories.personaId, personaId)))
                            .limit(1)];
                case 6:
                    existing = (_e.sent())[0];
                    if (!existing) return [3 /*break*/, 8];
                    mergedFacts = __spreadArray([], new Set(__spreadArray(__spreadArray([], (existing.facts || []), true), data.facts, true)), true);
                    return [4 /*yield*/, db
                            .update(schema_1.entityMemories)
                            .set(__assign(__assign({ facts: mergedFacts, reinforcementCount: (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.entityMemories.reinforcementCount), lastAccessedAt: new Date(), updatedAt: new Date() }, (projectId && !existing.projectId ? { projectId: projectId } : {})), (existing.personaId !== personaId ? { personaId: personaId } : {})))
                            .where((0, drizzle_orm_1.eq)(schema_1.entityMemories.id, existing.id))];
                case 7:
                    _e.sent();
                    return [2 /*return*/, __assign(__assign({}, existing), { facts: mergedFacts, personaId: personaId })];
                case 8: return [4 /*yield*/, db
                        .insert(schema_1.entityMemories)
                        .values({
                        userId: data.userId,
                        personaId: personaId !== null && personaId !== void 0 ? personaId : null,
                        entityType: data.entityType,
                        entityName: data.entityName,
                        facts: data.facts,
                        sourceConversationId: data.sourceConversationId,
                        projectId: projectId !== null && projectId !== void 0 ? projectId : undefined,
                    })
                        .returning()];
                case 9:
                    memory = (_e.sent())[0];
                    return [2 /*return*/, memory];
            }
        });
    });
}
/**
 * Get entity memories for a user
 */
function getEntityMemories(userId, entityType, personaId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conditions;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    conditions = [(0, drizzle_orm_1.eq)(schema_1.entityMemories.userId, userId)];
                    if (entityType) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.entityMemories.entityType, entityType));
                    }
                    if (personaId !== undefined) {
                        conditions.push(personaId === null
                            ? (0, drizzle_orm_1.isNull)(schema_1.entityMemories.personaId)
                            : (0, drizzle_orm_1.eq)(schema_1.entityMemories.personaId, personaId));
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.entityMemories)
                            .where(drizzle_orm_1.and.apply(void 0, conditions))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.entityMemories.reinforcementCount), (0, drizzle_orm_1.desc)(schema_1.entityMemories.lastAccessedAt))];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * Update entity memory access time
 */
function touchEntityMemory(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db
                            .update(schema_1.entityMemories)
                            .set({ lastAccessedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.entityMemories.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Delete entity memory
 */
function deleteEntityMemory(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db
                            .delete(schema_1.entityMemories)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.entityMemories.id, id), (0, drizzle_orm_1.eq)(schema_1.entityMemories.userId, userId)))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== Skill Preferences Operations ====================
/**
 * Get skill preferences for a conversation
 */
function getSkillPreferences(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, prefs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.skillPreferences)
                            .where((0, drizzle_orm_1.eq)(schema_1.skillPreferences.conversationId, conversationId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.skillPreferences.priority))];
                case 2:
                    prefs = _a.sent();
                    return [2 /*return*/, prefs.map(function (p) { return ({
                            skillId: p.skillId,
                            enabled: p.enabled,
                            priority: p.priority,
                            customSettings: p.customSettings || undefined,
                        }); })];
            }
        });
    });
}
/**
 * Update skill preference
 */
function updateSkillPreference(conversationId, skillId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Database not available");
                    // Upsert skill preference
                    return [4 /*yield*/, db
                            .insert(schema_1.skillPreferences)
                            .values({
                            conversationId: conversationId,
                            skillId: skillId,
                            enabled: (_a = data.enabled) !== null && _a !== void 0 ? _a : true,
                            priority: (_b = data.priority) !== null && _b !== void 0 ? _b : 0,
                            customSettings: data.customSettings,
                        })
                            .onConflictDoUpdate({
                            target: [schema_1.skillPreferences.conversationId, schema_1.skillPreferences.skillId],
                            set: data,
                        })];
                case 2:
                    // Upsert skill preference
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== Utility Functions ====================
/**
 * Build context for LLM request including memory
 */
function buildChatContext(conversationId, userId, systemPrompt, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var context, effectiveSystemPrompt, activePersonaId, _a, resolvePersona, buildPersonaPromptSegments, db, convResult, conv, convTenantId, userPersona, tenantPersona, _b, persona, segments, parts, err_1, memories, memoryContext, hasDriveTools, convTenantId, db, tenant, featureFlags, _c, summaries, summaryContext, recentMessages, DEFAULT_CONTEXT_LENGTH, OUTPUT_RESERVE, inputBudget, db, conv, modelRow, _d, systemTokens, remainingBudget, chatMessages, usedTokens, i, msg, tokens;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    context = [];
                    effectiveSystemPrompt = systemPrompt;
                    activePersonaId = null;
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 11, , 12]);
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./personaService"); })];
                case 2:
                    _a = _f.sent(), resolvePersona = _a.resolvePersona, buildPersonaPromptSegments = _a.buildPersonaPromptSegments;
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 3:
                    db = _f.sent();
                    if (!db) return [3 /*break*/, 10];
                    return [4 /*yield*/, db
                            .select({ personaId: schema_1.conversations.personaId, tenantId: schema_1.conversations.tenantId })
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId))
                            .limit(1)];
                case 4:
                    convResult = _f.sent();
                    conv = convResult[0];
                    convTenantId = (conv === null || conv === void 0 ? void 0 : conv.tenantId) || tenantId || null;
                    return [4 /*yield*/, db
                            .select({ defaultPersonaId: schema_1.users.defaultPersonaId })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
                            .limit(1)];
                case 5:
                    userPersona = (_f.sent())[0];
                    if (!convTenantId) return [3 /*break*/, 7];
                    return [4 /*yield*/, db
                            .select({ defaultPersonaId: schema_1.tenants.defaultPersonaId })
                            .from(schema_1.tenants)
                            .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, convTenantId))
                            .limit(1)];
                case 6:
                    _b = _f.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _b = [{ defaultPersonaId: null }];
                    _f.label = 8;
                case 8:
                    tenantPersona = (_b)[0];
                    return [4 /*yield*/, resolvePersona({ personaId: (conv === null || conv === void 0 ? void 0 : conv.personaId) || null, tenantId: convTenantId }, { id: userId, defaultPersonaId: (userPersona === null || userPersona === void 0 ? void 0 : userPersona.defaultPersonaId) || null }, { id: convTenantId || "", defaultPersonaId: (tenantPersona === null || tenantPersona === void 0 ? void 0 : tenantPersona.defaultPersonaId) || null })];
                case 9:
                    persona = _f.sent();
                    if (persona) {
                        activePersonaId =
                            persona.id === "00000000-0000-0000-0000-000000000001" ? null : persona.id;
                        segments = buildPersonaPromptSegments(persona);
                        parts = [segments.prefix];
                        if (segments.styleInstructions)
                            parts.push(segments.styleInstructions);
                        if (segments.restrictionsBulletPoints)
                            parts.push(segments.restrictionsBulletPoints);
                        if (effectiveSystemPrompt)
                            parts.push(effectiveSystemPrompt);
                        effectiveSystemPrompt = parts.join("\n\n");
                    }
                    _f.label = 10;
                case 10: return [3 /*break*/, 12];
                case 11:
                    err_1 = _f.sent();
                    // Persona system disabled or unavailable — continue without persona
                    if (err_1 instanceof Error && !err_1.message.includes("not enabled")) {
                        console.warn("[chatService] Persona resolution failed:", err_1.message);
                    }
                    return [3 /*break*/, 12];
                case 12:
                    // 1. Add system prompt
                    if (effectiveSystemPrompt) {
                        context.push({ role: "system", content: effectiveSystemPrompt });
                    }
                    return [4 /*yield*/, getEntityMemories(userId, undefined, activePersonaId)];
                case 13:
                    memories = _f.sent();
                    if (memories.length > 0) {
                        memoryContext = memories
                            .slice(0, 10) // Limit to top 10 most relevant
                            .map(function (m) { return "[".concat(m.entityType, ":").concat(m.entityName, "] ").concat(m.facts.join("; ")); })
                            .join("\n");
                        context.push({
                            role: "system",
                            content: "User Context:\n".concat(memoryContext),
                        });
                    }
                    return [4 /*yield*/, checkUserHasDriveTools(userId)];
                case 14:
                    hasDriveTools = _f.sent();
                    if (hasDriveTools) {
                        context.push({
                            role: "system",
                            content: [
                                "You have access to the user's Google Drive via the following tools:",
                                "- search_drive_files: Search for files by name or content",
                                "- read_drive_file: Read the text content of a Drive file",
                                "- read_sheet_data: Read data from a Google Sheet",
                                "- list_drive_folder: List files in a Drive folder",
                                "- get_drive_file_info: Get metadata about a Drive file",
                                "",
                                "Use these tools when the user asks about their Google Drive files, wants to find documents, or needs content from their Drive.",
                            ].join("\n"),
                        });
                    }
                    _f.label = 15;
                case 15:
                    _f.trys.push([15, 19, , 20]);
                    convTenantId = tenantId;
                    if (!convTenantId) return [3 /*break*/, 18];
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 16:
                    db = _f.sent();
                    if (!db) return [3 /*break*/, 18];
                    return [4 /*yield*/, db
                            .select({ settings: schema_1.tenants.settings })
                            .from(schema_1.tenants)
                            .where((0, drizzle_orm_1.eq)(schema_1.tenants.id, convTenantId))
                            .limit(1)];
                case 17:
                    tenant = (_f.sent())[0];
                    featureFlags = (_e = tenant === null || tenant === void 0 ? void 0 : tenant.settings) === null || _e === void 0 ? void 0 : _e.featureFlags;
                    if (featureFlags === null || featureFlags === void 0 ? void 0 : featureFlags.canvas) {
                        context.push({
                            role: "system",
                            content: "When generating charts, tables, code, or interactive content, use the artifact format:\n```artifact:TYPE title=\"Title\" language=\"lang\"\ncontent\n```\nSupported types: code, markdown, mermaid, svg, react, html, chart, table.\nUse 'react' for interactive React components, 'chart' for data visualizations (JSON format), 'table' for structured data.",
                        });
                    }
                    _f.label = 18;
                case 18: return [3 /*break*/, 20];
                case 19:
                    _c = _f.sent();
                    return [3 /*break*/, 20];
                case 20: return [4 /*yield*/, getSummaries(conversationId)];
                case 21:
                    summaries = _f.sent();
                    if (summaries.length > 0) {
                        summaryContext = summaries.map(function (s) { return s.summary; }).join("\n\n");
                        context.push({
                            role: "system",
                            content: "Previous conversation summary:\n".concat(summaryContext),
                        });
                    }
                    return [4 /*yield*/, getRecentMessages(conversationId, 20)];
                case 22:
                    recentMessages = _f.sent();
                    DEFAULT_CONTEXT_LENGTH = 32000;
                    OUTPUT_RESERVE = 8192;
                    inputBudget = DEFAULT_CONTEXT_LENGTH - OUTPUT_RESERVE;
                    _f.label = 23;
                case 23:
                    _f.trys.push([23, 28, , 29]);
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 24:
                    db = _f.sent();
                    if (!db) return [3 /*break*/, 27];
                    return [4 /*yield*/, db
                            .select({ model: schema_1.conversations.model })
                            .from(schema_1.conversations)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversations.id, conversationId))
                            .limit(1)];
                case 25:
                    conv = (_f.sent())[0];
                    if (!(conv === null || conv === void 0 ? void 0 : conv.model)) return [3 /*break*/, 27];
                    return [4 /*yield*/, db
                            .select({ contextLength: schema_1.modelProviderMap.contextLength })
                            .from(schema_1.modelProviderMap)
                            .where((0, modelLookup_1.buildModelProviderMapLookupCondition)(conv.model))
                            .limit(1)];
                case 26:
                    modelRow = (_f.sent())[0];
                    if ((modelRow === null || modelRow === void 0 ? void 0 : modelRow.contextLength) != null && modelRow.contextLength > 0) {
                        inputBudget = modelRow.contextLength - OUTPUT_RESERVE;
                    }
                    _f.label = 27;
                case 27: return [3 /*break*/, 29];
                case 28:
                    _d = _f.sent();
                    return [3 /*break*/, 29];
                case 29:
                    systemTokens = (0, tokenEstimator_1.estimateMessages)(context);
                    remainingBudget = Math.max(0, inputBudget - systemTokens);
                    chatMessages = [];
                    usedTokens = 0;
                    // Iterate from newest to oldest, stop when budget is exceeded
                    for (i = recentMessages.length - 1; i >= 0; i--) {
                        msg = recentMessages[i];
                        if (msg.role === "system")
                            continue;
                        tokens = (0, tokenEstimator_1.estimateTokens)(msg.content);
                        if (usedTokens + tokens > remainingBudget && chatMessages.length >= 6) {
                            break; // Keep at least 6 most recent turns
                        }
                        // Skip single oversized messages (>50% of budget) if we already have context
                        if (tokens > remainingBudget * 0.5 && chatMessages.length >= 1) {
                            continue;
                        }
                        chatMessages.unshift({
                            role: msg.role,
                            content: msg.content,
                        });
                        usedTokens += tokens;
                    }
                    context.push.apply(context, chatMessages);
                    return [2 /*return*/, context];
            }
        });
    });
}
/**
 * Check if conversation needs summarization
 */
function needsSummarization(conversationId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, latestSummary, lastSummarizedId, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, false];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.conversationSummaries)
                            .where((0, drizzle_orm_1.eq)(schema_1.conversationSummaries.conversationId, conversationId))
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.conversationSummaries.messageRangeEnd))
                            .limit(1)];
                case 2:
                    latestSummary = (_a.sent())[0];
                    lastSummarizedId = (latestSummary === null || latestSummary === void 0 ? void 0 : latestSummary.messageRangeEnd) || 0;
                    return [4 /*yield*/, db
                            .select({ count: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) })
                            .from(schema_1.messages)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.messages.conversationId, conversationId), (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["", " > ", ""], ["", " > ", ""])), schema_1.messages.id, lastSummarizedId)))];
                case 3:
                    result = (_a.sent())[0];
                    // Summarize when we have more than 30 unsummarized messages
                    return [2 /*return*/, Number(result === null || result === void 0 ? void 0 : result.count) > 30];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8;
