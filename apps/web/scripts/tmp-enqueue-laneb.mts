import { createHash } from "node:crypto";
import { queueRemotionRenderVideoJob } from "../server/services/workerSchedulerService";
import { isRedisHealthy, isRedisAvailable, closeRedis } from "../server/services/redis";
import {
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
} from "../shared/workerRuntime";

const CLIP = "https://smartaihub.app/laneb-test-clip.mp4";
const SHA = process.env.CLIP_SHA!;
const FPS = 30, W = 1080, H = 1920, FRAMES = 60; // 2s

const template = {
  id: "laneb-smoke", name: "Lane B smoke test",
  width: W, height: H, fps: FPS, durationInFrames: FRAMES,
  layers: [
    { id: "clip1", type: "video", startFrame: 0, durationFrames: FRAMES,
      x: 0, y: 0, width: 100, height: 100, rotationDeg: 0, opacity: 1, zIndex: 1,
      src: CLIP, trimStartSec: 0, volume: 1, muted: false },
    { id: "title", type: "text", startFrame: 0, durationFrames: FRAMES,
      x: 8, y: 8, width: 84, height: 10, rotationDeg: 0, opacity: 1, zIndex: 5,
      content: "Lane B · Remotion OK", fontSizePx: 56, color: "#ffffff",
      fontFamily: "Noto Sans Thai", textAlign: "center", fontWeight: "bold" },
  ],
};
const templateHash = createHash("sha256").update(JSON.stringify(template)).digest("hex");

const input = {
  kind: "remotion_render_video" as const, schemaVersion: 1 as const,
  platformContractVersion: REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  rendererPolicyVersion: REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
  videoProjectId: "laneb-smoke-" + Date.now(),
  projectRevision: 1,
  traceId: "laneb-smoke-" + Date.now(),
  renderProfile: { profile: "final" as const, width: W, height: H, fps: FPS,
                   codec: "h264" as const, loudnessNormalize: true, burnInAssCaptions: true },
  remotionTemplate: template,
  compositionId: "GenericTemplate" as const,
  assetManifest: { sources: [{ role: "video" as const, url: CLIP, sha256: SHA }] },
  postPasses: ["loudnorm", "ass_burn"] as const,
  segmentPlan: null,
  remotionTemplateHash: templateHash,
  durationInFrames: FRAMES,
  captionLines: [
    { startSec: 0.0, endSec: 1.0, text: "ทดสอบซับไตเติลภาษาไทย" },
    { startSec: 1.0, endSec: 2.0, text: "Lane B render works" },
  ],
  captionPresetId: "classic_box" as const,
};

async function main(){
  for (let i=0;i<30 && !isRedisAvailable();i++){ await isRedisHealthy().catch(()=>false); await new Promise(r=>setTimeout(r,200)); }
  console.log("redis available:", isRedisAvailable());
const res = await queueRemotionRenderVideoJob({
  ...(input as any),
  tenantId: "tenant-ZCSKEM9s",
  requestedByUserId: 1,
  isAdminRequester: true,
});
console.log(JSON.stringify(res, null, 2));
}
main().then(async ()=>{ await closeRedis().catch(()=>{}); process.exit(0); }).catch(e=>{console.error("ENQUEUE FAILED:", e?.message||e);process.exit(1);});
