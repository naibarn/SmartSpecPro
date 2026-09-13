import React, { useState } from 'react';
import { panelStyle, fieldStyle, actionStyle, type EditorPanelBaseProps } from './EditorPanelShared';

export default function AiMusicPanel({ onQueueOperation }: EditorPanelBaseProps) {
  const [prompt, setPrompt] = useState('เพลงประกอบบรรยากาศสำหรับวิดีโอนี้');
  const [duration, setDuration] = useState('30');
  const [bpm, setBpm] = useState('100');
  const [key, setKey] = useState('auto');
  const [mood, setMood] = useState('cinematic');
  const [instrumentation, setInstrumentation] = useState('piano, strings');
  const [loop, setLoop] = useState(true);
  const [fadeOut, setFadeOut] = useState(true);
  const [language, setLanguage] = useState('th');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState('พร้อมประเมินก่อนสร้าง');

  const submit = async () => {
    if (!prompt.trim() || !consent) {
      setStatus('กรุณากรอกคำอธิบายและยอมรับสิทธิ์การใช้งาน');
      return;
    }
    const durationSeconds = Number(duration);
    const tempo = Number(bpm);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 600 || !Number.isFinite(tempo) || tempo < 40 || tempo > 240) {
      setStatus('ความยาวต้องอยู่ระหว่าง 1–600 วินาที และ BPM อยู่ระหว่าง 40–240');
      return;
    }
    if (!onQueueOperation) { setStatus('Worker handoff ยังไม่พร้อม'); return; }
    setStatus('กำลังส่งงานดนตรี AI เข้า Worker...');
    try {
      await onQueueOperation('media.ai_music', {
        prompt: prompt.trim(), durationSeconds, bpm: tempo, key, mood,
        instrumentation: instrumentation.split(',').map((item) => item.trim()).filter(Boolean),
        loop, fadeOut, language, consent: true,
      });
      setStatus('ส่งงานแล้ว เปิดคิวงาน Worker เพื่อติดตามผล');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'ส่งงานไม่สำเร็จ');
    }
  };

  return <section style={panelStyle} aria-label="AI Music">
    <h3 style={{ margin: '0 0 6px', color: '#fff', fontSize: 15 }}>🎵 ดนตรี AI</h3>
    <p style={{ margin: '0 0 12px', color: '#999', lineHeight: 1.5 }}>สร้างเพลงเป็น managed asset แล้ววางลง A-track หลังตรวจสอบผลลัพธ์</p>
    <label style={{ display: 'grid', gap: 5, marginBottom: 9 }}>คำอธิบาย<input style={fieldStyle} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <label style={{ display: 'grid', gap: 5 }}>ความยาว (วินาที)<input style={fieldStyle} type="number" min={1} max={600} value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
      <label style={{ display: 'grid', gap: 5 }}>BPM<input style={fieldStyle} type="number" min={40} max={240} value={bpm} onChange={(event) => setBpm(event.target.value)} /></label>
      <label style={{ display: 'grid', gap: 5 }}>คีย์<select style={fieldStyle} value={key} onChange={(event) => setKey(event.target.value)}><option value="auto">Auto</option>{['C','D','E','F','G','A','B'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label style={{ display: 'grid', gap: 5 }}>อารมณ์<select style={fieldStyle} value={mood} onChange={(event) => setMood(event.target.value)}><option value="cinematic">Cinematic</option><option value="upbeat">Upbeat</option><option value="calm">Calm</option><option value="podcast">Podcast</option></select></label>
    </div>
    <label style={{ display: 'grid', gap: 5, marginTop: 9 }}>เครื่องดนตรี (คั่นด้วย comma)<input style={fieldStyle} value={instrumentation} onChange={(event) => setInstrumentation(event.target.value)} /></label>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 9 }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> วนเพลง</label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={fadeOut} onChange={(event) => setFadeOut(event.target.checked)} /> Fade out</label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>ภาษา<select style={{ ...fieldStyle, width: 100 }} value={language} onChange={(event) => setLanguage(event.target.value)}><option value="th">ไทย</option><option value="en">English</option><option value="instrumental">Instrumental</option></select></label>
    </div>
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '11px 0' }}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> ยืนยันสิทธิ์การใช้งานเพลงและเครดิต</label>
    <button type="button" style={actionStyle} onClick={() => void submit()}>ประเมินและส่งงานเข้า Worker</button>
    <p role="status" aria-live="polite" style={{ color: '#9bd7ff', marginTop: 10 }}>{status}</p>
  </section>;
}
