import React, { useState, useEffect, useRef } from "react";
import { createRecordingClock } from "./recordingClock";
import type { NleClip } from "../../types/nleProject";

interface VoiceoverRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTimeMs: number;
  videoDurationMs: number;
  onAddAudioClip: (clip: NleClip) => void;
  onSyncPlayVideo?: (play: boolean, seekToMs?: number) => void;
}

interface AudioInputDevice {
  deviceId: string;
  label: string;
}

interface RecordedTake {
  id: string;
  startMs: number;
  durationMs: number;
  blobUrl: string;
  blob: Blob;
}

export function VoiceoverRecordModal({
  isOpen,
  onClose,
  currentTimeMs,
  videoDurationMs,
  onAddAudioClip,
  onSyncPlayVideo,
}: VoiceoverRecordModalProps) {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingStartMs, setRecordingStartMs] = useState(currentTimeMs);
  const [currentElapsedMs, setCurrentElapsedMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [takes, setTakes] = useState<RecordedTake[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef<ReturnType<typeof createRecordingClock> | null>(null);
  const requestRef = useRef(0);
  const startingRef = useRef(false);
  const discardedRecorders = useRef(new WeakSet<MediaRecorder>());
  const takeUrls = useRef(new Set<string>());
  const openRef = useRef(isOpen);
  openRef.current = isOpen;

  // Enumerate Audio Devices
  useEffect(() => {
    if (!isOpen) return;
    async function getAudioDevices() {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach((t) => t.stop());

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevices
          .filter((d) => d.kind === "audioinput")
          .map((d, index) => ({
            deviceId: d.deviceId,
            label: d.label || `ไมโครโฟน / Line In #${index + 1}`,
          }));
        setDevices(audioInputs);
        if (audioInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
      } catch (err) {
        console.warn("Could not enumerate audio devices:", err);
      }
    }
    getAudioDevices();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      stopEverything();
    }
  }, [isOpen]);

  const stopEverything = () => {
    requestRef.current += 1;
    startingRef.current = false;
    clockRef.current?.pause();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    onSyncPlayVideo?.(false);
  };

  useEffect(() => () => {
    if (mediaRecorderRef.current) discardedRecorders.current.add(mediaRecorderRef.current);
    stopEverything();
    takeUrls.current.forEach((url) => URL.revokeObjectURL(url));
    takeUrls.current.clear();
  }, []);

  const startVULevelMonitoring = (stream: MediaStream) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (e) {
      console.warn("VU meter setup failed:", e);
    }
  };

  const handleStartRecording = async (seekToStart = false) => {
    if (startingRef.current || mediaRecorderRef.current?.state === "recording" || mediaRecorderRef.current?.state === "paused") return;
    startingRef.current = true;
    const request = ++requestRef.current;
    try {
      const targetStartMs = seekToStart ? 0 : currentTimeMs;
      setRecordingStartMs(targetStartMs);
      setCurrentElapsedMs(0);

      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (request !== requestRef.current || !openRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      startVULevelMonitoring(stream);

      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const clock = createRecordingClock();
      clockRef.current = clock;
      const chunks: Blob[] = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        clock.pause();
        if (discardedRecorders.current.has(recorder) || chunks.length === 0) return;
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        const blobUrl = URL.createObjectURL(audioBlob);
        takeUrls.current.add(blobUrl);
        const newTake: RecordedTake = {
          id: `take_${Date.now()}`,
          startMs: targetStartMs,
          durationMs: Math.round(clock.elapsedMs()),
          blobUrl,
          blob: audioBlob,
        };
        setTakes((prev) => [...prev, newTake]);
      };

      recorder.start(250);
      setIsRecording(true);
      setIsPaused(false);

      // Synchronously play video
      onSyncPlayVideo?.(true, targetStartMs);

      timerIntervalRef.current = setInterval(() => {
        setCurrentElapsedMs(clock.elapsedMs());
      }, 100);
    } catch (err) {
      stopEverything();
      console.error("Failed to start voiceover recording:", err);
      if (openRef.current) alert("ไม่สามารถเข้าถึงอุปกรณ์ไมโครโฟนได้ กรุณาตรวจสอบสิทธิ์การใช้งาน");
    } finally {
      if (request === requestRef.current) startingRef.current = false;
    }
  };

  const handlePauseResume = () => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      clockRef.current?.resume();
      setIsPaused(false);
      onSyncPlayVideo?.(true);
    } else {
      mediaRecorderRef.current.pause();
      clockRef.current?.pause();
      setIsPaused(true);
      onSyncPlayVideo?.(false);
    }
  };

  const handleStopRecording = () => {
    stopEverything();
  };

  const handleDiscardLatestTake = () => {
    if (isRecording) {
      if (mediaRecorderRef.current) discardedRecorders.current.add(mediaRecorderRef.current);
      handleStopRecording();
    } else if (takes.length > 0) {
      const url = takes[takes.length - 1].blobUrl;
      URL.revokeObjectURL(url);
      takeUrls.current.delete(url);
      setTakes((prev) => prev.slice(0, prev.length - 1));
    }
    onSyncPlayVideo?.(false, recordingStartMs);
  };

  const handleApplyTakeToTimeline = async (take: RecordedTake) => {
    const request = requestRef.current;
    let sourceUrl: string;
    try {
      sourceUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(take.blob);
      });
    } catch {
      if (openRef.current) alert("ไม่สามารถจัดเก็บเสียงบันทึกได้ กรุณาลองอีกครั้ง");
      return;
    }
    if (!openRef.current || request !== requestRef.current) return;
    const newAudioClip: NleClip = {
      id: `vo_${Date.now()}`,
      name: `🎙️ บรรยาย (${(take.durationMs / 1000).toFixed(1)}s)`,
      timelineStartMs: Math.round(take.startMs),
      durationMs: Math.round(take.durationMs),
      sourceType: "smartaihub_library",
      sourceUrl,
      volume: 1.0,
    };
    onAddAudioClip(newAudioClip);
    stopEverything();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="nle-modal-overlay" onClick={onClose}>
      <div className="nle-modal-card voiceover-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "680px" }}>
        <div className="nle-modal-header">
          <div className="modal-header-title">
            <span className="modal-icon">🎙️</span>
            <div>
              <h3>ห้องบันทึกเสียงบรรยายสด (Voiceover Studio)</h3>
              <p className="modal-subtext" style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>
                บันทึกเสียงสดพร้อมเล่นวิดีโอคู่ขนาน เพื่อการพากย์ที่แม่นยำตรงจังหวะ
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="nle-modal-body" style={{ padding: "18px" }}>
          {/* Device Selection & Status */}
          <div className="modal-form-group">
            <label className="form-label" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>เลือกไมโครโฟน / สัญญาณเสียงเข้า (Audio Input Device):</span>
              <span style={{ color: "#38bdf8", fontWeight: 600 }}>{devices.length} อุปกรณ์ที่พบ</span>
            </label>
            <select
              className="font-select-field"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={isRecording}
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  🎤 {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* VU Meter Visualizer */}
          <div
            className="vu-meter-stage"
            style={{
              background: "#090d16",
              border: "1px solid #1e293b",
              borderRadius: "10px",
              padding: "16px",
              margin: "12px 0",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#94a3b8" }}>
              <span>ระดับสัญญาณไมค์ (Live VU Meter):</span>
              <span style={{ color: audioLevel > 80 ? "#ef4444" : audioLevel > 50 ? "#eab308" : "#22c55e" }}>
                {audioLevel}%
              </span>
            </div>
            <div style={{ width: "100%", height: "14px", background: "#1e293b", borderRadius: "7px", overflow: "hidden", display: "flex" }}>
              <div
                style={{
                  width: `${audioLevel}%`,
                  height: "100%",
                  background:
                    audioLevel > 85
                      ? "linear-gradient(90deg, #22c55e 0%, #eab308 60%, #ef4444 100%)"
                      : audioLevel > 50
                      ? "linear-gradient(90deg, #22c55e 0%, #eab308 100%)"
                      : "#22c55e",
                  transition: "width 0.05s ease-out",
                }}
              />
            </div>

            {/* Recording Timer Display */}
            <div style={{ textAlign: "center", marginTop: "8px" }}>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: "1.8rem",
                  fontWeight: 900,
                  color: isRecording ? "#ef4444" : "#94a3b8",
                }}
              >
                {isRecording ? "🔴 " : "⚪ "}
                {(currentElapsedMs / 1000).toFixed(1)}s
              </span>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                เริ่มที่ตำแหน่ง: {(recordingStartMs / 1000).toFixed(1)}s
              </div>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", margin: "16px 0" }}>
            {!isRecording ? (
              <>
                <button
                  type="button"
                  className="modal-confirm-btn"
                  onClick={() => handleStartRecording(false)}
                  style={{
                    background: "linear-gradient(135deg, #ef4444, #dc2626)",
                    fontSize: "0.95rem",
                    padding: "10px 20px",
                  }}
                >
                  🔴 เริ่มอัดจากตำแหน่งปัจจุบัน ({(currentTimeMs / 1000).toFixed(1)}s)
                </button>
                <button
                  type="button"
                  className="modal-confirm-btn"
                  onClick={() => handleStartRecording(true)}
                  style={{
                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                    fontSize: "0.95rem",
                    padding: "10px 20px",
                  }}
                >
                  ⏮️ เริ่มอัดตั้งแต่ต้นคลิป (00:00)
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={handlePauseResume}
                  style={{ padding: "10px 18px", fontWeight: 700 }}
                >
                  {isPaused ? "▶️ อัดต่อ" : "⏸️ หยุดชั่วคราว"}
                </button>
                <button
                  type="button"
                  className="modal-confirm-btn"
                  onClick={handleStopRecording}
                  style={{
                    background: "linear-gradient(135deg, #10b981, #059669)",
                    padding: "10px 22px",
                    fontWeight: 700,
                  }}
                >
                  ⏹️ เสร็จสิ้นช่วงนี้
                </button>
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={handleDiscardLatestTake}
                  style={{
                    background: "rgba(239, 68, 68, 0.2)",
                    borderColor: "#ef4444",
                    color: "#fca5a5",
                    fontWeight: 700,
                    padding: "10px 18px",
                  }}
                  title="ทิ้งช่วงที่เพิ่งพูดไปแล้วเริ่มใหม่ทันที"
                >
                  ↩️ ทิ้งช่วงนี้ / พูดผิด
                </button>
              </>
            )}
          </div>

          {/* Recorded Takes List */}
          {takes.length > 0 && (
            <div style={{ marginTop: "16px", borderTop: "1px solid #1e293b", paddingTop: "12px" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#f8fafc", marginBottom: "8px" }}>
                🎧 รายการเสียงที่อัดสำเร็จ ({takes.length} Takes):
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "150px", overflowY: "auto" }}>
                {takes.map((take, idx) => (
                  <div
                    key={take.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "#1e293b",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #334155",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontWeight: 700, color: "#38bdf8" }}>Take #{idx + 1}</span>
                      <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                        {(take.durationMs / 1000).toFixed(1)} วินาที (เริ่ม {(take.startMs / 1000).toFixed(1)}s)
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <audio src={take.blobUrl} controls style={{ height: "30px", width: "190px" }} />
                      <button
                        type="button"
                        className="modal-confirm-btn"
                        onClick={() => handleApplyTakeToTimeline(take)}
                        style={{ padding: "6px 12px", fontSize: "0.8rem", background: "#3b82f6" }}
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

        <div className="nle-modal-footer">
          <button type="button" className="modal-cancel-btn" onClick={onClose}>
            ปิด
          </button>
          {takes.length > 0 && (
            <button
              type="button"
              className="modal-confirm-btn"
              onClick={() => handleApplyTakeToTimeline(takes[takes.length - 1])}
            >
              ✅ นำ Take ล่าสุดลง Timeline (แทร็ก A1)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
