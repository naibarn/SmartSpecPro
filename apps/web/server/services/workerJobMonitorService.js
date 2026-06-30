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
exports.defaultWorkerJobMonitorRepo = exports.USER_WORKER_JOB_STATUSES = void 0;
exports.listUserWorkerJobs = listUserWorkerJobs;
exports.getUserWorkerJobDetail = getUserWorkerJobDetail;
exports.cancelQueuedUserWorkerJob = cancelQueuedUserWorkerJob;
var drizzle_orm_1 = require("drizzle-orm");
var server_1 = require("@trpc/server");
var db_1 = require("../db");
var schema_1 = require("../../drizzle/schema");
var hyperframesWorkerVerificationService_1 = require("./hyperframesWorkerVerificationService");
exports.USER_WORKER_JOB_STATUSES = [
    "queued",
    "claimed",
    "preparing",
    "running",
    "uploading",
    "publishing",
    "indexing",
    "completed",
    "failed",
    "canceled",
    "expired",
];
exports.defaultWorkerJobMonitorRepo = {
    listUserJobs: function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var conditions;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        conditions = [
                            (0, drizzle_orm_1.eq)(schema_1.workerJobs.tenantId, input.auth.tenantId),
                            (0, drizzle_orm_1.eq)(schema_1.workerJobs.requestedByUserId, input.auth.userId),
                        ];
                        if ((_a = input.statuses) === null || _a === void 0 ? void 0 : _a.length) {
                            conditions.push((0, drizzle_orm_1.inArray)(schema_1.workerJobs.status, input.statuses));
                        }
                        return [4 /*yield*/, db_1.db
                                .select({
                                id: schema_1.workerJobs.id,
                                tenantId: schema_1.workerJobs.tenantId,
                                workerId: schema_1.workerJobs.workerId,
                                runtimeType: schema_1.workerJobs.runtimeType,
                                workflowRunId: schema_1.workerJobs.workflowRunId,
                                requestedByUserId: schema_1.workerJobs.requestedByUserId,
                                jobType: schema_1.workerJobs.jobType,
                                status: schema_1.workerJobs.status,
                                statusReason: schema_1.workerJobs.statusReason,
                                resourceProfile: schema_1.workerJobs.resourceProfile,
                                outputJson: schema_1.workerJobs.outputJson,
                                failureReason: schema_1.workerJobs.failureReason,
                                createdAt: schema_1.workerJobs.createdAt,
                                startedAt: schema_1.workerJobs.startedAt,
                                finishedAt: schema_1.workerJobs.finishedAt,
                                worker: {
                                    id: schema_1.workers.id,
                                    displayName: schema_1.workers.displayName,
                                    machineName: schema_1.workers.machineName,
                                    status: schema_1.workers.status,
                                    runtimeType: schema_1.workers.runtimeType,
                                    lastSeenAt: schema_1.workers.lastSeenAt,
                                },
                            })
                                .from(schema_1.workerJobs)
                                .leftJoin(schema_1.workers, (0, drizzle_orm_1.eq)(schema_1.workers.id, schema_1.workerJobs.workerId))
                                .where(drizzle_orm_1.and.apply(void 0, conditions))
                                .orderBy((0, drizzle_orm_1.desc)(schema_1.workerJobs.createdAt))
                                .limit(input.limit)
                                .offset(input.offset)];
                    case 1: return [2 /*return*/, _b.sent()];
                }
            });
        });
    },
    getUserJob: function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var row;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .select({
                            id: schema_1.workerJobs.id,
                            tenantId: schema_1.workerJobs.tenantId,
                            workerId: schema_1.workerJobs.workerId,
                            runtimeType: schema_1.workerJobs.runtimeType,
                            workflowRunId: schema_1.workerJobs.workflowRunId,
                            requestedByUserId: schema_1.workerJobs.requestedByUserId,
                            jobType: schema_1.workerJobs.jobType,
                            status: schema_1.workerJobs.status,
                            statusReason: schema_1.workerJobs.statusReason,
                            resourceProfile: schema_1.workerJobs.resourceProfile,
                            outputJson: schema_1.workerJobs.outputJson,
                            failureReason: schema_1.workerJobs.failureReason,
                            createdAt: schema_1.workerJobs.createdAt,
                            startedAt: schema_1.workerJobs.startedAt,
                            finishedAt: schema_1.workerJobs.finishedAt,
                            worker: {
                                id: schema_1.workers.id,
                                displayName: schema_1.workers.displayName,
                                machineName: schema_1.workers.machineName,
                                status: schema_1.workers.status,
                                runtimeType: schema_1.workers.runtimeType,
                                lastSeenAt: schema_1.workers.lastSeenAt,
                            },
                        })
                            .from(schema_1.workerJobs)
                            .leftJoin(schema_1.workers, (0, drizzle_orm_1.eq)(schema_1.workers.id, schema_1.workerJobs.workerId))
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.workerJobs.id, input.jobId), (0, drizzle_orm_1.eq)(schema_1.workerJobs.tenantId, input.auth.tenantId), (0, drizzle_orm_1.eq)(schema_1.workerJobs.requestedByUserId, input.auth.userId)))
                            .limit(1)];
                    case 1:
                        row = (_b.sent())[0];
                        return [2 /*return*/, (_a = row) !== null && _a !== void 0 ? _a : null];
                }
            });
        });
    },
    listEvents: function (jobIds_1) {
        return __awaiter(this, arguments, void 0, function (jobIds, limitPerJob) {
            var rows, countByJob;
            if (limitPerJob === void 0) { limitPerJob = 25; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (jobIds.length === 0)
                            return [2 /*return*/, []];
                        return [4 /*yield*/, db_1.db
                                .select({
                                id: schema_1.workerJobEvents.id,
                                workerJobId: schema_1.workerJobEvents.workerJobId,
                                eventType: schema_1.workerJobEvents.eventType,
                                payloadJson: schema_1.workerJobEvents.payloadJson,
                                createdAt: schema_1.workerJobEvents.createdAt,
                            })
                                .from(schema_1.workerJobEvents)
                                .where((0, drizzle_orm_1.inArray)(schema_1.workerJobEvents.workerJobId, jobIds))
                                .orderBy((0, drizzle_orm_1.desc)(schema_1.workerJobEvents.createdAt))];
                    case 1:
                        rows = _a.sent();
                        countByJob = new Map();
                        return [2 /*return*/, rows.filter(function (row) {
                                var _a;
                                var count = (_a = countByJob.get(row.workerJobId)) !== null && _a !== void 0 ? _a : 0;
                                if (count >= limitPerJob)
                                    return false;
                                countByJob.set(row.workerJobId, count + 1);
                                return true;
                            })];
                }
            });
        });
    },
    listArtifacts: function (jobIds) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (jobIds.length === 0)
                            return [2 /*return*/, []];
                        return [4 /*yield*/, db_1.db
                                .select({
                                id: schema_1.workerArtifacts.id,
                                workerJobId: schema_1.workerArtifacts.workerJobId,
                                artifactType: schema_1.workerArtifacts.artifactType,
                                storageRef: schema_1.workerArtifacts.storageRef,
                                metadataJson: schema_1.workerArtifacts.metadataJson,
                                publishedItemId: schema_1.workerArtifacts.publishedItemId,
                                sourceUrl: schema_1.libraryItems.sourceUrl,
                                createdAt: schema_1.workerArtifacts.createdAt,
                            })
                                .from(schema_1.workerArtifacts)
                                .leftJoin(schema_1.libraryItems, (0, drizzle_orm_1.eq)(schema_1.workerArtifacts.publishedItemId, schema_1.libraryItems.id))
                                .where((0, drizzle_orm_1.inArray)(schema_1.workerArtifacts.workerJobId, jobIds))
                                .orderBy((0, drizzle_orm_1.desc)(schema_1.workerArtifacts.createdAt))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    },
    cancelQueuedJob: function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var updated;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db_1.db
                            .update(schema_1.workerJobs)
                            .set({
                            status: "canceled",
                            statusReason: "Canceled by requester",
                            finishedAt: new Date(),
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.workerJobs.id, input.jobId), (0, drizzle_orm_1.eq)(schema_1.workerJobs.tenantId, input.auth.tenantId), (0, drizzle_orm_1.eq)(schema_1.workerJobs.requestedByUserId, input.auth.userId), (0, drizzle_orm_1.inArray)(schema_1.workerJobs.status, [
                            "queued",
                            "claimed",
                            "preparing",
                            "running",
                            "uploading",
                            "publishing",
                            "indexing",
                        ])))
                            .returning()];
                    case 1:
                        updated = (_b.sent())[0];
                        return [2 /*return*/, (_a = updated) !== null && _a !== void 0 ? _a : null];
                }
            });
        });
    },
};
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function safeString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
function safeNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function safeBoolean(value) {
    return typeof value === "boolean" ? value : undefined;
}
function isHyperframesFinalVideoType(value) {
    return value === "hyperframes_final_video";
}
function hasValidHyperframesFinalVideoSize(sizeBytes) {
    var size = safeNumber(sizeBytes);
    return typeof size === "number" && size >= hyperframesWorkerVerificationService_1.HYPERFRAMES_FINAL_VIDEO_MIN_BYTES;
}
function isVerifiedArtifact(artifact) {
    var _a, _b, _c;
    if (isHyperframesFinalVideoType(artifact.artifactType)) {
        var metadata_1 = asRecord(artifact.metadataJson);
        if (!hasValidHyperframesFinalVideoSize((_a = metadata_1.sizeBytes) !== null && _a !== void 0 ? _a : metadata_1.size)) {
            return false;
        }
    }
    var metadata = asRecord(artifact.metadataJson);
    var verificationState = safeString((_c = (_b = metadata.verificationState) !== null && _b !== void 0 ? _b : metadata.verificationStatus) !== null && _c !== void 0 ? _c : metadata.status);
    return artifact.publishedItemId != null
        || verificationState === "verified"
        || verificationState === "passed"
        || verificationState === "server_verification_passed";
}
function projectOutputJson(outputJson) {
    var output = asRecord(outputJson);
    var refs = Array.isArray(output.outputRefs)
        ? output.outputRefs
        : Array.isArray(output.artifacts)
            ? output.artifacts
            : Array.isArray(output.publishedArtifacts)
                ? output.publishedArtifacts
                : [];
    return refs.reduce(function (items, ref) {
        var _a, _b, _c, _d, _e, _f;
        var record = asRecord(ref);
        var artifactType = (_b = safeString((_a = record.artifactType) !== null && _a !== void 0 ? _a : record.type)) !== null && _b !== void 0 ? _b : "output";
        if (isHyperframesFinalVideoType(artifactType) && !hasValidHyperframesFinalVideoSize((_c = record.sizeBytes) !== null && _c !== void 0 ? _c : record.size)) {
            return items;
        }
        var verificationState = safeString((_d = record.verificationState) !== null && _d !== void 0 ? _d : record.verificationStatus);
        var publishedItemId = safeNumber(record.publishedItemId);
        if (!publishedItemId && verificationState !== "verified" && verificationState !== "passed") {
            return items;
        }
        items.push({
            artifactType: artifactType,
            publishedItemId: publishedItemId !== null && publishedItemId !== void 0 ? publishedItemId : null,
            sourceUrl: safeString((_e = record.sourceUrl) !== null && _e !== void 0 ? _e : record.source_url),
            downloadUrl: safeString(record.downloadUrl),
            contentHash: safeString((_f = record.contentHash) !== null && _f !== void 0 ? _f : record.sha256),
            mimeType: safeString(record.mimeType),
            sizeBytes: safeNumber(record.sizeBytes),
            verificationState: verificationState,
        });
        return items;
    }, []);
}
function projectArtifact(artifact) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!isVerifiedArtifact(artifact))
        return null;
    var metadata = asRecord(artifact.metadataJson);
    return {
        artifactId: artifact.id,
        artifactType: artifact.artifactType,
        storageRef: artifact.storageRef,
        publishedItemId: artifact.publishedItemId,
        sourceUrl: safeString((_b = (_a = metadata.sourceUrl) !== null && _a !== void 0 ? _a : metadata.source_url) !== null && _b !== void 0 ? _b : artifact.sourceUrl),
        downloadUrl: safeString(metadata.downloadUrl),
        contentHash: safeString((_c = metadata.contentHash) !== null && _c !== void 0 ? _c : metadata.sha256),
        mimeType: safeString((_d = metadata.mimeType) !== null && _d !== void 0 ? _d : metadata.contentType),
        sizeBytes: safeNumber((_e = metadata.sizeBytes) !== null && _e !== void 0 ? _e : metadata.size),
        verificationState: safeString((_g = (_f = metadata.verificationState) !== null && _f !== void 0 ? _f : metadata.verificationStatus) !== null && _g !== void 0 ? _g : metadata.status),
        createdAt: artifact.createdAt,
    };
}
function projectEvent(event) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    var payload = asRecord(event.payloadJson);
    return {
        id: event.id,
        eventType: event.eventType,
        sidecarEventType: (_b = safeString((_a = payload.eventType) !== null && _a !== void 0 ? _a : payload.sidecarEventType)) !== null && _b !== void 0 ? _b : null,
        message: (_e = safeString((_d = (_c = payload.message) !== null && _c !== void 0 ? _c : payload.safeMessage) !== null && _d !== void 0 ? _d : payload.phaseLabel)) !== null && _e !== void 0 ? _e : null,
        progressPercent: (_h = safeNumber((_g = (_f = payload.progressPercent) !== null && _f !== void 0 ? _f : payload.progress) !== null && _g !== void 0 ? _g : payload.percent)) !== null && _h !== void 0 ? _h : null,
        phase: (_l = safeString((_k = (_j = payload.phase) !== null && _j !== void 0 ? _j : payload.stage) !== null && _k !== void 0 ? _k : payload.status)) !== null && _l !== void 0 ? _l : null,
        shotId: (_m = safeString(payload.shotId)) !== null && _m !== void 0 ? _m : null,
        shotIndex: (_o = safeNumber(payload.shotIndex)) !== null && _o !== void 0 ? _o : null,
        shotTotal: (_p = safeNumber(payload.shotTotal)) !== null && _p !== void 0 ? _p : null,
        cacheHit: (_q = safeBoolean(payload.cacheHit)) !== null && _q !== void 0 ? _q : null,
        errorCode: (_t = safeString((_s = (_r = payload.errorCode) !== null && _r !== void 0 ? _r : payload.failureCode) !== null && _s !== void 0 ? _s : payload.code)) !== null && _t !== void 0 ? _t : null,
        rootCause: (_u = safeString(payload.rootCause)) !== null && _u !== void 0 ? _u : null,
        concatMode: (_v = safeString(payload.concatMode)) !== null && _v !== void 0 ? _v : null,
        createdAt: event.createdAt,
    };
}
function projectJob(row, eventsByJobId, artifactsByJobId) {
    var _a, _b, _c, _d;
    var events = ((_a = eventsByJobId.get(row.id)) !== null && _a !== void 0 ? _a : [])
        .slice()
        .sort(function (a, b) { return b.createdAt.getTime() - a.createdAt.getTime(); })
        .map(projectEvent);
    var artifactRefs = ((_b = artifactsByJobId.get(row.id)) !== null && _b !== void 0 ? _b : [])
        .map(projectArtifact)
        .filter(function (ref) { return ref != null; });
    var rawOutputRefs = __spreadArray(__spreadArray([], artifactRefs, true), projectOutputJson(row.outputJson), true);
    var outputRefs = Array.from(rawOutputRefs.reduce(function (map, ref) {
        var key = ref.publishedItemId
            ? "pub:".concat(ref.publishedItemId)
            : ref.artifactId
                ? "art:".concat(ref.artifactId)
                : "typ:".concat(ref.artifactType);
        if (!map.has(key) || (!map.get(key).downloadUrl && ref.downloadUrl)) {
            map.set(key, ref);
        }
        return map;
    }, new Map()).values());
    var status = row.jobType === "hyperframes_final_composite" &&
        row.status === "completed" &&
        outputRefs.length === 0
        ? "failed"
        : row.status;
    return {
        id: row.id,
        jobType: row.jobType,
        status: status,
        statusReason: row.statusReason,
        failureReason: status === "failed" && !row.failureReason
            ? "HyperFrames final video verification failed."
            : row.failureReason,
        runtimeType: row.runtimeType,
        resourceProfile: row.resourceProfile,
        workflowRunId: row.workflowRunId,
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        latestEvent: (_c = events[0]) !== null && _c !== void 0 ? _c : null,
        worker: ((_d = row.worker) === null || _d === void 0 ? void 0 : _d.id) ? row.worker : null,
        outputRefs: outputRefs,
        canCancel: ["queued", "claimed", "preparing", "running", "uploading", "publishing", "indexing"].includes(status),
    };
}
function groupByJobId(rows) {
    var _a;
    var grouped = new Map();
    for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
        var row = rows_1[_i];
        var items = (_a = grouped.get(row.workerJobId)) !== null && _a !== void 0 ? _a : [];
        items.push(row);
        grouped.set(row.workerJobId, items);
    }
    return grouped;
}
function listUserWorkerJobs(input_1) {
    return __awaiter(this, arguments, void 0, function (input, deps) {
        var repo, jobs, jobIds, _a, events, artifacts;
        var _b, _c, _d;
        if (deps === void 0) { deps = {}; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    repo = (_b = deps.repo) !== null && _b !== void 0 ? _b : exports.defaultWorkerJobMonitorRepo;
                    return [4 /*yield*/, repo.listUserJobs({
                            auth: input.auth,
                            statuses: input.status ? [input.status] : undefined,
                            limit: (_c = input.limit) !== null && _c !== void 0 ? _c : 50,
                            offset: (_d = input.offset) !== null && _d !== void 0 ? _d : 0,
                        })];
                case 1:
                    jobs = _e.sent();
                    jobIds = jobs.map(function (job) { return job.id; });
                    return [4 /*yield*/, Promise.all([
                            repo.listEvents(jobIds, 1),
                            repo.listArtifacts(jobIds),
                        ])];
                case 2:
                    _a = _e.sent(), events = _a[0], artifacts = _a[1];
                    return [2 /*return*/, {
                            items: jobs.map(function (job) { return projectJob(job, groupByJobId(events), groupByJobId(artifacts)); }),
                        }];
            }
        });
    });
}
function getUserWorkerJobDetail(input_1) {
    return __awaiter(this, arguments, void 0, function (input, deps) {
        var repo, job, _a, events, artifacts, summary;
        var _b;
        if (deps === void 0) { deps = {}; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    repo = (_b = deps.repo) !== null && _b !== void 0 ? _b : exports.defaultWorkerJobMonitorRepo;
                    return [4 /*yield*/, repo.getUserJob(input)];
                case 1:
                    job = _c.sent();
                    if (!job) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Worker job not found" });
                    }
                    return [4 /*yield*/, Promise.all([
                            repo.listEvents([job.id], 100),
                            repo.listArtifacts([job.id]),
                        ])];
                case 2:
                    _a = _c.sent(), events = _a[0], artifacts = _a[1];
                    summary = projectJob(job, groupByJobId(events), groupByJobId(artifacts));
                    return [2 /*return*/, __assign(__assign({}, summary), { events: events
                                .slice()
                                .sort(function (a, b) { return a.createdAt.getTime() - b.createdAt.getTime(); })
                                .map(projectEvent) })];
            }
        });
    });
}
function cancelQueuedUserWorkerJob(input_1) {
    return __awaiter(this, arguments, void 0, function (input, deps) {
        var repo, updated, current;
        var _a;
        if (deps === void 0) { deps = {}; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    repo = (_a = deps.repo) !== null && _a !== void 0 ? _a : exports.defaultWorkerJobMonitorRepo;
                    return [4 /*yield*/, repo.cancelQueuedJob(input)];
                case 1:
                    updated = _b.sent();
                    if (!!updated) return [3 /*break*/, 3];
                    return [4 /*yield*/, repo.getUserJob(input)];
                case 2:
                    current = _b.sent();
                    if (!current) {
                        throw new server_1.TRPCError({ code: "NOT_FOUND", message: "Worker job not found" });
                    }
                    throw new server_1.TRPCError({
                        code: "CONFLICT",
                        message: "Only active jobs can be canceled.",
                    });
                case 3: return [2 /*return*/, { canceled: true, jobId: updated.id }];
            }
        });
    });
}
