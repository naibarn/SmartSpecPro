import type { Locale } from "./i18n/types";

export type LegalIcon =
  | "shield"
  | "database"
  | "eye"
  | "globe"
  | "lock"
  | "user"
  | "bell"
  | "file"
  | "alert"
  | "scale"
  | "clock";

export type LegalBlock =
  | { type: "paragraph"; text: string }
  | { type: "subheading"; text: string }
  | { type: "list"; items: string[] };

export type LegalSection = {
  id: string;
  title: string;
  icon: LegalIcon;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  kind: "privacy" | "terms";
  title: string;
  metaTitle: string;
  metaDescription: string;
  summary: string;
  lastUpdated: string;
  tableOfContents: string;
  backToHome: string;
  highlights?: Array<{ icon: LegalIcon; text: string }>;
  sections: LegalSection[];
  acknowledgement: string;
  relatedTerms: string;
  relatedPrivacy: string;
  contactLink: string;
};

export const LEGAL_CONTACT = {
  controller: "Smart AI Hub Team",
  email: "smartaihubapp@gmail.com",
  location: "Nakhon Ratchasima, Thailand",
  responseTarget: "within 24 hours during business days",
  contactUrl: "/contact",
  lineUrl: "https://line.me/ti/p/SbZEQeRa6W",
} as const;

const p = (text: string): LegalBlock => ({ type: "paragraph", text });
const list = (...items: string[]): LegalBlock => ({ type: "list", items });

const privacyEn: LegalDocument = {
  kind: "privacy",
  title: "Privacy Policy",
  metaTitle: "Privacy Policy | SmartAIHub",
  metaDescription:
    "Learn how SmartAIHub collects, uses, shares, protects, and deletes personal data.",
  summary:
    "This Privacy Policy explains how SmartAIHub handles personal data when you visit, create an account, contact us, or use our services.",
  lastUpdated: "August 24, 2026",
  tableOfContents: "Table of Contents",
  backToHome: "Back to Home",
  highlights: [
    {
      icon: "lock",
      text: "We collect data for stated service and support purposes.",
    },
    {
      icon: "user",
      text: "You can ask about, correct, or delete your personal data.",
    },
    {
      icon: "globe",
      text: "We do not sell personal data for third-party marketing.",
    },
    {
      icon: "database",
      text: "We keep data only for as long as it is needed or required.",
    },
  ],
  sections: [
    {
      id: "scope",
      title: "1. Scope and Introduction",
      icon: "shield",
      blocks: [
        p(
          'SmartAIHub is operated by Smart AI Hub Team ("we", "us", or "our"). This Privacy Policy applies to personal data collected through the SmartAIHub website, account and workspace features, support channels, and related services that link to this policy.'
        ),
        p(
          "We process personal data in accordance with applicable law, including Thailand's Personal Data Protection Act B.E. 2562 (PDPA), as applicable to the relevant processing activity. This policy describes our current practices and may be updated when the service or our legal obligations change."
        ),
      ],
    },
    {
      id: "controller",
      title: "2. Controller and Contact Details",
      icon: "user",
      blocks: [
        p(
          "The current data controller and service operator identified for this website is Smart AI Hub Team."
        ),
        list(
          "Email: smartaihubapp@gmail.com",
          "Contact page: https://smartaihub.app/contact",
          "Contact location: Nakhon Ratchasima, Thailand",
          "Typical response target: within 24 hours during business days"
        ),
        p(
          "The contact location above is provided for general contact purposes. It is not presented as a registered office or legal service address. We will update this section when the responsible legal entity and statutory address are confirmed."
        ),
      ],
    },
    {
      id: "data-we-collect",
      title: "3. Personal Data We Collect",
      icon: "database",
      blocks: [
        p(
          "Depending on how you interact with SmartAIHub, we may collect the following categories of personal data:"
        ),
        list(
          "Identity and contact data, such as name, email address, company information, and messages you send to us.",
          "Account and workspace data, such as authentication details, preferences, organization or workspace membership, and settings.",
          "Content and files that you choose to submit, upload, store, or process through the service, including prompts, instructions, references, and generated outputs.",
          "Transaction and usage data needed to provide paid features, credits, usage records, support, fraud prevention, and accounting where applicable.",
          "Technical and security data, such as IP address, device and browser information, session identifiers, error details, and activity logs."
        ),
        p(
          "Please do not submit sensitive personal data, confidential information belonging to another person, or information that you are not authorized to provide unless the service specifically requires it and you have a lawful basis to do so."
        ),
      ],
    },
    {
      id: "collection-sources",
      title: "4. How We Collect Data",
      icon: "eye",
      blocks: [
        p("We may obtain personal data from:"),
        list(
          "You, when you register, use the service, submit content, contact support, or complete a form.",
          "Your organization or an administrator, when they provision access or manage a shared workspace.",
          "Your browser, device, and our systems, through essential cookies, session storage, security controls, and service logs.",
          "Service providers that help us authenticate, host, deliver, secure, or support the service, where permitted by law."
        ),
      ],
    },
    {
      id: "purposes-and-bases",
      title: "5. Purposes and Processing Bases",
      icon: "scale",
      blocks: [
        p(
          "We use personal data only for purposes that are relevant to the service and the relationship with you, including:"
        ),
        list(
          "Creating and securing accounts, authenticating users, and providing workspace features.",
          "Processing prompts, files, requests, and outputs that you ask the service to handle.",
          "Providing support, responding to inquiries, and communicating service or security notices.",
          "Managing credits, paid features, transactions, accounting, abuse prevention, and service integrity where applicable.",
          "Monitoring reliability, troubleshooting errors, improving the service, and developing features using appropriate safeguards.",
          "Complying with legal obligations, responding to lawful requests, and protecting rights, safety, and property."
        ),
        p(
          "The applicable legal basis depends on the purpose and circumstances. It may include performance of a contract, legitimate interests, compliance with a legal obligation, or consent when consent is required or appropriate. If we rely on consent, you may withdraw it, but withdrawal does not affect processing already carried out lawfully."
        ),
      ],
    },
    {
      id: "ai-and-content",
      title: "6. Prompts, Files, and AI-Generated Content",
      icon: "eye",
      blocks: [
        p(
          "SmartAIHub may process prompts, instructions, uploaded references, project information, and generated results to provide the features you request. The exact processing depends on the workflow, model, integration, and settings that you choose."
        ),
        p(
          "You are responsible for ensuring that you have the right to submit the content and that your instructions do not contain information that you are prohibited from sharing. Do not use the service as a substitute for professional advice or as the sole control for high-impact decisions."
        ),
        p(
          "We do not state that user content is used to train third-party or SmartAIHub models unless the relevant product feature or consent notice expressly says so. Where an external provider is involved, its own data policy may also apply."
        ),
      ],
    },
    {
      id: "sharing-and-transfers",
      title: "7. Disclosure and International Transfers",
      icon: "globe",
      blocks: [
        p(
          "We may disclose or make personal data available to the following categories of recipients when necessary for the stated purposes:"
        ),
        list(
          "Hosting, storage, infrastructure, security, communications, analytics, support, and payment service providers that process data on our behalf.",
          "Your organization, workspace administrators, or collaborators when the relevant feature and permissions allow it.",
          "Government agencies, regulators, courts, advisers, or other persons when disclosure is required or permitted by law.",
          "A successor or transaction party if the service or relevant assets are reorganized, transferred, or acquired, subject to applicable safeguards."
        ),
        p(
          "Some providers may process data outside Thailand. Before making a transfer, we will apply safeguards and contractual or other measures required by applicable law. We do not sell, rent, or trade personal data for third-party marketing."
        ),
      ],
    },
    {
      id: "retention",
      title: "8. Retention and Deletion",
      icon: "database",
      blocks: [
        p(
          "We retain personal data for as long as reasonably necessary for the purpose for which it was collected, while your account or relationship remains active, or as required for legal, accounting, security, dispute-resolution, and enforcement purposes."
        ),
        list(
          "When data is no longer needed, we will delete, anonymize, or securely isolate it in accordance with our operational and legal requirements.",
          "Backups and security logs may remain for a limited period while they rotate or are needed for recovery and investigation.",
          "A deletion request may be limited by a legal obligation, an unresolved dispute, security requirements, or another lawful exception."
        ),
        p(
          "We do not publish a single fixed retention period for every data category because the appropriate period depends on the service feature, legal obligation, and operational need involved."
        ),
      ],
    },
    {
      id: "security",
      title: "9. Security",
      icon: "lock",
      blocks: [
        p(
          "We use reasonable technical and organizational measures appropriate to the risk to protect personal data against loss, unauthorized access, use, alteration, or disclosure. Measures may include access controls, secure connections, logging, monitoring, backup and recovery controls, and staff or provider procedures."
        ),
        p(
          "No internet service can guarantee absolute security. You are responsible for protecting your credentials and for notifying us promptly if you suspect unauthorized access to your account."
        ),
      ],
    },
    {
      id: "cookies",
      title: "10. Cookies and Similar Technologies",
      icon: "eye",
      blocks: [
        p(
          "We may use essential cookies, local storage, and similar technologies to keep you signed in, remember language and security preferences, maintain sessions, prevent abuse, and make the website work."
        ),
        p(
          "Optional analytics or similar technologies will be used only when enabled for the service and handled under the applicable notice or consent choice. You can manage cookies through your browser settings, but disabling essential storage may prevent some features from working."
        ),
      ],
    },
    {
      id: "your-rights",
      title: "11. Your Rights",
      icon: "user",
      blocks: [
        p(
          "Subject to applicable law and its exceptions, you may have the right to:"
        ),
        list(
          "Request access to and a copy of personal data we hold about you.",
          "Request correction of inaccurate or incomplete personal data.",
          "Request deletion, restriction, or objection to certain processing.",
          "Request portability where the law and the processing circumstances provide that right.",
          "Withdraw consent where processing is based on consent.",
          "Complain to the competent data-protection authority when you believe your rights have not been respected."
        ),
        p(
          "To make a request, email smartaihubapp@gmail.com or use https://smartaihub.app/contact. We may need to verify your identity, ask for clarification, and apply lawful exceptions. We will handle requests within the period required by applicable law."
        ),
      ],
    },
    {
      id: "breach-and-complaints",
      title: "12. Data Incidents and Complaints",
      icon: "alert",
      blocks: [
        p(
          "If we become aware of a personal-data incident, we will assess and respond to it using our incident procedures and notify the relevant authority or affected individuals when required by applicable law."
        ),
        p(
          "If you have a privacy concern, please contact us first so that we can investigate. You may also contact the Personal Data Protection Committee or another competent authority in Thailand where permitted by law."
        ),
      ],
    },
    {
      id: "children",
      title: "13. Children",
      icon: "shield",
      blocks: [
        p(
          "SmartAIHub is intended for people who are at least 18 years old and is not directed to children. We do not knowingly ask children to provide personal data. If you believe a child has provided personal data to us, please contact smartaihubapp@gmail.com so we can review and take appropriate action."
        ),
      ],
    },
    {
      id: "changes",
      title: "14. Changes to This Policy",
      icon: "bell",
      blocks: [
        p(
          "We may update this Privacy Policy when our service, practices, or legal obligations change. We will post the revised version on this page and update the last-updated date. For material changes, we may also provide an in-service or email notice when appropriate."
        ),
      ],
    },
    {
      id: "contact",
      title: "15. Contact",
      icon: "file",
      blocks: [
        p(
          "For privacy questions, rights requests, or concerns, contact Smart AI Hub Team:"
        ),
        list(
          "Email: smartaihubapp@gmail.com",
          "Contact page: https://smartaihub.app/contact",
          "Line support: https://line.me/ti/p/SbZEQeRa6W",
          "Contact location: Nakhon Ratchasima, Thailand"
        ),
      ],
    },
  ],
  acknowledgement:
    "By using SmartAIHub, you acknowledge that you have read this Privacy Policy.",
  relatedTerms: "Terms of Service",
  relatedPrivacy: "Privacy Policy",
  contactLink: "Contact Us",
};

const privacyTh: LegalDocument = {
  kind: "privacy",
  title: "นโยบายความเป็นส่วนตัว",
  metaTitle: "นโยบายความเป็นส่วนตัว | SmartAIHub",
  metaDescription:
    "ศึกษาวิธีที่ SmartAIHub เก็บรวบรวม ใช้ เปิดเผย รักษาความปลอดภัย และลบข้อมูลส่วนบุคคล",
  summary:
    "นโยบายฉบับนี้อธิบายวิธีที่ SmartAIHub จัดการข้อมูลส่วนบุคคลเมื่อคุณเข้าชมเว็บไซต์ สร้างบัญชี ติดต่อเรา หรือใช้บริการของเรา",
  lastUpdated: "24 สิงหาคม 2569",
  tableOfContents: "สารบัญ",
  backToHome: "กลับหน้าหลัก",
  highlights: [
    {
      icon: "lock",
      text: "เก็บข้อมูลตามวัตถุประสงค์ของบริการและการช่วยเหลือที่แจ้งไว้",
    },
    { icon: "user", text: "คุณสามารถขอทราบ แก้ไข หรือลบข้อมูลส่วนบุคคลได้" },
    {
      icon: "globe",
      text: "เราไม่ขายข้อมูลส่วนบุคคลเพื่อการตลาดของบุคคลภายนอก",
    },
    { icon: "database", text: "เก็บข้อมูลเท่าที่จำเป็นหรือตามที่กฎหมายกำหนด" },
  ],
  sections: [
    {
      id: "scope",
      title: "1. ขอบเขตและบทนำ",
      icon: "shield",
      blocks: [
        p(
          "SmartAIHub ดำเนินการโดย Smart AI Hub Team (ต่อไปนี้เรียกว่า “เรา” หรือ “ของเรา”) นโยบายนี้ใช้กับข้อมูลส่วนบุคคลที่เก็บผ่านเว็บไซต์ SmartAIHub ฟังก์ชันบัญชีและ workspace ช่องทางช่วยเหลือ และบริการที่เกี่ยวข้องซึ่งเชื่อมโยงมายังนโยบายนี้"
        ),
        p(
          "เราประมวลผลข้อมูลส่วนบุคคลตามกฎหมายที่ใช้บังคับ รวมถึงพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) ในส่วนที่ใช้กับกิจกรรมการประมวลผลนั้น นโยบายนี้อธิบายแนวปฏิบัติปัจจุบันและอาจปรับปรุงเมื่อบริการหรือหน้าที่ตามกฎหมายเปลี่ยนแปลง"
        ),
      ],
    },
    {
      id: "controller",
      title: "2. ผู้ควบคุมข้อมูลและช่องทางติดต่อ",
      icon: "user",
      blocks: [
        p(
          "ผู้ควบคุมข้อมูลและผู้ดำเนินการบริการที่ระบุสำหรับเว็บไซต์นี้ในปัจจุบันคือ Smart AI Hub Team"
        ),
        list(
          "อีเมล: smartaihubapp@gmail.com",
          "หน้าติดต่อ: https://smartaihub.app/contact",
          "สถานที่ติดต่อ: Nakhon Ratchasima, Thailand",
          "เป้าหมายการตอบกลับโดยทั่วไป: ภายใน 24 ชั่วโมงในวันทำการ"
        ),
        p(
          "สถานที่ติดต่อข้างต้นเป็นข้อมูลสำหรับการติดต่อทั่วไป ไม่ได้ระบุว่าเป็นสำนักงานใหญ่หรือที่อยู่ตามทะเบียนนิติบุคคล เราจะปรับปรุงส่วนนี้เมื่อยืนยันนิติบุคคลและที่อยู่ตามกฎหมายแล้ว"
        ),
      ],
    },
    {
      id: "data-we-collect",
      title: "3. ข้อมูลส่วนบุคคลที่เราเก็บรวบรวม",
      icon: "database",
      blocks: [
        p(
          "ประเภทข้อมูลที่อาจเก็บรวบรวมขึ้นอยู่กับวิธีที่คุณใช้ SmartAIHub และอาจรวมถึง:"
        ),
        list(
          "ข้อมูลระบุตัวตนและข้อมูลติดต่อ เช่น ชื่อ อีเมล ข้อมูลบริษัท และข้อความที่คุณส่งถึงเรา",
          "ข้อมูลบัญชีและ workspace เช่น ข้อมูลยืนยันตัวตน การตั้งค่า สมาชิกองค์กรหรือ workspace และค่ากำหนดระบบ",
          "เนื้อหาและไฟล์ที่คุณเลือกส่ง อัปโหลด จัดเก็บ หรือประมวลผลผ่านบริการ เช่น prompt คำสั่ง ข้อมูลอ้างอิง และผลลัพธ์ที่สร้างขึ้น",
          "ข้อมูลธุรกรรมและการใช้งานที่จำเป็นต่อฟีเจอร์แบบชำระเงิน เครดิต ประวัติการใช้งาน การช่วยเหลือ การป้องกันการทุจริต และบัญชีตามที่เกี่ยวข้อง",
          "ข้อมูลทางเทคนิคและความปลอดภัย เช่น IP address ข้อมูลอุปกรณ์และเบราว์เซอร์ ตัวระบุ session รายละเอียดข้อผิดพลาด และบันทึกกิจกรรม"
        ),
        p(
          "โปรดอย่าส่งข้อมูลส่วนบุคคลที่มีความอ่อนไหว ข้อมูลลับของบุคคลอื่น หรือข้อมูลที่คุณไม่มีสิทธิ์ให้เรา เว้นแต่ฟีเจอร์นั้นจำเป็นและคุณมีฐานทางกฎหมายที่เหมาะสม"
        ),
      ],
    },
    {
      id: "collection-sources",
      title: "4. แหล่งที่มาของข้อมูล",
      icon: "eye",
      blocks: [
        p("เราอาจได้รับข้อมูลส่วนบุคคลจาก:"),
        list(
          "คุณ เมื่อสมัคร ใช้บริการ ส่งเนื้อหา ติดต่อฝ่ายช่วยเหลือ หรือกรอกแบบฟอร์ม",
          "องค์กรหรือผู้ดูแล workspace ของคุณ เมื่อมีการเปิดสิทธิ์หรือจัดการพื้นที่ทำงานร่วมกัน",
          "เบราว์เซอร์ อุปกรณ์ และระบบของเรา ผ่าน cookies ที่จำเป็น local storage การควบคุมความปลอดภัย และ service logs",
          "ผู้ให้บริการที่ช่วยยืนยันตัวตน โฮสต์ ส่งมอบ รักษาความปลอดภัย หรือสนับสนุนบริการ ตามที่กฎหมายอนุญาต"
        ),
      ],
    },
    {
      id: "purposes-and-bases",
      title: "5. วัตถุประสงค์และฐานการประมวลผล",
      icon: "scale",
      blocks: [
        p(
          "เราใช้ข้อมูลส่วนบุคคลเฉพาะเพื่อวัตถุประสงค์ที่เกี่ยวข้องกับบริการและความสัมพันธ์กับคุณ เช่น:"
        ),
        list(
          "สร้างและรักษาความปลอดภัยบัญชี ยืนยันตัวตน และให้บริการ workspace",
          "ประมวลผล prompt ไฟล์ คำขอ และผลลัพธ์ตามที่คุณสั่งให้บริการดำเนินการ",
          "ให้ความช่วยเหลือ ตอบคำถาม และแจ้งประกาศเกี่ยวกับบริการหรือความปลอดภัย",
          "จัดการเครดิต ฟีเจอร์แบบชำระเงิน ธุรกรรม บัญชี การป้องกันการใช้ในทางมิชอบ และความถูกต้องของบริการตามที่เกี่ยวข้อง",
          "ตรวจสอบความเสถียร แก้ไขข้อผิดพลาด ปรับปรุงบริการ และพัฒนาฟีเจอร์โดยมีมาตรการที่เหมาะสม",
          "ปฏิบัติตามหน้าที่ตามกฎหมาย ตอบสนองต่อคำขอที่ชอบด้วยกฎหมาย และคุ้มครองสิทธิ ความปลอดภัย และทรัพย์สิน"
        ),
        p(
          "ฐานทางกฎหมายที่ใช้ขึ้นอยู่กับวัตถุประสงค์และข้อเท็จจริงของกิจกรรมนั้น อาจรวมถึงการปฏิบัติตามสัญญา ประโยชน์โดยชอบด้วยกฎหมาย หน้าที่ตามกฎหมาย หรือความยินยอมเมื่อกฎหมายกำหนดหรือเหมาะสม หากเราใช้ความยินยอม คุณสามารถถอนความยินยอมได้ แต่การถอนจะไม่กระทบต่อการประมวลผลที่ดำเนินการโดยชอบก่อนหน้านั้น"
        ),
      ],
    },
    {
      id: "ai-and-content",
      title: "6. Prompt ไฟล์ และเนื้อหาที่สร้างด้วย AI",
      icon: "eye",
      blocks: [
        p(
          "SmartAIHub อาจประมวลผล prompt คำสั่ง ข้อมูลอ้างอิงที่อัปโหลด ข้อมูลโครงการ และผลลัพธ์ที่สร้างขึ้น เพื่อให้บริการตามที่คุณขอ การประมวลผลที่เกิดขึ้นจริงขึ้นอยู่กับ workflow โมเดล integration และการตั้งค่าที่คุณเลือก"
        ),
        p(
          "คุณมีหน้าที่ตรวจสอบว่าคุณมีสิทธิ์ส่งเนื้อหานั้น และคำสั่งของคุณไม่มีข้อมูลที่ห้ามเปิดเผย โปรดอย่าใช้บริการแทนคำแนะนำจากผู้เชี่ยวชาญหรือเป็นตัวควบคุมเพียงอย่างเดียวสำหรับการตัดสินใจที่มีผลกระทบสูง"
        ),
        p(
          "เราไม่ได้ระบุว่าเนื้อหาของผู้ใช้จะถูกใช้ฝึกโมเดลของ SmartAIHub หรือผู้ให้บริการภายนอก เว้นแต่ฟีเจอร์หรือประกาศขอความยินยอมที่เกี่ยวข้องจะระบุไว้อย่างชัดเจน หากมีผู้ให้บริการภายนอก นโยบายข้อมูลของผู้ให้บริการนั้นอาจใช้บังคับเพิ่มเติม"
        ),
      ],
    },
    {
      id: "sharing-and-transfers",
      title: "7. การเปิดเผยและการโอนข้อมูลระหว่างประเทศ",
      icon: "globe",
      blocks: [
        p(
          "เราอาจเปิดเผยหรือทำให้ข้อมูลส่วนบุคคลเข้าถึงได้แก่ผู้รับข้อมูลประเภทต่อไปนี้เมื่อจำเป็นต่อวัตถุประสงค์ที่แจ้งไว้:"
        ),
        list(
          "ผู้ให้บริการด้าน hosting storage infrastructure ความปลอดภัย การสื่อสาร analytics การช่วยเหลือ และการชำระเงินที่ประมวลผลข้อมูลแทนเรา",
          "องค์กร ผู้ดูแล workspace หรือผู้ร่วมงานของคุณ เมื่อฟีเจอร์และสิทธิ์ที่เกี่ยวข้องอนุญาต",
          "หน่วยงานรัฐ หน่วยงานกำกับดูแล ศาล ที่ปรึกษา หรือบุคคลอื่นเมื่อกฎหมายกำหนดหรืออนุญาต",
          "ผู้รับโอนหรือคู่สัญญาในกรณีที่มีการปรับโครงสร้าง โอน หรือซื้อกิจการหรือทรัพย์สินที่เกี่ยวข้อง โดยอยู่ภายใต้มาตรการที่กฎหมายกำหนด"
        ),
        p(
          "ผู้ให้บริการบางรายอาจประมวลผลข้อมูลนอกประเทศไทย ก่อนโอนข้อมูลเราจะใช้มาตรการคุ้มครองและมาตรการตามสัญญาหรือมาตรการอื่นตามที่กฎหมายกำหนด เราไม่ขาย ให้เช่า หรือแลกเปลี่ยนข้อมูลส่วนบุคคลเพื่อการตลาดของบุคคลภายนอก"
        ),
      ],
    },
    {
      id: "retention",
      title: "8. ระยะเวลาเก็บรักษาและการลบข้อมูล",
      icon: "database",
      blocks: [
        p(
          "เราเก็บรักษาข้อมูลส่วนบุคคลเท่าที่จำเป็นตามวัตถุประสงค์ที่เก็บรวบรวม ระหว่างที่บัญชีหรือความสัมพันธ์ของคุณยังมีอยู่ หรือเท่าที่จำเป็นเพื่อหน้าที่ตามกฎหมาย บัญชี ความปลอดภัย การระงับข้อพิพาท และการบังคับใช้สิทธิ"
        ),
        list(
          "เมื่อไม่จำเป็นแล้ว เราจะลบ ทำให้ไม่สามารถระบุตัวบุคคลได้ หรือแยกเก็บอย่างปลอดภัยตามข้อกำหนดการดำเนินงานและกฎหมาย",
          "ข้อมูลสำรองและ security logs อาจคงอยู่ชั่วคราวระหว่างรอการหมุนเวียน หรือเท่าที่จำเป็นต่อการกู้คืนและตรวจสอบเหตุการณ์",
          "คำขอลบข้อมูลอาจมีข้อจำกัดจากหน้าที่ตามกฎหมาย ข้อพิพาทที่ยังไม่สิ้นสุด เหตุผลด้านความปลอดภัย หรือข้อยกเว้นที่ชอบด้วยกฎหมาย"
        ),
        p(
          "เราไม่กำหนดระยะเวลาเดียวสำหรับข้อมูลทุกประเภท เพราะระยะเวลาที่เหมาะสมขึ้นอยู่กับฟีเจอร์ หน้าที่ตามกฎหมาย และความจำเป็นในการดำเนินงาน"
        ),
      ],
    },
    {
      id: "security",
      title: "9. การรักษาความปลอดภัย",
      icon: "lock",
      blocks: [
        p(
          "เราใช้มาตรการทางเทคนิคและมาตรการด้านองค์กรที่เหมาะสมกับความเสี่ยง เพื่อป้องกันข้อมูลส่วนบุคคลจากการสูญหาย การเข้าถึง ใช้ เปลี่ยนแปลง หรือเปิดเผยโดยไม่ได้รับอนุญาต มาตรการอาจรวมถึงการควบคุมสิทธิ์ การเชื่อมต่อที่ปลอดภัย การบันทึกและตรวจสอบกิจกรรม มาตรการสำรองและกู้คืน และขั้นตอนของบุคลากรหรือผู้ให้บริการ"
        ),
        p(
          "ไม่มีบริการบนอินเทอร์เน็ตใดรับประกันความปลอดภัยได้อย่างสมบูรณ์ คุณมีหน้าที่รักษาข้อมูลรับรองบัญชีและแจ้งเราโดยเร็วหากสงสัยว่าบัญชีถูกเข้าถึงโดยไม่ได้รับอนุญาต"
        ),
      ],
    },
    {
      id: "cookies",
      title: "10. Cookies และเทคโนโลยีที่คล้ายกัน",
      icon: "eye",
      blocks: [
        p(
          "เราอาจใช้ cookies ที่จำเป็น local storage และเทคโนโลยีที่คล้ายกัน เพื่อให้คุณเข้าสู่ระบบ จดจำภาษาและค่าความปลอดภัย รักษา session ป้องกันการใช้ในทางมิชอบ และทำให้เว็บไซต์ทำงานได้"
        ),
        p(
          "analytics หรือเทคโนโลยีเสริมจะใช้เฉพาะเมื่อเปิดใช้งานกับบริการ และอยู่ภายใต้นโยบายหรือทางเลือกเรื่องความยินยอมที่เกี่ยวข้อง คุณควบคุม cookies ได้จากการตั้งค่าเบราว์เซอร์ แต่การปิด storage ที่จำเป็นอาจทำให้บางฟีเจอร์ใช้งานไม่ได้"
        ),
      ],
    },
    {
      id: "your-rights",
      title: "11. สิทธิของเจ้าของข้อมูลส่วนบุคคล",
      icon: "user",
      blocks: [
        p("ภายใต้กฎหมายและข้อยกเว้นที่ใช้บังคับ คุณอาจมีสิทธิ์ดังต่อไปนี้:"),
        list(
          "ขอเข้าถึงและขอสำเนาข้อมูลส่วนบุคคลที่เราเก็บเกี่ยวกับคุณ",
          "ขอแก้ไขข้อมูลส่วนบุคคลที่ไม่ถูกต้องหรือไม่ครบถ้วน",
          "ขอให้ลบ จำกัด หรือคัดค้านการประมวลผลบางกรณี",
          "ขอให้โอนย้ายข้อมูลเมื่อกฎหมายและลักษณะการประมวลผลให้สิทธิดังกล่าว",
          "ถอนความยินยอมเมื่อการประมวลผลอาศัยความยินยอม",
          "ร้องเรียนต่อหน่วยงานคุ้มครองข้อมูลส่วนบุคคลที่มีอำนาจ เมื่อเห็นว่าสิทธิของคุณไม่ได้รับการเคารพ"
        ),
        p(
          "หากต้องการใช้สิทธิ์ โปรดส่งอีเมลไปที่ smartaihubapp@gmail.com หรือใช้ https://smartaihub.app/contact เราอาจต้องยืนยันตัวตน ขอรายละเอียดเพิ่มเติม และใช้ข้อยกเว้นตามกฎหมาย โดยจะดำเนินการภายในระยะเวลาที่กฎหมายกำหนด"
        ),
      ],
    },
    {
      id: "breach-and-complaints",
      title: "12. เหตุการณ์ข้อมูลและการร้องเรียน",
      icon: "alert",
      blocks: [
        p(
          "หากเราทราบเหตุการณ์ที่เกี่ยวข้องกับข้อมูลส่วนบุคคล เราจะประเมินและดำเนินการตามขั้นตอนรับมือเหตุการณ์ และแจ้งหน่วยงานที่เกี่ยวข้องหรือเจ้าของข้อมูลเมื่อกฎหมายกำหนด"
        ),
        p(
          "หากมีข้อกังวลด้านความเป็นส่วนตัว โปรดติดต่อเราก่อนเพื่อให้ตรวจสอบได้ และคุณอาจติดต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลหรือหน่วยงานที่มีอำนาจในประเทศไทยตามที่กฎหมายอนุญาต"
        ),
      ],
    },
    {
      id: "children",
      title: "13. เด็ก",
      icon: "shield",
      blocks: [
        p(
          "SmartAIHub จัดทำขึ้นสำหรับผู้ที่มีอายุอย่างน้อย 18 ปี และไม่ได้มุ่งหมายให้เด็กใช้งาน เราไม่ทราบโดยเจตนาว่าเก็บข้อมูลจากเด็ก หากเชื่อว่ามีเด็กส่งข้อมูลส่วนบุคคลให้เรา โปรดติดต่อ smartaihubapp@gmail.com เพื่อให้เราตรวจสอบและดำเนินการที่เหมาะสม"
        ),
      ],
    },
    {
      id: "changes",
      title: "14. การเปลี่ยนแปลงนโยบาย",
      icon: "bell",
      blocks: [
        p(
          "เราอาจปรับปรุงนโยบายนี้เมื่อบริการ แนวปฏิบัติ หรือหน้าที่ตามกฎหมายเปลี่ยนแปลง เราจะเผยแพร่ฉบับปรับปรุงบนหน้านี้และเปลี่ยนวันที่ปรับปรุงล่าสุด สำหรับการเปลี่ยนแปลงที่มีสาระสำคัญ เราอาจแจ้งผ่านบริการหรืออีเมลเมื่อเหมาะสม"
        ),
      ],
    },
    {
      id: "contact",
      title: "15. ช่องทางติดต่อ",
      icon: "file",
      blocks: [
        p(
          "สำหรับคำถามด้านความเป็นส่วนตัว คำขอใช้สิทธิ์ หรือข้อกังวล โปรดติดต่อ Smart AI Hub Team:"
        ),
        list(
          "อีเมล: smartaihubapp@gmail.com",
          "หน้าติดต่อ: https://smartaihub.app/contact",
          "Line support: https://line.me/ti/p/SbZEQeRa6W",
          "สถานที่ติดต่อ: Nakhon Ratchasima, Thailand"
        ),
      ],
    },
  ],
  acknowledgement:
    "การใช้ SmartAIHub ถือว่าคุณรับทราบว่าได้อ่านนโยบายความเป็นส่วนตัวฉบับนี้แล้ว",
  relatedTerms: "ข้อกำหนดการให้บริการ",
  relatedPrivacy: "นโยบายความเป็นส่วนตัว",
  contactLink: "ติดต่อเรา",
};

const termsEn: LegalDocument = {
  kind: "terms",
  title: "Terms of Service",
  metaTitle: "Terms of Service | SmartAIHub",
  metaDescription:
    "Read the terms that apply when you access or use SmartAIHub services.",
  summary:
    "These Terms explain the rules for using SmartAIHub, including accounts, user content, AI outputs, paid features, and service changes.",
  lastUpdated: "August 24, 2026",
  tableOfContents: "Table of Contents",
  backToHome: "Back to Home",
  sections: [
    {
      id: "acceptance",
      title: "1. Acceptance and Updates",
      icon: "file",
      blocks: [
        p(
          "By accessing or using SmartAIHub (the “Service”), you agree to these Terms of Service (the “Terms”). If you do not agree, do not access or use the Service."
        ),
        p(
          "We may update these Terms when the Service, our practices, or applicable law changes. We will post the updated version and date on this page. Continued use after an update means you accept the updated Terms, except where applicable law requires another form of agreement."
        ),
      ],
    },
    {
      id: "eligibility",
      title: "2. Eligibility and Account Responsibility",
      icon: "user",
      blocks: [
        p(
          "You must be at least 18 years old and legally capable of entering into these Terms. If you use SmartAIHub for an organization, you confirm that you are authorized to bind that organization."
        ),
        list(
          "Provide information that is accurate and current.",
          "Keep your login credentials and devices secure.",
          "Accept responsibility for activity carried out through your account, subject to activity caused by our breach or another matter that cannot lawfully be assigned to you.",
          "Notify us promptly through the Contact page if you suspect unauthorized access."
        ),
      ],
    },
    {
      id: "service",
      title: "3. The SmartAIHub Service",
      icon: "shield",
      blocks: [
        p(
          "SmartAIHub provides a changing set of AI-assisted workspace, chat, skill, workflow, file, media, presentation, and related features. Availability and eligibility may depend on your account, workspace, plan, credits, region, provider, or technical configuration."
        ),
        p(
          "We may add, change, suspend, or discontinue features. When a change materially affects an active paid feature, we will provide notice or an applicable remedy where required by law or the purchase terms."
        ),
      ],
    },
    {
      id: "ai-output",
      title: "4. AI Outputs and Human Review",
      icon: "alert",
      blocks: [
        p(
          "AI outputs can be inaccurate, incomplete, biased, unavailable, or similar to material produced for other users. They may contain errors, unsupported claims, or content that requires additional rights or review."
        ),
        list(
          "Review and test outputs before relying on them, publishing them, sending them to a third party, or using them in production.",
          "Make your own decisions about safety, legality, accuracy, licensing, and suitability.",
          "Do not use the Service as the sole basis for medical, legal, financial, employment, safety-critical, or other high-impact decisions.",
          "Keep human oversight over automated workflows and external actions."
        ),
      ],
    },
    {
      id: "user-content",
      title: "5. User Content and Permissions",
      icon: "database",
      blocks: [
        p(
          "You retain the rights you have in prompts, files, instructions, and other content that you submit to the Service (your “User Content”). You give SmartAIHub a limited, non-exclusive permission to host, reproduce, transmit, transform, and process User Content only as needed to provide, secure, maintain, and support the Service, or as described in the Privacy Policy."
        ),
        p(
          "You represent that you have the rights and permissions needed to submit User Content and to allow this processing. You must not submit personal data, confidential material, or copyrighted content without a lawful basis or authorization."
        ),
        p(
          "Subject to third-party rights, service limitations, and applicable law, you may use outputs produced for your account. We do not promise that an output is unique, free of third-party rights, or suitable for registration, publication, or commercial use without your review."
        ),
      ],
    },
    {
      id: "acceptable-use",
      title: "6. Acceptable Use",
      icon: "alert",
      blocks: [
        p("You must not use the Service to:"),
        list(
          "Break the law, facilitate abuse, or violate another person's rights.",
          "Generate or distribute malware, harmful code, credential theft, unauthorized access, or instructions intended to compromise systems.",
          "Upload content that is unlawful, threatening, exploitative, discriminatory, or otherwise prohibited by applicable law.",
          "Probe, disrupt, overload, reverse engineer, bypass safeguards, or access accounts or data without authorization.",
          "Circumvent usage limits, credits, billing controls, safety controls, or access restrictions.",
          "Use automated access, resale, or redistribution in a way that is not authorized by the Service or a written agreement."
        ),
        p(
          "We may investigate suspected violations and take proportionate action, including restricting a feature, suspending access, or terminating an account where permitted by law."
        ),
      ],
    },
    {
      id: "third-parties",
      title: "7. Third-Party Services and Links",
      icon: "globe",
      blocks: [
        p(
          "The Service may connect to AI models, storage, payment tools, communications tools, marketplaces, integrations, or other third-party services. Their terms, privacy notices, availability, and processing practices may apply in addition to these Terms."
        ),
        p(
          "We are not responsible for a third party's independent service, content, security, or decision. You are responsible for checking the permissions and terms before enabling an integration or sending content to it."
        ),
      ],
    },
    {
      id: "credits-and-payments",
      title: "8. Credits, Paid Features, and Purchases",
      icon: "file",
      blocks: [
        p(
          "Some features may require credits, a subscription, or another paid purchase. The price, taxes, included capacity, expiry rules, renewal terms, and any refund or cancellation conditions shown at the time of purchase or in the applicable plan terms apply to that transaction."
        ),
        p(
          "You authorize the selected payment method for valid charges. We may change prices or paid features with reasonable notice where required. If a payment, credit, or refund issue occurs, contact us through https://smartaihub.app/contact with the relevant transaction details."
        ),
        p(
          "Nothing in these Terms removes a consumer protection, refund, or other right that cannot lawfully be excluded or limited."
        ),
      ],
    },
    {
      id: "availability",
      title: "9. Availability and Changes",
      icon: "clock",
      blocks: [
        p(
          "The Service may be unavailable or degraded because of maintenance, updates, security measures, provider outages, network conditions, or events outside our reasonable control. We do not promise uninterrupted availability or a particular output result."
        ),
        p(
          "We may apply limits or temporary controls to protect the Service, users, providers, and workspace data. We will make reasonable efforts to restore affected service when practicable."
        ),
      ],
    },
    {
      id: "suspension",
      title: "10. Suspension and Termination",
      icon: "shield",
      blocks: [
        p(
          "You may stop using the Service and request account or data action through the available settings or Contact page. We may suspend or terminate access for a serious or repeated breach, security risk, non-payment, legal requirement, or operational reason, subject to applicable law and any applicable paid-service terms."
        ),
        p(
          "After termination, your right to access the Service ends. Some provisions that by their nature should continue, including payment obligations, intellectual property, disclaimers, limitations, dispute terms, and lawful record-retention duties, may continue to apply."
        ),
      ],
    },
    {
      id: "intellectual-property",
      title: "11. Intellectual Property and Feedback",
      icon: "scale",
      blocks: [
        p(
          "SmartAIHub and its software, design, trademarks, documentation, and original materials are owned by Smart AI Hub Team or its licensors. These Terms give you a limited right to use the Service; they do not transfer our intellectual property to you."
        ),
        p(
          "If you send feedback or suggestions, you allow us to use them to improve the Service without creating an obligation to pay you, provided we do not use that permission to claim ownership of your User Content."
        ),
      ],
    },
    {
      id: "disclaimer",
      title: "12. Disclaimers and Liability",
      icon: "alert",
      blocks: [
        p(
          "To the extent permitted by Thai law, the Service is provided on an “as available” basis. We do not warrant that it will be uninterrupted, error-free, secure in every circumstance, accurate, or suitable for a particular purpose. You remain responsible for reviewing outputs and protecting copies of important content."
        ),
        p(
          "To the extent permitted by law, Smart AI Hub Team will not be liable for indirect, incidental, special, consequential, or punitive loss, loss of profits, loss of data, or loss caused by your misuse, unsupported integration, third-party service, or reliance on an unreviewed AI output. Nothing in these Terms excludes liability or rights that cannot lawfully be excluded or limited."
        ),
      ],
    },
    {
      id: "indemnity",
      title: "13. User Responsibility",
      icon: "shield",
      blocks: [
        p(
          "You are responsible for your User Content, account activity, use of outputs, and compliance with these Terms. If a claim arises from your unlawful use, unauthorized content, or material breach of these Terms, you agree to reasonably cooperate with us and be responsible for losses to the extent caused by your breach and permitted by law."
        ),
      ],
    },
    {
      id: "governing-law",
      title: "14. Governing Law and Disputes",
      icon: "scale",
      blocks: [
        p(
          "These Terms are governed by the laws of Thailand, without giving effect to conflict-of-law rules. The parties should first try to resolve a dispute through good-faith contact using the details below. Subject to mandatory consumer rights and applicable law, disputes may be brought before a competent court in Thailand."
        ),
      ],
    },
    {
      id: "contact",
      title: "15. Contact",
      icon: "file",
      blocks: [
        p("For questions about these Terms, contact Smart AI Hub Team:"),
        list(
          "Email: smartaihubapp@gmail.com",
          "Contact page: https://smartaihub.app/contact",
          "Line support: https://line.me/ti/p/SbZEQeRa6W",
          "Contact location: Nakhon Ratchasima, Thailand"
        ),
      ],
    },
  ],
  acknowledgement:
    "By using SmartAIHub, you acknowledge that you have read and understood these Terms of Service.",
  relatedTerms: "Terms of Service",
  relatedPrivacy: "Privacy Policy",
  contactLink: "Contact Us",
};

const termsTh: LegalDocument = {
  kind: "terms",
  title: "ข้อกำหนดการให้บริการ",
  metaTitle: "ข้อกำหนดการให้บริการ | SmartAIHub",
  metaDescription: "อ่านข้อกำหนดที่ใช้เมื่อคุณเข้าถึงหรือใช้บริการ SmartAIHub",
  summary:
    "ข้อกำหนดฉบับนี้อธิบายกติกาการใช้ SmartAIHub รวมถึงบัญชี เนื้อหาของผู้ใช้ ผลลัพธ์จาก AI ฟีเจอร์แบบชำระเงิน และการเปลี่ยนแปลงบริการ",
  lastUpdated: "24 สิงหาคม 2569",
  tableOfContents: "สารบัญ",
  backToHome: "กลับหน้าหลัก",
  sections: [
    {
      id: "acceptance",
      title: "1. การยอมรับและการปรับปรุงข้อกำหนด",
      icon: "file",
      blocks: [
        p(
          "เมื่อคุณเข้าถึงหรือใช้ SmartAIHub (“บริการ”) ถือว่าคุณตกลงตามข้อกำหนดการให้บริการฉบับนี้ (“ข้อกำหนด”) หากไม่ตกลง โปรดอย่าเข้าถึงหรือใช้บริการ"
        ),
        p(
          "เราอาจปรับปรุงข้อกำหนดเมื่อบริการ แนวปฏิบัติ หรือกฎหมายเปลี่ยนแปลง เราจะเผยแพร่ฉบับปรับปรุงและวันที่บนหน้านี้ การใช้บริการต่อหลังการปรับปรุงถือว่าคุณยอมรับข้อกำหนดฉบับใหม่ เว้นแต่กฎหมายกำหนดให้ต้องใช้รูปแบบการยอมรับอื่น"
        ),
      ],
    },
    {
      id: "eligibility",
      title: "2. คุณสมบัติและความรับผิดชอบของบัญชี",
      icon: "user",
      blocks: [
        p(
          "คุณต้องมีอายุอย่างน้อย 18 ปีและมีความสามารถตามกฎหมายในการทำข้อตกลงนี้ หากใช้ SmartAIHub ในนามองค์กร คุณยืนยันว่ามีอำนาจผูกพันองค์กรนั้น"
        ),
        list(
          "ให้ข้อมูลที่ถูกต้องและเป็นปัจจุบัน",
          "รักษาข้อมูลเข้าสู่ระบบและอุปกรณ์ให้ปลอดภัย",
          "รับผิดชอบกิจกรรมที่เกิดผ่านบัญชีของคุณ เว้นแต่เกิดจากการละเมิดของเรา หรือเป็นเรื่องที่กฎหมายไม่อนุญาตให้โอนความรับผิดชอบให้คุณ",
          "แจ้งเราผ่านหน้าติดต่อโดยเร็วหากสงสัยว่ามีการเข้าถึงบัญชีโดยไม่ได้รับอนุญาต"
        ),
      ],
    },
    {
      id: "service",
      title: "3. บริการ SmartAIHub",
      icon: "shield",
      blocks: [
        p(
          "SmartAIHub ให้บริการ workspace, chat, skill, workflow, ไฟล์ สื่อ presentation และฟีเจอร์ AI อื่น ๆ ซึ่งอาจเปลี่ยนแปลงได้ ความพร้อมใช้งานและสิทธิ์ใช้งานอาจขึ้นอยู่กับบัญชี workspace แพ็กเกจ เครดิต ภูมิภาค ผู้ให้บริการ หรือการตั้งค่าทางเทคนิค"
        ),
        p(
          "เราอาจเพิ่ม เปลี่ยน ระงับ หรือยกเลิกฟีเจอร์ หากการเปลี่ยนแปลงมีผลอย่างมีสาระสำคัญต่อฟีเจอร์แบบชำระเงินที่ใช้งานอยู่ เราจะพยายามแจ้งหรือจัดมาตรการตามที่กฎหมายหรือเงื่อนไขการซื้อกำหนด"
        ),
      ],
    },
    {
      id: "ai-output",
      title: "4. ผลลัพธ์จาก AI และการตรวจสอบโดยมนุษย์",
      icon: "alert",
      blocks: [
        p(
          "ผลลัพธ์จาก AI อาจไม่ถูกต้อง ไม่ครบถ้วน มีอคติ ใช้งานไม่ได้ หรือคล้ายกับผลงานของผู้ใช้อื่น และอาจมีข้อผิดพลาด ข้ออ้างที่ไม่มีหลักฐาน หรือเนื้อหาที่ต้องตรวจสอบสิทธิ์เพิ่มเติม"
        ),
        list(
          "ตรวจสอบและทดสอบผลลัพธ์ก่อนนำไปใช้ เผยแพร่ ส่งให้บุคคลอื่น หรือใช้ใน production",
          "ตัดสินใจด้วยตนเองเรื่องความปลอดภัย ความถูกต้อง กฎหมาย ใบอนุญาต และความเหมาะสม",
          "อย่าใช้บริการเป็นฐานเพียงอย่างเดียวสำหรับการตัดสินใจด้านการแพทย์ กฎหมาย การเงิน การจ้างงาน ความปลอดภัย หรือการตัดสินใจที่มีผลกระทบสูง",
          "รักษาการกำกับดูแลโดยมนุษย์สำหรับ workflow อัตโนมัติและการดำเนินการภายนอก"
        ),
      ],
    },
    {
      id: "user-content",
      title: "5. เนื้อหาของผู้ใช้และสิทธิ์ที่เกี่ยวข้อง",
      icon: "database",
      blocks: [
        p(
          "คุณยังคงมีสิทธิ์ใน prompt ไฟล์ คำสั่ง และเนื้อหาอื่นที่คุณส่งให้บริการ (“เนื้อหาของผู้ใช้”) คุณอนุญาตให้ SmartAIHub โฮสต์ ทำซ้ำ ส่ง แปลง และประมวลผลเนื้อหาของผู้ใช้เท่าที่จำเป็นเพื่อให้บริการ รักษาความปลอดภัย ดูแล และช่วยเหลือบริการ หรือที่ระบุในนโยบายความเป็นส่วนตัว"
        ),
        p(
          "คุณรับรองว่ามีสิทธิ์และได้รับอนุญาตให้ส่งเนื้อหาและอนุญาตการประมวลผลดังกล่าว คุณต้องไม่ส่งข้อมูลส่วนบุคคล ข้อมูลลับ หรือเนื้อหาที่มีลิขสิทธิ์โดยไม่มีฐานทางกฎหมายหรือสิทธิ์ที่เหมาะสม"
        ),
        p(
          "ภายใต้สิทธิ์ของบุคคลภายนอก ข้อจำกัดของบริการ และกฎหมายที่ใช้บังคับ คุณอาจใช้ผลลัพธ์ที่สร้างสำหรับบัญชีของคุณได้ เราไม่รับรองว่าผลลัพธ์จะไม่ซ้ำกับผู้อื่น ปลอดจากสิทธิ์ของบุคคลภายนอก หรือเหมาะสำหรับการจดทะเบียน เผยแพร่ หรือใช้เชิงพาณิชย์โดยไม่ตรวจสอบก่อน"
        ),
      ],
    },
    {
      id: "acceptable-use",
      title: "6. การใช้งานที่ยอมรับได้",
      icon: "alert",
      blocks: [
        p("คุณต้องไม่ใช้บริการเพื่อ:"),
        list(
          "ฝ่าฝืนกฎหมาย สนับสนุนการละเมิด หรือกระทบสิทธิของผู้อื่น",
          "สร้างหรือเผยแพร่ malware โค้ดอันตราย การขโมยข้อมูลรับรอง การเข้าถึงโดยไม่ได้รับอนุญาต หรือคำสั่งที่มุ่งทำลายระบบ",
          "อัปโหลดเนื้อหาที่ผิดกฎหมาย ข่มขู่ แสวงหาประโยชน์ เลือกปฏิบัติ หรือขัดต่อกฎหมาย",
          "ตรวจสอบ รบกวน ทำให้ระบบล้น reverse engineer ข้ามมาตรการป้องกัน หรือเข้าถึงบัญชีหรือข้อมูลโดยไม่ได้รับอนุญาต",
          "หลีกเลี่ยงข้อจำกัด เครดิต การเรียกเก็บเงิน มาตรการความปลอดภัย หรือข้อจำกัดการเข้าถึง",
          "ใช้ระบบอัตโนมัติ ขายต่อ หรือเผยแพร่บริการต่อในลักษณะที่ไม่ได้รับอนุญาต"
        ),
        p(
          "เราอาจตรวจสอบการละเมิดที่สงสัยและดำเนินการตามสัดส่วน เช่น จำกัดฟีเจอร์ ระงับการเข้าถึง หรือยุติบัญชีเมื่อกฎหมายอนุญาต"
        ),
      ],
    },
    {
      id: "third-parties",
      title: "7. บริการและลิงก์ของบุคคลภายนอก",
      icon: "globe",
      blocks: [
        p(
          "บริการอาจเชื่อมต่อกับโมเดล AI storage payment เครื่องมือสื่อสาร marketplace integration หรือบริการอื่นของบุคคลภายนอก เงื่อนไข นโยบายความเป็นส่วนตัว ความพร้อมใช้งาน และแนวปฏิบัติด้านข้อมูลของผู้ให้บริการเหล่านั้นอาจใช้เพิ่มเติมจากข้อกำหนดนี้"
        ),
        p(
          "เราไม่รับผิดชอบต่อบริการ เนื้อหา ความปลอดภัย หรือการตัดสินใจที่เป็นอิสระของบุคคลภายนอก คุณมีหน้าที่ตรวจสอบสิทธิ์และข้อกำหนดก่อนเปิด integration หรือส่งเนื้อหาให้บริการนั้น"
        ),
      ],
    },
    {
      id: "credits-and-payments",
      title: "8. เครดิต ฟีเจอร์แบบชำระเงิน และการซื้อ",
      icon: "file",
      blocks: [
        p(
          "บางฟีเจอร์อาจต้องใช้เครดิต subscription หรือการซื้อแบบอื่น ราคา ภาษี ความจุที่ได้รับ กติกาการหมดอายุ เงื่อนไขต่ออายุ และเงื่อนไขคืนเงินหรือยกเลิกที่แสดงขณะซื้อหรือในเงื่อนไขแพ็กเกจที่ใช้บังคับ จะมีผลกับธุรกรรมนั้น"
        ),
        p(
          "คุณอนุญาตให้เรียกเก็บเงินจากช่องทางที่เลือกสำหรับรายการที่ถูกต้อง เราอาจเปลี่ยนราคาหรือฟีเจอร์แบบชำระเงินโดยแจ้งตามสมควรเมื่อกฎหมายกำหนด หากมีปัญหาเกี่ยวกับการชำระเงิน เครดิต หรือคืนเงิน โปรดติดต่อผ่าน https://smartaihub.app/contact พร้อมรายละเอียดธุรกรรมที่เกี่ยวข้อง"
        ),
        p(
          "ข้อกำหนดนี้ไม่ตัดสิทธิผู้บริโภค สิทธิคืนเงิน หรือสิทธิอื่นที่กฎหมายไม่อนุญาตให้ยกเว้นหรือจำกัด"
        ),
      ],
    },
    {
      id: "availability",
      title: "9. ความพร้อมใช้งานและการเปลี่ยนแปลง",
      icon: "clock",
      blocks: [
        p(
          "บริการอาจหยุดชะงักหรือทำงานลดลงจากการบำรุงรักษา การปรับปรุง มาตรการความปลอดภัย ระบบของผู้ให้บริการ เครือข่าย หรือเหตุที่อยู่นอกเหนือการควบคุมโดยสมควร เราไม่รับประกันการให้บริการต่อเนื่องหรือผลลัพธ์เฉพาะใด ๆ"
        ),
        p(
          "เราอาจใช้ข้อจำกัดหรือการควบคุมชั่วคราวเพื่อคุ้มครองบริการ ผู้ใช้ ผู้ให้บริการ และข้อมูลใน workspace และจะพยายามกู้คืนบริการเมื่อทำได้"
        ),
      ],
    },
    {
      id: "suspension",
      title: "10. การระงับและการยุติบริการ",
      icon: "shield",
      blocks: [
        p(
          "คุณหยุดใช้บริการและขอให้ดำเนินการเกี่ยวกับบัญชีหรือข้อมูลผ่านการตั้งค่าที่มีหรือหน้าติดต่อได้ เราอาจระงับหรือยุติการเข้าถึงเมื่อมีการละเมิดร้ายแรงหรือซ้ำ ความเสี่ยงด้านความปลอดภัย ไม่ชำระเงิน หน้าที่ตามกฎหมาย หรือเหตุผลด้านการดำเนินงาน โดยอยู่ภายใต้กฎหมายและเงื่อนไขบริการแบบชำระเงินที่ใช้บังคับ"
        ),
        p(
          "หลังยุติบริการ สิทธิ์เข้าถึงบริการของคุณสิ้นสุดลง ข้อกำหนดที่โดยสภาพควรมีผลต่อ เช่น การชำระเงิน ทรัพย์สินทางปัญญา ข้อปฏิเสธความรับผิด ข้อจำกัดความรับผิด ข้อพิพาท และหน้าที่เก็บรักษาข้อมูลตามกฎหมาย อาจยังมีผลต่อไป"
        ),
      ],
    },
    {
      id: "intellectual-property",
      title: "11. ทรัพย์สินทางปัญญาและข้อเสนอแนะ",
      icon: "scale",
      blocks: [
        p(
          "SmartAIHub รวมถึงซอฟต์แวร์ การออกแบบ เครื่องหมายการค้า เอกสาร และเนื้อหาต้นฉบับ เป็นของ Smart AI Hub Team หรือผู้ให้อนุญาต สิทธิ์ตามข้อกำหนดนี้เป็นเพียงสิทธิ์ใช้งานบริการแบบจำกัด ไม่ใช่การโอนทรัพย์สินทางปัญญาให้คุณ"
        ),
        p(
          "หากคุณส่งคำติชมหรือข้อเสนอแนะ คุณอนุญาตให้เราใช้เพื่อปรับปรุงบริการโดยไม่ต้องจ่ายค่าตอบแทน โดยไม่ทำให้เราอ้างกรรมสิทธิ์ในเนื้อหาของผู้ใช้ของคุณ"
        ),
      ],
    },
    {
      id: "disclaimer",
      title: "12. ข้อปฏิเสธและความรับผิด",
      icon: "alert",
      blocks: [
        p(
          "ภายใต้ขอบเขตที่กฎหมายไทยอนุญาต บริการให้ในสภาพที่มีและตามความพร้อม เราไม่รับรองว่าจะให้บริการต่อเนื่อง ปราศจากข้อผิดพลาด ปลอดภัยในทุกกรณี ถูกต้อง หรือเหมาะกับวัตถุประสงค์เฉพาะ คุณยังมีหน้าที่ตรวจสอบผลลัพธ์และเก็บสำเนาเนื้อหาสำคัญ"
        ),
        p(
          "ภายใต้ขอบเขตที่กฎหมายอนุญาต Smart AI Hub Team จะไม่รับผิดต่อความเสียหายทางอ้อม ความเสียหายพิเศษ ความเสียหายต่อเนื่อง การสูญเสียกำไร การสูญเสียข้อมูล หรือความเสียหายที่เกิดจากการใช้ผิดวิธี integration ที่ไม่รองรับ บริการบุคคลภายนอก หรือการพึ่งพาผลลัพธ์ AI ที่ไม่ได้ตรวจสอบ ข้อกำหนดนี้ไม่ตัดหรือจำกัดความรับผิดหรือสิทธิ์ที่กฎหมายไม่อนุญาตให้ตัดหรือจำกัด"
        ),
      ],
    },
    {
      id: "indemnity",
      title: "13. ความรับผิดชอบของผู้ใช้",
      icon: "shield",
      blocks: [
        p(
          "คุณรับผิดชอบเนื้อหาของผู้ใช้ กิจกรรมในบัญชี การใช้ผลลัพธ์ และการปฏิบัติตามข้อกำหนด หากมีการเรียกร้องจากการใช้บริการโดยไม่ชอบด้วยกฎหมาย เนื้อหาที่ไม่มีสิทธิ์ หรือการละเมิดข้อกำหนดอย่างมีสาระสำคัญ คุณตกลงให้ความร่วมมืออย่างเหมาะสมและรับผิดชอบต่อความเสียหายเท่าที่เกิดจากการละเมิดของคุณและกฎหมายอนุญาต"
        ),
      ],
    },
    {
      id: "governing-law",
      title: "14. กฎหมายที่ใช้บังคับและข้อพิพาท",
      icon: "scale",
      blocks: [
        p(
          "ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย โดยไม่คำนึงถึงหลักกฎหมายขัดกัน คู่สัญญาควรพยายามแก้ไขข้อพิพาทโดยสุจริตผ่านการติดต่อด้านล่างก่อน ภายใต้สิทธิผู้บริโภคและกฎหมายที่ใช้บังคับ ข้อพิพาทอาจนำขึ้นสู่ศาลที่มีเขตอำนาจในประเทศไทย"
        ),
      ],
    },
    {
      id: "contact",
      title: "15. ช่องทางติดต่อ",
      icon: "file",
      blocks: [
        p("สำหรับคำถามเกี่ยวกับข้อกำหนดนี้ โปรดติดต่อ Smart AI Hub Team:"),
        list(
          "อีเมล: smartaihubapp@gmail.com",
          "หน้าติดต่อ: https://smartaihub.app/contact",
          "Line support: https://line.me/ti/p/SbZEQeRa6W",
          "สถานที่ติดต่อ: Nakhon Ratchasima, Thailand"
        ),
      ],
    },
  ],
  acknowledgement:
    "การใช้ SmartAIHub ถือว่าคุณรับทราบว่าได้อ่านและเข้าใจข้อกำหนดการให้บริการฉบับนี้แล้ว",
  relatedTerms: "ข้อกำหนดการให้บริการ",
  relatedPrivacy: "นโยบายความเป็นส่วนตัว",
  contactLink: "ติดต่อเรา",
};

export const legalDocuments: Record<
  Locale,
  { privacy: LegalDocument; terms: LegalDocument }
> = {
  en: { privacy: privacyEn, terms: termsEn },
  th: { privacy: privacyTh, terms: termsTh },
};

export function getLegalDocument(
  locale: Locale,
  kind: "privacy" | "terms"
): LegalDocument {
  return legalDocuments[locale]?.[kind] ?? legalDocuments.en[kind];
}
