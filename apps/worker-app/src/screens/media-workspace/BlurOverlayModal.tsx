import React, { useState, useEffect } from "react";
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
            <h3>แถบเบลอเซ็นเซอร์วัตถุ (Blur & Privacy Overlay)</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="nle-modal-body">
          {/* Style Selector */}
          <div className="modal-form-group">
            <label className="form-label">สไตล์การเซ็นเซอร์ / เบลอ:</label>
            <div className="blur-style-grid">
              <button
                type="button"
                className={`blur-style-card ${blurType === "gaussian" ? "active" : ""}`}
                onClick={() => setBlurType("gaussian")}
              >
                <div className="blur-sample-box sample-gaussian">
                  <span>ตัวอย่างเบลอ</span>
                </div>
                <strong className="blur-style-title">✨ เบลอละมุน (Gaussian)</strong>
                <span className="blur-style-desc">เบลอนุ่มเนียนตา เหมาะกับปกปิดใบหน้า/ข้อความ</span>
              </button>

              <button
                type="button"
                className={`blur-style-card ${blurType === "mosaic" ? "active" : ""}`}
                onClick={() => setBlurType("mosaic")}
              >
                <div className="blur-sample-box sample-mosaic">
                  <span>ตัวอย่างโมเสก</span>
                </div>
                <strong className="blur-style-title">🔲 โมเสก (Mosaic Pixelate)</strong>
                <span className="blur-style-desc">สไตล์เซ็นเซอร์พิกเซลแบบรายการทีวี/ข่าว</span>
              </button>

              <button
                type="button"
                className={`blur-style-card ${blurType === "solid_bar" ? "active" : ""}`}
                onClick={() => setBlurType("solid_bar")}
              >
                <div className="blur-sample-box sample-solid">
                  <span>CENSOR</span>
                </div>
                <strong className="blur-style-title">⬛ แถบดำทึบ (Censor Bar)</strong>
                <span className="blur-style-desc">แถบดำคลาสสิก ปิดมิดชิด 100%</span>
              </button>
            </div>
          </div>

          {/* Tracking Mode */}
          <div className="modal-form-group">
            <label className="form-label">การติดตามวัตถุ (Auto Tracking):</label>
            <div className="track-mode-pills">
              <button
                type="button"
                className={`track-pill-btn ${autoTrack === "auto_person" ? "active" : ""}`}
                onClick={() => setAutoTrack("auto_person")}
              >
                👤 ล็อกติดตามหน้าคนอัตโนมัติ (Auto Person Track)
              </button>
              <button
                type="button"
                className={`track-pill-btn ${autoTrack === "auto_product" ? "active" : ""}`}
                onClick={() => setAutoTrack("auto_product")}
              >
                📦 ล็อกตามจุดมาร์กสินค้า ({productPin ? "📍 มีจุดมาร์ก" : "ยังไม่ได้มาร์ก"})
              </button>
              <button
                type="button"
                className={`track-pill-btn ${autoTrack === "none" ? "active" : ""}`}
                onClick={() => setAutoTrack("none")}
              >
                ✋ ตำแหน่งคงที่ / ปรับเอง (Manual)
              </button>
            </div>
          </div>

          {/* Sliders: Strength, Width, Height, Corner Radius */}
          <div className="modal-form-row">
            {blurType === "gaussian" && (
              <div className="form-col">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className="form-label">ระดับความแรงของการเบลอ: {blurAmount}px</label>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button type="button" className={`pos-chip ${blurAmount === 10 ? "active" : ""}`} onClick={() => setBlurAmount(10)}>อ่อน 10px</button>
                    <button type="button" className={`pos-chip ${blurAmount === 25 ? "active" : ""}`} onClick={() => setBlurAmount(25)}>กลาง 25px</button>
                    <button type="button" className={`pos-chip ${blurAmount === 50 ? "active" : ""}`} onClick={() => setBlurAmount(50)}>หนา 50px</button>
                    <button type="button" className={`pos-chip ${blurAmount === 85 ? "active" : ""}`} onClick={() => setBlurAmount(85)}>มิดชิด 85px</button>
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
                <label className="form-label">ขนาดตารางพิกเซลโมเสก (Pixel Block Size): {blurAmount}px</label>
                <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                  <button type="button" className={`pos-chip ${blurAmount === 8 ? "active" : ""}`} onClick={() => setBlurAmount(8)}>ละเอียด (8px)</button>
                  <button type="button" className={`pos-chip ${blurAmount === 16 ? "active" : ""}`} onClick={() => setBlurAmount(16)}>มาตรฐาน (16px)</button>
                  <button type="button" className={`pos-chip ${blurAmount === 24 ? "active" : ""}`} onClick={() => setBlurAmount(24)}>หนา (24px)</button>
                  <button type="button" className={`pos-chip ${blurAmount === 36 ? "active" : ""}`} onClick={() => setBlurAmount(36)}>หยาบมาก (36px)</button>
                </div>
              </div>
            )}
            <div className="form-col">
              <label className="form-label">ความกว้างแถบ: {widthPx}px</label>
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
              <label className="form-label">ความสูงแถบ: {heightPx}px</label>
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
              <label className="form-label">ความโค้งมนของขอบ:</label>
              <div className="radius-chips">
                <button
                  type="button"
                  className={`pos-chip ${borderRadiusPx === 0 ? "active" : ""}`}
                  onClick={() => setBorderRadiusPx(0)}
                >
                  เหลี่ยม (0px)
                </button>
                <button
                  type="button"
                  className={`pos-chip ${borderRadiusPx === 14 ? "active" : ""}`}
                  onClick={() => setBorderRadiusPx(14)}
                >
                  มน (14px)
                </button>
                <button
                  type="button"
                  className={`pos-chip ${borderRadiusPx >= 90 ? "active" : ""}`}
                  onClick={() => setBorderRadiusPx(999)}
                >
                  วงรี / แคปซูล
                </button>
              </div>
            </div>

            {autoTrack === "none" && (
              <>
                <div className="form-col">
                  <label className="form-label">ตำแหน่ง X: {(manualX * 100).toFixed(0)}%</label>
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
                  <label className="form-label">ตำแหน่ง Y: {(manualY * 100).toFixed(0)}%</label>
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
              <label className="form-label">ระยะเวลาเบลอ: {durationSec.toFixed(1)} วินาที</label>
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
            ยกเลิก
          </button>
          <button type="button" className="modal-confirm-btn" onClick={handleCreateClip}>
            ➕ เพิ่มแถบเบลอลงวิดีโอ (Track O1)
          </button>
        </div>
      </div>
    </div>
  );
}
