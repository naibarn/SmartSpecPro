# Synthesized specification — Feature 169

ทำให้ Worker App เป็น execution boundary ของ Special Tie-in footage ตั้งแต่ managed/local source resolution, ffprobe, audio/VAD/dead-air, scene/keyframe diagnostics, HyperFrames transcription, bounded `vd-footage-guide-v1`, approved trim/concat/crop/proxy, source time map, AI B-roll composition, QC และ protected artifact publication

Worker ต้องไม่แก้ source, รับ arbitrary command/path, ส่ง local path/PII ไป Server, upload full video ให้ LLM, อ้าง speaker identity จาก transcript หรือแตะ credit ledger เอง ต้องรองรับ heartbeat/cancel/retry/staged artifact reconciliation และ event replay อย่าง idempotent

Job catalog มี `footage_probe_analyze`, `footage_prepare`, `footage_broll_render`; render route ใน feature นี้ตายตัวเป็น existing `remotion_render_video` + `GenericTemplate` video layers ไม่ใช้ `video_assembly` หรือ `hyperframes_final_composite` และไม่ fallback ไป Server

Runtime ต้อง resolve bundled Node/HyperFrames จาก `runtime-pack/manifest.json`, ตรวจ checksum/version/model/ffmpeg/ffprobe/พื้นที่/ทรัพยากรด้วย doctor และห้าม production `npx`, PATH dependency, network install หรือ model download ระหว่าง request; wire time เป็น integer milliseconds และ transcript มี complete/partial/unavailable status
