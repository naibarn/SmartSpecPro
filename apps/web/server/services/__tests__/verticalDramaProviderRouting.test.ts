import { describe, it, expect } from "vitest";
import {
  resolveVideoModelsFromList,
  resolveVideoModelId,
  deriveVideoCapabilities,
  detectProviderFamily,
  routeVideo,
  planBridgeClipJobs,
  planFallbackClipJobs,
  chooseDurationProfile,
  decomposeSubShots,
  redactProviderPayload,
  mapProviderError,
  MockVideoProvider,
  ExternalImageToVideoProvider,
  VeoCompatibleVideoProvider,
  VerticalDramaProviderJobLifecycle,
  planProviderRouting,
  VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY,
  VERTICAL_DRAMA_BRIDGE_TIMING_SECONDS,
  VERTICAL_DRAMA_VIDEO_MODEL_ALIASES,
  VD_PROVIDER_ERROR_CODES,
  type VerticalDramaTenantProviderPolicy,
} from "../verticalDramaProviderRouting";
import { getStaticFallbackModels, type ModelDefinition } from "../modelRegistry";
import { VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT } from "@shared/verticalDramaSeries";

const staticModels = getStaticFallbackModels();
const videoModels = staticModels.filter((m) => m.type === "video");
const veoLite = staticModels.find((m) => m.id === "veo3/generate-veo-3-video-lite")!;
const sora = staticModels.find((m) => m.id === "sora-2")!;
const geminiOmni = staticModels.find((m) => m.id === "gemini-omni-video")!;

describe("resolveVideoModels", () => {
  it("lists every enabled compatible video model with capability metadata", () => {
    const res = resolveVideoModelsFromList(videoModels);
    expect(res.models.length).toBe(videoModels.filter((m) => m.isEnabled !== false).length);
    for (const m of res.models) {
      expect(m.capabilities.supportsVideoGeneration).toBe(true);
      expect(Array.isArray(m.supportedMotionModes)).toBe(true);
    }
  });

  it("defaults to the requested/first model", () => {
    const res = resolveVideoModelsFromList(videoModels, { defaultModelId: "veo3/generate-veo-3-video-lite" });
    expect(res.defaultModelId).toBe("veo3/generate-veo-3-video-lite");
    expect(res.models[0].isDefault).toBe(true);
  });
});

describe("alias resolution", () => {
  it("resolves aliases for Veo, Gemini Omni, and Grok Imagine", () => {
    expect(resolveVideoModelId("veo 3.1 lite")).toBe("veo3/generate-veo-3-video-lite");
    expect(resolveVideoModelId("gemini omni")).toBe("gemini-omni-video");
    expect(resolveVideoModelId("grok video 3")).toBeDefined();
  });
  it("defines Seedance + Grok Imagine 1.5 alias groups", () => {
    expect(VERTICAL_DRAMA_VIDEO_MODEL_ALIASES["seedance"]).toContain("seedance");
    expect(VERTICAL_DRAMA_VIDEO_MODEL_ALIASES["grok imagine"]).toContain("grok imagine 1.5");
  });
});

describe("capability derivation", () => {
  it("detects Veo family + first/last-frame support + native audio", () => {
    expect(detectProviderFamily(veoLite)).toBe("veo");
    const caps = deriveVideoCapabilities(veoLite);
    expect(caps.supportsFirstLastFrameVideo).toBe(true);
    expect(caps.supportsNativeAudio).toBe(true);
    expect(caps.allowedAspectRatios).toContain("9:16");
  });

  it("keeps OpenAI Sora human-face input gated off by default", () => {
    expect(detectProviderFamily(sora)).toBe("openai");
    const caps = deriveVideoCapabilities(sora);
    expect(caps.supportsHumanFaceInputReference).toBe(false);
    expect(caps.supportsFirstLastFrameVideo).toBe(false);
  });

  it("enables OpenAI face bridge only under explicit policy opt-in", () => {
    const policy: VerticalDramaTenantProviderPolicy = {
      ...VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY,
      openAiHumanFaceBridgeEnabled: true,
    };
    const caps = deriveVideoCapabilities(sora, policy);
    expect(caps.supportsHumanFaceInputReference).toBe(true);
  });
});

describe("routeVideo gating", () => {
  it("allows the first/last-frame bridge only when capabilities match", () => {
    const decision = routeVideo({
      model: veoLite,
      requestedMotionMode: "first_last_frame_bridge",
      containsHumanFace: true,
      requireFirstLastFrame: true,
      requireNativeAudio: true,
      aspectRatio: "9:16",
      clipDurationsSeconds: [8],
      prompt: "hero turns",
    });
    expect(decision.recommended_provider_path).toBe("veo_first_last_frame");
    expect(decision.normalizedStatus).toBe("ready");
    expect(decision.execution_status).toBe("ready");
  });

  it("routes OpenAI human-face bridge to manual review (never silent)", () => {
    const decision = routeVideo({
      model: sora,
      requestedMotionMode: "first_last_frame_bridge",
      containsHumanFace: true,
      requireFirstLastFrame: true,
      requireNativeAudio: false,
      aspectRatio: "9:16",
      clipDurationsSeconds: [8],
      prompt: "hero turns",
    });
    expect(decision.normalizedStatus).toBe("manual_review_required");
    expect(decision.execution_status).toBe("manual_review_required");
    expect(decision.blockingReasons).toContain("openai_human_face_bridge_gated");
  });

  it("preserves raw upstream status separately from normalized app status", () => {
    const policy: VerticalDramaTenantProviderPolicy = {
      ...VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY,
      allowPromptOnlyFallback: true,
    };
    const decision = routeVideo({
      model: geminiOmni, // no first/last support
      policy,
      requestedMotionMode: "first_last_frame_bridge",
      containsHumanFace: false,
      requireFirstLastFrame: true,
      requireNativeAudio: false,
      aspectRatio: "9:16",
      clipDurationsSeconds: [8],
      prompt: "x",
    });
    expect(decision.execution_status).toBe("fallback_text_to_video");
    expect(decision.normalizedStatus).toBe("fallback_prompt_only");
    // raw + normalized round-trip separately on the snapshot too.
    expect(decision.provider_request.execution_status).toBe("fallback_text_to_video");
    expect(decision.provider_request.normalizedStatus).toBe("fallback_prompt_only");
  });

  it("blocks when prompt-only fallback is disallowed and F/L unsupported", () => {
    const policy: VerticalDramaTenantProviderPolicy = {
      ...VERTICAL_DRAMA_DEFAULT_PROVIDER_POLICY,
      allowPromptOnlyFallback: false,
    };
    const decision = routeVideo({
      model: geminiOmni,
      policy,
      requestedMotionMode: "first_last_frame_bridge",
      containsHumanFace: false,
      requireFirstLastFrame: true,
      requireNativeAudio: false,
      aspectRatio: "9:16",
      clipDurationsSeconds: [8],
      prompt: "x",
    });
    expect(decision.normalizedStatus).toBe("blocked");
  });
});

describe("bridge + fallback duration profiles", () => {
  it("default bridge profile: 8 jobs from 9 frames with 8+8+8+8+8+8+8+4 timing", () => {
    const jobs = planBridgeClipJobs(9);
    expect(jobs.length).toBe(8);
    expect(jobs.map((j) => j.durationSeconds)).toEqual([...VERTICAL_DRAMA_BRIDGE_TIMING_SECONDS]);
    const total = jobs.reduce((a, j) => a + j.durationSeconds, 0);
    expect(total).toBe(60);
    // each job bridges frame i -> i+1
    expect(jobs[0].sourceFrameNumbers).toEqual([1, 2]);
  });

  it("fallback profile: 9 clips for providers without first/last support", () => {
    const caps = deriveVideoCapabilities(geminiOmni);
    const profile = chooseDurationProfile(caps);
    expect(profile.profileId).toBe("vertical_drama_60s_9_shots");
    expect(profile.jobs.length).toBe(9);
    expect(profile.jobs.reduce((a, j) => a + j.durationSeconds, 0)).toBe(60);
    expect(planFallbackClipJobs().length).toBe(9);
  });
});

describe("sub-shot decomposition + capability gate", () => {
  // 9 shots summing to 60s (the fallback profile schedule).
  const shots = [8, 8, 8, 4, 8, 8, 4, 8, 4].map((durationSeconds, i) => ({
    shotNumber: i + 1,
    durationSeconds,
  }));

  it("decomposes into sub-shots that sum to the parent (supporting provider)", () => {
    // A provider that can render short cuts (floor <= minSubShotSeconds).
    const caps = { ...deriveVideoCapabilities(veoLite), allowedVideoSeconds: [1, 2, 4, 8], supportsImageReferences: true };
    const policy = { ...VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT, enabled: true };
    const plan = decomposeSubShots(shots, policy, caps);
    expect(plan.valid).toBe(true);
    for (const ps of plan.shots) {
      const sum = ps.subShots.reduce((a, s) => a + s.durationSeconds, 0);
      expect(sum).toBeCloseTo(ps.mainShotDurationSeconds, 6);
    }
    // episode total unchanged
    const total = plan.shots.reduce((a, ps) => a + ps.mainShotDurationSeconds, 0);
    expect(total).toBe(60);
  });

  it("degrades and records blocking reasons when the provider floor is too high", () => {
    const caps = deriveVideoCapabilities(veoLite);
    // Force an infeasible min-duration floor via allowedVideoSeconds min.
    const highFloorCaps = { ...caps, allowedVideoSeconds: [8] };
    const policy = { ...VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT, enabled: true, targetPerShot: 3 };
    const plan = decomposeSubShots(shots, policy, highFloorCaps);
    expect(plan.provider_feasibility.blocking_reasons.length).toBeGreaterThan(0);
  });
});

describe("redaction + error mapping", () => {
  it("redacts secrets and strips signed-URL query strings", () => {
    const redacted = redactProviderPayload({
      api_key: "sk-secret",
      authorization: "Bearer abc",
      url: "https://cdn.example.com/video.mp4?X-Goog-Signature=abc123&exp=999",
      nested: { token: "t", ok: "keep" },
    }) as any;
    expect(redacted.api_key).toBe("[REDACTED]");
    expect(redacted.authorization).toBe("[REDACTED]");
    expect(redacted.nested.token).toBe("[REDACTED]");
    expect(redacted.nested.ok).toBe("keep");
    expect(redacted.url).toBe("https://cdn.example.com/video.mp4?[REDACTED]");
  });

  it("maps raw provider errors to stable app error codes", () => {
    expect(mapProviderError({ message: "request timed out" }).errorCode).toBe(VD_PROVIDER_ERROR_CODES.TIMEOUT);
    expect(mapProviderError({ status: 429 }).errorCode).toBe(VD_PROVIDER_ERROR_CODES.RATE_LIMITED);
    expect(mapProviderError({ message: "human face not allowed" }).errorCode).toBe(VD_PROVIDER_ERROR_CODES.FACE_INPUT_NOT_ALLOWED);
    expect(mapProviderError({ message: "weird" }).errorCode).toBe(VD_PROVIDER_ERROR_CODES.UNKNOWN);
  });
});

describe("adapters + lifecycle", () => {
  it("MockVideoProvider is deterministic without keys", async () => {
    const mock = new MockVideoProvider();
    const req = {
      raw: {},
      normalized: {
        provider: "mock",
        motionMode: "first_last_frame_bridge",
        prompt: "hero",
        durationSeconds: 8,
        aspectRatio: "9:16" as const,
      },
    };
    const a = await mock.createClip(req);
    const b = await mock.createClip(req);
    expect(a.providerJobId).toBe(b.providerJobId);
    const job = await mock.getJob(a.providerJobId);
    expect(job.status).toBe("succeeded");
  });

  it("ExternalImageToVideoProvider is unavailable until explicit config", async () => {
    const caps = deriveVideoCapabilities(geminiOmni);
    const notConfigured = new ExternalImageToVideoProvider({ providerId: "ext", capabilities: caps });
    expect(notConfigured.available).toBe(false);
    await expect(
      notConfigured.createClip({ raw: {}, normalized: { provider: "ext", motionMode: "image_to_video", prompt: "x", durationSeconds: 8, aspectRatio: "9:16" } }),
    ).rejects.toThrow(/NOT_CONFIGURED/);
  });

  it("covers create -> poll -> download -> cancel -> retry", async () => {
    const lifecycle = new VerticalDramaProviderJobLifecycle(new MockVideoProvider(), { now: () => new Date(0) });
    const req = { raw: {}, normalized: { provider: "mock", motionMode: "text_to_video", prompt: "x", durationSeconds: 8, aspectRatio: "9:16" as const } };
    const created = await lifecycle.create(req);
    expect(created.status).toBe("queued");
    const polled = await lifecycle.poll(created);
    expect(polled.status).toBe("succeeded");
    const dl = await lifecycle.download(polled);
    expect(dl.normalized.checksumSha256).toBeTruthy();
    const cancelled = await lifecycle.cancel(created);
    expect(cancelled.status).toBe("cancelled");
    const retried = await lifecycle.retry(created, req);
    expect(retried.retryOfProviderJobId).toBe(created.providerJobId);
  });

  it("transitions a job past its timeout to timed_out and keeps it repairable", async () => {
    let now = new Date("2020-01-01T00:00:00Z");
    const lifecycle = new VerticalDramaProviderJobLifecycle(new MockVideoProvider(), {
      timeoutSeconds: 60,
      now: () => now,
    });
    const job = {
      providerJobId: "j1",
      status: "running" as const,
      provider: "mock",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    now = new Date("2020-01-01T01:00:00Z"); // 1 hour later
    const polled = await lifecycle.poll(job);
    expect(polled.status).toBe("timed_out");
    expect(polled.errorCode).toBe(VD_PROVIDER_ERROR_CODES.TIMEOUT);
    expect(VerticalDramaProviderJobLifecycle.isRepairable(polled)).toBe(true);
  });
});

describe("planProviderRouting", () => {
  it("produces a decision + duration profile + credit estimate", () => {
    const plan = planProviderRouting({ model: veoLite, prompt: "x" });
    expect(plan.decision.provider).toBe("kie.ai");
    expect(plan.durationProfileId).toBe("veo31_first_last_bridge_60s");
    expect(plan.clipJobs.length).toBe(8);
    expect(plan.creditEstimate.estimatedCredits).toBe(veoLite.creditCost * 8);
  });

  it("emits sub-shot clip jobs carrying parent + sub numbers when the flag is on", () => {
    const plan = planProviderRouting({
      model: veoLite,
      prompt: "x",
      subShots: { flagOn: true },
    });
    expect(plan.subShotPlan).toBeDefined();
    expect(plan.clipJobs.some((j) => j.clipNumber >= 100)).toBe(true);
  });
});
