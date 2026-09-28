# Research notes

- `MediaHistory.tsx` ใช้ `media.listTasks.useQuery` โดยไม่มี query options จึงไม่มี stale cache ที่เหมาะสม และมีการ refetch ตามค่า default เมื่อ mount/focus
- แท็บ `VerticalDramaSeriesPage` ใช้ `staleTime` 5 นาที, `gcTime` 15 นาที และ `placeholderData` เพื่อคงข้อมูลเดิมขณะโหลดหน้าใหม่
- `media.listTasks` เรียก provider, deferred และ hyperframes ต่อกัน แล้วจึงเรียก MCP และ Hermes ต่อกันอีกชุด ทั้งที่แต่ละ source เป็นงานอ่านแยกกันได้
- `durabilizeMediaTaskHistory` มีการจำกัด concurrency และ timeout อยู่แล้ว จึงควรคงลำดับ/contract เดิมและไม่สร้าง parallelism ซ้อนแบบไม่จำกัด
- managed storage proxy มี ETag และ `Vary: Cookie, Authorization` แล้ว แต่ `PROTECTED_MEDIA_CACHE_CONTROL` ตั้งไว้เพียง `private, max-age=60, must-revalidate`
- gallery/list preview ของ Media History ใช้ `<img>` โดยไม่กำหนด lazy loading และ fallback video ใช้ `preload="metadata"` ทำให้เปิด network request หลายรายการพร้อมกัน
- `MediaHistory` ต้องยังรองรับผลลัพธ์ provider ใหม่ผ่านการ revalidate; cache ที่ยาวจะใช้กับ body ของ URL เดิมเท่านั้น ไม่ใช่ cache รายการแบบถาวร

## Security boundary

การยืดอายุ cache ใช้ `private` เท่านั้น เพื่อไม่ให้ shared proxy/CDN cache ไฟล์ tenant-owned ได้ การ revalidate ใช้ ETag เดิม และ URL ใหม่จาก durable storage จะเป็น cache miss ตามธรรมชาติ
