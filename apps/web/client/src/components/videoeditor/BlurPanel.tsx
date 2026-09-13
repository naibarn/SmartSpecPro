import React, { useState } from 'react';
import { actionStyle, fieldStyle, panelStyle, secondaryActionStyle, type EditorPanelBaseProps } from './EditorPanelShared';

export default function BlurPanel({ onQueueOperation, assetIds = [] }: EditorPanelBaseProps) {
  const [shape, setShape] = useState<'rectangle' | 'ellipse'>('ellipse');
  const [strength, setStrength] = useState(70);
  const [trackObject, setTrackObject] = useState(true);
  const [regions, setRegions] = useState<Array<{ id: string; shape: string; strength: number }>>([]);
  const [status, setStatus] = useState('เลือกคลิป แล้วเพิ่ม region เบลอ');
  const visual = assetIds.find((asset) => asset.type !== 'audio');
  const addRegion = () => { setRegions((items) => [...items, { id: `region-${Date.now()}`, shape, strength }]); setStatus('เพิ่ม region ที่ตำแหน่ง playhead แล้ว'); };
  const analyze = async () => { if (!visual) { setStatus('ยังไม่มีภาพหรือวิดีโอใน Bin'); return; } if (regions.length === 0) { setStatus('เพิ่ม region อย่างน้อย 1 จุดก่อนสร้างเส้นทาง'); return; } if (!onQueueOperation) { setStatus('Worker handoff ยังไม่พร้อม'); return; } setStatus('กำลังสร้างเส้นทางติดตามใน Worker...'); try { await onQueueOperation('media.privacy_track', { regions, trackObject, failClosed: true }, [visual.id]); setStatus('เส้นทางพร้อมตรวจสอบ ต้องอนุมัติก่อน render'); } catch (error) { setStatus(error instanceof Error ? error.message : 'วิเคราะห์ไม่สำเร็จ'); } };
  return <section style={panelStyle} aria-label="Privacy blur">
    <h3 style={{ margin: '0 0 6px', color: '#fff', fontSize: 15 }}>🕶️ FX / Blur</h3>
    <p style={{ margin: '0 0 10px', color: '#999' }}>เบลอใบหน้า/วัตถุและให้ region ติดตามวัตถุแบบ fail-closed</p>
    <label style={{ display: 'grid', gap: 5, marginBottom: 8 }}>รูปร่าง<select style={fieldStyle} value={shape} onChange={(event) => setShape(event.target.value as typeof shape)}><option value="ellipse">วงรี</option><option value="rectangle">สี่เหลี่ยม</option></select></label>
    <label style={{ display: 'grid', gap: 5, marginBottom: 8 }}>ความแรง {strength}%<input type="range" min={0} max={100} value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label>
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}><input type="checkbox" checked={trackObject} onChange={(event) => setTrackObject(event.target.checked)} /> เบลอติดตามวัตถุ</label>
    <div style={{ display: 'flex', gap: 8 }}><button type="button" style={secondaryActionStyle} onClick={addRegion}>+ เพิ่ม region</button><button type="button" style={actionStyle} onClick={() => void analyze()}>สร้างเส้นทางติดตาม</button></div>
    {regions.length > 0 && <ul style={{ margin: '10px 0', paddingLeft: 18, color: '#aaa' }}>{regions.map((region, index) => <li key={region.id}>Region {index + 1} · {region.shape} · {region.strength}% <button type="button" style={{ ...secondaryActionStyle, padding: '2px 5px', marginLeft: 4 }} onClick={() => setRegions((items) => items.filter((item) => item.id !== region.id))}>ลบ</button></li>)}</ul>}
    <p role="status" aria-live="polite" style={{ color: '#9bd7ff', marginTop: 10 }}>{status}</p>
  </section>;
}
