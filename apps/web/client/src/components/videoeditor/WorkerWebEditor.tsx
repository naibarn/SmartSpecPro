import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Layers3,
  Music2,
  Pause,
  Play,
  Save,
  Scissors,
  Send,
  Settings2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { getSmartSpecWebEndpoint } from "@/lib/webRuntime";
import { WebAssetResolver } from "@/services/webAssetResolver";
import { createBrowserVideoEditorPlatformAdapter } from "@/services/videoEditorPlatformAdapter";
import {
  buildVideoEditorLibraryAssetFromItem,
  parseVideoEditorLibraryItemId,
} from "@/lib/videoEditorLibraryHandoff";
import type { ManagedAssetRef, MediaJobEnvelope } from "@smartspec/shared";

const DEFAULT_DURATION_SECONDS = 8;
const TRACK_HEIGHT = 68;
const MAX_TIMELINE_SECONDS = 60;

type WebAsset = {
  id: string;
  mediaAssetId: number | null;
  name: string;
  type: "video" | "audio" | "image";
  uri: string;
  duration: number;
  status: "uploading" | "ready" | "error";
  progress: number;
};

type TimelineClip = {
  id: string;
  assetId: string;
  trackId: string;
  startTime: number;
  duration: number;
};

type EditorTrack = {
  id: string;
  name: string;
  kind: "video" | "audio" | "overlay";
  clips: TimelineClip[];
  muted: boolean;
};

type PersistedEditorData = {
  projectName?: unknown;
  assets?: unknown;
  tracks?: unknown;
  playhead?: unknown;
};

const INITIAL_TRACKS: EditorTrack[] = [
  { id: "video-1", name: "V1", kind: "video", clips: [], muted: false },
  { id: "video-2", name: "V2", kind: "video", clips: [], muted: false },
  { id: "audio-1", name: "A1", kind: "audio", clips: [], muted: false },
];

const STAGES = [
  { id: "media", label: "สื่อ", icon: FolderOpen },
  { id: "edit", label: "ตัดต่อ", icon: Scissors },
  { id: "review", label: "ตรวจสอบ", icon: Check },
  { id: "queue", label: "ส่ง Worker", icon: Send },
] as const;

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60)
    .toString()
    .padStart(2, "0")}`;
}

function mediaKind(file: File): WebAsset["type"] {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  return "video";
}

function makeId(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function assetRef(asset: WebAsset): ManagedAssetRef | null {
  return asset.mediaAssetId ? { namespace: "media_asset", id: asset.mediaAssetId } : null;
}

function parseManagedMediaAssetId(value: unknown): number | null {
  const id = typeof value === "number"
    ? value
    : typeof value === "string" && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isSafePreviewUri(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  return value.startsWith("/api/storage/files/") || value.startsWith("/uploads/") || /^https:\/\//i.test(value);
}

function restorePersistedEditorData(value: unknown): {
  projectName: string;
  assets: WebAsset[];
  tracks: EditorTrack[];
  playhead: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as PersistedEditorData;
  if (!Array.isArray(data.assets) || !Array.isArray(data.tracks)) return null;
  const assets = data.assets.flatMap((candidate): WebAsset[] => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const asset = candidate as Partial<WebAsset>;
    const type = asset.type === "audio" || asset.type === "image" || asset.type === "video" ? asset.type : null;
    const id = typeof asset.id === "string" ? asset.id : "";
    const name = typeof asset.name === "string" && asset.name.trim() ? asset.name : "สื่อที่นำเข้า";
    const uri = isSafePreviewUri(asset.uri) ? asset.uri : "";
    const mediaAssetId = parseManagedMediaAssetId(asset.mediaAssetId);
    if (!id || !type || !mediaAssetId) return [];
    return [{
      id,
      mediaAssetId,
      name,
      type,
      uri,
      duration: typeof asset.duration === "number" && Number.isFinite(asset.duration) && asset.duration > 0 ? Math.min(asset.duration, MAX_TIMELINE_SECONDS) : DEFAULT_DURATION_SECONDS,
      status: uri ? "ready" : "error",
      progress: 100,
    }];
  });
  const assetIds = new Set(assets.map((asset) => asset.id));
  const tracks = data.tracks.flatMap((candidate): EditorTrack[] => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const track = candidate as Partial<EditorTrack>;
    const kind = track.kind === "audio" || track.kind === "overlay" ? track.kind : "video";
    const id = typeof track.id === "string" ? track.id : "";
    if (!id || !Array.isArray(track.clips)) return [];
    const clips = track.clips.flatMap((candidateClip): TimelineClip[] => {
      if (!candidateClip || typeof candidateClip !== "object" || Array.isArray(candidateClip)) return [];
      const clip = candidateClip as Partial<TimelineClip>;
      if (typeof clip.id !== "string" || typeof clip.assetId !== "string" || !assetIds.has(clip.assetId)) return [];
      const startTime = typeof clip.startTime === "number" && Number.isFinite(clip.startTime) ? Math.max(0, clip.startTime) : 0;
      if (startTime >= MAX_TIMELINE_SECONDS) return [];
      const duration = typeof clip.duration === "number" && Number.isFinite(clip.duration) ? Math.min(Math.max(0.1, clip.duration), MAX_TIMELINE_SECONDS - startTime) : 0;
      if (duration <= 0) return [];
      return [{ id: clip.id, assetId: clip.assetId, trackId: id, startTime, duration }];
    });
    return [{ id, name: typeof track.name === "string" ? track.name : id, kind, clips, muted: track.muted === true }];
  });
  return {
    projectName: typeof data.projectName === "string" && data.projectName.trim() ? data.projectName : "โปรเจกต์วิดีโอใหม่",
    assets,
    tracks: tracks.length > 0 ? tracks : INITIAL_TRACKS,
    playhead: typeof data.playhead === "number" && Number.isFinite(data.playhead) ? Math.max(0, data.playhead) : 0,
  };
}

export default function WorkerWebEditor() {
  const [location, navigate] = useLocation();
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const resolverRef = useRef(new WebAssetResolver());
  const adapterRef = useRef(createBrowserVideoEditorPlatformAdapter());
  const hydratedProjectIdRef = useRef<number | null>(null);
  const importedLibraryItemIdRef = useRef<number | null>(null);
  const [projectName, setProjectName] = useState("โปรเจกต์วิดีโอใหม่");
  const [activeStage, setActiveStage] = useState<(typeof STAGES)[number]["id"]>("media");
  const [assets, setAssets] = useState<WebAsset[]>([]);
  const [tracks, setTracks] = useState<EditorTrack[]>(INITIAL_TRACKS);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const savedProjectRevisionRef = useRef<{ id: string; revision: number } | null>(null);
  const [legacyProjectId, setLegacyProjectId] = useState<number | null>(null);
  const [contentProtectionEnabled, setContentProtectionEnabled] = useState(false);
  const [digitalWatermarkChoice, setDigitalWatermarkChoice] = useState<"on" | "off">("off");

  const saveProject = trpc.videoEditorProjects.save.useMutation();
  const submitJob = trpc.editorMediaJobs.submit.useMutation();
  const trpcUtils = trpc.useUtils();

  useEffect(() => {
    let active = true;
    const loadContentProtectionSettings = async () => {
      try {
        const tenantResponse = await fetch("/api/tenant/current", { credentials: "include" });
        if (!tenantResponse.ok) return;
        const tenantPayload = await tenantResponse.json() as { tenant?: { featureFlags?: Record<string, unknown> } };
        if (!active || tenantPayload.tenant?.featureFlags?.contentProtectionEnabled !== true) return;
        setContentProtectionEnabled(true);
        const settingsResponse = await fetch(getSmartSpecWebEndpoint("/trpc/contentProtection.getSettings"), { credentials: "include" });
        if (!settingsResponse.ok) return;
        const settingsPayload = await settingsResponse.json() as { result?: { data?: unknown } };
        const resultData = settingsPayload.result?.data;
        const settings = resultData && typeof resultData === "object" && "json" in resultData
          ? (resultData as { json?: unknown }).json
          : resultData;
        if (!active || !settings || typeof settings !== "object" || Array.isArray(settings)) return;
        const defaultChoice = (settings as { defaultChoice?: unknown }).defaultChoice;
        if (defaultChoice === "on" || defaultChoice === "off") setDigitalWatermarkChoice(defaultChoice);
      } catch {
        // Protection is optional at the tenant boundary; keep the explicit OFF default.
      }
    };
    void loadContentProtectionSettings();
    return () => { active = false; };
  }, []);

  const queryParams = useMemo(() => {
    const query = location.includes("?") ? location.slice(location.indexOf("?")) : "";
    const params = new URLSearchParams(query);
    const rawProjectId = params.get("projectId");
    const projectId = rawProjectId && /^\d+$/.test(rawProjectId) ? Number(rawProjectId) : null;
    return {
      projectId: projectId && Number.isSafeInteger(projectId) && projectId > 0 ? projectId : null,
      libraryItemId: parseVideoEditorLibraryItemId(query),
    };
  }, [location]);
  const projectQuery = trpc.videoEditorProjects.get.useQuery(
    { id: queryParams.projectId ?? 0 },
    { enabled: queryParams.projectId !== null },
  );

  const duration = useMemo(() => {
    const allClips = tracks.flatMap((track) => track.clips);
    return Math.max(DEFAULT_DURATION_SECONDS, ...allClips.map((clip) => clip.startTime + clip.duration));
  }, [tracks]);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;
  const selectedClip = tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedClipId) ?? null;

  useEffect(() => {
    const project = projectQuery.data;
    const projectId = queryParams.projectId;
    if (!project || projectId === null || hydratedProjectIdRef.current === projectId) return;
    hydratedProjectIdRef.current = projectId;
    const restored = restorePersistedEditorData(project.projectData);
    if (!restored) {
      setLegacyProjectId(project.id);
      toast.warning("โปรเจกต์เดิมเป็นรูปแบบเก่า กรุณาเปิดผ่านโหมด Legacy เพื่อย้ายข้อมูลก่อน");
      return;
    }
    setLegacyProjectId(null);
    setProjectName(project.name || restored.projectName);
    setAssets(restored.assets);
    setTracks(restored.tracks);
    setPlayhead(restored.playhead);
    setSavedProjectId(project.id);
    savedProjectRevisionRef.current = project.currentRevisionId
      ? { id: project.currentRevisionId, revision: project.currentRevision ?? 0 }
      : null;
    const firstReadyAsset = restored.assets.find((asset) => asset.status === "ready") ?? null;
    setSelectedAssetId(firstReadyAsset?.id ?? restored.assets[0]?.id ?? null);
    setPreviewUri(firstReadyAsset?.uri ?? null);
    setIsDirty(false);
    setActiveStage("edit");
    toast.success("เปิดโปรเจกต์จาก Web Editor แล้ว");
  }, [projectQuery.data, queryParams.projectId]);

  useEffect(() => {
    const libraryItemId = queryParams.libraryItemId;
    if (libraryItemId === null || importedLibraryItemIdRef.current === libraryItemId || queryParams.projectId !== null) return;
    importedLibraryItemIdRef.current = libraryItemId;
    let cancelled = false;
    void trpcUtils.library.getItem.fetch({ id: libraryItemId }).then(async (item) => {
      if (cancelled) return;
      const libraryAsset = buildVideoEditorLibraryAssetFromItem(item);
      if (!libraryAsset) throw new Error("รายการ Library นี้ไม่ใช่วิดีโอที่พร้อมใช้งาน");
      const resolved = await resolverRef.current.importRemoteAsset(libraryAsset.url, { mediaType: "video" });
      if (cancelled) return;
      const asset: WebAsset = {
        id: `library-${libraryItemId}`,
        mediaAssetId: parseManagedMediaAssetId(resolved.mediaAssetId),
        name: libraryAsset.title,
        type: "video",
        uri: resolved.uri,
        duration: Math.min(libraryAsset.duration || DEFAULT_DURATION_SECONDS, MAX_TIMELINE_SECONDS),
        status: parseManagedMediaAssetId(resolved.mediaAssetId) ? "ready" : "error",
        progress: 100,
      };
      setAssets((current) => current.some((candidate) => candidate.id === asset.id) ? current : [...current, asset]);
      setSelectedAssetId(asset.id);
      setPreviewUri(asset.uri);
      if (asset.mediaAssetId) {
        setTracks((current) => current.map((track) => track.id === "video-1" && track.clips.length === 0
          ? { ...track, clips: [{ id: makeId("clip"), assetId: asset.id, trackId: track.id, startTime: 0, duration: asset.duration }] }
          : track));
        setActiveStage("edit");
        setIsDirty(true);
        toast.success("นำเข้าวิดีโอจาก Library ลง timeline แล้ว");
      }
    }).catch((error) => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : "เปิดวิดีโอจาก Library ไม่สำเร็จ");
    });
    return () => { cancelled = true; };
  }, [queryParams.libraryItemId, queryParams.projectId, trpcUtils.library.getItem]);

  const importMedia = async () => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      const files = await adapterRef.current.pickMedia();
      if (files.length === 0) return;
      for (const file of files) {
        const localUri = URL.createObjectURL(file);
        const id = makeId("asset");
        setAssets((current) => [
          ...current,
          {
            id,
            mediaAssetId: null,
            name: file.name,
            type: mediaKind(file),
            uri: localUri,
            duration: DEFAULT_DURATION_SECONDS,
            status: "uploading",
            progress: 0,
          },
        ]);
        setSelectedAssetId(id);
        setPreviewUri(localUri);

        try {
          const upload = resolverRef.current.uploadAsset(file, (progress) => {
            setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, progress } : asset));
          });
          const result = await upload.promise;
          const mediaAssetId = parseManagedMediaAssetId(result.mediaAssetId);
          setAssets((current) => current.map((asset) => asset.id === id ? {
            ...asset,
            mediaAssetId,
            uri: result.uri || localUri,
            status: "ready",
            progress: 100,
          } : asset));
          setPreviewUri(result.uri || localUri);
          if (!mediaAssetId) {
            toast.warning("อัปโหลดแล้ว แต่เซิร์ฟเวอร์ยังไม่ผูก media asset จึงยังส่ง Worker ไม่ได้");
          }
        } catch (error) {
          setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, status: "error" } : asset));
          toast.error(error instanceof Error ? error.message : "อัปโหลดสื่อไม่สำเร็จ");
        }
      }
      setActiveStage("edit");
      setIsDirty(true);
    } finally {
      setIsImporting(false);
    }
  };

  const addSelectedAssetToTimeline = () => {
    if (!selectedAsset || selectedAsset.status !== "ready") return;
    const targetTrack = selectedAsset.type === "audio" ? "audio-1" : "video-1";
    setTracks((current) => current.map((track) => {
      if (track.id !== targetTrack) return track;
      const startTime = track.clips.reduce((end, clip) => Math.max(end, clip.startTime + clip.duration), 0);
      const clip: TimelineClip = {
        id: makeId("clip"),
        assetId: selectedAsset.id,
        trackId: targetTrack,
        startTime,
        duration: Math.min(selectedAsset.duration || DEFAULT_DURATION_SECONDS, MAX_TIMELINE_SECONDS - startTime),
      };
      setSelectedClipId(clip.id);
      return { ...track, clips: [...track.clips, clip] };
    }));
    setActiveStage("edit");
    setIsDirty(true);
  };

  const removeSelectedClip = () => {
    if (!selectedClipId) return;
    setTracks((current) => current.map((track) => ({
      ...track,
      clips: track.clips.filter((clip) => clip.id !== selectedClipId),
    })));
    setSelectedClipId(null);
    setIsDirty(true);
  };

  const save = async (): Promise<{ id: number; revisionId: string; revision: number } | null> => {
    try {
      const result = await saveProject.mutateAsync({
        ...(savedProjectId ? { id: savedProjectId } : {}),
        name: projectName.trim() || "โปรเจกต์วิดีโอใหม่",
        projectData: { projectName, assets, tracks, playhead },
        ...(savedProjectRevisionRef.current ? { expectedRevision: savedProjectRevisionRef.current.revision, expectedRevisionId: savedProjectRevisionRef.current.id } : {}),
        clientMutationId: `legacy-save-${makeId("mutation")}`,
        duration,
        resolution: "1920x1080",
        trackCount: tracks.length,
        clipCount: tracks.reduce((count, track) => count + track.clips.length, 0),
      });
      setSavedProjectId(result.id);
      savedProjectRevisionRef.current = { id: result.revisionId, revision: result.revision };
      setIsDirty(false);
      toast.success("บันทึกโปรเจกต์แล้ว");
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกโปรเจกต์ไม่สำเร็จ");
      return null;
    }
  };

  const submitToWorker = async () => {
    const readyAssets = assets.filter((asset) => asset.mediaAssetId);
    const clips = tracks.flatMap((track) => track.clips);
    if (readyAssets.length === 0 || clips.length === 0) {
      toast.error("เพิ่มสื่ออย่างน้อยหนึ่งรายการและวางลง timeline ก่อนส่ง Worker");
      return;
    }
    const refs = new Map(readyAssets.map((asset) => [asset.id, assetRef(asset)]));
    let persistedProjectId = savedProjectId;
    let revisionId = savedProjectRevisionRef.current?.id ?? null;
    if (!persistedProjectId || isDirty || !revisionId) {
      const saved = await save();
      if (!saved) return;
      persistedProjectId = saved.id;
      revisionId = saved.revisionId;
    }
    if (!persistedProjectId || !revisionId) {
      toast.error("ยังไม่มี ProjectRevision สำหรับส่ง Worker");
      return;
    }
    const projectId = `project-${persistedProjectId}`;
    const jobId = makeId("editor-job");
    const project = {
      projectId,
      schemaVersion: "nle.web.1" as const,
      timebase: { numerator: 1, denominator: 1000 },
      canvas: { width: 1920, height: 1080, pixelAspectRatio: { numerator: 1, denominator: 1 } },
      tracks: tracks.map((track) => ({
        id: track.id,
        kind: track.kind,
        clips: track.clips.flatMap((clip) => {
          const ref = refs.get(clip.assetId);
          if (!ref) return [];
          return [{
            id: clip.id,
            asset: ref,
            startMs: Math.round(clip.startTime * 1000),
            sourceInMs: 0,
            sourceOutMs: Math.round(clip.duration * 1000),
            playbackRate: 1,
            volume: track.muted ? 0 : 1,
            muted: track.muted,
          }];
        }),
      })),
      markers: [],
      render: { profileId: "web-1080p", fps: { numerator: 30, denominator: 1 }, outputRoles: ["final_video"] },
      migration: {
        sourceFormat: "worker-app-media-workspace",
        sourceVersion: "1",
        mappingVersion: "web-editor-1",
        unresolved: [],
        unsupported: [],
        preservedUnknown: {},
      },
    };
    const envelope: Omit<MediaJobEnvelope, "tenantId"> = {
      protocol: "smartaihub.media.job",
      version: "1.0",
      jobId,
      projectId,
      revisionId,
      timelineVersion: 1,
      operation: "video.render",
      ...(contentProtectionEnabled
        ? {
            protectionIntent: {
              choice: digitalWatermarkChoice,
              choiceSource: "per_export" as const,
              requireBeforePublish: true,
            },
          }
        : {}),
      inputs: {
        assets: readyAssets.map((asset) => assetRef(asset)).filter((ref): ref is ManagedAssetRef => Boolean(ref)),
        project,
        assetKinds: Object.fromEntries(readyAssets.map((asset) => [String(asset.mediaAssetId), asset.type])),
      },
      plan: {
        planHash: makeId("plan"),
        profileVersion: "web-render-1",
        stages: [{ id: "render", operation: "video.render", dependsOn: [] }],
        outputRoles: ["final_video"],
      },
      requirements: { capabilities: ["editor-video-render"], resourceProfile: "cpu_heavy", maxDurationSeconds: Math.max(600, duration * 4) },
      retry: { maxAttempts: 2, backoffSeconds: 30 },
      billing: { required: true, estimateCredits: Math.max(1, Math.ceil(duration / 10)) },
    };

    try {
      const result = await submitJob.mutateAsync({
        envelope: envelope as Record<string, unknown>,
        idempotencyKey: `${projectId}:${revisionId}`,
      });
      setActiveStage("queue");
      setIsDirty(false);
      toast.success("ส่งงานเข้า Worker queue แล้ว");
      navigate(`/worker-jobs?jobId=${encodeURIComponent(result.job.id)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ส่งงานเข้า Worker queue ไม่สำเร็จ");
    }
  };

  const togglePlayback = () => {
    const element = mediaRef.current;
    if (!element) return;
    if (element.paused) {
      void element.play();
      setIsPlaying(true);
    } else {
      element.pause();
      setIsPlaying(false);
    }
  };

  const setTimeFromEvent = (event: SyntheticEvent<HTMLMediaElement>) => {
    setPlayhead(event.currentTarget.currentTime);
  };

  const handleMediaMetadata = (event: SyntheticEvent<HTMLMediaElement>) => {
    const measuredDuration = event.currentTarget.duration;
    if (!Number.isFinite(measuredDuration) || measuredDuration <= 0) return;
    const assetId = selectedAssetId;
    setAssets((current) => current.map((asset) => asset.id === assetId
      ? { ...asset, duration: Math.min(measuredDuration, MAX_TIMELINE_SECONDS) }
      : asset));
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#090d16] text-slate-100" data-testid="worker-web-editor">
      <header className="border-b border-white/10 bg-[#0d1320] px-4 py-3 lg:px-6">
        <section className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3">
          <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
          </Link>
          <span className="hidden h-6 w-px bg-white/10 sm:block" aria-hidden="true" />
          <div className="flex min-w-[220px] flex-1 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-300">
              <Film className="h-5 w-5" aria-hidden="true" />
            </span>
            <label className="min-w-0 flex-1">
              <span className="sr-only">ชื่อโปรเจกต์</span>
              <Input
                value={projectName}
                onChange={(event) => { setProjectName(event.target.value); setIsDirty(true); }}
                className="h-9 max-w-sm border-0 bg-transparent px-0 text-base font-semibold text-white shadow-none focus-visible:ring-0"
                aria-label="ชื่อโปรเจกต์"
              />
              <span className="block text-xs text-slate-500" aria-live="polite">Web Media Workspace · {isDirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "บันทึกแล้ว"}</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden gap-1 border-cyan-400/30 bg-cyan-400/10 text-cyan-200 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />Worker queue</Badge>
            <Button variant="ghost" className="min-h-11 text-slate-300 hover:bg-white/10 hover:text-white" onClick={save} disabled={saveProject.isPending}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />{saveProject.isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
            <Button className="min-h-11 bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={submitToWorker} disabled={submitJob.isPending || assets.some((asset) => asset.status === "uploading")}>
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />{submitJob.isPending ? "กำลังส่ง..." : "ส่ง Worker"}
            </Button>
          </div>
        </section>
      </header>

      <nav className="border-b border-white/10 bg-[#101827] px-4 lg:px-6" aria-label="ขั้นตอนการทำงาน">
        <section className="mx-auto flex max-w-[1800px] items-center gap-1 overflow-x-auto py-2">
          {STAGES.map((stage, index) => {
            const Icon = stage.icon;
            const active = activeStage === stage.id;
            return (
              <button key={stage.id} type="button" onClick={() => setActiveStage(stage.id)} className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400", active ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-slate-200")} aria-current={active ? "step" : undefined}>
                <Icon className="h-4 w-4" aria-hidden="true" />{stage.label}
                {index < STAGES.length - 1 ? <ChevronRight className="ml-1 h-3.5 w-3.5 text-slate-600" aria-hidden="true" /> : null}
              </button>
            );
          })}
          <span className="ml-auto hidden items-center gap-2 text-xs text-slate-500 lg:flex"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> งานหนักจะทำใน Worker queue</span>
        </section>
      </nav>

      {legacyProjectId ? <div role="alert" className="border-b border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"><div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3"><span>โปรเจกต์นี้ยังเป็นรูปแบบเดิมและต้องย้ายข้อมูลก่อนใช้งานใน Web Editor</span><Link href={`/video-editor?legacy=1&projectId=${legacyProjectId}`} className="font-medium underline underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200">เปิดโหมด Legacy ชั่วคราว</Link></div></div> : null}

      <section className="mx-auto grid w-full max-w-[1800px] flex-1 grid-cols-1 gap-px bg-white/10 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="bg-[#0c1320] p-4" aria-label="คลังสื่อ">
          <div className="mb-4 flex items-center justify-between">
            <div><p className="text-sm font-semibold text-white">Media Library</p><p className="text-xs text-slate-500">สื่อในโปรเจกต์นี้</p></div>
            <Button size="icon" variant="ghost" className="h-10 w-10 text-slate-300 hover:bg-white/10 hover:text-white" onClick={importMedia} disabled={isImporting} aria-label="นำเข้าสื่อ"><Upload className="h-4 w-4" aria-hidden="true" /></Button>
          </div>
          <Button className="mb-4 min-h-11 w-full justify-center border border-cyan-400/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20" onClick={importMedia} disabled={isImporting}><Upload className="mr-2 h-4 w-4" aria-hidden="true" />{isImporting ? "กำลังอัปโหลด..." : "นำเข้าสื่อจากเครื่อง"}</Button>
          <div className="space-y-2">
            {assets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-slate-500"><FolderOpen className="mx-auto mb-3 h-8 w-8 text-slate-600" aria-hidden="true" /><p>ยังไม่มีสื่อ</p><p className="mt-1 text-xs">เลือกวิดีโอ เสียง หรือภาพจากเครื่อง</p></div>
            ) : assets.map((asset) => (
              <button key={asset.id} type="button" onClick={() => { setSelectedAssetId(asset.id); setPreviewUri(asset.uri); }} className={cn("w-full rounded-xl border p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400", selectedAssetId === asset.id ? "border-cyan-300/70 bg-cyan-400/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]")}>
                <span className="flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-cyan-300">{asset.type === "audio" ? <Music2 className="h-4 w-4" aria-hidden="true" /> : asset.type === "image" ? <ImageIcon className="h-4 w-4" aria-hidden="true" /> : <Video className="h-4 w-4" aria-hidden="true" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm text-slate-200">{asset.name}</span><span className="block text-xs text-slate-500">{asset.status === "uploading" ? `อัปโหลด ${asset.progress}%` : asset.status === "ready" ? "พร้อมใช้งาน" : "อัปโหลดไม่สำเร็จ"}</span></span>{asset.status === "ready" ? <Check className="h-4 w-4 text-emerald-400" aria-label="พร้อมใช้งาน" /> : null}</span>
                {asset.status === "uploading" ? <Progress value={asset.progress} className="mt-2 h-1" /> : null}
              </button>
            ))}
          </div>
          {selectedAsset ? <Button variant="secondary" className="mt-4 min-h-11 w-full" onClick={addSelectedAssetToTimeline} disabled={selectedAsset.status !== "ready"}><Layers3 className="mr-2 h-4 w-4" aria-hidden="true" />วางลง Timeline</Button> : null}
        </aside>

        <section className="flex min-h-[560px] flex-col bg-[#080c14]" aria-label="พื้นที่แก้ไขวิดีโอ">
          <div className="flex min-h-[360px] flex-1 items-center justify-center p-4 lg:p-8">
            <div className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/30">
              {previewUri && selectedAsset?.type === "image" ? <img src={previewUri} className="h-full w-full object-contain" alt={selectedAsset.name} /> : previewUri && selectedAsset?.type === "audio" ? <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-gradient-to-br from-slate-950 to-cyan-950/40 p-8"><Music2 className="h-16 w-16 text-cyan-300" aria-hidden="true" /><p className="max-w-sm truncate text-sm text-slate-300">{selectedAsset.name}</p><audio ref={(element) => { mediaRef.current = element; }} src={previewUri} className="w-full max-w-md" controls onLoadedMetadata={handleMediaMetadata} onTimeUpdate={setTimeFromEvent} onEnded={() => setIsPlaying(false)} aria-label="ตัวอย่างเสียง" /></div> : previewUri ? <video ref={(element) => { mediaRef.current = element; }} src={previewUri} className="h-full w-full object-contain" controls={false} onLoadedMetadata={handleMediaMetadata} onTimeUpdate={setTimeFromEvent} onEnded={() => setIsPlaying(false)} aria-label="ตัวอย่างวิดีโอ" /> : <div className="flex h-full flex-col items-center justify-center text-slate-500"><Play className="mb-3 h-12 w-12 text-slate-600" aria-hidden="true" /><p className="text-sm">Preview Window</p><p className="mt-1 text-xs">นำสื่อไปวางใน timeline เพื่อดูตัวอย่าง</p></div>}
              {previewUri && selectedAsset?.type !== "image" ? <button type="button" onClick={togglePlayback} className="absolute bottom-4 left-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur transition hover:bg-cyan-500 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label={isPlaying ? "หยุดเล่น" : "เล่นสื่อ"}>{isPlaying ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}</button> : null}
            </div>
          </div>
          <div className="border-t border-white/10 bg-[#0c121c] px-4 py-3"><div className="flex items-center gap-3"><button type="button" onClick={togglePlayback} disabled={!previewUri || selectedAsset?.type === "image"} className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500 text-slate-950 disabled:cursor-not-allowed disabled:opacity-40" aria-label={isPlaying ? "หยุดเล่น" : "เล่นสื่อ"}>{isPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}</button><span className="font-mono text-xs text-slate-400">{formatTime(playhead)} / {formatTime(duration)}</span><input type="range" min={0} max={duration} step={0.01} value={Math.min(playhead, duration)} onChange={(event) => { const value = Number(event.target.value); setPlayhead(value); if (mediaRef.current && selectedAsset?.type !== "image") mediaRef.current.currentTime = value; }} className="h-1 flex-1 accent-cyan-400" aria-label="ตำแหน่งสื่อ" /></div></div>
          <div className="border-t border-white/10 bg-[#0c121c] p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold text-white">Timeline</p><p className="text-xs text-slate-500">ลากสื่อไปตามลำดับ แล้วส่งงานหนักให้ Worker</p></div><div className="flex items-center gap-2"><Button size="icon" variant="ghost" className="h-9 w-9 text-slate-400 hover:bg-white/10 hover:text-white" onClick={removeSelectedClip} disabled={!selectedClipId} aria-label="ลบคลิป"><X className="h-4 w-4" aria-hidden="true" /></Button><span className="rounded-md bg-white/5 px-2 py-1 font-mono text-xs text-slate-500">30 fps</span></div></div><div className="overflow-x-auto rounded-xl border border-white/10"><div className="min-w-[720px]"><div className="flex border-b border-white/10 bg-white/[0.03] pl-[72px] text-[10px] text-slate-600">{Array.from({ length: 7 }, (_, index) => <span key={index} className="flex-1 border-l border-white/5 px-2 py-2">{formatTime(index * 10)}</span>)}</div>{tracks.map((track) => <div key={track.id} className="flex border-b border-white/10 last:border-0" style={{ minHeight: TRACK_HEIGHT }}><div className="flex w-[72px] shrink-0 items-center gap-2 border-r border-white/10 px-2 text-xs font-semibold text-slate-400"><span>{track.name}</span></div><div className="relative flex-1 bg-[linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:14.285%_100%]">{track.clips.map((clip) => { const asset = assets.find((item) => item.id === clip.assetId); const selected = selectedClipId === clip.id; return <button key={clip.id} type="button" onClick={() => { setSelectedClipId(clip.id); if (asset) { setSelectedAssetId(asset.id); setPreviewUri(asset.uri); } }} className={cn("absolute top-2 h-12 overflow-hidden rounded-lg border px-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300", selected ? "border-cyan-200 bg-cyan-400/30 text-white" : "border-indigo-300/30 bg-indigo-500/25 text-indigo-100 hover:bg-indigo-500/40")} style={{ left: `${(clip.startTime / MAX_TIMELINE_SECONDS) * 100}%`, width: `${Math.max(5, (clip.duration / MAX_TIMELINE_SECONDS) * 100)}%` }}><span className="block truncate">{asset?.name ?? "คลิป"}</span><span className="block text-[10px] text-white/55">{formatTime(clip.duration)}</span></button>; })}</div></div>)}</div></div></div>
        </section>

        <aside className="bg-[#0c1320] p-4" aria-label="สถานะ Worker และการตั้งค่า">
          <div className="mb-5 flex items-center gap-2"><Settings2 className="h-4 w-4 text-cyan-300" aria-hidden="true" /><p className="text-sm font-semibold text-white">Worker handoff</p></div>
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">ประมวลผลบน Worker</p><p className="mt-2 text-sm leading-6 text-slate-300">การตัดต่อเบื้องต้นทำบนเว็บ งาน render, proxy และวิเคราะห์สื่อจะสร้างเป็น job ในคิวให้ Worker รับไปทำ</p><Link href="/worker-jobs" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-cyan-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">เปิดคิวงาน <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></div>
          <div className="mt-4 space-y-3"><div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3"><span className="text-sm text-slate-400">สื่อในโปรเจกต์</span><span className="font-semibold text-white">{assets.length}</span></div><div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3"><span className="text-sm text-slate-400">คลิปใน timeline</span><span className="font-semibold text-white">{tracks.reduce((count, track) => count + track.clips.length, 0)}</span></div><div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3"><span className="text-sm text-slate-400">ความยาว</span><span className="font-mono text-sm text-white">{formatTime(duration)}</span></div></div>
          {contentProtectionEnabled ? <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.06] p-4" data-testid="legacy-editor-content-protection-choice"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Digital Content Protection</p><p className="mt-2 text-xs leading-5 text-slate-300">ลายน้ำดิจิทัลจะถูกสร้างหลัง final render และจะตรวจสอบก่อน publish รองรับวิดีโอที่รวมจาก timeline นี้</p><div className="mt-3 flex gap-2"><Button type="button" variant={digitalWatermarkChoice === "on" ? "default" : "outline"} className="min-h-10 flex-1" onClick={() => setDigitalWatermarkChoice("on")}>เปิดใช้ (ON)</Button><Button type="button" variant={digitalWatermarkChoice === "off" ? "default" : "outline"} className="min-h-10 flex-1" onClick={() => setDigitalWatermarkChoice("off")}>ไม่ใช้ (OFF)</Button></div><p className="mt-2 text-xs text-slate-500">{digitalWatermarkChoice === "on" ? "ON: รอตรวจสอบก่อนเผยแพร่" : "OFF: ระบุว่า unprotected ตามสิทธิ์ของผู้ใช้"}</p><Link href="/content-protection" className="mt-2 inline-flex text-xs font-medium text-emerald-200 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">ดูหลักฐานและการตั้งค่า Content Protection</Link></div> : null}
          <div className="mt-6"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">พร้อมส่งหรือยัง</p><ul className="space-y-2 text-sm text-slate-400"><li className="flex items-center gap-2">{assets.length > 0 ? <Check className="h-4 w-4 text-emerald-400" /> : <span className="h-4 w-4 rounded-full border border-slate-600" />}เพิ่มสื่อ</li><li className="flex items-center gap-2">{tracks.some((track) => track.clips.length > 0) ? <Check className="h-4 w-4 text-emerald-400" /> : <span className="h-4 w-4 rounded-full border border-slate-600" />}จัด timeline</li><li className="flex items-center gap-2">{assets.every((asset) => asset.mediaAssetId) && assets.length > 0 ? <Check className="h-4 w-4 text-emerald-400" /> : <span className="h-4 w-4 rounded-full border border-slate-600" />}ผูก managed media</li></ul></div>
          <Button className="mt-6 min-h-12 w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" onClick={submitToWorker} disabled={submitJob.isPending || assets.length === 0 || !assets.every((asset) => asset.mediaAssetId) || !tracks.some((track) => track.clips.length > 0)}><Send className="mr-2 h-4 w-4" aria-hidden="true" />ส่งงานเข้า Worker queue</Button>
          <p className="mt-3 text-center text-xs leading-5 text-slate-600">เครดิตจะถูกกันไว้เมื่อกดยืนยันส่งงาน และคืนตามผลลัพธ์ของ job</p>
        </aside>
      </section>
    </main>
  );
}
