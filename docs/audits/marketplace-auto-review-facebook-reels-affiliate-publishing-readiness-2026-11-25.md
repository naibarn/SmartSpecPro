# Marketplace Auto Review — Facebook Reels & Affiliate Publishing Readiness

วันที่ตรวจ: 25 พฤศจิกายน 2026
ตัวอย่าง runtime: Auto Review run **mar_c7faf90801db4aab076e00471dd72268**
สภาพแวดล้อม: **legacy-debian-dev** บน smartaihub.app ตาม **apps/web/scripts/deployment-targets.json:4-25**

## ขอบเขตและความหมายของสถานะ

ตรวจ source, SPEC, runtime services และฐานข้อมูล DEV แบบ read-only; ไม่เรียก Meta ด้วย access token, ไม่แก้ข้อมูล, ไม่สร้างหรือเผยแพร่โพสต์จริง และไม่รัน tests. ไม่บันทึก URL ของ Affiliate, storage URL, token, secret หรือ credential ในรายงานนี้.

สถานะในรายงานใช้ตามที่ร้องขอ:

- **VERIFIED_RUNTIME** — พบหลักฐานตรงใน runtime หรือผลอ่านฐานข้อมูล ณ เวลาตรวจ
- **IMPLEMENTED_NOT_RUNTIME_VERIFIED** — มี implementation แต่ยังไม่มีหลักฐาน runtime ที่ยืนยันความสามารถนั้น
- **PARTIAL** — มีบางส่วน แต่ยังขาดเงื่อนไขหรือความสามารถสำคัญ
- **SPEC_ONLY** — พบเฉพาะแผน/SPEC ยังไม่พบ implementation ที่ทำงาน
- **NOT_FOUND** — ไม่พบ implementation ใน source ที่ตรวจ
- **BLOCKED_EXTERNAL** — ต้องมี Meta App, permission, partner eligibility หรือการตั้งค่าภายนอกก่อนยืนยันได้

หมายเหตุ source: HEAD ที่ตรวจคือ **26cdba16628df5aa8e579f7886fc1bec7368cd31**; worktree มีการแก้ไขค้างอยู่ก่อนเริ่มงาน รวมถึง **apps/web/server/jobs/marketplaceAutoReviewJob.ts** และ **apps/web/server/services/marketplaceAutoReviewService.ts**. ไม่แก้หรือย้อนการเปลี่ยนแปลงเหล่านั้น. ข้อสังเกต runtime ยึดข้อมูล DB/service จริง ส่วน line numbers ของไฟล์ที่ dirty เป็น source ใน worktree ณ เวลาตรวจ ไม่ใช่หลักฐานว่าไฟล์ดังกล่าวถูก deploy อยู่.

## 1. Executive Summary

**ข้อสรุป: PARTIAL — ยังไม่พร้อมเผยแพร่ Reel จาก Auto Review บน runtime นี้.** มีข้อมูลสินค้า, Caption/Hashtag และ Affiliate URL ที่บันทึกเป็นข้อมูลแยกส่วน และพบ MP4 จาก Remotion ใน output ของ render worker job. แต่ run ตัวอย่างยัง **waiting_provider** ที่ stage **render**, ยังไม่มี **resultLibraryItemId** และยังไม่เสร็จขั้น Library finalization. ดังนั้นไฟล์ MP4 มีอยู่จริง แต่ Auto Review run ยังไม่ใช่ completed/publish-ready.

ระบบ Social/Meta เดิมมี Facebook OAuth, การค้นหาและเลือก Page, encrypted Page token, การสร้าง draft/เผยแพร่/ตั้งเวลา Page feed post. แต่ publisher ที่มีอยู่เรียก **/{page-id}/feed** และ Meta branch ไม่ใช้ **media_urls**; ไม่ใช่ Reels uploader. ยังไม่พบ Reels upload session, raw/chunked video upload, processing poll, AI disclosure หรือการผูกโพสต์เข้ากับ Auto Review artifact.

บน DEV runtime นี้ **META_CHANNELS_ENABLED** เป็น false, ไม่พบ Meta App ID/Secret ที่ใช้งานได้ และไม่มี Meta connection/Page ของ tenant/user ตัวอย่าง. ไม่ทดสอบ token กับ Meta. ปัจจุบันจึงยังเชื่อม Page หรือโพสต์จาก runtime นี้ไม่ได้.

ตรวจ **smartspec-web.service**, **smartspec-backend.service** และ **smartspec-node-worker.service** พบว่า active; reference route ตอบ HTTP 200 ซึ่งยืนยันเพียงการให้บริการหน้า SPA ไม่ได้ยืนยัน authenticated API หรือความพร้อมของ Social Publishing.

Affiliate URL อยู่ในตาราง **marketplace_product_affiliate_links** แยกจาก **marketplace_products.affiliateUrl** และตรงกับ product, user, tenant ของ run ตัวอย่าง. Meta รองรับส่งข้อความ description และ hashtag ให้ Reel ผ่าน API; การวาง Affiliate URL เป็น text ไม่รับรองว่าเป็น native/clickable affiliate link. Meta อธิบาย native product link, paid partnership toggle และ auto-detection เป็นความสามารถของ Facebook app/composer; auto-detection จาก URL ใน caption หรือ top-level comment ระบุว่าใช้ได้ใน Facebook app เท่านั้น. ต้องมี manual handoff หรือพิสูจน์พฤติกรรมบน test Page ก่อนอ้างว่าผู้ชมกดแล้วนับยอด Affiliate ได้.

## 2. Current Auto Review Architecture

ลำดับข้อมูลที่ตรวจพบ:

1. Route **marketplaceCapture.getAutoReviewRun** อ่าน run ภายใต้ผู้ใช้ที่ยืนยันตัวตน; service ตรวจ **runId**, **userId** และ tenant access ก่อนคืน run กับ stages (**apps/web/server/routers/marketplaceCapture.ts:1489-1517**; **apps/web/server/services/marketplaceAutoReviewService.ts:19730-19762**).
2. **marketplace_products** เก็บแพลตฟอร์ม/สินค้า/ร้าน/ราคา/commission/คำอธิบาย/specs/ข้อมูลดิบ; **marketplace_auto_review_runs** ผูก **tenantId**, **userId**, **productId**, **productionRunId**, สถานะ/stage, **renderJobId**, **resultLibraryItemId**, **resultJson**, **metadataJson**, **idempotencyKey** (**apps/web/drizzle/schema.ts:24482-24565**, **24816-24881**).
3. ขั้น Caption ใช้ operation **staged_social_caption_generation** บน **worker_jobs**, ตรวจ state digest/source hash และ idempotency ก่อนเรียก Skill แล้ว persist ข้อมูลใน **metadataJson.stagedPipeline.socialCaption** (**apps/web/server/services/marketplaceAutoReviewStagedCheckpointRouterService.ts:1288-1369**, **1393-1460**; **apps/web/server/services/marketplaceAutoReviewSocialCaptionSkillRunner.ts:26-43**, **254-325**).
4. Remotion render ใช้ render worker job. Service สำหรับ staged checkpoint อ่าน **worker_jobs.outputJson.publishedArtifacts[].sourceUrl** เมื่อ worker จบ แม้ **metadata.renderUrl** จะยังไม่มี เพราะ Library finalization เป็นคนเขียนค่านั้นภายหลัง (**apps/web/server/services/marketplaceAutoReviewStagedCheckpointRouterService.ts:908-939**).
5. เมื่อ finalization ผ่าน จึงผูก render กับ Library และ publishable package; ตาราง **marketplace_auto_review_artifacts** บันทึก structured QA/package JSON ไม่ใช่ไฟล์ MP4 (**apps/web/server/services/marketplaceAutoReviewService.ts**, symbols **addRenderResultToLibrary** / **buildMarketplaceAutoReviewRenderFinalizationMetadata**; **apps/web/drizzle/schema.ts:25262-25301**).
6. การเผยแพร่ควรเป็นงาน downstream แยกต่างหาก. Facebook ล้มเหลวต้องไม่เปลี่ยนสถานะหรือทำให้ Auto Review/Library artifact หาย.

**สถานะ:** Auto Review ownership **VERIFIED_RUNTIME**; Caption/Hashtag/Affiliate data **VERIFIED_RUNTIME**; pipeline ปกติสู่ Library **IMPLEMENTED_NOT_RUNTIME_VERIFIED** สำหรับ run นี้; Social Publishing เป็น downstream แบบไม่ block **NOT_FOUND** ใน integration ปัจจุบัน.

## 3. Existing Data and Artifact Inventory

| ข้อมูล | ตำแหน่ง/ฟิลด์จริง | หลักฐาน run ตัวอย่าง | สถานะ |
|---|---|---|---|
| Auto Review run/job | **marketplace_auto_review_runs.id**, **tenantId**, **userId**, **productId**, **productionRunId**, **status**, **currentStage**, **renderJobId**, **resultLibraryItemId**, **metadataJson** | Run มี tenant/user/product/render job; สถานะ **waiting_provider**, stage **render**, ไม่มี **completedAt** หรือ **resultLibraryItemId** | **VERIFIED_RUNTIME** |
| สินค้าและ metadata | **marketplace_products**: **sourceUrl**, **affiliateUrl**, **productName**, brand, description, **specsJson**, **platformRawJson**, **userId**, **tenantId** | Product เชื่อมกับ run และตรง user/tenant; direct **affiliateUrl** เป็น NULL | **VERIFIED_RUNTIME** |
| Affiliate URL | **marketplace_product_affiliate_links**: **productId**, **userId**, **tenantId**, **affiliateUrl** | มีแถวที่ตรง product/user/tenant; ค่า URL ไม่ถูกแสดง | **VERIFIED_RUNTIME** |
| Final MP4 | Render **worker_jobs.outputJson** → **publishedArtifacts** / **artifacts**; artifact **remotion_render_mp4**, MIME **video/mp4** | Linked render worker job **completed**; มี persisted MP4 artifact และ output URL. URL/storage reference ไม่ถูกแสดง | **VERIFIED_RUNTIME** |
| Library link | **marketplace_auto_review_runs.resultLibraryItemId** | ค่า result pointer ยังว่าง; run ยังไม่ completed จึงไม่มีหลักฐานว่า Library finalization ผูกผลให้ run นี้แล้ว | **VERIFIED_RUNTIME** |
| Caption/Hashtag | **metadataJson.stagedPipeline.socialCaption.caption** และ **.hashtags[]** | Caption มีอยู่ (279 ตัวอักษร) และมี 5 hashtags; ไม่แสดงเนื้อหา | **VERIFIED_RUNTIME** |
| Caption source | **.sourceType**, **.referenceIndex**/**.shotId**, **.sourceHash**, **.skill**, **.generatedAt**, **.requestIdempotencyKey** | structured metadata มี caption object; ไม่ต้องสร้างใหม่เพื่ออ่านค่าเดิม | **VERIFIED_RUNTIME** |
| Social publication receipt | **social_posts** fields **status**, **contentText**, **contentLink**, **mediaRefs**, **providerPostId**, **metadata** | Schema ไม่มี typed link ไป Auto Review run/artifact; ไม่พบ run-specific receipt. ข้อนี้ไม่ได้ยืนยันว่าไม่มี social post อื่นของผู้ใช้ | **NOT_FOUND** |

**marketplace_auto_review_artifacts** ว่างสำหรับ run นี้ในเวลาตรวจ. นี่คือ QA/package JSON store ไม่ใช่ที่เก็บ MP4; MP4 อยู่ใน output ของ render **worker_jobs** ซึ่งมี artifact storage reference และ output URL. ไม่ระบุ bucket/key หรือ URL ในรายงาน. ค่า **resultLibraryItemId** ว่างหมายถึง run ยังไม่มี Library link ที่บันทึกไว้; ไม่ได้ยืนยันว่าไม่มี Library item อื่นที่ไม่ผูกกับ run. Stage rows แสดง **product_preflight=completed**, **render=waiting_provider**, **library_finalize=queued**; production project ยัง queued, concept/prompt stages ต้องการผู้ใช้, image generation รอ provider และวิดีโอ/audio/edit stages ยัง queued.

## 4. Database and API Evidence

- **marketplace_products** และ **marketplace_product_affiliate_links** แยก product facts กับ Affiliate URL (**schema.ts:24482-24565**, **24705-24737**).
- **marketplace_auto_review_runs** และ **marketplace_auto_review_stages** เป็น run/stage lifecycle หลัก (**schema.ts:24816-24918**). **marketplace_auto_review_outbox_jobs** เป็น outbox เฉพาะระบบเก่า; ไม่ควรสร้าง social publishing ใหม่บนคิวนี้ (**schema.ts:25075-25125**).
- **worker_jobs** มี **tenantId**, **requestedByUserId**, **jobType**, **inputJson**, **outputJson**, retry, lease/fencing, **idempotencyKey**, **activeDedupeKey**, **progressJson**, **scheduledAt**; **worker_job_outbox** มี dispatch envelope และ dedupe key (**schema.ts:17091-17210**, **17875-17931**).
- Auto Review read route: **marketplaceCapture.getAutoReviewRun**; mutations ใช้ protected procedure (**marketplaceCapture.ts:1489-1557**).
- Existing Social routes: **socialPublishing.listPages**, **createDraft**, **publishNow**, **schedulePost**, **listPosts**, **cancelScheduledPost** (**apps/web/server/routers/socialPublishing.ts:22-121**).
- Existing Meta routes: **metaChannels.getConnectionStatus**, **getAuthUrl**, **completeOAuth**, **connectPage**, **disconnectPage**, **updatePageSettings** (**apps/web/server/routers/metaChannels.ts:101-205**, **240-300**).
- ไม่มี route/Graph client สำหรับ **video_reels** ใน source ที่ค้น; Reels publishing, upload, poll, permalink และ AI disclosure จึงเป็น **NOT_FOUND**.
- SPEC 058 (Meta Channels) มี implementation อยู่ แต่ handoff ปัจจุบัน **DORMANT_UNRESOLVED**, 0/31 requirements resolved (**specs/feature/058-meta-channels/handoff/STATUS.md:1-9**). SPEC นี้ไม่ใช่หลักฐานว่า Reels เสร็จ.
- SPEC 301 ขอเพิ่มภาพสำหรับ Social Caption และระบุ Facebook publishing เป็น non-goal (**specs/quick/301-social-caption-post-images/request.md:27-41**). ไม่พบ SPEC ที่ยืนยัน Reels/Affiliate publishing integration.

## 5. Facebook Page Connection Readiness

| Capability | หลักฐาน/ข้อจำกัด | สถานะ |
|---|---|---|
| Meta OAuth | OAuth authorize/callback, expiring state, code exchange และ long-lived token conversion อยู่ใน **python-backend/app/api/meta_oauth.py:90-158**, **186-200** | **IMPLEMENTED_NOT_RUNTIME_VERIFIED** |
| Page discovery / หลาย Page | อ่าน **/me/accounts** พร้อม **id,name,category,access_token,tasks**; upsert Page แยกแถว (**meta_oauth.py:175-183**, **273-357**) | **IMPLEMENTED_NOT_RUNTIME_VERIFIED** |
| Page selection/reconnect/disconnect | **selectedForPublishing**, reconnect ผ่าน OAuth, connect/disconnect และ settings มี route/UI (**schema.ts:23801-23842**; **metaChannels.ts:147-205**, **240-300**; **SocialChannels.tsx:310-345**, **537-545**) | **IMPLEMENTED_NOT_RUNTIME_VERIFIED** |
| Tenant credential storage | **social_provider_connections** ผูก tenant/user และเก็บ encrypted access token; **social_pages** เก็บ encrypted Page token. ใช้ **encrypt_smartspecweb** AES-GCM (**schema.ts:23765-23842**; **python-backend/app/core/smartspecweb_crypto.py:15-68**) | **IMPLEMENTED_NOT_RUNTIME_VERIFIED** |
| Token validity/revocation | Publisher เช็กสถานะ, มี ciphertext และ local expiry แต่ไม่ได้ introspect/เรียก Graph API เพื่อตรวจ revoked token หรือสิทธิ์ปัจจุบัน; Page token expiry ถูกตั้ง NULL ใน OAuth upsert (**socialPublishingService.ts:219-275**; **meta_oauth.py:299-307**) | **PARTIAL** |
| Actual granted scopes / Page tasks | OAuth ขอ scopes แบบ static และบันทึก list เดิมเป็น **grantedScopes**; ไม่ได้ตรวจค่าที่ Meta ให้จริง. **/me/accounts** คืน **tasks** แต่ไม่ enforce **CREATE_CONTENT** ก่อนเผยแพร่ (**meta_oauth.py:27-35**, **175-183**, **229-243**) | **PARTIAL** |
| Runtime connection | DB ไม่มี Meta connection/Page สำหรับ tenant/user ตัวอย่าง | **VERIFIED_RUNTIME** |
| App Review | ตรวจ dashboard/Meta Business account ไม่ได้จาก source/runtime; ไม่ทราบสถานะการอนุมัติ | **BLOCKED_EXTERNAL** |

OAuth implementation ขอ scopes มากกว่าที่ Reel publishing ต้องใช้. ควรลดเหลือ least privilege: **pages_show_list**, **pages_read_engagement**, **pages_manage_posts**; เพิ่ม **pages_manage_engagement** เฉพาะเมื่อใช้ API โพสต์ comment. Reels ต้องมี Page access token จากผู้ใช้ที่มี Page task **CREATE_CONTENT**.

## 6. Facebook Reels Publishing Readiness

Meta Reels API ที่ตรวจเป็น v27.0: เริ่ม session ที่ **/{page-id}/video_reels** ด้วย **upload_phase=start**, ส่ง bytes ไป **rupload.facebook.com**, ตรวจสถานะ video และจบด้วย **upload_phase=finish**. มี specs สำหรับ MP4, 9:16, ความละเอียด/FPS/ความยาว และเสียง; Reels API จำกัด 30 posts ต่อ Page ในช่วง rolling 24 ชั่วโมง. Meta ระบุ **is_ai_generated=true** สำหรับ Reel ที่สร้างหรือแก้ด้วย AI. [Meta Reels Publishing API](https://developers.facebook.com/documentation/video-api/guides/reels-publishing)

| ขั้นตอน | Readiness | หลักฐาน |
|---|---|---|
| สร้าง upload session | **NOT_FOUND** | ไม่มี route/client **video_reels** ใน source; Meta API รองรับ |
| นำ MP4 ที่มีอยู่ไป upload | **PARTIAL** | runtime มี MP4 ใน worker output; ไม่มี Reels uploader. ต้องใช้ artifact เดิม ห้าม render ซ้ำ |
| Private Library/R2 access | **PARTIAL** | Meta รับ local bytes หรือ public URL; URL ที่ต้อง auth ใช้ไม่ได้. ใช้ server-side read จาก storage แล้ว stream/chunk ไป **rupload**; ห้ามเปิด private artifact เป็น public เพื่อส่งให้ Meta |
| MIME/codec/duration/ratio validation | **NOT_FOUND** | MIME **video/mp4** พบ runtime; ยังไม่มีหลักฐาน probe codec/audio/FPS/duration/dimensions เทียบ Meta spec |
| Upload progress/resume และ processing poll | **NOT_FOUND** | Meta มี offset/status API; ไม่มี implementation นี้ใน repo |
| Publish Reel/Caption/Hashtag | **NOT_FOUND** | Existing Meta adapter ลง Page **/feed**, ไม่ใช่ Reels. Reels API มี description และ hashtag |
| AI-generated disclosure | **NOT_FOUND** | API รองรับ **is_ai_generated**; ไม่มี field/consent UI/integration ใน publisher |
| External video/post ID | **PARTIAL** | Meta reference ระบุ finish response มี **video_id**/**post_id**; ไม่มีโค้ดจัดเก็บหรือ reconcile |
| Verify state/permalink | **PARTIAL** | Reels guide บอก poll **/{video-id}?fields=status** และ **GET /{page-id}/video_reels** แต่ Page Video Reels reference ระบุว่า read ไม่รองรับ; guide list ให้ ID/time ไม่ยืนยัน permalink. ต้องยืนยัน API response/field ใน test Page และห้ามสร้าง permalink เอง. [Guide](https://developers.facebook.com/documentation/video-api/guides/reels-publishing), [Page Video Reels reference](https://developers.facebook.com/docs/graph-api/reference/page/video_reels), [Page Post reference](https://developers.facebook.com/docs/graph-api/reference/pagepost) |

Version ที่ระบบระบุใน Meta OAuth settings/default คือ **v25.0** (**meta_oauth.py:62-68**); Meta ระบุ latest เป็น **v27.0** ในหน้า versioning ณ วันตรวจ. ก่อนเขียน adapter ให้เลือก version ที่ Meta App ใช้งานได้และ pin version อย่างชัดเจน. [Meta Graph API versioning](https://developers.facebook.com/docs/graph-api/guides/versioning)

## 7. Affiliate Link Compatibility Matrix

| ความสามารถ | สถานะ | หลักฐาน/ผลต่อผู้ชม |
|---|---|---|
| A. URL ใน Reel description | **PARTIAL** | Reels API รับ description text/hashtags จึงส่ง URL เดิมเป็น text ได้ แต่ไม่พบสัญญา API ว่า URL จะเป็น native product link หรือคลิกได้. Meta ระบุ auto-detection ของ Affiliate URL ใน caption เป็น Facebook app only |
| B. URL ใน first/top-level comment | **REQUIRES_PERMISSION** | Graph API รองรับ **POST /{video-id}/comments**; ต้อง Page token ที่มี **MODERATE** task และ **pages_manage_engagement**. ยังไม่ยืนยันลิงก์บน Reel จริงว่า clickable/attributed |
| C. Pin Affiliate comment | **UNSUPPORTED** | Graph Comment API ที่ตรวจมี create/update/delete แต่ไม่มี pin operation. หากต้อง pin ให้ส่ง manual handoff ใน Facebook app; อย่าใช้ browser automation |
| D. Facebook Native Affiliate Partnerships | **SUPPORTED_UI_ONLY** | Meta อธิบายการเชื่อม partner programme และ product link/banner ผ่าน Facebook professional dashboard/composer. ไม่พบ field ใน public Reels API ที่ใช้สร้าง native product link |
| E. Shopee affiliate product linking | **NOT_VERIFIED** | เก็บ/ส่ง Shopee Affiliate URL เดิมได้ในฐานะ text; ยังไม่มีหลักฐานว่าบัญชี/ประเทศ/Page/สินค้าเข้าเงื่อนไข Meta partner linking ของ Shopee |
| F. Native product tagging | **SUPPORTED_UI_ONLY** | Meta ระบุเลือกและ link affiliate product จาก composer. ไม่พบ API parameter สำหรับ product tagging ใน Page **video_reels** reference |
| G. Paid Partnership/commercial label | **SUPPORTED_UI_ONLY** | Meta lesson ระบุ toggle Paid Partnership ใน composer. Reels API ที่ตรวจไม่มี field นี้; ห้ามใช้ **is_ai_generated** แทน commercial disclosure |
| H. Tracking/attribution | **REQUIRES_PARTNER_ACCESS** | Meta ระบุ commission/ผลการทำงานผ่าน partner affiliate programme; attribution ขึ้นกับ eligibility และ partner terms. ระบบปัจจุบันไม่มี conversion/commission integration |

แหล่ง Meta: [Facebook affiliate partnerships](https://en-gb.facebook.com/business/learn/lessons/facebook-affiliate-partnerships) ระบุ native product linking, eligibility และการ auto-detect จาก caption/top-level comment ที่ใช้ได้ใน Facebook app เท่านั้น; [Reels API](https://developers.facebook.com/documentation/video-api/guides/reels-publishing); [Comment API](https://developers.facebook.com/docs/graph-api/reference/object/comments/).

สำหรับ critical requirement ที่ผู้ชมต้องคลิกแล้วเกิด attribution ได้จริง ให้เริ่มด้วย manual handoff ใน Facebook app เพื่อเลือก native product/ตรวจป้าย Affiliate และให้ผู้ใช้ยืนยันการแสดงผล. ถ้าส่ง URL ผ่าน API เป็น fallback ต้องแสดงว่าเป็น plain URL และยังไม่ยืนยัน clickability/attribution; อย่าเปลี่ยน tracking parameters.

## 8. Existing Components to Reuse

| ส่วนที่ reuse | สถานะ | หลักฐาน |
|---|---|---|
| Auto Review run/result API และ tenant/user checks | **IMPLEMENTED_NOT_RUNTIME_VERIFIED** | **marketplaceCapture.ts:1489-1517**; **marketplaceAutoReviewService.ts:19730-19762** |
| Caption, hashtag และ Affiliate display card | **VERIFIED_RUNTIME** | **StagedSocialCaptionComposer.tsx:129-162**, **437-488**; ปัจจุบัน Caption/Hashtag เป็น read-only |
| Social Channels OAuth/Page chooser/reconnect settings | **IMPLEMENTED_NOT_RUNTIME_VERIFIED** | **SocialChannels.tsx:310-345**, **523-545**, **620-679** |
| Existing **social_posts** draft/history/content/link/media/providerPostId | **IMPLEMENTED_NOT_RUNTIME_VERIFIED** | **schema.ts:23975-24011**; **SocialPublishing.tsx:55-125** |
| Generic feed publisher และ **MetaGraphClient** | **IMPLEMENTED_NOT_RUNTIME_VERIFIED** สำหรับ Page feed เท่านั้น | **publish_service.py:147-180**; **meta_graph_client.py:203-215** |
| Worker jobs, outbox, progress, retry/cancel และ Task Control | **IMPLEMENTED_NOT_RUNTIME_VERIFIED** | **schema.ts:17091-17210**, **17875-17931**; **routers/workerJobs.ts:70-120**, **197-212** |
| Credential storage ใหม่ | **NOT_REQUIRED** | ใช้ **social_provider_connections** / **social_pages**; ไม่สร้าง connector/token store ซ้ำ |

SPEC 301 ทำ Caption/รูปภาพใน Auto Review แต่ระบุ publishing เป็น non-goal. SPEC 058 ระบุระบบ Page post draft/schedule/publish เป็น social feed publishing; ไม่ได้ออกแบบ Reels (**specs/feature/058-meta-channels/sections/section-09-publishing.md:8-10**, **63-92**).

## 9. Missing Functions

รายการที่ต้องพัฒนาก่อน Phase A:

- Reels adapter: start, chunked upload, resume, poll, finish, **is_ai_generated**; ห้ามเรียก **create_post()** เพื่อแทน Reel.
- Secure artifact resolver ที่ผูก **runId** และ artifact ID ฝั่ง server แล้ว stream private MP4 ไป Meta; ห้ามรับ arbitrary media URL จาก client.
- Media preflight/probe เทียบ codec, aspect, duration, resolution, frame/audio settings กับ Meta limits.
- Publishing intent ที่ deterministic และ worker job แยกจาก Auto Review; persist upload/video/post ID ก่อน retry.
- Reconciliation path เมื่อ request timeout หลัง Meta อาจรับ upload/publish แล้ว; ตรวจสถานะ/remote IDs ก่อน retry เพื่อกันโพสต์ซ้ำ.
- Page token live validity, actual permission และ Page task check; handle revoked/expired token เป็น reconnect state.
- Social post receipt รวม Auto Review run/artifact, worker ID, upload state, external video/post IDs และ permalink เมื่อ API คืนค่า.
- UI สำหรับ caption/hashtags editor, disclosure controls, Reel preview, status/history/retry/View on Facebook และ Affiliate limitation/manual handoff.
- ข้อกำหนด Meta native Affiliate / Shopee partner eligibility และการยืนยัน click-through/attribution.

## 10. Required Database Changes

**Phase A ไม่จำเป็นต้องเพิ่ม credential table, artifact table หรือ publishing queue ใหม่.** ตารางที่มีรองรับข้อมูลส่วนใหญ่แล้ว:

- ส่ง **tenantId**, **requestedByUserId**, **jobType**, deterministic **idempotencyKey**, **inputJson**, **progressJson**, **outputJson**, **scheduledAt** ลง canonical **worker_jobs**; insert outbox ผ่านกลไก enqueue ที่มีอยู่.
- ใช้ **social_posts** เก็บ draft/status/caption/link/media ref/providerPostId/metadata. เพิ่ม namespace ใน **metadata** สำหรับ **autoReviewRunId**, **finalArtifactId**, **renderWorkerJobId**, **publishWorkerJobId**, **intentHash**, **metaUploadSessionId**, **metaVideoId**, **metaPostId**, **permalink**, **aiDisclosure**, **affiliateMode** และ receipt/reconciliation timestamps.
- ใช้ artifact ID/storage key เป็นตัวอ้างอิงภายใน; อย่าใส่ private bearer URL ลง public post text หรือ event.
- กำหนด **idempotencyKey** แบบ deterministic จาก tenant + page + run + artifact checksum + content snapshot + publish intent; retry เดิมต้องใช้ intent key เดิม. DB มี unique index **(tenantId,idempotencyKey)** อยู่แล้ว (**schema.ts:17161-17195**).

อาจเพิ่ม typed columns/index ในภายหลังถ้าต้อง query history ตาม **autoReviewRunId**/**intentHash** โดยตรง. ก่อนเพิ่ม migration ให้ยืนยันว่า **social_posts.metadata** ไม่เพียงพอ และกำหนด foreign-key/retention behavior ของ Auto Review artifact ให้ชัด.

## 11. Required API Routes

เพิ่ม protected routes ใน namespace ใหม่หรือแยกย่อยของ **marketplaceCapture**:

1. **getFacebookPublishingReadiness(runId)** — ยืนยัน completed run, final artifact, owner/tenant, selected Page, token health, scopes/task, format และ Affiliate placement caveat.
2. **createFacebookReelPublishIntent(runId, pageId, caption, hashtags, affiliateMode, disclosure)** — snapshot content; validate permission/compliance; สร้าง/คืน intent และ canonical worker job โดย idempotency.
3. **getFacebookReelPublishStatus(publishJobId)** — อ่าน run/job stages และ safe external receipt.
4. **retryFacebookReelPublish(publishJobId)** — ทำได้หลัง reconcile; ใช้ intent เดิมและห้ามสร้าง post ใหม่เมื่อสถานะคลุมเครือ.
5. **cancelScheduledFacebookReel(publishJobId)** — ใช้ก่อน external publish side effect; หลังส่ง finish ไป Meta ต้องแจ้งสถานะที่ยกเลิกไม่ได้ถ้า API ไม่รองรับ.
6. **listAutoReviewSocialPosts(runId)** — ประวัติเฉพาะ run ภายใต้ tenant/user.

Routes ใช้ Page access service เดิม (**socialAccessService.ts:24-85**) และไม่รับ token, storage URL หรือ external upload URL จาก browser.

## 12. Required UI Changes

เพิ่ม card “Facebook Reel Publishing” ต่อจาก Caption/Affiliate ในหน้า Auto Review เดิม; ใช้ส่วนประกอบปัจจุบัน ไม่ redesign page:

- แสดง Page ที่เลือก/สถานะเชื่อมต่อ, Connect/Reconnect ผ่าน **SocialChannels**.
- Preview MP4 เดิมจาก artifact read endpoint; ไม่ render ใหม่.
- Editor ของ Caption/Hashtag ที่แก้ได้เฉพาะ snapshot โพสต์ ไม่เขียนทับ Caption ต้นฉบับของ run.
- แสดง Affiliate URL เดิมแบบไม่แก้ tracking พร้อมตัวเลือก description/comment/manual handoff ตามความสามารถที่ตรวจแล้ว.
- แสดง AI-generated disclosure แบบแจ้งผู้ใช้และส่งค่า API **is_ai_generated=true** เมื่อเข้าเงื่อนไข; แยกจาก Paid Partnership.
- Preview ข้อความโพสต์พร้อมลิงก์/ป้าย disclosure และคำเตือนเรื่อง native Affiliate clickability.
- Publish Now, Schedule, Auto Post policy (Phase C เท่านั้น), state/progress, Retry, View on Facebook เมื่อมี permalink และ history.
- ปิดปุ่ม publish จน run/artifact ผ่าน finalization และ Page/permission/preflight พร้อม.

Caption card ปัจจุบันแสดง Caption และ Hashtag แบบ read-only และ Affiliate link แยกด้านล่าง (**StagedSocialCaptionComposer.tsx:437-488**); SocialPublishing page มี page selector, draft/schedule/history patterns ให้นำกลับมาใช้ (**SocialPublishing.tsx:55-125**).

## 13. Worker and Scheduler Integration

- สร้าง publishing job คนละ row กับ **marketplace.auto_review.execute**; payload ต้องมี Auto Review run ID, final video artifact ID/checksum, Page ID, content snapshot/hash, affiliate mode, disclosure state, user/tenant และ deterministic intent.
- ใช้ **worker_jobs** + **worker_job_outbox**; ห้ามใช้ **marketplace_auto_review_outbox_jobs** หรือ legacy workflow engine เป็นคิว social ใหม่.
- Progress stages แนะนำ: **preflight → token_check → upload_session_started → uploading → processing → publish_requested → reconciling → published/needs_user_action/failed**.
- บันทึก session/video IDs ทันทีที่ API คืน; เก็บ upload offset/status; ก่อน retry หลัง timeout ให้เรียก Meta status/list/read path แล้ว reconcile. ห้ามสร้าง session/post ใหม่โดยไม่ตรวจ side effect เดิม.
- ใช้ worker retry เฉพาะ network/transient/rate limit ตาม **Retry-After**; permission/content/invalid-token เป็น terminal หรือ **needs_reconnect**. 30 posts/rolling 24h ต้อง guard ระดับ Page.
- Phase B ให้ **worker_jobs.scheduledAt** ควบคุมเวลาและยกเลิกได้ก่อน publish. อย่าส่ง Reel เข้าสถานะ Meta scheduled จนกว่าจะพิสูจน์ว่ามี API cancellation/reconciliation ที่ต้องการ.
- ใช้ **workerJobs.list/detail/cancelQueued/retry** เพื่อให้ Task Control เห็นงาน (**apps/web/server/routers/workerJobs.ts:70-120**, **197-212**). Retry mutation ต้องถูกห่อด้วย publish-specific preflight/reconcile ไม่เรียก blind retry.
- Python social scheduler ปัจจุบันสแกน **social_posts.status='scheduled'** และลงทะเบียน task ผ่าน **job_task_registry** (**python-backend/app/tasks/social_publish_task.py:42-77**, **263-274**); **schedulePublishingPost** เปลี่ยน row เป็น scheduled (**socialPublishingService.ts:708-782**). เส้นทางนี้เป็นของ Page post เดิม ไม่ควรเป็น Reels control plane ตัวใหม่.

## 14. Security and Tenant Isolation

- ใช้ authenticated user/tenant จาก server context ทุก route; ตรวจ run, product, artifact, social Page, connection และ publishing job ภายใน tenant/user เดียวกัน.
- **socialAccessService.verifyPageAccess** ตรวจ **socialPages.tenantId**, connection tenant และ connection user (**socialAccessService.ts:24-85**). คงเงื่อนไขเหล่านี้ทุกครั้งที่โหลด Page token.
- Affiliate query ปัจจุบัน filter **productId** และ **userId** แต่ไม่ได้ filter **tenantId** (**marketplaceAutoReviewStagedCheckpointRouterService.ts:880-906**). เพิ่ม tenant condition เพื่อให้ตรง schema/tenant contract แม้ product ID เป็น FK.
- ถอดรหัส token เฉพาะ worker ฝั่ง server; redact token จาก logs/errors/events. ตรวจ token จริงกับ Meta ก่อน upload; อย่าถือว่า ciphertext/expiry null แปลว่า token ยัง valid.
- Resolve final MP4 จาก Auto Review/render artifact ID ที่ authorized แล้วเท่านั้น. อ่าน private R2 ผ่าน storage client และส่ง raw chunks ไป rupload; หลีกเลี่ยง public URL/presigned URL และไม่ fetch client-provided URL.
- ยืนยันไฟล์/ขนาด/format ก่อน upload; จำกัด egress ไป storage ที่กำหนดและ Meta hosts; จัดการ token ใน Authorization header ไม่ใส่ query/log.
- Social failure/retry/cancel ห้ามเปลี่ยน **marketplace_auto_review_runs**, ลบ Library item หรือเริ่ม generation/render ใหม่. เก็บ exact Affiliate URL และ tracking parameters.

## 15. Meta App Configuration Requirements

- ตั้ง Meta App ID/Secret ใน secret store/runtime settings ที่ Python backend อ่านได้; ตั้ง callback URI ให้ตรง App Dashboard และ **META_GRAPH_API_VERSION** ให้ตรง version ที่เลือก. ไม่บันทึกค่า config ลงรายงาน.
- runtime ปัจจุบันไม่มี App ID/Secret ที่มีผล และ **META_CHANNELS_ENABLED=false**; system settings มี Graph version **v25.0**, ขณะที่ Meta docs ปัจจุบันระบุ **v27.0**. การ authorize จึงคืน not-configured/ไม่ผ่าน feature gate.
- สำหรับ owner-only test ใช้ app-role user/test Page; Meta ระบุ app ที่ใช้เฉพาะ app-role users ไม่ต้องผ่าน App Review. สำหรับ multi-tenant commercial users ต้องขอ Advanced Access/App Review ตาม permission/feature ที่ใช้ พร้อม screen recording และ data-handling disclosures. [Meta App Review](https://developers.facebook.com/docs/resp-plat-initiatives/app-review/introduction)
- ขอ permissions แบบจำกัด: Reel **pages_show_list**, **pages_read_engagement**, **pages_manage_posts**; first comment เพิ่ม **pages_manage_engagement**. ผู้ใช้ต้องมี Page task **CREATE_CONTENT**; comment API ต้องมี **MODERATE**.
- ต้องให้ App Owner ยืนยันสิทธิ์ app/Page, data deletion/privacy callback และ App Review status ก่อนเปิด feature flag ให้ tenant.

## 16. Implementation Plan Phase A–E

| Phase | งาน/สถานะปัจจุบัน | Exit criteria |
|---|---|---|
| A — Publish Now จาก run เดียว | **NOT_FOUND**: สร้าง secure Reels uploader/worker, readiness route, Page picker, preview/editor, disclosure, receipt/reconcile และ manual Affiliate handoff | Test Page โพสต์จาก artifact เดิมได้, API state verified, ไม่ duplicate, เปิดลิงก์ตามเงื่อนไขจริง, Auto Review/Library ไม่เปลี่ยนเมื่อ Social ล้มเหลว |
| B — Scheduled Publishing | **PARTIAL**: Page feed เดิมมี schedule; ไม่มี Reels schedule intent/worker | ใช้ canonical **worker_jobs.scheduledAt**; cancellation ก่อน publish, rate limit และ due-time retry ทำงาน |
| C — Auto Post when review completes | **NOT_FOUND** | ผู้ใช้ opt-in policy ชัดเจน; trigger หลัง run และ final artifact completed เท่านั้น; pause/cancel/edit ได้; failure ไม่ย้อนสถานะ Auto Review |
| D — Batch Publishing | **NOT_FOUND** | สร้าง intent ต่อแต่ละ run/Page/artifact แยกกัน; per-item failure/retry; limit/rate guard; user preview/approve ก่อน dispatch |
| E — Analytics/Affiliate performance | **BLOCKED_EXTERNAL** จนกว่าจะมี Meta/affiliate partner access และ API data access ที่ยืนยันได้ | อ่าน/จัดเก็บเฉพาะ metrics ที่ partner/API ให้; แยก Meta insights ออกจาก Affiliate conversion/commission จริง |

เริ่ม Phase A หลัง runtime configuration และ owner-only test Page พร้อม. ไม่ทำ Social Publishing Studio ใหม่ และไม่สร้าง caption หรือ video ใหม่เมื่อ artifact พร้อม.

## 17. Phase A Acceptance Test Plan

แผนสำหรับอนาคตเท่านั้น; **ยังไม่ได้รัน** และห้ามใช้ Page สาธารณะจริงจนกว่าจะกำหนด test Page และอนุญาตการเผยแพร่:

1. เลือก run ที่ **completed**, มี final artifact ID/checksum และ Library item; ปฏิเสธ run ที่ยัง **waiting_provider**.
2. อ่าน artifact เดิมจาก run เดิม; ตรวจว่าไม่มีการสร้าง Remotion/render job ใหม่.
3. โหลด Caption/Hashtags จาก structured metadata; แก้เฉพาะ post snapshot; ตรวจว่า source run ไม่เปลี่ยน.
4. โหลด Affiliate URL จาก product/user/tenant ที่ถูกต้อง; เปรียบเทียบ URL แบบ byte-for-byte ก่อน/หลัง ไม่มี tracking rewrite.
5. เลือก Facebook Page ที่เชื่อมต่อแล้ว; ยืนยัน tenant/user ownership, actual granted scopes, Page task และ token ที่ยัง valid.
6. Preview video/caption/hashtags/link/disclosure ให้ตรงกับ request; แสดงเตือนเมื่อ Affiliate URL เป็นเพียง text หรือ native tag ต้องทำใน Facebook app.
7. Probe MIME, codec, ratio, dimensions, duration, FPS และ audio; ปฏิเสธเฉพาะ publishing job เมื่อไม่ผ่าน.
8. ส่ง MP4 เดิมผ่าน Reels upload session/chunked binary API; ตรวจ bytes/offset, resume และไม่มีการเปิด private artifact เป็นสาธารณะ.
9. ตั้ง **is_ai_generated** ตาม metadata/disclosure decision และตรวจ Meta processing status จนพร้อม; แสดง actionable error เมื่อ Meta ปฏิเสธ.
10. Finish publish แล้วบันทึก video ID/post ID, status และ permalink เฉพาะเมื่อ Meta ส่ง/ยืนยันค่าจริง; ตรวจ published state จาก supported endpoint.
11. ตรวจจาก viewer/mobile test account ว่า Reel เปิดได้, Affiliate URL กดได้และไป landing product ถูกตัว, attribution/commission เกิดตาม partner UI; บันทึกผลจริงแยกจาก API success.
12. ทดสอบ first comment เฉพาะเมื่อต้องใช้และมี **pages_manage_engagement** + **MODERATE**; ยืนยันว่าผู้ชมกด URL ได้. Pin ต้อง handoff UI ถ้าไม่มี API.
13. กด publish ซ้ำ/ส่ง timeout หลัง Meta รับงานแล้ว; worker ต้อง reconcile และห้ามโพสต์ซ้ำ. ทดสอบ rate limit, revoked token, retry/cancel, cross-tenant denial และ safe error/log redaction.
14. จำลอง Meta/downstream failure หลัง Auto Review จบ; assert run, MP4, Library, Caption/Hashtags และ Affiliate ยังคงใช้งานได้; retry ต้องเป็น publishing job เดิม ไม่ render ใหม่.

## 18. External Blockers

- DEV tenant ยังปิด Meta Channels; Meta App ID/Secret ไม่ configured และไม่มี Page connection ใน runtime. ต้องตั้งค่าโดยเจ้าของ Meta App/runtime ก่อน owner-only OAuth test.
- ยังไม่มีหลักฐาน App Review/Advanced Access. Owner-only app-role testing ต่างจากการเปิดให้ลูกค้าหลาย tenant; multi-tenant ต้องมี Meta อนุมัติ permissions/features ที่เกี่ยวข้อง.
- ยังไม่ยืนยันว่า Facebook affiliate partnership/Shopee partner program เปิดให้ Page, region และสินค้านี้หรือไม่; สิทธิ์นี้อยู่นอก source/repo.
- Graph API Reel list behavior ใน guide กับ Page Video Reels reference ไม่ตรงกัน; permalink field/URL สำหรับ Reel ต้องยืนยันกับ Meta App test ก่อนรับรอง “View on Facebook”.
- ยังไม่มีเจ้าของกำหนด test Page/การเผยแพร่จริงสำหรับ acceptance. การ audit นี้ไม่ได้โพสต์และไม่ได้ใช้ browser automation.

## 19. Readiness Verdict

**สถานะระบบโดยรวม: PARTIAL. สถานะการเริ่ม publish บน runtime ที่ตรวจ: BLOCKED_EXTERNAL.**

- ข้อมูลสินค้า, Affiliate URL, Caption/Hashtag และ MP4 ที่ Remotion สร้าง มีหลักฐาน **VERIFIED_RUNTIME** สำหรับ run ตัวอย่าง.
- Final Auto Review/Library ยังไม่ completed สำหรับ run นี้; ห้ามแสดงเป็น “พร้อมเผยแพร่” จน finalization ผ่าน.
- OAuth/Page connection/storage และ Page feed publishing มี implementation; token validity, granted permissions, App Review และ runtime behavior ยังไม่ยืนยัน.
- Facebook Reels publishing ไม่มี implementation; ต้องเพิ่ม adapter/worker/reconciliation และ UI เฉพาะที่เล็กที่สุด.
- URL text อาจส่งใน description/comment ได้ แต่ native affiliate tagging, clickability และ attribution ยังไม่รับรองผ่าน API. สำหรับ requirement ทางธุรกิจ ให้ manual handoff ไป Facebook app หรือรอผลทดสอบ native partner integration.
- ไม่มี application code, migration, runtime data หรือโพสต์จริงเปลี่ยนแปลงจาก audit นี้. เพิ่มเฉพาะรายงานไฟล์นี้; tests ไม่ได้รัน.
