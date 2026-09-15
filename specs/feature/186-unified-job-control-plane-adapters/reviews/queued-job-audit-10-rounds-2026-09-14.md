# Feature 186 queued-job system audit — 10 rounds

วันที่ตรวจ: 2026-09-14
ขอบเขต: PostgreSQL schema/ledger, canonical create/outbox, Node provider
scheduler/poller, Python compatibility poller, lease/fencing, retries,
legacy transport boundaries, Cloudflare seam, capacity and recovery gates.

ผลสรุป: ไม่พบ unowned side-effecting producer หรือ canonical queue invariant
ที่ยังแก้ได้อย่างปลอดภัยเพิ่มเติมหลังการแก้ไขรอบนี้ แต่ระบบยังไม่ใช่
production cutover candidate เพราะยังขาดหลักฐาน external ตามรายการท้ายเอกสาร

## Review rounds

| รอบ | พื้นที่ตรวจ | ผล | การแก้ไข/หลักฐาน |
|---:|---|---|---|
| 1 | Migration ledger, live tables, FK และ unique indexes | PASS | Drizzle ledger มี 0325; provider tables 5 ตาราง, FK 4 รายการ และ indexes สำคัญ 4 รายการมีอยู่จริงใน PostgreSQL |
| 2 | Canonical create ก่อน publish และ create + outbox atomicity | PASS | ตรวจ `createControlPlaneJob`/control plane และ migration tests; ไม่ publish ก่อน canonical row |
| 3 | Tenant scope, idempotency key และ definition hash | PASS | Gateway derive actor/tenant server-side; conflict ใช้ definition hash; focused control-plane tests ผ่าน |
| 4 | Provider poller lease และ stale-result fencing | FIXED | เพิ่ม `pollerLeaseTokenHash` ใน poll record, guarded CP settlement, guarded reservation release และ `FOR UPDATE` validation |
| 5 | External terminal recovery หลัง lost CP response | FIXED | เพิ่ม mapping ของ legacy poll result `terminal + completed/failed`; เพิ่ม tests ป้องกัน completed job ถูกแปลงเป็น unknown/failure |
| 6 | External operation identity และ queued hold race | FIXED | `holdQueued` ยอมรับ waiting job เฉพาะเมื่อ operation key ตรงกัน; เพิ่ม regression test |
| 7 | Retry ownership, provider slot, duplicate reservation | PASS | business attempt ไม่เพิ่มจาก poll/redelivery; duplicate operation ถูกตรวจหลัง lock ก่อนแตะ counter |
| 8 | Direct BullMQ/Celery producer, result reader และ compatibility drain | PASS (gate pending) | audit พบ direct/unmigrated producer 0, adapter-owned 47, legacy transport 3, compatibility status readers 7; paths ที่เหลือถูกจำกัดใน allowlist |
| 9 | Cloudflare queue ack, Hyperdrive fresh read และ transaction boundary | PASS (local only) | ack หลัง canonical handler สำเร็จ, DB loss retry, no-store/strong read; activation และ target binding ยัง disabled |
| 10 | Capacity budgets, poller throughput, DR/PITR และ production evidence | PASS (external gate pending) | manifest มี numeric budgets ครบ 6 execution classes; ไม่เพิ่ม throughput แบบเดา quota และไม่เปิด scheduler/provider แบบเสี่ยง duplicate |

## Repairs applied

- Node provider poller result และ reservation release ผูกกับ fencing token ของ
  poller รุ่นที่ claim record; poller เก่าที่ lease หมดอายุไม่สามารถ settle,
  fail หรือปล่อย slot ของ poller รุ่นใหม่ได้
- Node control-plane external settlement รองรับ optional poller fencing hash
  และ route ตรวจรูปแบบ hash ก่อนรับคำสั่ง
- Python internal provider bridge แปลง domain task ที่ terminal แล้วอย่างมี
  หลักฐานเป็น completed/failed observation แทนการรายงาน unknown
- Queued external wait ไม่ยอมให้ operation คนละตัว reuse canonical job
- เพิ่ม regression tests สำหรับ terminal recovery และ operation-key mismatch

## Initial-pass local evidence

- PostgreSQL migration 0325 was applied and verified against the local `.env`
  database; no destructive migration was run
- Node focused tests: 51 passed
- Python focused tests: 16 passed with `--no-cov`
- Python compile and `git diff --check`: passed
- Feature 186 call-site audit: 0 direct transport calls, 0 unmigrated
  side-effecting producers, 3 explicit legacy adapter calls, 7 compatibility
  status readers
- Feature 186 verifier: `ok: true`, `productionReady: false` (truthful)

## Remaining non-local gates

These are not silently marked complete by this audit:

1. compatibility transport/status-reader drain and retirement evidence;
2. domain projection/checkpoint recovery evidence;
3. provider account-selected submission and real provider restart/lost-response
   recovery evidence;
4. deployment/restart/worker-connectivity evidence;
5. backup/PITR restore rehearsal proving no duplicate paid/provider/artifact
   side effects;
6. Feature 189 transfer enablement and accepted handoff evidence; and
7. Cloudflare target-account Hyperdrive/binding/capability/rollback proof.

The provider output managed-storage requirement remains an explicit provider
integration gate for the compatibility path; local tests do not claim that
external provider URLs have been rehosted in every production path.

## Follow-up fresh audit — 10 rounds

วันที่ตรวจซ้ำ: 2026-09-14 หลังการแก้ไขรอบแรก

| รอบ | พื้นที่ตรวจ | ผล | การแก้ไข/หลักฐาน |
|---:|---|---|---|
| 1 | Call-site inventory และ verifier | PASS | audit สดพบ direct/unmigrated producer 0, adapter-owned 47, legacy transport 3, compatibility readers 7; verifier `ok:true` และไม่ปลอม production readiness |
| 2 | Schema, journal และ live PostgreSQL | FIXED/PASS | เพิ่มและ apply 0326/0327; `businessAttempt` เป็น NOT NULL, unique reservation protection มีจริง, journal entries ครบ, duplicate derived keys 0 |
| 3 | Canonical create + transactional outbox | PASS | create สร้าง `worker_jobs`/events/outbox ก่อน transport และ focused control-plane/outbox tests ผ่าน |
| 4 | Claim, lease, heartbeat, fencing และ stale completion | PASS | guarded predicates, attempt lease generation และ poller fencing ถูกตรวจซ้ำด้วย tests เดิมและ verifier |
| 5 | Provider retry identity | FIXED | provider reservation ผูกกับ `(jobId,businessAttempt,reservationKind)` ไม่บล็อก retry attempt ใหม่ และคง operation-key dedupe |
| 6 | Provider admission windows/aliases | FIXED | บังคับ OpenRouter daily window เพิ่มจาก per-minute window และ canonicalize provider aliases ก่อนนับ account/user/pool quota |
| 7 | Python PostgreSQL-pull initial delivery | FIXED | `/ready` เปลี่ยนเป็น `LEFT JOIN`; initial outbox ที่ยังไม่มี attempt มองเห็นได้ และ claim เป็นจุดสร้าง attempt แบบ atomic; route/Python regression tests ผ่าน |
| 8 | Python worker/Celery compatibility และ ack boundary | PASS | Python focused suite 42 ผ่าน; worker ส่ง `attemptId=None` ได้เฉพาะ initial delivery และไม่ fallback ไป broker เมื่อ hard-cutover |
| 9 | Callback, tenant scope, redaction และ event history | PASS (local) | callback signature/replay/correlation guards, fenced settlement และ bounded payload/error checks ผ่าน; external callback/provider evidence ยังต้องพิสูจน์จริง |
| 10 | Runtime/deployment/DR/production gates | FIXED locally, external pending | เพิ่ม opt-in `smartspec-python-job-worker` ใน `docker-compose.full.yml`, shared token/flags และ runbook; Compose config ผ่าน แต่ deployment restart, provider recovery, PITR, legacy drain และ target-account proof ยังไม่เกิดขึ้น |

### Fresh local evidence

- Node focused Feature 186 tests: 60 passed
- Python focused queue/control-plane tests: 42 passed
- Compose topology validation: `docker compose ... config --quiet` passed
- Local migration re-run: 0327 applied successfully; live PostgreSQL confirms
  `businessAttempt`, unique reservation index, journal entry, and zero
  duplicate `(workerJobId,businessAttempt,reservationKind)` groups
- `git diff --check`: passed for the changed paths

The fresh pass closes the newly found local gaps but does not change the
production verdict. The current verifier remains `productionReady:false` with
the existing external blockers: three legacy transport calls, seven
rollback-only compatibility status readers, domain projection/checkpoint
recovery, real provider account/restart recovery, deployment recovery evidence,
PITR rehearsal, Feature 189 transfer enablement, and Cloudflare target-account
proof.

## Extended convergence rounds 11-12

The requested ten-round audit was extended by two clean post-fix rounds because
round 10 found a deployment configuration gap and the subsequent review found a
shutdown/infinite-loop risk in the newly migrated trash purge path.

| รอบ | พื้นที่ตรวจ | ผล | การแก้ไข/หลักฐาน |
|---:|---|---|---|
| 11 | Trash purge executor failure handling and graceful shutdown | FIXED/PASS | Added `library.trash_purge` to the canonical Node registry, stopped poisoned batches from spinning forever, routed hard-cutover scheduling through the canonical system scheduler, and stopped that scheduler on shutdown; purge test passed 4/4. |
| 12 | Full stale-gate convergence after all fixes | PASS (local) | Node queue suite 68 passed, Python queue/control-plane suite 42 passed, Compose config passed, call-site audit stayed at 0 unowned producers/readers, verifier stayed `ok:true`/`productionReady:false`, and `git diff --check` passed. |

The remaining production blockers are external or intentionally compatibility-
gated; no local code path found in these rounds was left as a known safe
must-fix gap.
