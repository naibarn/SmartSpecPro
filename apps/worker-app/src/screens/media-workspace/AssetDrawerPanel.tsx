import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import type { NleClip } from "../../types/nleProject";

export interface AssetDrawerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentTimeMs: number;
  seriesId?: string | null;
  workspacePath?: string | null;
  onAddClip: (trackId: string, clip: NleClip) => void;
  sourceVideoFile?: { name: string; path: string; sizeBytes?: number } | null;
  projectAssets?: import("../../types/nleProject").ProjectAsset[];
}

export interface MediaAssetItem {
  id: string;
  title: string;
  category: "video" | "broll" | "music" | "sfx" | "image";
  durationMs: number;
  thumbnailUrl?: string;
  sourceUrl: string;
  filePath?: string;
  isSeriesMedia?: boolean;
  isCloudOnly?: boolean;
  assetKind?: string;
  updatedAt?: string | null;
  fileSizeLabel?: string;
  episodeId?: string;
  episodeTitle?: string;
  isCompoundShot?: boolean;
  isShotClip?: boolean;
  shotNumber?: number;
  model?: string;
  prompt?: string;
  status?: string;
  taskId?: string;
  isPresetLibrary?: boolean;
}

export interface SeriesOptionItem {
  seriesId: string;
  title: string;
}

export interface EpisodeOptionItem {
  episodeId: string;
  title: string;
}

export const SMARTAIHUB_CLOUD_LIBRARY_PRESETS: MediaAssetItem[] = [
  {
    id: "smartaihub_bgm_cinematic",
    title: "🎵 [SmartAIHub Library] Cinematic Ambient BGM (120 BPM)",
    category: "music",
    durationMs: 120000,
    sourceUrl: "https://actions.google.com/sounds/v1/ambiences/outdoor_park.ogg",
    isSeriesMedia: false,
    isCloudOnly: true,
    isPresetLibrary: true,
    assetKind: "audio_music",
    updatedAt: new Date().toISOString(),
    episodeTitle: "SmartAIHub Audio Library",
  },
  {
    id: "smartaihub_bgm_tech",
    title: "🎵 [SmartAIHub Library] Modern Tech & AI Groove Track",
    category: "music",
    durationMs: 90000,
    sourceUrl: "https://actions.google.com/sounds/v1/ambiences/rain_heavy.ogg",
    isSeriesMedia: false,
    isCloudOnly: true,
    isPresetLibrary: true,
    assetKind: "audio_music",
    updatedAt: new Date().toISOString(),
    episodeTitle: "SmartAIHub Audio Library",
  },
  {
    id: "smartaihub_sfx_whoosh",
    title: "💥 [SmartAIHub Library] Digital Cinematic Whoosh SFX",
    category: "sfx",
    durationMs: 1500,
    sourceUrl: "https://actions.google.com/sounds/v1/foley/whoosh.ogg",
    isSeriesMedia: false,
    isCloudOnly: true,
    isPresetLibrary: true,
    assetKind: "audio_sfx",
    updatedAt: new Date().toISOString(),
    episodeTitle: "SmartAIHub SFX Library",
  },
  {
    id: "smartaihub_broll_city",
    title: "🎥 [SmartAIHub B-Roll] 4K Aerial City Timelapse Footage",
    category: "broll",
    durationMs: 8000,
    sourceUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    isSeriesMedia: false,
    isCloudOnly: true,
    isPresetLibrary: true,
    assetKind: "video_broll",
    updatedAt: new Date().toISOString(),
    episodeTitle: "SmartAIHub Video Library",
  },
  {
    id: "smartaihub_shot_01",
    title: "🎬 [SmartAIHub Shot #1] Main Talking Head Opening Cut",
    category: "video",
    durationMs: 12000,
    sourceUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    isSeriesMedia: false,
    isCloudOnly: true,
    isPresetLibrary: true,
    isShotClip: true,
    shotNumber: 1,
    assetKind: "video_shot",
    updatedAt: new Date().toISOString(),
    episodeTitle: "SmartAIHub Shot Library",
  },
  {
    id: "smartaihub_compound_01",
    title: "📦 [SmartAIHub Compound #1] AI Multi-Cam Dialogue & Subtitle Track",
    category: "video",
    durationMs: 15000,
    sourceUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    isSeriesMedia: false,
    isCloudOnly: true,
    isPresetLibrary: true,
    isCompoundShot: true,
    assetKind: "compound_shot",
    updatedAt: new Date().toISOString(),
    episodeTitle: "SmartAIHub Compound Library",
  },
];

function AssetThumbnailCard({ item }: { item: MediaAssetItem }) {
  const [imgError, setImgError] = useState(false);

  if (item.thumbnailUrl && !imgError) {
    return (
      <div className="drawer-thumb-box">
        <img
          src={item.thumbnailUrl}
          alt={item.title}
          className="drawer-asset-thumb"
          onError={() => setImgError(true)}
          loading="lazy"
        />
        {item.category === "image" ? (
          <span className="drawer-media-badge image-badge" style={{ background: "#ec4899", color: "#fff" }}>
            🖼️ รูปภาพ
          </span>
        ) : item.isCompoundShot ? (
          <span className="drawer-media-badge compound-badge" style={{ background: "#a855f7", color: "#fff" }}>
            📦 Compound
          </span>
        ) : item.isShotClip ? (
          <span className="drawer-media-badge shot-badge" style={{ background: "#0ea5e9", color: "#fff" }}>
            🎬 Shot #{item.shotNumber || 1}
          </span>
        ) : (item.category === "video" || item.category === "broll") ? (
          <span className="drawer-media-badge video-badge">🎬 MP4</span>
        ) : null}
      </div>
    );
  }

  // Premium Fallback Poster Graphic (Never show broken image)
  const isVideo = item.category === "video" || item.category === "broll";
  const isAudio = item.category === "music" || item.category === "sfx";

  return (
    <div
      className={`drawer-thumb-box fallback-box ${
        isVideo ? "fallback-video" : isAudio ? "fallback-audio" : "fallback-image"
      }`}
    >
      <div className="fallback-inner">
        <span className="fallback-symbol">
          {item.isCompoundShot
            ? "📦"
            : item.isShotClip
            ? "🎬"
            : item.category === "video"
            ? "🎬"
            : item.category === "broll"
            ? "🎥"
            : item.category === "music"
            ? "🎵"
            : item.category === "sfx"
            ? "💥"
            : "🖼️"}
        </span>
        <span className="fallback-ext">
          {item.isCompoundShot ? "COMPOUND" : isVideo ? "VIDEO" : isAudio ? "AUDIO" : "IMAGE"}
        </span>
      </div>
    </div>
  );
}

export function AssetDrawerPanel({
  isOpen,
  onClose,
  currentTimeMs,
  seriesId: propsSeriesId,
  workspacePath,
  onAddClip,
  sourceVideoFile,
  projectAssets = [],
}: AssetDrawerPanelProps) {
  const [storageMode, setStorageMode] = useState<"local" | "cloud">(propsSeriesId ? "cloud" : "local");
  const [tab, setTab] = useState<"all" | "bin" | "history" | "library" | "shots" | "compounds" | "broll" | "music" | "sfx">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [latestLimit, setLatestLimit] = useState<number | "all">(25);

  // Series & Episode Selection Hierarchy
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>(() => String(propsSeriesId || ""));
  const [seriesList, setSeriesList] = useState<SeriesOptionItem[]>([]);
  const [episodeList, setEpisodeList] = useState<EpisodeOptionItem[]>([]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("all");

  const [cloudAssets, setCloudAssets] = useState<MediaAssetItem[]>([]);
  const [serverMediaHistory, setServerMediaHistory] = useState<MediaAssetItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [serverLibraryItems, setServerLibraryItems] = useState<MediaAssetItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [localHistoryAssets, setLocalHistoryAssets] = useState<MediaAssetItem[]>([]);
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // Downloading cache state map: assetId -> progress percentage (0-100)
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  const loadServerMediaHistory = useCallback(async () => {
    if (storageMode !== "cloud") return;
    setIsLoadingHistory(true);
    try {
      const res = await invoke<{
        tasks?: Array<{
          id: string;
          taskId?: string;
          mediaType: string;
          status: string;
          model?: string;
          prompt?: string;
          parameters?: Record<string, unknown>;
          resultUrl?: string;
          thumbnailUrl?: string;
          createdAt: string;
          completedAt?: string;
        }>;
        total?: number;
      }>("worker_app_get_media_history", {
        mediaType: null,
        query: searchQuery.trim() || null,
        limit: typeof latestLimit === "number" ? latestLimit : 50,
      });

      const tasks = res?.tasks || [];
      const mapped: MediaAssetItem[] = tasks.map((t, idx) => {
        const mType = (t.mediaType || "").toLowerCase();
        let cat: "video" | "broll" | "music" | "sfx" | "image" = "image";
        if (mType === "video") cat = "video";
        else if (mType === "audio" || mType === "music") cat = "music";
        else if (mType === "image") cat = "image";
        else if ((t.model || "").toLowerCase().includes("image")) cat = "image";
        else if ((t.model || "").toLowerCase().includes("audio") || (t.model || "").toLowerCase().includes("voice")) cat = "music";
        else cat = "video";

        const cleanPrompt = (t.prompt || "").trim();
        const shortTitle = cleanPrompt
          ? cleanPrompt.length > 90
            ? cleanPrompt.slice(0, 90) + "..."
            : cleanPrompt
          : `${t.model || "Media Task"} #${t.id || idx + 1}`;

        return {
          id: `media_task_${t.id || idx}`,
          title: shortTitle,
          category: cat,
          durationMs: cat === "image" ? 5000 : cat === "music" ? 30000 : 5000,
          thumbnailUrl: t.thumbnailUrl || t.resultUrl,
          sourceUrl: t.resultUrl || t.thumbnailUrl || "",
          isSeriesMedia: false,
          isCloudOnly: true,
          assetKind: t.mediaType || "image",
          updatedAt: t.completedAt || t.createdAt,
          model: t.model,
          prompt: t.prompt,
          status: t.status,
          taskId: t.taskId || t.id,
        };
      });
      setServerMediaHistory(mapped);
    } catch (err) {
      console.warn("Failed to load server media history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [storageMode, searchQuery, latestLimit]);

  const loadServerLibrary = useCallback(async () => {
    if (storageMode !== "cloud") return;
    setIsLoadingLibrary(true);
    try {
      const res = await invoke<{
        items?: Array<{
          id: string;
          title: string;
          itemType: string;
          source?: string;
          projectId?: string;
          description?: string;
          status?: string;
          visibility?: string;
          sourceUrl?: string;
          thumbnailUrl?: string;
          metadata?: Record<string, unknown>;
          createdAt: string;
          updatedAt: string;
        }>;
        total?: number;
      }>("worker_app_get_server_library", {
        itemType: null,
        query: searchQuery.trim() || null,
        limit: typeof latestLimit === "number" ? latestLimit : 50,
      });

      const items = res?.items || [];
      const mapped: MediaAssetItem[] = items.map((item, idx) => {
        const iType = (item.itemType || "").toLowerCase();
        let cat: "video" | "broll" | "music" | "sfx" | "image" = "video";
        if (iType === "video") cat = "video";
        else if (iType === "audio" || iType === "music") cat = "music";
        else if (iType === "sfx") cat = "sfx";
        else if (iType === "image" || iType === "picture" || iType === "photo") cat = "image";
        else cat = "video";

        const meta = item.metadata || {};
        const dur = (meta.durationMs as number) || (cat === "image" ? 5000 : cat === "music" ? 30000 : 10000);
        const sizeBytes = (meta.sizeBytes || meta.size || meta.fileSizeBytes) as number | undefined;

        return {
          id: `server_lib_${item.id || idx}`,
          title: item.title || `Library Item #${item.id || idx + 1}`,
          category: cat,
          durationMs: dur,
          thumbnailUrl: item.thumbnailUrl || item.sourceUrl,
          sourceUrl: item.sourceUrl || item.thumbnailUrl || "",
          isSeriesMedia: false,
          isCloudOnly: true,
          assetKind: item.itemType || "video",
          updatedAt: item.updatedAt || item.createdAt,
          fileSizeLabel: sizeBytes ? `${(sizeBytes / 1024 / 1024).toFixed(1)} MB` : undefined,
          status: item.status,
          prompt: item.description,
        };
      });
      setServerLibraryItems(mapped);
    } catch (err) {
      console.warn("Failed to load server library:", err);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [storageMode, searchQuery, latestLimit]);

  useEffect(() => {
    if (isOpen && storageMode === "cloud") {
      void loadServerMediaHistory();
      void loadServerLibrary();
    }
  }, [isOpen, storageMode, loadServerMediaHistory, loadServerLibrary]);

  useEffect(() => {
    if (propsSeriesId) {
      setSelectedSeriesId(String(propsSeriesId));
      setStorageMode("cloud");
    } else {
      setSelectedSeriesId("");
    }
  }, [propsSeriesId]);

  const binAssets: MediaAssetItem[] = useMemo(() => {
    if (!projectAssets) return [];
    return projectAssets.map((pa) => ({
      id: pa.id,
      title: pa.name,
      category: (pa.mediaType === "video" ? "video" : pa.mediaType === "audio" ? "music" : "image") as any,
      durationMs: pa.durationMs || 5000,
      sourceUrl: convertFileSrc(pa.filePath),
      filePath: pa.filePath,
      isSeriesMedia: false,
      isCloudOnly: false,
      updatedAt: pa.importedAt,
    }));
  }, [projectAssets]);

  // 1. Load Local Harddisk Assets (Source video, Render History, Custom Local Imports)
  useEffect(() => {
    const localItems: MediaAssetItem[] = [];

    // Current Working Local Video File (if open)
    if (sourceVideoFile?.path) {
      localItems.push({
        id: `current_source_${sourceVideoFile.path}`,
        title: `[ไฟล์ปัจจุบัน] ${sourceVideoFile.name}`,
        category: "video",
        durationMs: 60000,
        sourceUrl: convertFileSrc(sourceVideoFile.path),
        filePath: sourceVideoFile.path,
        isSeriesMedia: true,
        isCloudOnly: false,
        updatedAt: new Date().toISOString(),
        fileSizeLabel: sourceVideoFile.sizeBytes
          ? `${(sourceVideoFile.sizeBytes / 1024 / 1024).toFixed(1)} MB`
          : undefined,
      });
    }

    // Previously Rendered Files from LocalStorage
    try {
      const historyStr = localStorage.getItem("smartspec_render_history");
      if (historyStr) {
        const parsed = JSON.parse(historyStr);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            localItems.push({
              id: item.id || `local_render_${Math.random().toString(36).slice(2, 6)}`,
              title: item.fileName || item.title || "Rendered Video",
              category: "video",
              durationMs: item.durationMs || 5000,
              thumbnailUrl: item.thumbnailUrl,
              sourceUrl: item.outputPath ? convertFileSrc(item.outputPath) : item.sourceUrl || "",
              filePath: item.outputPath,
              isSeriesMedia: true,
              isCloudOnly: false,
              updatedAt: item.timestamp,
              fileSizeLabel: item.sizeBytes ? `${(item.sizeBytes / 1024 / 1024).toFixed(1)} MB` : undefined,
            });
          }
        }
      }
    } catch (e) {
      console.warn("Error reading local render history:", e);
    }

    // Custom Imported Local Assets from LocalStorage
    try {
      const customStr = localStorage.getItem("smartspec_custom_assets");
      if (customStr) {
        const parsed = JSON.parse(customStr);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (!localItems.some((x) => x.filePath === item.filePath)) {
              localItems.push({ ...item, isCloudOnly: false });
            }
          }
        }
      }
    } catch (e) {
      console.warn("Error reading custom assets:", e);
    }

    setLocalHistoryAssets(localItems);
  }, [sourceVideoFile?.path]);

  // Load available Series list from SmartAIHub Server
  useEffect(() => {
    invoke<{ items?: Array<{ seriesId: string; title: string }>; contractVersion?: string }>("worker_app_list_series")
      .then((res) => {
        const rawList = res?.items || (Array.isArray(res) ? res : []);
        if (Array.isArray(rawList) && rawList.length > 0) {
          const mapped: SeriesOptionItem[] = rawList.map((s) => ({
            seriesId: String(s.seriesId),
            title: s.title || `ซีรีส์ #${s.seriesId}`,
          }));
          setSeriesList(mapped);
          setSelectedSeriesId((curr) => {
            if (curr && mapped.some((m) => m.seriesId === curr)) return curr;
            return mapped[0].seriesId;
          });
        } else {
          setSeriesList([]);
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch series list:", err);
        setSeriesList([]);
      });
  }, []);

  // Query SmartAIHub Server REST API for Series, Episode Shots & Media
  useEffect(() => {
    if (!selectedSeriesId) {
      setCloudAssets([]);
      setIsLoadingSeries(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingSeries(true);
    setCloudError(null);

    invoke<{
      series?: { seriesId: string; title: string };
      episodes?: Array<{ episodeId: string; title: string }>;
      assets?: Array<{
        id: string | number;
        assetKind: string;
        pipelineState: string;
        sourceMetadataJson?: string | Record<string, unknown> | null;
        derivedArtifactJson?: string | Record<string, unknown> | null;
        updatedAt?: string | null;
        episodeId?: string;
        episodeTitle?: string;
        isCompoundShot?: boolean;
        isShotClip?: boolean;
        shotNumber?: number;
        sourceUrl?: string;
        thumbnailUrl?: string;
        durationMs?: number;
        title?: string;
      }>;
    }>("worker_app_get_series_media_workspace", {
      seriesId: String(selectedSeriesId),
      query: searchQuery.trim() || null,
      limit: typeof latestLimit === "number" ? latestLimit : 100,
    })
      .then((res) => {
        if (isCancelled) return;

        const cloudMapped: MediaAssetItem[] = (res?.assets || []).map((a, idx) => {
          let meta: Record<string, unknown> = {};
          let derived: Record<string, unknown> = {};
          try {
            meta = typeof a.sourceMetadataJson === "string" ? JSON.parse(a.sourceMetadataJson) : (a.sourceMetadataJson || {});
          } catch {
            meta = {};
          }
          try {
            derived = typeof a.derivedArtifactJson === "string" ? JSON.parse(a.derivedArtifactJson) : (a.derivedArtifactJson || {});
          } catch {
            derived = {};
          }

          const kind = (a.assetKind || "").toLowerCase();
          const isCompound = a.isCompoundShot === true || kind.includes("compound") || meta.stage === "compound_9_shot";
          const isShot = a.isShotClip === true || kind.includes("shot") || !isCompound;
          const isVid = kind.includes("video") || meta.format === "mp4" || meta.type === "video" || isCompound || isShot;
          const isAud = kind.includes("audio") || kind.includes("music") || kind.includes("sound");
          const isSfx = kind.includes("sfx");

          let cat: "video" | "broll" | "music" | "sfx" | "image" = "video";
          if (isSfx) cat = "sfx";
          else if (isAud) cat = "music";
          else if (kind.includes("image")) cat = "image";
          else if (kind.includes("broll")) cat = "broll";
          else cat = "video";

          const title = (meta.title as string) || (a as any).title || (meta.filename as string) || (derived.name as string) || (isCompound ? `Compound 9-Shot #${a.id || idx + 1}` : `Shot #${a.shotNumber || idx + 1}`);
          const dur = Number(a.durationMs || meta.durationMs || derived.durationMs || (isCompound ? 72000 : 8000));
          const thumb = (a.thumbnailUrl as string) || (derived.thumbnailUrl as string) || (meta.thumbnailUrl as string) || (meta.previewUrl as string) || (meta.url as string);
          const src = (a.sourceUrl as string) || (derived.videoUrl as string) || (meta.videoUrl as string) || (meta.url as string) || (derived.artifactUrl as string) || (meta.path as string) || "";

          return {
            id: `server_cloud_${a.id || idx}`,
            title,
            category: cat,
            durationMs: dur,
            thumbnailUrl: thumb,
            sourceUrl: src,
            isSeriesMedia: true,
            isCloudOnly: true,
            assetKind: a.assetKind,
            updatedAt: a.updatedAt || undefined,
            fileSizeLabel: meta.size ? `${Math.round(Number(meta.size) / 1024 / 1024)} MB` : undefined,
            episodeId: a.episodeId ? String(a.episodeId) : (meta.episodeId ? String(meta.episodeId) : undefined),
            episodeTitle: a.episodeTitle || (meta.episodeTitle as string) || undefined,
            isCompoundShot: isCompound,
            isShotClip: isShot,
            shotNumber: a.shotNumber || (meta.shotNumber as number) || (idx + 1),
            prompt: (meta.prompt as string) || undefined,
            model: (meta.model as string) || undefined,
            status: (meta.status as string) || a.pipelineState,
          };
        });

        // Set Episodes dropdown list dynamically from real server episodes and assets
        const rawEpisodes = Array.isArray(res?.episodes) ? res.episodes : [];
        const episodeMap = new Map<string, string>();
        for (const ep of rawEpisodes) {
          if (ep.episodeId) episodeMap.set(String(ep.episodeId), ep.title || `EP ${ep.episodeId}`);
        }
        for (const a of cloudMapped) {
          if (a.episodeId && !episodeMap.has(a.episodeId)) {
            episodeMap.set(a.episodeId, a.episodeTitle || `EP ${a.episodeId}`);
          }
        }

        const dynamicEpisodes: EpisodeOptionItem[] = Array.from(episodeMap.entries()).map(([episodeId, title]) => ({
          episodeId,
          title,
        }));

        setEpisodeList([
          { episodeId: "all", title: "ทุกตอน (All Episodes)" },
          ...dynamicEpisodes,
        ]);

        // Keep Series media strictly independent from Library presets
        setCloudAssets(cloudMapped);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.warn("Series media workspace REST API fetch error:", err);
        setCloudError(`ไม่สามารถดึงข้อมูลจาก SmartAIHub Server: ${String(err)}`);
        setCloudAssets([]);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingSeries(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedSeriesId, storageMode, searchQuery, latestLimit]);

  // Load Server Queue & Cross-workload Render History from SmartAIHub
  useEffect(() => {
    let isCancelled = false;

    // 1. Fetch Series Queue Jobs
    const fetchSeriesQueue = selectedSeriesId
      ? invoke<{ items?: Array<{ jobId: string; seriesId: string; jobType: string; domainStatus: string; transportStatus: string; createdAt: string; finishedAt?: string; seriesTitle?: string }> }>(
          "worker_app_get_series_queue",
          { seriesId: String(selectedSeriesId) }
        ).catch(() => null)
      : Promise.resolve(null);

    // 2. Fetch Cross-workload Job Renders & Summary from SmartAIHub
    const fetchJobSummary = invoke<{
      items?: Array<{
        id: string;
        jobType: string;
        status: string;
        createdAt: string;
        finishedAt?: string;
        inputJson?: Record<string, unknown>;
        outputJson?: Record<string, unknown>;
      }>;
    }>("worker_app_get_worker_job_summary").catch(() => null);

    Promise.all([fetchSeriesQueue, fetchJobSummary]).then(([queueRes, summaryRes]) => {
      if (isCancelled) return;

      const serverHistoryItems: MediaAssetItem[] = [];

      // Process Queue Jobs
      const queueJobs = queueRes?.items || (Array.isArray(queueRes) ? (queueRes as any) : []);
      for (const [idx, job] of queueJobs.entries()) {
        serverHistoryItems.push({
          id: `server_job_${job.jobId || idx}`,
          title: `[งานระบบ] ${job.seriesTitle ? job.seriesTitle + " · " : ""}${job.jobType} (${job.domainStatus || job.transportStatus})`,
          category: job.jobType.includes("audio") ? "music" : "video",
          durationMs: 60000,
          sourceUrl: "",
          isSeriesMedia: true,
          isCloudOnly: true,
          updatedAt: job.finishedAt || job.createdAt,
          episodeTitle: job.domainStatus,
        });
      }

      // Process Finished Renders from Job Summary
      const summaryJobs = summaryRes?.items || (Array.isArray(summaryRes) ? (summaryRes as any) : []);
      for (const [idx, job] of summaryJobs.entries()) {
        if (!job || !["completed", "finished", "succeeded"].includes(job.status)) continue;
        const out = job.outputJson || {};
        const inp = job.inputJson || {};
        const title =
          (out.fileName as string) ||
          (out.title as string) ||
          (inp.title as string) ||
          (inp.fileName as string) ||
          `[ผลลัพธ์เรนเดอร์] ${job.jobType} #${job.id.slice(0, 8)}`;

        const src = (out.videoUrl as string) || (out.artifactUrl as string) || (out.downloadUrl as string) || (out.outputPath as string) || "";
        const thumb = (out.thumbnailUrl as string) || (out.previewUrl as string) || undefined;
        const isAud = job.jobType.includes("audio") || job.jobType.includes("music") || job.jobType.includes("sound");

        serverHistoryItems.push({
          id: `summary_render_${job.id || idx}`,
          title,
          category: isAud ? "music" : "video",
          durationMs: Number(out.durationMs || inp.durationMs || 15000),
          thumbnailUrl: thumb,
          sourceUrl: src,
          filePath: (out.outputPath as string) || undefined,
          isSeriesMedia: true,
          isCloudOnly: !out.outputPath,
          updatedAt: job.finishedAt || job.createdAt,
          episodeTitle: `สถานะ: ${job.status}`,
        });
      }

      if (serverHistoryItems.length > 0) {
        setLocalHistoryAssets((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = serverHistoryItems.filter((item) => !existingIds.has(item.id));
          return [...prev, ...newItems];
        });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedSeriesId]);

  // Manual Refresh Server Data Handler
  const handleRefreshServerData = async () => {
    setIsLoadingSeries(true);
    setCloudError(null);
    void loadServerMediaHistory();
    void loadServerLibrary();
    try {
      const seriesRes = await invoke<{ items?: Array<{ seriesId: string; title: string }> }>("worker_app_list_series").catch(() => null);
      const rawSeriesList = seriesRes?.items || (Array.isArray(seriesRes) ? seriesRes : []);
      if (Array.isArray(rawSeriesList) && rawSeriesList.length > 0) {
        const mapped: SeriesOptionItem[] = rawSeriesList.map((s) => ({
          seriesId: String(s.seriesId),
          title: s.title || `ซีรีส์ #${s.seriesId}`,
        }));
        setSeriesList(mapped);
      }

      if (selectedSeriesId) {
        const mediaRes = await invoke<{
          series?: { seriesId: string; title: string };
          episodes?: Array<{ episodeId: string; title: string }>;
          assets?: Array<{
            id: string | number;
            assetKind: string;
            pipelineState: string;
            sourceMetadataJson?: string | Record<string, unknown> | null;
            derivedArtifactJson?: string | Record<string, unknown> | null;
            updatedAt?: string | null;
            episodeId?: string;
            episodeTitle?: string;
            isCompoundShot?: boolean;
            isShotClip?: boolean;
            shotNumber?: number;
            sourceUrl?: string;
            thumbnailUrl?: string;
            durationMs?: number;
            title?: string;
          }>;
        }>("worker_app_get_series_media_workspace", {
          seriesId: String(selectedSeriesId),
          query: searchQuery.trim() || null,
          limit: typeof latestLimit === "number" ? latestLimit : 50,
        }).catch(() => null);

        if (mediaRes?.assets) {
          const cloudMapped: MediaAssetItem[] = mediaRes.assets.map((a, idx) => {
            let meta: Record<string, unknown> = {};
            let derived: Record<string, unknown> = {};
            try { meta = typeof a.sourceMetadataJson === "string" ? JSON.parse(a.sourceMetadataJson) : (a.sourceMetadataJson || {}); } catch { meta = {}; }
            try { derived = typeof a.derivedArtifactJson === "string" ? JSON.parse(a.derivedArtifactJson) : (a.derivedArtifactJson || {}); } catch { derived = {}; }
            const kind = (a.assetKind || "").toLowerCase();
            const isCompound = a.isCompoundShot === true || kind.includes("compound") || meta.stage === "compound_9_shot";
            const isShot = a.isShotClip === true || kind.includes("shot") || !isCompound;
            const isVid = kind.includes("video") || meta.format === "mp4" || meta.type === "video" || isCompound || isShot;
            const isAud = kind.includes("audio") || kind.includes("music") || kind.includes("sound");
            const isSfx = kind.includes("sfx");
            let cat: "video" | "broll" | "music" | "sfx" | "image" = "video";
            if (isSfx) cat = "sfx";
            else if (isAud) cat = "music";
            else if (kind.includes("image")) cat = "image";
            else if (kind.includes("broll")) cat = "broll";
            else cat = "video";

            const title = (meta.title as string) || (a as any).title || (meta.filename as string) || (derived.name as string) || (isCompound ? `Compound 9-Shot #${a.id || idx + 1}` : `Shot #${a.shotNumber || idx + 1}`);
            const dur = Number(a.durationMs || meta.durationMs || derived.durationMs || (isCompound ? 72000 : 8000));
            const thumb = (a.thumbnailUrl as string) || (derived.thumbnailUrl as string) || (meta.thumbnailUrl as string) || (meta.previewUrl as string) || (meta.url as string);
            const src = (a.sourceUrl as string) || (derived.videoUrl as string) || (meta.videoUrl as string) || (meta.url as string) || (derived.artifactUrl as string) || (meta.path as string) || "";

            return {
              id: `server_cloud_${a.id || idx}`,
              title,
              category: cat,
              durationMs: dur,
              thumbnailUrl: thumb,
              sourceUrl: src,
              isSeriesMedia: true,
              isCloudOnly: true,
              assetKind: a.assetKind,
              updatedAt: a.updatedAt || undefined,
              episodeId: a.episodeId ? String(a.episodeId) : (meta.episodeId ? String(meta.episodeId) : undefined),
              episodeTitle: a.episodeTitle || (meta.episodeTitle as string) || undefined,
              isCompoundShot: isCompound,
              isShotClip: isShot,
              shotNumber: a.shotNumber || (meta.shotNumber as number) || (idx + 1),
              prompt: (meta.prompt as string) || undefined,
              model: (meta.model as string) || undefined,
              status: (meta.status as string) || a.pipelineState,
            };
          });

          // Set Episodes dropdown list dynamically
          const rawEpisodes = Array.isArray(mediaRes?.episodes) ? mediaRes.episodes : [];
          const episodeMap = new Map<string, string>();
          for (const ep of rawEpisodes) {
            if (ep.episodeId) episodeMap.set(String(ep.episodeId), ep.title || `EP ${ep.episodeId}`);
          }
          for (const a of cloudMapped) {
            if (a.episodeId && !episodeMap.has(a.episodeId)) {
              episodeMap.set(a.episodeId, a.episodeTitle || `EP ${a.episodeId}`);
            }
          }

          const dynamicEpisodes: EpisodeOptionItem[] = Array.from(episodeMap.entries()).map(([episodeId, title]) => ({
            episodeId,
            title,
          }));

          setEpisodeList([
            { episodeId: "all", title: "ทุกตอน (All Episodes)" },
            ...dynamicEpisodes,
          ]);

          setCloudAssets(cloudMapped);
        }
      }
    } catch (err) {
      console.warn("Refresh server data failed:", err);
      setCloudError(`ไม่สามารถดึงข้อมูลจาก Server: ${String(err)}`);
    } finally {
      setIsLoadingSeries(false);
    }
  };

  // Episode-filtered assets for current Series view
  const currentEpisodeSeriesAssets = useMemo(() => {
    if (selectedEpisodeId === "all") return cloudAssets;
    return cloudAssets.filter((a) => a.episodeId === selectedEpisodeId);
  }, [cloudAssets, selectedEpisodeId]);

  const shotsCount = useMemo(() => {
    return currentEpisodeSeriesAssets.filter((a) => a.isShotClip || a.assetKind?.includes("shot")).length;
  }, [currentEpisodeSeriesAssets]);

  const compoundsCount = useMemo(() => {
    return currentEpisodeSeriesAssets.filter((a) => a.isCompoundShot || a.assetKind?.includes("compound")).length;
  }, [currentEpisodeSeriesAssets]);

  // Filtered Assets Computation with Series/Episode, Tabs, Limit, Search
  const filteredAssets = useMemo(() => {
    let list: MediaAssetItem[] = [];

    if (storageMode === "cloud") {
      if (tab === "history") {
        // Media History tab: strictly independent
        list = [...serverMediaHistory];
      } else if (tab === "library") {
        // Server Library tab: strictly independent
        list = [...serverLibraryItems];
      } else {
        // Series Media views (all, shots, compounds, broll, music, sfx)
        // Strictly independent from Library and Media History!
        list = [...cloudAssets];
      }
    } else {
      list = tab === "history"
        ? [...localHistoryAssets]
        : tab === "bin"
        ? [...binAssets]
        : Array.from(new Map([...binAssets, ...localHistoryAssets].map((item) => [item.id, item])).values());
    }

    // Filter by Episode (for Series media in Cloud mode)
    if (storageMode === "cloud" && tab !== "history" && tab !== "library" && selectedEpisodeId !== "all") {
      list = list.filter((item) => item.episodeId === selectedEpisodeId);
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((item) =>
        item.title.toLowerCase().includes(q) ||
        (item.prompt && item.prompt.toLowerCase().includes(q)) ||
        (item.model && item.model.toLowerCase().includes(q)) ||
        (item.episodeTitle && item.episodeTitle.toLowerCase().includes(q))
      );
    }

    // Filter by Tab
    list = list.filter((item) => {
      if (tab === "bin") return binAssets.some((b) => b.id === item.id);
      if (tab === "history") {
        if (storageMode === "cloud") {
          return serverMediaHistory.some((h) => h.id === item.id);
        }
        return localHistoryAssets.some((h) => h.id === item.id);
      }
      if (tab === "library") {
        return serverLibraryItems.some((lib) => lib.id === item.id);
      }
      if (tab === "shots") return item.isShotClip === true || item.assetKind?.includes("shot");
      if (tab === "compounds") return item.isCompoundShot === true || item.assetKind?.includes("compound");
      if (tab === "broll") return item.category === "video" || item.category === "broll" || item.category === "image";
      if (tab === "music") return item.category === "music";
      if (tab === "sfx") return item.category === "sfx";
      return true;
    });

    // Sort: Compound videos and latest shots in logical order
    // If viewing series shots/compounds, sort by episodeNumber asc, then compound first or shotNumber asc
    if (storageMode === "cloud" && tab !== "history" && tab !== "library") {
      list.sort((a, b) => {
        const epA = a.episodeId ? parseInt(a.episodeId.replace(/\D/g, "") || "0", 10) : 0;
        const epB = b.episodeId ? parseInt(b.episodeId.replace(/\D/g, "") || "0", 10) : 0;
        if (epA !== epB) return epA - epB;

        // If same episode, compound 9-shot video comes first, then shots 1..9
        if (a.isCompoundShot && !b.isCompoundShot) return -1;
        if (!a.isCompoundShot && b.isCompoundShot) return 1;
        if (typeof a.shotNumber === "number" && typeof b.shotNumber === "number") return a.shotNumber - b.shotNumber;

        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return timeB - timeA;
      });
    } else {
      // Sort by updatedAt descending
      list.sort((a, b) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    // Apply Limit (Latest N limit)
    if (typeof latestLimit === "number" && latestLimit > 0) {
      list = list.slice(0, latestLimit);
    }

    return list;
  }, [storageMode, cloudAssets, serverMediaHistory, serverLibraryItems, binAssets, localHistoryAssets, selectedEpisodeId, searchQuery, tab, latestLimit]);

  if (!isOpen) return null;

  const handleImportLocalFiles = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Media Files",
            extensions: ["mp4", "mov", "mkv", "avi", "webm", "mp3", "wav", "aac", "ogg", "jpg", "jpeg", "png", "webp"],
          },
        ],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const newItems: MediaAssetItem[] = paths.map((p) => {
        const name = p.split(/[\\/]/).pop() || "Imported Media";
        const ext = name.split(".").pop()?.toLowerCase() || "";
        const isAudio = ["mp3", "wav", "aac", "ogg", "flac", "m4a"].includes(ext);
        const isImage = ["jpg", "jpeg", "png", "webp", "svg"].includes(ext);
        const cat = isAudio ? "music" : isImage ? "image" : "video";
        return {
          id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: name,
          category: cat,
          durationMs: isAudio ? 30000 : isImage ? 3000 : 5000,
          sourceUrl: convertFileSrc(p),
          filePath: p,
          isSeriesMedia: true,
          updatedAt: new Date().toISOString(),
        };
      });

      try {
        const stored = localStorage.getItem("smartspec_custom_assets");
        const list = stored ? JSON.parse(stored) : [];
        const combined = [...newItems, ...list].slice(0, 100);
        localStorage.setItem("smartspec_custom_assets", JSON.stringify(combined));
      } catch (e) {
        console.warn("Save custom assets error:", e);
      }

      setLocalHistoryAssets((prev) => [...newItems, ...prev]);
      setTab("history");
    } catch (err) {
      console.warn("Import files error:", err);
    }
  };

  // Download cloud-only asset to workspace and return local file path.
  // Returns the resolved file path (local or original URL) after download completes.
  const handleDownloadCloudCache = async (asset: MediaAssetItem): Promise<string> => {
    if (!asset.sourceUrl && !asset.filePath) return asset.filePath || "";

    // If already cached locally, skip download
    if (asset.filePath && !asset.isCloudOnly) return asset.filePath;

    setDownloadProgress((prev) => ({ ...prev, [asset.id]: 15 }));
    try {
      const srcUrl = asset.sourceUrl || "";
      // Detect extension from URL path (before any query string)
      const urlPath = srcUrl.split("?")[0].split("#")[0];
      const extFromUrl = urlPath.match(/\.(mp4|webm|mov|mkv|mp3|wav|ogg|aac|png|jpg|jpeg|webp)$/i)?.[1];
      const ext = extFromUrl
        ? `.${extFromUrl.toLowerCase()}`
        : asset.category === "image"
        ? ".jpg"
        : asset.category === "music" || asset.category === "sfx"
        ? ".mp3"
        : ".mp4";
      const cleanFileName = (asset.title || `shot_${asset.id}`)
        .replace(/[^a-zA-Z0-9_\-\.]/g, "_")
        .replace(/\.[^.]+$/, "") + ext;

      const targetFolder = workspacePath ? `${workspacePath.replace(/[\/\\]$/, "")}/series_cache` : "";
      const targetFilePath = targetFolder ? `${targetFolder}/${cleanFileName}` : (asset.filePath || srcUrl);

      setDownloadProgress((prev) => ({ ...prev, [asset.id]: 45 }));

      if (targetFolder && srcUrl && srcUrl.startsWith("http")) {
        const resp = await fetch(srcUrl);
        const arrayBuf = await resp.arrayBuffer();
        
        let binary = "";
        const bytes = new Uint8Array(arrayBuf);
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
        }
        const base64 = btoa(binary);

        await invoke("worker_app_save_binary_file", {
          filePath: targetFilePath,
          base64Data: base64,
        });
      }

      setDownloadProgress((prev) => ({ ...prev, [asset.id]: 100 }));

      // Update asset status to cached locally in workspace
      const updateCached = (item: MediaAssetItem) =>
        item.id === asset.id ? { ...item, isCloudOnly: false, filePath: targetFilePath } : item;
      setCloudAssets((prev) => prev.map(updateCached));
      setServerLibraryItems((prev) => prev.map(updateCached));
      setServerMediaHistory((prev) => prev.map(updateCached));

      return targetFilePath;
    } catch (err) {
      console.warn("Download series shot cache error:", err);
      // Fall back to URL if download fails
      return asset.filePath || asset.sourceUrl || "";
    } finally {
      setTimeout(() => {
        setDownloadProgress((prev) => {
          const next = { ...prev };
          delete next[asset.id];
          return next;
        });
      }, 1200);
    }
  };

  // Add asset to a specific track. For cloud-only assets, downloads to workspace first
  // so the clip has a real local filePath instead of a temporary cloud URL.
  const handleAddAssetToTrack = async (asset: MediaAssetItem, trackId: string) => {
    let resolvedFilePath = asset.filePath;
    let resolvedUrl = asset.sourceUrl;

    if (asset.isCloudOnly && asset.sourceUrl?.startsWith("http")) {
      // Download first — block the add until we have a real local path
      const cached = await handleDownloadCloudCache(asset);
      if (cached && !cached.startsWith("http")) {
        resolvedFilePath = cached;
        resolvedUrl = asset.sourceUrl; // keep original as fallback
      } else {
        // No workspace path or download failed — use URL directly
        resolvedUrl = cached || asset.sourceUrl;
      }
    }

    const clip: NleClip = {
      id: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: asset.title,
      timelineStartMs: currentTimeMs,
      durationMs: asset.durationMs,
      sourceType: resolvedFilePath ? "local_file" : "smartaihub_library",
      sourcePath: resolvedFilePath,
      sourceUrl: resolvedUrl,
      volume: asset.category === "music" ? 0.35 : 0.85,
      transform:
        asset.category === "broll" || asset.category === "video" || asset.category === "image"
          ? { x: 0.5, y: 0.5, scale: 1.0, opacity: 1.0 }
          : undefined,
    };

    onAddClip(trackId, clip);
  };

  // Legacy sync wrapper (used by drag-and-drop path)
  const handleAddAsset = (asset: MediaAssetItem) => {
    const trackId =
      asset.category === "music" ? "track_a2" : asset.category === "sfx" ? "track_a3" : "track_v2";
    void handleAddAssetToTrack(asset, trackId);
  };

  const historyAssetCount = storageMode === "cloud" ? serverMediaHistory.length : localHistoryAssets.length;

  return (
    <aside className="asset-drawer-right-panel" onClick={(e) => e.stopPropagation()}>
      {/* Header with Import and Collapse Buttons */}
      <div className="drawer-header">
        <div className="drawer-title-group">
          <span className="drawer-icon">🗂️</span>
          <div>
            <h3>SmartAIHub Cloud Media & Library</h3>
            <p className="drawer-subtitle">
              เลือกเรื่อง/ตอน ดึงช็อตและ Compound Video ลากวางบน Timeline ได้ทันที
            </p>
          </div>
        </div>
        <div className="drawer-header-actions">
          <button
            type="button"
            className="drawer-import-btn"
            onClick={() => void handleImportLocalFiles()}
            title="นำเข้าไฟล์วิดีโอ/เสียง/ภาพจากเครื่องเข้าสู่ Library"
          >
            ➕ นำเข้าไฟล์
          </button>
          <button
            type="button"
            className="drawer-collapse-btn"
            onClick={onClose}
            title="ยุบปิดพาเนลไปทางขวา (Collapse)"
          >
            ▶ ยุบแผง
          </button>
        </div>
      </div>

      {/* Storage Mode Toggle (Local vs Cloud Server) */}
      <div className="drawer-mode-toggle-bar">
        <button
          type="button"
          className={`drawer-mode-pill ${storageMode === "local" ? "active" : ""}`}
          onClick={() => setStorageMode("local")}
        >
          💻 ไฟล์ในเครื่อง (Local)
        </button>
        <button
          type="button"
          className={`drawer-mode-pill ${storageMode === "cloud" ? "active" : ""}`}
          onClick={() => setStorageMode("cloud")}
        >
          ☁️ SmartAIHub Server
        </button>
      </div>

      {/* Series & Episode Dropdown Hierarchy (Cloud Mode Only) */}
      {storageMode === "cloud" && (
        <div
          className="drawer-series-selector-row"
          style={{
            display: "flex",
            gap: "8px",
            padding: "8px 12px",
            background: "rgba(15, 23, 42, 0.6)",
            borderBottom: "1px solid rgba(56, 189, 248, 0.15)",
          }}
        >
          <select
            value={selectedSeriesId}
            onChange={(e) => setSelectedSeriesId(e.target.value)}
            style={{
              flex: 1,
              background: "#1e293b",
              color: "#e2e8f0",
              border: "1px solid #38bdf8",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "0.8rem",
            }}
            title="เลือกเรื่อง / ซีรีส์ (Series)"
          >
            {seriesList.map((s) => (
              <option key={s.seriesId} value={s.seriesId}>
                🎬 {s.title}
              </option>
            ))}
          </select>

          <select
            value={selectedEpisodeId}
            onChange={(e) => setSelectedEpisodeId(e.target.value)}
            style={{
              flex: 1,
              background: "#1e293b",
              color: "#e2e8f0",
              border: "1px solid #38bdf8",
              borderRadius: "6px",
              padding: "4px 8px",
              fontSize: "0.8rem",
            }}
            title="เลือกตอน / Episode"
          >
            {episodeList.map((ep) => (
              <option key={ep.episodeId} value={ep.episodeId}>
                📺 {ep.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void handleRefreshServerData()}
            disabled={isLoadingSeries}
            style={{
              background: "linear-gradient(135deg, #0284c7, #2563eb)",
              color: "#ffffff",
              border: "1px solid #38bdf8",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            title="ดึงข้อมูลย้อนหลัง ซีรีส์ ช็อต และประวัติเรนเดอร์จาก SmartAIHub Server อีกครั้ง"
          >
            {isLoadingSeries ? "⏳ ดึง..." : "🔄 ดึงข้อมูลจาก Server"}
          </button>
        </div>
      )}

      {/* Search Input & Limit Filter Row */}
      <div className="drawer-search-row" style={{ gap: "6px" }}>
        <input
          type="text"
          className="drawer-search-input"
          placeholder="🔍 ค้นหา ช็อต, Compound, วิดีโอ หรือเสียง..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <select
          value={String(latestLimit)}
          onChange={(e) => setLatestLimit(e.target.value === "all" ? "all" : Number(e.target.value))}
          style={{
            background: "#1e293b",
            color: "#94a3b8",
            border: "1px solid rgba(148, 163, 184, 0.3)",
            borderRadius: "6px",
            padding: "4px 6px",
            fontSize: "0.75rem",
          }}
          title="จำกัดจำนวนรายการย้อนหลังล่าสุด"
        >
          <option value="10">ล่าสุด 10 รายการ</option>
          <option value="25">ล่าสุด 25 รายการ</option>
          <option value="50">ล่าสุด 50 รายการ</option>
          <option value="all">ทั้งหมด (All)</option>
        </select>
        {searchQuery && (
          <button
            type="button"
            className="drawer-search-clear-btn"
            onClick={() => setSearchQuery("")}
            title="ล้างคำค้นหา"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="drawer-tabs-scroller">
        <button
          type="button"
          className={`drawer-tab-chip ${tab === "all" ? "active" : ""}`}
          onClick={() => setTab("all")}
        >
          📋 ทั้งหมด ({storageMode === "cloud" ? currentEpisodeSeriesAssets.length : binAssets.length + localHistoryAssets.length})
        </button>
        {storageMode === "cloud" && (
          <button
            type="button"
            className={`drawer-tab-chip ${tab === "library" ? "active" : ""}`}
            onClick={() => setTab("library")}
            style={{ borderColor: tab === "library" ? "#10b981" : undefined, color: tab === "library" ? "#10b981" : undefined }}
          >
            📚 คลังสื่อ (Library) {serverLibraryItems.length > 0 ? `(${serverLibraryItems.length})` : ""}
          </button>
        )}
        {storageMode === "cloud" && (
          <>
            <button
              type="button"
              className={`drawer-tab-chip ${tab === "shots" ? "active" : ""}`}
              onClick={() => setTab("shots")}
              style={{ borderColor: tab === "shots" ? "#0ea5e9" : undefined, color: tab === "shots" ? "#0ea5e9" : undefined }}
            >
              🎬 ช็อตย่อย (Shots) {shotsCount > 0 ? `(${shotsCount})` : ""}
            </button>
            <button
              type="button"
              className={`drawer-tab-chip ${tab === "compounds" ? "active" : ""}`}
              onClick={() => setTab("compounds")}
              style={{ borderColor: tab === "compounds" ? "#a855f7" : undefined, color: tab === "compounds" ? "#a855f7" : undefined }}
            >
              📦 ช็อตรวม (Compounds) {compoundsCount > 0 ? `(${compoundsCount})` : ""}
            </button>
          </>
        )}
        <button
          type="button"
          className={`drawer-tab-chip ${tab === "bin" ? "active" : ""}`}
          onClick={() => setTab("bin")}
          style={{ borderColor: tab === "bin" ? "#f59e0b" : undefined, color: tab === "bin" ? "#f59e0b" : undefined }}
        >
          📦 Media Bin ({binAssets.length})
        </button>
        <button
          type="button"
          className={`drawer-tab-chip ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          🕒 Media History {historyAssetCount > 0 ? `(${historyAssetCount})` : ""}
        </button>
        <button
          type="button"
          className={`drawer-tab-chip ${tab === "broll" ? "active" : ""}`}
          onClick={() => setTab("broll")}
        >
          🎥 วิดีโอ & B-Roll
        </button>
        <button
          type="button"
          className={`drawer-tab-chip ${tab === "music" ? "active" : ""}`}
          onClick={() => setTab("music")}
        >
          🎵 เพลง BGM
        </button>
      </div>

      {/* Items List / Cards */}
      <div className="drawer-items-container">
        {(isLoadingSeries || (isLoadingHistory && tab === "history") || (isLoadingLibrary && tab === "library")) && (
          <div className="drawer-loading-indicator">
            <span>⏳ กำลังดึงรายการ{tab === "history" ? "ประวัติสื่อ (Media History)" : tab === "library" ? "คลังสื่อ (Library)" : "ช็อตและวิดีโอ"}จาก SmartAIHub Server...</span>
          </div>
        )}

        {storageMode === "cloud" && cloudError && !isLoadingSeries && (
          <div
            className="drawer-cloud-error-box"
            style={{
              margin: "8px 12px",
              padding: "10px 14px",
              borderRadius: "8px",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              fontSize: "12px",
            }}
          >
            ⚠️ {cloudError}
          </div>
        )}

        {filteredAssets.length === 0 ? (
          <div className="drawer-empty-state">
            <span className="drawer-empty-icon">☁️</span>
            <p>
              {storageMode === "cloud"
                ? `ไม่พบสื่อประเภท "${tab}" ในหมวดที่เลือกบน SmartAIHub Server`
                : "ไม่พบรายการสื่อในเครื่องที่ตรงกับเงื่อนไข"}
            </p>
            {storageMode === "local" ? (
              <button
                type="button"
                className="drawer-empty-import-btn"
                onClick={() => void handleImportLocalFiles()}
              >
                ➕ เลือกไฟล์จากเครื่องเข้าสู่ Library
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                <span className="drawer-empty-hint">
                  กรุณาตรวจสอบว่าเลือกเรื่องและตอนที่มีการอัปโหลดวิดีโอเรียบร้อยแล้ว หรือกดปุ่มดึงข้อมูลย้อนหลังด้านล่าง
                </span>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                  <button
                    type="button"
                    className="drawer-empty-import-btn"
                    onClick={() => void handleRefreshServerData()}
                    style={{ background: "#0284c7" }}
                  >
                    🔄 ดึงข้อมูลจาก SmartAIHub Server อีกครั้ง
                  </button>
                  <button
                    type="button"
                    className="drawer-empty-import-btn"
                    onClick={() => {
                      setTab("all");
                      setSelectedEpisodeId("all");
                      setSearchQuery("");
                    }}
                    style={{ background: "#334155" }}
                  >
                    🌐 แสดงสื่อ SmartAIHub ทั้งหมด (Reset Filter)
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          filteredAssets.map((item) => {
            const isAudio = item.category === "music" || item.category === "sfx";
            const isImg = item.category === "image";
            const isVideoItem = !isAudio && !isImg;
            const targetTrackLabel =
              item.category === "music"
                ? "BGM (A2)"
                : item.category === "sfx"
                ? "SFX (A3)"
                : isImg
                ? "ภาพ (V2)"
                : "B-Roll (V2)";

            const prog = downloadProgress[item.id];

            return (
              <div
                key={item.id}
                className="drawer-asset-item-card"
                draggable={true}
                onDragStart={(e) => {
                  if (item.isCloudOnly) {
                    void handleDownloadCloudCache(item);
                  }
                  const assetPayload = JSON.stringify({
                    type: "smartaihub_asset",
                    id: item.id,
                    title: item.title,
                    category: item.category,
                    sourceUrl: item.sourceUrl,
                    filePath: item.filePath,
                    durationMs: item.durationMs,
                    thumbnailUrl: item.thumbnailUrl,
                  });
                  e.dataTransfer.setData("application/json", assetPayload);
                  e.dataTransfer.setData("text/plain", assetPayload);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                title="สามารถคลิกปุ่มวาง หรือลากการ์ดนี้ไปวางบน Timeline / Canvas ได้ทันที"
              >
                <div className="drawer-card-left">
                  <AssetThumbnailCard item={item} />
                </div>

                <div className="drawer-card-content">
                  <div className="drawer-card-top-row">
                    <strong className="drawer-card-title">{item.title}</strong>
                    {item.isCloudOnly ? (
                      <span
                        className="drawer-history-tag cloud-tag"
                        style={{ background: "#2563eb", color: "#ffffff", padding: "2px 6px", borderRadius: "4px", fontSize: "10px" }}
                      >
                        ☁️ Cloud
                      </span>
                    ) : (
                      <span
                        className="drawer-history-tag"
                        style={{ background: "rgba(16, 185, 129, 0.2)", color: "#34d399", padding: "2px 6px", borderRadius: "4px", fontSize: "10px" }}
                      >
                        ✅ Cached
                      </span>
                    )}
                  </div>

                  {item.prompt && (
                    <div
                      style={{
                        fontSize: "0.74rem",
                        color: "#94a3b8",
                        marginTop: "2px",
                        marginBottom: "4px",
                        lineHeight: "1.3",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        wordBreak: "break-word",
                      }}
                      title={item.prompt}
                    >
                      {item.prompt}
                    </div>
                  )}

                  <div className="drawer-card-meta">
                    <span className="drawer-meta-pill">
                      ⏱ {(item.durationMs / 1000).toFixed(1)}s
                    </span>
                    <span className="drawer-meta-pill category-pill">
                      {isImg ? "🖼️ รูปภาพ" : item.isCompoundShot ? "Compound" : item.isShotClip ? "Shot Clip" : isAudio ? "Audio" : "Video"}
                    </span>
                    {item.model && (
                      <span
                        className="drawer-meta-pill"
                        style={{
                          background: "rgba(99, 102, 241, 0.15)",
                          color: "#a5b4fc",
                          border: "1px solid rgba(99, 102, 241, 0.3)",
                          fontFamily: "monospace",
                          fontSize: "0.72rem",
                        }}
                        title={`โมเดล AI: ${item.model}`}
                      >
                        🤖 {item.model}
                      </span>
                    )}
                    {item.status && (
                      <span
                        className="drawer-meta-pill"
                        style={{
                          background: ["completed", "finished", "succeeded"].includes(item.status.toLowerCase())
                            ? "rgba(16, 185, 129, 0.15)"
                            : ["failed", "cancelled"].includes(item.status.toLowerCase())
                            ? "rgba(239, 68, 68, 0.15)"
                            : "rgba(14, 165, 233, 0.15)",
                          color: ["completed", "finished", "succeeded"].includes(item.status.toLowerCase())
                            ? "#34d399"
                            : ["failed", "cancelled"].includes(item.status.toLowerCase())
                            ? "#f87171"
                            : "#38bdf8",
                          border: `1px solid ${
                            ["completed", "finished", "succeeded"].includes(item.status.toLowerCase())
                              ? "rgba(16, 185, 129, 0.3)"
                              : ["failed", "cancelled"].includes(item.status.toLowerCase())
                              ? "rgba(239, 68, 68, 0.3)"
                              : "rgba(14, 165, 233, 0.3)"
                          }`,
                        }}
                      >
                        {["completed", "finished", "succeeded"].includes(item.status.toLowerCase())
                          ? "✅ เสร็จแล้ว"
                          : ["failed", "cancelled"].includes(item.status.toLowerCase())
                          ? "❌ ไม่สำเร็จ"
                          : "⏳ ประมวลผล"}
                      </span>
                    )}
                    {item.fileSizeLabel && (
                      <span className="drawer-meta-pill size-pill">{item.fileSizeLabel}</span>
                    )}
                  </div>

                  {typeof prog === "number" && (
                    <div className="download-progress-bar" style={{ marginTop: "4px" }}>
                      <div
                        style={{
                          height: "4px",
                          background: "#0ea5e9",
                          width: `${prog}%`,
                          borderRadius: "2px",
                          transition: "width 0.2s",
                        }}
                      />
                      <span style={{ fontSize: "0.72rem", color: "#38bdf8" }}>⏳ กำลัง Sync {prog}%</span>
                    </div>
                  )}

                  <div className="drawer-card-actions">
                    {/* Primary add button — downloads first for cloud assets */}
                    <button
                      type="button"
                      className="drawer-add-btn"
                      onClick={() => void handleAddAssetToTrack(
                        item,
                        item.category === "music" ? "track_a2" : item.category === "sfx" ? "track_a3" : "track_v2"
                      )}
                      title={`วางลงในแทร็ก ${targetTrackLabel}${item.isCloudOnly ? " (จะ download ก่อน)" : ""}`}
                    >
                      ➕ วางลง {targetTrackLabel}
                    </button>

                    {/* V1 Master button — video/broll only */}
                    {isVideoItem && (
                      <button
                        type="button"
                        className="drawer-add-btn"
                        style={{
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#34d399",
                          border: "1px solid rgba(16, 185, 129, 0.35)",
                        }}
                        onClick={() => void handleAddAssetToTrack(item, "track_v1")}
                        title={`วางลงใน V1 Master Track${item.isCloudOnly ? " (จะ download ก่อน)" : ""}`}
                      >
                        🎬 วางลง V1 (Master)
                      </button>
                    )}

                    {/* Manual sync button — only when not already downloading */}
                    {item.isCloudOnly && typeof prog !== "number" && (
                      <button
                        type="button"
                        onClick={() => void handleDownloadCloudCache(item)}
                        style={{
                          background: "rgba(14, 165, 233, 0.15)",
                          color: "#38bdf8",
                          border: "1px solid rgba(14, 165, 233, 0.3)",
                          borderRadius: "4px",
                          padding: "2px 8px",
                          fontSize: "0.74rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        title="ดาวน์โหลดไฟล์วิดีโอจาก Cloud ลง Cache ในเครื่อง"
                      >
                        📥 Sync
                      </button>
                    )}

                    <span className="drawer-drag-hint">✥ ลากไปวางได้</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="drawer-footer-bar">
        <span className="footer-drag-info">
          💡 สามารถ Drag & Drop การ์ดช็อตไปวางบน Timeline หรือหน้าจอ Preview Canvas ได้โดยตรง
        </span>
      </div>
    </aside>
  );
}

function activeModeAssetsLength(
  mode: "local" | "cloud",
  cloud: MediaAssetItem[],
  bin: MediaAssetItem[],
  local: MediaAssetItem[],
  history?: MediaAssetItem[],
  library?: MediaAssetItem[]
): number {
  return mode === "cloud"
    ? cloud.length + (history ? history.length : 0) + (library ? library.length : 0)
    : bin.length + local.length;
}
