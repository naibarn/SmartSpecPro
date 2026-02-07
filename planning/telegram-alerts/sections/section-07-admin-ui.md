Now I have all the context I need. Let me generate the section content for section-07-admin-ui.

---

# Section 07: Admin UI — Telegram Bot Configuration Tab

## Overview

This section adds a **"Telegram Bot"** tab to the existing Admin Settings page (`/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminSettings.tsx`). The tab allows platform administrators to configure the Telegram Bot API credentials, test the connection, and register the webhook endpoint.

This section is **completely self-contained** and follows the exact UI pattern established by the existing SMTP and SMS settings tabs in the AdminSettings page.

---

## Dependencies

- **Section 01** (schema migration) must be complete — system_settings table needs "telegram" category support
- **Section 04** (admin backend) must be complete — provides the tRPC endpoints this UI calls

---

## Tests (from TDD Plan)

No automated UI tests are specified in the TDD plan. Manual verification should cover:

1. Tab renders correctly in the AdminSettings sidebar navigation
2. Form loads existing Telegram settings on mount (via `getTelegramSettings`)
3. Bot token and webhook secret are masked by default (password input with show/hide toggle)
4. Save button encrypts sensitive fields and stores them via `updateTelegramSettings`
5. Test Connection button calls `testTelegramConnection` and displays bot info on success
6. Register Webhook button calls `registerWebhook` and shows confirmation message
7. Enable/Disable toggle persists state correctly
8. Only admin users can access the tab (enforced by existing AdminSettings access control)

---

## Implementation Details

### File to Modify

**Path:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminSettings.tsx`

### Changes Required

#### 1. Add Telegram Icon Import

At the top of the file where other icons are imported (around line 17-50), add:

```typescript
import { Send } from "lucide-react"; // For Telegram icon (paper plane)
```

#### 2. Add Telegram Form State

After the existing state declarations (around line 232), add:

```typescript
// Telegram settings state
const [telegramForm, setTelegramForm] = useState({
  botToken: "",
  botUsername: "",
  appUrl: "",
  enabled: false,
});
const [showBotToken, setShowBotToken] = useState(false);
const [botTokenConfigured, setBotTokenConfigured] = useState(false);
const [webhookSecretConfigured, setWebhookSecretConfigured] = useState(false);
```

#### 3. Add Telegram tRPC Queries and Mutations

After the existing queries (around line 290), add:

```typescript
// Telegram settings query & mutations
const { data: telegramSettings, refetch: refetchTelegram } =
  trpc.telegram.getTelegramSettings.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

const updateTelegramMutation = trpc.telegram.updateTelegramSettings.useMutation({
  onSuccess: () => {
    toast.success("Telegram settings saved");
    refetchTelegram();
    setTelegramForm((prev) => ({ ...prev, botToken: "" })); // Clear token field after save
  },
  onError: (err: any) => {
    toast.error(`Failed: ${err.message}`);
  },
});

const testTelegramMutation = trpc.telegram.testTelegramConnection.useMutation({
  onSuccess: (data) => {
    if (data.success) {
      toast.success(`Connected to bot: @${data.botInfo?.username || "unknown"}`);
    } else {
      toast.error(data.message || "Connection test failed");
    }
  },
  onError: (err: any) => {
    toast.error(`Test failed: ${err.message}`);
  },
});

const registerWebhookMutation = trpc.telegram.registerWebhook.useMutation({
  onSuccess: (data) => {
    if (data.success) {
      toast.success("Webhook registered successfully");
    } else {
      toast.error(data.message || "Webhook registration failed");
    }
  },
  onError: (err: any) => {
    toast.error(`Webhook registration failed: ${err.message}`);
  },
});
```

#### 4. Add useEffect to Load Telegram Settings

After the existing useEffect hooks (around line 298), add:

```typescript
// Load Telegram settings
useEffect(() => {
  if (telegramSettings) {
    setTelegramForm((prev) => ({
      ...prev,
      botUsername: telegramSettings.botUsername || "",
      appUrl: telegramSettings.appUrl || "",
      enabled: telegramSettings.enabled || false,
    }));
    setBotTokenConfigured(!!telegramSettings.botTokenConfigured);
    setWebhookSecretConfigured(!!telegramSettings.webhookSecretConfigured);
  }
}, [telegramSettings]);
```

#### 5. Update Navigation Items Array

In the `navItems` array (around line 362), add the Telegram tab entry **after the "sms" entry**:

```typescript
const navItems = [
  { key: "stripe", label: "Payments", sublabel: "Stripe API Keys", icon: CreditCard },
  { key: "oauth", label: "OAuth", sublabel: "Social Login", icon: Globe },
  { key: "registration", label: "Registration", sublabel: "Signup & Credits", icon: UserPlus },
  { key: "smtp", label: "Email", sublabel: "SMTP Settings", icon: Mail },
  { key: "sms", label: "SMS", sublabel: "Provider Config", icon: MessageSquare },
  { key: "telegram", label: "Telegram Bot", sublabel: "Alert Notifications", icon: Send }, // NEW
  { key: "2fa", label: "2FA", sublabel: "Authenticator", icon: Shield },
  { key: "stt", label: "STT", sublabel: "Speech-to-Text", icon: Mic },
  { key: "ai", label: "AI / Memory", sublabel: "Summary Model", icon: Brain },
  { key: "menu", label: "Main Menu", sublabel: "Visibility Control", icon: Menu },
];
```

#### 6. Add Telegram TabsContent Section

After the SMS tab content (around line 1082, after `</TabsContent>` for "sms"), add:

```typescript
{/* Telegram Bot Settings Tab */}
<TabsContent value="telegram">
  <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
    <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
      <CardTitle className="flex items-center gap-2 text-lg">
        <Send className="w-5 h-5 text-purple-500" />
        Telegram Bot Settings
      </CardTitle>
      <CardDescription>
        Configure Telegram Bot API credentials to send alert notifications to users who link their Telegram accounts.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      {/* Configuration Status Badge */}
      {botTokenConfigured && (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <Check className="w-3 h-3 mr-1" /> Bot Token Configured
        </Badge>
      )}

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
        <div>
          <div className="font-medium text-gray-900">Enable Telegram Notifications</div>
          <div className="text-sm text-gray-500">Master switch for all Telegram alert delivery</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={telegramForm.enabled}
            onChange={(e) => setTelegramForm((p) => ({ ...p, enabled: e.target.checked }))}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
        </label>
      </div>

      {/* Bot Token */}
      <div>
        <Label htmlFor="botToken">
          Bot Token
          {botTokenConfigured && (
            <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
              <Check className="w-3 h-3 mr-1" />
              Configured
            </Badge>
          )}
        </Label>
        <div className="relative mt-1">
          <Input
            id="botToken"
            type={showBotToken ? "text" : "password"}
            placeholder={botTokenConfigured ? "Enter new token to update..." : "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"}
            value={telegramForm.botToken}
            onChange={(e) => setTelegramForm((p) => ({ ...p, botToken: e.target.value }))}
          />
          <button
            type="button"
            onClick={() => setShowBotToken(!showBotToken)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Create a bot at <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">@BotFather</a> on Telegram
        </p>
      </div>

      {/* Bot Username */}
      <div>
        <Label htmlFor="botUsername">Bot Username</Label>
        <Input
          id="botUsername"
          placeholder="SmartSpecProBot"
          value={telegramForm.botUsername}
          onChange={(e) => setTelegramForm((p) => ({ ...p, botUsername: e.target.value }))}
          className="mt-1"
        />
        <p className="text-xs text-gray-500 mt-1">
          The bot's @username (without @) — used to generate deep links for account linking
        </p>
      </div>

      {/* App URL */}
      <div>
        <Label htmlFor="appUrl">Application URL</Label>
        <Input
          id="appUrl"
          placeholder="https://app.smartspecpro.com"
          value={telegramForm.appUrl}
          onChange={(e) => setTelegramForm((p) => ({ ...p, appUrl: e.target.value }))}
          className="mt-1"
        />
        <p className="text-xs text-gray-500 mt-1">
          Base URL for "View in SmartSpecPro" inline buttons in notifications
        </p>
      </div>

      {/* Setup Guide */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm space-y-3">
        <p className="font-semibold text-blue-800">Setup Instructions</p>
        <ol className="text-blue-700 space-y-1.5 text-xs list-decimal pl-4">
          <li>Open Telegram and search for <strong>@BotFather</strong></li>
          <li>Send <code className="bg-blue-100 px-1 rounded">/newbot</code> and follow the prompts to create a bot</li>
          <li>Copy the bot token (format: <code className="bg-blue-100 px-1 rounded">123456:ABC-DEF...</code>)</li>
          <li>Paste the token above and save settings</li>
          <li>Click "Test Connection" to verify the bot is reachable</li>
          <li>Click "Register Webhook" to enable the bot to receive verification requests</li>
          <li>Users can then link their Telegram accounts from Settings → Telegram Notifications</li>
        </ol>
      </div>

      {/* Webhook Status */}
      {webhookSecretConfigured && (
        <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 text-sm flex items-center gap-2">
          <Check className="w-4 h-4 text-green-600" />
          <span className="text-green-700">Webhook secret is configured and secured</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end border-t pt-4">
        <Button
          variant="outline"
          onClick={() => testTelegramMutation.mutate()}
          disabled={testTelegramMutation.isPending || !botTokenConfigured}
        >
          {testTelegramMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
          ) : (
            <><TestTube className="w-4 h-4 mr-2" /> Test Connection</>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => registerWebhookMutation.mutate()}
          disabled={registerWebhookMutation.isPending || !botTokenConfigured}
        >
          {registerWebhookMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Registering...</>
          ) : (
            <><Key className="w-4 h-4 mr-2" /> Register Webhook</>
          )}
        </Button>
        <Button
          onClick={() => updateTelegramMutation.mutate({
            botToken: telegramForm.botToken || undefined,
            botUsername: telegramForm.botUsername,
            appUrl: telegramForm.appUrl,
            enabled: telegramForm.enabled,
          })}
          disabled={updateTelegramMutation.isPending}
          className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600"
        >
          {updateTelegramMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Save Settings</>
          )}
        </Button>
      </div>
    </CardContent>
  </Card>
</TabsContent>
```

---

## Key Design Decisions

### 1. Icon Choice
Use **`Send`** (paper plane) icon from lucide-react to represent Telegram — this is the same icon Telegram itself uses in its logo.

### 2. Password Input Pattern
Follow the exact pattern used in SMTP and OAuth tabs:
- Password input type with show/hide toggle button
- "Configured" badge when token exists
- Placeholder text changes to "Enter new token to update..." when already configured
- Clear the token field after successful save (security best practice)

### 3. Enable/Disable Toggle
Use the same toggle switch UI pattern established in the 2FA tab — a prominent switch at the top of the form that acts as a master control.

### 4. Test & Register Buttons
Both buttons are disabled until a bot token is configured. This prevents users from attempting operations that will fail without credentials.

### 5. Webhook Secret Handling
The webhook secret is **auto-generated** by the backend on first save (see Section 04). The UI only shows a status indicator, not the secret itself — admins never need to see or manually enter it.

### 6. Setup Instructions
Provide a numbered step-by-step guide in a blue info box (matches the pattern used in SMTP and SMS tabs). This reduces support burden by teaching admins the full workflow.

---

## Validation & Error Handling

### Client-Side
- No complex validation needed — the form accepts any string for botToken and botUsername
- Buttons are disabled during mutations to prevent double-submission
- Toast notifications show success/error messages returned from the backend

### Backend Validation (handled in Section 04)
- Bot token format validation happens in the tRPC endpoint
- Test Connection calls Telegram's `getMe` API to verify the token is valid
- Register Webhook validates that botToken, botUsername, and appUrl are all configured before calling `setWebhook`

---

## Testing Checklist

Manual testing steps after implementation:

1. **Load Test**
   - Navigate to Admin Settings → Telegram Bot tab
   - Verify form loads empty if no settings exist
   - Verify form loads existing settings if previously saved

2. **Save Flow**
   - Enter a bot token (real or fake)
   - Enter bot username (e.g., "TestBot")
   - Enter app URL (e.g., "http://localhost:3000")
   - Click Save — verify success toast
   - Refresh page — verify values persisted
   - Verify bot token field is now a password input with "Configured" badge

3. **Test Connection**
   - With a valid bot token, click "Test Connection"
   - Verify success toast shows bot username
   - With an invalid token, click "Test Connection"
   - Verify error toast shows descriptive message

4. **Register Webhook**
   - With valid settings saved, click "Register Webhook"
   - Verify success toast
   - Check backend logs to confirm webhook URL was registered

5. **Enable/Disable Toggle**
   - Toggle enabled switch on/off
   - Save settings
   - Verify toggle state persists across page reload

6. **Access Control**
   - Log in as a non-admin user
   - Verify AdminSettings page redirects to home (existing behavior)
   - The Telegram tab inherits this protection automatically

---

## Notes for Implementer

- **Do NOT create new files** — all changes are in the existing `AdminSettings.tsx`
- **Follow existing patterns exactly** — copy the structure from the SMTP or SMS tabs
- **Icon import location matters** — add it alphabetically with other lucide-react imports
- **State initialization** — use empty strings for text fields, `false` for boolean fields
- **Toast library** — `sonner` is already imported at the top of the file
- **Mutation patterns** — use `.isPending` for loading state, `onSuccess`/`onError` for feedback
- **TypeScript** — the tRPC endpoints from Section 04 will provide full type safety automatically

---

## Success Criteria

This section is complete when:

1. The "Telegram Bot" tab appears in the AdminSettings sidebar navigation
2. The form saves all four fields (botToken, botUsername, appUrl, enabled) to system_settings
3. Test Connection button successfully calls Telegram's API and displays bot info
4. Register Webhook button successfully registers the webhook with Telegram
5. Bot token is masked by default and only sent to backend when explicitly changed
6. The UI matches the visual style and behavior of existing admin tabs (SMTP, SMS, 2FA)
7. Admin can enable/disable Telegram notifications without changing other settings