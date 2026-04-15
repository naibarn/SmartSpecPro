"use strict";
/**
 * Persona Service — resolution, sanitization, and prompt building for AI personas.
 *
 * Resolution chain (first match wins):
 * 1. conversation.personaId (explicitly set on the conversation)
 * 2. widget.defaultPersonaId (if widgetId is provided)
 * 3. user.defaultPersonaId
 * 4. tenant.defaultPersonaId
 * 5. PLATFORM_DEFAULT_PERSONA (hardcoded fallback)
 *
 * Tenant isolation: tenant-scoped personas must have persona.tenantId === conversation.tenantId.
 * Platform-scope personas (tenantId=null) are accessible to all tenants.
 */
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
exports.PLATFORM_DEFAULT_PERSONA = exports.PERSONA_WORKING_DAY_KEYS = void 0;
exports.sanitizePersonaInput = sanitizePersonaInput;
exports.matchPersonaByNickname = matchPersonaByNickname;
exports.buildPersonaPromptSegments = buildPersonaPromptSegments;
exports.resolvePersona = resolvePersona;
exports.listPersonas = listPersonas;
exports.getPersonaById = getPersonaById;
exports.createPersona = createPersona;
exports.updatePersona = updatePersona;
exports.deletePersona = deletePersona;
var drizzle_orm_1 = require("drizzle-orm");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var tenantFeatureFlagService_1 = require("./tenantFeatureFlagService");
var featureFlags_1 = require("../../shared/featureFlags");
exports.PERSONA_WORKING_DAY_KEYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];
// ── Platform Default Persona ─────────────────────────────────
exports.PLATFORM_DEFAULT_PERSONA = {
    id: "00000000-0000-0000-0000-000000000001",
    tenantId: null,
    userId: null,
    name: "SmartSpec Default",
    description: "Helpful, concise, markdown-friendly general assistant",
    assistantNickname: null,
    assistantGender: "neutral",
    workingHours: null,
    sourceTemplateIds: [],
    sourceTemplateLabels: [],
    sourceTemplateCategories: [],
    systemPromptPrefix: "You are a friendly, helpful AI assistant. Provide clear, concise, and well-formatted responses using markdown when appropriate.",
    tone: "friendly",
    language: "auto",
    responseStyle: {},
    restrictions: [],
    scope: "platform",
    isDefault: true,
    provisionedByBlueprintId: null,
    provisionedByBlueprintMemberId: null,
};
// ── Jailbreak Pattern Blocklist ──────────────────────────────
var BLOCKED_PATTERNS = [
    "[SYSTEM]",
    "[INST]",
    "<<SYS>>",
    "</s>",
    "[/INST]",
];
var BLOCKED_LINE_PREFIXES = ["---", "###"];
var TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isAsciiNickname(value) {
    return /^[A-Za-z0-9_-]+$/.test(value);
}
function findNicknamePosition(message, nickname) {
    var _a, _b;
    var atMentionIndex = message.indexOf("@".concat(nickname));
    if (atMentionIndex >= 0)
        return atMentionIndex;
    if (isAsciiNickname(nickname)) {
        var boundaryPattern = new RegExp("(^|[^\\p{L}\\p{N}_])".concat(escapeRegExp(nickname), "(?=$|[^\\p{L}\\p{N}_])"), "iu");
        var match = boundaryPattern.exec(message);
        if (match) {
            return match.index + ((_b = (_a = match[1]) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0);
        }
        return -1;
    }
    return message.indexOf(nickname);
}
function isLegacyWorkingHours(workingHours) {
    return "startTime" in workingHours && "endTime" in workingHours;
}
function normalizeWorkingHours(workingHours) {
    if (isLegacyWorkingHours(workingHours)) {
        var days = exports.PERSONA_WORKING_DAY_KEYS.reduce(function (acc, day) {
            acc[day] = {
                startTime: workingHours.startTime,
                endTime: workingHours.endTime,
            };
            return acc;
        }, {});
        return {
            timezone: workingHours.timezone,
            days: days,
        };
    }
    return workingHours;
}
// ── Sanitization ─────────────────────────────────────────────
function sanitizePersonaInput(input) {
    var _a, _b, _c, _d, _e, _f;
    var sanitized = __assign({}, input);
    // Validate systemPromptPrefix length
    if (sanitized.systemPromptPrefix.length > 2000) {
        throw new Error("systemPromptPrefix must not exceed 2000 characters");
    }
    if (sanitized.assistantNickname !== undefined && sanitized.assistantNickname !== null) {
        sanitized.assistantNickname = sanitized.assistantNickname.trim();
        if (sanitized.assistantNickname.length === 0) {
            sanitized.assistantNickname = null;
        }
        else if (sanitized.assistantNickname.length > 80) {
            throw new Error("assistantNickname must not exceed 80 characters");
        }
    }
    if (sanitized.assistantGender !== undefined &&
        sanitized.assistantGender !== null &&
        !["female", "male", "neutral"].includes(sanitized.assistantGender)) {
        throw new Error("assistantGender must be female, male, or neutral");
    }
    if (sanitized.workingHours !== undefined && sanitized.workingHours !== null) {
        var normalizedWorkingHours = normalizeWorkingHours(sanitized.workingHours);
        var trimmedTimezone = normalizedWorkingHours.timezone.trim();
        if (trimmedTimezone.length === 0 || trimmedTimezone.length > 100) {
            throw new Error("workingHours.timezone must be between 1 and 100 characters");
        }
        var sanitizedDays = {};
        var activeDayCount = 0;
        for (var _i = 0, PERSONA_WORKING_DAY_KEYS_1 = exports.PERSONA_WORKING_DAY_KEYS; _i < PERSONA_WORKING_DAY_KEYS_1.length; _i++) {
            var day = PERSONA_WORKING_DAY_KEYS_1[_i];
            var workingDay = normalizedWorkingHours.days[day];
            if (!workingDay)
                continue;
            if (!TIME_OF_DAY_PATTERN.test(workingDay.startTime)) {
                throw new Error("workingHours.days.".concat(day, ".startTime must be in HH:MM format"));
            }
            if (!TIME_OF_DAY_PATTERN.test(workingDay.endTime)) {
                throw new Error("workingHours.days.".concat(day, ".endTime must be in HH:MM format"));
            }
            sanitizedDays[day] = {
                startTime: workingDay.startTime,
                endTime: workingDay.endTime,
            };
            activeDayCount += 1;
        }
        if (activeDayCount === 0) {
            throw new Error("workingHours must include at least one active day");
        }
        sanitized.workingHours = {
            timezone: trimmedTimezone,
            days: sanitizedDays,
        };
    }
    var sourceTemplateFields = [
        { key: "sourceTemplateIds", value: sanitized.sourceTemplateIds, maxLength: 120 },
        { key: "sourceTemplateLabels", value: sanitized.sourceTemplateLabels, maxLength: 200 },
        { key: "sourceTemplateCategories", value: sanitized.sourceTemplateCategories, maxLength: 100 },
    ];
    var _loop_1 = function (field) {
        if (!field.value)
            return "continue";
        if (field.value.length > 5) {
            throw new Error("".concat(field.key, " must not exceed 5 entries"));
        }
        var normalized = field.value.map(function (entry) { return entry.trim(); });
        if (normalized.some(function (entry) { return entry.length === 0; })) {
            throw new Error("".concat(field.key, " must not contain empty values"));
        }
        if (normalized.some(function (entry) { return entry.length > field.maxLength; })) {
            throw new Error("".concat(field.key, " contains a value that exceeds ").concat(field.maxLength, " characters"));
        }
        if (field.key !== "sourceTemplateCategories" && new Set(normalized).size !== normalized.length) {
            throw new Error("".concat(field.key, " must contain unique values"));
        }
        sanitized[field.key] = normalized;
    };
    for (var _g = 0, sourceTemplateFields_1 = sourceTemplateFields; _g < sourceTemplateFields_1.length; _g++) {
        var field = sourceTemplateFields_1[_g];
        _loop_1(field);
    }
    var templateFieldLengths = [
        (_b = (_a = sanitized.sourceTemplateIds) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0,
        (_d = (_c = sanitized.sourceTemplateLabels) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 0,
        (_f = (_e = sanitized.sourceTemplateCategories) === null || _e === void 0 ? void 0 : _e.length) !== null && _f !== void 0 ? _f : 0,
    ];
    var nonZeroTemplateFieldLengths = templateFieldLengths.filter(function (length) { return length > 0; });
    if (nonZeroTemplateFieldLengths.length > 0 && new Set(nonZeroTemplateFieldLengths).size !== 1) {
        throw new Error("source template metadata arrays must have matching lengths");
    }
    // Block known jailbreak patterns
    var upperPrefix = sanitized.systemPromptPrefix.toUpperCase();
    for (var _h = 0, BLOCKED_PATTERNS_1 = BLOCKED_PATTERNS; _h < BLOCKED_PATTERNS_1.length; _h++) {
        var pattern = BLOCKED_PATTERNS_1[_h];
        if (upperPrefix.includes(pattern.toUpperCase())) {
            throw new Error("systemPromptPrefix contains blocked pattern: ".concat(pattern));
        }
    }
    // Block structural markers at line start
    var lines = sanitized.systemPromptPrefix.split("\n");
    for (var _j = 0, lines_1 = lines; _j < lines_1.length; _j++) {
        var line = lines_1[_j];
        var trimmed = line.trimStart();
        for (var _k = 0, BLOCKED_LINE_PREFIXES_1 = BLOCKED_LINE_PREFIXES; _k < BLOCKED_LINE_PREFIXES_1.length; _k++) {
            var prefix = BLOCKED_LINE_PREFIXES_1[_k];
            if (trimmed.startsWith(prefix)) {
                throw new Error("systemPromptPrefix contains blocked line prefix: ".concat(prefix));
            }
        }
    }
    // Strip consecutive newlines > 2
    sanitized.systemPromptPrefix = sanitized.systemPromptPrefix.replace(/\n{3,}/g, "\n\n");
    // Validate restrictions
    if (sanitized.restrictions) {
        if (sanitized.restrictions.length > 20) {
            throw new Error("restrictions array must not exceed 20 entries");
        }
        for (var _l = 0, _m = sanitized.restrictions; _l < _m.length; _l++) {
            var restriction = _m[_l];
            if (restriction.length > 500) {
                throw new Error("each restriction must not exceed 500 characters");
            }
        }
        // Escape YAML separators within restriction text
        sanitized.restrictions = sanitized.restrictions.map(function (r) {
            return r.replace(/^---$/gm, "\\---");
        });
    }
    return sanitized;
}
function matchPersonaByNickname(personas, message) {
    var _a, _b;
    var normalizedMessage = message === null || message === void 0 ? void 0 : message.trim().toLocaleLowerCase();
    if (!normalizedMessage)
        return null;
    var candidates = personas
        .map(function (persona) {
        var _a;
        var nickname = (_a = persona.assistantNickname) === null || _a === void 0 ? void 0 : _a.trim().toLocaleLowerCase();
        if (!nickname)
            return null;
        var position = findNicknamePosition(normalizedMessage, nickname);
        if (position < 0)
            return null;
        return {
            persona: persona,
            position: position,
            nicknameLength: nickname.length,
        };
    })
        .filter(function (candidate) { return !!candidate; })
        .sort(function (a, b) {
        if (a.position !== b.position)
            return a.position - b.position;
        return b.nicknameLength - a.nicknameLength;
    });
    return (_b = (_a = candidates[0]) === null || _a === void 0 ? void 0 : _a.persona) !== null && _b !== void 0 ? _b : null;
}
// ── Prompt Building ──────────────────────────────────────────
function buildPersonaPromptSegments(persona) {
    var prefix = "[PERSONA START]\n".concat(persona.systemPromptPrefix, "\n[PERSONA END]");
    var styleInstructions = null;
    var style = persona.responseStyle;
    if (style && Object.keys(style).length > 0) {
        var parts = [];
        if (persona.assistantNickname) {
            parts.push("Your nickname is ".concat(persona.assistantNickname, ". Introduce yourself with this name when it helps the conversation feel natural."));
        }
        if (persona.tone)
            parts.push("Respond in a ".concat(persona.tone, " tone."));
        if (persona.assistantGender === "female") {
            parts.push("If responding in Thai, use feminine polite particles such as ค่ะ or คะ when natural.");
        }
        else if (persona.assistantGender === "male") {
            parts.push("If responding in Thai, use masculine polite particles such as ครับ when natural.");
        }
        else if (persona.assistantGender === "neutral") {
            parts.push("If responding in Thai, prefer polite neutral phrasing and avoid forcing gendered particles when they feel unnatural.");
        }
        for (var _i = 0, _a = Object.entries(style); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], value = _b[1];
            if (value)
                parts.push("".concat(key, ": ").concat(value));
        }
        if (parts.length > 0)
            styleInstructions = parts.join(" ");
    }
    else {
        var parts = [];
        if (persona.assistantNickname) {
            parts.push("Your nickname is ".concat(persona.assistantNickname, ". Introduce yourself with this name when it helps the conversation feel natural."));
        }
        if (persona.tone) {
            parts.push("Respond in a ".concat(persona.tone, " tone."));
        }
        if (persona.assistantGender === "female") {
            parts.push("If responding in Thai, use feminine polite particles such as ค่ะ or คะ when natural.");
        }
        else if (persona.assistantGender === "male") {
            parts.push("If responding in Thai, use masculine polite particles such as ครับ when natural.");
        }
        else if (persona.assistantGender === "neutral") {
            parts.push("If responding in Thai, prefer polite neutral phrasing and avoid forcing gendered particles when they feel unnatural.");
        }
        if (parts.length > 0) {
            styleInstructions = parts.join(" ");
        }
    }
    var restrictionsBulletPoints = null;
    if (persona.restrictions && persona.restrictions.length > 0) {
        restrictionsBulletPoints =
            "Restrictions:\n" + persona.restrictions.map(function (r) { return "- ".concat(r); }).join("\n");
    }
    return { prefix: prefix, styleInstructions: styleInstructions, restrictionsBulletPoints: restrictionsBulletPoints };
}
// ── Resolution ───────────────────────────────────────────────
function loadPersonaById(personaId, conversationTenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, results, persona;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.personaTemplates)
                            .where((0, drizzle_orm_1.eq)(schema_1.personaTemplates.id, personaId))
                            .limit(1)];
                case 2:
                    results = _a.sent();
                    if (results.length === 0)
                        return [2 /*return*/, null];
                    persona = results[0];
                    // Tenant isolation check: tenant-scoped personas must match conversation tenant
                    if (persona.tenantId !== null && persona.tenantId !== conversationTenantId) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, persona];
            }
        });
    });
}
function resolvePersona(conversation, user, tenant, widgetId) {
    return __awaiter(this, void 0, void 0, function () {
        var enabled, _a, conversationTenantId, persona, db, widgets, persona, persona, persona;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!tenant.id) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, tenantFeatureFlagService_1.getTenantFeatureFlags)(tenant.id)];
                case 1:
                    _a = (_b.sent()).personaSystem;
                    return [3 /*break*/, 3];
                case 2:
                    _a = featureFlags_1.FEATURE_FLAG_DEFAULTS.personaSystem;
                    _b.label = 3;
                case 3:
                    enabled = _a;
                    if (!enabled)
                        return [2 /*return*/, null];
                    conversationTenantId = conversation.tenantId || tenant.id;
                    if (!conversation.personaId) return [3 /*break*/, 5];
                    return [4 /*yield*/, loadPersonaById(conversation.personaId, conversationTenantId)];
                case 4:
                    persona = _b.sent();
                    if (persona)
                        return [2 /*return*/, persona];
                    _b.label = 5;
                case 5:
                    if (!widgetId) return [3 /*break*/, 9];
                    return [4 /*yield*/, (0, db_1.getDb)()];
                case 6:
                    db = _b.sent();
                    if (!db) return [3 /*break*/, 9];
                    return [4 /*yield*/, db
                            .select({ defaultPersonaId: schema_1.chatWidgets.defaultPersonaId })
                            .from(schema_1.chatWidgets)
                            .where((0, drizzle_orm_1.eq)(schema_1.chatWidgets.id, widgetId))
                            .limit(1)];
                case 7:
                    widgets = _b.sent();
                    if (!(widgets.length > 0 && widgets[0].defaultPersonaId)) return [3 /*break*/, 9];
                    return [4 /*yield*/, loadPersonaById(widgets[0].defaultPersonaId, conversationTenantId)];
                case 8:
                    persona = _b.sent();
                    if (persona)
                        return [2 /*return*/, persona];
                    _b.label = 9;
                case 9:
                    if (!user.defaultPersonaId) return [3 /*break*/, 11];
                    return [4 /*yield*/, loadPersonaById(user.defaultPersonaId, conversationTenantId)];
                case 10:
                    persona = _b.sent();
                    if (persona)
                        return [2 /*return*/, persona];
                    _b.label = 11;
                case 11:
                    if (!tenant.defaultPersonaId) return [3 /*break*/, 13];
                    return [4 /*yield*/, loadPersonaById(tenant.defaultPersonaId, conversationTenantId)];
                case 12:
                    persona = _b.sent();
                    if (persona)
                        return [2 /*return*/, persona];
                    _b.label = 13;
                case 13: 
                // 5. Platform default
                return [2 /*return*/, exports.PLATFORM_DEFAULT_PERSONA];
            }
        });
    });
}
// ── CRUD helpers ─────────────────────────────────────────────
function listPersonas(userId, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db
                            .select()
                            .from(schema_1.personaTemplates)
                            .where(drizzle_orm_1.or.apply(void 0, __spreadArray(__spreadArray([
                            // Platform scope (tenantId is null)
                            (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.personaTemplates.scope, "platform"), (0, drizzle_orm_1.isNull)(schema_1.personaTemplates.tenantId))], (tenantId
                            ? [(0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.personaTemplates.scope, "tenant"), (0, drizzle_orm_1.eq)(schema_1.personaTemplates.tenantId, tenantId))]
                            : []), false), [
                            // User's own personas
                            (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.personaTemplates.scope, "user"), (0, drizzle_orm_1.eq)(schema_1.personaTemplates.userId, userId))], false)))];
            }
        });
    });
}
function getPersonaById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.personaTemplates)
                            .where((0, drizzle_orm_1.eq)(schema_1.personaTemplates.id, id))
                            .limit(1)];
                case 2:
                    results = _a.sent();
                    return [2 /*return*/, results[0] || null];
            }
        });
    });
}
function createPersona(input) {
    return __awaiter(this, void 0, void 0, function () {
        var db, sanitized, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    sanitized = sanitizePersonaInput(input);
                    return [4 /*yield*/, db
                            .insert(schema_1.personaTemplates)
                            .values({
                            name: sanitized.name,
                            description: sanitized.description,
                            assistantNickname: sanitized.assistantNickname || null,
                            assistantGender: sanitized.assistantGender || "neutral",
                            workingHours: sanitized.workingHours || null,
                            sourceTemplateIds: sanitized.sourceTemplateIds || [],
                            sourceTemplateLabels: sanitized.sourceTemplateLabels || [],
                            sourceTemplateCategories: sanitized.sourceTemplateCategories || [],
                            systemPromptPrefix: sanitized.systemPromptPrefix,
                            tone: sanitized.tone,
                            language: sanitized.language || "auto",
                            responseStyle: sanitized.responseStyle || {},
                            restrictions: sanitized.restrictions || [],
                            scope: sanitized.scope,
                            tenantId: sanitized.tenantId || null,
                            userId: sanitized.userId || null,
                            isDefault: sanitized.isDefault || false,
                            provisionedByBlueprintId: sanitized.provisionedByBlueprintId || null,
                            provisionedByBlueprintMemberId: sanitized.provisionedByBlueprintMemberId || null,
                        })
                            .returning()];
                case 2:
                    results = _a.sent();
                    return [2 /*return*/, results[0]];
            }
        });
    });
}
function updatePersona(id, input, tenantId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, needsSanitization, sanitized, updateFields, results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/, null];
                    needsSanitization = input.systemPromptPrefix !== undefined ||
                        input.restrictions !== undefined ||
                        input.assistantNickname !== undefined ||
                        input.assistantGender !== undefined ||
                        input.workingHours !== undefined ||
                        input.sourceTemplateIds !== undefined ||
                        input.sourceTemplateLabels !== undefined ||
                        input.sourceTemplateCategories !== undefined;
                    sanitized = needsSanitization
                        ? sanitizePersonaInput(__assign(__assign({}, input), { name: input.name || "", systemPromptPrefix: input.systemPromptPrefix || "", scope: input.scope || "user" }))
                        : input;
                    updateFields = {};
                    if (sanitized.name !== undefined)
                        updateFields.name = sanitized.name;
                    if (sanitized.description !== undefined)
                        updateFields.description = sanitized.description;
                    if (sanitized.assistantNickname !== undefined)
                        updateFields.assistantNickname = sanitized.assistantNickname;
                    if (sanitized.assistantGender !== undefined)
                        updateFields.assistantGender = sanitized.assistantGender;
                    if (sanitized.workingHours !== undefined)
                        updateFields.workingHours = sanitized.workingHours;
                    if (sanitized.sourceTemplateIds !== undefined)
                        updateFields.sourceTemplateIds = sanitized.sourceTemplateIds;
                    if (sanitized.sourceTemplateLabels !== undefined)
                        updateFields.sourceTemplateLabels = sanitized.sourceTemplateLabels;
                    if (sanitized.sourceTemplateCategories !== undefined)
                        updateFields.sourceTemplateCategories = sanitized.sourceTemplateCategories;
                    if (sanitized.systemPromptPrefix !== undefined)
                        updateFields.systemPromptPrefix = sanitized.systemPromptPrefix;
                    if (sanitized.tone !== undefined)
                        updateFields.tone = sanitized.tone;
                    if (sanitized.language !== undefined)
                        updateFields.language = sanitized.language;
                    if (sanitized.responseStyle !== undefined)
                        updateFields.responseStyle = sanitized.responseStyle;
                    if (sanitized.restrictions !== undefined)
                        updateFields.restrictions = sanitized.restrictions;
                    if (sanitized.isDefault !== undefined)
                        updateFields.isDefault = sanitized.isDefault;
                    updateFields.updatedAt = new Date();
                    return [4 /*yield*/, db
                            .update(schema_1.personaTemplates)
                            .set(updateFields)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.personaTemplates.id, id), tenantId ? (0, drizzle_orm_1.eq)(schema_1.personaTemplates.tenantId, tenantId) : (0, drizzle_orm_1.isNull)(schema_1.personaTemplates.tenantId)))
                            .returning()];
                case 2:
                    results = _a.sent();
                    return [2 /*return*/, results[0] || null];
            }
        });
    });
}
function deletePersona(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getDb)()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    // Nullify references before deleting
                    return [4 /*yield*/, db.update(schema_1.users).set({ defaultPersonaId: null }).where((0, drizzle_orm_1.eq)(schema_1.users.defaultPersonaId, id))];
                case 2:
                    // Nullify references before deleting
                    _a.sent();
                    return [4 /*yield*/, db.update(schema_1.tenants).set({ defaultPersonaId: null }).where((0, drizzle_orm_1.eq)(schema_1.tenants.defaultPersonaId, id))];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, db.update(schema_1.conversations).set({ personaId: null }).where((0, drizzle_orm_1.eq)(schema_1.conversations.personaId, id))];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, db.delete(schema_1.personaTemplates).where((0, drizzle_orm_1.eq)(schema_1.personaTemplates.id, id))];
                case 5:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
