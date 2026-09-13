import React, { useCallback, useRef, useState } from 'react';
import type { Asset, MediaLibraryAsset } from '../../types/videoEditor';
import { WebAssetResolver } from '../../services/webAssetResolver';
import { showToast } from './Toast';

interface ProjectBinPanelProps {
  assets: Readonly<Record<string, Asset>>;
  onAddToTimeline: (asset: MediaLibraryAsset, localPath: string) => void;
  onAssetImported?: (asset: MediaLibraryAsset, localPath: string) => void;
  projectId?: number | null;
}

function toLibraryAsset(asset: Asset): MediaLibraryAsset {
  return {
    id: asset.taskId || asset.id,
    type: asset.type,
    title: asset.name || asset.filename,
    thumbnailUrl: asset.thumbnailPath || (asset.type === 'image' ? asset.path : ''),
    duration: asset.duration || 0,
    url: asset.path || asset.originalPath || '',
    model: asset.model || 'project',
    createdAt: new Date(),
    format: asset.format || 'mp4',
    localPath: asset.path,
    ...(asset.mediaAssetId ? { mediaAssetId: asset.mediaAssetId } : {}),
  };
}

export default function ProjectBinPanel({ assets, onAddToTimeline, onAssetImported, projectId }: ProjectBinPanelProps) {
  const list = Object.values(assets);
  const inputRef = useRef<HTMLInputElement>(null);
  const resolverRef = useRef(new WebAssetResolver());
  const abortRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; file?: string; percent: number }>({ done: 0, total: 0, percent: 0 });

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    cancelledRef.current = false;
    setProgress({ done: 0, total: files.length, percent: 0 });
    let succeeded = 0;
    const errors: string[] = [];
    for (const file of files) {
      if (cancelledRef.current) break;
      try {
        setProgress((current) => ({ ...current, file: file.name, percent: 0 }));
        const result = resolverRef.current.uploadAsset(file, (percent) => {
          setProgress((current) => ({ ...current, file: file.name, percent }));
        }, { projectId: projectId ?? undefined, idempotencyKey: `bin:${file.name}:${file.size}:${file.lastModified}` });
        abortRef.current = result.abort;
        const uploaded = await result.promise;
        if (cancelledRef.current) break;
        const type: MediaLibraryAsset['type'] = file.type.startsWith('audio/')
          ? 'audio'
          : file.type.startsWith('image/') ? 'image' : 'video';
        const asset: MediaLibraryAsset = {
          id: uploaded.assetId,
          type,
          title: file.name,
          thumbnailUrl: type === 'image' ? uploaded.uri : '',
          duration: 0,
          url: uploaded.uri,
          localPath: uploaded.uri,
          model: 'uploaded',
          createdAt: new Date(),
          format: file.name.split('.').pop()?.toLowerCase() || 'mp4',
          fileSize: file.size,
          ...(uploaded.mediaAssetId ? { mediaAssetId: Number(uploaded.mediaAssetId) } : {}),
        };
        onAssetImported?.(asset, uploaded.uri);
        succeeded += 1;
      } catch (error) {
        if (!cancelledRef.current) {
          errors.push(`${file.name}: ${error instanceof Error ? error.message : 'อัปโหลดไม่สำเร็จ'}`);
        }
      } finally {
        abortRef.current = null;
        setProgress((current) => ({ ...current, done: current.done + 1, percent: 100 }));
      }
    }
    setUploading(false);
    setProgress({ done: 0, total: 0, percent: 0 });
    abortRef.current = null;
    if (inputRef.current) inputRef.current.value = '';
    if (cancelledRef.current) showToast(`ยกเลิกการอัปโหลดแล้ว${succeeded > 0 ? ` · สำเร็จ ${succeeded} ไฟล์` : ''}`, 'info', 3500);
    else if (errors.length === 0) showToast(`อัปโหลด ${succeeded} ไฟล์เข้า Bin แล้ว`, 'success', 3000);
    else if (succeeded > 0) showToast(`อัปโหลดสำเร็จ ${succeeded} ไฟล์ เหลือล้มเหลว ${errors.length} ไฟล์`, 'warning', 5000);
    else showToast(errors[0] || 'อัปโหลดไม่สำเร็จ', 'error', 6000);
  }, [onAssetImported, projectId, uploading]);

  const cancelUpload = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.();
    setProgress((current) => ({ ...current, file: current.file ? `${current.file} · ยกเลิก...` : current.file }));
  }, []);

  const onPickerChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    void uploadFiles(Array.from(event.target.files ?? []));
  }, [uploadFiles]);

  const onDrop = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    void uploadFiles(Array.from(event.dataTransfer.files ?? []));
  }, [uploadFiles]);
  const handleDragStart = useCallback((asset: Asset) => (event: React.DragEvent) => {
    const media = toLibraryAsset(asset);
    event.dataTransfer.setData('application/video-editor-asset', JSON.stringify(media));
    event.dataTransfer.effectAllowed = 'copy';
  }, []);

  return (
    <section style={{ padding: 14, color: '#ddd', fontSize: 12 }} aria-label="Project Bin" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <h3 style={{ margin: '0 0 5px', fontSize: 15, color: '#fff' }}>🗃️ Bin / สื่อในโปรเจกต์</h3>
      <p style={{ margin: '0 0 14px', color: '#999' }}>ลากวิดีโอ ภาพ หรือเสียงลง track ได้โดยตรง</p>
      <input ref={inputRef} type="file" accept="video/*,audio/*,image/*" multiple onChange={onPickerChange} style={{ display: 'none' }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} style={{ flex: 1, border: '1px solid #0078d4', background: '#123450', color: '#dff4ff', borderRadius: 5, padding: '8px 10px', cursor: uploading ? 'wait' : 'pointer', fontSize: 11 }}>
          {uploading ? `กำลังอัปโหลด ${progress.done}/${progress.total}` : '📤 นำเข้าสื่อจากเครื่อง'}
        </button>
        {uploading && <button type="button" onClick={cancelUpload} style={{ border: '1px solid #a44', background: '#421d1d', color: '#ffdada', borderRadius: 5, padding: '8px 10px', cursor: 'pointer', fontSize: 11 }}>ยกเลิก</button>}
      </div>
      <div style={{ padding: '8px 10px', marginBottom: 12, border: '1px dashed #3c596e', borderRadius: 6, color: '#8ab4cf', textAlign: 'center' }}>
        รองรับอัปโหลด 1 ไฟล์หรือหลายไฟล์ และลากไฟล์มาวางที่นี่
      </div>
      {uploading && progress.file && (
        <div style={{ marginBottom: 12, color: '#9bd7ff' }} role="status" aria-live="polite">
          {progress.file} · {progress.percent}%
          <progress value={progress.percent} max={100} style={{ display: 'block', width: '100%', marginTop: 5 }} />
        </div>
      )}
      {list.length === 0 ? (
        <div style={{ padding: 18, textAlign: 'center', border: '1px dashed #555', borderRadius: 6, color: '#999' }}>ยังไม่มีสื่อในโปรเจกต์</div>
      ) : (
        <div style={{ display: 'grid', gap: 8, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
          {list.map((asset) => {
            const media = toLibraryAsset(asset);
            return (
              <article key={asset.id} draggable onDragStart={handleDragStart(asset)} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 9, border: '1px solid #3a3a3a', borderRadius: 6, background: '#202020' }}>
                <span style={{ fontSize: 20 }}>{asset.type === 'video' ? '🎬' : asset.type === 'image' ? '🖼️' : '🎵'}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#eee' }}>{media.title}</div>
                  <div style={{ color: '#888', fontSize: 10 }}>{asset.type} · {asset.duration > 0 ? `${asset.duration.toFixed(1)}s` : 'duration unknown'}</div>
                </div>
                <button type="button" onClick={() => onAddToTimeline(media, asset.path)} style={{ border: '1px solid #0078d4', background: '#123450', color: '#dff4ff', borderRadius: 4, padding: '5px 8px', cursor: 'pointer', fontSize: 11 }}>เพิ่ม</button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
