import React from 'react';
import type { Clip, SmartCameraSettings } from '../../types/videoEditor';

const DEFAULT_SETTINGS: SmartCameraSettings = {
  mode: 'off',
  autoZoom: false,
  autoPan: false,
  intensity: 50,
  safeMargin: 10,
};

interface SmartCameraPanelProps {
  selectedClip: Clip | null;
  onChange: (clipId: string, settings: SmartCameraSettings) => void;
  onAddKeyframe: (clipId: string) => void;
  onRequestAnalysis: (clipId: string) => void | Promise<void>;
  onRequestFullScan?: (clipId: string) => void | Promise<void>;
}

const buttonStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 6px',
  borderRadius: 4,
  border: '1px solid #444',
  background: '#252525',
  color: '#ddd',
  cursor: 'pointer',
  fontSize: 11,
};

export default function SmartCameraPanel({
  selectedClip,
  onChange,
  onAddKeyframe,
  onRequestAnalysis,
  onRequestFullScan,
}: SmartCameraPanelProps) {
  const settings = selectedClip?.smartCamera || DEFAULT_SETTINGS;

  const update = (patch: Partial<SmartCameraSettings>) => {
    if (!selectedClip) return;
    onChange(selectedClip.id, { ...settings, ...patch });
  };

  return (
    <section style={{ padding: 14, color: '#ddd', fontSize: 12 }} aria-label="Smart Camera">
      <h3 style={{ margin: '0 0 6px', fontSize: 15, color: '#fff' }}>🎯 Smart Camera</h3>
      <p style={{ margin: '0 0 14px', color: '#999', lineHeight: 1.5 }}>
        ติดตามใบหน้าและ activity ได้ใน browser; Full Scan และ render หนักส่ง Worker เมื่อพร้อม
      </p>
      {!selectedClip ? (
        <div style={{ padding: 16, border: '1px dashed #555', borderRadius: 6, color: '#999', textAlign: 'center' }}>
          เลือกคลิปใน timeline ก่อน
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {([
              ['off', 'ปิด'],
              ['auto_face', 'ติดตามใบหน้า'],
              ['face_focus', 'Face Focus'],
              ['face_activity', 'Face + Activity'],
              ['auto_object', 'ติดตามวัตถุ'],
              ['manual_keyframes', 'กำหนดเอง'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                style={{ ...buttonStyle, background: settings.mode === mode ? '#0078d4' : '#252525', color: settings.mode === mode ? '#fff' : '#ddd' }}
                onClick={() => update({ mode })}
                aria-pressed={settings.mode === mode}
              >
                {label}
              </button>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #333' }}>
            <span>Auto Zoom</span>
            <input type="checkbox" checked={settings.autoZoom} onChange={(event) => update({ autoZoom: event.target.checked })} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #333' }}>
            <span>Auto Pan</span>
            <input type="checkbox" checked={settings.autoPan} onChange={(event) => update({ autoPan: event.target.checked })} />
          </label>
          <label style={{ display: 'block', padding: '10px 0', borderBottom: '1px solid #333' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>ความแรง</span><output>{settings.intensity}%</output></span>
            <input style={{ width: '100%', marginTop: 7 }} type="range" min={0} max={100} value={settings.intensity} onChange={(event) => update({ intensity: Number(event.target.value) })} />
          </label>
          <label style={{ display: 'block', padding: '10px 0 14px' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>ขอบปลอดภัย</span><output>{settings.safeMargin}%</output></span>
            <input style={{ width: '100%', marginTop: 7 }} type="range" min={0} max={30} value={settings.safeMargin} onChange={(event) => update({ safeMargin: Number(event.target.value) })} />
          </label>
          <div style={{ display: 'grid', gap: 8 }}>
            <div role="status" aria-live="polite" style={{ color: settings.analysisStatus === 'error' ? '#fca5a5' : '#9ca3af' }}>
              {settings.analysisStatus === 'worker_running' ? 'กำลังวิเคราะห์ใน Worker…' : settings.analysisStatus === 'browser_running' ? 'กำลังวิเคราะห์ใน browser…' : (settings.analysisStatus === 'browser_ready' || settings.analysisStatus === 'browser_degraded') && settings.mode === 'face_activity' && settings.warnings?.includes('activity_unavailable') ? 'ไม่พบ activity ที่เชื่อถือได้ · ใช้ Face Focus ชั่วคราว' : settings.analysisStatus === 'browser_ready' ? `พร้อมใช้ใน browser${settings.facePointCount ? ` · ${settings.facePointCount} จุดใบหน้า` : ''}` : settings.analysisStatus === 'browser_degraded' ? 'วิเคราะห์ได้บางส่วน · ตรวจกรอบหรือใช้ Full Scan' : settings.analysisStatus === 'stale' ? 'ผลวิเคราะห์เก่าแล้ว ต้องวิเคราะห์ใหม่' : settings.analysisStatus === 'error' ? 'วิเคราะห์ไม่สำเร็จ · ลอง Quick ใหม่หรือใช้ Full Scan' : 'พร้อมวิเคราะห์จากคลิป'}
            </div>
            <button type="button" style={{ ...buttonStyle, flex: 'none', background: '#153b53', borderColor: '#0078d4' }} onClick={() => void onRequestAnalysis(selectedClip.id)}>
              🔍 วิเคราะห์ใน browser (Quick)
            </button>
            {onRequestFullScan && <button type="button" style={{ ...buttonStyle, flex: 'none' }} onClick={() => void onRequestFullScan(selectedClip.id)}>
              🧠 Full Scan ผ่าน Worker
            </button>}
            <button type="button" style={{ ...buttonStyle, flex: 'none' }} onClick={() => onAddKeyframe(selectedClip.id)}>
              ◇ เพิ่ม keyframe ที่ playhead
            </button>
          </div>
        </>
      )}
    </section>
  );
}
