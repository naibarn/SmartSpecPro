"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HyperframesWorkerVerificationError = exports.HYPERFRAMES_FINAL_VIDEO_MIN_BYTES = exports.HYPERFRAMES_WORKER_REQUIRED_ARTIFACT_TYPES = void 0;
exports.verifyHyperframesWorkerArtifacts = verifyHyperframesWorkerArtifacts;
var limits_1 = require("../../shared/hyperframes/limits");
var workerPayloadSanitizer_1 = require("./workerPayloadSanitizer");
exports.HYPERFRAMES_WORKER_REQUIRED_ARTIFACT_TYPES = [
    "hyperframes_final_video",
    "hyperframes_render_manifest",
    "hyperframes_runtime_doctor",
    "hyperframes_probe_report",
];
exports.HYPERFRAMES_FINAL_VIDEO_MIN_BYTES = 1024;
var HyperframesWorkerVerificationError = /** @class */ (function (_super) {
    __extends(HyperframesWorkerVerificationError, _super);
    function HyperframesWorkerVerificationError(code, message, report) {
        var _this = _super.call(this, message) || this;
        _this.name = "HyperframesWorkerVerificationError";
        _this.code = code;
        _this.report = report;
        return _this;
    }
    return HyperframesWorkerVerificationError;
}(Error));
exports.HyperframesWorkerVerificationError = HyperframesWorkerVerificationError;
function asRecord(value) {
    return (0, workerPayloadSanitizer_1.isPlainObject)(value) ? value : {};
}
function asString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function asNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim()) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function normalizeHash(value) {
    var _a, _b;
    var hash = (_b = (_a = asString(value)) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : null;
    return hash && /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}
function normalizeContentType(value) {
    var _a, _b;
    return (_b = (_a = asString(value)) === null || _a === void 0 ? void 0 : _a.toLowerCase()) !== null && _b !== void 0 ? _b : null;
}
function asPositiveInteger(value) {
    var number = asNumber(value);
    return number !== null && Number.isInteger(number) && number > 0 ? number : null;
}
function artifactMetadata(artifact) {
    return asRecord(artifact.metadataJson);
}
function findArtifact(artifacts, artifactType) {
    var _a;
    return (_a = artifacts.find(function (artifact) { return artifact.artifactType === artifactType; })) !== null && _a !== void 0 ? _a : null;
}
function getExpectedDurationSec(job) {
    var _a, _b;
    var inputJson = asRecord(job.inputJson);
    var renderConfig = asRecord(inputJson.renderConfig);
    var outputJson = asRecord(job.outputJson);
    return (_b = (_a = asNumber(inputJson.finalVideoLengthSec)) !== null && _a !== void 0 ? _a : asNumber(renderConfig.finalVideoLengthSec)) !== null && _b !== void 0 ? _b : asNumber(outputJson.finalVideoLengthSec);
}
function getExpectedAssignmentAttempt(job) {
    var _a;
    var outputJson = asRecord(job.outputJson);
    return (_a = asString(outputJson.assignmentAttempt)) !== null && _a !== void 0 ? _a : asString(outputJson.lastAssignmentAttempt);
}
function getExpectedAspectRatio(job) {
    var _a, _b, _c;
    var outputRequirements = asRecord(asRecord(job.inputJson).outputRequirements);
    return (_c = (_b = (_a = asString(outputRequirements.aspectRatio)) !== null && _a !== void 0 ? _a : asString(outputRequirements.outputAspectRatio)) !== null && _b !== void 0 ? _b : asString(asRecord(job.inputJson).aspectRatio)) !== null && _c !== void 0 ? _c : "9:16";
}
function getExpectedFps(job) {
    var _a, _b;
    var outputRequirements = asRecord(asRecord(job.inputJson).outputRequirements);
    return (_b = (_a = asNumber(outputRequirements.fps)) !== null && _a !== void 0 ? _a : asNumber(asRecord(job.inputJson).fps)) !== null && _b !== void 0 ? _b : 30;
}
function reportBase(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return {
        status: (_a = input.status) !== null && _a !== void 0 ? _a : "failed",
        checkedAt: input.now.toISOString(),
        publishableArtifactIds: (_b = input.publishableArtifactIds) !== null && _b !== void 0 ? _b : [],
        safeMessage: (_c = input.safeMessage) !== null && _c !== void 0 ? _c : "HyperFrames worker output verification failed.",
        failureCode: (_d = input.failureCode) !== null && _d !== void 0 ? _d : null,
        expected: {
            durationSec: getExpectedDurationSec(input.job),
            aspectRatio: getExpectedAspectRatio(input.job),
            fps: getExpectedFps(input.job),
            assignmentAttempt: getExpectedAssignmentAttempt(input.job),
        },
        actual: {
            durationSec: (_e = input.durationSec) !== null && _e !== void 0 ? _e : null,
            aspectRatio: (_f = input.aspectRatio) !== null && _f !== void 0 ? _f : null,
            fps: (_g = input.fps) !== null && _g !== void 0 ? _g : null,
            finalVideoChecksumSha256: (_h = input.finalVideoChecksumSha256) !== null && _h !== void 0 ? _h : null,
        },
        artifactIds: Object.fromEntries(input.artifacts
            .filter(function (artifact) { return typeof artifact.artifactType === "string"; })
            .map(function (artifact) { return [artifact.artifactType, artifact.id]; })),
    };
}
function fail(input) {
    var _a, _b, _c, _d;
    var report = reportBase({
        job: input.job,
        artifacts: input.artifacts,
        now: input.now,
        failureCode: input.code,
        safeMessage: input.message,
        finalVideoChecksumSha256: (_a = input.finalVideoChecksumSha256) !== null && _a !== void 0 ? _a : null,
        durationSec: (_b = input.durationSec) !== null && _b !== void 0 ? _b : null,
        aspectRatio: (_c = input.aspectRatio) !== null && _c !== void 0 ? _c : null,
        fps: (_d = input.fps) !== null && _d !== void 0 ? _d : null,
    });
    throw new HyperframesWorkerVerificationError(input.code, input.message, report);
}
function readManifestFinalChecksum(manifestArtifact) {
    var _a, _b;
    var metadata = artifactMetadata(manifestArtifact);
    var manifestJson = asRecord(metadata.manifestJson);
    var outputs = asRecord(manifestJson.outputs);
    var finalVideo = asRecord(outputs.finalVideo);
    return (_b = (_a = normalizeHash(metadata.finalVideoChecksumSha256)) !== null && _a !== void 0 ? _a : normalizeHash(finalVideo.checksumSha256)) !== null && _b !== void 0 ? _b : normalizeHash(finalVideo.sha256);
}
function readProbeDuration(probeArtifact) {
    var _a, _b;
    var metadata = artifactMetadata(probeArtifact);
    var probeJson = asRecord(metadata.probeJson);
    return (_b = (_a = asNumber(metadata.durationSec)) !== null && _a !== void 0 ? _a : asNumber(probeJson.durationSec)) !== null && _b !== void 0 ? _b : asNumber(probeJson.duration);
}
function readProbeAspectRatio(probeArtifact) {
    var _a, _b;
    var metadata = artifactMetadata(probeArtifact);
    var probeJson = asRecord(metadata.probeJson);
    return (_b = (_a = asString(metadata.aspectRatio)) !== null && _a !== void 0 ? _a : asString(probeJson.aspectRatio)) !== null && _b !== void 0 ? _b : asString(probeJson.displayAspectRatio);
}
function readProbeFps(probeArtifact) {
    var _a, _b;
    var metadata = artifactMetadata(probeArtifact);
    var probeJson = asRecord(metadata.probeJson);
    return (_b = (_a = asNumber(metadata.fps)) !== null && _a !== void 0 ? _a : asNumber(probeJson.fps)) !== null && _b !== void 0 ? _b : asNumber(probeJson.avgFrameRate);
}
function hasFallbackEvidence(artifacts) {
    return artifacts.some(function (artifact) {
        var metadata = artifactMetadata(artifact);
        return metadata.fallbackRender === true
            || metadata.fallbackRenderer === true
            || metadata.ffmpegAssFallback === true
            || asString(metadata.rendererMode) === "ffmpeg_ass_fallback"
            || asString(metadata.runtimeMode) === "fallback";
    });
}
function hasOfficialRuntimeEvidence(doctorArtifact) {
    var metadata = artifactMetadata(doctorArtifact);
    var doctorJson = asRecord(metadata.doctorJson);
    return metadata.officialHyperframesRuntime === true
        || doctorJson.officialHyperframesRuntime === true
        || asString(metadata.runtimeKind) === "official_hyperframes"
        || asString(doctorJson.runtimeKind) === "official_hyperframes";
}
function ensureAssignmentAttemptMatches(job, artifacts, now) {
    var expectedAssignmentAttempt = getExpectedAssignmentAttempt(job);
    if (!expectedAssignmentAttempt) {
        fail({
            job: job,
            artifacts: artifacts,
            now: now,
            code: "assignment_attempt_missing",
            message: "Worker output cannot be verified because the assignment attempt is missing.",
        });
    }
    for (var _i = 0, artifacts_1 = artifacts; _i < artifacts_1.length; _i++) {
        var artifact = artifacts_1[_i];
        var actualAttempt = asString(artifactMetadata(artifact).assignmentAttempt);
        if (actualAttempt !== expectedAssignmentAttempt) {
            fail({
                job: job,
                artifacts: artifacts,
                now: now,
                code: "stale_assignment_attempt",
                message: "Worker output belongs to an old assignment and was rejected.",
            });
        }
    }
}
function verifyHyperframesWorkerArtifacts(input) {
    var _a;
    var now = (_a = input.now) !== null && _a !== void 0 ? _a : new Date();
    if (input.job.jobType !== "hyperframes_final_composite") {
        return reportBase({
            job: input.job,
            artifacts: input.artifacts,
            now: now,
            status: "passed",
            safeMessage: "Not a HyperFrames final composite job.",
            publishableArtifactIds: input.artifacts.map(function (artifact) { return artifact.id; }),
        });
    }
    ensureAssignmentAttemptMatches(input.job, input.artifacts, now);
    var missing = exports.HYPERFRAMES_WORKER_REQUIRED_ARTIFACT_TYPES
        .filter(function (artifactType) { return !findArtifact(input.artifacts, artifactType); });
    if (missing.length > 0) {
        fail({
            job: input.job,
            artifacts: input.artifacts,
            now: now,
            code: "missing_required_artifact",
            message: "HyperFrames output is missing required artifact: ".concat(missing[0]),
        });
    }
    var finalVideo = findArtifact(input.artifacts, "hyperframes_final_video");
    var manifest = findArtifact(input.artifacts, "hyperframes_render_manifest");
    var doctor = findArtifact(input.artifacts, "hyperframes_runtime_doctor");
    var probe = findArtifact(input.artifacts, "hyperframes_probe_report");
    var finalMetadata = artifactMetadata(finalVideo);
    var finalChecksum = normalizeHash(finalMetadata.checksumSha256);
    var manifestChecksum = readManifestFinalChecksum(manifest);
    var durationSec = readProbeDuration(probe);
    var aspectRatio = readProbeAspectRatio(probe);
    var fps = readProbeFps(probe);
    if (normalizeContentType(finalMetadata.contentType) !== "video/mp4") {
        fail({
            job: input.job,
            artifacts: input.artifacts,
            now: now,
            code: "final_video_mime_mismatch",
            message: "HyperFrames final video must be an MP4 file.",
            finalVideoChecksumSha256: finalChecksum,
        });
    }
    var finalVideoSizeBytes = asPositiveInteger(finalMetadata.sizeBytes);
    if (!finalVideoSizeBytes || finalVideoSizeBytes < exports.HYPERFRAMES_FINAL_VIDEO_MIN_BYTES) {
        fail({
            job: input.job,
            artifacts: input.artifacts,
            now: now,
            code: "final_video_size_invalid",
            message: "HyperFrames final video is too small to be a valid MP4 output.",
            finalVideoChecksumSha256: finalChecksum,
            durationSec: durationSec,
            aspectRatio: aspectRatio,
            fps: fps,
        });
    }
    if (!finalChecksum || !manifestChecksum || finalChecksum !== manifestChecksum) {
        fail({
            job: input.job,
            artifacts: input.artifacts,
            now: now,
            code: "final_video_hash_mismatch",
            message: "HyperFrames final video hash does not match the render manifest. (final: ".concat(String(finalChecksum), ", manifest: ").concat(String(manifestChecksum), ")"),
            finalVideoChecksumSha256: finalChecksum,
        });
    }
    if (!hasOfficialRuntimeEvidence(doctor)) {
        fail({
            job: input.job,
            artifacts: input.artifacts,
            now: now,
            code: "official_runtime_missing",
            message: "HyperFrames official runtime evidence is missing.",
            finalVideoChecksumSha256: finalChecksum,
        });
    }
    if (hasFallbackEvidence(input.artifacts)) {
        fail({
            job: input.job,
            artifacts: input.artifacts,
            now: now,
            code: "fallback_output_rejected",
            message: "Fallback-rendered output was rejected. Render again with the official HyperFrames runtime.",
            finalVideoChecksumSha256: finalChecksum,
        });
    }
    if (!durationSec || durationSec <= 0 || durationSec > limits_1.HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC + 1) {
        fail({
            job: input.job,
            artifacts: input.artifacts,
            now: now,
            code: "duration_probe_invalid",
            message: "HyperFrames probe report has an invalid duration.",
            finalVideoChecksumSha256: finalChecksum,
            durationSec: durationSec,
            aspectRatio: aspectRatio,
            fps: fps,
        });
    }
    var expectedDurationSec = getExpectedDurationSec(input.job);
    if (expectedDurationSec && Math.abs(durationSec - expectedDurationSec) > Math.max(2, expectedDurationSec * 0.03)) {
        fail({
            job: input.job,
            artifacts: input.artifacts,
            now: now,
            code: "duration_mismatch",
            message: "HyperFrames output duration does not match the requested final composite length.",
            finalVideoChecksumSha256: finalChecksum,
            durationSec: durationSec,
            aspectRatio: aspectRatio,
            fps: fps,
        });
    }
    var expectedAspectRatio = getExpectedAspectRatio(input.job);
    if (expectedAspectRatio && aspectRatio && aspectRatio !== expectedAspectRatio) {
        fail({
            job: input.job,
            artifacts: input.artifacts,
            now: now,
            code: "aspect_ratio_mismatch",
            message: "HyperFrames output aspect ratio does not match the requested render.",
            finalVideoChecksumSha256: finalChecksum,
            durationSec: durationSec,
            aspectRatio: aspectRatio,
            fps: fps,
        });
    }
    var expectedFps = getExpectedFps(input.job);
    if (expectedFps && fps && Math.abs(fps - expectedFps) > 0.75) {
        fail({
            job: input.job,
            artifacts: input.artifacts,
            now: now,
            code: "fps_mismatch",
            message: "HyperFrames output frame rate does not match the requested render.",
            finalVideoChecksumSha256: finalChecksum,
            durationSec: durationSec,
            aspectRatio: aspectRatio,
            fps: fps,
        });
    }
    return reportBase({
        job: input.job,
        artifacts: input.artifacts,
        now: now,
        status: "passed",
        safeMessage: "HyperFrames output passed server verification.",
        publishableArtifactIds: [finalVideo.id],
        finalVideoChecksumSha256: finalChecksum,
        durationSec: durationSec,
        aspectRatio: aspectRatio,
        fps: fps,
    });
}
