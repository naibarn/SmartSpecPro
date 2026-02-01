import { useState } from "react";
import type { MediaEvent } from "../services/mediaChannel";

export default function MediaGallery({ items }: { items: MediaEvent[] }) {
  const [selectedMedia, setSelectedMedia] = useState<MediaEvent | null>(null);

  if (!items.length) {
    return (
      <div style={{ 
        opacity: 0.6, 
        textAlign: "center", 
        padding: "20px 10px",
        fontSize: 13,
        lineHeight: 1.6
      }}>
        No media yet.
        <br />
        <span style={{ fontSize: 11 }}>
          Use "Insert Image" or "Insert Video" buttons to add media.
        </span>
      </div>
    );
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* Media count */}
      <div style={{ 
        fontSize: 12, 
        color: "#6b7280",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <span>{items.length} item{items.length > 1 ? "s" : ""}</span>
      </div>

      {/* Media grid */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "1fr", 
        gap: 8,
        maxHeight: "400px",
        overflowY: "auto"
      }}>
        {items.map((it, idx) => (
          <div 
            key={idx} 
            style={{ 
              border: "1px solid #e5e7eb", 
              borderRadius: 8, 
              padding: 8,
              background: "#ffffff",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onClick={() => setSelectedMedia(it)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#3b82f6";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#e5e7eb";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {/* Thumbnail */}
            <div style={{ 
              position: "relative",
              borderRadius: 6,
              overflow: "hidden",
              background: "#f3f4f6",
              marginBottom: 6
            }}>
              {it.type === "image" ? (
                <img 
                  src={it.url} 
                  alt={it.title || "Image"}
                  style={{ 
                    width: "100%", 
                    height: 120,
                    objectFit: "cover",
                    display: "block"
                  }} 
                />
              ) : it.type === "video" ? (
                <div style={{ position: "relative" }}>
                  <video 
                    src={it.url} 
                    style={{ 
                      width: "100%", 
                      height: 120,
                      objectFit: "cover",
                      display: "block"
                    }} 
                  />
                  <div style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    background: "rgba(0,0,0,0.6)",
                    borderRadius: "50%",
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: 18
                  }}>
                    ▶
                  </div>
                </div>
              ) : (
                <div style={{
                  height: 80,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 32
                }}>
                  📄
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ fontSize: 11 }}>
              <div style={{ 
                fontWeight: 600, 
                color: "#374151",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}>
                {it.title || it.type}
              </div>
              <div style={{ 
                color: "#9ca3af", 
                marginTop: 2,
                display: "flex",
                justifyContent: "space-between"
              }}>
                <span>{it.type}</span>
                <span>{formatFileSize(it.meta?.size)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox modal */}
      {selectedMedia && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20
          }}
          onClick={() => setSelectedMedia(null)}
        >
          <div 
            style={{ 
              maxWidth: "90vw", 
              maxHeight: "90vh",
              position: "relative"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setSelectedMedia(null)}
              style={{
                position: "absolute",
                top: -40,
                right: 0,
                background: "transparent",
                border: "none",
                color: "white",
                fontSize: 24,
                cursor: "pointer",
                padding: 8
              }}
            >
              ✕
            </button>

            {/* Media content */}
            {selectedMedia.type === "image" ? (
              <img 
                src={selectedMedia.url} 
                alt={selectedMedia.title || "Image"}
                style={{ 
                  maxWidth: "90vw", 
                  maxHeight: "85vh",
                  objectFit: "contain",
                  borderRadius: 8
                }} 
              />
            ) : selectedMedia.type === "video" ? (
              <video 
                src={selectedMedia.url} 
                controls
                autoPlay
                style={{ 
                  maxWidth: "90vw", 
                  maxHeight: "85vh",
                  borderRadius: 8
                }} 
              />
            ) : (
              <a 
                href={selectedMedia.url} 
                target="_blank" 
                rel="noreferrer"
                style={{ color: "white", fontSize: 18 }}
              >
                Open file: {selectedMedia.title}
              </a>
            )}

            {/* Caption */}
            <div style={{
              color: "white",
              textAlign: "center",
              marginTop: 12,
              fontSize: 14
            }}>
              {selectedMedia.title}
              {selectedMedia.meta?.size && (
                <span style={{ opacity: 0.7, marginLeft: 8 }}>
                  ({formatFileSize(selectedMedia.meta.size)})
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
