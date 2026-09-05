import React, { useState, useRef, useEffect } from "react";
import type { NleClip } from "../../types/nleProject";

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

  // Image Generation States
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageStyle, setImageStyle] = useState<"realistic" | "cinematic" | "anime" | "3d_render" | "vector_logo">("realistic");
  const [isTransparent, setIsTransparent] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1" | "4:3">("9:16");
  const [resolution, setResolution] = useState<"standard" | "hd" | "4k">("hd");
  const [imageModel, setImageModel] = useState("gpt-image-2");
  const [isGeneratingImage] = useState(false);
  const [generatedImages] = useState<
    Array<{ id: string; url: string; prompt: string; isTransparent: boolean; ratio: string }>
  >([]);

  // Video Generation States
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoMode, setVideoMode] = useState<"text_to_video" | "image_to_video">("text_to_video");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [videoModel, setVideoModel] = useState("minimax-video-01");
  const [videoRatio, setVideoRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [isGeneratingVideo] = useState(false);
  const [generatedVideos] = useState<
    Array<{ id: string; url: string; prompt: string; durationSec: number }>
  >([]);

  // Audio Generation States
  const [audioPrompt, setAudioPrompt] = useState("");
  const [audioType, setAudioType] = useState<"tts_voiceover" | "minimax_music" | "sfx_sound">("tts_voiceover");
  const [ttsVoice, setTtsVoice] = useState("nova");
  const [audioModel, setAudioModel] = useState("openai-tts-1-hd");
  const [isGeneratingAudio] = useState(false);
  const [generatedAudios] = useState<
    Array<{ id: string; url: string; label: string; durationSec: number }>
  >([]);

  const [generationError, setGenerationError] = useState<string | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

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

  // Handle Image Upload for Image-to-Video (1 to 3 images)
  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const remainingSlots = 3 - attachedImages.length;
    const filesToRead = Array.from(files).slice(0, remainingSlots);

    for (const file of filesToRead) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setAttachedImages((prev) => [...prev.slice(0, 2), event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveAttachedImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // This surface has no provider bridge yet; never substitute stock samples for generated output.
  const reportUnavailable = () => setGenerationError("การสร้างสื่อ AI ในหน้าต่างนี้ยังไม่พร้อมใช้งาน กรุณาสร้างจาก Media Studio บนเว็บ แล้วนำเข้าไฟล์จริง");
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
    // If transparent overlay, place on O1, otherwise V2 (B-Roll)
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
      <div className="nle-modal-card ai-media-studio-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "860px" }}>
        <div className="nle-modal-header">
          <div className="modal-header-title">
            <span className="modal-icon">✨</span>
            <div>
              <h3>SmartAIHub Media Studio & Generation</h3>
              <p className="modal-subtext" style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>
                สร้างภาพ พื้นหลังใส วิดีโอ และเสียงดนตรีด้วย AI ล้ำสมัย วางลง Timeline ได้ทันที
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {generationError && (
          <div className="ai-modal-error-banner" role="alert" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "10px 16px", margin: "12px 16px 0 16px", borderRadius: "8px", fontSize: "0.82rem" }}>
            ⚠️ {generationError}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="ai-studio-tabs" style={{ display: "flex", background: "#090d16", borderBottom: "1px solid #334155", padding: "8px 16px", gap: "10px" }}>
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
            🎨 สร้างภาพ (Text to Image)
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
            🎬 สร้างวิดีโอ (Text & Image to Video)
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

        <div className="nle-modal-body" style={{ padding: "18px", maxHeight: "65vh", overflowY: "auto" }}>
          {/* TAB 1: IMAGE GENERATION */}
          {activeTab === "image" && (
            <div className="tab-pane image-pane" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="modal-form-group">
                <label className="form-label">คำสั่งอธิบายภาพ (Prompt):</label>
                <textarea
                  className="font-select-field"
                  style={{ minHeight: "75px", resize: "vertical" }}
                  placeholder="เช่น กล่องของขวัญสีทองผูกโบว์สีแดง ลอยอยู่กลางอากาศ แสงนุ่มนวล..."
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                />
              </div>

              <div className="modal-form-row">
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
                      ✨ พื้นหลังโปร่งใส (วางเป็น Overlay)
                    </button>
                  </div>
                </div>

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
                  {isGeneratingImage ? "⏳ กำลังสังเคราะห์ภาพด้วย GPT Image 2..." : "🎨 สร้างภาพด้วย GPT Image 2"}
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

          {/* TAB 2: VIDEO GENERATION */}
          {activeTab === "video" && (
            <div className="tab-pane video-pane" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="modal-form-group">
                <label className="form-label">โหมดการสร้างวิดีโอ:</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className={`pos-chip ${videoMode === "text_to_video" ? "active" : ""}`}
                    onClick={() => setVideoMode("text_to_video")}
                  >
                    💬 Text to Video (จากข้อความ)
                  </button>
                  <button
                    type="button"
                    className={`pos-chip ${videoMode === "image_to_video" ? "active" : ""}`}
                    onClick={() => setVideoMode("image_to_video")}
                  >
                    🖼️ Image to Video (แนบภาพอ้างอิง 1-3 ภาพ)
                  </button>
                </div>
              </div>

              {/* Image attachment row if image_to_video */}
              {videoMode === "image_to_video" && (
                <div className="modal-form-group">
                  <label className="form-label">
                    ภาพอ้างอิงต้นฉบับ ({attachedImages.length}/3 ภาพ):
                  </label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    {attachedImages.map((src, idx) => (
                      <div
                        key={idx}
                        style={{
                          position: "relative",
                          width: "80px",
                          height: "80px",
                          borderRadius: "8px",
                          overflow: "hidden",
                          border: "1px solid #38bdf8",
                        }}
                      >
                        <img src={src} alt={`attached_${idx}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachedImage(idx)}
                          style={{
                            position: "absolute",
                            top: "2px",
                            right: "2px",
                            background: "rgba(239, 68, 68, 0.85)",
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
                    {attachedImages.length < 3 && (
                      <button
                        type="button"
                        onClick={() => imageFileInputRef.current?.click()}
                        style={{
                          width: "80px",
                          height: "80px",
                          borderRadius: "8px",
                          border: "2px dashed #475569",
                          background: "#1e293b",
                          color: "#94a3b8",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          gap: "4px",
                        }}
                      >
                        <span>＋ แนบภาพ</span>
                        <span style={{ fontSize: "0.65rem" }}>({3 - attachedImages.length} เหลือ)</span>
                      </button>
                    )}
                    <input
                      ref={imageFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={handleImageAttach}
                    />
                  </div>
                </div>
              )}

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

              <div className="modal-form-row">
                <div className="form-col">
                  <label className="form-label">โมเดล AI วิดีโอ:</label>
                  <select className="font-select-field" value={videoModel} onChange={(e) => setVideoModel(e.target.value)}>
                    <option value="minimax-video-01">MiniMax Video-01 (สมจริง คุณภาพสูง)</option>
                    <option value="kling-v1">Kling AI Video v1.5</option>
                    <option value="runway-gen3">Runway Gen-3 Alpha</option>
                    <option value="luma-ray">Luma Ray Dream Machine</option>
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

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="modal-confirm-btn"
                  onClick={handleGenerateVideo}
                  disabled={isGeneratingVideo}
                  style={{ background: "linear-gradient(135deg, #ec4899, #f43f5e)", padding: "10px 24px", fontWeight: 700 }}
                >
                  {isGeneratingVideo ? "⏳ กำลังสร้างวิดีโอด้วย MiniMax..." : "🎬 สั่งสร้างวิดีโอ AI"}
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

              {audioType === "tts_voiceover" && (
                <div className="modal-form-row">
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
                  <div className="form-col">
                    <label className="form-label">โมเดลสังเคราะห์เสียง:</label>
                    <select className="font-select-field" value={audioModel} onChange={(e) => setAudioModel(e.target.value)}>
                      <option value="openai-tts-1-hd">OpenAI TTS-1-HD (สตูดิโอเกรด)</option>
                      <option value="elevenlabs-v2">ElevenLabs Multilingual v2</option>
                      <option value="edge-tts">Microsoft Edge Neural TTS (ภาษาไทยเป็นธรรมชาติ)</option>
                    </select>
                  </div>
                </div>
              )}

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

          {/* TAB 4: SETTINGS */}
          {activeTab === "settings" && (
            <div className="tab-pane settings-pane" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#38bdf8" }}>
                ⚙️ การตั้งค่า AI Model เริ่มต้น (Default Model Preferences)
              </div>
              <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: 0 }}>
                กำหนดโมเดลที่ Worker App จะเรียกใช้โดยอัตโนมัติเมื่อกดสร้างภาพ วิดีโอ หรือเสียง
              </p>

              <div className="modal-form-group">
                <label className="form-label">โมเดลหลักสำหรับสร้างภาพ (Default Image Model):</label>
                <select className="font-select-field" value={imageModel} onChange={(e) => setImageModel(e.target.value)}>
                  <option value="gpt-image-2">🌟 GPT Image 2 / DALL-E 3 (แนะนำ - คมชัดสูง รองรับภาษาไทย)</option>
                  <option value="flux-1-schnell">⚡ FLUX.1 Schnell (ความเร็วสูง รายละเอียดเสมือนจริง)</option>
                  <option value="stable-diffusion-3">🎨 Stable Diffusion 3 Medium</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label className="form-label">โมเดลหลักสำหรับสร้างวิดีโอ (Default Video Model):</label>
                <select className="font-select-field" value={videoModel} onChange={(e) => setVideoModel(e.target.value)}>
                  <option value="minimax-video-01">🎬 MiniMax Video-01 (สมจริง ฟิสิกส์ธรรมชาติ)</option>
                  <option value="kling-v1">🚀 Kling AI Video v1.5 High-Definition</option>
                  <option value="runway-gen3">🎥 Runway Gen-3 Alpha</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label className="form-label">โมเดลหลักสำหรับสร้างเสียงและดนตรี (Default Audio Model):</label>
                <select className="font-select-field" value={audioModel} onChange={(e) => setAudioModel(e.target.value)}>
                  <option value="openai-tts-1-hd">🎙️ OpenAI TTS-1-HD (เสียงพูดคมชัดระดับโปรดักชัน)</option>
                  <option value="minimax-music-3">🎵 MiniMax Music 3 (สร้างดนตรีประกอบอัตโนมัติ)</option>
                  <option value="elevenlabs-v2">🗣️ ElevenLabs Multilingual v2</option>
                </select>
              </div>

              <div style={{ background: "#1e293b", padding: "12px", borderRadius: "8px", fontSize: "0.8rem", color: "#94a3b8" }}>
                💡 <strong>เคล็ดลับ:</strong> การตั้งค่าทั้งหมดจะถูกบันทึกไว้ใน Local Storage ของเครื่อง และซิงค์กับโปรเจกต์ปัจจุบันโดยอัตโนมัติ
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
