import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SeriesSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSeriesId?: string | null;
  onSelectSeries: (seriesId: string) => void;
}

interface SeriesItem {
  seriesId: string;
  title: string;
  status: string;
  accessMode: "read" | "operate";
  accessSource?: string;
  canBind?: boolean;
  canProcess?: boolean;
  canPublish?: boolean;
  updatedAt?: string;
}

interface SeriesListResponse {
  contractVersion?: string;
  items: SeriesItem[];
  nextCursor?: string | null;
}

export function SeriesSwitcherModal({
  isOpen,
  onClose,
  currentSeriesId,
  onSelectSeries,
}: SeriesSwitcherModalProps) {
  const [query, setQuery] = useState<string>("");
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSeries = useCallback(async (searchQuery: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<SeriesListResponse | SeriesItem[]>("worker_app_list_series", {
        query: searchQuery.trim() || null,
        cursor: null,
      });
      const rawList = Array.isArray(res) ? res : res?.items || [];
      setSeriesList(rawList);
    } catch (err) {
      console.warn("Failed to fetch series list:", err);
      setError("ไม่สามารถดึงข้อมูลซีรีส์จากเครื่องหรือ Server ได้ โปรดตรวจสอบการเชื่อมต่อ");
      setSeriesList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void fetchSeries(query);
  }, [isOpen, query, fetchSeries]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePickSeries = (id: string) => {
    onSelectSeries(id);
    onClose();
  };

  return (
    <div className="modal-backdrop nle-modal-backdrop" onClick={onClose}>
      <div
        className="project-settings-modal"
        style={{ maxWidth: "680px", width: "95%", maxHeight: "88vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ padding: "16px 20px" }}>
          <div className="modal-title-box">
            <span className="modal-title-icon" style={{ fontSize: "1.4rem" }}>📺</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#f8fafc" }}>
                เลือก / สลับซีรีส์ (Series Selection)
              </h3>
              <p className="modal-subtitle" style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#94a3b8" }}>
                ดึงข้อมูล Series จริงจาก Server (smartaihub.app) เพื่อผูกข้อมูลช็อตและ Spec 176/177
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} title="ปิดหน้าต่าง (Esc)">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal-body-scrollable" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Search Box */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input
              type="text"
              className="settings-text-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔍 พิมพ์ชื่อซีรีส์ หรือ Series ID เพื่อค้นหา..."
              style={{
                flex: 1,
                padding: "9px 14px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#f8fafc",
                fontSize: "0.9rem",
              }}
            />
            <button
              type="button"
              onClick={() => void fetchSeries(query)}
              disabled={loading}
              style={{
                padding: "9px 16px",
                borderRadius: "6px",
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "0.85rem",
              }}
            >
              {loading ? "⏳ กำลังค้น..." : "🔄 รีเฟรช"}
            </button>
          </div>

          {/* Standalone Choice Option */}
          <div
            onClick={() => handlePickSeries("")}
            style={{
              background: !currentSeriesId ? "rgba(56, 189, 248, 0.15)" : "#1e293b",
              border: !currentSeriesId ? "2px solid #38bdf8" : "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "10px",
              padding: "12px 16px",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "1.4rem" }}>🌐</span>
              <div>
                <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.9rem" }}>
                  ไม่ผูกกับ Series (Standalone Workspace)
                </div>
                <div style={{ fontSize: "0.76rem", color: "#94a3b8" }}>
                  ทำงานอิสระสำหรับคลิปทั่วไป ไม่ต้องใช้ Spec เรื่อง/เพลงของซีรีส์
                </div>
              </div>
            </div>
            {!currentSeriesId && (
              <span style={{ background: "#0284c7", color: "#fff", padding: "3px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 700 }}>
                ✓ ใช้งานอยู่
              </span>
            )}
          </div>

          {/* Error Notice */}
          {error && (
            <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: "8px", padding: "10px 14px", color: "#fca5a5", fontSize: "0.82rem" }}>
              ⚠️ {error}
            </div>
          )}

          {/* Series Cards Grid */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#cbd5e1" }}>
              รายการซีรีส์ทั้งหมดบน Server ({seriesList.length}):
            </div>

            {loading && seriesList.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8", fontSize: "0.9rem" }}>
                ⏳ กำลังโหลดรายการซีรีส์จาก smartaihub.app...
              </div>
            ) : seriesList.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem", background: "rgba(15, 23, 42, 0.5)", borderRadius: "8px" }}>
                ไม่พบซีรีส์บน Server หรือยังไม่ได้เชื่อมต่อระบบ
              </div>
            ) : (
              seriesList.map((item) => {
                const isSelected = String(currentSeriesId) === String(item.seriesId);

                return (
                  <div
                    key={item.seriesId}
                    onClick={() => handlePickSeries(String(item.seriesId))}
                    style={{
                      background: isSelected ? "rgba(16, 185, 129, 0.15)" : "#1e293b",
                      border: isSelected ? "2px solid #10b981" : "1px solid rgba(148, 163, 184, 0.2)",
                      borderRadius: "10px",
                      padding: "12px 16px",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "1.4rem" }}>🎬</span>
                      <div>
                        <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.92rem", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span>{item.title || `ซีรีส์ #${item.seriesId}`}</span>
                          <span style={{ background: "rgba(56, 189, 248, 0.2)", color: "#38bdf8", padding: "1px 6px", borderRadius: "4px", fontSize: "0.72rem", fontFamily: "monospace" }}>
                            ID: {item.seriesId}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginTop: "3px" }}>
                          สิทธิ์: <strong style={{ color: item.accessMode === "operate" ? "#34d399" : "#60a5fa" }}>{item.accessMode === "operate" ? "จัดการได้ (Operate)" : "ดูได้อย่างเดียว (Read)"}</strong>
                          {item.status ? ` · สถานะ: ${item.status}` : ""}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePickSeries(String(item.seriesId));
                      }}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "6px",
                        background: isSelected ? "#10b981" : "#0284c7",
                        color: "#ffffff",
                        border: "none",
                        fontWeight: 700,
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      {isSelected ? "✓ ใช้งานอยู่" : "เลือก Series นี้"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ padding: "14px 20px", display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn-cancel" onClick={onClose} style={{ padding: "8px 18px", borderRadius: "6px", background: "#334155", color: "#f8fafc", border: "none", cursor: "pointer", fontWeight: 600 }}>
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
