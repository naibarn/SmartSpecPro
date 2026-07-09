# Vertical Drama — Read-only Series Share Links (Collab-lite L1, Task #32)

Owner approved 2026-07-09 ("ทำให้เลย") หลังอธิบาย: ลิงก์แชร์แบบ Google-Docs-view-only ของซีรีส์
Scoping มาจาก audit จริงใน planning/vertical-drama-character-consistency/research-2026-07-09.md §E

## หลักการ

- **อ้อม ไม่ retrofit**: ownership check กระจาย ~40 จุด — เราไม่แตะเลย สร้าง read-path ใหม่
  ที่แคบและ audit ง่ายแทน (1 ตาราง + 1 public procedure + 1 หน้า viewer)
- **Whitelist projection**: ผู้ชมเห็นเฉพาะเนื้อเรื่อง — ห้ามรั่ว: เครดิต/ราคา/ค่าใช้จ่าย,
  provider/model ids, API config, อีเมล/ชื่อ user, tenant settings, forbiddenClaims,
  internal ids เกินจำเป็น
- **Token = secret**: 32 bytes random → base64url; **เก็บเฉพาะ SHA-256 hash**
  (แบบ opencode_api_keys.key_hash ตามกติกา CLAUDE.md); raw token โชว์ครั้งเดียวตอนสร้าง
- ลิงก์ตาย = ตายจริง: expiresAt + revokedAt เช็ค server-side ทุก request;
  ข้อความ error เดียว "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว" (ไม่บอกแยก — กัน enumeration)

## Schema (ตารางใหม่ — ไม่มีข้อมูลเดิมได้รับผลกระทบ)

`vertical_drama_series_share_links`:
id serial PK, tenantId varchar, seriesId int (FK→vertical_drama_series, cascade),
createdByUserId int, tokenHash varchar(64) UNIQUE, scope varchar default 'series_read',
expiresAt timestamptz NOT NULL, revokedAt timestamptz NULL,
createdAt timestamptz default now(), lastAccessedAt timestamptz NULL, accessCount int default 0
— manual SQL + provenance file (precedent: manual_vertical_drama_episode_ad_banner_plan.sql)
+ schema.ts + index on tokenHash

## Server (series router + public router)

1. Owner mutations (verticalDramaSeries.ts, ownership-scoped ตามเดิม):
   - createSeriesShareLink({seriesId, expiresInDays: 7|30}) → gen token, store hash,
     คืน { url, expiresAt } ครั้งเดียว (url = https://smartaihub.app/share/vd/<token>)
   - listSeriesShareLinks({seriesId}) → metadata เท่านั้น (ไม่มี token/hash)
   - revokeSeriesShareLink({seriesId, linkId}) → set revokedAt
   - จำกัด active links ≤ 5 ต่อซีรีส์
2. Public query (procedure แบบไม่ต้อง auth — investigate publicProcedure precedent ใน
   _core/trpc): `verticalDramaShare.getSharedSeries({token})`:
   - hash(token) → lookup → เช็ค expiry/revoked → bump accessCount+lastAccessedAt
   - rate limit (reuse limiter เดิมของระบบ — investigate ตัวที่ login/public api ใช้)
   - คืน whitelist DTO: series {title, genre, tone, plannedEpisodeCount},
     overview {logline, mainPlot, seasonArc}, episodes[] {episodeNumber, title,
     status ระดับหยาบ (ร่าง/มีบท/มีวิดีโอ), logline}, ตัวเลือกดูบทย่อต่อตอน
     (เฉพาะ dialogue text — ไม่มี prompt ภาพ/วิดีโอ)

## Client

1. หน้า series detail: ปุ่ม "แชร์" → Dialog: สร้างลิงก์ (เลือกหมดอายุ 7/30 วัน) →
   โชว์ URL + ปุ่ม copy ครั้งเดียว + คำเตือน "ลิงก์นี้จะไม่แสดงอีก", ตารางลิงก์เดิม
   (สร้างเมื่อ/หมดอายุ/ยอดเข้าชม/ปุ่มเพิกถอน)
2. หน้า public viewer `/share/vd/:token` (route ไม่ผ่าน auth — ดู precedent Login/Signup
   ใน App.tsx): แสดงชื่อเรื่อง+ภาพรวม+รายการตอน read-only, สถานะ chips ไทย,
   ไม่มีปุ่ม action ใด ๆ, มี banner บอก "มุมมองผู้เยี่ยมชม (อ่านอย่างเดียว)"
   + error state ลิงก์ตาย

## Flag + rollout

F131AA `verticalDramaSeriesShareLinks` (4 จุด + admin group, default false) —
gate ปุ่มแชร์ฝั่งเจ้าของ; หน้า public viewer เช็คผ่านการมีอยู่ของ link row เอง
(link สร้างได้เฉพาะตอน flag เปิด = ควบคุมที่ต้นทาง) → เปิด 2 tenants หลัง deploy

## Security review

หลัง implement: ส่ง ssp-security-trpc (read-only) รีวิว surface ใหม่ก่อน deploy —
โฟกัส: token handling, projection leak, rate limit, tenant isolation ของ public path

## Tests

สร้าง/hash/ไม่เก็บ raw, expiry/revoked/unknown → error เดียวกัน, projection ไม่มี field
ต้องห้าม (assert absent เป็นรายชื่อ), limit ≤5, revoke มีผลทันที, mutations ต้อง own series,
UI dialog + copy-once + viewer render + error state
