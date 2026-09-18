import type { ReviewScope } from './reviewTypes';

const OPTIONS: Array<{ value: ReviewScope; label: string; description: string }> = [
  { value: 'current_clip', label: 'คลิปปัจจุบัน', description: 'จำกัดคำขอไว้ที่คลิปที่เลือก' },
  { value: 'selected_range', label: 'ช่วงที่เลือก', description: 'ใช้เฉพาะช่วงเวลาใน timeline' },
  { value: 'scene', label: 'ฉากปัจจุบัน', description: 'รวมคลิปที่อยู่ในฉากเดียวกัน' },
  { value: 'timeline', label: 'ทั้ง timeline', description: 'ตรวจทั้งโปรเจกต์อย่างมีขอบเขต' },
  { value: 'unedited_ranges', label: 'ช่วงที่ยังไม่แก้', description: 'ไม่แตะงานที่ผู้ใช้ล็อกไว้' },
];

export function ScopePicker({ value, onChange, disabled = false }: { value: ReviewScope; onChange: (value: ReviewScope) => void; disabled?: boolean }) {
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="text-sm font-semibold">ขอบเขตการวิเคราะห์</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <label key={option.value} className={`flex min-h-11 cursor-pointer gap-3 rounded-md border p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${value === option.value ? 'border-primary bg-primary/10' : 'border-border/70 hover:bg-accent'}`}>
            <input type="radio" name="review-scope" value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="mt-1" />
            <span><span className="block font-medium">{option.label}</span><span className="block text-xs text-muted-foreground">{option.description}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
