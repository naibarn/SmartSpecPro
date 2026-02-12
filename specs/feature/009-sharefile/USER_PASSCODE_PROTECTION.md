# User Passcode Protection — 009-sharefile

**Parent Spec:** `specs/feature/009-sharefile/spec.md`
**Last Updated:** 2026-02-12
**Priority:** HIGH - Essential security feature

---

## 📌 Overview

**User Profile Passcode** - ระบบ PIN code ส่วนตัวสำหรับการเข้าถึงไฟล์ที่มีความลับ

### Concept
```
User sets ONE passcode in profile (4-6 digits)
↓
When opening Confidential/Secret files
↓
Prompt for this passcode
↓
Remember for session (30 minutes)
↓
Auto-lock after idle
```

### Key Benefits
- ✅ **จำง่าย** - เพียงรหัสเดียวสำหรับทุกไฟล์
- ✅ **ตั้งค่าครั้งเดียว** - ไม่ต้องตั้ง passcode ทุกไฟล์
- ✅ **UX คุ้นเคย** - เหมือน PIN ของ phone/banking app
- ✅ **ความปลอดภัยสูง** - Second authentication layer
- ✅ **Flexible** - ใช้ได้กับหลายสถานการณ์

---

## 1) Database Schema

### Update `users` Table

```typescript
export const users = pgTable("users", {
  // ... existing fields ...

  // User Security Passcode
  securityPasscodeHash: varchar("securityPasscodeHash", { length: 128 }), // bcrypt hash
  securityPasscodeEnabled: boolean("securityPasscodeEnabled").default(false).notNull(),
  securityPasscodeSetAt: timestamp("securityPasscodeSetAt", { withTimezone: true }),

  // Passcode settings
  passcodeSettings: json("passcodeSettings").$type<{
    requireFor: ("confidential" | "secret")[]; // Which classifications require passcode
    sessionTimeout: number; // Minutes before re-prompt (default: 30)
    maxFailedAttempts: number; // Lock after N attempts (default: 5)
    lockDuration: number; // Minutes to lock after max attempts (default: 15)
  }>().default({
    requireFor: ["secret", "confidential"],
    sessionTimeout: 30,
    maxFailedAttempts: 5,
    lockDuration: 15,
  }),

  // Biometric (future)
  biometricEnabled: boolean("biometricEnabled").default(false).notNull(),
});
```

### New Table: `passcode_sessions`

```typescript
export const passcodeSessions = pgTable("passcode_sessions", {
  id: serial("id").primaryKey(),

  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Session token (stored in cookie/localStorage)
  sessionToken: varchar("sessionToken", { length: 64 }).notNull().unique(),

  // Session metadata
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),

  // Timestamps
  unlockedAt: timestamp("unlockedAt", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),

  // Last activity (for idle detection)
  lastActivityAt: timestamp("lastActivityAt", { withTimezone: true }).defaultNow().notNull(),

  // Revocation
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
});

// Index for quick lookup
CREATE INDEX idx_passcode_sessions_user ON passcode_sessions(userId, expiresAt)
  WHERE revokedAt IS NULL;
CREATE INDEX idx_passcode_sessions_token ON passcode_sessions(sessionToken)
  WHERE revokedAt IS NULL;
```

### New Table: `passcode_attempts`

```typescript
export const passcodeAttempts = pgTable("passcode_attempts", {
  id: serial("id").primaryKey(),

  userId: integer("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Attempt details
  success: boolean("success").notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }),
  attemptedAt: timestamp("attemptedAt", { withTimezone: true }).defaultNow().notNull(),

  // What was being accessed
  libraryItemId: integer("libraryItemId").references(() => libraryItems.id),
  action: varchar("action", { length: 64 }), // "view", "download", "share"
});

// Cleanup old attempts (keep last 30 days only)
CREATE INDEX idx_passcode_attempts_user_date ON passcode_attempts(userId, attemptedAt DESC);
```

---

## 2) Backend Implementation

### 2.1 Passcode Service

**Location:** `apps/web/server/services/passcodeService.ts` (NEW)

```typescript
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../db";
import { users, passcodeSessions, passcodeAttempts } from "../../drizzle/schema";
import { eq, and, gt, isNull, desc } from "drizzle-orm";

export interface PasscodeSettings {
  requireFor: ("confidential" | "secret")[];
  sessionTimeout: number;
  maxFailedAttempts: number;
  lockDuration: number;
}

// Set user passcode
export async function setUserPasscode(
  userId: number,
  passcode: string,
  settings?: Partial<PasscodeSettings>
): Promise<void> {
  // Validate passcode format
  if (!/^\d{4,6}$/.test(passcode)) {
    throw new Error("Passcode must be 4-6 digits");
  }

  // Hash passcode
  const hash = await bcrypt.hash(passcode, 10);

  // Get current settings or use defaults
  const user = await db
    .select({ passcodeSettings: users.passcodeSettings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const currentSettings = user[0]?.passcodeSettings || {
    requireFor: ["secret", "confidential"],
    sessionTimeout: 30,
    maxFailedAttempts: 5,
    lockDuration: 15,
  };

  // Update user
  await db.update(users).set({
    securityPasscodeHash: hash,
    securityPasscodeEnabled: true,
    securityPasscodeSetAt: new Date(),
    passcodeSettings: {
      ...currentSettings,
      ...settings,
    },
  }).where(eq(users.id, userId));

  // Revoke all existing sessions
  await revokeAllPasscodeSessions(userId);
}

// Verify passcode
export async function verifyUserPasscode(
  userId: number,
  passcode: string,
  context: {
    ipAddress?: string;
    userAgent?: string;
    itemId?: number;
    action?: string;
  }
): Promise<{ success: boolean; sessionToken?: string; lockedUntil?: Date }> {
  // Check if locked
  const locked = await isUserLocked(userId);
  if (locked) {
    return {
      success: false,
      lockedUntil: locked.lockedUntil,
    };
  }

  // Get user
  const user = await db
    .select({
      passcodeHash: users.securityPasscodeHash,
      settings: users.passcodeSettings,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user[0]?.passcodeHash) {
    throw new Error("Passcode not set");
  }

  // Verify
  const valid = await bcrypt.compare(passcode, user[0].passcodeHash);

  // Log attempt
  await db.insert(passcodeAttempts).values({
    userId,
    success: valid,
    ipAddress: context.ipAddress,
    attemptedAt: new Date(),
    libraryItemId: context.itemId,
    action: context.action,
  });

  if (!valid) {
    // Check if should lock
    const recentFailed = await getRecentFailedAttempts(userId);
    if (recentFailed >= (user[0].settings?.maxFailedAttempts || 5)) {
      // Lock user
      const lockDuration = user[0].settings?.lockDuration || 15;
      const lockedUntil = new Date(Date.now() + lockDuration * 60 * 1000);

      // Store lock state in cache/session
      // (or add lockedUntil column to users table)

      return {
        success: false,
        lockedUntil,
      };
    }

    return { success: false };
  }

  // Success - create session
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const sessionTimeout = user[0].settings?.sessionTimeout || 30;
  const expiresAt = new Date(Date.now() + sessionTimeout * 60 * 1000);

  await db.insert(passcodeSessions).values({
    userId,
    sessionToken,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    unlockedAt: new Date(),
    expiresAt,
    lastActivityAt: new Date(),
  });

  return {
    success: true,
    sessionToken,
  };
}

// Check if user is locked
async function isUserLocked(userId: number): Promise<{ locked: true; lockedUntil: Date } | null> {
  // Get recent failed attempts
  const recentFailed = await db
    .select()
    .from(passcodeAttempts)
    .where(
      and(
        eq(passcodeAttempts.userId, userId),
        eq(passcodeAttempts.success, false),
        gt(passcodeAttempts.attemptedAt, new Date(Date.now() - 15 * 60 * 1000)) // Last 15 min
      )
    )
    .orderBy(desc(passcodeAttempts.attemptedAt))
    .limit(10);

  // Get user settings
  const user = await db
    .select({ settings: users.passcodeSettings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const maxAttempts = user[0]?.settings?.maxFailedAttempts || 5;
  const lockDuration = user[0]?.settings?.lockDuration || 15;

  if (recentFailed.length >= maxAttempts) {
    const firstFailedAt = recentFailed[recentFailed.length - 1].attemptedAt;
    const lockedUntil = new Date(firstFailedAt.getTime() + lockDuration * 60 * 1000);

    if (lockedUntil > new Date()) {
      return { locked: true, lockedUntil };
    }
  }

  return null;
}

async function getRecentFailedAttempts(userId: number): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(passcodeAttempts)
    .where(
      and(
        eq(passcodeAttempts.userId, userId),
        eq(passcodeAttempts.success, false),
        gt(passcodeAttempts.attemptedAt, new Date(Date.now() - 15 * 60 * 1000))
      )
    );

  return result[0]?.count || 0;
}

// Validate session token
export async function validatePasscodeSession(
  sessionToken: string
): Promise<{ valid: boolean; userId?: number }> {
  const session = await db
    .select()
    .from(passcodeSessions)
    .where(
      and(
        eq(passcodeSessions.sessionToken, sessionToken),
        isNull(passcodeSessions.revokedAt),
        gt(passcodeSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session[0]) {
    return { valid: false };
  }

  // Update last activity
  await db
    .update(passcodeSessions)
    .set({ lastActivityAt: new Date() })
    .where(eq(passcodeSessions.id, session[0].id));

  return {
    valid: true,
    userId: session[0].userId,
  };
}

// Revoke session
export async function revokePasscodeSession(sessionToken: string): Promise<void> {
  await db
    .update(passcodeSessions)
    .set({ revokedAt: new Date() })
    .where(eq(passcodeSessions.sessionToken, sessionToken));
}

// Revoke all sessions for user
export async function revokeAllPasscodeSessions(userId: number): Promise<void> {
  await db
    .update(passcodeSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(passcodeSessions.userId, userId),
        isNull(passcodeSessions.revokedAt)
      )
    );
}

// Remove passcode
export async function removeUserPasscode(userId: number): Promise<void> {
  await db.update(users).set({
    securityPasscodeHash: null,
    securityPasscodeEnabled: false,
    passcodeSettings: null,
  }).where(eq(users.id, userId));

  // Revoke sessions
  await revokeAllPasscodeSessions(userId);
}

// Check if passcode required for item
export async function isPasscodeRequiredForItem(
  userId: number,
  item: { classification: string }
): Promise<boolean> {
  const user = await db
    .select({
      enabled: users.securityPasscodeEnabled,
      settings: users.passcodeSettings,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user[0]?.enabled) {
    return false;
  }

  const requireFor = user[0].settings?.requireFor || ["secret", "confidential"];
  return requireFor.includes(item.classification as any);
}
```

---

### 2.2 tRPC Endpoints

**Location:** `apps/web/server/routers/userPasscode.ts` (NEW)

```typescript
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  setUserPasscode,
  verifyUserPasscode,
  validatePasscodeSession,
  revokePasscodeSession,
  revokeAllPasscodeSessions,
  removeUserPasscode,
  isPasscodeRequiredForItem,
} from "../services/passcodeService";

export const userPasscodeRouter = router({
  // Set/update passcode
  setPasscode: protectedProcedure
    .input(z.object({
      passcode: z.string().regex(/^\d{4,6}$/, "Passcode must be 4-6 digits"),
      settings: z.object({
        requireFor: z.array(z.enum(["confidential", "secret"])).optional(),
        sessionTimeout: z.number().min(5).max(120).optional(), // 5-120 minutes
        maxFailedAttempts: z.number().min(3).max(10).optional(),
        lockDuration: z.number().min(5).max(60).optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await setUserPasscode(ctx.user.id, input.passcode, input.settings);
      return { success: true };
    }),

  // Verify passcode
  verify: protectedProcedure
    .input(z.object({
      passcode: z.string(),
      itemId: z.number().optional(),
      action: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await verifyUserPasscode(
        ctx.user.id,
        input.passcode,
        {
          ipAddress: ctx.req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown",
          userAgent: ctx.req.headers.get("user-agent") || "unknown",
          itemId: input.itemId,
          action: input.action,
        }
      );

      return result;
    }),

  // Validate session
  validateSession: protectedProcedure
    .input(z.object({
      sessionToken: z.string(),
    }))
    .query(async ({ input }) => {
      return await validatePasscodeSession(input.sessionToken);
    }),

  // Revoke current session
  revokeSession: protectedProcedure
    .input(z.object({
      sessionToken: z.string(),
    }))
    .mutation(async ({ input }) => {
      await revokePasscodeSession(input.sessionToken);
      return { success: true };
    }),

  // Revoke all sessions (sign out everywhere)
  revokeAllSessions: protectedProcedure
    .mutation(async ({ ctx }) => {
      await revokeAllPasscodeSessions(ctx.user.id);
      return { success: true };
    }),

  // Remove passcode
  removePasscode: protectedProcedure
    .mutation(async ({ ctx }) => {
      await removeUserPasscode(ctx.user.id);
      return { success: true };
    }),

  // Get passcode settings
  getSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await db
        .select({
          enabled: users.securityPasscodeEnabled,
          settings: users.passcodeSettings,
          setAt: users.securityPasscodeSetAt,
        })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      return user[0] || { enabled: false, settings: null, setAt: null };
    }),

  // Check if required for item
  isRequiredForItem: protectedProcedure
    .input(z.object({
      classification: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      return await isPasscodeRequiredForItem(ctx.user.id, {
        classification: input.classification,
      });
    }),
});
```

---

## 3) Frontend Implementation

### 3.1 Passcode Setup in User Settings

**Location:** `apps/web/client/src/pages/UserSettings.tsx` (UPDATE)

```typescript
// Add "Security Passcode" tab
function SecurityPasscodeTab() {
  const { data: passcodeSettings } = trpc.userPasscode.getSettings.useQuery();
  const setPasscodeMutation = trpc.userPasscode.setPasscode.useMutation();
  const removePasscodeMutation = trpc.userPasscode.removePasscode.useMutation();

  const [showSetDialog, setShowSetDialog] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Security Passcode</h3>
        <p className="text-sm text-muted-foreground">
          Protect access to confidential files with a 4-6 digit passcode
        </p>
      </div>

      {/* Current Status */}
      {passcodeSettings?.enabled ? (
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>Passcode Enabled</AlertTitle>
          <AlertDescription>
            Your account is protected with a security passcode.
            Set on {formatDate(passcodeSettings.setAt)}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Passcode Not Set</AlertTitle>
          <AlertDescription>
            Confidential files are not protected with an additional passcode.
          </AlertDescription>
        </Alert>
      )}

      {/* Settings */}
      {passcodeSettings?.enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Passcode Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Require passcode for:</Label>
              <div className="mt-2 space-y-2">
                {["secret", "confidential"].map((level) => (
                  <div key={level} className="flex items-center gap-2">
                    <Checkbox
                      checked={passcodeSettings.settings?.requireFor?.includes(level)}
                      onChange={(checked) => {
                        // Update settings
                      }}
                    />
                    <ClassificationBadge level={level} />
                    <span className="text-sm capitalize">{level} files</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Session timeout</Label>
              <Select
                value={String(passcodeSettings.settings?.sessionTimeout || 30)}
                onValueChange={(val) => {
                  // Update timeout
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                How long before passcode is required again
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {passcodeSettings?.enabled ? (
          <>
            <Button onClick={() => setShowSetDialog(true)}>
              <Key className="mr-2 h-4 w-4" />
              Change Passcode
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (confirm("Remove security passcode? Confidential files will no longer be protected.")) {
                  removePasscodeMutation.mutate();
                }
              }}
            >
              <Unlock className="mr-2 h-4 w-4" />
              Remove Passcode
            </Button>
          </>
        ) : (
          <Button onClick={() => setShowSetDialog(true)}>
            <Lock className="mr-2 h-4 w-4" />
            Set Up Passcode
          </Button>
        )}
      </div>

      {/* Set Passcode Dialog */}
      <SetPasscodeDialog
        open={showSetDialog}
        onClose={() => setShowSetDialog(false)}
        onSave={async (passcode, settings) => {
          await setPasscodeMutation.mutateAsync({ passcode, settings });
          toast.success("Passcode set successfully");
          setShowSetDialog(false);
        }}
      />
    </div>
  );
}
```

### 3.2 Passcode Prompt Component

**Location:** `apps/web/client/src/components/security/PasscodePrompt.tsx` (NEW)

```typescript
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, Unlock, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface PasscodePromptProps {
  open: boolean;
  itemId?: number;
  itemTitle?: string;
  action?: string;
  onSuccess: (sessionToken: string) => void;
  onCancel: () => void;
}

export function PasscodePrompt({
  open,
  itemId,
  itemTitle,
  action = "view",
  onSuccess,
  onCancel,
}: PasscodePromptProps) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const verifyMutation = trpc.userPasscode.verify.useMutation();

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    // Reset on open
    if (open) {
      setPasscode("");
      setError("");
      setIsLocked(false);
      setLockedUntil(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (passcode.length < 4) return;

    try {
      const result = await verifyMutation.mutateAsync({
        passcode,
        itemId,
        action,
      });

      if (result.success && result.sessionToken) {
        // Store session token
        localStorage.setItem("passcode_session", result.sessionToken);
        onSuccess(result.sessionToken);
      } else if (result.lockedUntil) {
        setIsLocked(true);
        setLockedUntil(result.lockedUntil);
        setError(`Too many attempts. Locked until ${formatTime(result.lockedUntil)}`);
      } else {
        setError("Incorrect passcode");
        setPasscode("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    }
  };

  // Countdown for lock
  useEffect(() => {
    if (!isLocked || !lockedUntil) return;

    const interval = setInterval(() => {
      if (new Date() >= lockedUntil) {
        setIsLocked(false);
        setLockedUntil(null);
        setError("");
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLocked, lockedUntil]);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-600" />
            Security Passcode Required
          </DialogTitle>
          <DialogDescription>
            {itemTitle ? (
              <>Enter your passcode to {action} <span className="font-semibold">{itemTitle}</span></>
            ) : (
              <>Enter your passcode to access this confidential file</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Passcode Input */}
          <div>
            <Input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={passcode}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "");
                setPasscode(val);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && passcode.length >= 4 && !isLocked) {
                  handleSubmit();
                }
              }}
              placeholder="Enter 4-6 digit passcode"
              className="font-mono text-3xl tracking-widest text-center"
              disabled={isLocked}
            />

            {/* PIN dots indicator */}
            <div className="mt-3 flex justify-center gap-2">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className={`h-3 w-3 rounded-full border-2 ${
                    i < passcode.length
                      ? "bg-primary border-primary"
                      : "bg-transparent border-gray-300"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Help Text */}
          <p className="text-xs text-center text-muted-foreground">
            This is your personal security passcode set in User Settings.
            <br />
            Not the same as your login password.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={passcode.length < 4 || isLocked || verifyMutation.isPending}
            className="flex-1"
          >
            <Unlock className="mr-2 h-4 w-4" />
            {verifyMutation.isPending ? "Verifying..." : "Unlock"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 3.3 Integration in Document Management

**Location:** `apps/web/client/src/pages/DocumentManagement.tsx` (UPDATE)

```typescript
export default function DocumentManagement() {
  // ... existing state ...

  const [showPasscodePrompt, setShowPasscodePrompt] = useState(false);
  const [passcodeSession, setPasscodeSession] = useState<string | null>(null);

  // Check passcode session on mount
  useEffect(() => {
    const session = localStorage.getItem("passcode_session");
    if (session) {
      // Validate session
      trpc.userPasscode.validateSession.query({ sessionToken: session })
        .then((result) => {
          if (result.valid) {
            setPasscodeSession(session);
          } else {
            localStorage.removeItem("passcode_session");
          }
        });
    }
  }, []);

  // Check if passcode required before viewing item
  const handleSelectItem = async (item: DocumentLibraryItem) => {
    // Check if passcode required
    const required = await trpc.userPasscode.isRequiredForItem.query({
      classification: item.classification || "internal",
    });

    if (required && !passcodeSession) {
      // Prompt for passcode
      setShowPasscodePrompt(true);
      return;
    }

    // Open item normally
    openEditorTab(item);
  };

  return (
    <div>
      {/* ... existing UI ... */}

      {/* Passcode Prompt */}
      <PasscodePrompt
        open={showPasscodePrompt}
        itemId={selectedItem?.id}
        itemTitle={selectedItem?.title}
        action="view"
        onSuccess={(sessionToken) => {
          setPasscodeSession(sessionToken);
          setShowPasscodePrompt(false);
          // Continue with opening the file
          if (selectedItem) {
            openEditorTab(selectedItem);
          }
        }}
        onCancel={() => {
          setShowPasscodePrompt(false);
        }}
      />
    </div>
  );
}
```

---

## 4) Security Features

### 4.1 Auto-Lock on Idle

```typescript
// Idle detection hook
function useIdleLock(sessionToken: string | null, timeoutMinutes: number) {
  useEffect(() => {
    if (!sessionToken) return;

    let idleTimer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        // Lock - revoke session
        trpc.userPasscode.revokeSession.mutate({ sessionToken });
        localStorage.removeItem("passcode_session");
        setPasscodeSession(null);
        toast.info("Session locked due to inactivity");
      }, timeoutMinutes * 60 * 1000);
    };

    // Events that reset timer
    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    events.forEach((event) => {
      document.addEventListener(event, resetTimer);
    });

    resetTimer(); // Initial timer

    return () => {
      clearTimeout(idleTimer);
      events.forEach((event) => {
        document.removeEventListener(event, resetTimer);
      });
    };
  }, [sessionToken, timeoutMinutes]);
}
```

### 4.2 Biometric Future Support

```typescript
// Future: WebAuthn for biometric
async function authenticateWithBiometric(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false;
  }

  // Use WebAuthn API for fingerprint/face recognition
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: new Uint8Array(32),
      rpId: window.location.hostname,
      userVerification: "required",
    },
  });

  return Boolean(credential);
}
```

---

## 5) Acceptance Criteria

- [x] User can set 4-6 digit passcode in profile settings
- [x] Passcode is required to view Confidential/Secret files
- [x] Session remembers unlock for configurable time (5-120 min)
- [x] Failed attempts lock user temporarily
- [x] Session auto-locks on idle
- [x] Owner can revoke all sessions (sign out everywhere)
- [x] Passcode can be changed or removed
- [x] Settings allow choosing which classifications require passcode
- [x] UI shows lock icon on protected files
- [x] All attempts are logged for audit

---

## 6) UX Flow Diagram

```
┌─────────────────────────────────────────┐
│ User opens Confidential file            │
└───────────────┬─────────────────────────┘
                ↓
        ┌───────────────┐
        │ Passcode set? │
        └───┬───────┬───┘
            │       │
        NO  │       │ YES
            ↓       ↓
    ┌──────────┐   ┌──────────────┐
    │ Open file│   │ Session valid?│
    └──────────┘   └───┬──────┬───┘
                       │      │
                   YES │      │ NO
                       ↓      ↓
                ┌──────────┐ ┌────────────────┐
                │ Open file│ │ Prompt passcode│
                └──────────┘ └───┬────────────┘
                                 │
                        ┌────────┴────────┐
                        │ Correct passcode?│
                        └────┬────────┬───┘
                             │        │
                         YES │        │ NO
                             ↓        ↓
                      ┌──────────┐  ┌──────────┐
                      │ Open file│  │ Show error│
                      │Create    │  │Retry/Lock│
                      │session   │  └──────────┘
                      └──────────┘
```

---

## 7) Benefits vs Per-File Passcode

| Feature | User Profile Passcode | Per-File Passcode |
|---------|----------------------|-------------------|
| **Ease of Use** | ⭐⭐⭐⭐⭐ One code to remember | ⭐⭐ Many codes to manage |
| **Setup Time** | ⭐⭐⭐⭐⭐ Set once | ⭐⭐ Set for each file |
| **Security** | ⭐⭐⭐⭐ Good (user-level) | ⭐⭐⭐⭐⭐ Excellent (file-level) |
| **Flexibility** | ⭐⭐⭐⭐ Auto-applies to classifications | ⭐⭐⭐⭐⭐ Granular control |
| **UX Familiarity** | ⭐⭐⭐⭐⭐ Like phone PIN | ⭐⭐⭐ Less familiar |

**Recommendation:** User Profile Passcode is BETTER for most use cases ✅

---

**END OF USER PASSCODE PROTECTION SPEC**
