# Worker App Content Protection Optional Windows Runtime Design

## Goal

ให้ Worker App ติดตั้งและใช้งาน `content_protection.protect` ได้โดยไม่เพิ่ม
ขนาดของ Worker App installer หลัก ผู้ใช้ที่ต้องการ Content Protection จะกด
ติดตั้ง runtime เพิ่มภายหลังจากเมนู Runtime & agents ได้ โดยไม่ต้องติดตั้ง
Python เอง ตั้งค่า environment เอง หรือรัน shell script เอง

## Decision

Content Protection จะไม่อยู่ใน Tauri resources และไม่ถูก bundle เข้า Windows
Worker App installer หลักอีกต่อไป แต่จะเผยแพร่เป็น Windows x64 runtime archive
แยกต่างหาก ผู้ใช้ติดตั้งเมื่อจำเป็นเท่านั้น ส่วน FFmpeg/FFprobe จะใช้จาก Worker
runtime pack ที่ติดตั้งอยู่แล้วบนเครื่อง

## Architecture

### 1. Main Worker App installer

- ไม่ประกาศ `content-protection-runtime` ใน `tauri.conf.json`
- ไม่เรียก `content-protection:pack` ระหว่าง `release:windows` หรือ `release:mac`
- ขนาด installer และเวลา install หลักไม่ขึ้นกับ VideoSeal, PyTorch หรือ model
- Worker App ที่ยังไม่ได้ติดตั้ง Content Protection ทำงานได้ตามปกติ แต่จะไม่
  advertise capability `content-protection-v1`

### 2. Optional runtime artifact

CI ของ Windows x64 สร้างไฟล์แยกชื่อรูปแบบ:

`smart-ai-hub-content-protection-runtime-windows-x64-{version}.zip`

ภายใน archive มีเฉพาะไฟล์ที่ Content Protection ต้องใช้:

- `provider/videoseal-provider.exe` ที่ build ด้วย PyInstaller
- `ckpts/videoseal_y_256b_img.pth`
- VideoSeal configs ที่ pin ตาม revision ที่กำหนด
- `content-protection-manifest.json`
- `THIRD_PARTY_NOTICES.txt`

FFmpeg/FFprobe ไม่ซ้ำอยู่ใน archive แต่ชี้ไปยังไฟล์จาก Worker runtime pack
ที่ติดตั้งในเครื่องเดียวกัน

Manifest ต้องระบุอย่างน้อย `contractVersion`, `runtimeId`, `version`,
`targetPlatform`, `provider`, `providerCommand`, `modelPath`,
`videoSealCommit`, `requiresWorkerRuntimeVersion` และรายการ checksum ของไฟล์
ภายใน archive พร้อมลายเซ็นของ release manifest

### 3. Release and download control plane

ใช้โครงสร้าง Worker Runtime release/catalog ที่มีอยู่เป็นพื้นฐาน แต่เพิ่ม
runtime ID เฉพาะ `content-protection-windows-x64` และ validation branch ของ
Content Protection แยกจาก HyperFrames/Hermes:

- Admin upload/publish ต้องยอมรับเฉพาะ Windows x64 Content Protection manifest
- Server ตรวจชื่อไฟล์, archive manifest, target platform, provider identity,
  model entry, checksum และ license notice ก่อน publish
- Public worker endpoint ส่ง latest manifest และ archive URL ตาม channel
- Download ใช้เส้นทางเดียวกับ authenticated Worker runtime download และต้อง
  ตรวจ checksum/signature ฝั่ง Worker ซ้ำเสมอ
- ถอน release แล้ว Worker ต้องไม่ติดตั้ง release นั้น แม้มีไฟล์ cache อยู่

ไม่สร้างระบบดาวน์โหลดใหม่ที่ bypass release policy หรือเก็บ model ใน git

### 4. Worker App installation

เพิ่ม native commands แยกจาก `worker_app_install_runtime_pack`:

- `worker_app_check_content_protection_runtime`
- `worker_app_install_content_protection_runtime`

การติดตั้งทำงานดังนี้:

1. Fetch latest Content Protection manifest ตาม server URL และ channel
2. ตรวจ `allowed`, platform, Worker runtime prerequisite และ version policy
3. ดาวน์โหลดเข้า `.download` ชั่วคราว พร้อมรองรับ retry ที่จำกัดจำนวนครั้ง
4. ตรวจ archive size, SHA-256, signature และป้องกัน zip path traversal
5. แตกไปยัง staging directory ใต้ AppData
6. ตรวจ provider executable, model size/checksum, manifest และ provider `--health`
7. สลับ staging directory เป็น active directory แบบ atomic operation
8. ล้างไฟล์ staging/cache ที่ไม่ใช้งานเมื่อสำเร็จ

ตำแหน่งติดตั้งแยกจาก Tauri resources และ runtime pack เช่น:

`<appData>/content-protection-runtime/current/`

หากติดตั้งเวอร์ชันใหม่ไม่สำเร็จ ต้องคง runtime เวอร์ชันเดิมไว้ใช้งานได้
ห้ามลบ active runtime ก่อน validation ผ่าน การซ่อมแซมใช้ flow เดียวกันแต่
บังคับดาวน์โหลด archive ใหม่

### 5. Runtime discovery and capability gate

ลำดับความสำคัญของ provider configuration คือ:

1. Explicit operator override ที่ผู้ดูแลตั้งไว้
2. Validated optional runtime ใน AppData
3. ไม่มี provider และไม่ประกาศ capability

เมื่อ optional runtime ผ่าน validation แล้ว Rust ตั้งค่า provider command,
model directory, FFmpeg และ FFprobe ให้ process อัตโนมัติ โดยใช้ FFmpeg/FFprobe
จาก Worker runtime pack หาก runtime pack ยังไม่มีหรือไม่พร้อม ให้แสดง dependency
เป็น blocked และไม่รับงาน Content Protection

การติดตั้ง/อัปเดต runtime ต้องไม่เปลี่ยน explicit operator override และต้อง
ไม่เปิด `content-protection-v1` จนกว่า provider, model, media tools และ health
check จะผ่านครบ

### 6. Worker App UI

ในเมนู Runtime & agents เพิ่ม card แยกชื่อ Content Protection native runtime
พร้อมสถานะ:

- Not installed — ปุ่ม `Install`
- Installing — progress/status และป้องกันการกดซ้ำ
- Ready — version, provider, model/checksum status และปุ่ม `Update`/`Repair`
- Blocked — ระบุ dependency ที่ขาด เช่น Worker runtime pack
- Failed — แสดง error ที่แก้ไขได้และปุ่ม `Retry`

การติดตั้ง Content Protection ต้องเป็น optional และไม่บังคับผู้ใช้ที่ไม่ได้ใช้
feature นี้

## Failure behavior

- ไม่มี runtime: Worker ยังเชื่อมต่อและรับงานประเภทอื่นได้ แต่ไม่ claim
  `content-protection-v1`
- Runtime download ล้มเหลว: คง active runtime เดิมและแสดง retry ได้
- checksum/signature/manifest ไม่ตรง: ปฏิเสธ archive และไม่ activate ไฟล์ใด
- provider เริ่มไม่ได้หรือ model โหลดไม่ได้: ไม่เปิด capability และเก็บ
  diagnostic ที่ไม่เปิดเผย path/secret เกินจำเป็น
- Worker runtime pack ขาด: แนะนำให้ติดตั้ง Worker runtime ก่อน โดยไม่ดาวน์โหลด
  FFmpeg ซ้ำใน Content Protection archive
- งาน protection ล้มเหลว: retry ตาม job contract และคง raw artifact ไว้

## Security and operational constraints

- Windows x64 เป็น target แรก; ไม่ทำให้ macOS/Linux installer รับ runtime นี้
- ใช้ VideoSeal revision ที่ pin ไว้และ dependency lock ที่ตรวจสอบได้
- checkpoint และ PyInstaller output เป็น generated release artifact ห้าม commit
  เข้า git
- ตรวจลายเซ็นและ checksum ทั้ง server publish gate และ Worker install gate
- จำกัด download retry และ serialize install/update ด้วย per-runtime lock
- ห้าม extract archive ไปยัง path ที่อยู่นอก staging directory
- ไม่เก็บ token, secret หรือ raw media ไว้ใน runtime archive
- ไม่มี migration เพิ่ม หากตาราง Worker Runtime เดิมรองรับ runtime ID ใหม่ได้;
  ถ้าข้อจำกัดของ schema บังคับจึงค่อยเพิ่ม migration ที่มี parity test

## Non-goals

- ไม่ทำ DRM/Widevine/FairPlay
- ไม่ bundle Content Protection ลง installer หลักเพื่อให้ทุกเครื่องมี runtime
- ไม่ให้ผู้ใช้ติดตั้ง Python หรือรัน setup script เอง
- ไม่ดาวน์โหลด model แบบ floating version จาก provider ภายนอกขณะ runtime ทำงาน

## Acceptance criteria

1. ขนาด Windows Worker App installer ไม่เพิ่มจากการเพิ่ม feature นี้ เพราะไม่มี
   Content Protection files อยู่ใน Tauri bundle
2. เครื่องใหม่สามารถกด Install จาก Worker App แล้วได้ runtime พร้อมใช้งานโดยไม่
   ติดตั้ง Python หรือรัน shell script
3. เมื่อยังไม่ติดตั้งหรือ validation ไม่ผ่าน จะไม่มี `content-protection-v1`
4. Update/repair ที่ล้มเหลวไม่ทำลาย active runtime เดิม
5. Provider executable, model, signature, checksum, FFmpeg/FFprobe และ health
   check ถูกตรวจสอบก่อน advertise capability
6. Windows-host installer และ optional runtime archive ถูกตรวจสอบแยกกันได้
