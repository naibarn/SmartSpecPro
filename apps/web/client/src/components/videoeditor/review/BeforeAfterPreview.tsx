import { useState } from 'react';

export function BeforeAfterPreview({ beforeUrl, afterUrl }: { beforeUrl?: string | null; afterUrl?: string | null }) {
  const [side, setSide] = useState<'before' | 'after'>('before');
  const activeUrl = side === 'before' ? beforeUrl : afterUrl;
  return (
    <section className="grid gap-2" aria-label="Before and after preview">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Preview version">
        <button type="button" role="tab" aria-selected={side === 'before'} className="min-h-10 rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSide('before')}>ก่อนแก้ไข</button>
        <button type="button" role="tab" aria-selected={side === 'after'} className="min-h-10 rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSide('after')}>ข้อเสนอแนะ</button>
      </div>
      {activeUrl ? <video controls src={activeUrl} className="aspect-video w-full rounded-md bg-black" aria-label={side === 'before' ? 'Before preview' : 'After preview'} /> : <div className="flex aspect-video items-center justify-center rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">ยังไม่มี preview ที่ปลอดภัยสำหรับ revision นี้</div>}
      <p className="text-xs text-muted-foreground" aria-live="polite">กำลังดู: {side === 'before' ? 'ก่อนแก้ไข' : 'ข้อเสนอแนะ'}</p>
    </section>
  );
}
