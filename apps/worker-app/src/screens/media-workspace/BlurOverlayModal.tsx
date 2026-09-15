import React, { useState, useEffect } from "react";
import { useWorkerLocale } from "../../app/workerContext";
import type { NleClip } from "../../types/nleProject";

interface BlurOverlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBlurClip: (clip: NleClip) => void;
  currentTimeMs: number;
  currentFocusX: number;
  currentFocusY: number;
  productPin: { x: number; y: number } | null;
}

export function BlurOverlayModal({
  isOpen,
  onClose,
  onAddBlurClip,
  currentTimeMs,
  currentFocusX,
  currentFocusY,
  productPin,
}: BlurOverlayModalProps) {
  const locale = useWorkerLocale();
  const t = (th: string, en: string) => (locale === "en" ? en : th);
  const [blurType, setBlurType] = useState<"gaussian" | "mosaic" | "solid_bar">("gaussian");
  const [autoTrack, setAutoTrack] = useState<"none" | "auto_person" | "auto_product">("auto_person");
  const [blurAmount, setBlurAmount] = useState(20);
  const [widthPx, setWidthPx] = useState(180);
  const [heightPx, setHeightPx] = useState(90);
  const [borderRadiusPx, setBorderRadiusPx] = useState(14);
  const [durationSec, setDurationSec] = useState(5.0);
  const [manualX, setManualX] = useState(0.5);
  const [manualY, setManualY] = useState(0.5);

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

  const handleCreateClip = () => {
    let initialX = Math.min(Math.max(manualX, 0.05), 0.95);
    let initialY = Math.min(Math.max(manualY, 0.05), 0.95);

    if (autoTrack === "auto_person") {
      initialX = Math.min(Math.max(currentFocusX, 0.05), 0.95);
      initialY = Math.min(Math.max(currentFocusY, 0.05), 0.95);
    } else if (autoTrack === "auto_product" && productPin) {
      initialX = Math.min(Math.max(productPin.x, 0.05), 0.95);
      initialY = Math.min(Math.max(productPin.y, 0.05), 0.95);
    }

    const effectiveRadius = borderRadiusPx >= 90
      ? Math.round(heightPx / 2)
      : Math.min(borderRadiusPx, Math.round(heightPx / 2));

    const typeLabel =
      blurType === "gaussian"
        ? "เบลอละมุน"
        : blurType === "mosaic"
        ? "โมเสก"
        : "แถบดำ";

    const trackLabel =
      autoTrack === "auto_person"
        ? "👤 ล็อกตามคน"
        : autoTrack === "auto_product"
        ? "📦 ล็อกตามสินค้า"
        : "✋ ตำแหน่งคงที่";

    const newClip: NleClip = {
      id: `blur_${Date.now()}`,
      name: `🔒 ${typeLabel} (${trackLabel})`,
      timelineStartMs: Math.round(currentTimeMs),
      durationMs: Math.round(durationSec * 1000),
      sourceType: "generated_code",
      codeEngine: "react_css",
      isBlurOverlay: true,
      blurType,
      blurAmount,
      blurAutoTrack: autoTrack,
      blurWidth: widthPx,
      blurHeight: heightPx,
      blurRadius: effectiveRadius,
      transform: {
        x: initialX,
        y: initialY,
        scale: 1.0,
        opacity: 1.0,
      },
    };

    onAddBlurClip(newClip);
    onClose();
  };

  return (
    <div className="nle-modal-overlay" onClick={onClose}>
      <div className="nle-modal-card blur-overlay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nle-modal-header">
          <div className="modal-header-title">
            <span className="modal-icon">🔒</span>
            <h3>{t("แถบเบลอเพื่อปกปิด", "Blur and privacy overlay")}</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="nle-modal-body">
          {/* Style Selector */}
          <div className="modal-form-group">
            <label className="form-label">{t("สไตล์การเซ็นเซอร์/เบลอ:", "Censor/blur style:")}</label>
            <div className="blur-style-grid">
              <button
                type="button"
                className={`blur-style-card ${blurType === "gaussian" ? "active" : ""}`}
                onClick={() => setBlurType("gaussian")}
              >
                <div className="blur-sample-box sample-gaussian">
                  <span>{t("ตัวอย่างเบลอ", "Blur preview")}</span>
                </div>
                <strong className="blur-style-title">✨ {t("เบลอละมุน", "Soft blur")} (Gaussian)</strong>
                <span className="blur-style-desc">{t("เบลอนุ่มเนียนตา เหมาะกับปกปิดใบหน้าหรือข้อความ", "A smooth blur for faces or text")}</span>
              </button>

              <button
                type="button"
                className={`blur-style-card ${blurType === "mosaic" ? "active" : ""}`}
                onClick={() => setBlurType("mosaic")}
              >
                <div className="blur-sample-box sample-mosaic">
                  <span>{t("ตัวอย่างโมเสก", "Mosaic preview")}</span>
                </div>
                <strong className="blur-style-title">🔲 {t("โมเสก", "Mosaic")} (Pixelate)</strong>
                <span className="blur-style-desc">{t("สไตล์เซ็นเซอร์พิกเซลแบบรายการทีวีหรือข่าว", "Pixel censoring styled for TV or news")}</span>
              </button>

              <button
                type="button"
                className={`blur-style-card ${blurType === "solid_bar" ? "active" : ""}`}
                onClick={() => setBlurType("solid_bar")}
              >
                <div className="blur-sample-box sample-solid">
                  <span>CENSOR</span>
                </div>
                <strong className="blur-style-title">⬛ {t("แถบดำทึบ", "Solid bar")} (Censor Bar)</strong>
                <span className="blur-style-desc">{t("แถบดำคลาสสิก ปิดมิดชิด 100%", "Classic black bar with full coverage")}</span>
              </button>
            </div>
          </div>

          {/* Tracking Mode */}
          <div className="modal-form-group">
            <label className="form-label">{t("การติดตามวัตถุ:", "Object tracking:")}</label>
            <div className="track-mode-pills">
              <button
                type="button"
                className={`track-pill-btn ${autoTrack === "auto_person" ? "active" : ""}`}
                onClick={() => setAutoTrack("auto_person")}
              >
                👤 {t("ล็อกติดตามหน้าคนอัตโนมัติ", "Auto-track person")}
              </button>
              <button
                type="button"
                className={`track-pill-btn ${autoTrack === "auto_product" ? "active" : ""}`}
                onClick={() => setAutoTrack("auto_product")}
              >
                📦 {t("ล็อกตามจุดมาร์กสินค้า", "Track product marker")} ({productPin ? t("📍 มีจุดมาร์ก", "📍 Marker set") : t("ยังไม่ได้มาร์ก", "No marker set")})
              </button>
              <button
                type="button"
                className={`track-pill-btn ${autoTrack === "none" ? "active" : ""}`}
                onClick={() => setAutoTrack("none")}
              >
                ✋ {t("ตำแหน่งคงที่/ปรับเอง", "Fixed position/manual")}
              </button>
            </div>
          </div>

          {/* Sliders: Strength, Width, Height, Corner Radius */}
          <div className="modal-form-row">
            {blurType === "gaussian" && (
              <div className="form-col">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className="form-label">{t("ระดับความแรงของการเบลอ", "Blur strength")}: {blurAmount}px</label>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button type="button" className={`pos-chip ${blurAmount === 10 ? "active" : ""}`} onClick={() => setBlurAmount(10)}>{t("อ่อน", "Light")} 10px</button>
                    <button type="button" className={`pos-chip ${blurAmount === 25 ? "active" : ""}`} onClick={() => setBlurAmount(25)}>{t("กลาง", "Medium")} 25px</button>
                    <button type="button" className={`pos-chip ${blurAmount === 50 ? "active" : ""}`} onClick={() => setBlurAmount(50)}>{t("หนา", "Strong")} 50px</button>
                    <button type="button" className={`pos-chip ${blurAmount === 85 ? "active" : ""}`} onClick={() => setBlurAmount(85)}>{t("มิดชิด", "Full")} 85px</button>
                  </div>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={blurAmount}
                  onChange={(e) => setBlurAmount(parseInt(e.target.value, 10))}
                  className="slider-range-input"
                />
              </div>
            )}
            {blurType === "mosaic" && (
              <div className="form-col">
                <label className="form-label">{t("ขนาดตารางพิกเซลโมเสก", "Mosaic pixel block size")}: {blurAmount}px</label>
                <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                  <button type="button" className={`pos-chip ${blurAmount === 8 ? "active" : ""}`} onClick={() => setBlurAmount(8)}>{t("ละเอียด", "Fine")} (8px)</button>
                  <button type="button" className={`pos-chip ${blurAmount === 16 ? "active" : ""}`} onClick={() => setBlurAmount(16)}>{t("มาตรฐาน", "Standard")} (16px)</button>
                  <button type="button" className={`pos-chip ${blurAmount === 24 ? "active" : ""}`} onClick={() => setBlurAmount(24)}>{t("หนา", "Large")} (24px)</button>
                  <button type="button" className={`pos-chip ${blurAmount === 36 ? "active" : ""}`} onClick={() => setBlurAmount(36)}>{t("หยาบมาก", "Extra large")} (36px)</button>
                </div>
              </div>
            )}
            <div className="form-col">
              <label className="form-label">{t("ความกว้างแถบ", "Overlay width")}: {widthPx}px</label>
              <input
                type="range"
                min={60}
                max={400}
                value={widthPx}
                onChange={(e) => setWidthPx(parseInt(e.target.value, 10))}
                className="slider-range-input"
              />
            </div>
            <div className="form-col">
              <label className="form-label">{t("ความสูงแถบ", "Overlay height")}: {heightPx}px</label>
              <input
                type="range"
                min={30}
                max={250}
                value={heightPx}
                onChange={(e) => setHeightPx(parseInt(e.target.value, 10))}
                className="slider-range-input"
              />
            </div>
          </div>

          <div className="modal-form-row">
            <div className="form-col">
              <label className="form-label">{t("ความโค้งมนของขอบ:", "Corner radius:")}</label>
              <div className="radius-chips">
                <button
                  type="button"
                  className={`pos-chip ${borderRadiusPx === 0 ? "active" : ""}`}
                  onClick={() => setBorderRadiusPx(0)}
                >
                  {t("เหลี่ยม", "Square")} (0px)
                </button>
                <button
                  type="button"
                  className={`pos-chip ${borderRadiusPx === 14 ? "active" : ""}`}
                  onClick={() => setBorderRadiusPx(14)}
                >
                  {t("มน", "Rounded")} (14px)
                </button>
                <button
                  type="button"
                  className={`pos-chip ${borderRadiusPx >= 90 ? "active" : ""}`}
                  onClick={() => setBorderRadiusPx(999)}
                >
                  {t("วงรี/แคปซูล", "Pill")}
                </button>
              </div>
            </div>

            {autoTrack === "none" && (
              <>
                <div className="form-col">
                  <label className="form-label">{t("ตำแหน่ง X", "X position")}: {(manualX * 100).toFixed(0)}%</label>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.02}
                    value={manualX}
                    onChange={(e) => setManualX(parseFloat(e.target.value))}
                    className="slider-range-input"
                  />
                </div>
                <div className="form-col">
                  <label className="form-label">{t("ตำแหน่ง Y", "Y position")}: {(manualY * 100).toFixed(0)}%</label>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.02}
                    value={manualY}
                    onChange={(e) => setManualY(parseFloat(e.target.value))}
                    className="slider-range-input"
                  />
                </div>
              </>
            )}

            <div className="form-col">
              <label className="form-label">{t("ระยะเวลาเบลอ", "Blur duration")}: {durationSec.toFixed(1)} {t("วินาที", "seconds")}</label>
              <input
                type="range"
                min={1.0}
                max={20.0}
                step={0.5}
                value={durationSec}
                onChange={(e) => setDurationSec(parseFloat(e.target.value))}
                className="slider-range-input"
              />
            </div>
          </div>
        </div>

        <div className="nle-modal-footer">
          <button type="button" className="modal-cancel-btn" onClick={onClose}>
            {t("ยกเลิก", "Cancel")}
          </button>
          <button type="button" className="modal-confirm-btn" onClick={handleCreateClip}>
            ➕ {t("เพิ่มแถบเบลอลงวิดีโอ (Track O1)", "Add blur overlay to video (Track O1)")}
          </button>
        </div>
      </div>
    </div>
  );
}
