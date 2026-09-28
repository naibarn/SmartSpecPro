import React, { useMemo, useRef, useState } from 'react';
import { actionStyle, downloadTextFile, fieldStyle, panelStyle, secondaryActionStyle, type EditorPanelBaseProps } from './EditorPanelShared';

type Cue = { id: string; start: number; end: number; text: string };
const formatSrtTime = (seconds: number) => { const safe = Math.max(0, seconds); const ms = Math.round((safe % 1) * 1000); const total = Math.floor(safe); const s = total % 60; const m = Math.floor(total / 60) % 60; const h = Math.floor(total / 3600); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
const parseTime = (value: string) => { const match = value.trim().match(/^(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})$/); if (!match) return NaN; return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4].padEnd(3, '0')) / 1000; };

export default function SubtitleEditorPanel({ onQueueOperation, assetIds = [] }: EditorPanelBaseProps) {
  const [format, setFormat] = useState<'srt' | 'vtt'>('srt');
  const [burnIn, setBurnIn] = useState(false);
  const [cues, setCues] = useState<Cue[]>([{ id: 'cue-1', start: 0, end: 2, text: '' }]);
  const [status, setStatus] = useState('เพิ่มหรือ import subtitle แล้วตรวจสอบเวลา');
  const inputRef = useRef<HTMLInputElement>(null);
  const hasInvalid = useMemo(() => cues.some((cue, index) => !cue.text.trim() || cue.end <= cue.start || (index > 0 && cue.start < cues[index - 1].end)), [cues]);
  const exportText = () => {
    if (hasInvalid) { setStatus('แก้เวลาและข้อความที่ไม่ถูกต้องก่อน export'); return; }
    const content = format === 'vtt' ? `WEBVTT\n\n${cues.map((cue) => `${formatSrtTime(cue.start).replace(',', '.')} --> ${formatSrtTime(cue.end).replace(',', '.')}\n${cue.text}`).join('\n\n')}` : cues.map((cue, index) => `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}`).join('\n\n');
    downloadTextFile(`subtitle-${Date.now()}.${format}`, content, format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8');
    setStatus(`ส่งออก ${format.toUpperCase()} แล้ว`);
  };
  const importFile = async (file: File) => {
    const raw = await file.text();
    const blocks = raw.replace(/^WEBVTT\s*/i, '').trim().split(/\n\s*\n/);
    const parsed = blocks.flatMap((block, index) => { const lines = block.split(/\r?\n/); const timeLine = lines.find((line) => line.includes('-->')); if (!timeLine) return []; const [startRaw, endRaw] = timeLine.split('-->').map((value) => value.trim().split(/\s+/)[0]); const start = parseTime(startRaw.replace('.', ',')); const end = parseTime(endRaw.replace('.', ',')); const text = lines.slice(lines.indexOf(timeLine) + 1).join('\n').trim(); return Number.isFinite(start) && Number.isFinite(end) && end > start && text ? [{ id: `cue-${index + 1}`, start, end, text }] : []; });
    if (!parsed.length) { setStatus('ไม่พบ cue ที่ถูกต้องในไฟล์'); return; }
    setCues(parsed); setStatus(`นำเข้า ${parsed.length} cue แล้ว`);
  };
  return <section style={panelStyle} aria-label="Subtitle editor">
    <h3 style={{ margin: '0 0 6px', color: '#fff', fontSize: 15 }}>💬 สร้าง Subtitle</h3>
    <p style={{ margin: '0 0 10px', color: '#999' }}>รองรับสร้างเอง, import/export SRT/VTT และเลือก sidecar หรือ burn-in ตอน render</p>
    <input ref={inputRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} />
    <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}><button type="button" style={secondaryActionStyle} onClick={() => inputRef.current?.click()}>นำเข้า SRT/VTT</button><select style={{ ...fieldStyle, width: 90 }} value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="srt">SRT</option><option value="vtt">VTT</option></select><button type="button" style={actionStyle} onClick={exportText}>ส่งออก</button></div>
    {cues.map((cue, index) => <div key={cue.id} style={{ display: 'grid', gridTemplateColumns: '60px 60px 1fr auto', gap: 5, marginBottom: 6 }}><input aria-label={`เริ่ม cue ${index + 1}`} style={fieldStyle} type="number" min={0} step={0.1} value={cue.start} onChange={(event) => setCues((items) => items.map((item) => item.id === cue.id ? { ...item, start: Number(event.target.value) } : item))} /><input aria-label={`จบ cue ${index + 1}`} style={fieldStyle} type="number" min={0} step={0.1} value={cue.end} onChange={(event) => setCues((items) => items.map((item) => item.id === cue.id ? { ...item, end: Number(event.target.value) } : item))} /><input aria-label={`ข้อความ cue ${index + 1}`} style={fieldStyle} value={cue.text} onChange={(event) => setCues((items) => items.map((item) => item.id === cue.id ? { ...item, text: event.target.value } : item))} placeholder="ข้อความ subtitle" /><button type="button" style={secondaryActionStyle} aria-label={`ลบ cue ${index + 1}`} onClick={() => setCues((items) => items.filter((item) => item.id !== cue.id))}>ลบ</button></div>)}
    <button type="button" style={secondaryActionStyle} onClick={() => setCues((items) => [...items, { id: `cue-${Date.now()}`, start: items.at(-1)?.end || 0, end: (items.at(-1)?.end || 0) + 2, text: '' }])}>+ เพิ่ม cue</button>
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}><input type="checkbox" checked={burnIn} onChange={(event) => setBurnIn(event.target.checked)} /> Burn-in ในวิดีโอ (ไม่เลือก = sidecar)</label>
    <button type="button" style={{ ...actionStyle, marginTop: 9 }} onClick={() => { if (!onQueueOperation) { setStatus('Worker handoff ยังไม่พร้อม'); return; } void onQueueOperation('media.align', { format, burnIn, cueCount: cues.length }, assetIds.filter((asset) => asset.type !== 'image').slice(0, 1).map((asset) => asset.id)).then(() => setStatus('ส่ง subtitle alignment แล้ว')).catch((error) => setStatus(error instanceof Error ? error.message : 'ส่ง subtitle ไม่สำเร็จ')); }}>ส่ง subtitle alignment เข้า Worker</button>
    <p role="status" aria-live="polite" style={{ color: hasInvalid ? '#ff9b9b' : '#9bd7ff', marginTop: 9 }}>{status}</p>
  </section>;
}
