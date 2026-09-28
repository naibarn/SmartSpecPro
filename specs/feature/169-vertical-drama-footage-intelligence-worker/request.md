# Planning request

วางแผน Worker App สำหรับรับ footage จริงจาก Special Tie-in แล้วทำงานหนักทั้งหมดนอก Server: ffprobe, silence/dead-air, black/frozen, scene/keyframe, HyperFrames transcription, Footage Story Guide, trim/concat, crop/proxy, prepared artifact และ final render ที่วาง AI B-roll ตามเวลา

ต้องใช้งานได้จริงกับ Worker runtime ที่มี FFmpeg/FFprobe และ HyperFrames CLI, รองรับภาษาไทย, durable job/checkpoint/retry, tenant-safe managed artifact และ contract ที่เชื่อมกับ Feature 168 โดยไม่แก้ทับต้นฉบับ
