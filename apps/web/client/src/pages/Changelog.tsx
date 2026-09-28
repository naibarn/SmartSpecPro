import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import ContentPage from "./ContentPage";

const defaultBodyEn = `<h2>Latest Updates</h2>

<h3>August 24, 2026</h3>
<p><strong>Public Contact Protection &amp; Admin Setup</strong> — SmartAIHub now has a safer, clearer way to receive messages from visitors who have not signed up yet.</p>
<ul>
<li><strong>Anonymous Contact</strong> — Visitors can contact SmartAIHub before creating an account, while their message is still routed into the Admin Feedback Hub.</li>
<li><strong>Cloudflare Turnstile Verification</strong> — Anonymous submissions are verified on the server with action and hostname checks before a ticket is created.</li>
<li><strong>Layered Anti-Spam Protection</strong> — Added rate limits, replay protection, honeypot checks, form-timing checks, and suspicious payload/link detection. Production rejects anonymous submissions when protection is incomplete.</li>
<li><strong>Admin Contact Protection Panel</strong> — Admins can configure the Turnstile Site Key, Secret Key, and allowed hostnames from Admin Settings without exposing the secret to the browser.</li>
<li><strong>Admin Go-Live Checklist</strong> — The UI now explains where to obtain each key, which values belong on the server, how to save the settings, and how to test the public form in an Incognito window.</li>
<li><strong>Secure Settings Storage</strong> — The Turnstile secret is encrypted before being stored. <code>LLM_ENCRYPTION_KEY</code> and Redis remain server-side infrastructure settings.</li>
<li><strong>Feedback Routing</strong> — Public messages are delivered only to SmartAIHub Admins. Sales &amp; Enterprise requests are marked urgent for faster follow-up.</li>
<li><strong>Contact Information</strong> — Updated the public contact details to <a href="mailto:smartaihubapp@gmail.com">smartaihubapp@gmail.com</a>, Nakhon Ratchasima, Thailand, Line support, and the current Facebook support and announcement links.</li>
</ul>
<p><strong>Verification:</strong> Focused security and routing tests passed, and the production web and widget builds completed successfully.</p>

<h3>January 2026</h3>
<ul>
<li><strong>Documentation Sub-Pages</strong> — Added comprehensive documentation covering all platform features, from getting started to security best practices.</li>
<li><strong>Theme Presets</strong> — Domain admins can now apply pre-built theme presets for quick customization.</li>
<li><strong>Content Editor Improvements</strong> — Enhanced the domain admin content editor with better defaults and instant cache clearing.</li>
</ul>

<h3>December 2025</h3>
<ul>
<li><strong>Multi-Tenant Enhancements</strong> — Improved tenant isolation, custom domain support, and per-tenant branding.</li>
<li><strong>Media Studio</strong> — Unified workspace for image, video, and audio generation.</li>
<li><strong>Skill System</strong> — Auto-sync skill detection for media generation capabilities.</li>
</ul>

<h3>November 2025</h3>
<ul>
<li><strong>Flexible Pricing Tiers</strong> — Added subscription, agency, and one-time credit packages.</li>
<li><strong>LLM Model Management</strong> — Dynamic model controls and provider configuration.</li>
<li><strong>Gallery System</strong> — Public gallery with views, likes, and download tracking.</li>
</ul>

<p>For the full changelog and release notes, check our <a href="/blog">blog</a>.</p>`;

const defaultBodyTh = `<h2>อัปเดตล่าสุด</h2>

<h3>24 สิงหาคม 2026</h3>
<p><strong>การป้องกัน Contact สาธารณะและการตั้งค่าสำหรับ Admin</strong> — SmartAIHub เพิ่มวิธีรับข้อความจากผู้เยี่ยมชมที่ยังไม่ได้สมัครสมาชิกให้ปลอดภัยและตั้งค่าได้ชัดเจนขึ้น</p>
<ul>
<li><strong>รับข้อความจากผู้เยี่ยมชม</strong> — ผู้เยี่ยมชมสามารถติดต่อ SmartAIHub ได้ก่อนสร้างบัญชี และข้อความจะถูกส่งเข้า Feedback Hub ของ Admin</li>
<li><strong>ตรวจสอบด้วย Cloudflare Turnstile</strong> — ระบบตรวจสอบ anonymous submission ฝั่ง server พร้อมตรวจ action และ hostname ก่อนสร้าง ticket</li>
<li><strong>ป้องกันสแปมหลายชั้น</strong> — เพิ่ม rate limit, replay protection, honeypot, ตรวจเวลาการกรอกฟอร์ม และตรวจ payload/link ที่ผิดปกติ หาก production ตั้งค่าไม่ครบ ระบบจะปฏิเสธ anonymous submission</li>
<li><strong>หน้า Contact Protection สำหรับ Admin</strong> — Admin ตั้งค่า Site Key, Secret Key และ allowed hostnames ได้จากหน้า Admin Settings โดยไม่เปิดเผย Secret Key ให้ browser</li>
<li><strong>Checklist ก่อนเปิดใช้งาน</strong> — UI อธิบายว่าต้องขอรหัสจากที่ไหน ค่าใดต้องตั้งบน server วิธีบันทึกค่า และวิธีทดสอบฟอร์มผ่านหน้าต่าง Incognito</li>
<li><strong>จัดเก็บค่าความลับอย่างปลอดภัย</strong> — Secret Key ถูกเข้ารหัสก่อนบันทึก ส่วน <code>LLM_ENCRYPTION_KEY</code> และ Redis ยังคงเป็นค่าระดับ infrastructure บน server</li>
<li><strong>การส่งต่อ Feedback</strong> — ข้อความจาก public site ส่งถึงเฉพาะ Admin ของ SmartAIHub และคำขอ Sales &amp; Enterprise จะถูกจัดเป็นงานเร่งด่วน</li>
<li><strong>ข้อมูลการติดต่อ</strong> — ปรับเป็น <a href="mailto:smartaihubapp@gmail.com">smartaihubapp@gmail.com</a>, Nakhon Ratchasima, Thailand, ติดต่อผ่าน Line และลิงก์ Facebook กลุ่ม Support/เพจประชาสัมพันธ์ปัจจุบัน</li>
</ul>
<p><strong>การตรวจสอบ:</strong> ชุดทดสอบด้านความปลอดภัยและการส่งต่อข้อความผ่านแล้ว รวมถึง production build ของเว็บและ widget</p>

<h3>มกราคม 2026</h3>
<ul>
<li><strong>Documentation Sub-Pages</strong> — เพิ่มเอกสารครอบคลุมฟังก์ชันของระบบ ตั้งแต่เริ่มต้นใช้งานจนถึงแนวทางด้านความปลอดภัย</li>
<li><strong>Theme Presets</strong> — Domain admin เลือกใช้ชุดธีมสำเร็จรูปเพื่อปรับแต่งระบบได้รวดเร็วขึ้น</li>
<li><strong>Content Editor Improvements</strong> — ปรับปรุง Content Editor สำหรับ domain admin พร้อมค่าเริ่มต้นและการล้าง cache ที่ดีขึ้น</li>
</ul>

<h3>ธันวาคม 2025</h3>
<ul>
<li><strong>Multi-Tenant Enhancements</strong> — ปรับปรุงการแยกข้อมูลระหว่าง tenant, custom domain และ branding ราย tenant</li>
<li><strong>Media Studio</strong> — รวม workspace สำหรับสร้างภาพ วิดีโอ และเสียง</li>
<li><strong>Skill System</strong> — ตรวจจับและ sync skills ที่รองรับความสามารถด้าน media generation โดยอัตโนมัติ</li>
</ul>

<h3>พฤศจิกายน 2025</h3>
<ul>
<li><strong>Flexible Pricing Tiers</strong> — เพิ่มแพ็กเกจ subscription, agency และ credit แบบซื้อครั้งเดียว</li>
<li><strong>LLM Model Management</strong> — เพิ่มการควบคุม model และ provider แบบ dynamic</li>
<li><strong>Gallery System</strong> — เพิ่ม public gallery พร้อมสถิติการดู การกดถูกใจ และการดาวน์โหลด</li>
</ul>

<p>ดูรายละเอียดเพิ่มเติมได้ที่ <a href="/blog">Blog</a></p>`;

export default function Changelog() {
  const { i18n } = useTranslation();
  const isThai = (i18n.resolvedLanguage || i18n.language || "en").startsWith(
    "th"
  );

  return (
    <ContentPage
      pageKey="changelog"
      defaultTitle={isThai ? "ประวัติการอัปเดต" : "Changelog"}
      defaultBody={isThai ? defaultBodyTh : defaultBodyEn}
      useTenantContent={false}
      icon={FileText}
      badge={isThai ? "อัปเดตระบบ" : "Updates"}
      gradientFrom="blue-500"
      gradientTo="cyan-500"
    />
  );
}
