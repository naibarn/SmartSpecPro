import React, { useMemo, useState } from 'react';
import { actionStyle, fieldStyle, panelStyle, type EditorPanelBaseProps, type QueueEditorOperation } from './EditorPanelShared';

type SymbolItem = { id: string; name: string; category: 'line' | 'arrow' | 'callout'; svg: string };

const SYMBOLS: SymbolItem[] = [
  { id: 'line', name: 'เส้นตรง', category: 'line', svg: '<svg viewBox="0 0 100 20" xmlns="http://www.w3.org/2000/svg"><path d="M5 10h90" stroke="currentColor" stroke-width="4"/></svg>' },
  { id: 'arrow-right', name: 'ลูกศรขวา', category: 'arrow', svg: '<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg"><path d="M5 20h72m0 0-15-12m15 12-15 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'circle', name: 'วงกลมเน้นจุด', category: 'callout', svg: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><circle cx="40" cy="40" r="30" fill="none" stroke="currentColor" stroke-width="5"/></svg>' },
  { id: 'check', name: 'เครื่องหมายถูก', category: 'callout', svg: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><path d="m12 42 17 18 39-40" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'speech', name: 'ป้ายคำพูด', category: 'callout', svg: '<svg viewBox="0 0 120 70" xmlns="http://www.w3.org/2000/svg"><path d="M8 8h104v42H48L27 63V50H8z" fill="none" stroke="currentColor" stroke-width="4"/></svg>' },
  { id: 'arrow-left', name: 'ลูกศรซ้าย', category: 'arrow', svg: '<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg"><path d="M95 20H23m0 0 15-12m-15 12 15 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  { id: 'double-arrow', name: 'ลูกศรสองทาง', category: 'arrow', svg: '<svg viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg"><path d="M8 20h104M8 20l14-12M8 20l14 12m90-12-14-12m14 12-14 12" fill="none" stroke="currentColor" stroke-width="4"/></svg>' },
  { id: 'underline', name: 'เส้นขีดเน้น', category: 'line', svg: '<svg viewBox="0 0 120 24" xmlns="http://www.w3.org/2000/svg"><path d="M8 12c20-8 38 8 56 0s32 4 48-1" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>' },
  { id: 'square', name: 'กรอบสี่เหลี่ยม', category: 'callout', svg: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="60" height="60" rx="4" fill="none" stroke="currentColor" stroke-width="5"/></svg>' },
  { id: 'cross', name: 'กากบาท', category: 'callout', svg: '<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><path d="m15 15 50 50m0-50L15 65" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>' },
];

function isSafeStockSvg(svg: string): boolean {
  return !/<script|on[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["'](?:https?:|data:)/i.test(svg);
}

export default function SymbolCatalogPanel({ onInsertSymbol, onQueueOperation }: EditorPanelBaseProps & { onInsertSymbol?: (symbol: SymbolItem) => void; onQueueOperation?: QueueEditorOperation }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | SymbolItem['category']>('all');
  const [status, setStatus] = useState('เลือก stock SVG แล้วกดเพิ่มลง overlay');
  const items = useMemo(() => SYMBOLS.filter((item) => isSafeStockSvg(item.svg) && (category === 'all' || item.category === category) && item.name.includes(query.trim())), [category, query]);

  return <section style={panelStyle} aria-label="SVG symbol catalog">
    <h3 style={{ margin: '0 0 6px', color: '#fff', fontSize: 15 }}>✦ Symbols / Stock SVG</h3>
    <p style={{ margin: '0 0 10px', color: '#999', lineHeight: 1.5 }}>สัญลักษณ์เป็น SVG แบบเส้น ปลอดภัยจาก script และ external reference</p>
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}><input style={{ ...fieldStyle, flex: 1 }} aria-label="ค้นหา symbol" placeholder="ค้นหา" value={query} onChange={(event) => setQuery(event.target.value)} /><select style={{ ...fieldStyle, width: 105 }} value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="all">ทั้งหมด</option><option value="line">เส้น</option><option value="arrow">ลูกศร</option><option value="callout">Callout</option></select></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>{items.map((item) => <button key={item.id} type="button" style={{ ...actionStyle, display: 'grid', gap: 5, minHeight: 66 }} onClick={() => { onInsertSymbol?.(item); if (onQueueOperation) void onQueueOperation('media.ai_media_studio', { mode: 'stock_svg', symbolId: item.id, svg: item.svg, sourceExecution: 'static_sanitized' }); setStatus(`เลือก ${item.name} แล้ว`); }}><span dangerouslySetInnerHTML={{ __html: item.svg }} aria-hidden="true" /><span>{item.name}</span></button>)}</div>
    {items.length === 0 && <p style={{ color: '#999' }}>ไม่พบ symbol</p>}
    <p role="status" aria-live="polite" style={{ color: '#9bd7ff', marginTop: 10 }}>{status}</p>
  </section>;
}

export type { SymbolItem };
