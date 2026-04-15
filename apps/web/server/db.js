"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
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
exports.db = void 0;
exports.getDb = getDb;
exports.upsertUser = upsertUser;
exports.updateLastSignedIn = updateLastSignedIn;
exports.getUserByOpenId = getUserByOpenId;
exports.getUserById = getUserById;
exports.getUserByEmail = getUserByEmail;
exports.getUserCount = getUserCount;
exports.updateUserRole = updateUserRole;
exports.getGalleryItems = getGalleryItems;
exports.getGalleryItemById = getGalleryItemById;
exports.createGalleryItem = createGalleryItem;
exports.updateGalleryItem = updateGalleryItem;
exports.deleteGalleryItem = deleteGalleryItem;
exports.incrementGalleryViews = incrementGalleryViews;
exports.incrementGalleryLikes = incrementGalleryLikes;
exports.incrementGalleryDownloads = incrementGalleryDownloads;
exports.bulkDeleteGalleryItems = bulkDeleteGalleryItems;
exports.bulkUpdateGalleryPublish = bulkUpdateGalleryPublish;
exports.bulkUpdateGalleryFeatured = bulkUpdateGalleryFeatured;
exports.getGalleryItemsCount = getGalleryItemsCount;
exports.getGalleryAnalytics = getGalleryAnalytics;
exports.getGalleryStats = getGalleryStats;
var drizzle_orm_1 = require("drizzle-orm");
var postgres_js_1 = require("drizzle-orm/postgres-js");
var postgres_1 = require("postgres");
var schema_1 = require("../drizzle/schema");
var env_1 = require("./_core/env");
var _db = null;
var _client = null;
// Lazily create the drizzle instance so local tooling can run without a DB.
function getDb() {
    if (!_db) {
        if (!process.env.DATABASE_URL) {
            throw new Error("Database not configured. Set DATABASE_URL before calling getDb().");
        }
        try {
            var poolSize = parseInt(process.env.DB_POOL_SIZE || "5", 10);
            _client = (0, postgres_1.default)(process.env.DATABASE_URL, {
                max: poolSize,
                idle_timeout: 20, // Close idle connections after 20s
                connect_timeout: 10, // Timeout connection attempts after 10s
            });
            _db = (0, postgres_js_1.drizzle)(_client);
        }
        catch (error) {
            console.warn("[Database] Failed to connect:", error);
            throw error;
        }
    }
    return _db;
}
// Synchronous db getter for services that need direct access
// Note: This will throw if called before getDb() has been called at least once
exports.db = {
    get instance() {
        if (!_db) {
            throw new Error("Database not initialized. Call getDb() first.");
        }
        return _db;
    },
    select: function () {
        var _a;
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (!_db)
            throw new Error("Database not initialized");
        if (args.length === 0) {
            return _db.select();
        }
        return (_a = _db).select.apply(_a, args);
    },
    insert: function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (!_db)
            throw new Error("Database not initialized");
        return _db.insert.apply(_db, args);
    },
    update: function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (!_db)
            throw new Error("Database not initialized");
        return _db.update.apply(_db, args);
    },
    delete: function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (!_db)
            throw new Error("Database not initialized");
        return _db.delete.apply(_db, args);
    },
    transaction: function (fn) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            if (!_db)
                throw new Error("Database not initialized");
            return [2 /*return*/, _db.transaction(function (tx) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, fn(tx)];
                }); }); })];
        });
    }); },
};
function upsertUser(user) {
    return __awaiter(this, void 0, void 0, function () {
        var db, values_1, updateSet_1, textFields, assignNullable, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!user.openId) {
                        throw new Error("User openId is required for upsert");
                    }
                    return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        console.warn("[Database] Cannot upsert user: database not available");
                        return [2 /*return*/];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    values_1 = {
                        openId: user.openId,
                    };
                    updateSet_1 = {};
                    textFields = ["name", "email", "loginMethod", "normalizedEmail", "registrationIp"];
                    assignNullable = function (field) {
                        var value = user[field];
                        if (value === undefined)
                            return;
                        var normalized = value !== null && value !== void 0 ? value : null;
                        values_1[field] = normalized;
                        updateSet_1[field] = normalized;
                    };
                    textFields.forEach(assignNullable);
                    if (user.lastSignedIn !== undefined) {
                        values_1.lastSignedIn = user.lastSignedIn;
                        updateSet_1.lastSignedIn = user.lastSignedIn;
                    }
                    if (user.role !== undefined) {
                        values_1.role = user.role;
                        updateSet_1.role = user.role;
                    }
                    else if (user.openId === env_1.ENV.ownerOpenId) {
                        values_1.role = 'admin';
                        updateSet_1.role = 'admin';
                    }
                    else {
                        // Always include default role for INSERT to avoid NOT NULL constraint violation
                        values_1.role = 'user';
                        // Don't update role if not specified - keep existing role on conflict
                    }
                    // Set registeredDomain only on first insert (new user)
                    if (user.registeredDomain !== undefined) {
                        values_1.registeredDomain = user.registeredDomain;
                        // Do NOT include in updateSet - registeredDomain should only be set once
                    }
                    // Set trustScore only on first insert (new user)
                    if (user.trustScore !== undefined) {
                        values_1.trustScore = user.trustScore;
                        // Do NOT include in updateSet - trustScore set at registration
                    }
                    if (!values_1.lastSignedIn) {
                        values_1.lastSignedIn = new Date();
                    }
                    if (Object.keys(updateSet_1).length === 0) {
                        updateSet_1.lastSignedIn = new Date();
                    }
                    // PostgreSQL upsert syntax
                    return [4 /*yield*/, db.insert(schema_1.users).values(values_1).onConflictDoUpdate({
                            target: schema_1.users.openId,
                            set: updateSet_1,
                        })];
                case 3:
                    // PostgreSQL upsert syntax
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    console.error("[Database] Failed to upsert user:", error_1);
                    throw error_1;
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Update only the lastSignedIn timestamp for an existing user
 * This avoids the INSERT...ON CONFLICT issues with NOT NULL constraints
 */
function updateLastSignedIn(openId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        console.warn("[Database] Cannot update lastSignedIn: database not available");
                        return [2 /*return*/];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.update(schema_1.users)
                            .set({ lastSignedIn: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.users.openId, openId))];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_2 = _a.sent();
                    console.warn("[Database] Failed to update lastSignedIn:", error_2);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function getUserByOpenId(openId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        console.warn("[Database] Cannot get user: database not available");
                        return [2 /*return*/, undefined];
                    }
                    return [4 /*yield*/, db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.openId, openId)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function getUserById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        console.warn("[Database] Cannot get user by id: database not available");
                        return [2 /*return*/, undefined];
                    }
                    return [4 /*yield*/, db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function getUserByEmail(email) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        console.warn("[Database] Cannot get user by email: database not available");
                        return [2 /*return*/, undefined];
                    }
                    return [4 /*yield*/, db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.email, email)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
/**
 * Get total user count
 * Used for determining if this is the first user (auto-admin)
 */
function getUserCount() {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _b.sent();
                    if (!db) {
                        console.warn("[Database] Cannot get user count: database not available");
                        return [2 /*return*/, 0];
                    }
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) }).from(schema_1.users)];
                case 2:
                    result = _b.sent();
                    return [2 /*return*/, Number((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0];
            }
        });
    });
}
/**
 * Update a user's role by their ID
 * Used for promoting users to admin in local development
 */
function updateUserRole(userId, role) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        console.warn("[Database] Cannot update user role: database not available");
                        return [2 /*return*/];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.update(schema_1.users).set({ role: role }).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_3 = _a.sent();
                    console.error("[Database] Failed to update user role:", error_3);
                    throw error_3;
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Get all gallery items with optional filters
 */
function getGalleryItems() {
    return __awaiter(this, arguments, void 0, function (filters) {
        var db, conditions, searchCondition, query;
        if (filters === void 0) { filters = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        console.warn("[Database] Cannot get gallery items: database not available");
                        return [2 /*return*/, []];
                    }
                    conditions = [];
                    if (filters.tenantId !== undefined) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.galleryItems.tenantId, filters.tenantId));
                    }
                    if (filters.type) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.galleryItems.type, filters.type));
                    }
                    if (filters.isPublished !== undefined) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.galleryItems.isPublished, filters.isPublished));
                    }
                    if (filters.isFeatured !== undefined) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.galleryItems.isFeatured, filters.isFeatured));
                    }
                    if (filters.search) {
                        searchCondition = (0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.galleryItems.title, "%".concat(filters.search, "%")), (0, drizzle_orm_1.like)(schema_1.galleryItems.description, "%".concat(filters.search, "%")));
                        if (searchCondition) {
                            conditions.push(searchCondition);
                        }
                    }
                    query = db.select().from(schema_1.galleryItems);
                    if (conditions.length > 0) {
                        query = query.where(drizzle_orm_1.and.apply(void 0, conditions));
                    }
                    query = query.orderBy((0, drizzle_orm_1.asc)(schema_1.galleryItems.sortOrder), (0, drizzle_orm_1.desc)(schema_1.galleryItems.createdAt));
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
 * Get a single gallery item by ID
 */
function getGalleryItemById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        console.warn("[Database] Cannot get gallery item: database not available");
                        return [2 /*return*/, undefined];
                    }
                    return [4 /*yield*/, db.select().from(schema_1.galleryItems).where((0, drizzle_orm_1.eq)(schema_1.galleryItems.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
/**
 * Create a new gallery item
 */
function createGalleryItem(item) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, db.insert(schema_1.galleryItems).values(item).returning({ id: schema_1.galleryItems.id })];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].id];
            }
        });
    });
}
/**
 * Update a gallery item
 */
function updateGalleryItem(id, item) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, db.update(schema_1.galleryItems).set(item).where((0, drizzle_orm_1.eq)(schema_1.galleryItems.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Delete a gallery item
 */
function deleteGalleryItem(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, db.delete(schema_1.galleryItems).where((0, drizzle_orm_1.eq)(schema_1.galleryItems.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Increment view count
 */
function incrementGalleryViews(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.galleryItems)
                            .set({ views: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.galleryItems.views) })
                            .where((0, drizzle_orm_1.eq)(schema_1.galleryItems.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Increment like count
 */
function incrementGalleryLikes(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.galleryItems)
                            .set({ likes: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.galleryItems.likes) })
                            .where((0, drizzle_orm_1.eq)(schema_1.galleryItems.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Increment download count
 */
function incrementGalleryDownloads(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.galleryItems)
                            .set({ downloads: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.galleryItems.downloads) })
                            .where((0, drizzle_orm_1.eq)(schema_1.galleryItems.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Bulk delete gallery items
 */
function bulkDeleteGalleryItems(ids) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, db.delete(schema_1.galleryItems).where((0, drizzle_orm_1.inArray)(schema_1.galleryItems.id, ids))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Bulk update publish status
 */
function bulkUpdateGalleryPublish(ids, isPublished) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, db.update(schema_1.galleryItems)
                            .set({ isPublished: isPublished })
                            .where((0, drizzle_orm_1.inArray)(schema_1.galleryItems.id, ids))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Bulk update featured status
 */
function bulkUpdateGalleryFeatured(ids, isFeatured) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        throw new Error("Database not available");
                    }
                    return [4 /*yield*/, db.update(schema_1.galleryItems)
                            .set({ isFeatured: isFeatured })
                            .where((0, drizzle_orm_1.inArray)(schema_1.galleryItems.id, ids))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Get gallery items count (for pagination)
 */
function getGalleryItemsCount(filters) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conditions, searchCondition, query, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _b.sent();
                    if (!db) {
                        return [2 /*return*/, 0];
                    }
                    conditions = [];
                    if (filters.tenantId !== undefined) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.galleryItems.tenantId, filters.tenantId));
                    }
                    if (filters.type) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.galleryItems.type, filters.type));
                    }
                    if (filters.isPublished !== undefined) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.galleryItems.isPublished, filters.isPublished));
                    }
                    if (filters.isFeatured !== undefined) {
                        conditions.push((0, drizzle_orm_1.eq)(schema_1.galleryItems.isFeatured, filters.isFeatured));
                    }
                    if (filters.search) {
                        searchCondition = (0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(schema_1.galleryItems.title, "%".concat(filters.search, "%")), (0, drizzle_orm_1.like)(schema_1.galleryItems.description, "%".concat(filters.search, "%")));
                        if (searchCondition) {
                            conditions.push(searchCondition);
                        }
                    }
                    query = db.select({ count: (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))) }).from(schema_1.galleryItems);
                    if (conditions.length > 0) {
                        query = query.where(drizzle_orm_1.and.apply(void 0, conditions));
                    }
                    return [4 /*yield*/, query];
                case 2:
                    result = _b.sent();
                    return [2 /*return*/, Number((_a = result[0]) === null || _a === void 0 ? void 0 : _a.count) || 0];
            }
        });
    });
}
/**
 * Get gallery analytics
 */
function getGalleryAnalytics() {
    return __awaiter(this, arguments, void 0, function (days) {
        var db, topItems, typeDistribution;
        if (days === void 0) { days = 30; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        return [2 /*return*/, { dailyStats: [], topItems: [], typeDistribution: [] }];
                    }
                    return [4 /*yield*/, db.select({
                            id: schema_1.galleryItems.id,
                            title: schema_1.galleryItems.title,
                            type: schema_1.galleryItems.type,
                            views: schema_1.galleryItems.views,
                            likes: schema_1.galleryItems.likes,
                        })
                            .from(schema_1.galleryItems)
                            .orderBy((0, drizzle_orm_1.desc)(schema_1.galleryItems.views))
                            .limit(10)];
                case 2:
                    topItems = _a.sent();
                    return [4 /*yield*/, db.select({
                            type: schema_1.galleryItems.type,
                            count: (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                        })
                            .from(schema_1.galleryItems)
                            .groupBy(schema_1.galleryItems.type)];
                case 3:
                    typeDistribution = _a.sent();
                    return [2 /*return*/, {
                            dailyStats: [], // Would need a separate analytics table for daily tracking
                            topItems: topItems.map(function (item) { return ({
                                id: item.id,
                                title: item.title,
                                type: item.type,
                                views: item.views,
                                likes: item.likes,
                            }); }),
                            typeDistribution: typeDistribution.map(function (item) { return ({
                                type: item.type,
                                count: Number(item.count),
                            }); }),
                        }];
            }
        });
    });
}
/**
 * Get gallery stats
 */
function getGalleryStats() {
    return __awaiter(this, void 0, void 0, function () {
        var db, stats;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db) {
                        return [2 /*return*/, {
                                totalItems: 0,
                                totalImages: 0,
                                totalVideos: 0,
                                totalWebsites: 0,
                                totalViews: 0,
                                totalLikes: 0
                            }];
                    }
                    return [4 /*yield*/, db.select({
                            totalItems: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            totalImages: (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END)"], ["SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END)"]))),
                            totalVideos: (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END)"], ["SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END)"]))),
                            totalWebsites: (0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["SUM(CASE WHEN type = 'website' THEN 1 ELSE 0 END)"], ["SUM(CASE WHEN type = 'website' THEN 1 ELSE 0 END)"]))),
                            totalViews: (0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["SUM(views)"], ["SUM(views)"]))),
                            totalLikes: (0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["SUM(likes)"], ["SUM(likes)"])))
                        }).from(schema_1.galleryItems)];
                case 2:
                    stats = (_a.sent())[0];
                    return [2 /*return*/, {
                            totalItems: Number(stats.totalItems) || 0,
                            totalImages: Number(stats.totalImages) || 0,
                            totalVideos: Number(stats.totalVideos) || 0,
                            totalWebsites: Number(stats.totalWebsites) || 0,
                            totalViews: Number(stats.totalViews) || 0,
                            totalLikes: Number(stats.totalLikes) || 0
                        }];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12;
