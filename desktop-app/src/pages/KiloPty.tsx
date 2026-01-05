import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PtyXterm from "../components/PtyXterm";
import MediaGallery from "../components/MediaGallery";
import { openPtyWs, ptyAttach, ptyCreate, ptyInput, ptySignal, PtyMessage, ptyPoll } from "../services/pty";
import { openMediaWs, mediaAttach, mediaEmit, MediaMessage, MediaEvent } from "../services/mediaChannel";
import { kiloListWorkflows } from "../services/kiloCli";
import { uploadToArtifactStorage } from "../services/artifacts";

const DEFAULT_WORKSPACE = import.meta.env.VITE_WORKSPACE_PATH || "";

type Tab = {
  id: string;
  title: string;
  command: string;
  status: string;
  seq: number;
  mediaSeq: number;
  media: MediaEvent[];
};

function isImageMime(m?: string) {
  return !!m && m.startsWith("image/");
}
function isVideoMime(m?: string) {
  return !!m && m.startsWith("video/");
}

export default function KiloPtyPage() {
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [command, setCommand] = useState("/sync-tasks.md");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string>("");

  const ptyWsRef = useRef<WebSocket | null>(null);
  const mediaWsRef = useRef<WebSocket | null>(null);

  const activeTab = useMemo(() => tabs.find((t) => t.id === active), [tabs, active]);

  const refreshWorkflows = useCallback(async () => {
    if (!workspace) return;
    try {
      const res = await kiloListWorkflows(workspace);
      setWorkflows(res.workflows || []);
    } catch {
      setWorkflows([]);
    }
  }, [workspace]);

  useEffect(() => {
    refreshWorkflows();
  }, [refreshWorkflows]);

  useEffect(() => {
    const pws = openPtyWs();
    const mws = openMediaWs();
    ptyWsRef.current = pws;
    mediaWsRef.current = mws;

    pws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as PtyMessage;

      if (msg.type === "created") {
        const sid = msg.sessionId;
        setTabs((prev) => [
          { id: sid, title: sid.slice(0, 6), command, status: "running", seq: 0, mediaSeq: 0, media: [] },
          ...prev,
        ]);
        setActive(sid);
        if (mws.readyState === 1) mediaAttach(mws, sid, 0);
        return;
      }

      if (!activeTab) return;

      if (msg.type === "stdout") {
        window.__ptyWrite?.(msg.data);
        setTabs((prev) => prev.map((t) => (t.id === active ? { ...t, seq: msg.seq } : t)));
      } else if (msg.type === "status") {
        setTabs((prev) => prev.map((t) => (t.id === active ? { ...t, status: msg.status, seq: msg.seq } : t)));
      }
    };

    mws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as MediaMessage;
      if (msg.type === "event") {
        const e = msg.event;
        setTabs((prev) =>
          prev.map((t) => (t.id === e.sessionId ? { ...t, mediaSeq: msg.seq, media: [e, ...t.media].slice(0, 200) } : t))
        );
      }
    };

    return () => {
      try {
        pws.close();
      } catch {}
      try {
        mws.close();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, command]);

  const createSession = useCallback(() => {
    const ws = ptyWsRef.current;
    if (!ws || ws.readyState !== 1) return;
    ptyCreate(ws, workspace, command);
  }, [workspace, command]);

  const attachTab = useCallback(
    (id: string) => {
      setActive(id);
      const ws = ptyWsRef.current;
      const mws = mediaWsRef.current;
      const tab = tabs.find((t) => t.id === id);
      if (!ws || ws.readyState !== 1 || !tab) return;
      ptyAttach(ws, id, tab.seq);
      if (mws && mws.readyState === 1) mediaAttach(mws, id, tab.mediaSeq);
      ptyPoll(ws);
    },
    [tabs]
  );

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => prev.filter((t) => t.id !== id));
      if (active === id) setActive(tabs.find((t) => t.id !== id)?.id || "");
    },
    [active, tabs]
  );

  const onTermData = useCallback((data: string) => {
    const ws = ptyWsRef.current;
    if (!ws || ws.readyState !== 1) return;
    ptyInput(ws, data);
  }, []);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const ws = ptyWsRef.current;
      if (!ws || ws.readyState !== 1) return;
      if (!activeTab) return;

      if (e.ctrlKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        ptySignal(ws, "SIGINT");
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        ptyInput(ws, "\x12");
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        createSession();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        closeTab(activeTab.id);
        return;
      }
    },
    [activeTab, createSession, closeTab]
  );

  async function pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
  }

  const insertMedia = async (kind: "image" | "video") => {
    if (!activeTab) return;

    const file = await pickFile(kind === "image" ? "image/*" : "video/*");
    if (!file) return;

    // Safety: ensure kind matches MIME
    if (kind === "image" && !isImageMime(file.type)) {
      alert("Selected file is not an image.");
      return;
    }
    if (kind === "video" && !isVideoMime(file.type)) {
      alert("Selected file is not a video.");
      return;
    }

    // Upload -> presigned GET URL (LLM-accessible)
    const uploaded = await uploadToArtifactStorage({ workspace, file, iteration: 0 });

    const ev: MediaEvent = {
      sessionId: activeTab.id, // PTY session id (tab)
      type: kind,
      title: uploaded.name,
      url: uploaded.getUrl,
      mime: uploaded.contentType,
      artifactKey: uploaded.key,
      meta: { size: uploaded.size, storageSessionId: uploaded.sessionId, iteration: uploaded.iteration },
    };

    const mws = mediaWsRef.current;
    if (mws && mws.readyState === 1) mediaEmit(mws, ev);

    // Inject a structured marker into terminal so workflow/LLM can consume it.
    // Convention: single-line, parseable; includes artifactKey + presigned URL.
    const pws = ptyWsRef.current;
    if (pws && pws.readyState === 1) {
      const safeName = uploaded.name.replace(/"/g, "'");
      const safeMime = uploaded.contentType.replace(/"/g, "'");
      const safeUrl = uploaded.getUrl.replace(/"/g, "%22");
      const safeKey = uploaded.key.replace(/"/g, "%22");

      ptyInput(
        pws,
        `\n@media kind=${kind} name="${safeName}" mime="${safeMime}" artifactKey="${safeKey}" url="${safeUrl}"\n`
      );
    }
  };

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>Terminal (PTY + Media Channel + Artifact Storage)</h2>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Shortcuts: Ctrl+C, Ctrl+R, Ctrl+Shift+T (new tab), Ctrl+W (close)</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12, opacity: 0.9 }}>Workspace</label>
        <input
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          placeholder="/path/to/workspace"
          style={{ minWidth: 460 }}
        />
        <button disabled={!workspace} onClick={refreshWorkflows}>
          Refresh workflows
        </button>

        <select value="" onChange={(e) => e.target.value && setCommand(e.target.value)} style={{ minWidth: 260 }}>
          <option value="">(autocomplete workflows)</option>
          {workflows.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>

        <input value={command} onChange={(e) => setCommand(e.target.value)} style={{ minWidth: 360 }} />
        <button disabled={!workspace || !command} onClick={createSession}>
          New Tab
        </button>

        <button disabled={!activeTab} onClick={() => insertMedia("image")}>
          Insert Image
        </button>
        <button disabled={!activeTab} onClick={() => insertMedia("video")}>
          Insert Video
        </button>
      </div>

      {tabs.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => attachTab(t.id)}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: t.id === active ? "#111827" : "white",
                color: t.id === active ? "white" : "#111827",
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
              }}
              title={t.command}
            >
              {t.title} • {t.status}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ opacity: 0.7 }}>No tabs. Click “New Tab”.</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 10 }}>
          <PtyXterm onData={onTermData} onKey={onKey} />
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
            {activeTab ? (
              <>
                sessionId: <span style={{ fontFamily: "monospace" }}>{activeTab.id}</span> | status: {activeTab.status}
              </>
            ) : null}
          </div>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 10 }}>
          <MediaGallery items={activeTab?.media || []} />
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 10 }}>
            Media channel แยกจาก terminal และไฟล์จะถูกอัปโหลดไป Artifact Storage (ผ่าน presign PUT/GET)
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75 }}>
        ตอนนี้ Insert Media: Upload → presigned GET URL → emit media event + inject @media marker ใน terminal (รองรับ workflow/LLM)
      </div>
    </div>
  );
}
