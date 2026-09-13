import React, { useMemo, useState } from 'react';
import { actionStyle, fieldStyle, panelStyle, secondaryActionStyle, type EditorPanelBaseProps } from './EditorPanelShared';

type CodeKind = 'css' | 'react' | 'three';

const PREVIEWS: Record<CodeKind, { title: string; style: React.CSSProperties; markup: string }> = {
  css: { title: 'CSS overlay', style: { background: 'linear-gradient(135deg,#2563eb,#a855f7)', borderRadius: 12, padding: 18, color: '#fff', fontWeight: 700 }, markup: 'CSS Card' },
  react: { title: 'React overlay', style: { background: '#111827', border: '1px solid #38bdf8', borderRadius: 8, padding: 18, color: '#bae6fd' }, markup: 'React Card' },
  three: { title: 'Three.js overlay', style: { background: 'radial-gradient(circle at 30% 30%,#fbbf24,#7c2d12)', borderRadius: '50%', width: 100, height: 100, display: 'grid', placeItems: 'center', color: '#fff' }, markup: '3D' },
};

export default function CodeOverlayPanel({ onQueueOperation }: EditorPanelBaseProps) {
  const [kind, setKind] = useState<CodeKind>('css');
  const [prompt, setPrompt] = useState('การ์ดชื่อสินค้าแบบโปร่งใส');
  const [approved, setApproved] = useState(false);
  const [status, setStatus] = useState('AI จะสร้าง declarative manifest และ preview ก่อนใช้งาน');
  const preview = useMemo(() => PREVIEWS[kind], [kind]);
  const generate = async () => {
    if (!prompt.trim()) { setStatus('กรุณาระบุสิ่งที่ต้องการสร้าง'); return; }
    setApproved(false);
    setStatus('สร้าง preview แล้ว ตรวจสอบก่อนอนุมัติ');
  };
  const queue = async () => {
    if (!approved) { setStatus('ต้องอนุมัติ preview ก่อนส่ง Worker'); return; }
    if (!onQueueOperation) { setStatus('Worker handoff ยังไม่พร้อม'); return; }
    try {
      await onQueueOperation('media.ai_media_studio', { mode: 'code_overlay', codeKind: kind, prompt: prompt.trim(), manifestVersion: '1', previewApproved: true, sourceExecution: 'disabled' });
      setStatus('ส่ง manifest เข้า Worker แล้ว');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'ส่ง manifest ไม่สำเร็จ');
    }
  };
  return <section style={panelStyle} aria-label="AI code overlay">
    <h3 style={{ margin: '0 0 6px', color: '#fff', fontSize: 15 }}>⌘ AI CSS / React / Three.js</h3>
    <p style={{ margin: '0 0 10px', color: '#999', lineHeight: 1.5 }}>สร้างโค้ดเป็น manifest แบบจำกัดสิทธิ์ ไม่ execute source โดยตรง และมี preview ก่อน render</p>
    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}><select style={{ ...fieldStyle, flex: 1 }} value={kind} onChange={(event) => setKind(event.target.value as CodeKind)}><option value="css">CSS</option><option value="react">React</option><option value="three">Three.js</option></select><button type="button" style={secondaryActionStyle} onClick={() => void generate()}>สร้าง Preview</button></div>
    <textarea style={{ ...fieldStyle, minHeight: 60, resize: 'vertical' }} value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="คำอธิบาย overlay" />
    <div style={{ margin: '10px 0', minHeight: 110, display: 'grid', placeItems: 'center', background: '#0b1020', border: '1px solid #334155', borderRadius: 7 }}><div style={preview.style}>{preview.markup}</div></div>
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 9 }}><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /> ยืนยัน preview และ policy</label>
    <button type="button" style={actionStyle} onClick={() => void queue()}>ส่ง overlay เข้า Worker</button>
    <p role="status" aria-live="polite" style={{ color: '#9bd7ff', marginTop: 9 }}>{status}</p>
  </section>;
}
