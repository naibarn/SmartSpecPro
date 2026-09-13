import React, { useMemo, useState } from 'react';
import { actionStyle, fieldStyle, panelStyle, secondaryActionStyle, type EditorPanelBaseProps } from './EditorPanelShared';

export default function SpeakerPlanPanel({ onQueueOperation, assetIds = [] }: EditorPanelBaseProps) {
  const [assetId, setAssetId] = useState(assetIds.find((asset) => asset.type === 'video' || asset.type === 'audio')?.id || '');
  const [language, setLanguage] = useState('th');
  const [diarization, setDiarization] = useState(true);
  const [speakerHint, setSpeakerHint] = useState('');
  const [silencePolicy, setSilencePolicy] = useState<'keep' | 'mark' | 'cut'>('mark');
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [stage, setStage] = useState<'idle' | 'queued' | 'review'>('idle');
  const selected = useMemo(() => assetIds.find((asset) => asset.id === assetId), [assetIds, assetId]);

  const analyze = async () => {
    if (!assetId || !onQueueOperation) { setStage('idle'); return; }
    setStage('queued');
    try {
      await onQueueOperation('media.speaker_scan', {
        language, diarization, speakerCountHint: speakerHint ? Number(speakerHint) : undefined,
        silencePolicy, includeSubtitles, requestedStages: ['ingest', 'ASR', 'diarization', 'plan', 'review'],
      }, [assetId]);
    } catch {
      setStage('idle');
    }
  };

  return <section style={panelStyle} aria-label="Speaker analysis and edit plan">
    <h3 style={{ margin: '0 0 6px', color: '#fff', fontSize: 15 }}>🗣️ วิเคราะห์ผู้พูดและวางแผนตัดต่อ</h3>
    <p style={{ margin: '0 0 11px', color: '#999', lineHeight: 1.5 }}>ASR และ diarization ทำใน Worker ผลลัพธ์ต้องตรวจสอบก่อนนำไปตัดต่อ</p>
    <label style={{ display: 'grid', gap: 5, marginBottom: 8 }}>สื่อ<select style={fieldStyle} value={assetId} onChange={(event) => setAssetId(event.target.value)}><option value="">เลือกวิดีโอหรือเสียง</option>{assetIds.filter((asset) => asset.type !== 'image').map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
    <label style={{ display: 'grid', gap: 5, marginBottom: 10 }}>ภาษา<select style={fieldStyle} value={language} onChange={(event) => setLanguage(event.target.value)}><option value="th">ไทย</option><option value="en">English</option><option value="auto">ตรวจอัตโนมัติ</option></select></label>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
      <label style={{ display: 'grid', gap: 5 }}>จำนวนผู้พูดโดยประมาณ<input style={fieldStyle} type="number" min={1} max={32} value={speakerHint} onChange={(event) => setSpeakerHint(event.target.value)} placeholder="ไม่ระบุ" /></label>
      <label style={{ display: 'grid', gap: 5 }}>นโยบายช่วงเงียบ<select style={fieldStyle} value={silencePolicy} onChange={(event) => setSilencePolicy(event.target.value as typeof silencePolicy)}><option value="keep">เก็บไว้</option><option value="mark">ทำเครื่องหมาย</option><option value="cut">เสนอให้ตัด</option></select></label>
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}><label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={diarization} onChange={(event) => setDiarization(event.target.checked)} /> แยกผู้พูด</label><label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={includeSubtitles} onChange={(event) => setIncludeSubtitles(event.target.checked)} /> สร้าง cue subtitle</label></div>
    <div style={{ display: 'flex', gap: 8 }}><button type="button" style={actionStyle} disabled={!assetId || stage === 'queued'} onClick={() => void analyze()}>วิเคราะห์ใน Worker</button><button type="button" style={secondaryActionStyle} disabled={stage !== 'review'} onClick={() => setStage('idle')}>ล้างผลวิเคราะห์</button></div>
    {stage === 'queued' && <p role="status" aria-live="polite" style={{ color: '#f6c56e' }}>ส่งงานแล้ว รอผล ingest → ASR → diarization → plan จาก Worker แล้วจึงเปิดให้ตรวจสอบ</p>}
    {stage === 'review' && <div style={{ marginTop: 12, padding: 10, border: '1px solid #315a72', borderRadius: 6 }}><strong>ผลวิเคราะห์พร้อมตรวจสอบ</strong><p style={{ margin: '6px 0', color: '#9bd7ff' }}>เปิดผลจาก Worker Jobs เพื่ออนุมัติ revision</p><button type="button" style={{ ...actionStyle, marginTop: 10 }} onClick={() => setStage('idle')}>ยืนยันแผนตัดต่อ (สร้าง revision ใหม่)</button></div>}
    {selected && <small style={{ display: 'block', marginTop: 8, color: '#777' }}>สื่อที่เลือก: {selected.name}</small>}
  </section>;
}
