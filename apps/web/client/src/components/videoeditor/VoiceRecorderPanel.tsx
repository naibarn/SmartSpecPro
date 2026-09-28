import React, { useEffect, useRef, useState } from 'react';
import { actionStyle, fieldStyle, panelStyle, secondaryActionStyle, type EditorPanelBaseProps } from './EditorPanelShared';

interface VoiceRecorderPanelProps extends EditorPanelBaseProps {
  onRecordingReady?: (file: File) => Promise<void> | void;
}

export default function VoiceRecorderPanel({ onRecordingReady }: VoiceRecorderPanelProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [state, setState] = useState<'idle' | 'recording' | 'paused' | 'ready' | 'error'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [recordingMeta, setRecordingMeta] = useState<{ mime: string; channels?: number; sampleRate?: number } | null>(null);
  const [monitorUrl, setMonitorUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('อนุญาตไมโครโฟนเพื่อเริ่มอัดเสียง');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const monitorUrlRef = useRef<string | null>(null);

  const stopMeter = () => {
    if (meterFrameRef.current) window.cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = null;
    meterSourceRef.current?.disconnect();
    meterSourceRef.current = null;
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    void context?.close().catch(() => undefined);
    setInputLevel(0);
  };

  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const list = await navigator.mediaDevices.enumerateDevices();
    const inputs = list.filter((item) => item.kind === 'audioinput');
    setDevices(inputs);
    if (!deviceId && inputs[0]) setDeviceId(inputs[0].deviceId);
  };

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    stopMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (monitorUrlRef.current) URL.revokeObjectURL(monitorUrlRef.current);
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
      streamRef.current = stream;
      await refreshDevices();
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((candidate) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate));
      if (!mime) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        throw new Error('เบราว์เซอร์ไม่รองรับรูปแบบเสียงที่บันทึกได้');
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const settings = stream.getAudioTracks()[0]?.getSettings?.() ?? {};
      setRecordingMeta({ mime, channels: settings.channelCount, sampleRate: settings.sampleRate });
      if (monitorUrlRef.current) URL.revokeObjectURL(monitorUrlRef.current);
      monitorUrlRef.current = null;
      setMonitorUrl(null);
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        try {
          const context = new AudioContextCtor();
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          const source = context.createMediaStreamSource(stream);
          source.connect(analyser);
          const samples = new Uint8Array(analyser.fftSize);
          audioContextRef.current = context;
          analyserRef.current = analyser;
          meterSourceRef.current = source;
          const updateMeter = () => {
            analyser.getByteTimeDomainData(samples);
            let sum = 0;
            for (const sample of samples) { const normalized = (sample - 128) / 128; sum += normalized * normalized; }
            setInputLevel(Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 220)));
            meterFrameRef.current = window.requestAnimationFrame(updateMeter);
          };
          updateMeter();
        } catch {
          stopMeter();
        }
      }
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size > 0) {
          const nextMonitorUrl = URL.createObjectURL(blob);
          monitorUrlRef.current = nextMonitorUrl;
          setMonitorUrl(nextMonitorUrl);
        }
        setState('ready');
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setSeconds(0);
      setState('recording');
      setStatus('กำลังอัดเสียง');
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setState('error');
      setStatus(error instanceof Error ? error.message : 'ไม่สามารถใช้ไมโครโฟนได้');
    }
  };

  const stop = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    recorder.stop();
    stopMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setStatus('บันทึกเสร็จ กำลังเตรียมไฟล์');
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  };

  const saveTake = async () => {
    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
    if (!blob.size) return;
    const file = new File([blob], `voiceover-${Date.now()}.webm`, { type: blob.type });
    try {
      await onRecordingReady?.(file);
      setStatus('เพิ่ม take เข้า Bin/A1 แล้ว');
      setState('idle');
      chunksRef.current = [];
      if (monitorUrlRef.current) URL.revokeObjectURL(monitorUrlRef.current);
      monitorUrlRef.current = null;
      setMonitorUrl(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'อัปโหลด take ไม่สำเร็จ');
      setState('ready');
    }
  };

  return <section style={panelStyle} aria-label="Voice recorder">
    <h3 style={{ margin: '0 0 6px', color: '#fff', fontSize: 15 }}>🎙️ อัดเสียง</h3>
    <p style={{ margin: '0 0 10px', color: '#999' }}>รองรับไมค์ที่เบราว์เซอร์/ระบบปฏิบัติการเปิดให้ใช้ และไม่เก็บ device ID ถาวร</p>
    <button type="button" style={secondaryActionStyle} onClick={() => void refreshDevices()}>รีเฟรชรายการไมค์</button>
    <select style={{ ...fieldStyle, marginTop: 8 }} value={deviceId} onChange={(event) => setDeviceId(event.target.value)} aria-label="เลือกไมค์"><option value="">ใช้ไมค์เริ่มต้น</option>{devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || `ไมค์ ${device.deviceId.slice(0, 6)}`}</option>)}</select>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}><strong>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</strong>{state === 'idle' || state === 'error' ? <button type="button" style={actionStyle} onClick={() => void start()}>เริ่มอัด</button> : <button type="button" style={actionStyle} onClick={() => void stop()}>หยุด</button>}{state === 'recording' && <button type="button" style={secondaryActionStyle} onClick={() => { recorderRef.current?.pause(); setState('paused'); }}>พัก</button>}{state === 'paused' && <button type="button" style={secondaryActionStyle} onClick={() => { recorderRef.current?.resume(); setState('recording'); }}>ต่อ</button>}</div>
    <div style={{ marginTop: 10 }} aria-label="ระดับเสียงไมโครโฟน"><div style={{ height: 7, borderRadius: 4, background: '#333', overflow: 'hidden' }}><div style={{ height: '100%', width: `${inputLevel}%`, background: inputLevel > 85 ? '#ef4444' : '#22c55e', transition: 'width 80ms linear' }} /></div><small style={{ color: '#888' }}>ระดับเสียง {inputLevel}%{recordingMeta ? ` · ${recordingMeta.mime}${recordingMeta.channels ? ` · ${recordingMeta.channels} ch` : ''}${recordingMeta.sampleRate ? ` · ${recordingMeta.sampleRate} Hz` : ''}` : ''}</small></div>
    {state === 'ready' && <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{monitorUrl && <audio controls src={monitorUrl} style={{ width: '100%' }} aria-label="ฟังตัวอย่าง take" />}<div style={{ display: 'flex', gap: 8 }}><button type="button" style={actionStyle} onClick={() => void saveTake()}>เก็บ take เข้า Bin</button><button type="button" style={secondaryActionStyle} onClick={() => { chunksRef.current = []; if (monitorUrlRef.current) URL.revokeObjectURL(monitorUrlRef.current); monitorUrlRef.current = null; setMonitorUrl(null); setState('idle'); setStatus('ทิ้ง take แล้ว'); }}>ทิ้ง take</button></div></div>}
    <p role="status" aria-live="polite" style={{ color: '#9bd7ff', marginTop: 10 }}>{status}</p>
  </section>;
}
