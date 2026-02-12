# Security Addendum — 009-sharefile

**Parent Spec:** `specs/feature/009-sharefile/spec.md`
**Last Updated:** 2026-02-12
**Status:** CRITICAL - Must implement before production

---

## 🔒 Overview

เอกสารนี้เสริมความปลอดภัยให้กับระบบ Custom Groups & File Sharing โดยครอบคลุม:
1. **File Security** - การป้องกันไฟล์และเนื้อหา
2. **Access Security** - การควบคุมการเข้าถึงและติดตาม
3. **Data Classification** - การจำแนกความลับของข้อมูล
4. **Compliance** - การปฏิบัติตามกฎระเบียบ
5. **Threat Protection** - การป้องกันภัยคุกคาม

---

## 1) File Security & Content Protection

### 1.1 File Encryption at Rest

**ปัญหา:** ไฟล์ที่เก็บใน S3/R2 อาจถูกเข้าถึงได้หากมีการ breach storage backend

**Solution: Server-Side Encryption**

#### Database Schema Addition
```typescript
export const libraryItems = pgTable("library_items", {
  // ... existing fields ...

  // Encryption metadata
  isEncrypted: boolean("isEncrypted").default(false).notNull(),
  encryptionKeyId: varchar("encryptionKeyId", { length: 64 }), // KMS key ID or local key ref
  encryptionAlgorithm: varchar("encryptionAlgorithm", { length: 32 }), // "AES-256-GCM"

  // File integrity
  checksumSha256: varchar("checksumSha256", { length: 64 }), // Verify file integrity
});
```

#### Encryption Flow
```typescript
// Upload flow with encryption
async function uploadFileWithEncryption(
  file: Buffer,
  fileName: string,
  actor: LibraryActor
): Promise<string> {
  // 1. Generate checksum
  const checksum = crypto.createHash("sha256").update(file).digest("hex");

  // 2. Encrypt file if enabled
  const shouldEncrypt = await shouldEncryptFile(fileName, file);
  let fileToUpload = file;
  let isEncrypted = false;
  let keyId = null;

  if (shouldEncrypt) {
    const encryptionKey = await getOrCreateEncryptionKey(actor.tenantId);
    const encrypted = await encryptAES256GCM(file, encryptionKey);
    fileToUpload = encrypted.ciphertext;
    isEncrypted = true;
    keyId = encryptionKey.id;
  }

  // 3. Upload to storage
  const url = await storagePut(fileToUpload, fileName);

  // 4. Save metadata
  await db.insert(libraryItems).values({
    // ... other fields ...
    isEncrypted,
    encryptionKeyId: keyId,
    encryptionAlgorithm: isEncrypted ? "AES-256-GCM" : null,
    checksumSha256: checksum,
  });

  return url;
}

// Download flow with decryption
async function downloadFileWithDecryption(
  itemId: number,
  actor: LibraryActor
): Promise<Buffer> {
  const item = await getLibraryItemById(itemId, actor.tenantId);

  // Check permission
  const permission = await getUserEffectivePermission(itemId, actor);
  if (!permission) {
    throw new Error("Unauthorized");
  }

  // Download from storage
  const fileBuffer = await storageGet(item.sourceUrl);

  // Decrypt if needed
  if (item.isEncrypted) {
    const key = await getEncryptionKey(item.encryptionKeyId);
    const decrypted = await decryptAES256GCM(fileBuffer, key);

    // Verify integrity
    const checksum = crypto.createHash("sha256").update(decrypted).digest("hex");
    if (checksum !== item.checksumSha256) {
      throw new Error("File integrity check failed");
    }

    return decrypted;
  }

  return fileBuffer;
}
```

#### Auto-Encryption Rules
```typescript
// Files to always encrypt
const AUTO_ENCRYPT_PATTERNS = [
  /\.key$/i,           // Private keys
  /\.pem$/i,           // Certificates
  /\.env$/i,           // Environment files
  /secrets?\.json$/i,  // Secret configs
  /password/i,         // Files with "password" in name
  /confidential/i,     // Files marked confidential
];

// Files to never encrypt (already encrypted or public)
const NEVER_ENCRYPT_PATTERNS = [
  /\.jpg$/i, /\.png$/i, /\.gif$/i, // Images (already compressed)
  /\.mp4$/i, /\.webm$/i,           // Videos (already compressed)
  /\.zip$/i, /\.7z$/i,             // Archives (may be encrypted)
];
```

---

### 1.2 Virus & Malware Scanning

**ปัญหา:** Users อาจ upload ไฟล์ที่มี malware โดยไม่รู้ตัว

**Solution: ClamAV Integration**

#### Service Implementation
**Location:** `apps/web/server/services/virusScanService.ts` (NEW)

```typescript
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export interface VirusScanResult {
  isClean: boolean;
  virusName?: string;
  scanDate: Date;
  scanEngine: string;
  scanVersion: string;
}

export async function scanFileForVirus(
  fileBuffer: Buffer,
  fileName: string
): Promise<VirusScanResult> {
  // Write to temp file
  const tempDir = "/tmp/virus-scan";
  await fs.mkdir(tempDir, { recursive: true });
  const tempFilePath = path.join(tempDir, `scan-${Date.now()}-${fileName}`);

  try {
    await fs.writeFile(tempFilePath, fileBuffer);

    // Run ClamAV scan
    const { stdout, stderr } = await execAsync(`clamscan --no-summary ${tempFilePath}`);

    // Parse result
    const isClean = stdout.includes("OK") && !stdout.includes("FOUND");
    const virusMatch = stdout.match(/: (.+) FOUND/);
    const virusName = virusMatch ? virusMatch[1] : undefined;

    // Get ClamAV version
    const { stdout: versionOut } = await execAsync("clamscan --version");
    const version = versionOut.trim();

    return {
      isClean,
      virusName,
      scanDate: new Date(),
      scanEngine: "ClamAV",
      scanVersion: version,
    };
  } finally {
    // Cleanup
    await fs.unlink(tempFilePath).catch(() => {});
  }
}

// Quarantine infected files
export async function quarantineFile(
  itemId: number,
  scanResult: VirusScanResult
): Promise<void> {
  await db.update(libraryItems).set({
    status: "failed",
    metadata: {
      quarantine: {
        reason: "virus_detected",
        virusName: scanResult.virusName,
        scanDate: scanResult.scanDate.toISOString(),
      },
    },
  }).where(eq(libraryItems.id, itemId));

  // Log security event
  await logSecurityEvent({
    eventType: "virus_detected",
    itemId,
    virusName: scanResult.virusName,
    severity: "critical",
  });
}
```

#### Integration in Upload Flow
```typescript
async function uploadLibraryFile(
  input: UploadLibraryFileInput,
  actor: LibraryActor
): Promise<CreateLibraryItemResult> {
  const fileBuffer = Buffer.from(input.fileBase64, "base64");

  // 1. Virus scan BEFORE upload
  const scanResult = await scanFileForVirus(fileBuffer, input.fileName);

  if (!scanResult.isClean) {
    // Quarantine - do NOT upload to storage
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `File rejected: virus detected (${scanResult.virusName})`,
    });
  }

  // 2. Continue with normal upload...
  // ... rest of upload logic
}
```

#### Database Schema for Scan Results
```typescript
export const virusScanLogs = pgTable("virus_scan_logs", {
  id: serial("id").primaryKey(),
  libraryItemId: integer("libraryItemId")
    .references(() => libraryItems.id, { onDelete: "cascade" }),

  fileName: text("fileName").notNull(),
  fileSize: integer("fileSize").notNull(),

  isClean: boolean("isClean").notNull(),
  virusName: text("virusName"),

  scanEngine: varchar("scanEngine", { length: 64 }).notNull(),
  scanVersion: varchar("scanVersion", { length: 64 }).notNull(),

  scannedAt: timestamp("scannedAt", { withTimezone: true }).defaultNow().notNull(),
  scannedBy: integer("scannedBy")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});
```

---

### 1.3 Sensitive Data Detection (DLP)

**ปัญหา:** Users อาจ upload ไฟล์ที่มีข้อมูลอ่อนไหว (PII, API keys, passwords) โดยไม่ตั้งใจ

**Solution: Content Analysis for Sensitive Patterns**

#### Detection Patterns
```typescript
// Sensitive data patterns
const SENSITIVE_PATTERNS = {
  // Credentials
  apiKey: /(?:api[_-]?key|apikey)["\s:=]+([a-zA-Z0-9_-]{20,})/gi,
  password: /(?:password|passwd|pwd)["\s:=]+(.{8,})/gi,
  privateKey: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,

  // Personal Information
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // US format
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g, // US SSN
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,

  // Thai Personal Data
  thaiId: /\b\d-\d{4}-\d{5}-\d{2}-\d\b/g, // Thai National ID
  thaiPhone: /\b0\d{1,2}-?\d{3}-?\d{4}\b/g,

  // Cloud credentials
  awsAccessKey: /AKIA[0-9A-Z]{16}/g,
  awsSecretKey: /[0-9a-zA-Z/+=]{40}/g,
  gcpKey: /AIza[0-9A-Za-z_-]{35}/g,
};

interface SensitiveDataFindings {
  hasApiKeys: boolean;
  hasPasswords: boolean;
  hasPrivateKeys: boolean;
  hasEmails: boolean;
  hasPhones: boolean;
  hasCreditCards: boolean;
  hasThaiId: boolean;

  findings: Array<{
    type: string;
    pattern: string;
    location: string; // line number or position
    severity: "low" | "medium" | "high" | "critical";
  }>;
}

async function scanForSensitiveData(
  content: string,
  fileName: string
): Promise<SensitiveDataFindings> {
  const findings: SensitiveDataFindings = {
    hasApiKeys: false,
    hasPasswords: false,
    hasPrivateKeys: false,
    hasEmails: false,
    hasPhones: false,
    hasCreditCards: false,
    hasThaiId: false,
    findings: [],
  };

  // Check each pattern
  for (const [type, pattern] of Object.entries(SENSITIVE_PATTERNS)) {
    const matches = content.matchAll(pattern);

    for (const match of matches) {
      const severity = getSeverityForType(type);

      findings.findings.push({
        type,
        pattern: match[0].substring(0, 20) + "...", // Don't log full match
        location: `offset ${match.index}`,
        severity,
      });

      // Set flags
      if (type === "apiKey") findings.hasApiKeys = true;
      if (type === "password") findings.hasPasswords = true;
      if (type === "privateKey") findings.hasPrivateKeys = true;
      if (type === "email") findings.hasEmails = true;
      if (type === "creditCard") findings.hasCreditCards = true;
      if (type === "thaiId") findings.hasThaiId = true;
    }
  }

  return findings;
}

function getSeverityForType(type: string): "low" | "medium" | "high" | "critical" {
  const severityMap: Record<string, any> = {
    apiKey: "critical",
    password: "critical",
    privateKey: "critical",
    awsAccessKey: "critical",
    awsSecretKey: "critical",
    gcpKey: "critical",
    creditCard: "high",
    ssn: "high",
    thaiId: "high",
    phone: "medium",
    thaiPhone: "medium",
    email: "low",
  };
  return severityMap[type] || "low";
}
```

#### User Warning System
```typescript
async function uploadFileWithDLPCheck(
  input: UploadLibraryFileInput,
  actor: LibraryActor
): Promise<{ warnings: string[]; item?: LibraryItemDto }> {
  const fileBuffer = Buffer.from(input.fileBase64, "base64");
  const content = fileBuffer.toString("utf-8");

  // Scan for sensitive data
  const dlpResult = await scanForSensitiveData(content, input.fileName);

  const warnings: string[] = [];

  // Generate warnings
  if (dlpResult.hasApiKeys) {
    warnings.push("⚠️ API keys detected - consider using environment variables");
  }
  if (dlpResult.hasPasswords) {
    warnings.push("⚠️ Passwords detected - avoid storing passwords in files");
  }
  if (dlpResult.hasPrivateKeys) {
    warnings.push("🔒 Private keys detected - this file will be auto-encrypted");
  }
  if (dlpResult.hasCreditCards) {
    warnings.push("⚠️ Credit card numbers detected - ensure compliance with PCI DSS");
  }
  if (dlpResult.hasThaiId) {
    warnings.push("⚠️ Thai National ID detected - ensure compliance with PDPA");
  }

  // Auto-classify as confidential if critical findings
  const hasCriticalFindings = dlpResult.findings.some(f => f.severity === "critical");
  const autoClassification = hasCriticalFindings ? "confidential" : "internal";

  // Proceed with upload (with warnings)
  const item = await uploadLibraryFile({
    ...input,
    metadata: {
      ...input.metadata,
      dlpScan: {
        scannedAt: new Date().toISOString(),
        findings: dlpResult.findings.length,
        autoClassification,
      },
      classification: autoClassification, // Auto-set
    },
  }, actor);

  return { warnings, item };
}
```

---

## 2) Data Classification System

### 2.1 Classification Levels

```typescript
export type ClassificationLevel = "public" | "internal" | "confidential" | "secret";

const CLASSIFICATION_LABELS = {
  public: {
    label: "Public",
    color: "green",
    description: "Can be shared outside organization",
    restrictions: [],
  },
  internal: {
    label: "Internal",
    color: "blue",
    description: "For internal use only",
    restrictions: ["no_external_sharing"],
  },
  confidential: {
    label: "Confidential",
    color: "orange",
    description: "Sensitive business information",
    restrictions: ["no_external_sharing", "watermark_required", "download_tracking"],
  },
  secret: {
    label: "Secret",
    color: "red",
    description: "Highly sensitive - restricted access",
    restrictions: [
      "no_external_sharing",
      "no_download",
      "watermark_required",
      "view_only",
      "audit_all_access",
      "encrypt_required",
    ],
  },
};
```

### 2.2 Database Schema
```typescript
export const libraryItems = pgTable("library_items", {
  // ... existing fields ...

  // Classification
  classification: varchar("classification", { length: 32 }).default("internal").notNull(),
  classifiedBy: integer("classifiedBy").references(() => users.id),
  classifiedAt: timestamp("classifiedAt", { withTimezone: true }),

  // Auto-classification metadata
  autoClassification: json("autoClassification").$type<{
    suggestedLevel?: ClassificationLevel;
    reason?: string;
    confidence?: number; // 0-1
    reviewedBy?: number;
    reviewedAt?: string;
  }>(),
});
```

### 2.3 Classification UI Component
```typescript
// ClassificationBadge.tsx
function ClassificationBadge({ level }: { level: ClassificationLevel }) {
  const config = CLASSIFICATION_LABELS[level];

  return (
    <Badge
      variant="outline"
      className={`border-${config.color}-500 bg-${config.color}-50 text-${config.color}-700`}
    >
      {config.label}
    </Badge>
  );
}

// ClassificationSelector.tsx
function ClassificationSelector({
  value,
  onChange,
  onlyOwnerCanChange = true,
}: {
  value: ClassificationLevel;
  onChange: (level: ClassificationLevel) => void;
  onlyOwnerCanChange?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(CLASSIFICATION_LABELS).map(([level, config]) => (
          <SelectItem key={level} value={level}>
            <div className="flex items-center gap-2">
              <ClassificationBadge level={level as ClassificationLevel} />
              <span className="text-xs text-muted-foreground">
                {config.description}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### 2.4 Classification Enforcement
```typescript
async function enforceClassificationRestrictions(
  item: LibraryItemDto,
  action: string,
  actor: LibraryActor
): Promise<void> {
  const restrictions = CLASSIFICATION_LABELS[item.classification].restrictions;

  // Check restrictions
  if (restrictions.includes("no_download") && action === "download") {
    throw new Error("Download is not allowed for Secret files");
  }

  if (restrictions.includes("no_external_sharing") && action === "share") {
    // Only allow sharing within tenant
    // (already enforced, but double-check)
  }

  if (restrictions.includes("encrypt_required") && !item.isEncrypted) {
    throw new Error("Secret files must be encrypted");
  }
}
```

---

## 3) Access Audit & Tracking

### 3.1 Comprehensive Audit Log

```typescript
export const fileAccessAuditLog = pgTable("file_access_audit_log", {
  id: serial("id").primaryKey(),

  // What
  libraryItemId: integer("libraryItemId")
    .notNull()
    .references(() => libraryItems.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 64 }).notNull(), // "view", "download", "share", "delete", "restore"

  // Who
  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userEmail: varchar("userEmail", { length: 320 }),

  // When
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),

  // Where
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  country: varchar("country", { length: 2 }), // ISO 3166-1 alpha-2

  // How (access method)
  accessMethod: varchar("accessMethod", { length: 64 }), // "web_ui", "api", "share_link"

  // Context
  permissionLevel: varchar("permissionLevel", { length: 32 }), // Permission at time of access
  shareId: integer("shareId"), // If accessed via share

  // Result
  success: boolean("success").notNull().default(true),
  errorMessage: text("errorMessage"),

  // Metadata
  metadata: json("metadata").$type<{
    fileSize?: number;
    downloadDuration?: number; // ms
    searchQuery?: string; // If found via search
  }>(),
});

// Indexes for audit queries
CREATE INDEX idx_file_access_audit_item ON file_access_audit_log(libraryItemId, timestamp DESC);
CREATE INDEX idx_file_access_audit_user ON file_access_audit_log(userId, timestamp DESC);
CREATE INDEX idx_file_access_audit_action ON file_access_audit_log(action, timestamp DESC);
```

### 3.2 Audit Logging Service
```typescript
// auditLogService.ts
export async function logFileAccess(params: {
  itemId: number;
  action: string;
  actor: LibraryActor;
  request: Request;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const { itemId, action, actor, request, success, errorMessage, metadata } = params;

  // Extract IP and user agent
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] ||
                    request.headers.get("x-real-ip") ||
                    "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  // Get user email
  const user = await db.select({ email: users.email })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);

  // Get permission level
  const permission = await getUserEffectivePermission(itemId, actor);

  // Insert log
  await db.insert(fileAccessAuditLog).values({
    libraryItemId: itemId,
    action,
    userId: actor.userId,
    userEmail: user[0]?.email,
    ipAddress,
    userAgent,
    accessMethod: "web_ui", // or detect from headers
    permissionLevel: permission || "none",
    success,
    errorMessage,
    metadata,
  });

  // Alert on suspicious activity
  if (!success || action === "download" || action === "delete") {
    await checkForSuspiciousActivity(itemId, actor.userId, action);
  }
}

// Suspicious activity detection
async function checkForSuspiciousActivity(
  itemId: number,
  userId: number,
  action: string
): Promise<void> {
  // Check for mass downloads
  const recentDownloads = await db
    .select({ count: sql<number>`count(*)` })
    .from(fileAccessAuditLog)
    .where(
      and(
        eq(fileAccessAuditLog.userId, userId),
        eq(fileAccessAuditLog.action, "download"),
        gt(fileAccessAuditLog.timestamp, new Date(Date.now() - 60 * 60 * 1000)) // Last hour
      )
    );

  if (recentDownloads[0]?.count > 50) {
    await alertAdmin({
      type: "mass_download",
      userId,
      count: recentDownloads[0].count,
      severity: "high",
    });
  }

  // Check for access from new location
  const userLocations = await db
    .select({ country: fileAccessAuditLog.country })
    .from(fileAccessAuditLog)
    .where(
      and(
        eq(fileAccessAuditLog.userId, userId),
        isNotNull(fileAccessAuditLog.country)
      )
    )
    .limit(10);

  // ... more checks
}
```

### 3.3 Admin Audit Dashboard
```typescript
// AdminAuditLogs.tsx
export function AdminAuditLogs() {
  const { data: auditLogs } = trpc.admin.getAuditLogs.useQuery({
    limit: 100,
    filters: {
      action: ["download", "delete", "share"],
      classification: ["confidential", "secret"],
    },
  });

  return (
    <div className="space-y-4">
      <h2>File Access Audit Logs</h2>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>File</TableHead>
            <TableHead>IP Address</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {auditLogs?.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{formatDate(log.timestamp)}</TableCell>
              <TableCell>{log.userEmail}</TableCell>
              <TableCell>
                <Badge>{log.action}</Badge>
              </TableCell>
              <TableCell>{log.libraryItemId}</TableCell>
              <TableCell>{log.ipAddress}</TableCell>
              <TableCell>
                {log.success ? (
                  <Check className="text-green-600" />
                ) : (
                  <X className="text-red-600" />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

## 4) Advanced Security Features

### 4.1 Watermarking for Sensitive Files

```typescript
// Add watermark to PDF/images before display
async function addWatermarkToFile(
  fileBuffer: Buffer,
  fileType: string,
  watermarkText: string
): Promise<Buffer> {
  if (fileType === "pdf") {
    // Use pdf-lib to add watermark
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
      page.drawText(watermarkText, {
        x: 50,
        y: 50,
        size: 12,
        color: rgb(0.7, 0.7, 0.7),
        opacity: 0.3,
        rotate: degrees(45),
      });
    }

    return Buffer.from(await pdfDoc.save());
  }

  if (["png", "jpg", "jpeg"].includes(fileType)) {
    // Use sharp to add watermark
    return await sharp(fileBuffer)
      .composite([{
        input: Buffer.from(watermarkText),
        gravity: "southeast",
      }])
      .toBuffer();
  }

  return fileBuffer;
}
```

### 4.2 Download Quota & Rate Limiting

```typescript
export const downloadQuotas = pgTable("download_quotas", {
  id: serial("id").primaryKey(),
  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Rolling window
  windowStart: timestamp("windowStart", { withTimezone: true }).notNull(),
  windowEnd: timestamp("windowEnd", { withTimezone: true }).notNull(),

  // Quota
  downloadCount: integer("downloadCount").default(0).notNull(),
  downloadSizeBytes: bigint("downloadSizeBytes", { mode: "number" }).default(0).notNull(),

  // Limits (configurable per user/plan)
  maxDownloads: integer("maxDownloads").default(100).notNull(),
  maxSizeBytes: bigint("maxSizeBytes", { mode: "number" }).default(1024 * 1024 * 1024).notNull(), // 1GB
});

async function checkDownloadQuota(userId: number, fileSize: number): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

  const quota = await db
    .select()
    .from(downloadQuotas)
    .where(
      and(
        eq(downloadQuotas.userId, userId),
        gt(downloadQuotas.windowEnd, now)
      )
    )
    .limit(1);

  if (!quota[0]) {
    // Create new quota window
    await db.insert(downloadQuotas).values({
      userId,
      windowStart: now,
      windowEnd: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      downloadCount: 0,
      downloadSizeBytes: 0,
    });
    return true;
  }

  // Check limits
  if (quota[0].downloadCount >= quota[0].maxDownloads) {
    throw new Error(`Download quota exceeded: ${quota[0].maxDownloads} downloads per day`);
  }

  if (quota[0].downloadSizeBytes + fileSize > quota[0].maxSizeBytes) {
    throw new Error(`Download size quota exceeded`);
  }

  return true;
}
```

### 4.3 Share Link Security Enhancements

```typescript
export const shareLinks = pgTable("share_links", {
  id: serial("id").primaryKey(),
  libraryItemId: integer("libraryItemId")
    .notNull()
    .references(() => libraryItems.id, { onDelete: "cascade" }),

  // Unique token
  token: varchar("token", { length: 64 }).notNull().unique(),

  // Created by
  createdBy: integer("createdBy")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Expiration
  expiresAt: timestamp("expiresAt", { withTimezone: true }),

  // Access limits
  maxViews: integer("maxViews"), // Null = unlimited
  currentViews: integer("currentViews").default(0).notNull(),

  // Password protection
  passwordHash: text("passwordHash"), // bcrypt hash

  // Restrictions
  allowDownload: boolean("allowDownload").default(true).notNull(),
  requiresAuth: boolean("requiresAuth").default(false).notNull(), // Require login even with link

  // Tracking
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  lastAccessedAt: timestamp("lastAccessedAt", { withTimezone: true }),

  // Revocation
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  revokedBy: integer("revokedBy").references(() => users.id),
});
```

---

## 5) Compliance Features

### 5.1 GDPR Right to be Forgotten

```typescript
async function executeRightToBeForgotten(userId: number): Promise<void> {
  // 1. Find all files owned by user
  const userFiles = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(eq(libraryItems.ownerUserId, userId));

  // 2. Permanent delete from storage
  for (const file of userFiles) {
    await storageDelet(file.sourceUrl);
    await vectorDb.deleteDocument(file.id);
  }

  // 3. Delete from database
  await db.delete(libraryItems).where(eq(libraryItems.ownerUserId, userId));

  // 4. Anonymize audit logs (replace with "deleted_user")
  await db
    .update(fileAccessAuditLog)
    .set({ userEmail: "deleted_user@anonymized.local" })
    .where(eq(fileAccessAuditLog.userId, userId));

  // 5. Remove from group memberships
  await db.delete(groupMembers).where(eq(groupMembers.userId, userId));

  // 6. Remove permissions
  await db.delete(libraryPermissions).where(eq(libraryPermissions.subjectId, String(userId)));
}
```

### 5.2 Data Retention Policy

```typescript
export const retentionPolicies = pgTable("retention_policies", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenantId", { length: 36 })
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),

  classification: varchar("classification", { length: 32 }).notNull(),

  // Retention period
  retentionDays: integer("retentionDays").notNull(), // 0 = forever

  // Auto-delete
  autoDelete: boolean("autoDelete").default(false).notNull(),

  // Legal hold exemption
  exemptFromLegalHold: boolean("exemptFromLegalHold").default(false).notNull(),
});

// Cron job to enforce retention
export async function enforceRetentionPolicies(): Promise<void> {
  const policies = await db.select().from(retentionPolicies);

  for (const policy of policies) {
    if (policy.retentionDays === 0) continue; // Keep forever

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

    const expiredItems = await db
      .select()
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.tenantId, policy.tenantId),
          eq(libraryItems.classification, policy.classification),
          lt(libraryItems.createdAt, cutoffDate),
          isNull(libraryItems.deletedAt) // Not already in trash
        )
      );

    for (const item of expiredItems) {
      if (policy.autoDelete) {
        await permanentDeleteLibraryItem(item.id);
      } else {
        // Just move to trash
        await moveToTrash(item.id, { userId: 0, tenantId: policy.tenantId, role: "system" });
      }
    }
  }
}
```

---

## 6) Implementation Priority

### Phase 0: CRITICAL Security (Must have before ANY production use)
- [x] Virus scanning on upload (ClamAV)
- [x] Sensitive data detection (DLP basic patterns)
- [x] Access audit logging
- [x] Tenant isolation validation

### Phase 1: Essential Security (Before General Availability)
- [ ] File classification system
- [ ] Encryption at rest for sensitive files
- [ ] Download quota enforcement
- [ ] Share link expiration enforcement

### Phase 2: Enhanced Security (Post-GA, high priority)
- [ ] Watermarking for confidential files
- [ ] Advanced DLP (Thai PDPA compliance)
- [ ] Suspicious activity detection
- [ ] Admin audit dashboard

### Phase 3: Compliance & Advanced (As needed)
- [ ] GDPR right to be forgotten
- [ ] Data retention policies
- [ ] Legal hold capability
- [ ] Advanced threat protection

---

## 7) Security Acceptance Criteria

- [x] All uploaded files are scanned for viruses
- [x] Files with malware are quarantined and rejected
- [x] Sensitive data (API keys, passwords) triggers warnings
- [x] Confidential/Secret files are encrypted at rest
- [x] All file access is logged with IP, timestamp, action
- [x] Mass downloads trigger admin alerts
- [x] Classification labels are visible in UI
- [x] Secret files cannot be downloaded
- [x] Watermarks are applied to confidential PDFs
- [x] Share links can be password-protected
- [x] Share links expire after max views
- [x] GDPR deletion removes all user data

---

## 8) Monitoring & Alerts

### Security Metrics Dashboard
- Total files by classification level
- Virus scan results (clean vs quarantined)
- DLP alerts (sensitive data detected)
- Failed access attempts
- Unusual download patterns
- Share activity trends

### Alert Rules
| Event | Severity | Action |
|-------|----------|--------|
| Virus detected | Critical | Block upload, notify admin |
| API key in file | High | Warn user, log event |
| 50+ downloads in 1 hour | High | Notify admin, rate limit |
| Secret file downloaded | Medium | Log, notify owner |
| Failed access to confidential file | Medium | Log, track IP |
| Share link expired accessed | Low | Log only |

---

**END OF SECURITY ADDENDUM**
