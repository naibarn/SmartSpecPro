# Research notes

## Repository evidence

- `SpecialTieInEpisodeDialog.tsx` เป็น surface หลักที่ต้องเพิ่ม flow แบบสามขั้น
- `marketplaceReviewIdeas/contracts.ts` และ `specialTieInContracts.ts` เป็น contract เดิมของ idea/special episode
- `verticalDramaMarketplaceReviewSkillAdapter.ts` เป็นจุดเรียก Skill และต้องรับ Footage Story Guide
- `verticalDramaBrollService.ts` เป็น authority สำหรับ source role, exact bounds, stale revision และ timeline projection
- `workerRuntime.ts` เป็น boundary ของ job/capability ที่ Web และ Worker ใช้ร่วมกัน
- `creditContext*` และ skill billing เป็น authority ของการหักเครดิต ไม่ให้ Worker หักเอง
- Feature 160/162 มี media source, B-roll, managed artifact และ Worker-first patterns ที่ต้อง reuse
- มี server-side HyperFrames transcription path สำหรับ Storyboard Review แต่ไม่ควรใช้เป็น implicit fallback ของ Special Tie-in

## Known gaps to close in implementation

- Current idea history/current-state behavior must explicitly separate after refresh
- no-dialogue validation must reject generated dialogue and speech instructions
- selected character IDs must be server-authoritative and passed as an allowlist
- existing `video_assembly` support must not be assumed until Worker executor supports it
- model selector must use compatible catalog and recommended default

SocratiCode transport was unavailable in this session; findings were verified with targeted repository search and bundled HyperFrames CLI help.
