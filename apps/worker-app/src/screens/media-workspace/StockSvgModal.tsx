import React, { useState, useEffect } from "react";
import type { NleClip } from "../../types/nleProject";

interface StockSvgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSvgClip: (clip: NleClip) => void;
  currentTimeMs: number;
}

export interface StockSvgItem {
  id: string;
  name: string;
  category: "social" | "sales" | "arrows" | "badges" | "ui";
  defaultColor: string;
  svgRaw: string;
}

export const STOCK_SVGS: StockSvgItem[] = [
  // 1. Social & CTA
  {
    id: "yt_subscribe",
    name: "YouTube Subscribe",
    category: "social",
    defaultColor: "#ef4444",
    svgRaw: `<svg viewBox="0 0 240 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="240" height="64" rx="32" fill="#ef4444"/>
      <path d="M42 22C42 22 40 22.2 38 23C36 24 35 25.5 35 27.5C34.5 30 34.5 32 34.5 32C34.5 32 34.5 34 35 36.5C35 38.5 36 40 38 41C40 41.8 42 42 42 42C42 42 47 42 54 42C61 42 66 42 66 42C66 42 68 41.8 70 41C72 40 73 38.5 73 36.5C73.5 34 73.5 32 73.5 32C73.5 32 73.5 30 73 27.5C73 25.5 72 24 70 23C68 22.2 66 22 66 22C66 22 61 22 54 22C47 22 42 22 42 22Z" fill="white"/>
      <polygon points="50,27 60,32 50,37" fill="#ef4444"/>
      <text x="84" y="40" font-family="'Segoe UI', sans-serif" font-size="21" font-weight="bold" fill="white">SUBSCRIBE</text>
      <path d="M208 30C208 26.7 205.3 24 202 24C198.7 24 196 26.7 196 30C196 35 193 37 193 37H211C211 37 208 35 208 30ZM199 39C199 40.7 200.3 42 202 42C203.7 42 205 40.7 205 39H199Z" fill="white"/>
    </svg>`,
  },
  {
    id: "like_thumb",
    name: "Thumbs Up Like",
    category: "social",
    defaultColor: "#3b82f6",
    svgRaw: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="46" fill="#3b82f6"/>
      <path d="M30 46V72H40V46H30ZM72 48C72 44.7 69.3 42 66 42H54.4L56.2 33.3L56.3 32.7C56.3 31.4 55.7 30.2 54.8 29.3L52.5 27L41.3 38.2C40.5 39 40 40.2 40 41.5V68C40 71.3 42.7 74 46 74H63C65.5 74 67.6 72.5 68.5 70.3L73.5 58.7C73.8 58 74 57.2 74 56.5V50C74 48.9 73.1 48 72 48Z" fill="white"/>
    </svg>`,
  },
  {
    id: "bell_notify",
    name: "Notification Bell",
    category: "social",
    defaultColor: "#eab308",
    svgRaw: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="46" fill="#eab308"/>
      <path d="M50 25C43.4 25 38 30.4 38 37V52L32 60V63H68V60L62 52V37C62 30.4 56.6 25 50 25ZM44 66C44 69.3 46.7 72 50 72C53.3 72 56 69.3 56 66H44Z" fill="#1e293b"/>
    </svg>`,
  },
  {
    id: "tiktok_heart",
    name: "TikTok Heart",
    category: "social",
    defaultColor: "#f43f5e",
    svgRaw: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 82L47.1 79.4C26.5 60.7 13 48.4 13 33.5C13 21.3 22.3 12 34.5 12C41.4 12 48 15.2 50 20.3C52 15.2 58.6 12 65.5 12C77.7 12 87 21.3 87 33.5C87 48.4 73.5 60.7 52.9 79.4L50 82Z" fill="#f43f5e" stroke="white" stroke-width="4"/>
    </svg>`,
  },
  {
    id: "share_forward",
    name: "Share Forward",
    category: "social",
    defaultColor: "#10b981",
    svgRaw: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="46" fill="#10b981"/>
      <path d="M42 32V44C26 46 20 58 18 70C24 61 32 57 42 57V69L68 50.5L42 32Z" fill="white"/>
    </svg>`,
  },

  // 2. Sales & E-Commerce
  {
    id: "sale_badge",
    name: "SALE Burst Badge",
    category: "sales",
    defaultColor: "#dc2626",
    svgRaw: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="60,5 73,26 97,18 97,43 118,53 105,73 118,93 95,95 90,118 68,107 50,118 43,95 20,95 28,73 10,58 28,43 20,20 44,23" fill="#dc2626" stroke="#fef08a" stroke-width="4"/>
      <text x="60" y="69" font-family="'Impact', sans-serif" font-size="28" font-weight="bold" fill="#fef08a" text-anchor="middle" letter-spacing="1">SALE</text>
    </svg>`,
  },
  {
    id: "hot_deal",
    name: "HOT DEAL 🔥",
    category: "sales",
    defaultColor: "#ea580c",
    svgRaw: `<svg viewBox="0 0 180 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="180" height="60" rx="14" fill="linear-gradient(135deg, #ea580c, #dc2626)" stroke="#fef08a" stroke-width="3"/>
      <text x="90" y="38" font-family="'Impact', sans-serif" font-size="24" fill="#ffffff" text-anchor="middle" letter-spacing="1.5">🔥 HOT DEAL</text>
    </svg>`,
  },
  {
    id: "discount_50",
    name: "50% OFF Pill",
    category: "sales",
    defaultColor: "#ec4899",
    svgRaw: `<svg viewBox="0 0 180 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="180" height="60" rx="30" fill="#ec4899" stroke="white" stroke-width="3"/>
      <text x="90" y="40" font-family="'Segoe UI', sans-serif" font-weight="900" font-size="26" fill="white" text-anchor="middle">50% OFF</text>
    </svg>`,
  },
  {
    id: "shopping_cart",
    name: "Shopping Cart Badge",
    category: "sales",
    defaultColor: "#059669",
    svgRaw: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="46" fill="#059669"/>
      <path d="M30 30H36L42 58H68L74 38H40M45 68C42.8 68 41 69.8 41 72C41 74.2 42.8 76 45 76C47.2 76 49 74.2 49 72C49 69.8 47.2 68 45 68ZM65 68C62.8 68 61 69.8 61 72C61 74.2 62.8 76 65 76C67.2 76 69 74.2 69 72C69 69.8 67.2 68 65 68Z" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },

  // 3. Attention & Pointers
  {
    id: "arrow_down",
    name: "Animated Down Arrow",
    category: "arrows",
    defaultColor: "#facc15",
    svgRaw: `<svg viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M40 90L72 50H52V10H28V50H8L40 90Z" fill="#facc15" stroke="#000000" stroke-width="6" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: "sparkles",
    name: "Sparkles Bling ✨",
    category: "arrows",
    defaultColor: "#fef08a",
    svgRaw: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 10L56 38L84 44L56 50L50 78L44 50L16 44L44 38L50 10Z" fill="#facc15"/>
      <path d="M78 68L81 80L93 83L81 86L78 98L75 86L63 83L75 80L78 68Z" fill="#fef08a"/>
      <path d="M22 18L24 28L34 30L24 32L22 42L20 32L10 30L20 28L22 18Z" fill="#fef08a"/>
    </svg>`,
  },
  {
    id: "fire_trend",
    name: "Fire Flame 🔥",
    category: "arrows",
    defaultColor: "#f97316",
    svgRaw: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 14C50 14 58 32 44 46C42 40 40 34 40 34C26 48 30 70 44 80C34 76 28 66 30 56C20 68 24 84 42 90C64 94 78 78 76 58C74 42 62 30 62 30C62 30 60 40 52 46C54 36 50 14 50 14Z" fill="url(#fireGrad)" stroke="#b91c1c" stroke-width="2"/>
      <defs>
        <linearGradient id="fireGrad" x1="50" y1="14" x2="50" y2="90" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fef08a"/>
          <stop offset="0.5" stop-color="#f97316"/>
          <stop offset="1" stop-color="#dc2626"/>
        </linearGradient>
      </defs>
    </svg>`,
  },
  {
    id: "warning_alert",
    name: "Warning Alert ⚠️",
    category: "arrows",
    defaultColor: "#eab308",
    svgRaw: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="50,14 90,84 10,84" fill="#eab308" stroke="#1e293b" stroke-width="6" stroke-linejoin="round"/>
      <path d="M50 36V58M50 68V72" stroke="#1e293b" stroke-width="7" stroke-linecap="round"/>
    </svg>`,
  },

  // 4. Badges & Trust
  {
    id: "verified_blue",
    name: "Verified Checkmark",
    category: "badges",
    defaultColor: "#0284c7",
    svgRaw: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="46" fill="#0284c7"/>
      <path d="M30 52L44 66L72 36" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: "shield_guarantee",
    name: "Quality Shield 🛡️",
    category: "badges",
    defaultColor: "#10b981",
    svgRaw: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 14L80 26V52C80 72 50 88 50 88C50 88 20 72 20 52V26L50 14Z" fill="#10b981" stroke="#ffffff" stroke-width="4"/>
      <path d="M36 50L46 60L66 38" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: "five_stars",
    name: "5-Star Rating ⭐",
    category: "badges",
    defaultColor: "#facc15",
    svgRaw: `<svg viewBox="0 0 200 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g fill="#facc15" stroke="#ca8a04" stroke-width="1.5">
        <polygon points="20,4 25,16 38,16 27,24 31,36 20,28 9,36 13,24 2,16 15,16"/>
        <polygon points="60,4 65,16 78,16 67,24 71,36 60,28 49,36 53,24 42,16 55,16"/>
        <polygon points="100,4 105,16 118,16 107,24 111,36 100,28 89,36 93,24 82,16 95,16"/>
        <polygon points="140,4 145,16 158,16 147,24 151,36 140,28 129,36 133,24 122,16 135,16"/>
        <polygon points="180,4 185,16 198,16 187,24 191,36 180,28 169,36 173,24 162,16 175,16"/>
      </g>
    </svg>`,
  },

  // 5. Video & Camera UI
  {
    id: "camera_rec",
    name: "Camera REC Frame",
    category: "ui",
    defaultColor: "#ef4444",
    svgRaw: `<svg viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 30V10H30M170 10H190V30M190 90V110H170M30 110H10V90" stroke="white" stroke-width="4" stroke-linecap="round"/>
      <circle cx="45" cy="30" r="8" fill="#ef4444"/>
      <text x="62" y="36" font-family="'Segoe UI', sans-serif" font-weight="900" font-size="18" fill="white">REC</text>
    </svg>`,
  },
  {
    id: "live_badge",
    name: "LIVE Stream Pill",
    category: "ui",
    defaultColor: "#dc2626",
    svgRaw: `<svg viewBox="0 0 120 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="48" rx="8" fill="#dc2626"/>
      <circle cx="28" cy="24" r="6" fill="white"/>
      <text x="44" y="32" font-family="'Segoe UI', sans-serif" font-weight="900" font-size="20" fill="white" letter-spacing="1">LIVE</text>
    </svg>`,
  },
];

export function StockSvgModal({
  isOpen,
  onClose,
  onAddSvgClip,
  currentTimeMs,
}: StockSvgModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<"all" | "social" | "sales" | "arrows" | "badges" | "ui">("all");
  const [selectedSvg, setSelectedSvg] = useState<StockSvgItem>(STOCK_SVGS[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [size, setSize] = useState(140);
  const [colorTint, setColorTint] = useState<string>(STOCK_SVGS[0].defaultColor);
  const [animation, setAnimation] = useState<"none" | "bounce" | "pulse" | "spin" | "float">("bounce");
  const [durationSec, setDurationSec] = useState(4.0);
  const [posX, setPosX] = useState(0.5);
  const [posY, setPosY] = useState(0.35);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const categoryCounts = {
    all: STOCK_SVGS.length,
    social: STOCK_SVGS.filter((s) => s.category === "social").length,
    sales: STOCK_SVGS.filter((s) => s.category === "sales").length,
    arrows: STOCK_SVGS.filter((s) => s.category === "arrows").length,
    badges: STOCK_SVGS.filter((s) => s.category === "badges").length,
    ui: STOCK_SVGS.filter((s) => s.category === "ui").length,
  };

  const filtered = STOCK_SVGS.filter((s) => {
    if (selectedCategory !== "all" && s.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      return s.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    }
    return true;
  });

  const handleSelectSvg = (svg: StockSvgItem) => {
    setSelectedSvg(svg);
    setColorTint(svg.defaultColor);
  };

  // Dynamically apply color tint to SVG fill/stroke
  const applySvgTint = (rawSvg: string, tintColor: string): string => {
    if (!tintColor) return rawSvg;
    return rawSvg
      .replace(/fill="([^"]+)"/g, (match, p1) => (p1 === "none" || p1 === "white" || p1 === "#ffffff" ? match : `fill="${tintColor}"`))
      .replace(/stroke="([^"]+)"/g, (match, p1) => (p1 === "none" || p1 === "white" || p1 === "#ffffff" ? match : `stroke="${tintColor}"`));
  };

  const tintedSvgRaw = applySvgTint(selectedSvg.svgRaw, colorTint);

  const handleCreateClip = () => {
    const newClip: NleClip = {
      id: `svg_${Date.now()}`,
      name: `⭐ ${selectedSvg.name}`,
      timelineStartMs: Math.round(currentTimeMs),
      durationMs: Math.round(durationSec * 1000),
      sourceType: "generated_code",
      codeEngine: "react_css",
      svgContent: tintedSvgRaw,
      svgColor: colorTint,
      animationEffect: animation as any,
      transform: {
        x: posX,
        y: posY,
        scale: size / 100,
        opacity: 1.0,
      },
    };

    onAddSvgClip(newClip);
    onClose();
  };

  return (
    <div className="nle-modal-overlay" onClick={onClose}>
      <div className="nle-modal-card stock-svg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nle-modal-header">
          <div className="modal-header-title">
            <span className="modal-icon">⭐</span>
            <h3>คลังสติกเกอร์ / เวกเตอร์กราฟิก (Stock SVG Library)</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="ปิดหน้าต่าง (Esc)">
            ✕
          </button>
        </div>

        <div className="nle-modal-body">
          {/* Search Box */}
          <div className="modal-form-group" style={{ marginBottom: "10px" }}>
            <input
              type="text"
              className="font-select-field"
              placeholder="🔍 ค้นหาไอคอนเวกเตอร์ / สติกเกอร์..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          {/* Category Tabs with Badges */}
          <div className="svg-category-tabs">
            <button
              type="button"
              className={`svg-cat-btn ${selectedCategory === "all" ? "active" : ""}`}
              onClick={() => setSelectedCategory("all")}
            >
              ทั้งหมด ({categoryCounts.all})
            </button>
            <button
              type="button"
              className={`svg-cat-btn ${selectedCategory === "social" ? "active" : ""}`}
              onClick={() => setSelectedCategory("social")}
            >
              📱 โซเชียล ({categoryCounts.social})
            </button>
            <button
              type="button"
              className={`svg-cat-btn ${selectedCategory === "sales" ? "active" : ""}`}
              onClick={() => setSelectedCategory("sales")}
            >
              🏷️ ขาย ({categoryCounts.sales})
            </button>
            <button
              type="button"
              className={`svg-cat-btn ${selectedCategory === "arrows" ? "active" : ""}`}
              onClick={() => setSelectedCategory("arrows")}
            >
              🎯 ลูกศร ({categoryCounts.arrows})
            </button>
            <button
              type="button"
              className={`svg-cat-btn ${selectedCategory === "badges" ? "active" : ""}`}
              onClick={() => setSelectedCategory("badges")}
            >
              🛡️ ตรา ({categoryCounts.badges})
            </button>
            <button
              type="button"
              className={`svg-cat-btn ${selectedCategory === "ui" ? "active" : ""}`}
              onClick={() => setSelectedCategory("ui")}
            >
              📹 กล้อง ({categoryCounts.ui})
            </button>
          </div>

          <div className="stock-svg-main-layout">
            {/* Grid of SVGs */}
            <div className="svg-selection-grid">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`svg-grid-card ${selectedSvg.id === item.id ? "selected" : ""}`}
                  onClick={() => handleSelectSvg(item)}
                >
                  <div
                    className="svg-card-thumb"
                    dangerouslySetInnerHTML={{ __html: item.svgRaw }}
                  />
                  <span className="svg-card-name">{item.name}</span>
                </button>
              ))}
            </div>

            {/* Customization Sidebar & Live Preview */}
            <div className="svg-customizer-panel">
              <div className="svg-preview-box">
                <div className="svg-preview-label">ตัวอย่างบนจอ (Preview):</div>
                <div className="svg-preview-canvas">
                  <div
                    className={`svg-rendered-wrapper anim-svg-${animation}`}
                    style={{
                      width: `${Math.round(size * 0.7)}px`,
                      height: "auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    dangerouslySetInnerHTML={{ __html: selectedSvg.svgRaw }}
                  />
                </div>
              </div>

              <div className="modal-form-group">
                <label className="form-label">ขนาดแสดงผล: {size}px</label>
                <input
                  type="range"
                  min={50}
                  max={300}
                  value={size}
                  onChange={(e) => setSize(parseInt(e.target.value, 10))}
                  className="slider-range-input"
                />
              </div>

              <div className="modal-form-group">
                <label className="form-label">แอนิเมชันเคลื่อนไหว:</label>
                <select
                  className="font-select-field"
                  value={animation}
                  onChange={(e) => setAnimation(e.target.value as any)}
                >
                  <option value="none">นิ่งคงที่ (Static)</option>
                  <option value="bounce">🏀 เด้งดึ๋ง (Bounce Loop)</option>
                  <option value="pulse">💓 ขยายหดจังหวะ (Pulse)</option>
                  <option value="float">☁️ ลอยลื่นไหล (Float)</option>
                  <option value="spin">🔄 หมุนรอบตัว (Spin)</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label className="form-label">ความยาวเวลาแสดง: {durationSec.toFixed(1)} วินาที</label>
                <input
                  type="range"
                  min={1.0}
                  max={12.0}
                  step={0.5}
                  value={durationSec}
                  onChange={(e) => setDurationSec(parseFloat(e.target.value))}
                  className="slider-range-input"
                />
              </div>

              <div className="modal-form-group">
                <label className="form-label">ตำแหน่งแนวตั้ง:</label>
                <div className="pos-preset-group">
                  <button
                    type="button"
                    className={`pos-chip ${posY <= 0.25 ? "active" : ""}`}
                    onClick={() => { setPosX(0.5); setPosY(0.18); }}
                  >
                    บน
                  </button>
                  <button
                    type="button"
                    className={`pos-chip ${posY > 0.25 && posY < 0.65 ? "active" : ""}`}
                    onClick={() => { setPosX(0.5); setPosY(0.45); }}
                  >
                    กลาง
                  </button>
                  <button
                    type="button"
                    className={`pos-chip ${posY >= 0.65 ? "active" : ""}`}
                    onClick={() => { setPosX(0.5); setPosY(0.78); }}
                  >
                    ล่าง
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="nle-modal-footer">
          <button type="button" className="modal-cancel-btn" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="modal-confirm-btn" onClick={handleCreateClip}>
            ➕ เพิ่มลงวิดีโอ (Track O1)
          </button>
        </div>
      </div>
    </div>
  );
}
