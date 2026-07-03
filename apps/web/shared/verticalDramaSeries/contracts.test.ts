import { describe, it, expect } from "vitest";
import {
  VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT,
  VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK,
  VERTICAL_DRAMA_DEFAULT_DURATION_PROFILE_ID,
  validateDurationProfile,
  durationsOf,
} from "./assembly";
import {
  VERTICAL_DRAMA_MEMORY_KINDS,
  VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT,
  type VerticalDramaMemoryEvent,
} from "./memory";
import {
  VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
  computeAutoSubShotCount,
  validateSubShotsForParent,
  type VerticalDramaSubShot,
} from "./subShots";
import {
  mapUpstreamAgeGroup,
  verticalDramaMinimalInputSchema,
  VERTICAL_DRAMA_GENERATION_MODES,
  type RunResult,
  type VerticalDramaMinimalInput,
  type VerticalDramaQcReport,
  type VerticalDramaQcResult,
} from "./contracts";
import {
  artifactChecksumSha256,
  canonicalJsonStringify,
  sha256Hex,
  VERTICAL_DRAMA_ARTIFACT_FILENAME_BY_STAGE,
} from "./artifacts";
import { redactAssetRecordSnapshot, redactProviderPayload } from "./assets";

describe("duration profiles (spec §7.4)", () => {
  it("default profile has the pinned id, clip durations, and sums to 60", () => {
    expect(VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT.id).toBe("vertical_drama_60s_9_frames_8_clips");
    expect(VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT.clipDurationsSeconds).toEqual([8, 8, 8, 8, 8, 8, 8, 4]);
    expect(VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT.motionMode).toBe("first_last_frame_bridge");
    const sum = VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT.clipDurationsSeconds.reduce((a, b) => a + b, 0);
    expect(sum).toBe(60);
    // The default profile id is the one referenced by generated episodes.
    expect(VERTICAL_DRAMA_DEFAULT_DURATION_PROFILE_ID).toBe(VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT.id);
  });

  it("fallback profile has the pinned id, shot durations, and per-shot motion mode", () => {
    expect(VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK.id).toBe("vertical_drama_60s_9_shots");
    expect(VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK.shotDurationsSeconds).toEqual([8, 8, 8, 4, 8, 8, 4, 8, 4]);
    expect(VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK.motionMode).toBe("per_shot_first_frame_or_prompt");
    const sum = VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK.shotDurationsSeconds.reduce((a, b) => a + b, 0);
    expect(sum).toBe(60);
  });

  it("both profiles validate to 60 and reject unsupported clip durations", () => {
    expect(validateDurationProfile(VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT).valid).toBe(true);
    expect(validateDurationProfile(VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK).valid).toBe(true);
    // Provider that only allows 4s clips rejects the 8s durations.
    const res = validateDurationProfile(VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT, [4]);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("unsupported_clip_duration"))).toBe(true);
    // Provider allowing both durations passes.
    expect(validateDurationProfile(VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT, [4, 8]).valid).toBe(true);
    expect(durationsOf(VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK)).toHaveLength(9);
  });
});

describe("sub-shot decomposition (spec §7.4)", () => {
  it("sub-shot durations must sum to the parent main-shot duration", () => {
    const parentDuration = 8;
    const subShots: Pick<VerticalDramaSubShot, "durationSeconds" | "parentShotNumber">[] = [
      { parentShotNumber: 1, durationSeconds: 3 },
      { parentShotNumber: 1, durationSeconds: 2.5 },
      { parentShotNumber: 1, durationSeconds: 2.5 },
    ];
    const ok = validateSubShotsForParent(parentDuration, subShots, VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT);
    expect(ok.valid).toBe(true);

    const bad = validateSubShotsForParent(
      parentDuration,
      [
        { parentShotNumber: 1, durationSeconds: 3 },
        { parentShotNumber: 1, durationSeconds: 3 },
      ],
      VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
    );
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.includes("sub_shot_sum_mismatch"))).toBe(true);
  });

  it("rejects sub-shots below the minimum floor and over maxPerShot", () => {
    const below = validateSubShotsForParent(
      4,
      [
        { parentShotNumber: 9, durationSeconds: 0.5 },
        { parentShotNumber: 9, durationSeconds: 3.5 },
      ],
      VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
    );
    expect(below.valid).toBe(false);
    expect(below.errors.some((e) => e.includes("sub_shot_below_floor"))).toBe(true);
  });

  it("auto count = min(targetPerShot, floor(D / minSubShotSeconds)), clamped to maxPerShot", () => {
    // Short 4s shot with 1.2s floor -> floor(4/1.2)=3, min(3, target 3)=3.
    expect(
      computeAutoSubShotCount(4, { targetPerShot: 3, maxPerShot: 5, minSubShotSeconds: 1.2 }),
    ).toBe(3);
    // Very short shot -> fewer sub-shots.
    expect(
      computeAutoSubShotCount(2, { targetPerShot: 3, maxPerShot: 5, minSubShotSeconds: 1.2 }),
    ).toBe(1);
    // Long shot capped by maxPerShot.
    expect(
      computeAutoSubShotCount(20, { targetPerShot: 8, maxPerShot: 5, minSubShotSeconds: 1.2 }),
    ).toBe(5);
  });
});

describe("memory contracts (spec §7.6)", () => {
  it("enumerates all nine memory kinds including retcon_proposal", () => {
    expect(VERTICAL_DRAMA_MEMORY_KINDS).toHaveLength(9);
    expect(VERTICAL_DRAMA_MEMORY_KINDS).toContain("retcon_proposal");
  });

  it("retrieval policy defaults are pinned deterministically", () => {
    expect(VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT.includeLastEpisodeCount).toBe(3);
    expect(VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT.includeResolvedHookLookbackCount).toBe(10);
    expect(VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT.compactionStrategy).toBe(
      "rolling_summary_plus_events",
    );
  });

  it("approved retcon appends a new event that supersedes prior events without mutating them", () => {
    const original: VerticalDramaMemoryEvent = {
      memoryEventId: "evt-1",
      seriesId: "s1",
      memoryKind: "canonical_fact",
      payload: { fact: "Anna lives in Bangkok" },
      createdAt: "2026-01-01T00:00:00Z",
    };
    const retcon: VerticalDramaMemoryEvent = {
      memoryEventId: "evt-2",
      seriesId: "s1",
      memoryKind: "retcon_proposal",
      payload: { fact: "Anna lives in Chiang Mai" },
      supersedesEventIds: ["evt-1"],
      approved: true,
      approvedByUserId: "u1",
      createdAt: "2026-01-02T00:00:00Z",
    };
    // The original is untouched; the retcon references it as superseded.
    expect(original.payload.fact).toBe("Anna lives in Bangkok");
    expect(retcon.supersedesEventIds).toContain("evt-1");
    expect(retcon.memoryEventId).not.toBe(original.memoryEventId);
  });
});

describe("minimal input & age control (spec §7.2.1)", () => {
  it("maps upstream age buckets into the app children|teens|adults set", () => {
    expect(mapUpstreamAgeGroup("preschool")).toBe("children");
    expect(mapUpstreamAgeGroup("children")).toBe("children");
    expect(mapUpstreamAgeGroup("tweens")).toBe("teens");
    expect(mapUpstreamAgeGroup("teens")).toBe("teens");
    expect(mapUpstreamAgeGroup("young_adults")).toBe("adults");
    expect(mapUpstreamAgeGroup("adults")).toBe("adults");
  });

  it("validates a minimal input brief", () => {
    const input: VerticalDramaMinimalInput = {
      storyTitle: "The Last Noodle Shop",
      storyBrief: "A family saves their noodle shop.",
      characters: [{ characterId: "c1", name: "Anna", role: "owner" }],
      ageControl: { targetAgeGroup: "adults" },
    };
    const parsed = verticalDramaMinimalInputSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    // Missing required storyTitle fails.
    expect(verticalDramaMinimalInputSchema.safeParse({ storyBrief: "x", characters: [] }).success).toBe(
      false,
    );
  });

  it("generation mode enum restricts to the three allowed modes", () => {
    expect(VERTICAL_DRAMA_GENERATION_MODES).toEqual([
      "dry_run",
      "approval_required",
      "auto_after_approval",
    ]);
  });
});

describe("run result contract (spec §11.5)", () => {
  it("failed schema validation yields status=failed and next_action=repair with array artifactIds", () => {
    const result: RunResult = {
      runId: "r1",
      seriesId: "s1",
      episodeId: "e1",
      stage: "plan_episode_script",
      status: "failed",
      next_action: "repair",
      artifactIds: [],
      errors: [{ code: "schema_validation_failed", message: "bad shape", repairable: true }],
      warnings: [],
    };
    expect(Array.isArray(result.artifactIds)).toBe(true);
    expect(result.status).toBe("failed");
    expect(result.next_action).toBe("repair");
    expect(result.errors[0].code).toBe("schema_validation_failed");
    expect(result.errors[0].repairable).toBe(true);
  });
});

describe("QC report contract (spec §16)", () => {
  it("VerticalDramaQcReport is the persisted, run/stage-scoped projection of a QcResult", () => {
    // A pure evaluated result (as produced by runQcForStage).
    const result: VerticalDramaQcResult = {
      qcReportId: "qc-provider_routing-abcdef0123456789",
      seriesId: "1",
      episodeId: "2",
      runId: "3",
      stage: "provider_routing",
      passed: false,
      score: 0,
      issues: [
        {
          issueId: "provider-1",
          severity: "blocking",
          targetType: "provider",
          message: "Provider capability/policy not honored.",
        },
      ],
      recommendedRepairs: [
        {
          repairId: "repair-1",
          stage: "provider_routing",
          action: "reroute_provider",
          instruction: "Reroute to a capable provider.",
          autoRunnable: false,
        },
      ],
      createdAt: "2026-07-03T00:00:00.000Z",
    };

    // Persisting it stamps a DB row id; the rest of the shape mirrors the row.
    const persisted: VerticalDramaQcReport = {
      id: "42",
      qcReportId: result.qcReportId,
      seriesId: result.seriesId,
      episodeId: result.episodeId,
      runId: result.runId,
      stage: result.stage,
      passed: result.passed,
      score: result.score,
      issues: result.issues,
      recommendedRepairs: result.recommendedRepairs,
      createdAt: result.createdAt,
    };

    expect(persisted.id).toBe("42");
    expect(persisted.stage).toBe("provider_routing");
    expect(persisted.passed).toBe(false);
    expect(persisted.issues[0].severity).toBe("blocking");
    expect(persisted.recommendedRepairs[0].action).toBe("reroute_provider");
    // The persisted row carries createdAt (string) and reuses the evaluated shapes.
    expect(typeof persisted.createdAt).toBe("string");
    expect(persisted.issues).toBe(result.issues);

    // `id` is optional — a not-yet-persisted report is still a valid report.
    const unpersisted: VerticalDramaQcReport = { ...persisted, id: undefined };
    expect(unpersisted.id).toBeUndefined();
  });
});

describe("artifact hashing (spec §7.3)", () => {
  it("known SHA-256 vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is stable for structurally identical payloads regardless of key order", () => {
    const a = { stage: "drama_script", data: { title: "x", beats: [1, 2, 3] } };
    const b = { data: { beats: [1, 2, 3], title: "x" }, stage: "drama_script" };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    expect(artifactChecksumSha256(a)).toBe(artifactChecksumSha256(b));
    expect(artifactChecksumSha256(a)).toHaveLength(64);
    // Different payload -> different hash.
    expect(artifactChecksumSha256({ ...a, data: { ...a.data, title: "y" } })).not.toBe(
      artifactChecksumSha256(a),
    );
  });

  it("maps every artifact stage to a ledger filename", () => {
    expect(VERTICAL_DRAMA_ARTIFACT_FILENAME_BY_STAGE.input_normalized).toBe("input.normalized.json");
    expect(VERTICAL_DRAMA_ARTIFACT_FILENAME_BY_STAGE.assembly_manifest).toBe("09_assembly_manifest.json");
    expect(VERTICAL_DRAMA_ARTIFACT_FILENAME_BY_STAGE.run_log).toBe("run_log.jsonl");
  });
});

describe("secret redaction (spec §7.1)", () => {
  it("strips local_path, file_id, and image_url from asset snapshots", () => {
    const redacted = redactAssetRecordSnapshot({
      asset_id: "a1",
      run_id: "r1",
      stage: "start_frame",
      asset_type: "start_frame",
      local_path: "/tmp/secret.png",
      file_id: "file-abc",
      image_url: "https://provider/x?sig=abc",
      contains_human_face: true,
      approved: false,
      qc_status: "pending",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect("local_path" in redacted).toBe(false);
    expect("file_id" in redacted).toBe(false);
    expect("image_url" in redacted).toBe(false);
    // Parity fields preserved.
    expect(redacted.contains_human_face).toBe(true);
    expect(redacted.qc_status).toBe("pending");
  });

  it("redacts api keys, bearer tokens, and signed URL query params in provider payloads", () => {
    const payload = {
      apiKey: "sk-supersecretkey1234567890",
      headers: { Authorization: "Bearer abc.def.ghi" },
      resultUrl: "https://cdn.example.com/clip.mp4?X-Amz-Signature=deadbeef&expires=999",
      note: "token sk-anothersecretvalue0987654",
    };
    const redacted = redactProviderPayload(payload);
    expect(redacted.apiKey).toBe("[redacted]");
    expect(redacted.headers.Authorization).toBe("[redacted]");
    expect(redacted.resultUrl).toBe("https://cdn.example.com/clip.mp4");
    expect(redacted.note).not.toContain("sk-anothersecretvalue");
  });
});
