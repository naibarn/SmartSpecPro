# Marketplace Auto Review Facebook Reels — Phase A Implementation Report

วันที่: 25 พฤศจิกายน 2026

สถานะ source: รวมเข้า `origin/main` แล้วที่ `d74ff1525d9e5d5ca1b2ca59ed0660ca51488747`

DEV target: `legacy-debian-dev` — `https://smartaihub.app`

## ผล acceptance

| # | หัวข้อ | สถานะ | หลักฐาน |
|---|---|---|---|
| 1 | Auto Review Finalization | **PASS** | แก้ final-render reconciliation ให้เลือกงาน render เดิม, ingest managed Worker artifact ผ่าน storage route และจบ library-link gate โดยยังตรวจ finalization หลักครบ. Run `mar_c7faf90801db4aab076e00471dd72268` จบ `completed` / `library_finalize`, ได้ Library item `1701`; worker `f03bdd40-b8c6-4c3d-a9d6-edb053e387a6` เป็น `succeeded`. ไม่มี render job ใหม่ใน reconciliation นี้. Tests: `marketplaceAutoReviewService.test.ts` ที่ทดสอบ pending library-link exception. |
| 2 | Meta OAuth Reuse | **PARTIAL** | ใช้ Meta Channels/OAuth, Page discovery/selection และ encrypted connection เดิม; เพิ่ม configuration diagnostics และ permission/capability gating. DEV ยัง `META_CHANNELS_ENABLED=false`, ไม่มี App credentials หรือ Page connection จึงยังยืนยัน OAuth/token/grants กับ Meta จริงไม่ได้. |
| 3 | Facebook Reels Adapter | **PASS** | เพิ่ม Meta Reels upload/session, server-side binary transfer, processing/finalize/status reconciliation และ API version pin `v27.0`; คง Page feed path เดิมแยกไว้. Source: `python-backend/app/services/meta_graph_client.py`, `python-backend/app/services/social_publish.py`. Mock transport ใช้ทดสอบเท่านั้น ไม่แสดงผลเป็นโพสต์จริง. |
| 4 | Auto Review Publishing Package | **PASS** | สร้าง server-owned package จาก run, final artifact/checksum, caption/hashtags, tenant/user-scoped canonical affiliate link, Page และ disclosure snapshot; ไม่รับ arbitrary client media URL และไม่ generate caption ใหม่. Source: `apps/web/server/services/marketplaceAutoReviewReelsService.ts`. |
| 5 | Secure Media Upload | **PASS** | ตรวจ artifact identity/ownership และ media preflight; อ่าน private artifact ฝั่ง server แล้วส่ง binary ไป Meta โดยไม่เปิด public URL. Validation failure จำกัดอยู่ที่ publishing job. Source: `facebookReelsPublishGateway.ts`, `meta_graph_client.py`; ไม่มี live upload เนื่องจาก credentials/Page ไม่พร้อม. |
| 6 | Publishing Job Integration | **PASS** | ใช้ `worker_jobs`/outbox และ executor registry เดิม; deterministic intent, persistent snapshot, deduplication, progress/status และ reconcile ก่อน retry ambiguous publish. ใช้ `social_posts` เดิมพร้อม migration สำหรับ intent dedup; ไม่สร้าง queue หรือ credential store ใหม่. Source: `marketplaceAutoReviewReels.ts`, `jobExecutorRegistry.ts`, `0456_social_posts_marketplace_reels_intent_unique.sql`. |
| 7 | Publishing UI | **PARTIAL** | เพิ่ม Facebook Reels card ในหน้า Auto Review และ reuse Social Channels connection/Page UI; แสดง preview, disclosure/affiliate mode, readiness, progress/error/receipt และปิด publish เมื่อยังไม่พร้อม. Build/deploy ผ่าน แต่ไม่มี authenticated browser session ในรอบนี้ จึงไม่ได้ยืนยัน UI/API ด้วยบัญชีผู้ใช้บน runtime. |
| 8 | Affiliate Compatibility | **PARTIAL** | รองรับ description, first-comment เมื่อ permission พร้อม, manual handoff สำหรับ native product linking และ publish without affiliate เฉพาะเมื่อเลือกชัดเจน. URL มาจาก canonical user/product/tenant record และรักษา tracking string; ยังไม่มี live test ยืนยัน clickability, native link หรือ conversion/commission. |
| 9 | Automated Tests | **PARTIAL** | ผ่าน focused tests: Python Meta OAuth/Graph/social publish `32/32`; Social Publishing + Meta Channels `17/17`; Auto Review staged-render reconciliation `3/3`; pending library-link gate `1/1`; UI/service focused suite ก่อนหน้า `25/25`. ยังไม่ได้รัน end-to-end กับ Meta จริงหรือทุกกรณี acceptance ใน brief. ไม่ได้รัน repository-wide typecheck. |
| 10 | DEV Deployment | **PASS** | Migration `0456` ถูก apply กับ DEV `smartspec`; unique index ตรวจแล้ว. Release `smartspec-web-d74ff1525d9e5d5ca1b2ca59ed0660ca51488747-00a5ef61203f`, artifact SHA-256 `ce4ba01c3d381d18cfa354997c16d6ba5c6c08b8ad77116c02193497693597fa`, target `legacy-debian-dev`, services `smartspec-web.service` และ `smartspec-node-worker.service` healthy. Public `/` และ `/healthz` ตอบ `200`; anonymous protected diagnostics ตอบ `403`. |
| 11 | Live Meta Acceptance | **BLOCKED_EXTERNAL** | ไม่ได้เชื่อม OAuth, upload หรือเผยแพร่ Reel จริง และไม่มี public post. ยังต้องพิสูจน์ Meta รับ upload/process/publish, คืน identifiers/status/permalink, ไม่มี duplicate และตรวจ Reel จาก viewer account. |
| 12 | Remaining External Blockers | **BLOCKED_EXTERNAL** | ต้องตั้ง Meta App ID/secret ใน secret store, HTTPS callback ให้ตรง Meta App, เปิด `META_CHANNELS_ENABLED` หลังตั้ง permissions, เชื่อม owner test Page ที่มี Page task `CREATE_CONTENT`, ยืนยัน grants/App Review สำหรับกลุ่มผู้ใช้เป้าหมาย และกำหนด test Page พร้อมอนุญาตเผยแพร่. First comment ต้องมี `pages_manage_engagement` และ task ที่เกี่ยวข้อง; native affiliate/attribution ต้องยืนยันกับ partner/Facebook จริง. |

## Runtime reconciliation ของ run ตัวอย่าง

- Final render Worker job เดิม: `12aeedc5-f531-41b6-9d5c-3b68748405ed` (completed); artifact เดิม `c94f46d4-8bb5-4c11-a778-a63df0e04483` มีอยู่ใน private storage.
- หลัง deploy มี reconciliation job `f03bdd40-b8c6-4c3d-a9d6-edb053e387a6` สำเร็จ; run จบ `completed`, stage `library_finalize`, `resultLibraryItemId=1701`.
- การแก้ pending-link exception จำกัดไว้ที่ intermediate package assembly; final Library promotion ยังคงตรวจหลักฐาน package/finalization.
- ไม่มีการสร้างโพสต์ Facebook จริง และ Meta publishing ยัง gated จนกว่า configuration/authorization จะพร้อม.

## Configuration checklist สำหรับผู้ดูแล Meta App

1. ใส่ App ID/secret ใน secret store/runtime settings ที่ backend ใช้อยู่; ห้ามส่งค่า secret ใน ticket หรือ log.
2. ตั้ง `META_REDIRECT_URI` เป็น HTTPS callback เดียวกับที่ลงทะเบียนใน Meta App; ตรวจ OAuth state/callback และ reconnect.
3. ตั้ง `META_GRAPH_API_VERSION=v27.0`; เปิด `META_CHANNELS_ENABLED=true` หลัง App, callback และ permission พร้อมเท่านั้น.
4. สำหรับ Page Reel ขอ `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` และยืนยัน Page task `CREATE_CONTENT`; ขอ App Review/Advanced Access ตามกลุ่มผู้ใช้จริง.
5. ทดสอบด้วย owner-controlled test Page ก่อน; อนุญาต first comment แยกต่างหากเมื่อมี `pages_manage_engagement` และยืนยัน commercial disclosure.
6. หลัง publish ให้ตรวจ API status และ Reel จาก viewer account; ยืนยัน Affiliate click-through/attribution แยกจาก API success.

Schedule/Auto Post ยังเป็นระยะถัดไป; ไม่มีปุ่มหรือ policy ที่ทำให้ autonomous public publishing ทำงานใน Phase A ก่อน live acceptance และ explicit authorization.
