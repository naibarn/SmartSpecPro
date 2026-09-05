import { invoke } from "@tauri-apps/api/core";
import { exportToCapCutDraftJson, type SmartSpecProjectDraft } from "../../types/nleProject";

export function parseProjectDraft(json: string): SmartSpecProjectDraft {
  const project = JSON.parse(json);
  if (project && project.version === "1.0") {
    project.version = "1.0.0";
  }
  const finite = (value: unknown, min = 0) => typeof value === "number" && Number.isFinite(value) && value >= min;
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const trackTypes = new Set(["video_main", "video_broll", "code_overlay", "text_subtitle", "audio_voice", "audio_music", "audio_sfx"]);
  const sourceTypes = new Set(["local_file", "smartaihub_library", "generated_code", "text"]);
  const clipIds = new Set<string>();

  const validClip = (clip: any, depth = 0): boolean => {
    if (!clip || depth > 16 || !text(clip.id) || clipIds.has(clip.id) || typeof clip.name !== "string" || !sourceTypes.has(clip.sourceType)
      || !finite(clip.timelineStartMs) || !finite(clip.durationMs, 1) || (clip.speed !== undefined && !finite(clip.speed, 0.001))) return false;
    clipIds.add(clip.id);
    for (const key of ["sourcePath", "sourceUrl", "text", "componentCode", "customCss", "svgContent"]) {
      if (clip[key] !== undefined && typeof clip[key] !== "string") return false;
    }
    for (const key of ["trimInMs", "trimOutMs", "volume", "fadeInMs", "fadeOutMs"]) {
      if (clip[key] !== undefined && !finite(clip[key])) return false;
    }
    if (clip.words !== undefined && (!Array.isArray(clip.words) || !clip.words.every((w: any) => w && typeof w.word === "string" && finite(w.startMs) && finite(w.endMs) && w.endMs >= w.startMs))) return false;
    return clip.subClips === undefined || (Array.isArray(clip.subClips) && clip.subClips.every((c: any) => validClip(c, depth + 1)));
  };

  const trackIds = new Set<string>();
  if (!project || project.version !== "1.0.0" || !text(project.projectId) || typeof project.title !== "string"
    || !project.canvas || !finite(project.canvas.width, 1) || !finite(project.canvas.height, 1)
    || !finite(project.canvas.fps, 0.001) || !finite(project.canvas.durationMs, 1) || project.canvas.durationMs > 86400000
    || !Array.isArray(project.tracks) || !project.tracks.every((track: any) => {
      if (!track || !text(track.id) || trackIds.has(track.id) || !trackTypes.has(track.type)
        || typeof track.name !== "string" || typeof track.muted !== "boolean" || typeof track.locked !== "boolean"
        || !finite(track.volume) || !Array.isArray(track.clips)) return false;
      trackIds.add(track.id);
      return track.clips.every((clip: any) => validClip(clip));
    }) || (project.mediaPool !== undefined && (!Array.isArray(project.mediaPool) || !project.mediaPool.every((asset: any) => asset && text(asset.id) && typeof asset.name === "string" && (text(asset.filePath) || text(asset.sourceUrl)) && ["video", "audio", "image"].includes(asset.mediaType))))
    || (project.metadata?.originalSourceVideo !== undefined && !text(project.metadata.originalSourceVideo))) {
    throw new Error("ไฟล์โปรเจกต์ไม่ถูกต้อง หรือเป็นเวอร์ชันที่ยังไม่รองรับ");
  }

  // Filter out any mediaPool items missing valid paths
  if (project.mediaPool && Array.isArray(project.mediaPool)) {
    project.mediaPool = project.mediaPool.filter((asset: any) => asset && text(asset.id) && (text(asset.filePath) || text(asset.sourceUrl)));
  }

  return project as SmartSpecProjectDraft;
}

export async function saveNleProject(project: SmartSpecProjectDraft, projectPath: string): Promise<string> {
  if (!/\.(json|ssproj)$/i.test(projectPath)) throw new Error("กรุณาบันทึกเป็นไฟล์ .json หรือ .ssproj");
  return invoke<string>("worker_app_save_nle_project", { projectPath, projectJson: JSON.stringify(project, null, 2) });
}

export async function saveCapCutDraft(project: SmartSpecProjectDraft, draftDir: string): Promise<string> {
  const cleanDir = (draftDir || "").trim();
  if (!cleanDir) throw new Error("โฟลเดอร์สำหรับส่งออก CapCut Draft ไม่ถูกต้อง");
  if (!project || !Array.isArray(project.tracks) || project.tracks.length === 0) {
    throw new Error("ไม่พบแทร็กข้อมูลสำหรับส่งออกเป็น CapCut Draft");
  }
  const capcutJson = exportToCapCutDraftJson(project);
  return invoke<string>("worker_app_export_capcut_draft", { draftDir: cleanDir, draftJson: JSON.stringify(capcutJson) });
}

