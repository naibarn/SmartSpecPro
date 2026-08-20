# SmartAIHub MCP และ Hermes — คู่มือใช้งานปัจจุบัน

เอกสารนี้เป็นคู่มือสำหรับการใช้ Hermes, Claude และ Codex เชื่อมต่อ SmartAIHub
ผ่าน MCP รวมถึงการใช้ Remotion Executor บนเครื่อง Windows 11 หรือ macOS

ตรวจสอบกับ codebase และ production endpoint เมื่อ 2026-08-17 แล้ว จุดสำคัญคือ
**MCP, Public REST API และ Hermes provider chat เป็นคนละ integration** ไม่ควรนำ
URL หรือคีย์ของระบบหนึ่งไปใส่อีกระบบหนึ่ง

## สรุปสำหรับผู้ใช้

การเชื่อม MCP ที่แนะนำมีเพียงขั้นตอนนี้:

1. เพิ่ม server URL นี้ใน MCP client:

   ```text
   https://smartaihub.app/v1/mcp
   ```

2. ให้ client เลือก OAuth / Sign in with browser
3. Login SmartAIHub ใน browser และกดอนุญาตสิทธิ์ที่ต้องการ
4. กลับไปที่ client แล้วให้ client เรียก `initialize` หรือ `server/discover`
   จากนั้นเรียก `tools/list`

ไม่ต้องกรอก SmartAIHub API key, OAuth client ID, issuer URL, JWKS URL หรือ
MCP token เอง เมื่อ client รองรับ MCP OAuth และ production เปิด OAuth runtime
เรียบร้อยแล้ว ระบบจะค้นหา metadata และทำ PKCE/browser authorization ให้เอง

ถ้าต้องการให้เครื่องนี้ render Remotion จริง ให้ติดตั้งและเชื่อม
**Remotion Executor แยกจาก MCP**:

```bash
smartaihub-remotion-executor doctor
smartaihub-remotion-executor setup
```

`setup` จะติดตั้ง runtime pack ที่ตรงกับ platform หากยังไม่มี, ตรวจสอบความพร้อม,
เปิด browser/device approval และเริ่ม executor ต่อเนื่องในคำสั่งเดียว

## 1. อย่าสับสนระหว่าง URL ทั้งสามแบบ

| URL                                      | ใช้ทำอะไร                               | Auth ที่ออกแบบไว้                                               |
| ---------------------------------------- | --------------------------------------- | --------------------------------------------------------------- |
| `https://smartaihub.app/v1/mcp`          | MCP JSON-RPC สำหรับ Hermes/Claude/Codex | OAuth browser เป็นทางหลัก; API key/legacy เป็น fallback         |
| `https://smartaihub.app/v1/docs/`        | Swagger UI ของ Public REST API          | API key แบบ `Authorization: Bearer sk-ssp_...` หรือ `X-Api-Key` |
| `https://smartaihub.app/v1/openapi.json` | OpenAPI contract ของ Public REST API    | API key ตาม Swagger                                             |

หน้า `/v1/docs/` ไม่ใช่หน้าสำหรับเพิ่ม MCP server และไม่ควรนำ API key จาก
หน้า Admin → API Keys ไปใส่ใน Hermes หากต้องการใช้ OAuth MCP

Public REST API ยังเป็น integration ที่ถูกต้องสำหรับ n8n, Zapier, Make หรือ
โปรแกรมที่สร้างจาก OpenAPI ส่วน MCP ใช้ tool discovery และ JSON-RPC ตามหัวข้อ
ถัดไป

## 2. สถานะ production ที่ต้องรู้ก่อนเริ่ม

MCP จะพร้อมใช้งานจริงก็ต่อเมื่อ operator บันทึกค่าใน UI ของ server แล้ว:

`Settings → Infrastructure → MCP/OAuth → Save MCP/OAuth`

ระบบ production ใช้ค่าจาก `system_settings` ในฐานข้อมูลเป็นหลัก ไม่ควรใส่
signing key หรือ token ใน `.env` เพื่อแก้ปัญหาหน้างาน

ก่อน rollout ให้ตรวจด้วยคำสั่ง readiness จาก repository:

```bash
npm --workspace apps/web run mcp:readiness
```

ผลที่ต้องได้คือ `ready: true` และ source เป็น `database` หรือ UI-backed runtime
config ที่เทียบเท่า หากพบ `source: "none"`, `publicBaseUrl must be an HTTPS URL`
หรือข้อความว่ายังไม่มี MCP settings แปลว่ายังไม่พร้อมสำหรับ OAuth zero-config

จากการตรวจ production ในวันที่ระบุด้านบน:

- `GET /v1/docs/` เปิดได้ แต่เป็น REST/OpenAPI ที่ระบุ API key
- `GET /.well-known/mcp.json` ยังรายงาน `modern: false` และไม่มี endpoint URL
- `GET /.well-known/oauth-protected-resource` ยังตอบ `404`
- `GET /v1/mcp` ยังตอบ `401` แบบ legacy/API-key challenge

ดังนั้นคู่มือนี้อธิบาย target flow ที่ codebase รองรับ แต่ **ยังไม่ควรสื่อว่า
production พร้อม OAuth จนกว่า readiness และการทดสอบ browser จะผ่าน**

## 3. MCP flow สำหรับ Hermes, Claude และ Codex

### 3.1 สิ่งที่ client ต้องทำ

MCP client ที่รองรับ remote HTTP/Streamable HTTP ควรทำตามลำดับนี้:

1. เปิด URL `https://smartaihub.app/v1/mcp`
2. ถ้าได้รับ `401` พร้อม `WWW-Authenticate` ให้ค้นหา Protected Resource
   Metadata ที่ server แจ้ง
3. ค้นหา OAuth authorization server metadata
4. ลงทะเบียน client แบบ dynamic ถ้า server เปิด DCR หรือใช้วิธีที่ client รองรับ
5. เปิด authorization URL ใน browser พร้อม `resource` เป็น
   `https://smartaihub.app/v1/mcp` และ PKCE `S256`
6. ผู้ใช้ login และอนุมัติ consent
7. แลก authorization code เป็น access token และ refresh token
8. ส่ง access token ด้วย `Authorization: Bearer ...` ไปที่ `/v1/mcp`

Client ไม่ควรส่ง token ใน query string, ชื่อ tool, prompt, log หรือไฟล์ project

### 3.2 Hermes One — เชื่อมต่อจากหน้า UI โดยไม่ใช้คำสั่ง

หน้า Settings → MCP & Devices ของ SmartAIHub มี onboarding สำหรับ Hermes One:

1. กด `Connect in Hermes One` เมื่อการ์ดแสดงว่า OAuth พร้อมใช้งาน
2. ยืนยัน public server configuration ในหน้าต่าง Hermes
3. login และอนุมัติ scopes ใน browser ของ SmartAIHub
4. กลับไป Hermes แล้ว reload MCP tools

ลิงก์ `hermes://` มีเฉพาะ public URL และ `auth: oauth` เท่านั้น ไม่มี API key,
access token, refresh token, worker credential หรือ tenant secret หากไม่มีปุ่มหรือ
ลิงก์ ให้ใช้ Hermes CLI ด้านล่างแทน

### 3.3 Hermes CLI / Hermes Agent — คำสั่งที่ถูกต้อง

ถ้าเครื่องเปิด browser ได้ ให้ใช้ OAuth:

```bash
hermes mcp add smartaihub --url https://smartaihub.app/v1/mcp --auth oauth
hermes mcp login smartaihub
hermes mcp test smartaihub
hermes mcp list
```

บน Windows ให้รันคำสั่ง interactive เหล่านี้จาก PowerShell หรือ Windows Terminal
แยกจากหน้าต่าง chat/agent ของ Hermes One ไม่ควรสั่งให้ agent ภายในเปิดคำสั่งที่ต้อง
ใช้ PTY เอง เพราะบาง Hermes/ConPTY รุ่นจะ crash ด้วยข้อผิดพลาด semaphore

ถ้าเครื่องไม่มี browser แต่ยังมี interactive terminal ให้ลอง OAuth ต่อ โดยเปิด authorize
URL บน browser ของอุปกรณ์ที่เชื่อถือได้ แล้วนำ redirect URL สุดท้ายกลับมาวางใน prompt
ของ Hermes (หาก Hermes รุ่นนั้นแสดง paste-back flow) วิธีนี้ยังคงใช้ OAuth และไม่ต้อง
สร้าง key เพิ่ม

ถ้า paste-back flow ไม่มี หรือเป็น Claude Code/Codex ที่รันแบบ headless ให้สร้างคีย์เฉพาะ
ที่หน้า `Settings → API Keys → Create MCP CLI Key` ก่อน คีย์จะแสดงครั้งเดียวและถูกเก็บ
แบบ hash บน server จากนั้นจึงใช้ `header` ได้เฉพาะกับคีย์นี้:

```bash
hermes mcp add smartaihub --url https://smartaihub.app/v1/mcp --auth header
```

Hermes จะขอค่าคีย์ผ่าน secure prompt/config secret field ให้กรอก dedicated MCP CLI
key เท่านั้น ห้ามใช้ OAuth access/refresh token ในโหมดนี้ และห้ามส่งคีย์ใน chat หรือ
command history

### 3.4 Claude / Claude Desktop

ใช้ `Settings → Connectors → Add custom connector` แล้วใส่:

```text
https://smartaihub.app/v1/mcp
```

กด `Add` แล้ว `Connect` เพื่อเปิด browser OAuth จากนั้นเปิดเฉพาะ tools ที่จำเป็น
จาก Search and tools ของ Claude อย่าใส่ remote MCP server นี้ใน
`claude_desktop_config.json` เพราะ remote connector ของ Claude ใช้ Connector UI
และ credential store ของ Claude เอง

สำหรับ Claude Code ให้ใช้:

```text
claude mcp add --transport http smartaihub https://smartaihub.app/v1/mcp
> /mcp
```

### 3.5 Codex CLI / Codex Desktop

Codex CLI ใช้ remote Streamable HTTP และ browser OAuth:

```text
codex mcp add smartaihub --url https://smartaihub.app/v1/mcp
codex mcp login smartaihub
codex mcp list
```

บาง Codex รุ่นจะ login ระหว่าง `add` หรือแสดงสถานะ OAuth ไม่ครบ ให้ตรวจจาก
`codex mcp list` และเปิด session ใหม่เพื่อยืนยันว่า tools ถูกโหลดแล้ว ไม่ควรใช้
`--bearer-token-env-var` กับ flow OAuth

กรณีไม่มี browser ให้เก็บคีย์เป็น `SMARTAIHUB_MCP_KEY` ใน OS secret store แล้วใช้:

```text
codex mcp add smartaihub --url https://smartaihub.app/v1/mcp --bearer-token-env-var SMARTAIHUB_MCP_KEY
codex mcp list
```

สำหรับ Claude Code ใช้ bearer header จาก environment variable ตาม syntax ของรุ่นที่ติดตั้ง:

```text
claude mcp add --transport http smartaihub https://smartaihub.app/v1/mcp --header "Authorization: Bearer $SMARTAIHUB_MCP_KEY"
```

ค่าเริ่มต้นของ MCP CLI key คือ 500 credits ต่อ bucket 5 ชั่วโมง, 1,500 credits ต่อวัน
และ 5,000 credits ต่อ bucket 7 วัน ผู้ใช้ปรับลด เพิ่ม หรือเว้นว่างเพื่อ unlimited
ได้ในหน้า API Keys โดย request RPM และ scope ยังคงถูกตรวจแยกต่างหาก

### 3.6 MCP client อื่น ๆ

เลือก transport เป็น Streamable HTTP ใส่ endpoint เดียวกัน และเลือก OAuth/browser
login หาก client รองรับ ให้ client อ่าน Protected Resource Metadata และ
Authorization Server Metadata เอง แล้วทำ Authorization Code + PKCE

ถ้า client ไม่รองรับ MCP OAuth discovery อย่าเดา static `Authorization` header
หรือคัดลอก token จาก browser ให้ใช้เฉพาะ fallback ที่ SmartAIHub ระบุไว้สำหรับ
client นั้น หรือใช้ Public REST/OpenAPI ที่:

```text
https://smartaihub.app/v1/openapi.json
```

Hermes, Claude และ Codex ใช้ endpoint, OAuth issuer, tenant ACL และ scope policy
เดียวกัน แต่ credential store และ callback เป็นของแต่ละ client ห้ามนำไฟล์ token
หรือ config ของ client หนึ่งไปใช้กับอีก client

Hermes One ที่รองรับ deep link สามารถเปิดลิงก์นี้เพื่อเติมค่า server โดยต้องกด
ยืนยันในหน้าต่างของ Hermes ก่อนบันทึก:

```text
hermes://mcp/install?name=smartaihub&config=eyJ1cmwiOiJodHRwczovL3NtYXJ0YWlodWIuYXBwL3YxL21jcCIsImF1dGgiOiJvYXV0aCJ9
```

Modern MCP protocol version คือ `2026-07-28`; server ยังประกาศ legacy versions
`2025-11-25` และ `2025-03-26` เพื่อรองรับ client เก่า

เมื่อ OAuth เปิดครบ metadata ที่ client ควรค้นพบคือ:

- `https://smartaihub.app/.well-known/oauth-protected-resource`
- `https://smartaihub.app/.well-known/oauth-authorization-server`

### 3.7 MCP methods ที่ต้องรองรับ

ระบบปัจจุบันมี contract สำหรับ:

| Method                      | หน้าที่                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| `server/discover`           | ดู protocol, endpoint, capability และ authorization metadata      |
| `initialize`                | ใช้กับ legacy/session clients ที่ยังไม่ใช้ modern discovery       |
| `ping`                      | ตรวจว่า session/transport ยังตอบสนอง                              |
| `tools/list`                | ขอรายการ tools ที่ principal นี้เห็นและมี scope ใช้ได้จริง        |
| `tools/call`                | เรียก tool ตาม `name` และ `arguments` schema                      |
| `resources/list`            | รายการเอกสาร MCP ที่ server เปิดให้ client อ่าน                   |
| `resources/read`            | อ่านเอกสารตาม URI ที่ได้จาก `resources/list`                      |
| `notifications/initialized` | notification หลัง initialize/discovery                            |
| `DELETE /v1/mcp`            | ปิด legacy session เท่านั้น ไม่ใช่ revoke device หรือ OAuth grant |

`tools/list` เป็นแหล่งข้อมูลที่เชื่อถือได้ที่สุด เพราะรายการจะถูกกรองตาม
tenant, user, device, scope, feature flag และ availability ของระบบในขณะนั้น
อย่า hard-code จำนวน tools ใน client

ขณะนี้ `tasks`, `subscriptions`, `tools/listChanged` และ resource subscriptions
ยังไม่ใช่ความสามารถที่เปิดให้ใช้งานทั่วไป:

- `tasks: false`
- `subscriptions: false`
- `tools.listChanged: false`
- resources เป็น documentation resources แบบอ่านอย่างเดียว

### 3.8 สิทธิ์ OAuth

ระบบใช้ access token อายุสั้นประมาณ 15 นาที และ refresh authorization ประมาณ
30 วัน โดย client ต้อง refresh ตามมาตรฐาน OAuth และต้องรับกรณี token ถูกหมดอายุ
หรือ revoke แล้วกลับไป authorize ใหม่

สิทธิ์ที่ระบบรู้จักในปัจจุบันมีดังนี้:

| Scope               | ความหมาย                                            |
| ------------------- | --------------------------------------------------- |
| `mcp:read`          | ค้นหาและอ่าน MCP/resources ที่บัญชีเข้าถึงได้       |
| `mcp:write`         | เรียก action ที่อาจเปลี่ยนข้อมูลหรือเริ่ม operation |
| `llm:chat`          | ใช้ SmartAIHub gateway models และ chat/responses    |
| `media:read`        | ดู media history ตาม ACL                            |
| `media:generate`    | สร้างภาพ วิดีโอ และเสียงที่ได้รับอนุญาต             |
| `media:download`    | ดาวน์โหลด media ที่บัญชีมีสิทธิ์                    |
| `library:search`    | ค้นหา library                                       |
| `library:read`      | อ่าน metadata/content ที่มีสิทธิ์                   |
| `library:download`  | ดาวน์โหลดไฟล์ library ที่มีสิทธิ์                   |
| `library:upload`    | อัปโหลดเข้า library ผ่าน publication flow           |
| `remotion:submit`   | ส่งงาน Remotion render                              |
| `remotion:read`     | อ่านสถานะ/ผลลัพธ์ Remotion ของเจ้าของงาน            |
| `remotion:cancel`   | ยกเลิกงาน Remotion ของเจ้าของงาน                    |
| `hermes:connect`    | เชื่อม approved Hermes runtime                      |
| `hermes:read`       | อ่านสถานะ connection และงาน Hermes                  |
| `hermes:generate`   | สั่งงาน generation ผ่าน Hermes ที่ได้รับอนุญาต      |
| `hermes:disconnect` | ตัด approved Hermes runtime                         |

Consent page ต้องแสดงชื่อสิทธิ์ที่อ่านเข้าใจได้ ไม่ใช่แค่รหัส scope และทุกคำสั่ง
ยังถูกตรวจ tenant/user/file/job ACL ซ้ำที่ server เสมอ OAuth scope ไม่ได้ทำให้
ผู้ใช้เข้าถึงไฟล์ของ tenant อื่นหรือ bypass ACL

### ข้อจำกัดที่ต้องปิดก่อนประกาศว่า OAuth เข้าถึง tools ได้ครบ

registry ปัจจุบันยังมี required scope ภายในสำหรับบางกลุ่มที่ไม่ได้อยู่ใน
OAuth default scope list เช่น `rag:search`, `rag:ingest`, `skills:list`,
`skills:execute`, `agencies:list`, `agencies:invoke`, `presentations:create`,
`video_projects:create`, `jobs:read` และ `jobs:create`

ใน modern OAuth `legacyBroadScopeCompatibility` ไม่ได้เปิดให้โดยอัตโนมัติ ดังนั้น
client อาจเห็น tools กลุ่มนี้เป็น hidden แม้มีชื่ออยู่ใน registry การทำให้ใช้งาน
ครบต้องเพิ่ม scope เหล่านี้ใน runtime configuration, consent copy, policy และ
test matrix ให้ครบก่อน ไม่ควรแก้ด้วยการให้ `mcp:write` กว้างเกินจำเป็น

จนกว่า gate นี้จะผ่าน ให้ถือว่า `tools/list` ของ principal เป็นความจริง และสื่อสาร
กับผู้ใช้ว่า tool ที่ไม่ปรากฏยังไม่ได้เปิดให้ connection นั้น ไม่ใช่ปัญหาของ Hermes
หรือ Claude

## 4. Tools ปัจจุบันจาก registry

ชื่อด้านล่างเป็น canonical `smartspec.*` names ที่อยู่ใน registry ปัจจุบัน
แต่ tool อาจไม่ปรากฏใน `tools/list` หาก tenant flag, scope หรือ dependency
ยังไม่พร้อม

### Gateway และ SmartAIHub chat

- `smartspec.gateway.models.list`
- `smartspec.gateway.credits.get`
- `smartspec.gateway.credits.estimate`
- `smartspec.gateway.chat.create`
- `smartspec.gateway.responses.create`

### Knowledge, Library และ RAG

- `smartspec.knowledge.library.search`
- `smartspec.knowledge.library.get`
- `smartspec.knowledge.library.download`
- `smartspec.knowledge.library.upload`
- `smartspec.knowledge.context_packs.list`
- `smartspec.knowledge.context_packs.resolve`
- `smartspec.knowledge.rag.search`
- `smartspec.knowledge.rag.ingest`

ไฟล์จาก local workspace, library และ R2 ไม่ใช่ MCP resources แบบเปิดกว้าง ให้ใช้
tool ที่ ACL รองรับเพื่อขอ download reference อายุสั้นเท่านั้น ระบบจะตรวจสิทธิ์
tenant/user ซ้ำตอน download และไม่ควรส่ง R2 key, local path หรือ permanent URL
ให้ client

### Skills และ Agencies

- `smartspec.skills.list`
- `smartspec.skills.get`
- `smartspec.skills.detect`
- `smartspec.skills.execute`
- `smartspec.agencies.list`
- `smartspec.agencies.invoke`
- `smartspec.agencies.status`

### Marketplace Intelligence

- `smartspec.marketplace_intelligence.search_snapshot.save`
- `smartspec.marketplace_intelligence.snapshots.list`
- `smartspec.marketplace_intelligence.snapshot.get`
- `smartspec.marketplace_intelligence.report.generate`
- `smartspec.marketplace_intelligence.capture_batch.create`
- `smartspec.marketplace_intelligence.watchlists.list`
- `smartspec.marketplace_intelligence.watchlist.upsert`

### Media, presentations และ video projects

- `smartspec.media.generate_image`
- `smartspec.media.generate_video`
- `smartspec.media.generate_audio`
- `smartspec.media.status`
- `smartspec.media.cancel`
- `smartspec.media.history.list`
- `smartspec.media.history.get`
- `smartspec.media.history.download`
- `smartspec.presentations.create`
- `smartspec.presentations.get`
- `smartspec.presentations.progress`
- `smartspec.presentations.export`
- `smartspec.presentations.download`
- `smartspec.video_projects.create`
- `smartspec.video_projects.get`
- `smartspec.video_projects.download`

การ download ภาพ/วิดีโอจาก media history จึงต้องได้ `media:download` และผ่าน
owner/tenant ACL ไม่ใช่แค่เห็นรายการจาก `media.history.list`

### Hermes และ Remotion

- `smartspec.hermes.connector.status`
- `smartspec.hermes.capabilities`
- `smartspec.hermes.connection_status`
- `smartspec.hermes.connection_authorize`
- `smartspec.hermes.connection_probe`
- `smartspec.hermes.connection_disconnect`
- `smartspec.hermes.connection_test_generation`
- `smartspec.hermes.media_execute`
- `smartspec.hermes.agent.disconnect`
- `smartspec.remotion.render_video`
- `smartspec.remotion.job.status`
- `smartspec.remotion.job.cancel`

### Jobs, workspace, drive และ orchestration

- `smartspec.jobs.submit`
- `smartspec.jobs.list`
- `smartspec.jobs.get`
- `smartspec.jobs.cancel`
- `smartspec.workspace.read_file`
- `smartspec.workspace.list_directory`
- `smartspec.workspace.write_file`
- `smartspec.drive.search`
- `smartspec.drive.read`
- `smartspec.drive.list`
- `smartspec.drive.info`
- `smartspec.orchestrator.promote_message_to_work_item`
- `smartspec.orchestrator.advance_work_item`
- `smartspec.orchestrator.approve_work_item`
- `smartspec.orchestrator.request_work_item_changes`
- `smartspec.browser.execute_actions`

`smartspec.browser.execute_actions` เป็น gated tool และไม่ควรถือว่าใช้ได้เพียง
เพราะมีชื่ออยู่ใน registry ส่วน write/mutation tools ต้องใช้ idempotency key เมื่อ
schema ของ tool ระบุ และควรเรียก schema จาก `tools/list` ทุกครั้ง

### Legacy guide aliases

ชื่อสั้น เช่น `image.generate`, `video.generate`, `models.list`,
`account.get_balance`, `credits.estimate`, `render.get`, `render.list` และ
`render.cancel` เป็น compatibility aliases ไม่ใช่ canonical
contract และอาจถูกซ่อนด้วย tenant flag `mcpGuideToolAliasesEnabled` ค่าเริ่มต้น
ไม่ควรให้ client ใหม่ hard-code aliases เหล่านี้

## 5. Hermes chat ไม่ใช่ MCP authentication

ใน Worker App แท็บ **Hermes agents** มีปุ่ม:

- **Open Hermes TUI**
- **Open Grok chat**
- **Sign in to xAI / Grok**
- **Run Hermes checks**
- **Install / update Hermes runtime**

คำสั่ง `hermes auth add xai-oauth`, `hermes auth list` และ `hermes chat` เป็น
credential/UX ของ Hermes provider โดยตรง ไม่ใช่ SmartAIHub MCP OAuth

ถ้าเห็นข้อความ:

```text
API Server Key not set — chat will fail.
```

หมายถึง Hermes ยังไม่มี credential สำหรับ provider ที่ใช้คุยแชท ไม่ได้หมายความว่า
MCP OAuth ล้มเหลว และการเชื่อม MCP ไม่ได้เปลี่ยน provider ของ Hermes chat ให้มาใช้
SmartAIHub gateway อัตโนมัติ

ถ้าต้องการใช้ SmartAIHub gateway ให้เรียก tools กลุ่ม
`smartspec.gateway.*` ผ่าน MCP หรือทำ provider integration แยกต่างหาก อย่านำ
MCP access token ไปใส่ในช่อง API Server Key ของ Hermes

## 6. Remotion Executor บน Windows 11 และ macOS

MCP ใช้สั่ง submit/status/cancel ส่วนการ render จริงบนเครื่อง local ใช้
Remotion Executor ซึ่งเชื่อม control plane และ claim job ด้วย credential อีกชุด

Standalone Executor เป็น Node workspace package แยกจาก Tauri Worker App และไม่ต้อง
build Worker App หรือ Xcode บนเครื่องผู้ใช้ หากกำลังทดสอบจาก source repository ใช้:

```bash
npm --workspace @smartspec/remotion-executor run doctor
npm --workspace @smartspec/remotion-executor run connect
npm --workspace @smartspec/remotion-executor run start
```

สำหรับการใช้งานจริง ให้ใช้ standalone distribution/release ที่ทีมจัดส่งให้ ซึ่ง
คำสั่ง `smartaihub-remotion-executor` ต้องมาจาก signed platform installer ที่
เผยแพร่โดย SmartAIHub เท่านั้น ไม่ควรให้ผู้ใช้ production build, `npm install`
แพ็กเกจสุ่มเอง หรือเปลี่ยน executable path ตามคำสั่งจาก MCP หาก manifest ของ
platform ตอบ `runtime_pack_not_published` แปลว่า MCP พร้อม แต่ local render ยัง
ไม่เปิดใช้งานสำหรับ platform นั้น

### คำสั่ง

```bash
# ตรวจ platform, Node, disk, runtime pack, Chromium, ffmpeg และ credential store
smartaihub-remotion-executor doctor

# ติดตั้ง runtime pack ที่ signed/verified หากจำเป็น แล้วเปิด device approval
# และเริ่ม executor ต่อเนื่อง
smartaihub-remotion-executor setup

# เชื่อมอุปกรณ์ครั้งแรกเท่านั้น
smartaihub-remotion-executor connect

# เริ่ม executor หลังจากเชื่อมไว้แล้ว
smartaihub-remotion-executor start

# ตรวจสถานะ runtime + credential โดยไม่แสดง secret
smartaihub-remotion-executor status

# ลบ credential เฉพาะเครื่องนี้ (ไม่ revoke server device อัตโนมัติ)
smartaihub-remotion-executor logout
```

ข้อเท็จจริงของ implementation ปัจจุบัน:

- `connect` เปิด verification URL และรอ device approval จาก browser
- credential ถูกเก็บใน per-user protected storage ของระบบปฏิบัติการ
- refresh token ใช้ device proof ผูกกับ device key
- artifact upload ใช้ checksum, short-lived upload flow และ presigned HTTPS URL
- server เป็นผู้ตรวจ lease, tenant/job ownership, checksum และ publication
- MCP token กับ executor credential เป็นคนละ credential family และ revoke แยกกัน
- runtime pack ถูกตรวจ platform, architecture, manifest, checksum, signature และ
  sidecar ก่อนเริ่ม render

### Windows 11

รองรับ target native `windows-x64` ใช้ Windows protected credential support,
per-user application data และ runtime pack ที่ตรงกับ x64 ไม่ต้องติดตั้ง Xcode

### macOS

รองรับ `macos-arm64` และ `macos-x64` ใช้ macOS Keychain และ per-user Application
Support ถ้าใช้ executor pack ที่ระบบจัดการให้ **ไม่ต้อง build Worker App บน Xcode**
เพราะ executor เป็น runtime/CLI แยกจาก Worker App

ถ้าใช้ Worker App เดิมเพื่อ background worker ก็ยังเป็นอีกผลิตภัณฑ์หนึ่ง การไม่ต้อง
build Xcode ในขั้นตอนนี้หมายถึง standalone Remotion Executor เท่านั้น

## 7. การ revoke และความปลอดภัย

ผู้ใช้ตรวจสอบอุปกรณ์ของตัวเองได้ที่:

`Settings → MCP & Devices` หรือหน้า Connected Devices ที่ระบบแสดงให้ account นั้น

ควรเห็นอย่างน้อย:

- ชื่อ client และประเภท integration
- platform/device และ verified origin
- tenant/account ที่ connection ผูกอยู่
- scopes ที่อนุมัติเป็นชื่ออ่านเข้าใจได้
- เวลาเชื่อมต่อและเวลา token หมดอายุ
- สถานะ active/expired/revoked
- ปุ่ม revoke รายการนั้น
- ปุ่ม revoke all MCP connections ของผู้ใช้คนนั้น

การ revoke MCP OAuth ไม่ควร revoke Remotion Executor โดยอัตโนมัติ และกลับกัน
หากต้องการหยุด render บนเครื่องให้ revoke executor device แยกต่างหาก

ข้อปฏิบัติ:

- ใช้ HTTPS เท่านั้นใน production
- ไม่ paste API key, MCP token, refresh token หรือ executor token ใน chat/log
- อย่า commit credential หรือใส่ใน project config
- ตรวจว่า browser กลับไปยัง origin ที่คาดหมายก่อนกดอนุญาต
- ให้ consent เฉพาะ scopes ที่จำเป็น; เริ่มจาก read-only หากยังไม่ต้อง generate,
  download หรือ render
- ถ้าเครื่องหาย ให้ revoke device ทันทีจากหน้า Connected Devices

## 8. Troubleshooting

### Client ขอ API key แทนที่จะเปิด browser

สาเหตุที่เป็นไปได้:

1. client ยังไม่รองรับ remote MCP OAuth/PRM
2. production ยังไม่ได้เปิด OAuth runtime config หรือ tenant feature flag
3. client cache discovery เก่า

ให้ตรวจ readiness, ลบ connection เดิมแล้วเพิ่ม URL ใหม่ หาก client รองรับเฉพาะ
API key ให้ใช้ Public REST API ตาม `/v1/docs/` หรือ compatibility fallback ที่
ผู้ดูแลระบบอนุมัติ ไม่ควรเอา API key ไปอ้างว่าเป็น OAuth MCP

### ได้ `401` หรือ `expired/revoked`

ให้เปิด browser authorization ใหม่ ตรวจ account/tenant ให้ถูก และอย่า reuse
authorization code เดิม หาก revoke แล้วต้องสร้าง connection ใหม่

### เชื่อมได้แต่ไม่มี tool

เรียก `tools/list` ใหม่และตรวจ:

- token มี `mcp:read` หรือ scope ของ tool นั้นหรือไม่
- tenant feature flag เปิดหรือไม่
- tool ถูกซ่อนเพราะ dependency/policy/ACL หรือไม่
- ใช้ canonical `smartspec.*` name ไม่ใช่ alias ที่ถูกปิด

### `resources/list` หรือ `resources/read` ใช้ไม่ได้

resources เป็น documentation resources และเปิด/ปิดด้วย rollout policy ไม่ใช่ที่เก็บ
ไฟล์ของผู้ใช้โดยตรง ให้ใช้ Library/Media tools สำหรับไฟล์จริง

### `doctor` ผ่านไม่ครบหรือ render ไม่เริ่ม

รันตามลำดับ:

```bash
smartaihub-remotion-executor doctor
smartaihub-remotion-executor setup
smartaihub-remotion-executor start
```

ตรวจ Node major version, พื้นที่ว่างอย่างน้อยประมาณ 2 GiB, runtime pack,
Chromium, ffmpeg/ffprobe, fonts และ Keychain/Windows protected credential
หาก device ถูก revoke ให้รัน `connect` ใหม่ ไม่ควร copy token จากเครื่องอื่น

## 9. Compatibility และการเลิกใช้ของเก่า

เส้นทางหลักคือ:

```text
POST /v1/mcp
OAuth + PKCE + Protected Resource Metadata
```

เส้นทาง `/api/mcp/*`, API-key auth, legacy initialize/session และ pairing ยังคง
เป็น compatibility fallback สำหรับ client เก่าและ executor ที่มี contract เฉพาะ
ไม่ควรลบหรือ migrate แบบตัดทันที

ก่อน deprecate legacy ต้องดู telemetry แยก endpoint, transport, client และ version
ต่อเนื่องอย่างน้อย 30–90 วัน และต้องแน่ใจว่าไม่มีผู้ใช้ที่ยังพึ่งพา fallback อยู่

คู่มือนี้จงใจไม่ระบุจำนวน tools แบบตายตัว เพราะ `tools/list` เป็น principal-scoped
และ registry จะเปลี่ยนได้ตาม feature/tenant/policy การตรวจสอบความเข้ากันได้ที่ถูกต้อง
คือให้ client ทำ `server/discover → tools/list → tools/call` กับ server จริง
พร้อมตรวจ `resources/list/read` และกรณี token หมดอายุ/revoke ใน test matrix
