import React, { useState, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NleClip } from "../../types/nleProject";

export interface AiModelItem {
  modelId: string;
  name: string;
  category: string; // "text_to_image" | "image_to_image" | "video" | "audio"
  isEnabled: boolean;
  description?: string;
  supportsImageInput: boolean;
  maxImageInputs: number;
  supportsVideoInput: boolean;
  supportsAudioInput: boolean;
}

interface AiMediaStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTimeMs: number;
  onAddMediaClip: (trackId: string, clip: NleClip) => void;
}

export function AiMediaStudioModal({
  isOpen,
  onClose,
  currentTimeMs,
  onAddMediaClip,
}: AiMediaStudioModalProps) {
  const [activeTab, setActiveTab] = useState<"image" | "video" | "audio" | "settings">("image");

  // Dynamic Models List from Server API
  const [modelsList, setModelsList] = useState<AiModelItem[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Model Preferences (Saved in LocalStorage)
  const [textToImageModel, setTextToImageModel] = useState<string>(() => {
    try {
      return localStorage.getItem("smartspec_ai_t2i_model") || "gpt-image-2";
    } catch {
      return "gpt-image-2";
    }
  });

  const [imageToImageModel, setImageToImageModel] = useState<string>(() => {
    try {
      return localStorage.getItem("smartspec_ai_i2i_model") || "gpt-image-2-img2img";
    } catch {
      return "gpt-image-2-img2img";
    }
  });

  const [videoModelPreference, setVideoModelPreference] = useState<string>(() => {
    try {
      return localStorage.getItem("smartspec_ai_video_model") || "minimax-video-01";
    } catch {
      return "minimax-video-01";
    }
  });

  const [audioModelPreference, setAudioModelPreference] = useState<string>(() => {
    try {
      return localStorage.getItem("smartspec_ai_audio_model") || "openai-tts-1-hd";
    } catch {
      return "openai-tts-1-hd";
    }
  });

  // Fetch Enabled AI Models from Server API
  useEffect(() => {
    if (!isOpen) return;
    setIsLoadingModels(true);
    invoke<{ items?: AiModelItem[] }>("worker_app_list_ai_models")
      .then((res) => {
        const raw = res?.items || (Array.isArray(res) ? res : []);
        const enabledOnly = raw.filter((m) => m.isEnabled !== false);
        setModelsList(enabledOnly);
      })
      .catch((err) => {
        console.warn("Failed to load AI models list from server:", err);
      })
      .finally(() => {
        setIsLoadingModels(false);
      });
  }, [isOpen]);

  // Model categories filtered by is_enabled
  const textToImageModels = useMemo(
    () => modelsList.filter((m) => m.category === "text_to_image"),
    [modelsList]
  );
  const imageToImageModels = useMemo(
    () => modelsList.filter((m) => m.category === "image_to_image"),
    [modelsList]
  );
  const videoModels = useMemo(
    () => modelsList.filter((m) => m.category === "video"),
    [modelsList]
  );
  const audioModels = useMemo(
    () => modelsList.filter((m) => m.category === "audio"),
    [modelsList]
  );

  // Save Preferences to Local Storage
  const savePreferences = (t2i: string, i2i: string, vid: string, aud: string) => {
    setTextToImageModel(t2i);
    setImageToImageModel(i2i);
    setVideoModelPreference(vid);
    setAudioModelPreference(aud);
    try {
      localStorage.setItem("smartspec_ai_t2i_model", t2i);
      localStorage.setItem("smartspec_ai_i2i_model", i2i);
      localStorage.setItem("smartspec_ai_video_model", vid);
      localStorage.setItem("smartspec_ai_audio_model", aud);
    } catch {
      // ignore localstorage quota error
    }
  };

  // Image Generation States
  const [imageGenMode, setImageGenMode] = useState<"text_to_image" | "image_to_image">("text_to_image");
  const [imagePrompt, setImagePrompt] = useState("");
  const [attachedRefImages, setAttachedRefImages] = useState<string[]>([]); // 1 to 5 images
  const [isTransparent, setIsTransparent] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1" | "4:3">("9:16");
  const [resolution, setResolution] = useState<"standard" | "hd" | "4k">("hd");
  const [selectedImageModelId, setSelectedImageModelId] = useState<string>("");
  const [isGeneratingImage] = useState(false);
  const [generatedImages] = useState<
    Array<{ id: string; url: string; prompt: string; isTransparent: boolean; ratio: string }>
  >([]);

  const refImageInputRef = useRef<HTMLInputElement>(null);

  // Keep selected image model synced with active mode/preference
  useEffect(() => {
    if (imageGenMode === "text_to_image") {
      setSelectedImageModelId(textToImageModel || textToImageModels[0]?.modelId || "gpt-image-2");
    } else {
      setSelectedImageModelId(imageToImageModel || imageToImageModels[0]?.modelId || "gpt-image-2-img2img");
    }
  }, [imageGenMode, textToImageModel, imageToImageModel, textToImageModels, imageToImageModels]);

  // Handle Attachment of 1 to 5 Reference Images for Image-to-Image
  const handleRefImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const remainingSlots = 5 - attachedRefImages.length;
    if (remainingSlots <= 0) return;
    const filesToRead = Array.from(files).slice(0, remainingSlots);

    for (const file of filesToRead) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setAttachedRefImages((prev) => [...prev.slice(0, 4), event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }
    // reset input
    e.target.value = "";
  };

  const handleRemoveRefImage = (index: number) => {
    setAttachedRefImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Video Generation States
  const [selectedVideoModelId, setSelectedVideoModelId] = useState<string>("");
  useEffect(() => {
    if (!selectedVideoModelId && (videoModelPreference || videoModels[0]?.modelId)) {
      setSelectedVideoModelId(videoModelPreference || videoModels[0]?.modelId || "minimax-video-01");
    }
  }, [videoModelPreference, videoModels, selectedVideoModelId]);

  const selectedVideoModel = useMemo(() => {
    return (
      videoModels.find((m) => m.modelId === selectedVideoModelId) ||
      videoModels[0] || {
        modelId: "minimax-video-01",
        name: "MiniMax Video-01",
        category: "video",
        isEnabled: true,
        supportsImageInput: true,
        maxImageInputs: 5,
        supportsVideoInput: true,
        supportsAudioInput: true,
      }
    );
  }, [videoModels, selectedVideoModelId]);

  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoRatio, setVideoRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [attachedVideoImages, setAttachedVideoImages] = useState<string[]>([]); // 1 - 5 images
  const [attachedVideoFile, setAttachedVideoFile] = useState<{ name: string; url: string } | null>(null);
  const [attachedAudioFile, setAttachedAudioFile] = useState<{ name: string; url: string } | null>(null);
  const [isGeneratingVideo] = useState(false);
  const [generatedVideos] = useState<
    Array<{ id: string; url: string; prompt: string; durationSec: number }>
  >([]);

  const videoImageInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  const handleVideoImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const maxAllowed = selectedVideoModel.maxImageInputs || 5;
    const remainingSlots = maxAllowed - attachedVideoImages.length;
    if (remainingSlots <= 0) return;
    const filesToRead = Array.from(files).slice(0, remainingSlots);

    for (const file of filesToRead) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setAttachedVideoImages((prev) => [...prev.slice(0, maxAllowed - 1), event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleRemoveVideoImage = (index: number) => {
    setAttachedVideoImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVideoFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedVideoFile({ name: file.name, url: URL.createObjectURL(file) });
    e.target.value = "";
  };

  const handleAudioFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedAudioFile({ name: file.name, url: URL.createObjectURL(file) });
    e.target.value = "";
  };

  // Audio Generation States
  const [audioPrompt, setAudioPrompt] = useState("");
  const [audioType, setAudioType] = useState<"tts_voiceover" | "minimax_music" | "sfx_sound">("tts_voiceover");
  const [ttsVoice, setTtsVoice] = useState("nova");
  const [selectedAudioModelId, setSelectedAudioModelId] = useState<string>("");
  useEffect(() => {
    if (!selectedAudioModelId && (audioModelPreference || audioModels[0]?.modelId)) {
      setSelectedAudioModelId(audioModelPreference || audioModels[0]?.modelId || "openai-tts-1-hd");
    }
  }, [audioModelPreference, audioModels, selectedAudioModelId]);

  const [isGeneratingAudio] = useState(false);
  const [generatedAudios] = useState<
    Array<{ id: string; url: string; label: string; durationSec: number }>
  >([]);

  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const reportUnavailable = () =>
    setGenerationError(
      "การสร้างสื่อ AI ในหน้าต่างนี้ยังไม่พร้อมใช้งาน กรุณาสร้างจาก Media Studio บนเว็บ แล้วนำเข้าไฟล์จริง"
    );
  const handleGenerateImage = reportUnavailable;
  const handleGenerateVideo = reportUnavailable;
  const handleGenerateAudio = reportUnavailable;

  const handleAddImageToTimeline = (img: (typeof generatedImages)[0]) => {
    const newClip: NleClip = {
      id: `clip_${Date.now()}`,
      name: `🖼️ AI ${img.isTransparent ? "Overlay (ใส)" : "Image"}`,
      timelineStartMs: Math.round(currentTimeMs),
      durationMs: 4000,
      sourceType: "smartaihub_library",
      sourceUrl: img.url,
      transform: {
        x: 0.5,
        y: 0.5,
        scale: img.isTransparent ? 0.65 : 1.0,
        opacity: 1.0,
      },
    };
    const trackId = img.isTransparent ? "track_o1" : "track_v2";
    onAddMediaClip(trackId, newClip);
    onClose();
  };

  const handleAddVideoToTimeline = (vid: (typeof generatedVideos)[0]) => {
    const newClip: NleClip = {
      id: `clip_${Date.now()}`,
      name: `🎬 AI Video (${vid.durationSec}s)`,
      timelineStartMs: Math.round(currentTimeMs),
      durationMs: vid.durationSec * 1000,
      sourceType: "smartaihub_library",
      sourceUrl: vid.url,
    };
    onAddMediaClip("track_v2", newClip);
    onClose();
  };

  const handleAddAudioToTimeline = (aud: (typeof generatedAudios)[0]) => {
    const newClip: NleClip = {
      id: `clip_${Date.now()}`,
      name: aud.label,
      timelineStartMs: Math.round(currentTimeMs),
      durationMs: aud.durationSec * 1000,
      sourceType: "smartaihub_library",
      sourceUrl: aud.url,
      volume: 1.0,
    };
    const trackId = aud.label.includes("🎙️") ? "track_a1" : "track_a2";
    onAddMediaClip(trackId, newClip);
    onClose();
  };

  return (
    <div className="nle-modal-overlay" onClick={onClose}>
      <div className="nle-modal-card ai-media-studio-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "880px" }}>
        <div className="nle-modal-header">
          <div className="modal-header-title">
            <span className="modal-icon">✨</span>
            <div>
              <h3>SmartAIHub Media Studio & Generation</h3>
              <p className="modal-subtext" style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>
                สร้างภาพ (Text/Image to Image) วิดีโอ และเสียงดนตรีด้วย AI ล้ำสมัย วางลง Timeline ได้ทันที
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p role="status" style={{ display: "none" }}>การสร้างภาพ วิดีโอ และเสียง AI จากหน้าต่างนี้ยังไม่พร้อมใช้งาน</p>

        {generationError && (
          <div
            className="ai-modal-error-banner"
            role="alert"
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              color: "#f87171",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              padding: "10px 16px",
              margin: "12px 16px 0 16px",
              borderRadius: "8px",
              fontSize: "0.82rem",
            }}
          >
            ⚠️ {generationError}
          </div>
        )}

        {/* Tab Navigation */}
        <div
          className="ai-studio-tabs"
          style={{
            display: "flex",
            background: "#090d16",
            borderBottom: "1px solid #334155",
            padding: "8px 16px",
            gap: "10px",
          }}
        >
          <button
            type="button"
            className={`tab-btn ${activeTab === "image" ? "active" : ""}`}
            onClick={() => setActiveTab("image")}
            style={{
              background: activeTab === "image" ? "linear-gradient(135deg, #3b82f6, #6366f1)" : "transparent",
              color: activeTab === "image" ? "#fff" : "#94a3b8",
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🎨 สร้างภาพ (Text & Image to Image)
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "video" ? "active" : ""}`}
            onClick={() => setActiveTab("video")}
            style={{
              background: activeTab === "video" ? "linear-gradient(135deg, #ec4899, #f43f5e)" : "transparent",
              color: activeTab === "video" ? "#fff" : "#94a3b8",
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🎬 สร้างวิดีโอ (Text/Image/Media to Video)
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "audio" ? "active" : ""}`}
            onClick={() => setActiveTab("audio")}
            style={{
              background: activeTab === "audio" ? "linear-gradient(135deg, #10b981, #14b8a6)" : "transparent",
              color: activeTab === "audio" ? "#fff" : "#94a3b8",
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🎵 สร้างเสียง & ดนตรี (Text to Audio)
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
            style={{
              background: activeTab === "settings" ? "#334155" : "transparent",
              color: activeTab === "settings" ? "#fff" : "#94a3b8",
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontWeight: 700,
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            ⚙️ ตั้งค่า Model
          </button>
        </div>

        <div className="nle-modal-body" style={{ padding: "18px", maxHeight: "68vh", overflowY: "auto" }}>
          {/* TAB 1: IMAGE GENERATION (Text to Image & Image to Image) */}
          {activeTab === "image" && (
            <div className="tab-pane image-pane" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="modal-form-group">
                <label className="form-label">โหมดการสร้างภาพ:</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className={`pos-chip ${imageGenMode === "text_to_image" ? "active" : ""}`}
                    onClick={() => setImageGenMode("text_to_image")}
                  >
                    💬 Text to Image (สร้างภาพจากข้อความ)
                  </button>
                  <button
                    type="button"
                    className={`pos-chip ${imageGenMode === "image_to_image" ? "active" : ""}`}
                    onClick={() => setImageGenMode("image_to_image")}
                  >
                    🖼️ Image to Image (แนบภาพอ้างอิง 1 - 5 ภาพ)
                  </button>
                </div>
              </div>

              {/* Image-to-Image Reference Images Attachment Section (1 to 5 images) */}
              {imageGenMode === "image_to_image" && (
                <div className="modal-form-group" style={{ background: "#0f172a", padding: "12px", borderRadius: "8px", border: "1px solid #334155" }}>
                  <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>📷 ภาพอ้างอิงต้นฉบับ (แนบได้ 1 - 5 ภาพ):</span>
                    <span style={{ fontSize: "0.78rem", color: "#38bdf8" }}>({attachedRefImages.length}/5 ภาพ)</span>
                  </label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "8px" }}>
                    {attachedRefImages.map((src, idx) => (
                      <div
                        key={idx}
                        style={{
                          position: "relative",
                          width: "80px",
                          height: "80px",
                          borderRadius: "8px",
                          overflow: "hidden",
                          border: "1.5px solid #38bdf8",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                        }}
                      >
                        <img src={src} alt={`attached_ref_${idx}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button
                          type="button"
                          onClick={() => handleRemoveRefImage(idx)}
                          style={{
                            position: "absolute",
                            top: "2px",
                            right: "2px",
                            background: "rgba(239, 68, 68, 0.9)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "50%",
                            width: "18px",
                            height: "18px",
                            cursor: "pointer",
                            fontSize: "10px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          title="ลบภาพอ้างอิงนี้"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {attachedRefImages.length < 5 && (
                      <button
                        type="button"
                        onClick={() => refImageInputRef.current?.click()}
                        style={{
                          width: "80px",
                          height: "80px",
                          borderRadius: "8px",
                          border: "2px dashed #38bdf8",
                          background: "rgba(56, 189, 248, 0.08)",
                          color: "#38bdf8",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          gap: "4px",
                        }}
                      >
                        <span style={{ fontSize: "1.2rem" }}>＋</span>
                        <span>แนบภาพ</span>
                        <span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>({5 - attachedRefImages.length} เหลือ)</span>
                      </button>
                    )}
                    <input
                      ref={refImageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={handleRefImageAttach}
                    />
                  </div>
                </div>
              )}

              <div className="modal-form-group">
                <label className="form-label">คำสั่งอธิบายภาพ (Prompt):</label>
                <textarea
                  className="font-select-field"
                  style={{ minHeight: "75px", resize: "vertical" }}
                  placeholder={
                    imageGenMode === "text_to_image"
                      ? "เช่น กล่องของขวัญสีทองผูกโบว์สีแดง ลอยอยู่กลางอากาศ แสงนุ่มนวล..."
                      : "เช่น ปรับสไตล์ภาพให้เป็น 3D Render แสงโทนอบอุ่น คงโครงสร้างเดิมของภาพ..."
                  }
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                />
              </div>

              <div className="modal-form-row">
                <div className="form-col">
                  <label className="form-label">โมเดล AI สร้างภาพ (Server Enabled):</label>
                  <select
                    className="font-select-field"
                    value={selectedImageModelId}
                    onChange={(e) => setSelectedImageModelId(e.target.value)}
                  >
                    {(imageGenMode === "text_to_image" ? textToImageModels : imageToImageModels).map((m) => (
                      <option key={m.modelId} value={m.modelId}>
                        {m.name}
                      </option>
                    ))}
                    {(imageGenMode === "text_to_image" ? textToImageModels : imageToImageModels).length === 0 && (
                      <option value="">(กำลังโหลดโมเดลจาก Server...)</option>
                    )}
                  </select>
                </div>

                <div className="form-col">
                  <label className="form-label">รูปแบบพื้นหลัง (Background):</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className={`pos-chip ${!isTransparent ? "active" : ""}`}
                      onClick={() => setIsTransparent(false)}
                    >
                      🖼️ ภาพเต็มปกติ
                    </button>
                    <button
                      type="button"
                      className={`pos-chip ${isTransparent ? "active" : ""}`}
                      onClick={() => setIsTransparent(true)}
                      style={{ borderColor: isTransparent ? "#38bdf8" : undefined, color: isTransparent ? "#38bdf8" : undefined }}
                    >
                      ✨ พื้นหลังโปร่งใส (Overlay)
                    </button>
                  </div>
                </div>
              </div>

              <div className="modal-form-row">
                <div className="form-col">
                  <label className="form-label">สัดส่วนภาพ (Aspect Ratio):</label>
                  <select
                    className="font-select-field"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as any)}
                  >
                    <option value="9:16">📱 9:16 แนวตั้ง (TikTok, Reels, Shorts)</option>
                    <option value="16:9">🖥️ 16:9 แนวนอน (YouTube, TV)</option>
                    <option value="1:1">⏹️ 1:1 จัตุรัส (Instagram, Feed)</option>
                    <option value="4:3">📺 4:3 อัตราส่วนดั้งเดิม</option>
                  </select>
                </div>

                <div className="form-col">
                  <label className="form-label">ความละเอียดภาพ:</label>
                  <select
                    className="font-select-field"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as any)}
                  >
                    <option value="standard">มาตรฐาน (1024×1024 / ไวสุด)</option>
                    <option value="hd">HD คมชัดสูง (1080p คุณภาพสูง)</option>
                    <option value="4k">4K Ultra HD (ความละเอียดสูงสุด)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="modal-confirm-btn"
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage}
                  style={{
                    background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                    padding: "10px 24px",
                    fontWeight: 700,
                  }}
                >
                  {isGeneratingImage
                    ? "⏳ กำลังสังเคราะห์ภาพ..."
                    : `🎨 สร้างภาพ (${imageGenMode === "image_to_image" ? "Image to Image" : "Text to Image"})`}
                </button>
              </div>

              {/* Gallery of Generated Images */}
              {generatedImages.length > 0 && (
                <div style={{ marginTop: "14px", borderTop: "1px solid #1e293b", paddingTop: "12px" }}>
                  <div style={{ fontWeight: 700, marginBottom: "8px" }}>🖼️ ภาพที่สร้างสำเร็จ ({generatedImages.length}):</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }}>
                    {generatedImages.map((img) => (
                      <div
                        key={img.id}
                        style={{
                          background: "#1e293b",
                          borderRadius: "10px",
                          overflow: "hidden",
                          border: "1px solid #334155",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <div
                          style={{
                            height: "140px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundImage: img.isTransparent
                              ? "radial-gradient(#334155 1px, transparent 1px)"
                              : undefined,
                            backgroundSize: "8px 8px",
                            backgroundColor: "#090d16",
                          }}
                        >
                          <img src={img.url} alt={img.prompt} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
                        </div>
                        <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {img.prompt}
                          </span>
                          <button
                            type="button"
                            className="modal-confirm-btn"
                            onClick={() => handleAddImageToTimeline(img)}
                            style={{ fontSize: "0.8rem", padding: "6px" }}
                          >
                            ➕ วางบน {img.isTransparent ? "Track O1 (Overlay)" : "Track V2"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VIDEO GENERATION (Supports Images 1-5, Video, Audio attachments based on Model capabilities) */}
          {activeTab === "video" && (
            <div className="tab-pane video-pane" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="modal-form-row">
                <div className="form-col">
                  <label className="form-label">โมเดล AI วิดีโอ (Server Enabled):</label>
                  <select
                    className="font-select-field"
                    value={selectedVideoModelId}
                    onChange={(e) => setSelectedVideoModelId(e.target.value)}
                  >
                    {videoModels.map((m) => (
                      <option key={m.modelId} value={m.modelId}>
                        {m.name}
                      </option>
                    ))}
                    {videoModels.length === 0 && <option value="">(กำลังโหลดโมเดลจาก Server...)</option>}
                  </select>
                </div>
                <div className="form-col">
                  <label className="form-label">สัดส่วนวิดีโอ (Aspect Ratio):</label>
                  <select className="font-select-field" value={videoRatio} onChange={(e) => setVideoRatio(e.target.value as any)}>
                    <option value="9:16">📱 9:16 แนวตั้ง (TikTok / Shorts)</option>
                    <option value="16:9">🖥️ 16:9 แนวนอน (YouTube / Landscape)</option>
                    <option value="1:1">⏹️ 1:1 จัตุรัส (Square)</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Reference Media Attachments Based on Selected Video Model Capabilities */}
              <div
                className="modal-form-group"
                style={{ background: "#0f172a", padding: "14px", borderRadius: "10px", border: "1px solid #334155", display: "flex", flexDirection: "column", gap: "12px" }}
              >
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ec4899" }}>
                  📎 ไฟล์อ้างอิงสำหรับสร้างวิดีโอ (ตามคุณสมบัติโมเดล {selectedVideoModel.name}):
                </div>

                {/* 1. Image Attachments (1 to 5 images if supported) */}
                {selectedVideoModel.supportsImageInput && (
                  <div>
                    <label className="form-label" style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>🖼️ แนบภาพอ้างอิง (แนบได้สูงสุด {selectedVideoModel.maxImageInputs || 5} ภาพ):</span>
                      <span style={{ fontSize: "0.78rem", color: "#ec4899" }}>
                        ({attachedVideoImages.length}/{selectedVideoModel.maxImageInputs || 5} ภาพ)
                      </span>
                    </label>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "6px" }}>
                      {attachedVideoImages.map((src, idx) => (
                        <div
                          key={idx}
                          style={{
                            position: "relative",
                            width: "80px",
                            height: "80px",
                            borderRadius: "8px",
                            overflow: "hidden",
                            border: "1.5px solid #ec4899",
                          }}
                        >
                          <img src={src} alt={`attached_vid_img_${idx}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          <button
                            type="button"
                            onClick={() => handleRemoveVideoImage(idx)}
                            style={{
                              position: "absolute",
                              top: "2px",
                              right: "2px",
                              background: "rgba(239, 68, 68, 0.9)",
                              color: "#fff",
                              border: "none",
                              borderRadius: "50%",
                              width: "18px",
                              height: "18px",
                              cursor: "pointer",
                              fontSize: "10px",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {attachedVideoImages.length < (selectedVideoModel.maxImageInputs || 5) && (
                        <button
                          type="button"
                          onClick={() => videoImageInputRef.current?.click()}
                          style={{
                            width: "80px",
                            height: "80px",
                            borderRadius: "8px",
                            border: "2px dashed #ec4899",
                            background: "rgba(236, 72, 153, 0.08)",
                            color: "#ec4899",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            gap: "4px",
                          }}
                        >
                          <span style={{ fontSize: "1.2rem" }}>＋</span>
                          <span>แนบภาพ</span>
                          <span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>
                            ({(selectedVideoModel.maxImageInputs || 5) - attachedVideoImages.length} เหลือ)
                          </span>
                        </button>
                      )}
                      <input
                        ref={videoImageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: "none" }}
                        onChange={handleVideoImageAttach}
                      />
                    </div>
                  </div>
                )}

                {/* 2. Video Attachment (if supported by model) */}
                {selectedVideoModel.supportsVideoInput && (
                  <div>
                    <label className="form-label">🎬 แนบไฟล์วิดีโออ้างอิง (Video Input):</label>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "4px" }}>
                      {attachedVideoFile ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#1e293b", padding: "6px 12px", borderRadius: "6px", border: "1px solid #ec4899" }}>
                          <span style={{ fontSize: "0.82rem", color: "#f8fafc" }}>🎥 {attachedVideoFile.name}</span>
                          <button
                            type="button"
                            onClick={() => setAttachedVideoFile(null)}
                            style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.9rem" }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => videoFileInputRef.current?.click()}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "6px",
                            border: "1px dashed #ec4899",
                            background: "rgba(236, 72, 153, 0.1)",
                            color: "#ec4899",
                            cursor: "pointer",
                            fontSize: "0.82rem",
                            fontWeight: 600,
                          }}
                        >
                          ＋ แนบไฟล์วิดีโอ (MP4/MOV)
                        </button>
                      )}
                      <input
                        ref={videoFileInputRef}
                        type="file"
                        accept="video/*"
                        style={{ display: "none" }}
                        onChange={handleVideoFileAttach}
                      />
                    </div>
                  </div>
                )}

                {/* 3. Audio Attachment (if supported by model) */}
                {selectedVideoModel.supportsAudioInput && (
                  <div>
                    <label className="form-label">🎵 แนบไฟล์เสียงอ้างอิง (Audio Input / Lipsync):</label>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "4px" }}>
                      {attachedAudioFile ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#1e293b", padding: "6px 12px", borderRadius: "6px", border: "1px solid #10b981" }}>
                          <span style={{ fontSize: "0.82rem", color: "#f8fafc" }}>🔊 {attachedAudioFile.name}</span>
                          <button
                            type="button"
                            onClick={() => setAttachedAudioFile(null)}
                            style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.9rem" }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => audioFileInputRef.current?.click()}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "6px",
                            border: "1px dashed #10b981",
                            background: "rgba(16, 185, 129, 0.1)",
                            color: "#10b981",
                            cursor: "pointer",
                            fontSize: "0.82rem",
                            fontWeight: 600,
                          }}
                        >
                          ＋ แนบไฟล์เสียง (MP3/WAV)
                        </button>
                      )}
                      <input
                        ref={audioFileInputRef}
                        type="file"
                        accept="audio/*"
                        style={{ display: "none" }}
                        onChange={handleAudioFileAttach}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-form-group">
                <label className="form-label">คำสั่งบรรยายการเคลื่อนไหว (Motion Prompt):</label>
                <textarea
                  className="font-select-field"
                  style={{ minHeight: "75px", resize: "vertical" }}
                  placeholder="เช่น กล้องซูมเข้าอย่างช้าๆ มีแสงระยิบระยับลอยผ่านฉากหลัง..."
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="modal-confirm-btn"
                  onClick={handleGenerateVideo}
                  disabled={isGeneratingVideo}
                  style={{ background: "linear-gradient(135deg, #ec4899, #f43f5e)", padding: "10px 24px", fontWeight: 700 }}
                >
                  {isGeneratingVideo ? "⏳ กำลังสร้างวิดีโอด้วย AI..." : "🎬 สั่งสร้างวิดีโอ AI"}
                </button>
              </div>

              {generatedVideos.length > 0 && (
                <div style={{ marginTop: "14px", borderTop: "1px solid #1e293b", paddingTop: "12px" }}>
                  <div style={{ fontWeight: 700, marginBottom: "8px" }}>🎬 วิดีโอที่สร้างสำเร็จ ({generatedVideos.length}):</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px" }}>
                    {generatedVideos.map((vid) => (
                      <div key={vid.id} style={{ background: "#1e293b", borderRadius: "10px", padding: "10px", border: "1px solid #334155" }}>
                        <video src={vid.url} controls style={{ width: "100%", borderRadius: "6px", height: "130px", objectFit: "cover" }} />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>ความยาว {vid.durationSec}s</span>
                          <button
                            type="button"
                            className="modal-confirm-btn"
                            onClick={() => handleAddVideoToTimeline(vid)}
                            style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                          >
                            ➕ วางลง Timeline (V2)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUDIO GENERATION */}
          {activeTab === "audio" && (
            <div className="tab-pane audio-pane" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="modal-form-group">
                <label className="form-label">ประเภทเสียงที่ต้องการสร้าง:</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className={`pos-chip ${audioType === "tts_voiceover" ? "active" : ""}`}
                    onClick={() => setAudioType("tts_voiceover")}
                  >
                    🎙️ เสียงพากย์บรรยาย (TTS Voiceover)
                  </button>
                  <button
                    type="button"
                    className={`pos-chip ${audioType === "minimax_music" ? "active" : ""}`}
                    onClick={() => setAudioType("minimax_music")}
                  >
                    🎵 ดนตรีประกอบ (MiniMax Music 3)
                  </button>
                  <button
                    type="button"
                    className={`pos-chip ${audioType === "sfx_sound" ? "active" : ""}`}
                    onClick={() => setAudioType("sfx_sound")}
                  >
                    🔔 เอฟเฟกต์เสียง (SFX Sound)
                  </button>
                </div>
              </div>

              <div className="modal-form-group">
                <label className="form-label">
                  {audioType === "tts_voiceover" ? "ข้อความที่ต้องการให้เสียงพากย์อ่าน:" : "สไตล์ดนตรี หรือคำอธิบายเสียง:"}
                </label>
                <textarea
                  className="font-select-field"
                  style={{ minHeight: "75px", resize: "vertical" }}
                  placeholder={
                    audioType === "tts_voiceover"
                      ? "ยินดีต้อนรับสู่ SmartSpecPro นวัตกรรมใหม่แห่งการตัดต่อวิดีโอด้วย AI..."
                      : "Upbeat electronic corporate tech vibe, 128 bpm, optimistic, inspiring..."
                  }
                  value={audioPrompt}
                  onChange={(e) => setAudioPrompt(e.target.value)}
                />
              </div>

              <div className="modal-form-row">
                {audioType === "tts_voiceover" && (
                  <div className="form-col">
                    <label className="form-label">เลือกเสียงพากย์ (Voice Character):</label>
                    <select className="font-select-field" value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)}>
                      <option value="nova">🌟 Nova (เสียงผู้หญิง สดใส กระตือรือร้น)</option>
                      <option value="shimmer">✨ Shimmer (เสียงผู้หญิง นุ่มนวล ชัดเจน)</option>
                      <option value="alloy">💎 Alloy (เสียงกลาง สมดุล ทรงพลัง)</option>
                      <option value="echo">🎙️ Echo (เสียงผู้ชาย อบอุ่น สุภาพ)</option>
                      <option value="onyx">🕶️ Onyx (เสียงผู้ชาย ทุ้มลึก น่าเชื่อถือ)</option>
                    </select>
                  </div>
                )}
                <div className="form-col">
                  <label className="form-label">โมเดล AI เสียงและดนตรี (Server Enabled):</label>
                  <select
                    className="font-select-field"
                    value={selectedAudioModelId}
                    onChange={(e) => setSelectedAudioModelId(e.target.value)}
                  >
                    {audioModels.map((m) => (
                      <option key={m.modelId} value={m.modelId}>
                        {m.name}
                      </option>
                    ))}
                    {audioModels.length === 0 && <option value="">(กำลังโหลดโมเดลจาก Server...)</option>}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="modal-confirm-btn"
                  onClick={handleGenerateAudio}
                  disabled={isGeneratingAudio}
                  style={{ background: "linear-gradient(135deg, #10b981, #14b8a6)", padding: "10px 24px", fontWeight: 700 }}
                >
                  {isGeneratingAudio ? "⏳ กำลังสร้างเสียง..." : "🎵 สั่งสร้างเสียง Audio AI"}
                </button>
              </div>

              {generatedAudios.length > 0 && (
                <div style={{ marginTop: "14px", borderTop: "1px solid #1e293b", paddingTop: "12px" }}>
                  <div style={{ fontWeight: 700, marginBottom: "8px" }}>🎧 คลิปเสียงที่สร้างสำเร็จ ({generatedAudios.length}):</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {generatedAudios.map((aud) => (
                      <div
                        key={aud.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: "#1e293b",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "1px solid #334155",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontWeight: 700, color: "#38bdf8" }}>{aud.label}</span>
                          <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{aud.durationSec}s</span>
                        </div>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                          <audio src={aud.url} controls style={{ height: "32px", width: "200px" }} />
                          <button
                            type="button"
                            className="modal-confirm-btn"
                            onClick={() => handleAddAudioToTimeline(aud)}
                            style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                          >
                            ➕ วางลง Timeline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SETTINGS (Fetched Server Models & Separate Config for T2I, I2I, Video, Audio) */}
          {activeTab === "settings" && (
            <div className="tab-pane settings-pane" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "#38bdf8" }}>
                  ⚙️ การตั้งค่า AI Model เริ่มต้น (Server Enabled Model Preferences)
                </div>
                {isLoadingModels && (
                  <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>⏳ กำลังรีเฟรชจาก Server...</span>
                )}
              </div>
              <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: 0 }}>
                กำหนดโมเดลเริ่มต้นที่เปิดใช้งานบน Server สำหรับสร้างภาพ (Text to Image & Image to Image) วิดีโอ และเสียง
              </p>

              <div className="modal-form-group">
                <label className="form-label">1. โมเดลหลักสำหรับสร้างภาพจากข้อความ (Default Text to Image Model):</label>
                <select
                  className="font-select-field"
                  value={textToImageModel}
                  onChange={(e) =>
                    savePreferences(e.target.value, imageToImageModel, videoModelPreference, audioModelPreference)
                  }
                >
                  {textToImageModels.map((m) => (
                    <option key={m.modelId} value={m.modelId}>
                      {m.name} {m.description ? `— ${m.description}` : ""}
                    </option>
                  ))}
                  {textToImageModels.length === 0 && (
                    <option value="gpt-image-2">🌟 GPT Image 2 / DALL-E 3 (แนะนำ - คมชัดสูง)</option>
                  )}
                </select>
              </div>

              <div className="modal-form-group">
                <label className="form-label">2. โมเดลหลักสำหรับสร้างภาพจากภาพอ้างอิง (Default Image to Image Model):</label>
                <select
                  className="font-select-field"
                  value={imageToImageModel}
                  onChange={(e) =>
                    savePreferences(textToImageModel, e.target.value, videoModelPreference, audioModelPreference)
                  }
                >
                  {imageToImageModels.map((m) => (
                    <option key={m.modelId} value={m.modelId}>
                      {m.name} {m.description ? `— ${m.description}` : ""}
                    </option>
                  ))}
                  {imageToImageModels.length === 0 && (
                    <option value="gpt-image-2-img2img">🖼️ GPT Image 2 Remix & Restyle (แนบ 1-5 ภาพ)</option>
                  )}
                </select>
              </div>

              <div className="modal-form-group">
                <label className="form-label">3. โมเดลหลักสำหรับสร้างวิดีโอ (Default Video Model):</label>
                <select
                  className="font-select-field"
                  value={videoModelPreference}
                  onChange={(e) =>
                    savePreferences(textToImageModel, imageToImageModel, e.target.value, audioModelPreference)
                  }
                >
                  {videoModels.map((m) => (
                    <option key={m.modelId} value={m.modelId}>
                      {m.name} {m.description ? `— ${m.description}` : ""}
                    </option>
                  ))}
                  {videoModels.length === 0 && (
                    <option value="minimax-video-01">🎬 MiniMax Video-01 (สมจริง ฟิสิกส์ธรรมชาติ)</option>
                  )}
                </select>
              </div>

              <div className="modal-form-group">
                <label className="form-label">4. โมเดลหลักสำหรับสร้างเสียงและดนตรี (Default Audio Model):</label>
                <select
                  className="font-select-field"
                  value={audioModelPreference}
                  onChange={(e) =>
                    savePreferences(textToImageModel, imageToImageModel, videoModelPreference, e.target.value)
                  }
                >
                  {audioModels.map((m) => (
                    <option key={m.modelId} value={m.modelId}>
                      {m.name} {m.description ? `— ${m.description}` : ""}
                    </option>
                  ))}
                  {audioModels.length === 0 && (
                    <option value="openai-tts-1-hd">🎙️ OpenAI TTS-1-HD (เสียงพูดคมชัดระดับโปรดักชัน)</option>
                  )}
                </select>
              </div>

              <div
                style={{
                  background: "#1e293b",
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  color: "#94a3b8",
                  border: "1px solid #334155",
                }}
              >
                💡 <strong>หมายเหตุ:</strong> ระบบจะเรียกใช้ API บน Server เพื่อดึงเฉพาะ AI Model ที่เปิดใช้งาน (Enabled) บน Server เท่านั้น และบันทึกการตั้งค่าไว้ใน Local Storage ของเครื่องโดยอัตโนมัติ
              </div>
            </div>
          )}
        </div>

        <div className="nle-modal-footer">
          <button type="button" className="modal-cancel-btn" onClick={onClose}>
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
