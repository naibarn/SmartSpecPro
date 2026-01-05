import type { MediaEvent } from "../services/mediaChannel";

export default function MediaGallery({ items }: { items: MediaEvent[] }) {
  if (!items.length) return <div style={{ opacity: 0.7 }}>No media yet.</div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Media</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {items.map((it, idx) => (
          <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{it.title || it.type}</div>
            {it.type === "image" ? (
              <img src={it.url} style={{ width: "100%", borderRadius: 10 }} />
            ) : it.type === "video" ? (
              <video src={it.url} controls style={{ width: "100%", borderRadius: 10 }} />
            ) : (
              <a href={it.url} target="_blank" rel="noreferrer">Open file</a>
            )}
            {it.mime ? <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>{it.mime}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
