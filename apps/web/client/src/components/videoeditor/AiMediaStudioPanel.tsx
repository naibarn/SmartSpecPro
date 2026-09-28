import React, { useState } from 'react';
import { panelStyle, fieldStyle, actionStyle, type EditorPanelBaseProps } from './EditorPanelShared';

export default function AiMediaStudioPanel({ onQueueOperation, assetIds = [] }: EditorPanelBaseProps) {
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'audio'>('image');
  const [prompt, setPrompt] = useState('ภาพโปร่งใสสำหรับ overlay');
  const [references, setReferences] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState('เลือกชนิดสื่อเพื่อดูข้อจำกัด');
  const referenceIds = references.split(',').map((value) => value.trim()).filter(Boolean);

  const submit = async () => {
    if (!prompt.trim() || !consent) {
      setStatus('กรุณากรอก prompt และยืนยันเครดิต/สิทธิ์');
      return;
    }
    if (mediaType === 'video' && referenceIds.length > 3) {
      setStatus('วิดีโออ้างอิงได้ไม่เกิน 3 รายการ');
      return;
    }
    const unknownReference = referenceIds.find((id) => !assetIds.some((asset) => asset.id === id));
    if (unknownReference) {
      setStatus(`ไม่พบสื่ออ้างอิง ${unknownReference} ใน Bin`);
      return;
    }
    if (!onQueueOperation) { setStatus('Worker handoff ยังไม่พร้อม'); return; }
    setStatus('กำลังส่ง AI Media Studio เข้า Worker...');
    try {
      const selectedReferences = referenceIds.slice(0, 3);
      await onQueueOperation('media.ai_media_studio', { mediaType, prompt: prompt.trim(), referenceAssetIds: selectedReferences, consent: true }, selectedReferences);
      setStatus('ส่งงานแล้ว ผลลัพธ์จะกลับเข้า Library/Media History');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'ส่งงานไม่สำเร็จ');
    }
  };

  return <section style={panelStyle} aria-label="AI Media Studio">
    <h3 style={{ margin: '0 0 6px', color: '#fff', fontSize: 15 }}>✨ AI Media Studio</h3>
    <p style={{ margin: '0 0 12px', color: '#999', lineHeight: 1.5 }}>สร้างภาพโปร่งใส วิดีโอจากภาพอ้างอิง หรือ audio draft โดยเก็บ provenance ทุกครั้ง</p>
    <label style={{ display: 'grid', gap: 5, marginBottom: 9 }}>ชนิดสื่อ<select style={fieldStyle} value={mediaType} onChange={(event) => setMediaType(event.target.value as typeof mediaType)}><option value="image">Transparent image</option><option value="video">Reference video (1–3)</option><option value="audio">Audio draft</option></select></label>
    <label style={{ display: 'grid', gap: 5, marginBottom: 9 }}>Prompt<textarea style={{ ...fieldStyle, minHeight: 70, resize: 'vertical' }} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
    {mediaType === 'video' && <label style={{ display: 'grid', gap: 5, marginBottom: 9 }}>Reference asset IDs (คั่นด้วย comma)<input style={fieldStyle} value={references} onChange={(event) => setReferences(event.target.value)} placeholder={assetIds.slice(0, 3).map((asset) => asset.id).join(',')} /></label>}
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '11px 0' }}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> ยืนยันเครดิตและสิทธิ์ของสื่ออ้างอิง</label>
    <button type="button" style={actionStyle} onClick={() => void submit()}>ประเมินและส่งงาน</button>
    <p role="status" aria-live="polite" style={{ color: '#9bd7ff', marginTop: 10 }}>{status}</p>
  </section>;
}
