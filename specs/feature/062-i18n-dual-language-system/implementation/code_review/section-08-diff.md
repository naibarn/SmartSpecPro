diff --git a/apps/web/client/src/i18n/__tests__/localeFiles.test.ts b/apps/web/client/src/i18n/__tests__/localeFiles.test.ts
new file mode 100644
index 00000000..d6d9ee85
--- /dev/null
+++ b/apps/web/client/src/i18n/__tests__/localeFiles.test.ts
@@ -0,0 +1,170 @@
+/**
+ * Tests for section-08: locale JSON files validity and completeness.
+ * Validates generated JSON files against source .ts locale files.
+ */
+
+import { describe, it, expect } from "vitest";
+import { readFileSync, existsSync } from "fs";
+import { join } from "path";
+
+const LOCALES_DIR = join(import.meta.dirname, "../../locales");
+const EN_DIR = join(LOCALES_DIR, "en");
+const TH_DIR = join(LOCALES_DIR, "th");
+const SRC_DIR = join(import.meta.dirname, "../../lib/i18n/locales");
+
+function readJson(filepath: string): Record<string, string> {
+  const content = readFileSync(filepath, "utf-8");
+  return JSON.parse(content) as Record<string, string>;
+}
+
+function hasOnlyStringValues(obj: Record<string, unknown>): boolean {
+  return Object.values(obj).every((v) => typeof v === "string");
+}
+
+const ALL_EN_FILES = [
+  "admin.json", "agency.json", "auth.json", "billing.json", "chat.json",
+  "common.json", "dashboard.json", "errors.json", "help.json",
+  "marketplace.json", "media.json", "nav.json", "presentation.json",
+  "profile.json", "settings.json", "social.json", "workflow.json",
+];
+
+describe("locale JSON files — validity", () => {
+  it("all 17 en/*.json files exist and parse as valid JSON", () => {
+    expect(ALL_EN_FILES).toHaveLength(17);
+    for (const file of ALL_EN_FILES) {
+      const path = join(EN_DIR, file);
+      expect(existsSync(path), `Missing: ${file}`).toBe(true);
+      expect(() => readJson(path), `Invalid JSON: ${file}`).not.toThrow();
+    }
+  });
+
+  it("en/help.json is valid JSON with string values only", () => {
+    const data = readJson(join(EN_DIR, "help.json"));
+    expect(hasOnlyStringValues(data)).toBe(true);
+  });
+
+  it("th/help.json is valid JSON with string values only", () => {
+    const data = readJson(join(TH_DIR, "help.json"));
+    expect(hasOnlyStringValues(data)).toBe(true);
+  });
+
+  it("en/common.json is valid JSON with string values", () => {
+    const data = readJson(join(EN_DIR, "common.json"));
+    expect(hasOnlyStringValues(data)).toBe(true);
+  });
+
+  it("en/nav.json is valid JSON with string values", () => {
+    const data = readJson(join(EN_DIR, "nav.json"));
+    expect(hasOnlyStringValues(data)).toBe(true);
+  });
+
+  it("en/auth.json is valid JSON with string values", () => {
+    const data = readJson(join(EN_DIR, "auth.json"));
+    expect(hasOnlyStringValues(data)).toBe(true);
+  });
+
+  it("en/errors.json is valid JSON with string values", () => {
+    const data = readJson(join(EN_DIR, "errors.json"));
+    expect(hasOnlyStringValues(data)).toBe(true);
+  });
+
+  it("no empty string values in any en/*.json file", () => {
+    for (const file of ALL_EN_FILES) {
+      const path = join(EN_DIR, file);
+      const data = readJson(path);
+      for (const [key, value] of Object.entries(data)) {
+        expect(value, `Empty value for key "${key}" in ${file}`).not.toBe("");
+      }
+    }
+  });
+
+  it("no en/*.json file contains keys with the namespace prefix", () => {
+    // e.g., help.json must not have keys starting with "help."
+    const filePrefixMap: Record<string, string> = {
+      "help.json": "help.",
+      "chat.json": "chat.",
+      "settings.json": "settings.",
+      "media.json": "mediaStudio.",
+      "billing.json": "credits.",
+      "workflow.json": "workflows.",
+      "admin.json": "invite.",
+      "presentation.json": "editor.",
+    };
+    for (const [file, prefix] of Object.entries(filePrefixMap)) {
+      const path = join(EN_DIR, file);
+      const data = readJson(path);
+      for (const key of Object.keys(data)) {
+        expect(
+          key.startsWith(prefix),
+          `Key "${key}" in ${file} still has namespace prefix "${prefix}"`
+        ).toBe(false);
+      }
+    }
+  });
+
+  it("interpolation placeholders use {{...}} syntax", () => {
+    for (const file of ALL_EN_FILES) {
+      const data = readJson(join(EN_DIR, file));
+      for (const [key, value] of Object.entries(data)) {
+        // Should not use %(...)s or {0} style — only {{...}}
+        expect(
+          /%\([^)]+\)s/.test(value),
+          `Key "${key}" in ${file} uses Python-style interpolation`
+        ).toBe(false);
+      }
+    }
+  });
+});
+
+describe("locale JSON files — th/en key alignment", () => {
+  it("every key in th/common.json exists in en/common.json", () => {
+    const en = readJson(join(EN_DIR, "common.json"));
+    const th = readJson(join(TH_DIR, "common.json"));
+    for (const key of Object.keys(th)) {
+      expect(Object.prototype.hasOwnProperty.call(en, key), `th/common.json key "${key}" missing from en/common.json`).toBe(true);
+    }
+  });
+
+  it("every key in th/nav.json exists in en/nav.json", () => {
+    const en = readJson(join(EN_DIR, "nav.json"));
+    const th = readJson(join(TH_DIR, "nav.json"));
+    for (const key of Object.keys(th)) {
+      expect(Object.prototype.hasOwnProperty.call(en, key), `th/nav.json key "${key}" missing from en/nav.json`).toBe(true);
+    }
+  });
+
+  it("every key in th/help.json exists in en/help.json", () => {
+    const en = readJson(join(EN_DIR, "help.json"));
+    const th = readJson(join(TH_DIR, "help.json"));
+    for (const key of Object.keys(th)) {
+      expect(Object.prototype.hasOwnProperty.call(en, key), `th/help.json key "${key}" missing from en/help.json`).toBe(true);
+    }
+  });
+});
+
+describe("locale JSON files — source completeness", () => {
+  it("en/help.json contains all keys from original en.ts help.* prefix (stripped)", () => {
+    const helpJson = readJson(join(EN_DIR, "help.json"));
+    // Read source and extract help.* keys
+    const src = readFileSync(join(SRC_DIR, "en.ts"), "utf-8");
+    const helpKeys = [...src.matchAll(/^\s+"(help\.[^"]+)"/gm)].map(
+      (m) => m[1].replace(/^help\./, "")
+    );
+    expect(helpKeys.length).toBeGreaterThan(200);
+    for (const key of helpKeys) {
+      expect(Object.prototype.hasOwnProperty.call(helpJson, key), `Missing en help key: "${key}"`).toBe(true);
+    }
+  });
+
+  it("th/help.json contains all keys from original th.ts help.* prefix (stripped)", () => {
+    const helpJson = readJson(join(TH_DIR, "help.json"));
+    const src = readFileSync(join(SRC_DIR, "th.ts"), "utf-8");
+    const helpKeys = [...src.matchAll(/^\s+"(help\.[^"]+)"/gm)].map(
+      (m) => m[1].replace(/^help\./, "")
+    );
+    expect(helpKeys.length).toBeGreaterThan(100);
+    for (const key of helpKeys) {
+      expect(Object.prototype.hasOwnProperty.call(helpJson, key), `Missing th help key: "${key}"`).toBe(true);
+    }
+  });
+});
diff --git a/apps/web/client/src/i18n/__tests__/wave1-keys.test.ts b/apps/web/client/src/i18n/__tests__/wave1-keys.test.ts
new file mode 100644
index 00000000..07b7e422
--- /dev/null
+++ b/apps/web/client/src/i18n/__tests__/wave1-keys.test.ts
@@ -0,0 +1,131 @@
+/**
+ * Tests for section-08: Wave 1 namespace key requirements.
+ * Verifies that startup namespaces have all required keys.
+ */
+
+import { describe, it, expect } from "vitest";
+import { readFileSync, existsSync } from "fs";
+import { join } from "path";
+
+const EN_DIR = join(import.meta.dirname, "../../locales/en");
+const TH_DIR = join(import.meta.dirname, "../../locales/th");
+
+function readJson(filepath: string): Record<string, string> {
+  return JSON.parse(readFileSync(filepath, "utf-8")) as Record<string, string>;
+}
+
+const WAVE1_FILES = [
+  "nav.json", "auth.json", "errors.json", "common.json", "dashboard.json",
+];
+
+const REQUIRED_NAV_KEYS = [
+  "sidebar.dashboard", "sidebar.chat", "sidebar.mediaStudio", "sidebar.workflows",
+  "sidebar.agencies", "sidebar.settings", "sidebar.credits",
+  "header.search", "header.notifications", "header.signOut",
+];
+
+const REQUIRED_AUTH_KEYS = [
+  "signIn.title", "signIn.emailLabel", "signIn.passwordLabel", "signIn.submitButton",
+  "signIn.forgotPassword", "signIn.noAccount", "signIn.createAccount",
+  "signUp.title", "signUp.email", "signUp.password", "signUp.createAccount",
+  "mfa.title", "mfa.codeLabel", "mfa.submitButton",
+  "resetPassword.title", "resetPassword.emailLabel", "resetPassword.submitButton",
+  "callback.processing", "callback.error",
+];
+
+const REQUIRED_ERRORS_KEYS = [
+  "notFound.title", "notFound.message",
+  "serverError.title", "serverError.message",
+  "forbidden.title", "forbidden.message",
+  "networkError", "requestFailed",
+  "validation.required", "validation.invalidEmail", "validation.passwordTooShort",
+  "generic.somethingWentWrong", "generic.tryAgain",
+  "session.expired",
+];
+
+const REQUIRED_COMMON_KEYS = [
+  "save", "cancel", "delete", "edit", "create", "close", "back", "next",
+  "submit", "confirm", "loading", "search", "filter", "sort", "required",
+  "optional", "success", "error", "pending", "active", "inactive",
+  "retry", "refresh", "copy", "copied", "selectAll", "deselectAll",
+  "upload", "download", "export", "import", "showMore", "showLess",
+  "yes", "no", "ok",
+  "confirmDialog.title", "confirmDialog.irreversible",
+  "pagination.showing", "pagination.page", "pagination.previous", "pagination.next",
+  "emptyState.noItems", "emptyState.nothingYet", "emptyState.noResults",
+  "toast.saved", "toast.deleted", "toast.copied", "toast.failed", "toast.created",
+];
+
+describe("Wave 1 namespace files", () => {
+  it("all Wave 1 namespace files exist as valid JSON", () => {
+    for (const file of WAVE1_FILES) {
+      const path = join(EN_DIR, file);
+      expect(existsSync(path), `Missing: ${file}`).toBe(true);
+      expect(() => JSON.parse(readFileSync(path, "utf-8")), `Invalid JSON: ${file}`).not.toThrow();
+    }
+  });
+
+  it("en/nav.json has all required sidebar and header keys", () => {
+    const data = readJson(join(EN_DIR, "nav.json"));
+    for (const key of REQUIRED_NAV_KEYS) {
+      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing nav key: "${key}"`).toBe(true);
+    }
+  });
+
+  it("en/auth.json has all required auth keys", () => {
+    const data = readJson(join(EN_DIR, "auth.json"));
+    for (const key of REQUIRED_AUTH_KEYS) {
+      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing auth key: "${key}"`).toBe(true);
+    }
+  });
+
+  it("en/errors.json has all required error keys", () => {
+    const data = readJson(join(EN_DIR, "errors.json"));
+    for (const key of REQUIRED_ERRORS_KEYS) {
+      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing errors key: "${key}"`).toBe(true);
+    }
+  });
+
+  it("en/common.json has all required common keys", () => {
+    const data = readJson(join(EN_DIR, "common.json"));
+    for (const key of REQUIRED_COMMON_KEYS) {
+      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing common key: "${key}"`).toBe(true);
+    }
+  });
+
+  it("en/dashboard.json exists and is valid JSON", () => {
+    const path = join(EN_DIR, "dashboard.json");
+    expect(existsSync(path)).toBe(true);
+    expect(() => JSON.parse(readFileSync(path, "utf-8"))).not.toThrow();
+  });
+
+  it("no Wave 1 key has empty string value in en", () => {
+    for (const file of WAVE1_FILES) {
+      const data = readJson(join(EN_DIR, file));
+      for (const [key, value] of Object.entries(data)) {
+        expect(value, `Empty value for "${key}" in ${file}`).not.toBe("");
+      }
+    }
+  });
+
+  it("th/nav.json exists with required keys", () => {
+    const data = readJson(join(TH_DIR, "nav.json"));
+    for (const key of REQUIRED_NAV_KEYS) {
+      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing th nav key: "${key}"`).toBe(true);
+    }
+  });
+
+  it("th/auth.json exists with required keys", () => {
+    const data = readJson(join(TH_DIR, "auth.json"));
+    for (const key of REQUIRED_AUTH_KEYS) {
+      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing th auth key: "${key}"`).toBe(true);
+    }
+  });
+
+  it("th/errors.json exists with required keys", () => {
+    const data = readJson(join(TH_DIR, "errors.json"));
+    for (const key of REQUIRED_ERRORS_KEYS) {
+      expect(Object.prototype.hasOwnProperty.call(data, key), `Missing th errors key: "${key}"`).toBe(true);
+    }
+  });
+});
diff --git a/apps/web/client/src/locales/en/admin.json b/apps/web/client/src/locales/en/admin.json
new file mode 100644
index 00000000..630ce26d
--- /dev/null
+++ b/apps/web/client/src/locales/en/admin.json
@@ -0,0 +1,75 @@
+{
+  "admin.bonusForNewUser": "Bonus Credits for New User",
+  "admin.copyCode": "Code copied!",
+  "admin.copyLink": "Invite link copied!",
+  "admin.createCode": "Create Code",
+  "admin.created": "Invite code created",
+  "admin.customCode": "Custom Code",
+  "admin.customCodeHint": "Auto-generated if blank",
+  "admin.deactivated": "Invite code deactivated",
+  "admin.description": "Description",
+  "admin.expiresAt": "Expires At",
+  "admin.label": "Label",
+  "admin.maxUses": "Max Uses",
+  "admin.maxUsesHint": "0 = unlimited",
+  "admin.noCodes": "No invite codes yet",
+  "admin.noRegistrations": "No registrations yet",
+  "admin.registeredUsers": "Registered Users",
+  "admin.title": "Admin Invite Codes",
+  "admin.updated": "Invite code updated",
+  "bonusCredits": "+{count} bonus credits with this code",
+  "codeLabel": "Invite Code",
+  "codePlaceholder": "Enter invite code",
+  "codeRequired": "Registration requires an invite code",
+  "haveCode": "Have an invite code?",
+  "invalidCode": "Invalid invite code",
+  "inviteOnlyMessage": "Registration is by invitation only. Please enter a valid invite code to continue.",
+  "referral.copyLink": "Copy invite link",
+  "referral.earned": "+{count} credits earned",
+  "referral.joined": "{count} people joined",
+  "referral.title": "Your Referral Code",
+  "settings.allowUserInvite": "Allow users to share invite codes",
+  "settings.allowUserInviteDesc": "Each user gets a unique referral code to share",
+  "settings.authMethods": "Allowed Registration Methods",
+  "settings.authMethodsHint": "At least one method must be enabled",
+  "settings.fraudDetection": "Fraud Detection",
+  "settings.inactiveDays": "Auto-disable after days of no credit usage",
+  "settings.inactiveDaysHint": "0 = disabled. Only applies to users registered via admin invite codes.",
+  "settings.inactivePolicy": "Inactive User Policy",
+  "settings.inviteOnly": "Invite Only",
+  "settings.inviteOnlyDesc": "Only users with a valid invite code can register",
+  "settings.maxDeviceReg": "Max registrations per device",
+  "settings.maxDeviceRegHint": "0 = disabled. Block registration when same device exceeds limit.",
+  "settings.openDesc": "Anyone can register (invite code optional)",
+  "settings.openRegistration": "Open Registration",
+  "settings.referralBonus": "Referral Bonus Credits (for inviter)",
+  "settings.referralBonusDesc": "Credits given to the inviter when someone registers with their code",
+  "settings.registrationMode": "Registration Mode",
+  "settings.userReferral": "User Referral Program",
+  "stats.activeCodes": "Active Codes",
+  "stats.atOverLimit": "at/over limit",
+  "stats.autoDisabledInactivity": "auto-disabled for inactivity",
+  "stats.avgPerCode": "avg per code",
+  "stats.blockedSuspicious": "blocked for suspicious activity",
+  "stats.createFirst": "Create your first invite code to start seeing statistics",
+  "stats.disabledUsers": "Disabled Users",
+  "stats.exhausted": "exhausted",
+  "stats.expired": "expired",
+  "stats.fraudDisabled": "Fraud Disabled",
+  "stats.inactiveDisabled": "Inactive Disabled",
+  "stats.multiAccountDevices": "Multi-Account Devices",
+  "stats.noCodesYet": "No invite codes yet",
+  "stats.referrals": "referrals",
+  "stats.registrationTrend": "Registration Trend (Last 30 Days)",
+  "stats.topCodes": "Top Codes by Usage",
+  "stats.topReferrers": "Top Referrers",
+  "stats.toReferrers": "to referrers",
+  "stats.totalBonusCredits": "Total Bonus Credits",
+  "stats.totalCodes": "Total Codes",
+  "stats.totalRegistrations": "Total Registrations",
+  "stats.toUsers": "to users",
+  "stats.viaInviteCodes": "via invite codes",
+  "user.disabled": "Disabled",
+  "user.reactivate": "Reactivate",
+  "user.reactivated": "User reactivated"
+}
diff --git a/apps/web/client/src/locales/en/agency.json b/apps/web/client/src/locales/en/agency.json
new file mode 100644
index 00000000..8e0fc28a
--- /dev/null
+++ b/apps/web/client/src/locales/en/agency.json
@@ -0,0 +1,371 @@
+{
+  "category.creative": "Creative",
+  "category.custom": "Custom category...",
+  "category.engineering": "Engineering",
+  "category.none": "No category",
+  "category.operations": "Operations",
+  "category.placeholder": "Select a team category",
+  "category.presentation": "Presentation",
+  "category.research": "Research",
+  "category.support": "Support",
+  "common.approve": "Approve",
+  "common.disconnected": "Disconnected",
+  "common.lead": "Lead",
+  "common.live": "Live",
+  "common.pause": "Pause",
+  "common.reply": "Reply",
+  "common.requestChanges": "Request Changes",
+  "common.resume": "Resume",
+  "common.resumeRun": "Resume Run",
+  "common.send": "Send",
+  "common.startNewRun": "Start New Run",
+  "common.startRun": "Start Run",
+  "common.stop": "Stop",
+  "common.system": "System",
+  "common.user": "User",
+  "common.userNumber": "User #{{id}}",
+  "create.addConnectorMember": "Add Connector Member",
+  "create.addMember": "Add Member",
+  "create.addMemberHelper": "Choose what kind of member you want to add next. This setting applies only to the member you are adding right now.",
+  "create.aiRolesCount": "{{count}} AI roles",
+  "create.assistantHelp": "Use this for AI personas. The first assistant added becomes the team lead automatically.",
+  "create.assistantsCount": "Assistants: {{count}}",
+  "create.cancel": "Cancel",
+  "create.connectorName": "Connector Name",
+  "create.connectorNamePlaceholder": "e.g. Manus AI",
+  "create.connectorReference": "Connector Reference",
+  "create.connectorReferencePlaceholder": "e.g. mcp://manus-ai/main",
+  "create.connectorsCount": "Connectors: {{count}}",
+  "create.createPersona": "Create Persona",
+  "create.createTeam": "Create Team",
+  "create.customCategoryPlaceholder": "e.g. strategy, sales enablement",
+  "create.description": "Description",
+  "create.descriptionPlaceholder": "What does this team do?",
+  "create.emptyMembers": "No members added yet. Start by adding an assistant persona, then add humans or external connectors if this team needs them.",
+  "create.externalHelp": "Use this for tools, MCP endpoints, or external agent connectors.",
+  "create.hidePersonaBuilder": "Hide",
+  "create.humanHelp": "Use this when a real person from your workspace should join the team.",
+  "create.humansCount": "Humans: {{count}}",
+  "create.humanSearchPlaceholder": "Find a human member by name or email...",
+  "create.instructions": "Instructions",
+  "create.instructionsPlaceholder": "Optional notes for how the orchestrator should use this connector.",
+  "create.leadAssignedFooter": "Lead assigned to {{name}}",
+  "create.leadBadge": "Lead: {{name}}",
+  "create.leadMissing": "Lead missing",
+  "create.leadRequiredFooter": "An assistant lead is required before you can create this team",
+  "create.leadShort": "Lead",
+  "create.manualDivider": "or create manually",
+  "create.members": "Members",
+  "create.membersAdded": "{{count}} members added",
+  "create.membersHelper": "Define who belongs in this team. Add members one at a time. Only assistant members can be the team lead.",
+  "create.noPersonasFound": "No personas found yet. Create one below and it will be added to this team.",
+  "create.noUsersFound": "No users found.",
+  "create.personasExhausted": "All available personas have already been added to this team.",
+  "create.presets": "Team Presets",
+  "create.quickPersonaHelperDraftTeam": "Create a new persona here and add it to this team draft immediately.",
+  "create.quickPersonaHelperExistingTeam": "Create a persona here and add it to this team immediately.",
+  "create.quickPersonaTitle": "Quick Create Persona",
+  "create.readyNeedMember": "Add at least one member to create this team",
+  "create.readySummary": "{{count}} members ready",
+  "create.roleInTeam": "Role in this team",
+  "create.savePersona": "Save Persona",
+  "create.selectAssistantPersona": "Select an assistant persona to add...",
+  "create.setLeadTitle": "Click to set as Lead",
+  "create.step": "Step {{count}}",
+  "create.stepDetails": "Team Details",
+  "create.stepMembers": "Build the Team",
+  "create.teamCategory": "Team Category",
+  "create.teamCategoryHelper": "Optional. This is the type of team, separate from the type of each member.",
+  "create.teamLeadTitle": "Team Lead",
+  "create.teamMembers": "Team Members",
+  "create.teamName": "Team Name",
+  "create.teamNamePlaceholder": "e.g. Content Creation Team",
+  "create.title": "New Team",
+  "create.titleInTeam": "Title in Team",
+  "create.titleInTeamPlaceholder": "e.g. External Publisher",
+  "create.typeToSearchUsers": "Type to search for users in this tenant.",
+  "create.whoAreYouAdding": "Who are you adding?",
+  "edit.connectorInstructions": "Connector Instructions",
+  "edit.currentLead": "Current Lead",
+  "edit.currentLeadHelper": "This assistant is currently the team lead. To change lead, promote another assistant.",
+  "edit.displayName": "Display Name",
+  "edit.externalReference": "External Reference",
+  "edit.linkedUser": "Linked User",
+  "edit.memberRole": "Member Role",
+  "edit.notLinked": "Not linked",
+  "edit.promoteLead": "Promote this assistant to team lead",
+  "edit.roleTitle": "Role Title",
+  "edit.roleTitleAssistantPlaceholder": "e.g. Research Lead",
+  "edit.roleTitleExternalPlaceholder": "e.g. External Publisher",
+  "edit.roleTitleHumanPlaceholder": "e.g. Human Reviewer",
+  "edit.saveChanges": "Save Changes",
+  "edit.teamInstructions": "Team Instructions",
+  "edit.title": "Edit Team Member",
+  "error.blueprintNotFound": "Blueprint not found",
+  "error.connectorAlreadyAdded": "This external connector has already been added",
+  "error.connectorAlreadyInTeam": "This external connector is already in the team",
+  "error.connectorFieldsRequired": "Connector name and external reference are required",
+  "error.createTeamFailed": "Failed to create team",
+  "error.displayNameRequired": "Display name is required",
+  "error.externalReferenceRequired": "External reference is required",
+  "error.leadRequired": "At least one assistant member must be the Lead",
+  "error.orchestratorLimit": "Only one assistant member can be the orchestrator",
+  "error.personaNameRequired": "Persona name is required",
+  "error.personaTemplateRequired": "Please choose a persona template",
+  "error.userAlreadyInTeam": "This user is already in the team",
+  "manage.addConnector": "Add Connector",
+  "manage.added": "Added",
+  "manage.addMember": "Add Member",
+  "manage.addShort": "Add",
+  "manage.agentFallback": "Agent",
+  "manage.connectorInstructionsPlaceholder": "Optional notes for how this connector should be used.",
+  "manage.connectorNamePlaceholder": "e.g. OpenClaw Gateway",
+  "manage.defaultInstructions": "Follow team objectives",
+  "manage.externalReferencePlaceholder": "e.g. openclaw://main-office",
+  "manage.humanReviewer": "Human Reviewer",
+  "manage.inTeam": "In Team",
+  "manage.linkedUserId": "User #{{id}}",
+  "manage.member": "Member",
+  "manage.members": "Members",
+  "manage.noMembers": "No members yet",
+  "manage.roleTitleExternalPlaceholder": "e.g. External Automation Worker",
+  "manage.searchTenantUsers": "Search Tenant Users",
+  "manage.searchUsersPlaceholder": "Search by name or email...",
+  "manage.selectPersonaHelper": "Select a persona to add as a team member.",
+  "manage.userFallback": "User {{id}}",
+  "memberKind.assistant.description": "AI teammate with instructions and persona behavior.",
+  "memberKind.assistant.label": "Assistant Persona",
+  "memberKind.assistant.short": "Assistant",
+  "memberKind.external.description": "A connected tool or external agent the team can work with.",
+  "memberKind.external.label": "External Connector",
+  "memberKind.external.short": "Connector",
+  "memberKind.human.description": "A real teammate in your workspace who joins the team.",
+  "memberKind.human.label": "Human Member",
+  "memberKind.human.short": "Human",
+  "page.backToDashboard": "Back to Dashboard",
+  "page.backToTeam": "Back to team",
+  "page.closeSidebar": "Close teams list",
+  "page.emptyCta": "Create your first AI team to get started",
+  "page.noTeamsFound": "No teams found",
+  "page.noTeamsYet": "No teams yet",
+  "page.openSidebar": "Open teams list",
+  "page.searchPlaceholder": "Search teams...",
+  "page.selectTeam": "Select a team",
+  "page.selectTeamHint": "Choose a team from the sidebar to view rooms and conversations",
+  "page.tab.chat": "Conversation",
+  "page.tab.help": "Switch view for smaller screens",
+  "page.tab.run": "Run Monitor",
+  "page.tab.workflow": "Workflow",
+  "page.teamCounts": "{{members}} members · {{rooms}} rooms",
+  "page.title": "Teams",
+  "role.default": "Role",
+  "role.orchestrator": "Orchestrator",
+  "role.publisher": "Publisher",
+  "role.researcher": "Researcher",
+  "role.reviewer": "Reviewer",
+  "role.specialist": "Specialist",
+  "room.action.advanceOneTurn": "Advance one turn",
+  "room.action.advanceThreeTurns": "Advance three turns",
+  "room.action.approveAndPost": "Approve & Post",
+  "room.action.cancelReply": "Cancel reply",
+  "room.action.nextTurn": "Next Turn",
+  "room.action.pauseRun": "Pause run",
+  "room.action.promoteToWorkItem": "Promote to Work Item",
+  "room.action.requestChangesAndPost": "Request Changes & Post",
+  "room.action.resumeRun": "Resume run",
+  "room.action.runThree": "Run 3",
+  "room.action.stopRun": "Stop run",
+  "room.comment.promotedMessage": "Promoted a room message into a tracked work item.",
+  "room.comment.startedResearch": "Started research from the promoted room message.",
+  "room.error.coordinatorRequired": "This team needs an assistant coordinator to route work",
+  "room.error.teamContextRequired": "Team context is required before promoting this message into a work item",
+  "room.error.workItemTitleRequired": "Work item title is required",
+  "room.latestThreadUpdate": "Latest thread update",
+  "room.linkedWorkItem": "Linked work item",
+  "room.loadingHistory": "Loading room history...",
+  "room.messagePlaceholder": "Type a message to the team...",
+  "room.messageType.approval": "Approval",
+  "room.messageType.critique": "Critique",
+  "room.messageType.decision": "Decision",
+  "room.messageType.revision": "Revision",
+  "room.messageType.suggestion": "Suggestion",
+  "room.messageType.summary": "Summary",
+  "room.messageType.workUpdate": "Work Update",
+  "room.noActiveRun": "No active run",
+  "room.noActiveRunHelp": "Start a run to begin the team conversation.",
+  "room.prompt.createWorkItem": "Create a tracked work item from this message",
+  "room.prompt.followUpTitle": "Follow up: {{title}}",
+  "room.prompt.improveBeforeApproval": "What should be improved before approval?",
+  "room.prompt.reviseDraftDefault": "Please revise the draft and address the review comments in this thread.",
+  "room.quickReply.approve": "Approve",
+  "room.quickReply.approveContent": "Approved. This looks good to proceed.",
+  "room.quickReply.continue": "Continue",
+  "room.quickReply.continueContent": "Looks good so far. Please continue with the next step.",
+  "room.quickReply.needSources": "Need Sources",
+  "room.quickReply.needSourcesContent": "Please add stronger sources or citations for the key claims before we continue.",
+  "room.quickReply.requestChanges": "Request Changes",
+  "room.quickReply.requestChangesContent": "Please revise this and address the remaining gaps before the next review.",
+  "room.quickReply.reviewApproveContent": "This review looks good from my side. Please move it to the approval step.",
+  "room.replyingTo": "Replying to",
+  "room.replyingToActor": "Replying to {{name}}",
+  "room.replyPlaceholder": "Reply in this thread...",
+  "room.sourcesCount": "{{count}} source",
+  "room.threadLabel": "Thread",
+  "room.title": "Team Room",
+  "room.toast.workItemAdvanced": "Work item moved to {{stage}} stage",
+  "room.toast.workItemApproved": "Work item approved",
+  "room.toast.workItemChangesRequested": "Requested changes for this work item",
+  "room.toast.workItemCreated": "Work item created from the thread",
+  "room.unreadThreadUpdate": "Unread thread update",
+  "room.waitingForActivity": "Waiting for agent activity...",
+  "room.waitingForActivityHelp": "Agents will start responding shortly. Watch the conversation unfold in real time.",
+  "rooms.createDialogTitle": "Create Team Room",
+  "rooms.createFirstRoom": "Create First Room",
+  "rooms.createRoom": "Create Room",
+  "rooms.defaultRunModeLabel": "Default run mode:",
+  "rooms.legacyType": "Legacy",
+  "rooms.legacyTypesNote": "Legacy room types such as Direct and Job Review are hidden from new room creation until they have distinct workflows again.",
+  "rooms.newRoom": "New Room",
+  "rooms.noObjective": "No objective set",
+  "rooms.noRooms": "No rooms yet",
+  "rooms.objectiveLabel": "Objective / Goal",
+  "rooms.objectivePlaceholder": "What should this team room work on?",
+  "rooms.roomTypeHelp": "Choose the room shape first. Room type describes the collaboration setup, while run mode can still be switched later when you start work.",
+  "rooms.roomTypeLabel": "Room Type",
+  "rooms.runModeLabel": "Execution mode:",
+  "rooms.selectedRoomTypeLabel": "This room will run as",
+  "rooms.title": "Rooms",
+  "roomStatus.active": "active",
+  "roomStatus.archived": "archived",
+  "roomStatus.paused": "paused",
+  "roomType.autoTeam": "Auto Team",
+  "roomType.defaultMode.autoTeam": "Autonomous multi-turn run",
+  "roomType.defaultMode.team": "Guided team chat",
+  "roomType.description.autoTeam": "A room optimized for autonomous work by default, while still allowing you to switch back to guided team chat per run.",
+  "roomType.description.directLegacy": "Legacy room type. It currently behaves like a standard team chat and is kept only for backward compatibility.",
+  "roomType.description.jobReview": "Legacy review room. It currently behaves like a standard team room and is kept only for backward compatibility.",
+  "roomType.description.team": "A shared discussion room for normal collaboration. You can start it in guided chat mode or switch to auto-team later.",
+  "roomType.direct": "Direct",
+  "roomType.jobReview": "Job Review",
+  "roomType.team": "Team Chat",
+  "run.mode.autoTeam": "Auto Team",
+  "run.mode.teamChat": "Guided Team Chat",
+  "run.modeDescription.autoTeam": "The team can keep taking multiple turns on its own until it reaches a stop condition or needs human input.",
+  "run.modeDescription.teamChat": "The team moves one step at a time with the user staying in the loop and deciding when to continue.",
+  "run.modeHelp": "Run mode controls how aggressively the team continues on its own for this run. You can choose guided chat or autonomous work without recreating the room.",
+  "run.modeLabel": "Run Mode",
+  "run.objectiveLabel": "Objective",
+  "run.objectivePlaceholder": "Describe what the team should work on...",
+  "run.reason.awaitingExternalMember": "Waiting for an external connector member to respond before continuing.",
+  "run.reason.awaitingHumanApproval": "Waiting for a human member to review or approve the next step.",
+  "run.reason.endedWithReason": "Run ended: {{reason}}",
+  "run.reason.paused": "Run is paused.",
+  "run.reason.pausedWithReason": "Run paused: {{reason}}",
+  "run.reason.userPaused": "Run is paused. Resume when you're ready.",
+  "run.reason.userStopped": "Run stopped by the user. You can start a new run anytime.",
+  "run.start": "Start",
+  "run.startTitle": "Start Run",
+  "runMonitor.agentRoster": "Agent Roster",
+  "runMonitor.agents": "Agents",
+  "runMonitor.events": "Events",
+  "runMonitor.nextTurnButton": "Next Turn",
+  "runMonitor.pauseButton": "Pause",
+  "runMonitor.resumeButton": "Resume",
+  "runMonitor.runStatusLabel": "Run {{status}}",
+  "runMonitor.runThreeTurnsButton": "Run 3 Turns",
+  "runMonitor.startNewRunButton": "Start New Run",
+  "runMonitor.status.completed": "completed",
+  "runMonitor.status.failed": "failed",
+  "runMonitor.status.paused": "paused",
+  "runMonitor.status.queued": "queued",
+  "runMonitor.status.running": "running",
+  "runMonitor.status.stopped": "stopped",
+  "runMonitor.stopButton": "Stop",
+  "runMonitor.timeline": "Event Timeline",
+  "runMonitor.title": "Run Monitor",
+  "runMonitor.tokens": "Tokens",
+  "runMonitor.turnsShort": "{{count}}t",
+  "runMonitor.waitingForEvents": "Waiting for events...",
+  "toast.blueprintLoaded": "Loaded {{name}}",
+  "toast.memberAdded": "Member added",
+  "toast.memberUpdated": "Member updated",
+  "toast.personaCreated": "Persona created",
+  "toast.personaCreatedAndAdded": "Persona created and added to the team",
+  "toast.roomCreated": "Room created",
+  "toast.runAdvanced": "Advanced {{count}} turn",
+  "toast.runAdvanceRequested": "Advance request sent for {{count}} turn",
+  "toast.runPaused": "Run paused",
+  "toast.runResumed": "Run resumed",
+  "toast.runStarted": "Run started",
+  "toast.runStopped": "Run stopped",
+  "toast.teamCreated": "Team created",
+  "workflow.action.advance": "Advance",
+  "workflow.action.sendToApproval": "Send To Approval",
+  "workflow.action.sendToReview": "Send To Review",
+  "workflow.action.startResearch": "Start Research",
+  "workflow.approvalLabel": "Approval",
+  "workflow.approveAndResume": "Approve & Resume",
+  "workflow.artifactCount": "{{count}} artifact",
+  "workflow.count.awaitingApproval": "Awaiting Approval",
+  "workflow.count.completed": "Completed",
+  "workflow.count.inReview": "In Review",
+  "workflow.count.open": "Open",
+  "workflow.currentObjective": "Current Objective",
+  "workflow.description": "Every work item is tracked here so the team can review, revise, and approve together.",
+  "workflow.draftReady": "Draft ready",
+  "workflow.dueAt": "Due {{value}}",
+  "workflow.emptyDescription": "Start a run in this room and the orchestrator will create the kickoff work item automatically.",
+  "workflow.emptyFilterDescription": "Try switching filters to see the rest of the workflow queue.",
+  "workflow.emptyFilterTitle": "No items match this filter",
+  "workflow.emptyTitle": "No work items yet",
+  "workflow.error.assistantCoordinatorRequired": "This team needs at least one assistant member to route work",
+  "workflow.error.noApprover": "No approver is available for this work item",
+  "workflow.filter.all": "All",
+  "workflow.filter.attention": "Needs Attention",
+  "workflow.filter.blocked": "Blocked / Approval",
+  "workflow.loadErrorDescription": "The room run may have started, but the work-item store failed to load. Check the server log or database schema.",
+  "workflow.loadErrorTitle": "Unable to load the workflow board",
+  "workflow.loading": "Loading work items...",
+  "workflow.nextStage": "the next",
+  "workflow.openThread": "Open Thread",
+  "workflow.pause.externalRequired": "External Action Required",
+  "workflow.pause.humanRequired": "Human Action Required",
+  "workflow.pause.runPaused": "Run Paused",
+  "workflow.pause.waitingItems": "Waiting on {{count}} work item below.",
+  "workflow.prompt.improveBeforeRevision": "What should the team improve before the next revision?",
+  "workflow.prompt.reviseLatestDraft": "Please revise the latest draft and address the review comments.",
+  "workflow.recommended.approvalNeeded": "Approval decision needed",
+  "workflow.recommended.needsHumanApproval": "Needs human approval",
+  "workflow.recommended.needsHumanReview": "Needs human review",
+  "workflow.recommended.needsRecovery": "Needs recovery",
+  "workflow.recommended.noFurtherAction": "No further action",
+  "workflow.recommended.prepareReview": "Prepare for review",
+  "workflow.recommended.readyToResume": "Ready to resume",
+  "workflow.recommended.reviewFeedbackPending": "Review feedback pending",
+  "workflow.recommended.reviewNextStep": "Review next step",
+  "workflow.recommended.reviseContinue": "Revise and continue",
+  "workflow.recommended.startResearch": "Start research",
+  "workflow.recommended.unblockFirst": "Unblock before continuing",
+  "workflow.recommended.waitingExternal": "Waiting on external connector",
+  "workflow.researchLabel": "Research",
+  "workflow.reviewLabel": "Review",
+  "workflow.reviseAndResume": "Revise & Resume",
+  "workflow.status.awaiting_approval": "Awaiting Approval",
+  "workflow.status.blocked": "Blocked",
+  "workflow.status.cancelled": "Cancelled",
+  "workflow.status.completed": "Completed",
+  "workflow.status.failed": "Failed",
+  "workflow.status.in_progress": "In Progress",
+  "workflow.status.in_review": "In Review",
+  "workflow.status.needs_revision": "Needs Revision",
+  "workflow.status.planned": "Planned",
+  "workflow.status.superseded": "Superseded",
+  "workflow.status.unknown": "Unknown",
+  "workflow.title": "Workflow Board",
+  "workflow.toast.revisionSentBack": "Revision sent back for follow-up",
+  "workflow.unassigned": "Unassigned",
+  "workflow.unreadThreadActivity": "Unread thread activity",
+  "workflow.updatedAt": "Updated {{value}}",
+  "workflow.waitingForExternal": "Waiting for External",
+  "workflow.waitingForHuman": "Waiting for Human"
+}
diff --git a/apps/web/client/src/locales/en/auth.json b/apps/web/client/src/locales/en/auth.json
new file mode 100644
index 00000000..1dcc5371
--- /dev/null
+++ b/apps/web/client/src/locales/en/auth.json
@@ -0,0 +1,21 @@
+{
+  "callback.error": "Authentication failed. Please try again.",
+  "callback.processing": "Processing your sign-in…",
+  "mfa.codeLabel": "Authentication Code",
+  "mfa.submitButton": "Verify",
+  "mfa.title": "Two-Factor Authentication",
+  "resetPassword.emailLabel": "Email Address",
+  "resetPassword.submitButton": "Send Reset Link",
+  "resetPassword.title": "Reset Password",
+  "signIn.createAccount": "Create account",
+  "signIn.emailLabel": "Email",
+  "signIn.forgotPassword": "Forgot password?",
+  "signIn.noAccount": "Don't have an account?",
+  "signIn.passwordLabel": "Password",
+  "signIn.submitButton": "Sign In",
+  "signIn.title": "Sign In",
+  "signUp.createAccount": "Create Account",
+  "signUp.email": "Email",
+  "signUp.password": "Password",
+  "signUp.title": "Create Account"
+}
diff --git a/apps/web/client/src/locales/en/billing.json b/apps/web/client/src/locales/en/billing.json
new file mode 100644
index 00000000..fe32492e
--- /dev/null
+++ b/apps/web/client/src/locales/en/billing.json
@@ -0,0 +1,79 @@
+{
+  "buyCredits.browse": "Need more credits? Browse {{count}} packages",
+  "buyCredits.collapsed": "{{count}} packages available - click to expand",
+  "buyCredits.cta": "Buy",
+  "buyCredits.descriptionExpanded": "Choose a package that fits your needs (15% markup from base rate)",
+  "buyCredits.noPackages": "No packages available",
+  "buyCredits.oneTime": "one-time",
+  "buyCredits.popular": "Popular",
+  "buyCredits.title": "Buy Credits",
+  "creatorEarnings.breakdownTitle": "Earnings by Entity",
+  "creatorEarnings.entities.creator_revenue": "Creator Revenue",
+  "creatorEarnings.entities.media": "Media",
+  "creatorEarnings.entities.other": "Other",
+  "creatorEarnings.entities.template": "Template",
+  "creatorEarnings.entities.workflow": "Workflow",
+  "creatorEarnings.last30Days": "Last 30 Days",
+  "creatorEarnings.runs": "{{count}} runs",
+  "creatorEarnings.title": "Creator Earnings",
+  "creatorEarnings.totalEarned": "Total Earned",
+  "creatorEarnings.totalRuns": "Total Runs",
+  "description": "Manage your credit balance",
+  "meta.billing": "Billing",
+  "meta.images": "Images",
+  "meta.job": "Job",
+  "meta.media": "Media",
+  "meta.model": "Model",
+  "meta.operation": "Op",
+  "meta.prompt": "Prompt",
+  "meta.provider": "Provider",
+  "meta.skill": "Skill",
+  "meta.stage": "Stage",
+  "meta.task": "Task",
+  "meta.tokens": "Tokens",
+  "pagination.page": "Page {{page}} • {{count}} items",
+  "sources.admin": "Admin",
+  "sources.agency": "Agency",
+  "sources.alert": "Alert",
+  "sources.automation": "Automation",
+  "sources.brainstorm": "Brainstorm",
+  "sources.chat": "Chat",
+  "sources.creatorRevenue": "Creator Revenue",
+  "sources.indexing": "Indexing",
+  "sources.mediaAudio": "Audio",
+  "sources.mediaImage": "Image",
+  "sources.mediaVideo": "Video",
+  "sources.other": "Other",
+  "sources.search": "Search",
+  "sources.skill": "Skill",
+  "sources.stt": "STT",
+  "sources.translate": "Translate",
+  "stats.creditsUsed30d": "Credits Used (30d)",
+  "stats.currentBalance": "Current Balance",
+  "stats.totalPurchased": "Total Purchased",
+  "stats.transactions": "Transactions",
+  "table.audit": "Audit",
+  "table.balance": "Balance",
+  "table.credits": "Credits",
+  "table.date": "Date",
+  "table.description": "Description",
+  "table.details": "Details",
+  "table.source": "Source",
+  "table.type": "Type",
+  "time.daysAgo": "{{count}}d ago {{time}}",
+  "time.hoursAgo": "{{count}}h ago ({{time}})",
+  "time.justNow": "Just now",
+  "time.minutesAgo": "{{count}} min ago",
+  "time.yesterday": "Yesterday {{time}}",
+  "title": "Credits",
+  "transactionHistory.allSources": "All Sources",
+  "transactionHistory.description": "Recent balance movements, purchases, and usage events.",
+  "transactionHistory.empty": "No transactions yet",
+  "transactionHistory.eyebrow": "Billing",
+  "transactionHistory.title": "Transaction History",
+  "transactionType.bonus": "Bonus",
+  "transactionType.other": "Other",
+  "transactionType.purchase": "Purchase",
+  "transactionType.usage": "Usage",
+  "unit": "credits"
+}
diff --git a/apps/web/client/src/locales/en/chat.json b/apps/web/client/src/locales/en/chat.json
new file mode 100644
index 00000000..c58de59b
--- /dev/null
+++ b/apps/web/client/src/locales/en/chat.json
@@ -0,0 +1,51 @@
+{
+  "agencies": "Agencies",
+  "agencyDetected": "Agency detected: {{name}}",
+  "agencyDetectedHint": "Your message may be better handled by this agency team.",
+  "agencyMessagePlaceholder": "Message {{name}}...",
+  "agencyNoActivity": "No activity yet. Send the prompt below and the agency will stream its work here.",
+  "agencyPanelCollapsed": "Panel collapsed. Expand to view live output and send another prompt.",
+  "agencyPanelHint": "Send a prompt to start this agency run. Live output will appear below once the run begins.",
+  "agencyRunning": "Agency running... {{agent}}",
+  "alerts": "Alerts",
+  "artifacts": "Artifacts",
+  "browserInstructionPlaceholder": "Example: Find the best site for this task, compare options, and continue.",
+  "browserSession": "Browser Session",
+  "browserSession.opened": "Opened Browser Session from Chat.",
+  "browserSession.queued": "Instruction queued for this Browser Session.",
+  "browserSession.queueFailed": "Failed to queue Browser Session instruction.",
+  "browserSession.returned": "Browser Session returned to Chat.",
+  "browserSession.returnLabel": "Return to Chat",
+  "browserSessionDescription": "Let AI work in a live browser directly from this chat.",
+  "browserSessionHint": "Start a Browser Session to let AI discover sites, navigate pages, and continue working while you stay in Chat.",
+  "chooseBrowserSkill": "Choose a browser skill",
+  "collapseAgencyPanel": "Collapse agency panel",
+  "connecting": "Connecting...",
+  "conversationEyebrow": "Conversation",
+  "currentAgent": "Current agent: {{agent}}.",
+  "dismiss": "Dismiss",
+  "expandAgencyPanel": "Expand agency panel",
+  "exploreAgencies": "Explore Agencies",
+  "hideSidebar": "Hide sidebar",
+  "memory": "Memory",
+  "newChat": "New Chat",
+  "openBrowserSession": "Open Browser Session",
+  "queuingInstruction": "Queuing Instruction...",
+  "quickBrowserInstruction": "Quick Browser Instruction",
+  "quickBrowserInstructionDesc": "Describe the next result you want or the step AI should take without leaving Chat.",
+  "retry": "Retry",
+  "runAgain": "Run again",
+  "runAgency": "Run Agency",
+  "runAgencyInline": "Run an agency inline",
+  "running": "Running...",
+  "sendBrowserInstruction": "Send Browser Instruction",
+  "showSidebar": "Show sidebar",
+  "skills": "Skills",
+  "startBrowserSession": "Start Browser Session",
+  "startNewChat": "Start New Chat",
+  "startRun": "Start run",
+  "title": "AI Chat",
+  "useAgency": "Use Agency",
+  "welcomeDescription": "Start a new conversation or select one from the sidebar.",
+  "welcomeTitle": "Welcome to AI Chat"
+}
diff --git a/apps/web/client/src/locales/en/common.json b/apps/web/client/src/locales/en/common.json
new file mode 100644
index 00000000..54ab39d4
--- /dev/null
+++ b/apps/web/client/src/locales/en/common.json
@@ -0,0 +1,103 @@
+{
+  "active": "Active",
+  "admin.critical": "Critical",
+  "admin.title": "Notification Center",
+  "admin.today": "Today",
+  "admin.total": "Total",
+  "admin.unread": "Unread",
+  "alertRules.cooldown": "Cooldown (minutes)",
+  "alertRules.create": "Create Alert Rule",
+  "alertRules.enabled": "Enabled",
+  "alertRules.metric": "Metric",
+  "alertRules.name": "Rule Name",
+  "alertRules.operator": "Operator",
+  "alertRules.threshold": "Threshold",
+  "alertRules.title": "Alert Rules",
+  "back": "Back",
+  "cancel": "Cancel",
+  "category.agency": "Agencies",
+  "category.business": "Business",
+  "category.feedback": "Feedback",
+  "category.follow": "Follows",
+  "category.media_jobs": "Media Jobs",
+  "category.scheduled": "Scheduled Messages",
+  "category.security": "Security",
+  "category.skill": "Skills",
+  "category.system_health": "System Health",
+  "category.workflow": "Workflows",
+  "change": "Change",
+  "clear": "Clear",
+  "close": "Close",
+  "confirm": "Confirm",
+  "confirmDialog.irreversible": "This action cannot be undone.",
+  "confirmDialog.title": "Are you sure?",
+  "copied": "Copied to clipboard",
+  "copy": "Copy",
+  "create": "Create",
+  "delete": "Delete",
+  "deselectAll": "Deselect All",
+  "download": "Download",
+  "edit": "Edit",
+  "emptyState.noItems": "No items found.",
+  "emptyState.noResults": "No results for your search.",
+  "emptyState.nothingYet": "Nothing here yet.",
+  "error": "Error",
+  "escalation.target": "Escalation Target",
+  "escalation.title": "Escalation Policies",
+  "escalation.triggerMinutes": "Trigger After (minutes)",
+  "escalation.triggerSeverity": "Trigger Severity",
+  "example": "Example",
+  "export": "Export",
+  "filter": "Filter",
+  "group.expand": "Expand Group",
+  "group.latest": "Latest",
+  "group.occurrences": "Occurrences",
+  "import": "Import",
+  "inactive": "Inactive",
+  "loading": "Loading…",
+  "next": "Next",
+  "no": "No",
+  "ok": "OK",
+  "optional": "Optional",
+  "output": "Output",
+  "pagination.next": "Next",
+  "pagination.page": "Page {{page}}",
+  "pagination.previous": "Previous",
+  "pagination.showing": "Showing {{from}}–{{to}} of {{total}}",
+  "pending": "Pending",
+  "previous": "Previous",
+  "refresh": "Refresh",
+  "required": "Required",
+  "retry": "Retry",
+  "save": "Save",
+  "saveChanges": "Save Changes",
+  "search": "Search...",
+  "selectAll": "Select All",
+  "settings.email": "Email",
+  "settings.inApp": "In-App",
+  "settings.minSeverity": "Minimum Severity",
+  "settings.mute": "Mute",
+  "settings.save": "Save Preferences",
+  "settings.telegram": "Telegram",
+  "settings.title": "Notification Preferences",
+  "showLess": "Show Less",
+  "showMore": "Show More",
+  "sort": "Sort",
+  "submit": "Submit",
+  "success": "Success",
+  "toast.copied": "Copied to clipboard",
+  "toast.created": "Created successfully",
+  "toast.deleted": "Deleted successfully",
+  "toast.failed": "Operation failed",
+  "toast.saved": "Saved successfully",
+  "update": "Update",
+  "upload": "Upload",
+  "webhooks.categories": "Categories",
+  "webhooks.create": "Create Webhook",
+  "webhooks.name": "Webhook Name",
+  "webhooks.secret": "Signing Secret",
+  "webhooks.test": "Test Webhook",
+  "webhooks.title": "Notification Webhooks",
+  "webhooks.url": "Webhook URL",
+  "yes": "Yes"
+}
diff --git a/apps/web/client/src/locales/en/dashboard.json b/apps/web/client/src/locales/en/dashboard.json
new file mode 100644
index 00000000..0967ef42
--- /dev/null
+++ b/apps/web/client/src/locales/en/dashboard.json
@@ -0,0 +1 @@
+{}
diff --git a/apps/web/client/src/locales/en/errors.json b/apps/web/client/src/locales/en/errors.json
new file mode 100644
index 00000000..43d1881a
--- /dev/null
+++ b/apps/web/client/src/locales/en/errors.json
@@ -0,0 +1,16 @@
+{
+  "forbidden.message": "You don't have permission to access this resource.",
+  "forbidden.title": "Access Forbidden",
+  "generic.somethingWentWrong": "Something went wrong. Please try again.",
+  "generic.tryAgain": "Try Again",
+  "networkError": "Network error. Please check your connection.",
+  "notFound.message": "The page you're looking for doesn't exist.",
+  "notFound.title": "Page Not Found",
+  "requestFailed": "The request failed. Please try again.",
+  "serverError.message": "An internal server error occurred.",
+  "serverError.title": "Server Error",
+  "session.expired": "Your session has expired. Please sign in again.",
+  "validation.invalidEmail": "Please enter a valid email address.",
+  "validation.passwordTooShort": "Password must be at least 8 characters.",
+  "validation.required": "This field is required."
+}
diff --git a/apps/web/client/src/locales/en/help.json b/apps/web/client/src/locales/en/help.json
new file mode 100644
index 00000000..1d07a546
--- /dev/null
+++ b/apps/web/client/src/locales/en/help.json
@@ -0,0 +1,310 @@
+{
+  "agencies.1": "Agencies are multi-agent teams that work together to complete complex tasks.",
+  "agencies.2": "Each agency has specialized agents (researcher, writer, planner) that collaborate automatically.",
+  "agencies.3": "Access agencies via the Agencies button in the toolbar or the Explore Agencies button on the welcome screen.",
+  "agencies.4": "Agencies produce structured output such as research reports, storyboards, presentation decks, and comparisons.",
+  "agencies.commit.col.button": "Button Label",
+  "agencies.commit.col.dest": "Where It Goes",
+  "agencies.commit.col.type": "Preview Type",
+  "agencies.commit.deck.button": "Save as Presentation",
+  "agencies.commit.deck.dest": "Redirects to Presentation Editor automatically",
+  "agencies.commit.deck.type": "Presentation Deck",
+  "agencies.commit.research.button": "Save to Library",
+  "agencies.commit.research.dest": "Library (toast shows View in Library link)",
+  "agencies.commit.research.type": "Research / Storyboard / Comparison",
+  "agencies.commit.title": "Save actions by type",
+  "agencies.howToStart.1": "Click Agencies in the Chat toolbar (or Explore Agencies on the welcome screen).",
+  "agencies.howToStart.2": "Browse available agencies or create one from a template (Deep Research, Storyboard Planner, Deck Builder).",
+  "agencies.howToStart.3": "Open an agency and type your request in the Agency Chat.",
+  "agencies.howToStart.4": "The agents work together automatically. When finished, a Preview Card appears.",
+  "agencies.howToStart.5": "Review the preview and click Save to commit it to your Library or Presentation Editor.",
+  "agencies.howToStart.title": "How to get started",
+  "agencies.other.1": "Click the X button on a Preview Card to dismiss it without saving.",
+  "agencies.other.2": "If the preview fails to load, a red error toast appears. Send the same message again to retry.",
+  "agencies.other.3": "If the save fails, the button changes to Retry Save. Click it to try again.",
+  "agencies.other.title": "Other actions",
+  "agencies.preview.committed": "Committed",
+  "agencies.preview.committed.desc": "Saved successfully. For decks you are redirected to the Presentation Editor. For other types a View in Library link appears in the toast.",
+  "agencies.preview.expired": "Expired",
+  "agencies.preview.expired.desc": "The preview timed out before you saved it. Run the agency again to get a fresh preview.",
+  "agencies.preview.failed": "Save Failed",
+  "agencies.preview.failed.desc": "Something went wrong. A Retry Save button appears so you can try again.",
+  "agencies.preview.ready": "Preview Ready",
+  "agencies.preview.ready.desc": "The agents finished. Review the preview and decide whether to save.",
+  "agencies.preview.saving": "Saving...",
+  "agencies.preview.saving.desc": "Commit is in progress.",
+  "agencies.preview.title": "Preview card states",
+  "agencies.templates.title": "Available agency templates",
+  "agencies.title": "Agencies — Multi-Agent Teams",
+  "agencies.tpl.comparison.desc": "Side-by-side options with pricing, availability, evidence links, and recommendations.",
+  "agencies.tpl.comparison.example": "\"Compare 5 hotels in Chiang Mai under 3000 THB/night\"",
+  "agencies.tpl.comparison.name": "Comparison Agent",
+  "agencies.tpl.comparison.output": "Comparison Table",
+  "agencies.tpl.deck.desc": "Full slide deck with titles, bullet points, speaker notes, and graphic suggestions. Saves directly to the Presentation Editor.",
+  "agencies.tpl.deck.example": "\"Build a Q4 earnings presentation with 8 slides\"",
+  "agencies.tpl.deck.name": "Deck Builder",
+  "agencies.tpl.deck.output": "Presentation Deck",
+  "agencies.tpl.research.desc": "Multi-source research with executive summary, key findings, sections, and recommendations.",
+  "agencies.tpl.research.example": "\"Research AI marketing trends in Southeast Asia 2026\"",
+  "agencies.tpl.research.name": "Deep Research",
+  "agencies.tpl.research.output": "Research Report",
+  "agencies.tpl.storyboard.desc": "Scene-by-scene video plan with dialogue, camera angles, lighting, and audio/video prompts.",
+  "agencies.tpl.storyboard.example": "\"Create a 60-second product launch storyboard for a fitness app\"",
+  "agencies.tpl.storyboard.name": "Storyboard Planner",
+  "agencies.tpl.storyboard.output": "Video Storyboard",
+  "best.1": "Start with the result you want. Example: \"Find the best three vendors for X and explain the tradeoffs.\"",
+  "best.2": "Say what to avoid. Example: \"Avoid marketplaces, sponsored listings, and sites with unclear pricing.\"",
+  "best.3": "Tell the AI when to stop and wait. Example: \"Pause before payment, login confirmation, or OTP.\"",
+  "best.4": "Ask for structure. Example: \"Return a ranked comparison with pros, cons, and final recommendation.\"",
+  "best.5": "Use follow-up instructions instead of restarting. Example: \"Narrow to options available in Bangkok only.\"",
+  "best.title": "Best practices",
+  "browser.1": "Use Browser Session when the task requires live websites, comparison across pages, or a real browser workflow.",
+  "browser.2": "Start Browser Session from Chat, then continue in the live workspace or keep sending quick browser instructions from Chat.",
+  "browser.3": "Browser Session is best for finding websites, navigating pages, comparing options, and pausing for approval-sensitive steps.",
+  "browser.title": "Browser Session",
+  "chatBasics.1": "Type a normal message to chat with the selected model.",
+  "chatBasics.2": "Use the model picker at the top of the conversation to switch the active LLM.",
+  "chatBasics.3": "Use AI Teams when you want multiple models to collaborate on a task — go to the Teams page to start a team discussion.",
+  "chatBasics.4": "Attach files or images when the task depends on source material.",
+  "chatBasics.title": "Chat basics",
+  "chatBestFor.body": "Chat is the fastest place to ask for answers, drafts, brainstorming, prompt building, analysis, and follow-up work. Start here when you want direct interaction with an AI model and only move into Browser Session or Agencies when the task needs a different execution surface.",
+  "chatBestFor.title": "What Chat is best for",
+  "description": "Use Browser Session when you want AI to find websites, browse pages, compare options, and continue working in a live browser for you.",
+  "media.1": "Use Generate Image to seed the prompt with create image: and describe the visual outcome you want.",
+  "media.2": "Use Generate Video to seed the prompt with create video: for motion-focused outputs.",
+  "media.3": "Use Generate Audio when you want voice, music, or sound generation.",
+  "media.4": "Use the prompt-enhance action when you already typed a rough image idea and want the system to improve it first.",
+  "media.5": "You can attach a reference image and ask the model to edit or extend it.",
+  "media.title": "Image, video, and audio generation",
+  "memory.auto.1": "The AI automatically extracts facts from your conversations and saves them.",
+  "memory.auto.2": "Low-importance facts are saved silently. High-importance ones prompt for confirmation.",
+  "memory.auto.3": "Personal info (emails, passwords, API keys) is automatically filtered out and never saved.",
+  "memory.auto.4": "Memories last 180 days unless accessed. Rules are never auto-deleted.",
+  "memory.auto.title": "Automatic memory",
+  "memory.intro": "Memory lets the AI remember your preferences, project context, decisions, and important facts across all conversations. Open the Memory panel in the right sidebar to manage everything.",
+  "memory.manage.1": "Add: Click the + Add button, choose a type, name it, write the content, and set importance (1-10).",
+  "memory.manage.2": "Delete: Hover over a memory and click the trash icon.",
+  "memory.manage.3": "Filter: Use the type filter buttons (All, User, Project, Preference, etc.) to find specific memories.",
+  "memory.manage.4": "Importance: Higher scores (8-10) mean the AI always considers this fact. Lower scores (1-4) are nice-to-know.",
+  "memory.manage.title": "Managing memories",
+  "memory.modes.full.desc": "AI remembers everything: your preferences, project facts, decisions, rules, plus summaries of older conversations.",
+  "memory.modes.full.name": "Full Memory (default)",
+  "memory.modes.nolong.desc": "AI sees only recent messages and old summaries. Forgets preferences and project facts. Good for a fresh perspective.",
+  "memory.modes.nolong.name": "No Long Memory",
+  "memory.modes.off.desc": "AI sees only the current conversation. Nothing from before. Best for privacy or sensitive topics.",
+  "memory.modes.off.name": "Memory Off",
+  "memory.modes.title": "Memory modes",
+  "memory.projects.1": "Tag conversations with a project name in the Memory panel.",
+  "memory.projects.2": "All memories created in that project are available in any chat tagged with the same project.",
+  "memory.projects.3": "Global memories (no project tag) are visible in all your chats.",
+  "memory.projects.title": "Projects and cross-chat memory",
+  "memory.summary.1": "When old messages reach 70% of the model's context window, the AI creates a summary automatically.",
+  "memory.summary.2": "Summaries capture key decisions, action items, and important context from older messages.",
+  "memory.summary.3": "When 2+ summaries exist, they are consolidated into one meta-summary to keep context efficient.",
+  "memory.summary.4": "Use the Compact button to force summarization manually. Use Clear Old to delete memories older than 1/3/6 months.",
+  "memory.summary.title": "Auto-summarization and compaction",
+  "memory.tips.1": "Be specific: \"I prefer readable variable names and JSDoc comments\" beats \"I prefer good code\".",
+  "memory.tips.2": "One fact per memory — makes it easier to update or delete individual items later.",
+  "memory.tips.3": "Use Rules (importance 10) for hard constraints like \"Always use HTTPS\" or \"Never commit secrets\".",
+  "memory.tips.4": "Update when things change — delete outdated memories and add new ones.",
+  "memory.tips.title": "Tips for better memory",
+  "memory.title": "Memory",
+  "memory.types.architecture": "Architecture — System design, module structure, patterns.",
+  "memory.types.decision": "Decision — Important choices made during work.",
+  "memory.types.plan": "Plan — Roadmaps, milestones, next steps.",
+  "memory.types.preference": "Preference — How you like to work: tools, coding style, communication.",
+  "memory.types.project": "Project — Project name, purpose, tech stack, goals.",
+  "memory.types.rule": "Rule — Hard constraints the AI must always follow. Importance 10, never auto-deleted.",
+  "memory.types.task": "Task — To-do items and action items.",
+  "memory.types.technical": "Technical — Frameworks, databases, APIs you use.",
+  "memory.types.title": "Memory types",
+  "memory.types.user": "User — Facts about you: role, expertise, name.",
+  "memory.what.1": "Preferences and style — how you like to work, tools you prefer.",
+  "memory.what.2": "Project details — tech stack, goals, team names.",
+  "memory.what.3": "Decisions and plans — what has been decided, milestones, next steps.",
+  "memory.what.4": "Technical knowledge — frameworks, databases, APIs, architecture patterns.",
+  "memory.what.5": "Rules — hard constraints the AI must always follow.",
+  "memory.what.title": "What Memory stores",
+  "orchestrator.autoStop.1": "Stop policies are actively enforced every 30 seconds by an automatic checker.",
+  "orchestrator.autoStop.2": "If any condition triggers (max rounds, budget, duration, idle timeout), the run stops automatically.",
+  "orchestrator.autoStop.3": "The checker starts on run creation and pauses/resumes with the run.",
+  "orchestrator.autoStop.title": "Auto-Stop Policy",
+  "orchestrator.interAgent.1": "System broadcasts alert all active runs when a critical event occurs (e.g., all providers down).",
+  "orchestrator.interAgent.2": "Each run receives an impact assessment: Critical, Degraded, or Unaffected.",
+  "orchestrator.interAgent.3": "Automation handoffs let agents trigger external tasks (media generation, browser sessions).",
+  "orchestrator.interAgent.title": "Inter-Agent Communication",
+  "orchestrator.intro": "The AI Team Orchestrator lets you create teams of AI agents that collaborate in real-time conversations. Each agent has its own persona, expertise, and role — working together to research, write, review, and produce results.",
+  "orchestrator.memory.1": "Each agent has private memory that other agents cannot see. Team-level memory is shared among all members.",
+  "orchestrator.memory.2": "Memory scopes (from most to least specific): Agent → Run → Room → Team → Project → User.",
+  "orchestrator.memory.3": "Search uses hybrid retrieval: keyword matching + vector similarity for the most relevant results.",
+  "orchestrator.memory.4": "Promote a memory from agent-scope to team-scope to share a discovery with the whole team.",
+  "orchestrator.memory.5": "Memory types include: Fact, Rule, Preference, Decision, Note, Checklist, and Episode.",
+  "orchestrator.memory.title": "Scoped Memory",
+  "orchestrator.monitoring.1": "The Run Monitor panel shows live events, agent status (active/idle), and cost counters in real-time.",
+  "orchestrator.monitoring.2": "Event timeline displays each agent action: messages, tool calls, handoffs, decisions, and errors.",
+  "orchestrator.monitoring.3": "Stuck detection: if an agent hasn't produced output for 2 minutes, you'll get a notification.",
+  "orchestrator.monitoring.4": "Notifications appear for: run completed, budget warning, agent stuck, and system alerts.",
+  "orchestrator.monitoring.title": "Monitoring & Notifications",
+  "orchestrator.rooms.1": "A Room is where team conversations happen. Create a room by selecting a team and describing the goal.",
+  "orchestrator.rooms.2": "Room types: Team (collaborative), Direct (1-on-1 with an agent), Auto Team (system-managed), Job Review (structured review).",
+  "orchestrator.rooms.3": "Three view modes control what you see: Transparent (everything), Milestone (key decisions only), Summary (final summaries only).",
+  "orchestrator.rooms.4": "You can send messages to all agents or target a specific agent. Agents can be muted if you want to exclude them temporarily.",
+  "orchestrator.rooms.title": "Team Rooms",
+  "orchestrator.runs.1": "A Run is an automated work session. Start a run by describing the objective and setting a stop policy.",
+  "orchestrator.runs.2": "Stop policies control when the run ends: max rounds, time limit, budget cap, idle timeout, or when the lead summarizes.",
+  "orchestrator.runs.3": "You can Pause a running session to review progress, Resume to continue, or Stop to end it immediately.",
+  "orchestrator.runs.4": "Budget tracking shows per-agent token usage and cost in real-time. Set a max budget to prevent overspending.",
+  "orchestrator.runs.5": "When a run completes, the system generates per-agent performance summaries and an optional final report.",
+  "orchestrator.runs.title": "Runs — Orchestrated Execution",
+  "orchestrator.streaming.1": "Team rooms stream events in real time via SSE (Server-Sent Events).",
+  "orchestrator.streaming.2": "All streams require authentication — only logged-in users can subscribe.",
+  "orchestrator.streaming.3": "On reconnect, missed events are replayed from the database (up to 200 events).",
+  "orchestrator.streaming.4": "Three channels available: per-run, per-team, and per-user notifications.",
+  "orchestrator.streaming.title": "Live Streaming",
+  "orchestrator.teams.1": "Go to Teams and click New Team. Give it a name, description, and choose a category.",
+  "orchestrator.teams.2": "Add 2-10 members. Each member needs a Persona (personality/expertise) and a Role Title (e.g., Lead Researcher, Editor).",
+  "orchestrator.teams.3": "Exactly one member must be the Lead — they coordinate the discussion and produce final summaries.",
+  "orchestrator.teams.4": "Use Templates for quick setup: Research & Analysis, Content Creation, or Code Review teams come pre-configured.",
+  "orchestrator.teams.5": "Each team member can have their own preferred AI model and cost policy.",
+  "orchestrator.teams.title": "Creating Teams",
+  "orchestrator.teamsPage.1": "Access Teams from the main sidebar menu or the Chat sidebar's Team Rooms section.",
+  "orchestrator.teamsPage.2": "Left panel shows all your teams with search — each entry shows member and room counts.",
+  "orchestrator.teamsPage.3": "Select a team to see its rooms. Click a room to enter the live conversation.",
+  "orchestrator.teamsPage.4": "Use the New Room button to create a room with a specific goal and room type.",
+  "orchestrator.teamsPage.5": "Deep-link directly to a team: /teams/:teamId — bookmarkable and shareable.",
+  "orchestrator.teamsPage.title": "Teams Page",
+  "orchestrator.tips.1": "Start with a template and customize — it's faster than building from scratch.",
+  "orchestrator.tips.2": "Give each agent a distinct specialty. Overlapping roles produce redundant output.",
+  "orchestrator.tips.3": "Set a reasonable budget cap (100-500 credits) and max rounds (10-30) to avoid runaway costs.",
+  "orchestrator.tips.4": "Use Milestone view mode when you only care about key decisions, not the full discussion.",
+  "orchestrator.tips.5": "Review the lead's summary before stopping a run — it captures the team's conclusions.",
+  "orchestrator.tips.6": "Auto-stop protects you — even if you forget to stop a run, the policy checker enforces limits every 30 seconds.",
+  "orchestrator.tips.7": "Pause to intervene — if agents go off-track, pause, send a correction message, then resume.",
+  "orchestrator.tips.title": "Tips for effective teams",
+  "orchestrator.title": "AI Team Orchestrator",
+  "pause.1": "OTP, MFA, or device verification.",
+  "pause.2": "Payments, bookings, purchases, or any irreversible action.",
+  "pause.3": "Anything sensitive that you want to review before submission.",
+  "pause.title": "When the AI should pause for you",
+  "presentation.ex.basic.cmd": "create presentation about Digital Marketing",
+  "presentation.ex.basic.label": "Basic",
+  "presentation.ex.basic.result": "5 slides, 16:9 landscape, auto-detected language",
+  "presentation.ex.count.cmd": "create presentation about AI in Healthcare 10 slides",
+  "presentation.ex.count.label": "With slide count",
+  "presentation.ex.count.result": "10 slides, 16:9 landscape",
+  "presentation.ex.full.cmd": "build a deck about Child Development 10 slides 9:16 in Thai",
+  "presentation.ex.full.label": "Full options",
+  "presentation.ex.full.result": "10 slides, 9:16 portrait, Thai",
+  "presentation.ex.landscape.cmd": "create presentation about Startup Pitch 8 slides 16:9",
+  "presentation.ex.landscape.label": "Landscape (16:9)",
+  "presentation.ex.landscape.result": "8 slides, 16:9 landscape",
+  "presentation.ex.lang.cmd": "create presentation about Cloud Computing in English 16:9",
+  "presentation.ex.lang.label": "With language",
+  "presentation.ex.lang.result": "5 slides, 16:9 landscape, English",
+  "presentation.ex.portrait.cmd": "make slides about Social Media Tips 9:16 portrait",
+  "presentation.ex.portrait.label": "Portrait (9:16)",
+  "presentation.ex.portrait.result": "5 slides, 9:16 portrait",
+  "presentation.examples.title": "Examples",
+  "presentation.howItWorks.1": "You send a message with a trigger phrase + topic.",
+  "presentation.howItWorks.2": "The system extracts your topic, slide count, aspect ratio, and language.",
+  "presentation.howItWorks.3": "A new presentation deck is created instantly and you get an editor link.",
+  "presentation.howItWorks.4": "AI generates slide content, layouts, and images in the background.",
+  "presentation.howItWorks.5": "When complete, a notification appears in chat with the final link.",
+  "presentation.howItWorks.title": "How it works",
+  "presentation.intro": "Type a message that starts with a trigger phrase like \"create presentation\", \"make slides\", or \"build a deck\" followed by your topic. The system auto-generates a full slide deck with AI content and images. Thai trigger phrases are also supported.",
+  "presentation.optional": "Optional",
+  "presentation.params.aspect.desc": "Canvas size. Default: 16:9 landscape.",
+  "presentation.params.aspect.examples": "\"16:9\" / \"9:16\" / \"landscape\" / \"portrait\"",
+  "presentation.params.aspect.name": "Aspect ratio",
+  "presentation.params.col.desc": "Description",
+  "presentation.params.col.examples": "Examples",
+  "presentation.params.col.param": "Parameter",
+  "presentation.params.col.required": "Required",
+  "presentation.params.language.desc": "Force a language for the generated content. Default: auto-detect from topic.",
+  "presentation.params.language.examples": "\"in Thai\" / \"in English\"",
+  "presentation.params.language.name": "Language",
+  "presentation.params.slides.desc": "Number of slides (1–30). Default: 5.",
+  "presentation.params.slides.examples": "\"8 slides\" / \"10 slides\"",
+  "presentation.params.slides.name": "Slide count",
+  "presentation.params.title": "Available parameters",
+  "presentation.params.topic.desc": "The subject of your presentation. Appears after the trigger phrase.",
+  "presentation.params.topic.examples": "\"about AI\" / \"about Marketing\"",
+  "presentation.params.topic.name": "Topic",
+  "presentation.required": "Required",
+  "presentation.title": "Create Presentations from Chat",
+  "presentation.triggers.list": "create presentation,make slides,generate slides,build a deck",
+  "presentation.triggers.title": "Trigger phrases",
+  "prompts.1": "Find the best websites for boutique hotels in Tokyo for April 10-13, 2026, keep the nightly budget under $150, and return the top 3 options with pros and cons.",
+  "prompts.2": "Research CRM tools for a 10-person sales team, compare pricing and automation features, and recommend the best fit for a low-budget startup.",
+  "prompts.3": "Find reliable laptop deals for video editing under $1,200, avoid refurbished items, and explain which model offers the best value.",
+  "prompts.4": "Open the login flow for Service X, take me to the account settings page, and pause when OTP or MFA is required.",
+  "prompts.5": "Find three event venues in Bangkok for a 100-person workshop, compare package pricing, and note parking and AV support.",
+  "prompts.6": "Identify the strongest public sources about the new regulation, summarize the practical impact, and include links to the official pages.",
+  "prompts.title": "Prompt examples",
+  "quickStart.1": "Click Start Browser Session from Chat.",
+  "quickStart.2": "Describe the result you want in plain English.",
+  "quickStart.3": "Let the system search for relevant websites and start browsing.",
+  "quickStart.4": "Open the live session if you want to watch or steer the browser in real time.",
+  "quickStart.5": "Send follow-up instructions instead of restarting from scratch.",
+  "quickStart.title": "Quick start",
+  "request.1": "Goal: what outcome you want, not every click.",
+  "request.2": "Constraints: budget, region, dates, brands, must-have filters, or exclusions.",
+  "request.3": "Output: ask for a shortlist, comparison table, summary, or evidence links.",
+  "request.title": "How to write a strong request",
+  "running.1": "Open the live Browser Session to watch the browser in real time.",
+  "running.2": "Use Send Browser Instruction to adjust the task while the session is running.",
+  "running.3": "Switch skills if the task changes from research to comparison, booking, or account access.",
+  "running.4": "If the system pauses for approval, MFA, or payment, take over briefly and then return control.",
+  "running.title": "While the session is running",
+  "skillDetection.1": "The system automatically detects the best skill for your request based on keywords in your message.",
+  "skillDetection.2": "You do not need to select a skill manually — just describe what you want and the system matches the right workflow.",
+  "skillDetection.3": "If auto-detection picks the wrong skill, use the / slash menu to select a specific skill by name.",
+  "skillDetection.4": "Skills with higher priority scores are checked first. Domain-specific keywords improve detection accuracy.",
+  "skillDetection.howItWorks.1": "When you send a message, the system scans it for known keyword patterns.",
+  "skillDetection.howItWorks.2": "Each enabled skill has tags and trigger patterns that are scored against your message.",
+  "skillDetection.howItWorks.3": "The skill with the highest confidence score is selected automatically.",
+  "skillDetection.howItWorks.4": "If no skill matches above the confidence threshold, the message goes to the general LLM.",
+  "skillDetection.howItWorks.5": "You can always override by selecting a skill from the / slash menu before sending.",
+  "skillDetection.howItWorks.title": "How auto-detection works",
+  "skillDetection.tip1.example": "\"Write a product review for Nike Air Max\" triggers the product-reviewer skill.",
+  "skillDetection.tip1.title": "Be specific about the output type",
+  "skillDetection.tip1.why": "Specific nouns help the detector match the right skill.",
+  "skillDetection.tip2.example": "\"Create an image prompt for a sunset landscape\" triggers the image-prompt-engineer skill.",
+  "skillDetection.tip2.title": "Include the domain or category",
+  "skillDetection.tip2.why": "Domain keywords (image, video, article, review) are strong detection signals.",
+  "skillDetection.tip3.example": "\"create presentation about AI\" auto-triggers presentation generation.",
+  "skillDetection.tip3.title": "Use the skill's language naturally",
+  "skillDetection.tip3.why": "Both Thai and English trigger phrases are supported.",
+  "skillDetection.tip4.example": "\"Generate a video of a talking cat using viral style\" triggers the viral-talking-objects skill.",
+  "skillDetection.tip4.title": "Combine with media generation keywords",
+  "skillDetection.tip4.why": "Media-type keywords plus style hints guide skill selection.",
+  "skillDetection.tips.title": "Tips for better skill matching",
+  "skillDetection.title": "Auto Skill Detection",
+  "skills.1": "Type / in the message box to open the slash-command skill menu.",
+  "skills.2": "Open the Skills panel to control which skills are enabled for the current conversation.",
+  "skills.3": "Use skills when you want the assistant to follow a specialized workflow instead of a plain answer.",
+  "skills.4": "If the task is repetitive or domain-specific, prefer a skill over repeating the same instructions manually.",
+  "skills.title": "Skills and slash commands",
+  "title": "Browser Session Help",
+  "useCases.1": "Travel planning: find flights, compare hotels, and narrow down the best itinerary.",
+  "useCases.10": "Education research: find courses, compare syllabi, and shortlist providers by schedule and cost.",
+  "useCases.11": "Grant or tender research: discover official sources, compare requirements, and summarize deadlines.",
+  "useCases.12": "Customer support assistance: navigate product docs or help centers and bring back the exact answer.",
+  "useCases.13": "Account workflows: open a service, reach the right settings page, and pause before sensitive actions.",
+  "useCases.14": "Booking assistant: prepare a checkout or reservation flow and stop when your confirmation is needed.",
+  "useCases.15": "Content sourcing: find primary sources, case studies, or examples to support a report.",
+  "useCases.16": "Price monitoring: revisit product pages, capture current price signals, and summarize changes.",
+  "useCases.17": "B2B partner discovery: find potential partners in a region and rank them by fit.",
+  "useCases.18": "Compliance or policy lookup: locate official pages and summarize the parts relevant to your goal.",
+  "useCases.2": "Shopping research: compare laptops, phones, cameras, or office equipment across multiple sites.",
+  "useCases.3": "Vendor sourcing: find SaaS tools, agencies, or suppliers and summarize pricing and capabilities.",
+  "useCases.4": "Real estate scouting: search listings, compare neighborhoods, and flag the strongest candidates.",
+  "useCases.5": "Recruiting support: collect candidate pages, portfolio links, and evidence for shortlisting.",
+  "useCases.6": "Lead generation: discover relevant company websites and gather structured notes for outreach.",
+  "useCases.7": "Market research: identify competitors, pricing patterns, feature positioning, and public messaging.",
+  "useCases.8": "Procurement: find distributors or wholesalers and compare minimum order, shipping, and payment options.",
+  "useCases.9": "Event planning: discover venues, compare packages, and summarize booking requirements.",
+  "useCases.title": "Diverse use cases",
+  "what.body": "You describe the outcome you want. The system can infer a browser skill, discover relevant websites, open a live browser session, and continue working while you supervise or step in only when needed.",
+  "what.title": "What Browser Session does"
+}
diff --git a/apps/web/client/src/locales/en/marketplace.json b/apps/web/client/src/locales/en/marketplace.json
new file mode 100644
index 00000000..0967ef42
--- /dev/null
+++ b/apps/web/client/src/locales/en/marketplace.json
@@ -0,0 +1 @@
+{}
diff --git a/apps/web/client/src/locales/en/media.json b/apps/web/client/src/locales/en/media.json
new file mode 100644
index 00000000..91719ec3
--- /dev/null
+++ b/apps/web/client/src/locales/en/media.json
@@ -0,0 +1,124 @@
+{
+  "active": "Active",
+  "addedToLibrary": "Added to library",
+  "addingToLibrary": "Adding to library...",
+  "addToLibrary": "Add to library",
+  "addToVideoReference": "Add to Video Reference",
+  "advancedMode": "Advanced Mode",
+  "advancedModeHint": "Generate enhanced prompt using Advanced Mode settings",
+  "arrayPlaceholder": "Enter JSON array or one item per line for {{field}}",
+  "aspectRatio": "Aspect Ratio",
+  "aspectRatioLabel": "Aspect Ratio",
+  "autoModelHint": "Auto mode selects the best model based on skill requirements. Or pick a specific model manually.",
+  "autoPrompt": "Auto Prompt",
+  "autoPromptHint": "Enhance your prompt with AI (PromptDepth Pro v8.9)",
+  "autoPromptModel": "Auto Prompt Model",
+  "autoPromptSkill": "Auto Prompt Skill",
+  "autoSkillRequirements": "✨ Auto (skill requirements)",
+  "buyMore": "Buy more",
+  "changeSkill": "Change Skill",
+  "chooseSkillForTab": "Choose a prompt-creation skill for the {{tab}} tab",
+  "chooseStyle": "Choose Style",
+  "chooseVfx": "Choose VFX Effect",
+  "clear": "Clear",
+  "clearHint": "Clear prompt",
+  "clearOptions": "Clear Options",
+  "clickCropFirst": "Click Crop first, then Download will be available.",
+  "clickToPreview": "Click to preview",
+  "configureSkillParameters": "Configure skill parameters for precise control",
+  "count": "Count",
+  "creatingYour": "Creating your {{tab}}...",
+  "cropByRatio": "Crop by Ratio",
+  "cropping": "Cropping...",
+  "cropRatio": "Crop Ratio",
+  "cropWithRatio": "Crop ({{ratio}})",
+  "customValuePlaceholder": "Or enter custom {{field}}",
+  "description": "Create AI-powered media",
+  "detectingGrid": "Detecting grid...",
+  "download": "Download",
+  "downloadAll": "Download All",
+  "downloadCropped": "Download Cropped",
+  "dragHistoryHint": "Drag from History Gallery below or upload images for style transfer / img2img",
+  "dragToUseAsReference": "Drag to use as reference",
+  "dropReferenceHint": "Drop images here or click Add Image",
+  "duration": "Duration",
+  "error": "Error",
+  "faceLock": "Face Lock",
+  "failed": "Failed",
+  "generatedMedia": "Generated Media",
+  "generateTab": "Generate {{tab}}",
+  "generating": "Generating...",
+  "generatingTask": "Generating #{{index}}",
+  "gridSize": "Grid Size",
+  "history": "History",
+  "historyGallery": "History Gallery",
+  "loadingOptions": "Loading options...",
+  "mic": "Mic",
+  "modelLabel": "Model",
+  "multiShot": "Multi Shot (single video, multiple scenes)",
+  "multiVideo": "Multi Video (separate videos per scene)",
+  "multiVideoModeGenerating": "Multi Video Mode: Generating {{count}} separate videos",
+  "noContent": "No content generated yet",
+  "noHistoryAudio": "No history yet. Generate some audio!",
+  "noHistoryImage": "No history yet. Generate some images!",
+  "noHistoryVideo": "No history yet. Generate some videos!",
+  "noImageSelected": "No image selected",
+  "noImagesSelected": "No images selected",
+  "noModelsFound": "No models found",
+  "noMultiplePrompts": "No multiple prompts detected. Generating single video.",
+  "noOptionsFound": "No options found.",
+  "noPreviewAvailable": "No preview available",
+  "noPromptSkills": "No prompt skills available for {{tab}}",
+  "noPromptYet": "No prompt yet",
+  "noSkillSelected": "No Skill Selected",
+  "notEnoughCredits": "Not enough credits.",
+  "off": "Off",
+  "on": "On",
+  "optionListUnavailable": "Option list unavailable right now. You can still enter a value manually.",
+  "outputType": "Output Type",
+  "pending": "Pending",
+  "playVoicePreview": "Play voice preview",
+  "previewCollapsed": "Preview collapsed. Expand to view latest media.",
+  "processing": "Processing...",
+  "prompt.description": "Start with a base prompt, then refine it with voice, translation, or auto-prompt.",
+  "prompt.eyebrow": "Prompt",
+  "prompt.title": "Generation Prompt",
+  "promptLabel": "Prompt",
+  "queued": "Queued",
+  "realisticSkin": "Realistic Skin",
+  "recommendedGridSizes": "Recommended Grid Sizes by Aspect Ratio",
+  "recordHint": "Hold to record voice (Speech-to-Text)",
+  "recording": "Recording...",
+  "referenceImagesLabel": "Reference Images",
+  "refreshOptions": "Refresh option list",
+  "resultsCount": "Results ({{count}} images)",
+  "retryAddToLibrary": "Retry add to library",
+  "savedToDownloads": "Saved to your browser default Downloads folder.",
+  "searchField": "Search {{field}}...",
+  "searchLibrary": "Search Library",
+  "searchModels": "Search models...",
+  "searchSkills": "Search skills...",
+  "selectAutoPromptSkill": "Select Auto Prompt Skill",
+  "selected": "Selected",
+  "selectModel": "Select model",
+  "selectOption": "Select option",
+  "selectStyle": "Select Style",
+  "selectVfx": "Select VFX",
+  "settingsHint": "Select all desired options below before clicking Auto Prompt to generate an enhanced prompt.",
+  "settingsTitle": "Settings",
+  "skillParameters": "Skill Parameters",
+  "skillsAlignedWithTab": "Only prompt-creation skills are shown here so the {{tab}} tab stays aligned with its output type.",
+  "skillUsedForAudio": "This skill is used to shape text-to-speech or sound effect prompts before generation.",
+  "splitGrid": "Split Grid",
+  "style": "Style",
+  "synced": "Synced",
+  "tabs.audio": "Audio",
+  "tabs.image": "Image",
+  "tabs.video": "Video",
+  "title": "Media Studio",
+  "translate": "Translate",
+  "translateHint": "Translate prompt (EN ↔ your language)",
+  "upscaleAutoFilled": "Prompt auto-filled for Upscale",
+  "upscaleAutoFilledDesc": "Optimize the prompt for image enhancement",
+  "vfxEffect": "VFX Effect"
+}
diff --git a/apps/web/client/src/locales/en/nav.json b/apps/web/client/src/locales/en/nav.json
new file mode 100644
index 00000000..706116cc
--- /dev/null
+++ b/apps/web/client/src/locales/en/nav.json
@@ -0,0 +1,21 @@
+{
+  "header.notifications": "Notifications",
+  "header.profile": "Profile",
+  "header.search": "Search",
+  "header.signOut": "Sign out",
+  "navbar.features": "Features",
+  "navbar.getStarted": "Get Started",
+  "navbar.home": "Home",
+  "navbar.pricing": "Pricing",
+  "navbar.signIn": "Sign In",
+  "sidebar.agencies": "Agencies",
+  "sidebar.chat": "Chat",
+  "sidebar.credits": "Credits",
+  "sidebar.dashboard": "Dashboard",
+  "sidebar.library": "Library",
+  "sidebar.mediaStudio": "Media Studio",
+  "sidebar.presentations": "Presentations",
+  "sidebar.settings": "Settings",
+  "sidebar.teams": "Teams",
+  "sidebar.workflows": "Workflows"
+}
diff --git a/apps/web/client/src/locales/en/presentation.json b/apps/web/client/src/locales/en/presentation.json
new file mode 100644
index 00000000..62248264
--- /dev/null
+++ b/apps/web/client/src/locales/en/presentation.json
@@ -0,0 +1,63 @@
+{
+  "ariaLabel": "Document editor",
+  "conflict.description": "This document has been modified elsewhere (another tab or user). Choose how to proceed:",
+  "conflict.overwrite": "Overwrite",
+  "conflict.overwriteHint": "Save your version, discarding the other changes",
+  "conflict.reload": "Reload",
+  "conflict.reloadHint": "Load the latest version, discarding your unsaved changes",
+  "conflict.title": "Document Conflict",
+  "errorBoundary.switchToSource": "Switch to Source Mode",
+  "errorBoundary.title": "Editor encountered an error",
+  "media.editAlt": "Edit alt text",
+  "media.editCaption": "Edit caption",
+  "media.remove": "Remove",
+  "media.replace": "Replace",
+  "media.unsafeUrl": "Unsafe URL blocked",
+  "mode.edit": "Edit",
+  "mode.source": "Source",
+  "mode.view": "View",
+  "placeholder": "Start writing...",
+  "save.conflict": "Conflict detected",
+  "save.error": "Save failed",
+  "save.saved": "Saved",
+  "save.saving": "Saving...",
+  "save.unsaved": "Unsaved changes",
+  "serializationWarning": "Some content may not be preserved in this format. Use Source Mode for full control.",
+  "slash.audio": "Audio",
+  "slash.bulletList": "Bullet List",
+  "slash.codeBlock": "Code Block",
+  "slash.divider": "Divider",
+  "slash.heading1": "Heading 1",
+  "slash.heading2": "Heading 2",
+  "slash.heading3": "Heading 3",
+  "slash.heading4": "Heading 4",
+  "slash.image": "Image",
+  "slash.noResults": "No results",
+  "slash.orderedList": "Ordered List",
+  "slash.quote": "Quote",
+  "slash.table": "Table",
+  "slash.video": "Video",
+  "toolbar.blockquote": "Blockquote",
+  "toolbar.bold": "Bold",
+  "toolbar.bulletList": "Bullet List",
+  "toolbar.code": "Code",
+  "toolbar.codeBlock": "Code Block",
+  "toolbar.divider": "Divider",
+  "toolbar.heading1": "Heading 1",
+  "toolbar.heading2": "Heading 2",
+  "toolbar.heading3": "Heading 3",
+  "toolbar.heading4": "Heading 4",
+  "toolbar.horizontalRule": "Divider",
+  "toolbar.insertAudio": "Insert Audio",
+  "toolbar.insertImage": "Insert Image",
+  "toolbar.insertVideo": "Insert Video",
+  "toolbar.italic": "Italic",
+  "toolbar.link": "Link",
+  "toolbar.orderedList": "Ordered List",
+  "toolbar.redo": "Redo",
+  "toolbar.save": "Save",
+  "toolbar.strikethrough": "Strikethrough",
+  "toolbar.table": "Table",
+  "toolbar.underline": "Underline",
+  "toolbar.undo": "Undo"
+}
diff --git a/apps/web/client/src/locales/en/profile.json b/apps/web/client/src/locales/en/profile.json
new file mode 100644
index 00000000..0967ef42
--- /dev/null
+++ b/apps/web/client/src/locales/en/profile.json
@@ -0,0 +1 @@
+{}
diff --git a/apps/web/client/src/locales/en/settings.json b/apps/web/client/src/locales/en/settings.json
new file mode 100644
index 00000000..9d421c7a
--- /dev/null
+++ b/apps/web/client/src/locales/en/settings.json
@@ -0,0 +1,189 @@
+{
+  "2fa.cancel": "Cancel",
+  "2fa.codePlaceholder": "000000",
+  "2fa.codesRemaining": "{{count}} recovery codes remaining",
+  "2fa.copyAll": "Copy All",
+  "2fa.disable": "Disable",
+  "2fa.disabled": "2FA is disabled",
+  "2fa.disabledByAdmin": "Two-factor authentication has been disabled by your administrator.",
+  "2fa.disableDescription": "Enter your current TOTP code or a recovery code to disable 2FA.",
+  "2fa.disablePlaceholder": "TOTP code or recovery code",
+  "2fa.disableTitle": "Disable Two-Factor Authentication",
+  "2fa.enable": "Enable 2FA",
+  "2fa.enabled": "2FA is enabled",
+  "2fa.enforcedNotice": "Your administrator requires two-factor authentication. Please enable 2FA to continue using the platform.",
+  "2fa.error.disableFailed": "Failed to disable 2FA",
+  "2fa.error.enterCode": "Enter a 6-digit code",
+  "2fa.error.enterCurrentCode": "Enter your current TOTP code",
+  "2fa.error.enterDisableCode": "Enter your TOTP or recovery code",
+  "2fa.error.regenFailed": "Failed to regenerate codes",
+  "2fa.error.startSetup": "Failed to start 2FA setup",
+  "2fa.error.verificationFailed": "Verification failed",
+  "2fa.generateNewCodes": "Generate New Codes",
+  "2fa.lowCodes": "You have only {{count}} recovery codes left. Consider regenerating them.",
+  "2fa.newCodes": "New Codes",
+  "2fa.notAvailable": "2FA is not available",
+  "2fa.protectAccount": "Protect your account with an authenticator app",
+  "2fa.recoveryCodesHint": "Store these codes in a safe place. Each code can only be used once to sign in if you lose access to your authenticator app.",
+  "2fa.regenDescription": "Enter your current TOTP code to generate new recovery codes. Old codes will be invalidated.",
+  "2fa.regenTitle": "Regenerate Recovery Codes",
+  "2fa.savedCodes": "I've saved my codes",
+  "2fa.saveRecoveryCodes": "Save your recovery codes",
+  "2fa.setup.enterCode": "2. Enter the 6-digit code from your app",
+  "2fa.setup.manualSecret": "Or enter this secret manually:",
+  "2fa.setup.scanQr": "1. Scan this QR code with your authenticator app",
+  "2fa.success.disabled": "2FA disabled",
+  "2fa.success.enabled": "2FA enabled successfully!",
+  "2fa.success.newCodes": "New recovery codes generated",
+  "2fa.title": "Two-Factor Authentication",
+  "2fa.verifyEnable": "Verify & Enable",
+  "account.currentPlan": "Current Plan",
+  "account.deleteAccount": "Delete Account",
+  "account.deleting": "Deleting...",
+  "account.description": "Manage your account preferences.",
+  "account.emailVerified": "Email Verified",
+  "account.eyebrow": "Account",
+  "account.language": "Language",
+  "account.languageValue": "English (US)",
+  "account.title": "Account Settings",
+  "account.upgrade": "Upgrade",
+  "automation.adminOnly": "Admin only",
+  "automation.description": "Manage only your own automation restrictions here. Tenant-wide browser policy is configured separately by administrators.",
+  "automation.eyebrow": "Automation",
+  "automation.openAdminSettings": "Open Admin Settings",
+  "automation.tenantPolicyDescription": "This page is reserved for personal user preferences. Tenant-wide automation policy now lives in Admin Settings to avoid mixing user and tenant scope.",
+  "automation.tenantPolicyTitle": "Tenant-wide policy is managed separately",
+  "automation.title": "Automation Policy",
+  "billing.addPaymentMethod": "Add Payment Method",
+  "billing.description": "Manage your payment methods and billing details.",
+  "billing.expires": "Expires 12/25",
+  "billing.eyebrow": "Billing",
+  "billing.invoice": "Invoice #{{number}}",
+  "billing.invoiceDate": "January {{day}}, 2026",
+  "billing.primaryPaymentMethod": "Primary Payment Method",
+  "billing.recentInvoices": "Recent Invoices",
+  "billing.title": "Billing Information",
+  "context7.configured": "Configured",
+  "context7.description": "Your personal Context7 API key for fetching up-to-date library documentation in chat.",
+  "context7.enterPlaceholder": "Enter your Context7 API key",
+  "context7.getFreeKeyAt": "Get a free key at",
+  "context7.removed": "Context7 API key removed",
+  "context7.saved": "Context7 API key saved",
+  "context7.title": "Context7 API Key",
+  "context7.updatePlaceholder": "Enter new key to update...",
+  "description": "Manage your account settings",
+  "integrations.description": "Connect external services to enhance your workflow.",
+  "integrations.eyebrow": "Connections",
+  "integrations.title": "Integrations",
+  "preferences.appearance": "Appearance",
+  "preferences.connected": "Connected",
+  "preferences.connectedAs": "Connected as: @{{username}}",
+  "preferences.description": "Customize your experience.",
+  "preferences.emailNotifications": "Email Notifications",
+  "preferences.emailNotificationsDesc": "Receive updates via email",
+  "preferences.eyebrow": "Experience",
+  "preferences.generating": "Generating...",
+  "preferences.linkedAt": "Linked: {{date}}",
+  "preferences.linkTelegram": "Link Telegram Account",
+  "preferences.notificationLevel": "Notification Level",
+  "preferences.notifications": "Notifications",
+  "preferences.notify.all": "All Notifications",
+  "preferences.notify.criticalOnly": "Critical Only",
+  "preferences.notify.highCritical": "High + Critical Only",
+  "preferences.notify.off": "Off",
+  "preferences.pushNotifications": "Push Notifications",
+  "preferences.pushNotificationsDesc": "Receive push notifications",
+  "preferences.telegramIntro": "Link your Telegram account to receive instant alerts for important notifications.",
+  "preferences.telegramLinked": "Telegram account linked",
+  "preferences.telegramLinkExpiry": "This link expires in 5 minutes. Checking every 3 seconds...",
+  "preferences.telegramNotifications": "Telegram Notifications",
+  "preferences.telegramVerifyHint": "Click the link below to verify your account in Telegram:",
+  "preferences.title": "Preferences",
+  "preferences.unlinkConfirm": "Are you sure you want to unlink your Telegram account?",
+  "preferences.unlinking": "Unlinking...",
+  "preferences.unlinkTelegram": "Unlink Account",
+  "preferences.waitingVerification": "Waiting for verification...",
+  "privateVault.browserUnlocked": "This browser is currently unlocked for Private Files.",
+  "privateVault.configured": "The vault is configured for this account.",
+  "privateVault.confirmPin": "Confirm PIN",
+  "privateVault.currentPin": "Current PIN",
+  "privateVault.currentPinOptional": "Current PIN (optional)",
+  "privateVault.description": "Keep personal files separate from work documents. Uploads still go through the same RAG pipeline and can later power OCR, bill tracking, and personal records.",
+  "privateVault.disable": "Disable",
+  "privateVault.disableDescription": "Turning this off hides Private Files until the vault is set up again. This does not delete your files.",
+  "privateVault.disableTitle": "Disable vault",
+  "privateVault.enterCurrentPin": "Enter your current PIN",
+  "privateVault.enterNewPin": "Enter and confirm your new PIN",
+  "privateVault.enterPin": "Enter your vault PIN",
+  "privateVault.eyebrow": "Vault",
+  "privateVault.loading": "Loading vault settings...",
+  "privateVault.locked": "Locked",
+  "privateVault.newPin": "New PIN",
+  "privateVault.notConfigured": "No private vault PIN has been set yet.",
+  "privateVault.pinMismatch": "PIN codes do not match",
+  "privateVault.pinPlaceholder": "PIN code",
+  "privateVault.savePin": "Save PIN",
+  "privateVault.setPinDescription": "Use a 4-12 digit PIN. If a PIN already exists, the current PIN is required to change it.",
+  "privateVault.setPinTitle": "Set or change PIN",
+  "privateVault.setupHint": "Set a PIN in the section below to activate Private Files for your account.",
+  "privateVault.statusTitle": "Vault status",
+  "privateVault.title": "Private Files Vault",
+  "privateVault.unlock": "Unlock",
+  "privateVault.unlockDescription": "Enter your vault PIN to unlock the Private Files area in this browser session.",
+  "privateVault.unlocked": "Unlocked",
+  "privateVault.unlockHint": "Unlock this vault in the section on the right, or create a PIN below if this is your first time setting it up.",
+  "privateVault.unlockTitle": "Unlock vault",
+  "profile.bio": "Bio",
+  "profile.bioPlaceholder": "Tell us about yourself...",
+  "profile.description": "Update your personal details and profile picture.",
+  "profile.emailAddress": "Email Address",
+  "profile.eyebrow": "Profile",
+  "profile.fullName": "Full Name",
+  "profile.photoHint": "JPG, PNG or GIF. Max 2MB.",
+  "profile.title": "Profile Information",
+  "profile.uploadPhoto": "Upload Photo",
+  "recovery.backupEmailRemoved": "Backup email removed",
+  "recovery.backupEmailSent": "Code sent to backup email",
+  "recovery.backupEmailVerified": "Backup email verified!",
+  "recovery.cancel": "Cancel",
+  "recovery.codePlaceholder": "6-digit code",
+  "recovery.emailDescription": "Add a backup email for password recovery",
+  "recovery.emailPlaceholder": "backup@example.com",
+  "recovery.emailTitle": "Recovery Email",
+  "recovery.phoneCodeSent": "Code sent via SMS",
+  "recovery.phoneDescription": "Add a phone number for SMS-based password recovery (E.164 format: +66812345678)",
+  "recovery.phonePlaceholder": "+66812345678",
+  "recovery.phoneRemoved": "Phone removed",
+  "recovery.phoneTitle": "Recovery Phone",
+  "recovery.phoneVerified": "Phone verified!",
+  "recovery.remove": "Remove",
+  "recovery.sendCode": "Send Code",
+  "recovery.verified": "Verified",
+  "recovery.verify": "Verify",
+  "saved": "Settings saved",
+  "security.currentPassword": "Current Password",
+  "security.description": "Manage your password and security preferences.",
+  "security.eyebrow": "Security",
+  "security.newPassword": "New Password",
+  "security.title": "Security Settings",
+  "security.updatePassword": "Update Password",
+  "skills": "Skills",
+  "tabs.account": "Account",
+  "tabs.apiKeys": "API Keys",
+  "tabs.automation": "Automation",
+  "tabs.billing": "Billing",
+  "tabs.integrations": "Integrations",
+  "tabs.notifications": "Notifications",
+  "tabs.personas": "Personas",
+  "tabs.preferences": "Preferences",
+  "tabs.privateVault": "Private Files",
+  "tabs.profile": "Profile",
+  "tabs.security": "Security",
+  "title": "Settings",
+  "translation.language": "Translation Language",
+  "translation.model": "Translation Model",
+  "translation.saved": "Translation preferences saved",
+  "translation.savePreferences": "Save Preferences",
+  "translation.searchModels": "Search models...",
+  "translation.selectLanguage": "Select language..."
+}
diff --git a/apps/web/client/src/locales/en/social.json b/apps/web/client/src/locales/en/social.json
new file mode 100644
index 00000000..0967ef42
--- /dev/null
+++ b/apps/web/client/src/locales/en/social.json
@@ -0,0 +1 @@
+{}
diff --git a/apps/web/client/src/locales/en/workflow.json b/apps/web/client/src/locales/en/workflow.json
new file mode 100644
index 00000000..06037fc9
--- /dev/null
+++ b/apps/web/client/src/locales/en/workflow.json
@@ -0,0 +1,49 @@
+{
+  "description": "Create and manage automated workflows",
+  "empty.adjustSearch": "Try adjusting your search",
+  "empty.createFirst": "Create your first workflow or start from a template",
+  "empty.filtered": "No Workflows Found",
+  "empty.saved": "No Workflows Yet",
+  "executions.description": "The latest workflow runs and their runtime status.",
+  "executions.eyebrow": "Operations",
+  "executions.title": "Recent Executions",
+  "gallery": "Gallery",
+  "galleryBrowseAll": "Browse All",
+  "library.description": "Drafts and saved workflow definitions ready to reopen or publish.",
+  "library.eyebrow": "Workflow Library",
+  "library.title": "My Workflows",
+  "newWorkflow": "New Workflow",
+  "nodesCount": "{{count}} nodes",
+  "publish.cancel": "Cancel publish request",
+  "publish.description": "it will be available in the public Workflow Gallery for all users.",
+  "publish.dialogPrefix": "Submit",
+  "publish.dialogSuffix": "for admin review. Once approved,",
+  "publish.next.step1": "Your workflow will be submitted as a template",
+  "publish.next.step2": "An admin will review it for quality and safety",
+  "publish.next.step3": "You'll be notified when it's approved or if changes are needed",
+  "publish.nextTitle": "What happens next:",
+  "publish.resubmit": "Re-submit for Review",
+  "publish.submit": "Submit for Review",
+  "publish.title": "Publish to Gallery",
+  "publish.toGallery": "Publish to Gallery",
+  "status.compiled": "Compiled",
+  "status.completed": "Completed",
+  "status.draft": "Draft",
+  "status.failed": "Failed",
+  "status.inGallery": "In Gallery",
+  "status.pending": "Pending",
+  "status.published": "Published",
+  "status.rejected": "Rejected",
+  "status.rejectedWithReason": "Rejected: {{reason}}",
+  "status.running": "Running",
+  "templates.description": "High-signal templates other users have been opening most often.",
+  "templates.eyebrow": "Templates",
+  "templates.title": "Popular Templates",
+  "time.daysAgo": "{{count}}d ago",
+  "time.hoursAgo": "{{count}}h ago",
+  "time.justNow": "Just now",
+  "time.minutesAgo": "{{count}}m ago",
+  "title": "Workflows",
+  "toast.cancelled": "Publish request cancelled",
+  "toast.submitted": "Your workflow has been submitted for review"
+}
diff --git a/apps/web/client/src/locales/th/admin.json b/apps/web/client/src/locales/th/admin.json
new file mode 100644
index 00000000..b8bcfb80
--- /dev/null
+++ b/apps/web/client/src/locales/th/admin.json
@@ -0,0 +1,75 @@
+{
+  "admin.bonusForNewUser": "เครดิตโบนัสสำหรับผู้สมัครใหม่",
+  "admin.copyCode": "คัดลอกรหัสแล้ว!",
+  "admin.copyLink": "คัดลอกลิงก์เชิญแล้ว!",
+  "admin.createCode": "สร้างรหัส",
+  "admin.created": "สร้างรหัสเชิญแล้ว",
+  "admin.customCode": "รหัสกำหนดเอง",
+  "admin.customCodeHint": "สร้างอัตโนมัติถ้าว่าง",
+  "admin.deactivated": "ปิดการใช้งานรหัสเชิญแล้ว",
+  "admin.description": "คำอธิบาย",
+  "admin.expiresAt": "หมดอายุ",
+  "admin.label": "ชื่อ",
+  "admin.maxUses": "จำนวนครั้งสูงสุด",
+  "admin.maxUsesHint": "0 = ไม่จำกัด",
+  "admin.noCodes": "ยังไม่มีรหัสเชิญ",
+  "admin.noRegistrations": "ยังไม่มีการสมัคร",
+  "admin.registeredUsers": "ผู้ใช้ที่สมัครแล้ว",
+  "admin.title": "รหัสเชิญของผู้ดูแล",
+  "admin.updated": "อัปเดตรหัสเชิญแล้ว",
+  "bonusCredits": "+{count} เครดิตโบนัสจากรหัสนี้",
+  "codeLabel": "รหัสเชิญ",
+  "codePlaceholder": "ใส่รหัสเชิญ",
+  "codeRequired": "การสมัครต้องใช้รหัสเชิญ",
+  "haveCode": "มีรหัสเชิญ?",
+  "invalidCode": "รหัสเชิญไม่ถูกต้อง",
+  "inviteOnlyMessage": "การสมัครต้องได้รับเชิญเท่านั้น กรุณาใส่รหัสเชิญที่ถูกต้องเพื่อดำเนินการ",
+  "referral.copyLink": "คัดลอกลิงก์เชิญ",
+  "referral.earned": "+{count} เครดิตที่ได้รับ",
+  "referral.joined": "{count} คนเข้าร่วมแล้ว",
+  "referral.title": "รหัสแนะนำของคุณ",
+  "settings.allowUserInvite": "อนุญาตให้ผู้ใช้แชร์รหัสเชิญ",
+  "settings.allowUserInviteDesc": "ผู้ใช้แต่ละคนจะได้รับรหัสแนะนำที่ไม่ซ้ำกัน",
+  "settings.authMethods": "วิธีการสมัครที่อนุญาต",
+  "settings.authMethodsHint": "ต้องเปิดใช้งานอย่างน้อย 1 วิธี",
+  "settings.fraudDetection": "การตรวจจับการฉ้อโกง",
+  "settings.inactiveDays": "ปิดการใช้งานอัตโนมัติหลังจากไม่ใช้เครดิต (วัน)",
+  "settings.inactiveDaysHint": "0 = ปิด ใช้ได้กับผู้ใช้ที่สมัครผ่านรหัสเชิญของผู้ดูแลเท่านั้น",
+  "settings.inactivePolicy": "นโยบายผู้ใช้ที่ไม่มีกิจกรรม",
+  "settings.inviteOnly": "เฉพาะผู้ได้รับเชิญ",
+  "settings.inviteOnlyDesc": "เฉพาะผู้ที่มีรหัสเชิญเท่านั้นที่สมัครได้",
+  "settings.maxDeviceReg": "จำนวนการสมัครสูงสุดต่ออุปกรณ์",
+  "settings.maxDeviceRegHint": "0 = ปิด บล็อคการสมัครเมื่ออุปกรณ์เดียวกันเกินขีดจำกัด",
+  "settings.openDesc": "ทุกคนสามารถสมัครได้ (รหัสเชิญไม่บังคับ)",
+  "settings.openRegistration": "เปิดรับสมัครทั่วไป",
+  "settings.referralBonus": "เครดิตโบนัสแนะนำ (สำหรับผู้เชิญ)",
+  "settings.referralBonusDesc": "เครดิตที่มอบให้ผู้เชิญเมื่อมีคนสมัครด้วยรหัสของพวกเขา",
+  "settings.registrationMode": "โหมดการสมัคร",
+  "settings.userReferral": "โปรแกรมแนะนำผู้ใช้",
+  "stats.activeCodes": "รหัสที่ใช้งานอยู่",
+  "stats.atOverLimit": "ถึง/เกินขีดจำกัด",
+  "stats.autoDisabledInactivity": "ปิดอัตโนมัติเพราะไม่มีกิจกรรม",
+  "stats.avgPerCode": "เฉลี่ยต่อรหัส",
+  "stats.blockedSuspicious": "ถูกบล็อคเพราะกิจกรรมต้องสงสัย",
+  "stats.createFirst": "สร้างรหัสเชิญแรกเพื่อเริ่มดูสถิติ",
+  "stats.disabledUsers": "ผู้ใช้ที่ถูกปิดการใช้งาน",
+  "stats.exhausted": "ใช้ครบแล้ว",
+  "stats.expired": "หมดอายุ",
+  "stats.fraudDisabled": "ปิดเพราะต้องสงสัย",
+  "stats.inactiveDisabled": "ปิดเพราะไม่มีกิจกรรม",
+  "stats.multiAccountDevices": "อุปกรณ์หลายบัญชี",
+  "stats.noCodesYet": "ยังไม่มีรหัสเชิญ",
+  "stats.referrals": "การแนะนำ",
+  "stats.registrationTrend": "แนวโน้มการสมัคร (30 วันล่าสุด)",
+  "stats.topCodes": "รหัสที่ใช้มากที่สุด",
+  "stats.topReferrers": "ผู้แนะนำยอดนิยม",
+  "stats.toReferrers": "ให้ผู้แนะนำ",
+  "stats.totalBonusCredits": "เครดิตโบนัสทั้งหมด",
+  "stats.totalCodes": "รหัสเชิญทั้งหมด",
+  "stats.totalRegistrations": "การสมัครทั้งหมด",
+  "stats.toUsers": "ให้ผู้ใช้",
+  "stats.viaInviteCodes": "ผ่านรหัสเชิญ",
+  "user.disabled": "ปิดการใช้งาน",
+  "user.reactivate": "เปิดใช้งานอีกครั้ง",
+  "user.reactivated": "เปิดใช้งานผู้ใช้อีกครั้งแล้ว"
+}
diff --git a/apps/web/client/src/locales/th/agency.json b/apps/web/client/src/locales/th/agency.json
new file mode 100644
index 00000000..9fd7a13c
--- /dev/null
+++ b/apps/web/client/src/locales/th/agency.json
@@ -0,0 +1,371 @@
+{
+  "category.creative": "สายครีเอทีฟ",
+  "category.custom": "กำหนดประเภทเอง...",
+  "category.engineering": "สายวิศวกรรม",
+  "category.none": "ไม่ระบุประเภท",
+  "category.operations": "สายปฏิบัติการ",
+  "category.placeholder": "เลือกประเภทของทีม",
+  "category.presentation": "สายพรีเซนเทชัน",
+  "category.research": "สายวิจัย",
+  "category.support": "สายซัพพอร์ต",
+  "common.approve": "อนุมัติ",
+  "common.disconnected": "ตัดการเชื่อมต่อ",
+  "common.lead": "หัวหน้า",
+  "common.live": "สด",
+  "common.pause": "พัก",
+  "common.reply": "ตอบกลับ",
+  "common.requestChanges": "ขอแก้ไข",
+  "common.resume": "ทำต่อ",
+  "common.resumeRun": "ทำรันต่อ",
+  "common.send": "ส่ง",
+  "common.startNewRun": "เริ่มรอบใหม่",
+  "common.startRun": "เริ่มรัน",
+  "common.stop": "หยุด",
+  "common.system": "ระบบ",
+  "common.user": "ผู้ใช้",
+  "common.userNumber": "ผู้ใช้ #{{id}}",
+  "create.addConnectorMember": "เพิ่มสมาชิกแบบคอนเนกเตอร์",
+  "create.addMember": "เพิ่มสมาชิก",
+  "create.addMemberHelper": "เลือกประเภทของสมาชิกคนถัดไปที่จะเพิ่ม การตั้งค่านี้มีผลเฉพาะสมาชิกที่กำลังจะเพิ่มตอนนี้เท่านั้น",
+  "create.aiRolesCount": "{{count}} บทบาท AI",
+  "create.assistantHelp": "ใช้สำหรับ persona ฝั่ง AI โดย assistant คนแรกที่เพิ่มจะกลายเป็นหัวหน้าทีมอัตโนมัติ",
+  "create.assistantsCount": "ผู้ช่วย AI: {{count}}",
+  "create.cancel": "ยกเลิก",
+  "create.connectorName": "ชื่อคอนเนกเตอร์",
+  "create.connectorNamePlaceholder": "เช่น Manus AI",
+  "create.connectorReference": "รหัสอ้างอิงคอนเนกเตอร์",
+  "create.connectorReferencePlaceholder": "เช่น mcp://manus-ai/main",
+  "create.connectorsCount": "คอนเนกเตอร์: {{count}}",
+  "create.createPersona": "สร้าง Persona",
+  "create.createTeam": "สร้างทีม",
+  "create.customCategoryPlaceholder": "เช่น กลยุทธ์, สนับสนุนการขาย",
+  "create.description": "คำอธิบาย",
+  "create.descriptionPlaceholder": "ทีมนี้ทำหน้าที่อะไร?",
+  "create.emptyMembers": "ยังไม่มีสมาชิกในทีม เริ่มจากเพิ่ม assistant persona ก่อน แล้วค่อยเพิ่มมนุษย์หรือคอนเนกเตอร์ตามต้องการ",
+  "create.externalHelp": "ใช้สำหรับเครื่องมือ, MCP endpoint, หรือ external agent connector",
+  "create.hidePersonaBuilder": "ซ่อน",
+  "create.humanHelp": "ใช้เมื่อคุณต้องการเพิ่มคนจริงจาก workspace เข้ามาเป็นสมาชิกทีม",
+  "create.humansCount": "มนุษย์: {{count}}",
+  "create.humanSearchPlaceholder": "ค้นหาสมาชิกจริงด้วยชื่อหรืออีเมล...",
+  "create.instructions": "คำแนะนำ",
+  "create.instructionsPlaceholder": "บันทึกเพิ่มเติมว่าหัวหน้าทีมควรใช้คอนเนกเตอร์นี้อย่างไร",
+  "create.leadAssignedFooter": "กำหนดหัวหน้าทีมเป็น {{name}} แล้ว",
+  "create.leadBadge": "หัวหน้า: {{name}}",
+  "create.leadMissing": "ยังไม่มีหัวหน้าทีม",
+  "create.leadRequiredFooter": "ต้องมี assistant ที่เป็นหัวหน้าทีมก่อนจึงจะสร้างทีมได้",
+  "create.leadShort": "หัวหน้า",
+  "create.manualDivider": "หรือสร้างเอง",
+  "create.members": "สมาชิก",
+  "create.membersAdded": "เพิ่มแล้ว {{count}} คน",
+  "create.membersHelper": "กำหนดว่าในทีมนี้มีใครบ้าง เพิ่มสมาชิกทีละคน และสมาชิกแบบ assistant เท่านั้นที่เป็นหัวหน้าทีมได้",
+  "create.noPersonasFound": "ยังไม่พบ persona สร้างใหม่ด้านล่างได้ แล้วระบบจะเพิ่มเข้าไปในทีมนี้ให้ทันที",
+  "create.noUsersFound": "ไม่พบผู้ใช้",
+  "create.personasExhausted": "persona ที่มีอยู่ทั้งหมดถูกเพิ่มเข้าในทีมนี้แล้ว",
+  "create.presets": "เทมเพลตทีม",
+  "create.quickPersonaHelperDraftTeam": "สร้าง persona ใหม่ตรงนี้แล้วเพิ่มเข้าร่างทีมนี้ได้ทันที",
+  "create.quickPersonaHelperExistingTeam": "สร้าง persona ตรงนี้แล้วเพิ่มเข้าทีมนี้ได้ทันที",
+  "create.quickPersonaTitle": "สร้าง Persona แบบด่วน",
+  "create.readyNeedMember": "เพิ่มสมาชิกอย่างน้อย 1 คนก่อนสร้างทีม",
+  "create.readySummary": "พร้อมแล้ว {{count}} คน",
+  "create.roleInTeam": "บทบาทในทีม",
+  "create.savePersona": "บันทึก Persona",
+  "create.selectAssistantPersona": "เลือก assistant persona ที่จะเพิ่ม...",
+  "create.setLeadTitle": "คลิกเพื่อตั้งเป็นหัวหน้าทีม",
+  "create.step": "ขั้นตอน {{count}}",
+  "create.stepDetails": "ข้อมูลทีม",
+  "create.stepMembers": "ประกอบทีม",
+  "create.teamCategory": "ประเภททีม",
+  "create.teamCategoryHelper": "ไม่บังคับ ใช้ระบุว่าทีมนี้เป็นทีมแนวไหน ซึ่งแยกจากประเภทของสมาชิกแต่ละคน",
+  "create.teamLeadTitle": "หัวหน้าทีม",
+  "create.teamMembers": "สมาชิกในทีม",
+  "create.teamName": "ชื่อทีม",
+  "create.teamNamePlaceholder": "เช่น ทีมสร้างคอนเทนต์",
+  "create.title": "สร้างทีมใหม่",
+  "create.titleInTeam": "ตำแหน่งในทีม",
+  "create.titleInTeamPlaceholder": "เช่น External Publisher",
+  "create.typeToSearchUsers": "พิมพ์เพื่อค้นหาผู้ใช้ใน tenant นี้",
+  "create.whoAreYouAdding": "คุณกำลังเพิ่มใคร?",
+  "edit.connectorInstructions": "คำแนะนำสำหรับคอนเนกเตอร์",
+  "edit.currentLead": "หัวหน้าปัจจุบัน",
+  "edit.currentLeadHelper": "assistant คนนี้เป็นหัวหน้าทีมอยู่แล้ว หากต้องการเปลี่ยนหัวหน้า ให้ไปเลื่อน assistant คนอื่นแทน",
+  "edit.displayName": "ชื่อที่แสดง",
+  "edit.externalReference": "รหัสอ้างอิงภายนอก",
+  "edit.linkedUser": "ผู้ใช้ที่เชื่อมอยู่",
+  "edit.memberRole": "บทบาทสมาชิก",
+  "edit.notLinked": "ยังไม่ได้เชื่อม",
+  "edit.promoteLead": "เลื่อน assistant คนนี้เป็นหัวหน้าทีม",
+  "edit.roleTitle": "ตำแหน่ง",
+  "edit.roleTitleAssistantPlaceholder": "เช่น Research Lead",
+  "edit.roleTitleExternalPlaceholder": "เช่น External Publisher",
+  "edit.roleTitleHumanPlaceholder": "เช่น Human Reviewer",
+  "edit.saveChanges": "บันทึกการเปลี่ยนแปลง",
+  "edit.teamInstructions": "คำสั่งของทีม",
+  "edit.title": "แก้ไขสมาชิกทีม",
+  "error.blueprintNotFound": "ไม่พบ blueprint ที่เลือก",
+  "error.connectorAlreadyAdded": "คอนเนกเตอร์ภายนอกนี้ถูกเพิ่มไว้แล้ว",
+  "error.connectorAlreadyInTeam": "คอนเนกเตอร์ภายนอกนี้อยู่ในทีมแล้ว",
+  "error.connectorFieldsRequired": "ต้องกรอกชื่อคอนเนกเตอร์และรหัสอ้างอิงภายนอก",
+  "error.createTeamFailed": "สร้างทีมไม่สำเร็จ",
+  "error.displayNameRequired": "ต้องกรอกชื่อที่แสดง",
+  "error.externalReferenceRequired": "ต้องกรอกรหัสอ้างอิงภายนอก",
+  "error.leadRequired": "ต้องมี assistant อย่างน้อยหนึ่งคนเป็นหัวหน้าทีม",
+  "error.orchestratorLimit": "มี assistant ที่เป็น orchestrator ได้เพียงหนึ่งคน",
+  "error.personaNameRequired": "ต้องกรอกชื่อ Persona",
+  "error.personaTemplateRequired": "กรุณาเลือกเทมเพลตของ Persona",
+  "error.userAlreadyInTeam": "ผู้ใช้นี้อยู่ในทีมแล้ว",
+  "manage.addConnector": "เพิ่มคอนเนกเตอร์",
+  "manage.added": "เพิ่มแล้ว",
+  "manage.addMember": "เพิ่มสมาชิก",
+  "manage.addShort": "เพิ่ม",
+  "manage.agentFallback": "เอเจนต์",
+  "manage.connectorInstructionsPlaceholder": "บันทึกเพิ่มเติมว่าควรใช้คอนเนกเตอร์นี้อย่างไร",
+  "manage.connectorNamePlaceholder": "เช่น OpenClaw Gateway",
+  "manage.defaultInstructions": "ทำตามเป้าหมายของทีม",
+  "manage.externalReferencePlaceholder": "เช่น openclaw://main-office",
+  "manage.humanReviewer": "ผู้รีวิวฝั่งมนุษย์",
+  "manage.inTeam": "อยู่ในทีมแล้ว",
+  "manage.linkedUserId": "ผู้ใช้ #{{id}}",
+  "manage.member": "สมาชิก",
+  "manage.members": "สมาชิก",
+  "manage.noMembers": "ยังไม่มีสมาชิก",
+  "manage.roleTitleExternalPlaceholder": "เช่น External Automation Worker",
+  "manage.searchTenantUsers": "ค้นหาผู้ใช้ใน tenant",
+  "manage.searchUsersPlaceholder": "ค้นหาด้วยชื่อหรืออีเมล...",
+  "manage.selectPersonaHelper": "เลือก persona ที่จะเพิ่มเข้าเป็นสมาชิกของทีม",
+  "manage.userFallback": "ผู้ใช้ {{id}}",
+  "memberKind.assistant.description": "เพื่อนร่วมทีม AI ที่มีคำสั่งและบุคลิกเฉพาะ",
+  "memberKind.assistant.label": "Assistant Persona",
+  "memberKind.assistant.short": "Assistant",
+  "memberKind.external.description": "เครื่องมือหรือเอเจนต์ภายนอกที่ทีมนี้จะใช้งานร่วมกัน",
+  "memberKind.external.label": "External Connector",
+  "memberKind.external.short": "Connector",
+  "memberKind.human.description": "คนจริงใน workspace ที่จะเข้ามาอยู่ในทีมนี้",
+  "memberKind.human.label": "Human Member",
+  "memberKind.human.short": "Human",
+  "page.backToDashboard": "กลับไปหน้าแดชบอร์ด",
+  "page.backToTeam": "กลับไปยังทีม",
+  "page.closeSidebar": "ปิดรายชื่อทีม",
+  "page.emptyCta": "สร้างทีม AI แรกของคุณเพื่อเริ่มต้น",
+  "page.noTeamsFound": "ไม่พบทีม",
+  "page.noTeamsYet": "ยังไม่มีทีม",
+  "page.openSidebar": "เปิดรายชื่อทีม",
+  "page.searchPlaceholder": "ค้นหาทีม...",
+  "page.selectTeam": "เลือกทีม",
+  "page.selectTeamHint": "เลือกทีมจากแถบด้านข้างเพื่อดูห้องและบทสนทนา",
+  "page.tab.chat": "บทสนทนา",
+  "page.tab.help": "สลับมุมมองสำหรับจอเล็ก",
+  "page.tab.run": "การรัน",
+  "page.tab.workflow": "บอร์ดงาน",
+  "page.teamCounts": "{{members}} สมาชิก · {{rooms}} ห้อง",
+  "page.title": "ทีม",
+  "role.default": "บทบาท",
+  "role.orchestrator": "Orchestrator",
+  "role.publisher": "Publisher",
+  "role.researcher": "Researcher",
+  "role.reviewer": "Reviewer",
+  "role.specialist": "Specialist",
+  "room.action.advanceOneTurn": "เดินต่อหนึ่งเทิร์น",
+  "room.action.advanceThreeTurns": "เดินต่อสามเทิร์น",
+  "room.action.approveAndPost": "อนุมัติและโพสต์",
+  "room.action.cancelReply": "ยกเลิกการตอบกลับ",
+  "room.action.nextTurn": "เทิร์นถัดไป",
+  "room.action.pauseRun": "พักการรัน",
+  "room.action.promoteToWorkItem": "ยกเป็นงานติดตาม",
+  "room.action.requestChangesAndPost": "ขอแก้ไขและโพสต์",
+  "room.action.resumeRun": "ทำรันต่อ",
+  "room.action.runThree": "รัน 3 เทิร์น",
+  "room.action.stopRun": "หยุดการรัน",
+  "room.comment.promotedMessage": "ยกข้อความในห้องนี้ขึ้นมาเป็นงานติดตามแล้ว",
+  "room.comment.startedResearch": "เริ่มขั้นวิจัยจากข้อความที่ถูกยกขึ้นมาแล้ว",
+  "room.error.coordinatorRequired": "ทีมนี้ต้องมี assistant ที่ทำหน้าที่ประสานงานก่อนจึงจะจัดเส้นทางงานได้",
+  "room.error.teamContextRequired": "ต้องมีบริบทของทีมก่อนจึงจะยกข้อความนี้เป็นงานติดตามได้",
+  "room.error.workItemTitleRequired": "ต้องกรอกชื่องานติดตาม",
+  "room.latestThreadUpdate": "อัปเดตล่าสุดของเธรด",
+  "room.linkedWorkItem": "งานที่เชื่อมอยู่",
+  "room.loadingHistory": "กำลังโหลดประวัติห้อง...",
+  "room.messagePlaceholder": "พิมพ์ข้อความถึงทีม...",
+  "room.messageType.approval": "การอนุมัติ",
+  "room.messageType.critique": "คำวิจารณ์",
+  "room.messageType.decision": "การตัดสินใจ",
+  "room.messageType.revision": "การแก้ไข",
+  "room.messageType.suggestion": "ข้อเสนอแนะ",
+  "room.messageType.summary": "สรุป",
+  "room.messageType.workUpdate": "อัปเดตงาน",
+  "room.noActiveRun": "ยังไม่มีการรันที่กำลังทำงาน",
+  "room.noActiveRunHelp": "เริ่มรันเพื่อเริ่มการสนทนาของทีม",
+  "room.prompt.createWorkItem": "สร้างงานติดตามจากข้อความนี้",
+  "room.prompt.followUpTitle": "ติดตามต่อ: {{title}}",
+  "room.prompt.improveBeforeApproval": "ควรปรับปรุงอะไรบ้างก่อนอนุมัติ?",
+  "room.prompt.reviseDraftDefault": "กรุณาแก้ไขร่างนี้และจัดการคอมเมนต์ในเธรดให้ครบก่อน",
+  "room.quickReply.approve": "อนุมัติ",
+  "room.quickReply.approveContent": "อนุมัติแล้ว งานนี้พร้อมเดินหน้าต่อ",
+  "room.quickReply.continue": "ทำต่อ",
+  "room.quickReply.continueContent": "ตอนนี้ดูดีแล้ว กรุณาทำขั้นตอนถัดไปต่อได้เลย",
+  "room.quickReply.needSources": "ขอแหล่งอ้างอิง",
+  "room.quickReply.needSourcesContent": "กรุณาเพิ่มแหล่งอ้างอิงหรือ citation ที่แข็งแรงขึ้นสำหรับประเด็นสำคัญก่อนเดินหน้าต่อ",
+  "room.quickReply.requestChanges": "ขอแก้ไข",
+  "room.quickReply.requestChangesContent": "กรุณาแก้ไขและอุดช่องว่างที่เหลือก่อนรอบรีวิวถัดไป",
+  "room.quickReply.reviewApproveContent": "ฝั่งรีวิวดูโอเคแล้ว กรุณาส่งต่อไปขั้นอนุมัติได้เลย",
+  "room.replyingTo": "กำลังตอบกลับ",
+  "room.replyingToActor": "กำลังตอบกลับ {{name}}",
+  "room.replyPlaceholder": "ตอบกลับในเธรดนี้...",
+  "room.sourcesCount": "{{count}} แหล่งอ้างอิง",
+  "room.threadLabel": "เธรด",
+  "room.title": "ห้องทีม",
+  "room.toast.workItemAdvanced": "ย้ายงานไปขั้น {{stage}} แล้ว",
+  "room.toast.workItemApproved": "อนุมัติงานแล้ว",
+  "room.toast.workItemChangesRequested": "ส่งคำขอแก้ไขสำหรับงานนี้แล้ว",
+  "room.toast.workItemCreated": "สร้างงานติดตามจากเธรดแล้ว",
+  "room.unreadThreadUpdate": "มีอัปเดตในเธรดยังไม่ได้อ่าน",
+  "room.waitingForActivity": "กำลังรอการทำงานของเอเจนต์...",
+  "room.waitingForActivityHelp": "เอเจนต์จะเริ่มตอบกลับในไม่ช้า คุณสามารถดูบทสนทนาไหลต่อได้แบบเรียลไทม์",
+  "rooms.createDialogTitle": "สร้างห้องทีม",
+  "rooms.createFirstRoom": "สร้างห้องแรก",
+  "rooms.createRoom": "สร้างห้อง",
+  "rooms.defaultRunModeLabel": "โหมดเริ่มต้น:",
+  "rooms.legacyType": "แบบเดิม",
+  "rooms.legacyTypesNote": "ซ่อนห้องแบบเดิมอย่างคุยตรงและรีวิวงานออกจากการสร้างใหม่ชั่วคราว จนกว่าจะมี workflow ที่ต่างอย่างชัดเจนอีกครั้ง",
+  "rooms.newRoom": "ห้องใหม่",
+  "rooms.noObjective": "ยังไม่ได้ตั้งเป้าหมาย",
+  "rooms.noRooms": "ยังไม่มีห้อง",
+  "rooms.objectiveLabel": "เป้าหมาย / วัตถุประสงค์",
+  "rooms.objectivePlaceholder": "ห้องทีมนี้ควรทำงานเรื่องอะไร?",
+  "rooms.roomTypeHelp": "เลือกประเภทห้องก่อน โดยประเภทห้องจะบอกลักษณะการร่วมงาน ส่วนโหมดรันสามารถเปลี่ยนได้อีกตอนเริ่มงาน",
+  "rooms.roomTypeLabel": "ประเภทห้อง",
+  "rooms.runModeLabel": "โหมดการทำงาน:",
+  "rooms.selectedRoomTypeLabel": "ห้องนี้จะเริ่มทำงานเป็นแบบ",
+  "rooms.title": "ห้อง",
+  "roomStatus.active": "ใช้งานอยู่",
+  "roomStatus.archived": "เก็บถาวร",
+  "roomStatus.paused": "หยุดชั่วคราว",
+  "roomType.autoTeam": "ทีมอัตโนมัติ",
+  "roomType.defaultMode.autoTeam": "ทีมเดินงานอัตโนมัติหลายรอบ",
+  "roomType.defaultMode.team": "คุยร่วมกันแบบมีผู้ใช้กำกับ",
+  "roomType.description.autoTeam": "ห้องที่ตั้งใจไว้สำหรับการให้ทีมเดินงานต่อเองเป็นค่าเริ่มต้น แต่ยังสลับกลับมาเป็นแบบมีผู้ใช้กำกับได้ในแต่ละรอบรัน",
+  "roomType.description.directLegacy": "ประเภทห้องแบบเดิม ปัจจุบันยังทำงานเหมือนห้องคุยกันทั้งทีม และคงไว้เพื่อรองรับข้อมูลเดิม",
+  "roomType.description.jobReview": "ห้องรีวิวแบบเดิม ปัจจุบันยังทำงานเหมือนห้องทีมปกติ และคงไว้เพื่อรองรับข้อมูลเดิม",
+  "roomType.description.team": "ห้องคุยร่วมกันทั้งทีมสำหรับงานทั่วไป จะเริ่มแบบมีผู้ใช้กำกับก่อน หรือจะสลับเป็นทีมอัตโนมัติตอนเริ่มรันก็ได้",
+  "roomType.direct": "คุยตรง",
+  "roomType.jobReview": "รีวิวงาน",
+  "roomType.team": "คุยกันทั้งทีม",
+  "run.mode.autoTeam": "ทีมอัตโนมัติ",
+  "run.mode.teamChat": "คุยร่วมกันแบบมีผู้ใช้กำกับ",
+  "run.modeDescription.autoTeam": "ทีมสามารถเดินงานต่อเองหลายรอบได้ จนกว่าจะถึงเงื่อนไขหยุดหรือจำเป็นต้องรอมนุษย์เข้ามาตัดสินใจ",
+  "run.modeDescription.teamChat": "ทีมจะทำงานทีละช่วง โดยให้ผู้ใช้ยังอยู่ในวงตัดสินใจและคอยสั่งต่อเมื่อพร้อม",
+  "run.modeHelp": "โหมดรันจะกำหนดว่ารอบนี้ทีมควรเดินงานเองมากน้อยแค่ไหน โดยคุณสามารถสลับระหว่างแบบมีผู้ใช้กำกับกับแบบอัตโนมัติได้โดยไม่ต้องสร้างห้องใหม่",
+  "run.modeLabel": "โหมดรัน",
+  "run.objectiveLabel": "เป้าหมาย",
+  "run.objectivePlaceholder": "อธิบายว่าทีมควรทำงานเรื่องอะไร...",
+  "run.reason.awaitingExternalMember": "กำลังรอสมาชิกคอนเนกเตอร์ภายนอกตอบกลับก่อนจึงจะทำงานต่อได้",
+  "run.reason.awaitingHumanApproval": "กำลังรอสมาชิกที่เป็นมนุษย์ตรวจทานหรืออนุมัติขั้นตอนถัดไป",
+  "run.reason.endedWithReason": "การรันสิ้นสุดแล้ว: {{reason}}",
+  "run.reason.paused": "การรันถูกหยุดชั่วคราว",
+  "run.reason.pausedWithReason": "การรันถูกหยุดชั่วคราว: {{reason}}",
+  "run.reason.userPaused": "หยุดรันชั่วคราวอยู่ กดดำเนินการต่อได้เมื่อพร้อม",
+  "run.reason.userStopped": "ผู้ใช้หยุดการรันไว้แล้ว สามารถเริ่มรอบใหม่ได้ทันที",
+  "run.start": "เริ่ม",
+  "run.startTitle": "เริ่มรันงาน",
+  "runMonitor.agentRoster": "รายชื่อเอเจนต์",
+  "runMonitor.agents": "เอเจนต์",
+  "runMonitor.events": "เหตุการณ์",
+  "runMonitor.nextTurnButton": "เทิร์นถัดไป",
+  "runMonitor.pauseButton": "พัก",
+  "runMonitor.resumeButton": "ทำต่อ",
+  "runMonitor.runStatusLabel": "สถานะ {{status}}",
+  "runMonitor.runThreeTurnsButton": "รันต่อ 3 เทิร์น",
+  "runMonitor.startNewRunButton": "เริ่มรอบใหม่",
+  "runMonitor.status.completed": "เสร็จแล้ว",
+  "runMonitor.status.failed": "ล้มเหลว",
+  "runMonitor.status.paused": "พักอยู่",
+  "runMonitor.status.queued": "เข้าคิว",
+  "runMonitor.status.running": "กำลังรัน",
+  "runMonitor.status.stopped": "หยุดแล้ว",
+  "runMonitor.stopButton": "หยุด",
+  "runMonitor.timeline": "ไทม์ไลน์เหตุการณ์",
+  "runMonitor.title": "ตัวติดตามการรัน",
+  "runMonitor.tokens": "โทเคน",
+  "runMonitor.turnsShort": "{{count}}t",
+  "runMonitor.waitingForEvents": "กำลังรอเหตุการณ์...",
+  "toast.blueprintLoaded": "โหลด {{name}} แล้ว",
+  "toast.memberAdded": "เพิ่มสมาชิกแล้ว",
+  "toast.memberUpdated": "อัปเดตสมาชิกแล้ว",
+  "toast.personaCreated": "สร้าง Persona แล้ว",
+  "toast.personaCreatedAndAdded": "สร้าง Persona และเพิ่มเข้าทีมแล้ว",
+  "toast.roomCreated": "สร้างห้องแล้ว",
+  "toast.runAdvanced": "ขยับต่อแล้ว {{count}} เทิร์น",
+  "toast.runAdvanceRequested": "ส่งคำสั่งให้ขยับต่อ {{count}} เทิร์นแล้ว",
+  "toast.runPaused": "พักการรันแล้ว",
+  "toast.runResumed": "รันต่อแล้ว",
+  "toast.runStarted": "เริ่มรันแล้ว",
+  "toast.runStopped": "หยุดรันแล้ว",
+  "toast.teamCreated": "สร้างทีมแล้ว",
+  "workflow.action.advance": "เดินต่อ",
+  "workflow.action.sendToApproval": "ส่งเข้าอนุมัติ",
+  "workflow.action.sendToReview": "ส่งเข้ารีวิว",
+  "workflow.action.startResearch": "เริ่มวิจัย",
+  "workflow.approvalLabel": "อนุมัติ",
+  "workflow.approveAndResume": "อนุมัติและทำต่อ",
+  "workflow.artifactCount": "{{count}} อาร์ติแฟกต์",
+  "workflow.count.awaitingApproval": "รออนุมัติ",
+  "workflow.count.completed": "เสร็จแล้ว",
+  "workflow.count.inReview": "กำลังรีวิว",
+  "workflow.count.open": "เปิดอยู่",
+  "workflow.currentObjective": "เป้าหมายปัจจุบัน",
+  "workflow.description": "ทุกงานจะถูกติดตามที่นี่ เพื่อให้ทีมรีวิว แก้ไข และอนุมัติร่วมกันได้",
+  "workflow.draftReady": "ร่างพร้อมแล้ว",
+  "workflow.dueAt": "ครบกำหนด {{value}}",
+  "workflow.emptyDescription": "เริ่มรันในห้องนี้ แล้ว orchestrator จะสร้างงานตั้งต้นให้อัตโนมัติ",
+  "workflow.emptyFilterDescription": "ลองสลับตัวกรองเพื่อดูคิวงานส่วนที่เหลือ",
+  "workflow.emptyFilterTitle": "ไม่มีงานที่ตรงกับตัวกรองนี้",
+  "workflow.emptyTitle": "ยังไม่มีงานติดตาม",
+  "workflow.error.assistantCoordinatorRequired": "ทีมนี้ต้องมี assistant อย่างน้อยหนึ่งคนเพื่อจัดเส้นทางงาน",
+  "workflow.error.noApprover": "ไม่มีผู้อนุมัติที่พร้อมสำหรับงานนี้",
+  "workflow.filter.all": "ทั้งหมด",
+  "workflow.filter.attention": "ต้องดู",
+  "workflow.filter.blocked": "ติดค้าง / รออนุมัติ",
+  "workflow.loadErrorDescription": "การรันของห้องอาจเริ่มแล้ว แต่ระบบเก็บงานติดตามโหลดไม่สำเร็จ กรุณาตรวจ log ของเซิร์ฟเวอร์หรือ schema ฐานข้อมูล",
+  "workflow.loadErrorTitle": "ไม่สามารถโหลดบอร์ดงานได้",
+  "workflow.loading": "กำลังโหลดรายการงาน...",
+  "workflow.nextStage": "ขั้นถัดไป",
+  "workflow.openThread": "เปิดเธรด",
+  "workflow.pause.externalRequired": "ต้องการการตอบกลับจากภายนอก",
+  "workflow.pause.humanRequired": "ต้องการการตัดสินใจจากมนุษย์",
+  "workflow.pause.runPaused": "การรันถูกพักไว้",
+  "workflow.pause.waitingItems": "กำลังรอ {{count}} งานด้านล่างอยู่",
+  "workflow.prompt.improveBeforeRevision": "ทีมควรปรับปรุงอะไรบ้างก่อนรอบแก้ไขถัดไป?",
+  "workflow.prompt.reviseLatestDraft": "กรุณาแก้ไขร่างล่าสุดและจัดการคอมเมนต์รีวิวให้ครบ",
+  "workflow.recommended.approvalNeeded": "ต้องมีการตัดสินใจอนุมัติ",
+  "workflow.recommended.needsHumanApproval": "ต้องการการอนุมัติจากมนุษย์",
+  "workflow.recommended.needsHumanReview": "ต้องการการรีวิวจากมนุษย์",
+  "workflow.recommended.needsRecovery": "ต้องกู้คืนงาน",
+  "workflow.recommended.noFurtherAction": "ยังไม่ต้องทำอะไรต่อ",
+  "workflow.recommended.prepareReview": "เตรียมเข้ารีวิว",
+  "workflow.recommended.readyToResume": "พร้อมทำต่อ",
+  "workflow.recommended.reviewFeedbackPending": "กำลังรอฟีดแบ็กรีวิว",
+  "workflow.recommended.reviewNextStep": "ทบทวนขั้นถัดไป",
+  "workflow.recommended.reviseContinue": "แก้ไขและทำต่อ",
+  "workflow.recommended.startResearch": "เริ่มวิจัย",
+  "workflow.recommended.unblockFirst": "ปลดบล็อกก่อนจึงค่อยทำต่อ",
+  "workflow.recommended.waitingExternal": "กำลังรอคอนเนกเตอร์ภายนอก",
+  "workflow.researchLabel": "วิจัย",
+  "workflow.reviewLabel": "รีวิว",
+  "workflow.reviseAndResume": "แก้ไขและทำต่อ",
+  "workflow.status.awaiting_approval": "รออนุมัติ",
+  "workflow.status.blocked": "ติดบล็อก",
+  "workflow.status.cancelled": "ยกเลิก",
+  "workflow.status.completed": "เสร็จแล้ว",
+  "workflow.status.failed": "ล้มเหลว",
+  "workflow.status.in_progress": "กำลังทำ",
+  "workflow.status.in_review": "กำลังรีวิว",
+  "workflow.status.needs_revision": "ต้องแก้ไข",
+  "workflow.status.planned": "วางแผนแล้ว",
+  "workflow.status.superseded": "ถูกแทนที่แล้ว",
+  "workflow.status.unknown": "ไม่ทราบสถานะ",
+  "workflow.title": "บอร์ดงาน",
+  "workflow.toast.revisionSentBack": "ส่งกลับไปแก้ไขต่อแล้ว",
+  "workflow.unassigned": "ยังไม่มอบหมาย",
+  "workflow.unreadThreadActivity": "มีอัปเดตเธรดยังไม่ได้อ่าน",
+  "workflow.updatedAt": "อัปเดต {{value}}",
+  "workflow.waitingForExternal": "กำลังรอภายนอก",
+  "workflow.waitingForHuman": "กำลังรอมนุษย์"
+}
diff --git a/apps/web/client/src/locales/th/auth.json b/apps/web/client/src/locales/th/auth.json
new file mode 100644
index 00000000..4fb2d137
--- /dev/null
+++ b/apps/web/client/src/locales/th/auth.json
@@ -0,0 +1,21 @@
+{
+  "callback.error": "การยืนยันตัวตนล้มเหลว กรุณาลองใหม่",
+  "callback.processing": "กำลังดำเนินการลงชื่อเข้าใช้…",
+  "mfa.codeLabel": "รหัสยืนยัน",
+  "mfa.submitButton": "ยืนยัน",
+  "mfa.title": "การยืนยันตัวตนสองขั้นตอน",
+  "resetPassword.emailLabel": "ที่อยู่อีเมล",
+  "resetPassword.submitButton": "ส่งลิงก์รีเซ็ต",
+  "resetPassword.title": "รีเซ็ตรหัสผ่าน",
+  "signIn.createAccount": "สร้างบัญชี",
+  "signIn.emailLabel": "อีเมล",
+  "signIn.forgotPassword": "ลืมรหัสผ่าน?",
+  "signIn.noAccount": "ยังไม่มีบัญชี?",
+  "signIn.passwordLabel": "รหัสผ่าน",
+  "signIn.submitButton": "เข้าสู่ระบบ",
+  "signIn.title": "เข้าสู่ระบบ",
+  "signUp.createAccount": "สร้างบัญชี",
+  "signUp.email": "อีเมล",
+  "signUp.password": "รหัสผ่าน",
+  "signUp.title": "สร้างบัญชี"
+}
diff --git a/apps/web/client/src/locales/th/billing.json b/apps/web/client/src/locales/th/billing.json
new file mode 100644
index 00000000..daf86d47
--- /dev/null
+++ b/apps/web/client/src/locales/th/billing.json
@@ -0,0 +1,79 @@
+{
+  "buyCredits.browse": "เครดิตไม่พอใช่ไหม? ดูแพ็กเกจ {{count}} รายการ",
+  "buyCredits.collapsed": "มี {{count}} แพ็กเกจ - คลิกเพื่อขยาย",
+  "buyCredits.cta": "ซื้อ",
+  "buyCredits.descriptionExpanded": "เลือกแพ็กเกจที่เหมาะกับคุณ (บวก 15% จากอัตราพื้นฐาน)",
+  "buyCredits.noPackages": "ยังไม่มีแพ็กเกจ",
+  "buyCredits.oneTime": "จ่ายครั้งเดียว",
+  "buyCredits.popular": "ยอดนิยม",
+  "buyCredits.title": "ซื้อเครดิต",
+  "creatorEarnings.breakdownTitle": "รายได้แยกตามเอนทิตี",
+  "creatorEarnings.entities.creator_revenue": "รายได้ผู้สร้าง",
+  "creatorEarnings.entities.media": "สื่อ",
+  "creatorEarnings.entities.other": "อื่น ๆ",
+  "creatorEarnings.entities.template": "เทมเพลต",
+  "creatorEarnings.entities.workflow": "เวิร์กโฟลว์",
+  "creatorEarnings.last30Days": "30 วันที่ผ่านมา",
+  "creatorEarnings.runs": "{{count}} รอบ",
+  "creatorEarnings.title": "รายได้ผู้สร้าง",
+  "creatorEarnings.totalEarned": "รายได้รวม",
+  "creatorEarnings.totalRuns": "จำนวนรอบทั้งหมด",
+  "description": "จัดการยอดเครดิตของคุณ",
+  "meta.billing": "การเรียกเก็บ",
+  "meta.images": "รูปภาพ",
+  "meta.job": "งาน",
+  "meta.media": "สื่อ",
+  "meta.model": "โมเดล",
+  "meta.operation": "การทำงาน",
+  "meta.prompt": "พรอมต์",
+  "meta.provider": "ผู้ให้บริการ",
+  "meta.skill": "สกิล",
+  "meta.stage": "ขั้นตอน",
+  "meta.task": "ทาสก์",
+  "meta.tokens": "โทเคน",
+  "pagination.page": "หน้า {{page}} • {{count}} รายการ",
+  "sources.admin": "ผู้ดูแล",
+  "sources.agency": "เอเจนซี",
+  "sources.alert": "แจ้งเตือน",
+  "sources.automation": "อัตโนมัติ",
+  "sources.brainstorm": "ระดมไอเดีย",
+  "sources.chat": "แชท",
+  "sources.creatorRevenue": "รายได้ผู้สร้าง",
+  "sources.indexing": "จัดทำดัชนี",
+  "sources.mediaAudio": "เสียง",
+  "sources.mediaImage": "รูปภาพ",
+  "sources.mediaVideo": "วิดีโอ",
+  "sources.other": "อื่น ๆ",
+  "sources.search": "ค้นหา",
+  "sources.skill": "สกิล",
+  "sources.stt": "STT",
+  "sources.translate": "แปล",
+  "stats.creditsUsed30d": "เครดิตที่ใช้ (30 วัน)",
+  "stats.currentBalance": "ยอดคงเหลือปัจจุบัน",
+  "stats.totalPurchased": "ซื้อรวม",
+  "stats.transactions": "ธุรกรรม",
+  "table.audit": "ตรวจสอบ",
+  "table.balance": "ยอดคงเหลือ",
+  "table.credits": "เครดิต",
+  "table.date": "วันที่",
+  "table.description": "รายละเอียด",
+  "table.details": "ข้อมูล",
+  "table.source": "แหล่งที่มา",
+  "table.type": "ประเภท",
+  "time.daysAgo": "{{count}} วันก่อน {{time}}",
+  "time.hoursAgo": "{{count}} ชม.ที่แล้ว ({{time}})",
+  "time.justNow": "เมื่อสักครู่",
+  "time.minutesAgo": "{{count}} นาทีที่แล้ว",
+  "time.yesterday": "เมื่อวาน {{time}}",
+  "title": "เครดิต",
+  "transactionHistory.allSources": "ทุกแหล่งที่มา",
+  "transactionHistory.description": "การเคลื่อนไหวของยอดคงเหลือ การซื้อ และการใช้งานล่าสุด",
+  "transactionHistory.empty": "ยังไม่มีธุรกรรม",
+  "transactionHistory.eyebrow": "การเรียกเก็บเงิน",
+  "transactionHistory.title": "ประวัติธุรกรรม",
+  "transactionType.bonus": "โบนัส",
+  "transactionType.other": "อื่น ๆ",
+  "transactionType.purchase": "ซื้อ",
+  "transactionType.usage": "ใช้งาน",
+  "unit": "เครดิต"
+}
diff --git a/apps/web/client/src/locales/th/chat.json b/apps/web/client/src/locales/th/chat.json
new file mode 100644
index 00000000..91a8941d
--- /dev/null
+++ b/apps/web/client/src/locales/th/chat.json
@@ -0,0 +1,51 @@
+{
+  "agencies": "เอเจนซี",
+  "agencyDetected": "ตรวจพบเอเจนซี: {{name}}",
+  "agencyDetectedHint": "ข้อความของคุณอาจเหมาะกับทีมเอเจนซีนี้มากกว่า",
+  "agencyMessagePlaceholder": "ข้อความถึง {{name}}...",
+  "agencyNoActivity": "ยังไม่มีกิจกรรม ส่งพรอมต์ด้านล่างแล้วเอเจนซีจะแสดงงานที่ทำที่นี่",
+  "agencyPanelCollapsed": "แผงถูกย่อไว้ ขยายเพื่อดูเอาต์พุตสดและส่งพรอมต์ต่อ",
+  "agencyPanelHint": "ส่งพรอมต์เพื่อเริ่มรันเอเจนซีนี้ เอาต์พุตสดจะปรากฏด้านล่างเมื่อเริ่มทำงาน",
+  "agencyRunning": "เอเจนซีกำลังทำงาน... {{agent}}",
+  "alerts": "แจ้งเตือน",
+  "artifacts": "อาร์ติแฟกต์",
+  "browserInstructionPlaceholder": "ตัวอย่าง: หาเว็บไซต์ที่ดีที่สุดสำหรับงานนี้ เปรียบเทียบตัวเลือก แล้วทำต่อ",
+  "browserSession": "Browser Session",
+  "browserSession.opened": "เปิด Browser Session จากแชทแล้ว",
+  "browserSession.queued": "จัดคิวคำสั่งสำหรับ Browser Session แล้ว",
+  "browserSession.queueFailed": "จัดคิวคำสั่ง Browser Session ไม่สำเร็จ",
+  "browserSession.returned": "Browser Session ถูกส่งกลับไปยังแชทแล้ว",
+  "browserSession.returnLabel": "กลับไปยังแชท",
+  "browserSessionDescription": "ให้ AI ทำงานในเบราว์เซอร์สดจากแชทนี้โดยตรง",
+  "browserSessionHint": "เริ่ม Browser Session เพื่อให้ AI ค้นหาเว็บไซต์ นำทางหน้า และทำงานต่อได้ขณะที่คุณอยู่ในแชท",
+  "chooseBrowserSkill": "เลือก browser skill",
+  "collapseAgencyPanel": "ย่อแผงเอเจนซี",
+  "connecting": "กำลังเชื่อมต่อ...",
+  "conversationEyebrow": "บทสนทนา",
+  "currentAgent": "เอเจนต์ปัจจุบัน: {{agent}}",
+  "dismiss": "ปิด",
+  "expandAgencyPanel": "ขยายแผงเอเจนซี",
+  "exploreAgencies": "สำรวจเอเจนซี",
+  "hideSidebar": "ซ่อนแถบด้านข้าง",
+  "memory": "ความจำ",
+  "newChat": "แชทใหม่",
+  "openBrowserSession": "เปิด Browser Session",
+  "queuingInstruction": "กำลังจัดคิวคำสั่ง...",
+  "quickBrowserInstruction": "คำสั่งเบราว์เซอร์ด่วน",
+  "quickBrowserInstructionDesc": "อธิบายผลลัพธ์ถัดไปที่ต้องการหรือขั้นตอนที่ AI ควรทำ โดยไม่ต้องออกจากแชท",
+  "retry": "ลองใหม่",
+  "runAgain": "รันอีกครั้ง",
+  "runAgency": "รันเอเจนซี",
+  "runAgencyInline": "รันเอเจนซีแบบอินไลน์",
+  "running": "กำลังทำงาน...",
+  "sendBrowserInstruction": "ส่งคำสั่งเบราว์เซอร์",
+  "showSidebar": "แสดงแถบด้านข้าง",
+  "skills": "สกิล",
+  "startBrowserSession": "เริ่ม Browser Session",
+  "startNewChat": "เริ่มแชทใหม่",
+  "startRun": "เริ่มรัน",
+  "title": "แชท AI",
+  "useAgency": "ใช้เอเจนซี",
+  "welcomeDescription": "เริ่มบทสนทนาใหม่หรือเลือกจากแถบด้านข้าง",
+  "welcomeTitle": "ยินดีต้อนรับสู่แชท AI"
+}
diff --git a/apps/web/client/src/locales/th/common.json b/apps/web/client/src/locales/th/common.json
new file mode 100644
index 00000000..0568eee4
--- /dev/null
+++ b/apps/web/client/src/locales/th/common.json
@@ -0,0 +1,103 @@
+{
+  "active": "ใช้งานอยู่",
+  "admin.critical": "วิกฤต",
+  "admin.title": "ศูนย์การแจ้งเตือน",
+  "admin.today": "วันนี้",
+  "admin.total": "ทั้งหมด",
+  "admin.unread": "ยังไม่อ่าน",
+  "alertRules.cooldown": "คูลดาวน์ (นาที)",
+  "alertRules.create": "สร้างกฎแจ้งเตือน",
+  "alertRules.enabled": "เปิดใช้งาน",
+  "alertRules.metric": "เมตริก",
+  "alertRules.name": "ชื่อกฎ",
+  "alertRules.operator": "ตัวดำเนินการ",
+  "alertRules.threshold": "เกณฑ์",
+  "alertRules.title": "กฎแจ้งเตือน",
+  "back": "ย้อนกลับ",
+  "cancel": "ยกเลิก",
+  "category.agency": "เอเจนซี่",
+  "category.business": "ธุรกิจ",
+  "category.feedback": "ข้อเสนอแนะ",
+  "category.follow": "การติดตาม",
+  "category.media_jobs": "งานสื่อ",
+  "category.scheduled": "ข้อความตั้งเวลา",
+  "category.security": "ความปลอดภัย",
+  "category.skill": "ทักษะ",
+  "category.system_health": "สุขภาพระบบ",
+  "category.workflow": "เวิร์กโฟลว์",
+  "change": "เปลี่ยน",
+  "clear": "ล้าง",
+  "close": "ปิด",
+  "confirm": "ยืนยัน",
+  "confirmDialog.irreversible": "การกระทำนี้ไม่สามารถย้อนกลับได้",
+  "confirmDialog.title": "คุณแน่ใจหรือไม่?",
+  "copied": "คัดลอกไปยังคลิปบอร์ดแล้ว",
+  "copy": "คัดลอก",
+  "create": "สร้าง",
+  "delete": "ลบ",
+  "deselectAll": "ยกเลิกการเลือกทั้งหมด",
+  "download": "ดาวน์โหลด",
+  "edit": "แก้ไข",
+  "emptyState.noItems": "ไม่พบรายการ",
+  "emptyState.noResults": "ไม่พบผลลัพธ์",
+  "emptyState.nothingYet": "ยังไม่มีข้อมูล",
+  "error": "ข้อผิดพลาด",
+  "escalation.target": "เป้าหมายการยกระดับ",
+  "escalation.title": "นโยบายการยกระดับ",
+  "escalation.triggerMinutes": "ทริกเกอร์หลัง (นาที)",
+  "escalation.triggerSeverity": "ระดับความรุนแรงที่ทริกเกอร์",
+  "example": "ตัวอย่าง",
+  "export": "ส่งออก",
+  "filter": "กรอง",
+  "group.expand": "ขยายกลุ่ม",
+  "group.latest": "ล่าสุด",
+  "group.occurrences": "จำนวนครั้ง",
+  "import": "นำเข้า",
+  "inactive": "ไม่ใช้งาน",
+  "loading": "กำลังโหลด…",
+  "next": "ถัดไป",
+  "no": "ไม่",
+  "ok": "ตกลง",
+  "optional": "ไม่บังคับ",
+  "output": "ผลลัพธ์",
+  "pagination.next": "ถัดไป",
+  "pagination.page": "หน้า {{page}}",
+  "pagination.previous": "ก่อนหน้า",
+  "pagination.showing": "แสดง {{from}}–{{to}} จาก {{total}}",
+  "pending": "รอดำเนินการ",
+  "previous": "ก่อนหน้า",
+  "refresh": "รีเฟรช",
+  "required": "จำเป็น",
+  "retry": "ลองใหม่",
+  "save": "บันทึก",
+  "saveChanges": "บันทึกการเปลี่ยนแปลง",
+  "search": "ค้นหา...",
+  "selectAll": "เลือกทั้งหมด",
+  "settings.email": "อีเมล",
+  "settings.inApp": "ในแอป",
+  "settings.minSeverity": "ระดับความรุนแรงขั้นต่ำ",
+  "settings.mute": "ปิดเสียง",
+  "settings.save": "บันทึกการตั้งค่า",
+  "settings.telegram": "เทเลแกรม",
+  "settings.title": "การตั้งค่าการแจ้งเตือน",
+  "showLess": "แสดงน้อยลง",
+  "showMore": "แสดงเพิ่มเติม",
+  "sort": "เรียงลำดับ",
+  "submit": "ส่ง",
+  "success": "สำเร็จ",
+  "toast.copied": "คัดลอกไปยังคลิปบอร์ด",
+  "toast.created": "สร้างสำเร็จ",
+  "toast.deleted": "ลบสำเร็จ",
+  "toast.failed": "การดำเนินการล้มเหลว",
+  "toast.saved": "บันทึกสำเร็จ",
+  "update": "อัปเดต",
+  "upload": "อัปโหลด",
+  "webhooks.categories": "หมวดหมู่",
+  "webhooks.create": "สร้างเว็บฮุก",
+  "webhooks.name": "ชื่อเว็บฮุก",
+  "webhooks.secret": "คีย์ลงนาม",
+  "webhooks.test": "ทดสอบเว็บฮุก",
+  "webhooks.title": "เว็บฮุกการแจ้งเตือน",
+  "webhooks.url": "URL เว็บฮุก",
+  "yes": "ใช่"
+}
diff --git a/apps/web/client/src/locales/th/dashboard.json b/apps/web/client/src/locales/th/dashboard.json
new file mode 100644
index 00000000..0967ef42
--- /dev/null
+++ b/apps/web/client/src/locales/th/dashboard.json
@@ -0,0 +1 @@
+{}
diff --git a/apps/web/client/src/locales/th/errors.json b/apps/web/client/src/locales/th/errors.json
new file mode 100644
index 00000000..464ad4d4
--- /dev/null
+++ b/apps/web/client/src/locales/th/errors.json
@@ -0,0 +1,16 @@
+{
+  "forbidden.message": "คุณไม่มีสิทธิ์เข้าถึงทรัพยากรนี้",
+  "forbidden.title": "การเข้าถึงถูกปฏิเสธ",
+  "generic.somethingWentWrong": "เกิดข้อผิดพลาด กรุณาลองใหม่",
+  "generic.tryAgain": "ลองใหม่",
+  "networkError": "ข้อผิดพลาดเครือข่าย กรุณาตรวจสอบการเชื่อมต่อ",
+  "notFound.message": "ไม่พบหน้าที่คุณกำลังค้นหา",
+  "notFound.title": "ไม่พบหน้า",
+  "requestFailed": "คำขอล้มเหลว กรุณาลองใหม่",
+  "serverError.message": "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
+  "serverError.title": "ข้อผิดพลาดเซิร์ฟเวอร์",
+  "session.expired": "เซสชันของคุณหมดอายุ กรุณาลงชื่อเข้าใช้ใหม่",
+  "validation.invalidEmail": "กรุณากรอกที่อยู่อีเมลที่ถูกต้อง",
+  "validation.passwordTooShort": "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
+  "validation.required": "จำเป็นต้องกรอกข้อมูลในช่องนี้"
+}
diff --git a/apps/web/client/src/locales/th/help.json b/apps/web/client/src/locales/th/help.json
new file mode 100644
index 00000000..0dee228f
--- /dev/null
+++ b/apps/web/client/src/locales/th/help.json
@@ -0,0 +1,289 @@
+{
+  "agencies.1": "Agencies คือทีม AI หลายตัวที่ทำงานร่วมกันเพื่อจัดการงานซับซ้อน",
+  "agencies.2": "แต่ละ agency มีเอเจนต์เฉพาะทาง (นักวิจัย, นักเขียน, นักวางแผน) ที่ร่วมงานกันอัตโนมัติ",
+  "agencies.3": "เข้าถึง agencies ผ่านปุ่ม Agencies ในแถบเครื่องมือ หรือปุ่ม Explore Agencies บนหน้าต้อนรับ",
+  "agencies.4": "Agencies สร้างผลลัพธ์แบบมีโครงสร้าง เช่น รายงานวิจัย สตอรี่บอร์ด ชุดสไลด์ และตารางเปรียบเทียบ",
+  "agencies.commit.col.button": "ปุ่ม",
+  "agencies.commit.col.dest": "ปลายทาง",
+  "agencies.commit.col.type": "ประเภท Preview",
+  "agencies.commit.deck.button": "Save as Presentation",
+  "agencies.commit.deck.dest": "เปลี่ยนไปหน้า Presentation Editor อัตโนมัติ",
+  "agencies.commit.deck.type": "ชุดสไลด์ Presentation",
+  "agencies.commit.research.button": "Save to Library",
+  "agencies.commit.research.dest": "Library (toast แสดงลิงก์ View in Library)",
+  "agencies.commit.research.type": "วิจัย / สตอรี่บอร์ด / เปรียบเทียบ",
+  "agencies.commit.title": "การบันทึกตามประเภท",
+  "agencies.howToStart.1": "คลิก Agencies ในแถบเครื่องมือ Chat (หรือ Explore Agencies บนหน้าต้อนรับ)",
+  "agencies.howToStart.2": "เลือกจาก agency ที่มีอยู่หรือสร้างจากเทมเพลต (Deep Research, Storyboard Planner, Deck Builder)",
+  "agencies.howToStart.3": "เปิด agency และพิมพ์คำร้องขอใน Agency Chat",
+  "agencies.howToStart.4": "เอเจนต์ทำงานร่วมกันอัตโนมัติ เมื่อเสร็จ Preview Card จะปรากฏ",
+  "agencies.howToStart.5": "ตรวจสอบ preview และคลิก Save เพื่อบันทึกลง Library หรือ Presentation Editor",
+  "agencies.howToStart.title": "วิธีเริ่มต้น",
+  "agencies.other.1": "คลิกปุ่ม X บน Preview Card เพื่อยกเลิกโดยไม่บันทึก",
+  "agencies.other.2": "หาก preview โหลดไม่สำเร็จ จะแสดง toast สีแดง ส่งข้อความเดิมอีกครั้งเพื่อลองใหม่",
+  "agencies.other.3": "หากบันทึกไม่สำเร็จ ปุ่มจะเปลี่ยนเป็น Retry Save คลิกเพื่อลองอีกครั้ง",
+  "agencies.other.title": "การดำเนินการอื่น",
+  "agencies.preview.committed": "บันทึกแล้ว",
+  "agencies.preview.committed.desc": "บันทึกสำเร็จ สำหรับสไลด์จะเปลี่ยนไปหน้า Presentation Editor ประเภทอื่นจะแสดงลิงก์ View in Library ใน toast",
+  "agencies.preview.expired": "หมดเวลา",
+  "agencies.preview.expired.desc": "Preview หมดอายุก่อนบันทึก เรียก agency อีกครั้งเพื่อรับ preview ใหม่",
+  "agencies.preview.failed": "บันทึกล้มเหลว",
+  "agencies.preview.failed.desc": "เกิดข้อผิดพลาด ปุ่ม Retry Save จะปรากฏเพื่อลองอีกครั้ง",
+  "agencies.preview.ready": "พร้อม Preview",
+  "agencies.preview.ready.desc": "เอเจนต์ทำเสร็จแล้ว ตรวจสอบ preview แล้วเลือกว่าจะบันทึกหรือไม่",
+  "agencies.preview.saving": "กำลังบันทึก...",
+  "agencies.preview.saving.desc": "กำลังดำเนินการ commit",
+  "agencies.preview.title": "สถานะ Preview Card",
+  "agencies.templates.title": "เทมเพลต Agency ที่มีให้ใช้",
+  "agencies.title": "Agencies — ทีม AI หลายตัว",
+  "agencies.tpl.comparison.desc": "เปรียบเทียบตัวเลือกแบบเคียงข้างพร้อมราคา ความพร้อม ลิงก์หลักฐาน และข้อแนะนำ",
+  "agencies.tpl.comparison.example": "\"Compare 5 hotels in Chiang Mai under 3000 THB/night\"",
+  "agencies.tpl.comparison.name": "Comparison Agent",
+  "agencies.tpl.comparison.output": "ตารางเปรียบเทียบ",
+  "agencies.tpl.deck.desc": "ชุดสไลด์ครบพร้อมหัวข้อ หัวข้อย่อย โน้ตผู้บรรยาย และข้อเสนอกราฟิก บันทึกตรงไปยัง Presentation Editor",
+  "agencies.tpl.deck.example": "\"Build a Q4 earnings presentation with 8 slides\"",
+  "agencies.tpl.deck.name": "Deck Builder",
+  "agencies.tpl.deck.output": "ชุดสไลด์ Presentation",
+  "agencies.tpl.research.desc": "งานวิจัยจากหลายแหล่งพร้อมบทสรุปผู้บริหาร ข้อค้นพบสำคัญ หัวข้อย่อย และข้อเสนอแนะ",
+  "agencies.tpl.research.example": "\"Research AI marketing trends in Southeast Asia 2026\"",
+  "agencies.tpl.research.name": "Deep Research",
+  "agencies.tpl.research.output": "รายงานวิจัย",
+  "agencies.tpl.storyboard.desc": "แผนวิดีโอแบบฉากต่อฉากพร้อมบทพูด มุมกล้อง แสง และพรอมต์เสียง/ภาพ",
+  "agencies.tpl.storyboard.example": "\"Create a 60-second product launch storyboard for a fitness app\"",
+  "agencies.tpl.storyboard.name": "Storyboard Planner",
+  "agencies.tpl.storyboard.output": "สตอรี่บอร์ดวิดีโอ",
+  "best.1": "เริ่มด้วยผลลัพธ์ที่ต้องการ เช่น \"หา 3 ผู้ขายที่ดีที่สุดสำหรับ X แล้วอธิบายข้อแตกต่าง\"",
+  "best.2": "บอกสิ่งที่ต้องหลีกเลี่ยง เช่น \"หลีกเลี่ยง marketplace สินค้า sponsored และเว็บที่ราคาไม่ชัดเจน\"",
+  "best.3": "บอก AI ว่าเมื่อไหร่ต้องหยุดรอ เช่น \"หยุดก่อนชำระเงิน ยืนยันล็อกอิน หรือ OTP\"",
+  "best.4": "ขอโครงสร้างผลลัพธ์ เช่น \"ส่งตารางเปรียบเทียบจัดอันดับพร้อมข้อดี ข้อเสีย และข้อแนะนำสุดท้าย\"",
+  "best.5": "ใช้คำสั่งเพิ่มเติมแทนการเริ่มใหม่ เช่น \"จำกัดเฉพาะตัวเลือกที่มีในกรุงเทพ\"",
+  "best.title": "แนวทางปฏิบัติที่ดี",
+  "browser.1": "ใช้ Browser Session เมื่องานต้องเปิดเว็บไซต์จริง เปรียบเทียบหลายหน้า หรือทำขั้นตอนในเบราว์เซอร์",
+  "browser.2": "เริ่ม Browser Session จาก Chat แล้วทำงานต่อในพื้นที่ทำงานจริงหรือส่งคำสั่งเร็วจาก Chat",
+  "browser.3": "Browser Session เหมาะสำหรับค้นหาเว็บไซต์ เปิดหน้าเว็บ เปรียบเทียบตัวเลือก และหยุดรอการอนุมัติ",
+  "browser.title": "Browser Session",
+  "chatBasics.1": "พิมพ์ข้อความปกติเพื่อแชทกับโมเดลที่เลือก",
+  "chatBasics.2": "ใช้ตัวเลือกโมเดลด้านบนของบทสนทนาเพื่อเปลี่ยน LLM ที่ใช้งาน",
+  "chatBasics.3": "ใช้ทีม AI เมื่อต้องการให้โมเดลหลายตัวร่วมกัน — ไปที่หน้า Teams เพื่อเริ่มอภิปราย",
+  "chatBasics.4": "แนบไฟล์หรือรูปภาพเมื่องานต้องใช้เอกสารประกอบ",
+  "chatBasics.title": "พื้นฐาน Chat",
+  "chatBestFor.body": "Chat เป็นช่องทางที่เร็วที่สุดในการถามคำตอบ ร่างเนื้อหา ระดมสมอง สร้างพรอมต์ วิเคราะห์ และทำงานต่อเนื่อง เริ่มที่นี่เมื่อต้องการโต้ตอบกับ AI โดยตรง และย้ายไปใช้ Browser Session หรือ Agencies เมื่องานต้องการพื้นที่ทำงานแบบอื่น",
+  "chatBestFor.title": "Chat เหมาะสำหรับอะไร",
+  "description": "ใช้ Browser Session เมื่อต้องการให้ AI ค้นหาเว็บไซต์ เปิดหน้าเว็บ เปรียบเทียบตัวเลือก และทำงานต่อในเบราว์เซอร์จริงให้คุณ",
+  "media.1": "ใช้ Generate Image เพื่อเริ่มด้วย create image: แล้วอธิบายภาพที่ต้องการ",
+  "media.2": "ใช้ Generate Video เพื่อเริ่มด้วย create video: สำหรับผลลัพธ์แบบเคลื่อนไหว",
+  "media.3": "ใช้ Generate Audio เมื่อต้องการสร้างเสียงพูด เพลง หรือเสียงประกอบ",
+  "media.4": "ใช้ prompt-enhance เมื่อพิมพ์ไอเดียคร่าว ๆ แล้วต้องการให้ระบบปรับปรุงพรอมต์ก่อน",
+  "media.5": "แนบภาพตัวอย่างและขอให้โมเดลแก้ไขหรือต่อยอดได้",
+  "media.title": "สร้างรูปภาพ วิดีโอ และเสียง",
+  "memory.auto.1": "AI ดึงข้อเท็จจริงจากบทสนทนาและบันทึกอัตโนมัติ",
+  "memory.auto.2": "ข้อมูลสำคัญน้อยบันทึกเงียบ ๆ ข้อมูลสำคัญมากจะถามยืนยันก่อน",
+  "memory.auto.3": "ข้อมูลส่วนตัว (อีเมล รหัสผ่าน API key) จะถูกกรองออกและไม่ถูกบันทึก",
+  "memory.auto.4": "Memory อยู่ได้ 180 วันหากไม่ถูกเข้าถึง กฎ (Rules) ไม่ถูกลบอัตโนมัติ",
+  "memory.auto.title": "Memory อัตโนมัติ",
+  "memory.intro": "Memory ช่วยให้ AI จดจำค่ากำหนด บริบทโปรเจกต์ การตัดสินใจ และข้อเท็จจริงสำคัญข้ามทุกบทสนทนา เปิดแผง Memory ที่แถบด้านขวาเพื่อจัดการทั้งหมด",
+  "memory.manage.1": "เพิ่ม: คลิกปุ่ม + Add เลือกประเภท ตั้งชื่อ เขียนเนื้อหา ตั้งความสำคัญ (1-10)",
+  "memory.manage.2": "ลบ: เลื่อนเมาส์ไปบน memory แล้วคลิกไอคอนถังขยะ",
+  "memory.manage.3": "กรอง: ใช้ปุ่มกรองประเภท (All, User, Project, Preference ฯลฯ) เพื่อค้นหา",
+  "memory.manage.4": "ความสำคัญ: คะแนนสูง (8-10) = AI พิจารณาเสมอ คะแนนต่ำ (1-4) = ข้อมูลเสริม",
+  "memory.manage.title": "จัดการ Memory",
+  "memory.modes.full.desc": "AI จดจำทุกอย่าง: ค่ากำหนด ข้อเท็จจริงโปรเจกต์ การตัดสินใจ กฎ รวมถึงสรุปบทสนทนาเก่า",
+  "memory.modes.full.name": "Full Memory (ค่าเริ่มต้น)",
+  "memory.modes.nolong.desc": "AI เห็นเฉพาะข้อความล่าสุดและสรุปเก่า ลืมค่ากำหนดและข้อเท็จจริงโปรเจกต์ เหมาะสำหรับมุมมองใหม่",
+  "memory.modes.nolong.name": "No Long Memory",
+  "memory.modes.off.desc": "AI เห็นเฉพาะบทสนทนาปัจจุบัน ไม่มีอะไรจากก่อนหน้า เหมาะสำหรับความเป็นส่วนตัวหรือหัวข้อละเอียดอ่อน",
+  "memory.modes.off.name": "Memory Off",
+  "memory.modes.title": "โหมด Memory",
+  "memory.projects.1": "แท็กบทสนทนาด้วยชื่อโปรเจกต์ในแผง Memory",
+  "memory.projects.2": "Memory ทั้งหมดที่สร้างในโปรเจกต์นั้นจะพร้อมใช้ในทุกแชทที่แท็กโปรเจกต์เดียวกัน",
+  "memory.projects.3": "Memory ทั่วไป (ไม่มีแท็กโปรเจกต์) จะมองเห็นได้ในทุกแชท",
+  "memory.projects.title": "โปรเจกต์และ Memory ข้ามแชท",
+  "memory.summary.1": "เมื่อข้อความเก่าใช้พื้นที่ 70% ของ context window AI จะสร้างสรุปอัตโนมัติ",
+  "memory.summary.2": "สรุปจับประเด็นการตัดสินใจ สิ่งที่ต้องทำ และบริบทสำคัญจากข้อความเก่า",
+  "memory.summary.3": "เมื่อมีสรุป 2 รายการขึ้นไป จะรวมเป็นสรุปรวมหนึ่งเดียวเพื่อประสิทธิภาพ",
+  "memory.summary.4": "ใช้ปุ่ม Compact เพื่อบังคับสรุปทันที ใช้ Clear Old เพื่อลบ memory เก่ากว่า 1/3/6 เดือน",
+  "memory.summary.title": "สรุปและบีบอัดอัตโนมัติ",
+  "memory.tips.1": "เจาะจง: \"ชอบชื่อตัวแปรอ่านง่ายและใส่ JSDoc comments\" ดีกว่า \"ชอบโค้ดดี ๆ\"",
+  "memory.tips.2": "หนึ่งข้อเท็จจริงต่อหนึ่ง memory — อัปเดตหรือลบทีละรายการได้ง่าย",
+  "memory.tips.3": "ใช้ Rules (ความสำคัญ 10) สำหรับข้อจำกัดเข้มงวด เช่น \"ใช้ HTTPS เสมอ\" หรือ \"ห้าม commit secrets\"",
+  "memory.tips.4": "อัปเดตเมื่อสิ่งต่าง ๆ เปลี่ยน — ลบ memory ที่ล้าสมัยและเพิ่มอันใหม่",
+  "memory.tips.title": "เคล็ดลับใช้ Memory ให้ดี",
+  "memory.title": "Memory (ความจำ)",
+  "memory.types.architecture": "Architecture — การออกแบบระบบ โครงสร้างโมดูล รูปแบบ",
+  "memory.types.decision": "Decision — ทางเลือกสำคัญที่ตัดสินใจระหว่างทำงาน",
+  "memory.types.plan": "Plan — แผนงาน เป้าหมาย ขั้นตอนถัดไป",
+  "memory.types.preference": "Preference — วิธีทำงาน: เครื่องมือ สไตล์การเขียนโค้ด การสื่อสาร",
+  "memory.types.project": "Project — ชื่อโปรเจกต์ วัตถุประสงค์ tech stack เป้าหมาย",
+  "memory.types.rule": "Rule — ข้อจำกัดที่ AI ต้องปฏิบัติตามเสมอ ความสำคัญ 10 ไม่ถูกลบอัตโนมัติ",
+  "memory.types.task": "Task — รายการสิ่งที่ต้องทำ",
+  "memory.types.technical": "Technical — Frameworks, databases, APIs ที่ใช้",
+  "memory.types.title": "ประเภท Memory",
+  "memory.types.user": "User — ข้อเท็จจริงเกี่ยวกับคุณ: บทบาท ความเชี่ยวชาญ ชื่อ",
+  "memory.what.1": "ค่ากำหนดและสไตล์ — วิธีทำงานที่ชอบ เครื่องมือที่ใช้",
+  "memory.what.2": "รายละเอียดโปรเจกต์ — tech stack เป้าหมาย ชื่อทีม",
+  "memory.what.3": "การตัดสินใจและแผน — สิ่งที่ตัดสินใจแล้ว เป้าหมาย ขั้นตอนถัดไป",
+  "memory.what.4": "ความรู้ทางเทคนิค — frameworks, databases, APIs, รูปแบบสถาปัตยกรรม",
+  "memory.what.5": "กฎ — ข้อจำกัดที่ AI ต้องปฏิบัติตามเสมอ",
+  "memory.what.title": "Memory เก็บอะไรบ้าง",
+  "orchestrator.intro": "AI Team Orchestrator ให้คุณสร้างทีม AI หลายตัวที่ทำงานร่วมกันแบบเรียลไทม์ แต่ละตัวมีบุคลิก ความเชี่ยวชาญ และบทบาทเฉพาะ — ร่วมกันวิจัย เขียน ตรวจทาน และผลิตผลงาน",
+  "orchestrator.memory.1": "แต่ละ agent มีหน่วยความจำส่วนตัวที่ agent อื่นมองไม่เห็น หน่วยความจำระดับทีมแชร์ให้สมาชิกทุกคน",
+  "orchestrator.memory.2": "ลำดับขอบเขต (จากเฉพาะเจาะจงไปกว้าง): Agent → Run → Room → Team → Project → User",
+  "orchestrator.memory.3": "ค้นหาใช้ระบบ Hybrid: จับคู่คำสำคัญ + ความคล้ายคลึงเชิงเวกเตอร์ เพื่อผลลัพธ์ที่ตรงที่สุด",
+  "orchestrator.memory.4": "Promote ความจำจากระดับ agent ไประดับทีม เพื่อแชร์การค้นพบกับทั้งทีม",
+  "orchestrator.memory.5": "ประเภทความจำ: Fact, Rule, Preference, Decision, Note, Checklist และ Episode",
+  "orchestrator.memory.title": "Scoped Memory — หน่วยความจำแบบแบ่งขอบเขต",
+  "orchestrator.monitoring.1": "Run Monitor แสดง event สด, สถานะ agent (กำลังทำงาน/ว่าง) และตัวนับค่าใช้จ่ายแบบเรียลไทม์",
+  "orchestrator.monitoring.2": "Timeline แสดงการกระทำทุกอย่าง: ข้อความ, การเรียกเครื่องมือ, การส่งต่องาน, การตัดสินใจ และ error",
+  "orchestrator.monitoring.3": "ตรวจจับ agent ค้าง: ถ้า agent ไม่มีผลงาน 2 นาที คุณจะได้รับแจ้งเตือน",
+  "orchestrator.monitoring.4": "การแจ้งเตือนสำหรับ: รันเสร็จ, เตือนงบประมาณ, agent ค้าง และแจ้งเตือนระบบ",
+  "orchestrator.monitoring.title": "การติดตามและแจ้งเตือน",
+  "orchestrator.rooms.1": "Room คือพื้นที่สนทนาของทีม สร้างห้องโดยเลือกทีมแล้วระบุเป้าหมาย",
+  "orchestrator.rooms.2": "ประเภทห้อง: Team (ทำงานร่วมกัน), Direct (คุยกับ agent ตัวเดียว), Auto Team (ระบบจัดการ), Job Review (ตรวจงานแบบมีโครงสร้าง)",
+  "orchestrator.rooms.3": "โหมดมุมมอง 3 แบบ: Transparent (เห็นทุกอย่าง), Milestone (เห็นเฉพาะการตัดสินใจสำคัญ), Summary (เห็นเฉพาะสรุป)",
+  "orchestrator.rooms.4": "คุณสามารถส่งข้อความถึง agent ทุกตัวหรือเจาะจงตัวเดียว สามารถ Mute agent ที่ไม่ต้องการให้พูดชั่วคราว",
+  "orchestrator.rooms.title": "ห้องทีม (Team Rooms)",
+  "orchestrator.runs.1": "Run คือเซสชันทำงานอัตโนมัติ เริ่มรันโดยระบุเป้าหมายและตั้ง Stop Policy",
+  "orchestrator.runs.2": "Stop Policy ควบคุมเมื่อไหร่จะหยุด: จำนวนรอบสูงสุด, เวลาจำกัด, งบประมาณ, หมดเวลาว่าง หรือเมื่อ Lead สรุปเสร็จ",
+  "orchestrator.runs.3": "คุณสามารถ Pause (หยุดชั่วคราว), Resume (ทำต่อ) หรือ Stop (หยุดทันที) ได้ตลอดเวลา",
+  "orchestrator.runs.4": "ระบบติดตามค่าใช้จ่ายต่อ agent แบบเรียลไทม์ ตั้งงบสูงสุดเพื่อป้องกันค่าใช้จ่ายเกิน",
+  "orchestrator.runs.5": "เมื่อรันเสร็จ ระบบสร้างสรุปประสิทธิภาพต่อ agent และรายงานสรุปผล",
+  "orchestrator.runs.title": "Runs — การรันงานอัตโนมัติ",
+  "orchestrator.teams.1": "ไปที่เมนู Teams แล้วกด New Team ตั้งชื่อ คำอธิบาย และเลือกหมวดหมู่",
+  "orchestrator.teams.2": "เพิ่มสมาชิก 2-10 คน แต่ละคนต้องมี Persona (บุคลิก/ความเชี่ยวชาญ) และ Role Title (เช่น หัวหน้านักวิจัย, บรรณาธิการ)",
+  "orchestrator.teams.3": "ต้องมีสมาชิกที่เป็น Lead หนึ่งคนเสมอ — เป็นผู้ประสานงานและสรุปผลการทำงาน",
+  "orchestrator.teams.4": "ใช้ Template เพื่อตั้งค่าเร็ว: ทีมวิจัย & วิเคราะห์, ทีมสร้างเนื้อหา หรือทีม Code Review มี preset พร้อมใช้งาน",
+  "orchestrator.teams.5": "สมาชิกแต่ละคนสามารถเลือกโมเดล AI และนโยบายค่าใช้จ่ายของตัวเองได้",
+  "orchestrator.teams.title": "การสร้างทีม",
+  "orchestrator.tips.1": "เริ่มจาก Template แล้วปรับแต่ง — เร็วกว่าสร้างใหม่ตั้งแต่ต้น",
+  "orchestrator.tips.2": "ให้แต่ละ agent มีความเชี่ยวชาญเฉพาะทาง บทบาทที่ซ้ำกันจะได้ผลลัพธ์ซ้ำซ้อน",
+  "orchestrator.tips.3": "ตั้งงบประมาณที่เหมาะสม (100-500 เครดิต) และจำนวนรอบ (10-30) เพื่อป้องกันค่าใช้จ่ายบานปลาย",
+  "orchestrator.tips.4": "ใช้โหมด Milestone เมื่อสนใจเฉพาะการตัดสินใจสำคัญ ไม่ต้องอ่านทั้งหมด",
+  "orchestrator.tips.5": "ตรวจสอบสรุปของ Lead ก่อนหยุดรัน — สรุปจะรวมข้อสรุปของทีมทั้งหมด",
+  "orchestrator.tips.title": "เคล็ดลับสำหรับทีมที่มีประสิทธิภาพ",
+  "orchestrator.title": "AI Team Orchestrator — ระบบทีม AI",
+  "pause.1": "OTP, MFA หรือการยืนยันอุปกรณ์",
+  "pause.2": "การชำระเงิน การจอง การซื้อ หรือการดำเนินการที่ย้อนกลับไม่ได้",
+  "pause.3": "สิ่งที่ละเอียดอ่อนที่คุณต้องการตรวจสอบก่อนส่ง",
+  "pause.title": "เมื่อไหร่ที่ AI ควรหยุดรอคุณ",
+  "presentation.ex.basic.cmd": "สร้าง presentation เรื่อง Digital Marketing",
+  "presentation.ex.basic.label": "พื้นฐาน",
+  "presentation.ex.basic.result": "5 สไลด์, 16:9 แนวนอน, ตรวจจับภาษาอัตโนมัติ",
+  "presentation.ex.count.cmd": "สร้าง presentation เรื่อง AI in Healthcare จำนวน 10 สไลด์",
+  "presentation.ex.count.label": "กำหนดจำนวนสไลด์",
+  "presentation.ex.count.result": "10 สไลด์, 16:9 แนวนอน",
+  "presentation.ex.full.cmd": "สร้าง presentation เรื่อง พัฒนาการเด็ก 10 slides 9:16 ภาษาไทย",
+  "presentation.ex.full.label": "ครบทุกตัวเลือก",
+  "presentation.ex.full.result": "10 สไลด์, 9:16 แนวตั้ง, ภาษาไทย",
+  "presentation.ex.landscape.cmd": "create presentation about Startup Pitch 8 slides 16:9",
+  "presentation.ex.landscape.label": "แนวนอน (16:9)",
+  "presentation.ex.landscape.result": "8 สไลด์, 16:9 แนวนอน",
+  "presentation.ex.lang.cmd": "สร้าง presentation เรื่อง Cloud Computing ภาษาอังกฤษ 16:9",
+  "presentation.ex.lang.label": "กำหนดภาษา",
+  "presentation.ex.lang.result": "5 สไลด์, 16:9 แนวนอน, ภาษาอังกฤษ",
+  "presentation.ex.portrait.cmd": "สร้าง presentation เรื่อง Social Media Tips 9:16 แนวตั้ง",
+  "presentation.ex.portrait.label": "แนวตั้ง (9:16)",
+  "presentation.ex.portrait.result": "5 สไลด์, 9:16 แนวตั้ง",
+  "presentation.examples.title": "ตัวอย่าง",
+  "presentation.howItWorks.1": "ส่งข้อความที่มีคำสั่งเริ่มต้น + หัวข้อ",
+  "presentation.howItWorks.2": "ระบบดึงหัวข้อ จำนวนสไลด์ อัตราส่วนภาพ และภาษาจากข้อความ",
+  "presentation.howItWorks.3": "สร้างชุดสไลด์ใหม่ทันทีพร้อมลิงก์ไปหน้าแก้ไข",
+  "presentation.howItWorks.4": "AI สร้างเนื้อหา เลย์เอาต์ และรูปภาพเบื้องหลัง",
+  "presentation.howItWorks.5": "เมื่อเสร็จสิ้น แจ้งเตือนปรากฏใน chat พร้อมลิงก์สุดท้าย",
+  "presentation.howItWorks.title": "วิธีการทำงาน",
+  "presentation.intro": "พิมพ์ข้อความที่เริ่มด้วยคำสั่ง เช่น \"สร้าง presentation\", \"create presentation\" หรือ \"make slides\" ตามด้วยหัวข้อ ระบบจะสร้างชุดสไลด์พร้อมเนื้อหาและรูปภาพ AI อัตโนมัติ",
+  "presentation.optional": "ไม่บังคับ",
+  "presentation.params.aspect.desc": "ขนาดแคนวาส ค่าเริ่มต้น: 16:9 แนวนอน",
+  "presentation.params.aspect.examples": "\"16:9\" / \"9:16\" / \"แนวนอน\" / \"แนวตั้ง\" / \"landscape\" / \"portrait\"",
+  "presentation.params.aspect.name": "อัตราส่วนภาพ",
+  "presentation.params.col.desc": "คำอธิบาย",
+  "presentation.params.col.examples": "ตัวอย่าง",
+  "presentation.params.col.param": "พารามิเตอร์",
+  "presentation.params.col.required": "จำเป็น",
+  "presentation.params.language.desc": "กำหนดภาษาของเนื้อหา ค่าเริ่มต้น: ตรวจจับจากหัวข้ออัตโนมัติ",
+  "presentation.params.language.examples": "\"ภาษาไทย\" / \"ภาษาอังกฤษ\" / \"in Thai\" / \"in English\"",
+  "presentation.params.language.name": "ภาษา",
+  "presentation.params.slides.desc": "จำนวนสไลด์ (1–30) ค่าเริ่มต้น: 5",
+  "presentation.params.slides.examples": "\"จำนวน 10 สไลด์\" / \"8 slides\"",
+  "presentation.params.slides.name": "จำนวนสไลด์",
+  "presentation.params.title": "พารามิเตอร์ที่ใช้ได้",
+  "presentation.params.topic.desc": "เรื่องของ presentation ระบุหลังคำสั่งเริ่มต้น",
+  "presentation.params.topic.examples": "\"เรื่อง AI\" / \"about Marketing\"",
+  "presentation.params.topic.name": "หัวข้อ",
+  "presentation.required": "จำเป็น",
+  "presentation.title": "สร้าง Presentation จาก Chat",
+  "presentation.triggers.list": "สร้าง presentation,ทำ presentation,create presentation,make slides,generate slides,build a deck",
+  "presentation.triggers.title": "คำสั่งเริ่มต้น",
+  "prompts.1": "หาเว็บไซต์โรงแรมบูติกในโตเกียว วันที่ 10-13 เม.ย. 2569 งบต่อคืนไม่เกิน 5,000 บาท เลือก 3 อันดับแรกพร้อมข้อดีข้อเสีย",
+  "prompts.2": "วิจัยเครื่องมือ CRM สำหรับทีมขาย 10 คน เปรียบเทียบราคาและฟีเจอร์ออโตเมชัน แนะนำตัวเลือกที่ดีที่สุดสำหรับสตาร์ทอัพงบน้อย",
+  "prompts.3": "หาโน้ตบุ๊กสำหรับตัดต่อวิดีโอราคาไม่เกิน 40,000 บาท หลีกเลี่ยงเครื่อง refurbished อธิบายว่ารุ่นไหนคุ้มค่าที่สุด",
+  "prompts.4": "เปิดหน้าล็อกอินของ Service X ไปที่หน้าตั้งค่าบัญชี หยุดเมื่อต้องใส่ OTP หรือ MFA",
+  "prompts.5": "หาสถานที่จัดงาน 3 แห่งในกรุงเทพสำหรับเวิร์กช็อป 100 คน เปรียบเทียบราคาแพ็กเกจ บันทึกข้อมูลที่จอดรถและอุปกรณ์ AV",
+  "prompts.6": "ค้นหาแหล่งข้อมูลสาธารณะที่ดีที่สุดเกี่ยวกับกฎระเบียบใหม่ สรุปผลกระทบในทางปฏิบัติ พร้อมลิงก์ไปยังหน้าทางการ",
+  "prompts.title": "ตัวอย่างคำสั่ง",
+  "quickStart.1": "คลิก Start Browser Session จาก Chat",
+  "quickStart.2": "อธิบายผลลัพธ์ที่ต้องการเป็นภาษาธรรมดา",
+  "quickStart.3": "ปล่อยให้ระบบค้นหาเว็บไซต์ที่เกี่ยวข้องและเริ่มเปิดดู",
+  "quickStart.4": "เปิด live session หากต้องการดูหรือบังคับเบราว์เซอร์แบบเรียลไทม์",
+  "quickStart.5": "ส่งคำสั่งเพิ่มเติมแทนการเริ่มใหม่ตั้งแต่ต้น",
+  "quickStart.title": "เริ่มต้นอย่างรวดเร็ว",
+  "request.1": "เป้าหมาย: ระบุผลลัพธ์ที่ต้องการ ไม่ต้องบอกทุกคลิก",
+  "request.2": "เงื่อนไข: งบประมาณ ภูมิภาค วันที่ แบรนด์ ฟิลเตอร์ที่ต้องมี หรือสิ่งที่ต้องหลีกเลี่ยง",
+  "request.3": "ผลลัพธ์: ขอรายการสั้น ตารางเปรียบเทียบ สรุป หรือลิงก์หลักฐาน",
+  "request.title": "วิธีเขียนคำขอที่ดี",
+  "running.1": "เปิด live Browser Session เพื่อดูเบราว์เซอร์แบบเรียลไทม์",
+  "running.2": "ใช้ Send Browser Instruction เพื่อปรับแต่งงานขณะ session ทำงานอยู่",
+  "running.3": "เปลี่ยน skill หากงานเปลี่ยนจากวิจัยเป็นเปรียบเทียบ จอง หรือเข้าถึงบัญชี",
+  "running.4": "หากระบบหยุดรอการอนุมัติ MFA หรือการชำระเงิน ให้เข้าควบคุมชั่วคราวแล้วคืนการควบคุม",
+  "running.title": "ขณะ session กำลังทำงาน",
+  "skillDetection.1": "ระบบตรวจจับ skill ที่เหมาะสมจากคีย์เวิร์ดในข้อความโดยอัตโนมัติ",
+  "skillDetection.2": "ไม่ต้องเลือก skill เอง — แค่อธิบายสิ่งที่ต้องการ ระบบจะจับคู่ให้",
+  "skillDetection.3": "หากระบบเลือกผิด ใช้เมนู / เพื่อเลือก skill ที่ต้องการด้วยตนเอง",
+  "skillDetection.4": "Skill ที่มีคะแนนลำดับความสำคัญสูงจะถูกตรวจสอบก่อน คีย์เวิร์ดเฉพาะทางช่วยเพิ่มความแม่นยำ",
+  "skillDetection.howItWorks.1": "เมื่อส่งข้อความ ระบบสแกนหาคีย์เวิร์ดที่รู้จัก",
+  "skillDetection.howItWorks.2": "แต่ละ skill ที่เปิดใช้งานมีแท็กและรูปแบบที่ใช้ให้คะแนนเทียบกับข้อความ",
+  "skillDetection.howItWorks.3": "Skill ที่มีคะแนนความมั่นใจสูงสุดจะถูกเลือกอัตโนมัติ",
+  "skillDetection.howItWorks.4": "หากไม่มี skill ใดเกินเกณฑ์ ข้อความจะส่งไปยัง LLM ทั่วไป",
+  "skillDetection.howItWorks.5": "สามารถเปลี่ยนเองได้โดยเลือก skill จากเมนู / ก่อนส่ง",
+  "skillDetection.howItWorks.title": "ระบบตรวจจับอัตโนมัติทำงานอย่างไร",
+  "skillDetection.tip1.example": "\"Write a product review for Nike Air Max\" จะเรียก skill product-reviewer",
+  "skillDetection.tip1.title": "ระบุประเภทผลลัพธ์ให้ชัดเจน",
+  "skillDetection.tip1.why": "คำนามที่เฉพาะเจาะจงช่วยให้ระบบจับคู่ skill ที่ถูกต้อง",
+  "skillDetection.tip2.example": "\"Create an image prompt for a sunset landscape\" จะเรียก skill image-prompt-engineer",
+  "skillDetection.tip2.title": "ระบุหมวดหมู่หรือโดเมน",
+  "skillDetection.tip2.why": "คีย์เวิร์ดโดเมน (image, video, article, review) เป็นสัญญาณที่แข็งแกร่ง",
+  "skillDetection.tip3.example": "\"สร้าง presentation เรื่อง AI\" จะเริ่มสร้าง presentation อัตโนมัติ",
+  "skillDetection.tip3.title": "ใช้ภาษาของ skill อย่างเป็นธรรมชาติ",
+  "skillDetection.tip3.why": "รองรับคำสั่งทั้งภาษาไทยและภาษาอังกฤษ",
+  "skillDetection.tip4.example": "\"Generate a video of a talking cat using viral style\" จะเรียก skill viral-talking-objects",
+  "skillDetection.tip4.title": "ผสมคีย์เวิร์ดสร้างสื่อและสไตล์",
+  "skillDetection.tip4.why": "คีย์เวิร์ดประเภทสื่อ + สไตล์ช่วยนำทางการเลือก skill",
+  "skillDetection.tips.title": "เคล็ดลับให้จับคู่ skill ได้แม่นยำ",
+  "skillDetection.title": "ระบบเลือก Skill อัตโนมัติ",
+  "skills.1": "พิมพ์ / ในช่องข้อความเพื่อเปิดเมนู Slash-command skill",
+  "skills.2": "เปิดแผง Skills เพื่อควบคุมว่า skill ใดเปิดใช้งานในบทสนทนาปัจจุบัน",
+  "skills.3": "ใช้ skills เมื่อต้องการให้ผู้ช่วยทำตามขั้นตอนเฉพาะทาง แทนคำตอบทั่วไป",
+  "skills.4": "หากงานซ้ำ ๆ หรือเฉพาะด้าน ให้เลือก skill แทนการพิมพ์คำสั่งเดิมซ้ำ",
+  "skills.title": "Skills และคำสั่ง Slash",
+  "title": "คู่มือ Browser Session",
+  "useCases.1": "วางแผนท่องเที่ยว: หาเที่ยวบิน เปรียบเทียบโรงแรม คัดเลือกแผนการเดินทาง",
+  "useCases.10": "วิจัยการศึกษา: หาคอร์ส เปรียบเทียบหลักสูตร คัดเลือกตามตารางและค่าใช้จ่าย",
+  "useCases.11": "วิจัยทุนหรือประกวดราคา: ค้นหาแหล่งทางการ เปรียบเทียบข้อกำหนด สรุปกำหนดส่ง",
+  "useCases.12": "ช่วยบริการลูกค้า: ค้นหาเอกสารสินค้าหรือศูนย์ช่วยเหลือและนำคำตอบที่ตรงประเด็นกลับมา",
+  "useCases.13": "งานบัญชี: เปิดบริการ ไปหน้าตั้งค่าที่ถูกต้อง หยุดก่อนดำเนินการที่ละเอียดอ่อน",
+  "useCases.14": "ผู้ช่วยจอง: เตรียมขั้นตอนชำระเงินหรือจอง หยุดเมื่อต้องยืนยัน",
+  "useCases.15": "ค้นหาเนื้อหา: หาแหล่งข้อมูลหลัก กรณีศึกษา หรือตัวอย่างสำหรับรายงาน",
+  "useCases.16": "ติดตามราคา: กลับไปหน้าสินค้า จับสัญญาณราคาปัจจุบัน สรุปการเปลี่ยนแปลง",
+  "useCases.17": "ค้นหาพาร์ทเนอร์ B2B: หาพาร์ทเนอร์ที่มีศักยภาพในภูมิภาคและจัดอันดับตามความเหมาะสม",
+  "useCases.18": "ค้นหานโยบายหรือกฎระเบียบ: หาหน้าทางการและสรุปส่วนที่เกี่ยวข้องกับเป้าหมาย",
+  "useCases.2": "วิจัยสินค้า: เปรียบเทียบโน้ตบุ๊ก มือถือ กล้อง หรืออุปกรณ์สำนักงานข้ามหลายเว็บ",
+  "useCases.3": "ค้นหาผู้ให้บริการ: หาเครื่องมือ SaaS เอเจนซี่ หรือซัพพลายเออร์พร้อมสรุปราคาและความสามารถ",
+  "useCases.4": "สำรวจอสังหาริมทรัพย์: ค้นหาประกาศ เปรียบเทียบย่าน เลือกตัวเลือกที่ดีที่สุด",
+  "useCases.5": "สนับสนุนการสรรหา: รวบรวมหน้าผู้สมัคร ลิงก์ผลงาน และหลักฐานสำหรับคัดเลือก",
+  "useCases.6": "สร้างลีด: ค้นพบเว็บไซต์บริษัทที่เกี่ยวข้องและรวบรวมข้อมูลสำหรับการติดต่อ",
+  "useCases.7": "วิจัยตลาด: ระบุคู่แข่ง รูปแบบราคา การวางตำแหน่งฟีเจอร์ และข้อความสาธารณะ",
+  "useCases.8": "จัดซื้อ: หาผู้จัดจำหน่ายหรือค้าส่งและเปรียบเทียบขั้นต่ำ การจัดส่ง และตัวเลือกชำระเงิน",
+  "useCases.9": "วางแผนอีเวนต์: ค้นหาสถานที่ เปรียบเทียบแพ็กเกจ สรุปข้อกำหนดการจอง",
+  "useCases.title": "กรณีการใช้งานหลากหลาย",
+  "what.body": "คุณอธิบายผลลัพธ์ที่ต้องการ ระบบจะเลือก skill ที่เหมาะสม ค้นหาเว็บไซต์ที่เกี่ยวข้อง เปิด browser session จริง และทำงานต่อเนื่องขณะที่คุณดูแลหรือเข้ามาช่วยเฉพาะเมื่อจำเป็น",
+  "what.title": "Browser Session ทำอะไรได้"
+}
diff --git a/apps/web/client/src/locales/th/marketplace.json b/apps/web/client/src/locales/th/marketplace.json
new file mode 100644
index 00000000..0967ef42
--- /dev/null
+++ b/apps/web/client/src/locales/th/marketplace.json
@@ -0,0 +1 @@
+{}
diff --git a/apps/web/client/src/locales/th/media.json b/apps/web/client/src/locales/th/media.json
new file mode 100644
index 00000000..421bcba1
--- /dev/null
+++ b/apps/web/client/src/locales/th/media.json
@@ -0,0 +1,124 @@
+{
+  "active": "ใช้งานอยู่",
+  "addedToLibrary": "เพิ่มเข้าคลังแล้ว",
+  "addingToLibrary": "กำลังเพิ่มเข้าคลัง...",
+  "addToLibrary": "เพิ่มเข้าคลัง",
+  "addToVideoReference": "เพิ่มเป็นข้อมูลอ้างอิงวิดีโอ",
+  "advancedMode": "โหมดขั้นสูง",
+  "advancedModeHint": "สร้างพรอมต์ที่ปรับปรุงแล้วด้วยการตั้งค่า Advanced Mode",
+  "arrayPlaceholder": "ป้อน JSON array หรือหนึ่งรายการต่อบรรทัดสำหรับ {{field}}",
+  "aspectRatio": "อัตราส่วนภาพ",
+  "aspectRatioLabel": "อัตราส่วนภาพ",
+  "autoModelHint": "โหมดอัตโนมัติจะเลือกโมเดลที่เหมาะสมที่สุดตามความต้องการของสกิล หรือคุณสามารถเลือกโมเดลเองได้",
+  "autoPrompt": "Auto Prompt",
+  "autoPromptHint": "ปรับพรอมต์ด้วย AI (PromptDepth Pro v8.9)",
+  "autoPromptModel": "โมเดล Auto Prompt",
+  "autoPromptSkill": "สกิล Auto Prompt",
+  "autoSkillRequirements": "✨ อัตโนมัติ (ตามความต้องการของสกิล)",
+  "buyMore": "ซื้อเพิ่ม",
+  "changeSkill": "เปลี่ยนสกิล",
+  "chooseSkillForTab": "เลือกสกิลสร้างพรอมต์สำหรับแท็บ {{tab}}",
+  "chooseStyle": "เลือกสไตล์",
+  "chooseVfx": "เลือกเอฟเฟกต์ VFX",
+  "clear": "ล้าง",
+  "clearHint": "ล้างพรอมต์",
+  "clearOptions": "ล้างตัวเลือก",
+  "clickCropFirst": "กด Crop ก่อน จากนั้น Download จะใช้งานได้",
+  "clickToPreview": "คลิกเพื่อดูตัวอย่าง",
+  "configureSkillParameters": "กำหนดพารามิเตอร์สกิลเพื่อควบคุมอย่างละเอียด",
+  "count": "จำนวน",
+  "creatingYour": "กำลังสร้าง {{tab}}...",
+  "cropByRatio": "ครอปตามอัตราส่วน",
+  "cropping": "กำลังครอป...",
+  "cropRatio": "ครอปตามอัตราส่วน",
+  "cropWithRatio": "ครอป ({{ratio}})",
+  "customValuePlaceholder": "หรือป้อน {{field}} แบบกำหนดเอง",
+  "description": "สร้างสื่อด้วย AI",
+  "detectingGrid": "กำลังตรวจจับกริด...",
+  "download": "ดาวน์โหลด",
+  "downloadAll": "ดาวน์โหลดทั้งหมด",
+  "downloadCropped": "ดาวน์โหลดภาพที่ครอปแล้ว",
+  "dragHistoryHint": "ลากจาก History Gallery ด้านล่างหรืออัปโหลดรูปเพื่อ style transfer / img2img",
+  "dragToUseAsReference": "ลากเพื่อใช้เป็นรูปอ้างอิง",
+  "dropReferenceHint": "วางรูปที่นี่หรือคลิก Add Image",
+  "duration": "ระยะเวลา",
+  "error": "ข้อผิดพลาด",
+  "faceLock": "ล็อกใบหน้า",
+  "failed": "ล้มเหลว",
+  "generatedMedia": "สื่อที่สร้างแล้ว",
+  "generateTab": "สร้าง {{tab}}",
+  "generating": "กำลังสร้าง...",
+  "generatingTask": "กำลังสร้าง #{{index}}",
+  "gridSize": "ขนาดกริด",
+  "history": "ประวัติ",
+  "historyGallery": "History Gallery",
+  "loadingOptions": "กำลังโหลดตัวเลือก...",
+  "mic": "ไมค์",
+  "modelLabel": "โมเดล",
+  "multiShot": "Multi Shot (วิดีโอเดียว หลายซีน)",
+  "multiVideo": "Multi Video (แยกวิดีโอต่อซีน)",
+  "multiVideoModeGenerating": "โหมด Multi Video: กำลังสร้างวิดีโอแยก {{count}} รายการ",
+  "noContent": "ยังไม่มีคอนเทนต์ที่สร้าง",
+  "noHistoryAudio": "ยังไม่มีประวัติ ลองสร้างเสียงดูสักรายการ!",
+  "noHistoryImage": "ยังไม่มีประวัติ ลองสร้างรูปภาพดูสักรายการ!",
+  "noHistoryVideo": "ยังไม่มีประวัติ ลองสร้างวิดีโอดูสักรายการ!",
+  "noImageSelected": "ยังไม่ได้เลือกรูป",
+  "noImagesSelected": "ยังไม่ได้เลือกรูป",
+  "noModelsFound": "ไม่พบโมเดล",
+  "noMultiplePrompts": "ไม่พบพรอมต์หลายรายการ กำลังสร้างวิดีโอเดียว",
+  "noOptionsFound": "ไม่พบตัวเลือก",
+  "noPreviewAvailable": "ไม่มีตัวอย่างให้เล่น",
+  "noPromptSkills": "ไม่พบสกิลสร้างพรอมต์สำหรับ {{tab}}",
+  "noPromptYet": "ยังไม่มีพรอมต์",
+  "noSkillSelected": "ยังไม่ได้เลือกสกิล",
+  "notEnoughCredits": "เครดิตไม่พอ",
+  "off": "ปิด",
+  "on": "เปิด",
+  "optionListUnavailable": "ยังไม่มีรายการตัวเลือก คุณยังสามารถป้อนค่าเองได้",
+  "outputType": "ประเภทผลลัพธ์",
+  "pending": "รอดำเนินการ",
+  "playVoicePreview": "เล่นตัวอย่างเสียง",
+  "previewCollapsed": "ย่อพรีวิวไว้ ขยายเพื่อดูสื่อล่าสุด",
+  "processing": "กำลังประมวลผล...",
+  "prompt.description": "เริ่มจากพรอมต์พื้นฐาน แล้วปรับด้วยเสียง การแปล หรือ auto-prompt",
+  "prompt.eyebrow": "พรอมต์",
+  "prompt.title": "พรอมต์สำหรับสร้าง",
+  "promptLabel": "พรอมต์",
+  "queued": "อยู่ในคิว",
+  "realisticSkin": "ผิวสมจริง",
+  "recommendedGridSizes": "ขนาดกริดที่แนะนำตามอัตราส่วนภาพ",
+  "recordHint": "กดค้างเพื่อบันทึกเสียง (Speech-to-Text)",
+  "recording": "กำลังบันทึก...",
+  "referenceImagesLabel": "รูปอ้างอิง",
+  "refreshOptions": "รีเฟรชรายการตัวเลือก",
+  "resultsCount": "ผลลัพธ์ ({{count}} รูป)",
+  "retryAddToLibrary": "ลองเพิ่มเข้าคลังอีกครั้ง",
+  "savedToDownloads": "บันทึกไว้ในโฟลเดอร์ Downloads เริ่มต้นของเบราว์เซอร์แล้ว",
+  "searchField": "ค้นหา {{field}}...",
+  "searchLibrary": "Search Library",
+  "searchModels": "ค้นหาโมเดล...",
+  "searchSkills": "ค้นหาสกิล...",
+  "selectAutoPromptSkill": "เลือกสกิล Auto Prompt",
+  "selected": "เลือกแล้ว",
+  "selectModel": "เลือกโมเดล",
+  "selectOption": "เลือกตัวเลือก",
+  "selectStyle": "เลือกสไตล์",
+  "selectVfx": "เลือก VFX",
+  "settingsHint": "เลือกตัวเลือกทั้งหมดด้านล่างก่อนคลิก Auto Prompt เพื่อสร้างพรอมต์ที่ปรับปรุงแล้ว",
+  "settingsTitle": "การตั้งค่า",
+  "skillParameters": "พารามิเตอร์สกิล",
+  "skillsAlignedWithTab": "แสดงเฉพาะสกิลสร้างพรอมต์เพื่อให้แท็บ {{tab}} สอดคล้องกับประเภทผลลัพธ์",
+  "skillUsedForAudio": "สกิลนี้ใช้เพื่อปรับพรอมต์ text-to-speech หรือ sound effect ก่อนสร้าง",
+  "splitGrid": "แยกกริด",
+  "style": "สไตล์",
+  "synced": "ซิงก์แล้ว",
+  "tabs.audio": "เสียง",
+  "tabs.image": "รูปภาพ",
+  "tabs.video": "วิดีโอ",
+  "title": "สตูดิโอสื่อ",
+  "translate": "แปล",
+  "translateHint": "แปลพรอมต์ (EN ↔ ภาษาของคุณ)",
+  "upscaleAutoFilled": "เติมพรอมต์อัตโนมัติสำหรับ Upscale แล้ว",
+  "upscaleAutoFilledDesc": "ปรับพรอมต์เพื่อเพิ่มคุณภาพภาพ",
+  "vfxEffect": "เอฟเฟกต์ VFX"
+}
diff --git a/apps/web/client/src/locales/th/nav.json b/apps/web/client/src/locales/th/nav.json
new file mode 100644
index 00000000..f260b78b
--- /dev/null
+++ b/apps/web/client/src/locales/th/nav.json
@@ -0,0 +1,21 @@
+{
+  "header.notifications": "การแจ้งเตือน",
+  "header.profile": "โปรไฟล์",
+  "header.search": "ค้นหา",
+  "header.signOut": "ออกจากระบบ",
+  "navbar.features": "ฟีเจอร์",
+  "navbar.getStarted": "เริ่มต้นใช้งาน",
+  "navbar.home": "หน้าหลัก",
+  "navbar.pricing": "ราคา",
+  "navbar.signIn": "เข้าสู่ระบบ",
+  "sidebar.agencies": "เอเจนซี",
+  "sidebar.chat": "แชท",
+  "sidebar.credits": "เครดิต",
+  "sidebar.dashboard": "แดชบอร์ด",
+  "sidebar.library": "ไลบรารี",
+  "sidebar.mediaStudio": "มีเดียสตูดิโอ",
+  "sidebar.presentations": "งานนำเสนอ",
+  "sidebar.settings": "การตั้งค่า",
+  "sidebar.teams": "ทีม",
+  "sidebar.workflows": "เวิร์กโฟลว์"
+}
diff --git a/apps/web/client/src/locales/th/presentation.json b/apps/web/client/src/locales/th/presentation.json
new file mode 100644
index 00000000..c0428e4e
--- /dev/null
+++ b/apps/web/client/src/locales/th/presentation.json
@@ -0,0 +1,63 @@
+{
+  "ariaLabel": "ตัวแก้ไขเอกสาร",
+  "conflict.description": "เอกสารนี้ถูกแก้ไขจากที่อื่น (แท็บอื่นหรือผู้ใช้อื่น) เลือกวิธีดำเนินการ:",
+  "conflict.overwrite": "บันทึกทับ",
+  "conflict.overwriteHint": "บันทึกเวอร์ชันของคุณ ละทิ้งการเปลี่ยนแปลงอื่น",
+  "conflict.reload": "โหลดใหม่",
+  "conflict.reloadHint": "โหลดเวอร์ชันล่าสุด ละทิ้งการเปลี่ยนแปลงที่ยังไม่ได้บันทึก",
+  "conflict.title": "เอกสารขัดแย้ง",
+  "errorBoundary.switchToSource": "เปลี่ยนเป็นโหมดซอร์ส",
+  "errorBoundary.title": "เอดิเตอร์พบข้อผิดพลาด",
+  "media.editAlt": "แก้ไขข้อความ alt",
+  "media.editCaption": "แก้ไขคำบรรยาย",
+  "media.remove": "ลบ",
+  "media.replace": "แทนที่",
+  "media.unsafeUrl": "URL ไม่ปลอดภัย",
+  "mode.edit": "แก้ไข",
+  "mode.source": "ซอร์สโค้ด",
+  "mode.view": "ดู",
+  "placeholder": "เริ่มเขียนเนื้อหา...",
+  "save.conflict": "พบข้อขัดแย้ง",
+  "save.error": "บันทึกไม่สำเร็จ",
+  "save.saved": "บันทึกแล้ว",
+  "save.saving": "กำลังบันทึก...",
+  "save.unsaved": "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก",
+  "serializationWarning": "เนื้อหาบางส่วนอาจไม่ถูกรักษาในรูปแบบนี้ ใช้โหมดซอร์สเพื่อควบคุมเต็มที่",
+  "slash.audio": "เสียง",
+  "slash.bulletList": "รายการ",
+  "slash.codeBlock": "โค้ด",
+  "slash.divider": "เส้นคั่น",
+  "slash.heading1": "หัวข้อ 1",
+  "slash.heading2": "หัวข้อ 2",
+  "slash.heading3": "หัวข้อ 3",
+  "slash.heading4": "หัวข้อ 4",
+  "slash.image": "รูปภาพ",
+  "slash.noResults": "ไม่พบรายการ",
+  "slash.orderedList": "รายการลำดับ",
+  "slash.quote": "อ้างอิง",
+  "slash.table": "ตาราง",
+  "slash.video": "วิดีโอ",
+  "toolbar.blockquote": "อ้างอิง",
+  "toolbar.bold": "ตัวหนา",
+  "toolbar.bulletList": "รายการหัวข้อย่อย",
+  "toolbar.code": "โค้ด",
+  "toolbar.codeBlock": "บล็อกโค้ด",
+  "toolbar.divider": "เส้นแบ่ง",
+  "toolbar.heading1": "หัวข้อ 1",
+  "toolbar.heading2": "หัวข้อ 2",
+  "toolbar.heading3": "หัวข้อ 3",
+  "toolbar.heading4": "หัวข้อ 4",
+  "toolbar.horizontalRule": "เส้นแบ่ง",
+  "toolbar.insertAudio": "แทรกเสียง",
+  "toolbar.insertImage": "แทรกรูปภาพ",
+  "toolbar.insertVideo": "แทรกวิดีโอ",
+  "toolbar.italic": "ตัวเอียง",
+  "toolbar.link": "ลิงก์",
+  "toolbar.orderedList": "รายการลำดับเลข",
+  "toolbar.redo": "ทำซ้ำ",
+  "toolbar.save": "บันทึก",
+  "toolbar.strikethrough": "ขีดฆ่า",
+  "toolbar.table": "ตาราง",
+  "toolbar.underline": "ขีดเส้นใต้",
+  "toolbar.undo": "เลิกทำ"
+}
diff --git a/apps/web/client/src/locales/th/profile.json b/apps/web/client/src/locales/th/profile.json
new file mode 100644
index 00000000..0967ef42
--- /dev/null
+++ b/apps/web/client/src/locales/th/profile.json
@@ -0,0 +1 @@
+{}
diff --git a/apps/web/client/src/locales/th/settings.json b/apps/web/client/src/locales/th/settings.json
new file mode 100644
index 00000000..2c93fe67
--- /dev/null
+++ b/apps/web/client/src/locales/th/settings.json
@@ -0,0 +1,189 @@
+{
+  "2fa.cancel": "ยกเลิก",
+  "2fa.codePlaceholder": "000000",
+  "2fa.codesRemaining": "เหลือ recovery codes {{count}} รายการ",
+  "2fa.copyAll": "คัดลอกทั้งหมด",
+  "2fa.disable": "ปิดใช้งาน",
+  "2fa.disabled": "2FA ถูกปิดอยู่",
+  "2fa.disabledByAdmin": "ผู้ดูแลระบบได้ปิดการใช้งาน two-factor authentication",
+  "2fa.disableDescription": "ป้อนรหัส TOTP ปัจจุบันหรือ recovery code เพื่อปิด 2FA",
+  "2fa.disablePlaceholder": "รหัส TOTP หรือ recovery code",
+  "2fa.disableTitle": "ปิดการยืนยันตัวตนแบบสองชั้น",
+  "2fa.enable": "เปิดใช้ 2FA",
+  "2fa.enabled": "2FA ถูกเปิดใช้งานแล้ว",
+  "2fa.enforcedNotice": "ผู้ดูแลระบบของคุณกำหนดให้ต้องใช้ two-factor authentication กรุณาเปิดใช้งาน 2FA เพื่อใช้งานแพลตฟอร์มต่อ",
+  "2fa.error.disableFailed": "ปิดใช้งาน 2FA ไม่สำเร็จ",
+  "2fa.error.enterCode": "ป้อนรหัส 6 หลัก",
+  "2fa.error.enterCurrentCode": "ป้อนรหัส TOTP ปัจจุบัน",
+  "2fa.error.enterDisableCode": "ป้อนรหัส TOTP หรือ recovery code",
+  "2fa.error.regenFailed": "สร้างรหัสใหม่ไม่สำเร็จ",
+  "2fa.error.startSetup": "เริ่มตั้งค่า 2FA ไม่สำเร็จ",
+  "2fa.error.verificationFailed": "การยืนยันล้มเหลว",
+  "2fa.generateNewCodes": "สร้างรหัสใหม่",
+  "2fa.lowCodes": "คุณเหลือ recovery codes เพียง {{count}} รายการ พิจารณาสร้างใหม่",
+  "2fa.newCodes": "รหัสใหม่",
+  "2fa.notAvailable": "ยังไม่สามารถใช้ 2FA ได้",
+  "2fa.protectAccount": "ปกป้องบัญชีของคุณด้วยแอป authenticator",
+  "2fa.recoveryCodesHint": "เก็บรหัสเหล่านี้ไว้ในที่ปลอดภัย แต่ละรหัสใช้ได้เพียงครั้งเดียวสำหรับเข้าสู่ระบบหากคุณไม่สามารถเข้าถึงแอป authenticator ได้",
+  "2fa.regenDescription": "ป้อนรหัส TOTP ปัจจุบันเพื่อสร้าง recovery codes ใหม่ รหัสเดิมจะถูกยกเลิก",
+  "2fa.regenTitle": "สร้าง Recovery Codes ใหม่",
+  "2fa.savedCodes": "ฉันบันทึกรหัสไว้แล้ว",
+  "2fa.saveRecoveryCodes": "บันทึก recovery codes ของคุณ",
+  "2fa.setup.enterCode": "2. ป้อนรหัส 6 หลักจากแอปของคุณ",
+  "2fa.setup.manualSecret": "หรือกรอก secret นี้ด้วยตนเอง:",
+  "2fa.setup.scanQr": "1. สแกน QR code นี้ด้วยแอป authenticator",
+  "2fa.success.disabled": "ปิดใช้งาน 2FA แล้ว",
+  "2fa.success.enabled": "เปิดใช้ 2FA สำเร็จ!",
+  "2fa.success.newCodes": "สร้าง recovery codes ใหม่แล้ว",
+  "2fa.title": "การยืนยันตัวตนแบบสองชั้น",
+  "2fa.verifyEnable": "ยืนยันและเปิดใช้งาน",
+  "account.currentPlan": "แพ็กเกจปัจจุบัน",
+  "account.deleteAccount": "ลบบัญชี",
+  "account.deleting": "กำลังลบ...",
+  "account.description": "จัดการค่ากำหนดของบัญชี",
+  "account.emailVerified": "ยืนยันอีเมลแล้ว",
+  "account.eyebrow": "บัญชี",
+  "account.language": "ภาษา",
+  "account.languageValue": "English (US)",
+  "account.title": "การตั้งค่าบัญชี",
+  "account.upgrade": "อัปเกรด",
+  "automation.adminOnly": "สำหรับผู้ดูแลเท่านั้น",
+  "automation.description": "จัดการข้อจำกัดอัตโนมัติของคุณเองเท่านั้น นโยบายเบราว์เซอร์ระดับ tenant จะถูกกำหนดแยกโดยผู้ดูแล",
+  "automation.eyebrow": "อัตโนมัติ",
+  "automation.openAdminSettings": "เปิด Admin Settings",
+  "automation.tenantPolicyDescription": "หน้านี้สำหรับค่ากำหนดส่วนตัวของผู้ใช้เท่านั้น นโยบายอัตโนมัติระดับ tenant อยู่ใน Admin Settings แล้วเพื่อไม่ให้สับสนระหว่าง scope",
+  "automation.tenantPolicyTitle": "นโยบายระดับ tenant จัดการแยกต่างหาก",
+  "automation.title": "นโยบายอัตโนมัติ",
+  "billing.addPaymentMethod": "เพิ่มวิธีชำระเงิน",
+  "billing.description": "จัดการวิธีชำระเงินและรายละเอียดการเรียกเก็บเงิน",
+  "billing.expires": "หมดอายุ 12/25",
+  "billing.eyebrow": "การเรียกเก็บเงิน",
+  "billing.invoice": "ใบแจ้งหนี้ #{{number}}",
+  "billing.invoiceDate": "January {{day}}, 2026",
+  "billing.primaryPaymentMethod": "วิธีชำระเงินหลัก",
+  "billing.recentInvoices": "ใบแจ้งหนี้ล่าสุด",
+  "billing.title": "ข้อมูลการเรียกเก็บเงิน",
+  "context7.configured": "ตั้งค่าแล้ว",
+  "context7.description": "API key ส่วนตัวของ Context7 สำหรับดึงเอกสารไลบรารีล่าสุดในแชท",
+  "context7.enterPlaceholder": "ป้อน Context7 API key ของคุณ",
+  "context7.getFreeKeyAt": "รับคีย์ฟรีได้ที่",
+  "context7.removed": "ลบ Context7 API key แล้ว",
+  "context7.saved": "บันทึก Context7 API key แล้ว",
+  "context7.title": "Context7 API Key",
+  "context7.updatePlaceholder": "ป้อนคีย์ใหม่เพื่ออัปเดต...",
+  "description": "จัดการการตั้งค่าบัญชีของคุณ",
+  "integrations.description": "เชื่อมต่อบริการภายนอกเพื่อเพิ่มประสิทธิภาพการทำงาน",
+  "integrations.eyebrow": "การเชื่อมต่อ",
+  "integrations.title": "Integrations",
+  "preferences.appearance": "ลักษณะการแสดงผล",
+  "preferences.connected": "เชื่อมต่อแล้ว",
+  "preferences.connectedAs": "เชื่อมต่อในชื่อ: @{{username}}",
+  "preferences.description": "ปรับแต่งประสบการณ์ของคุณ",
+  "preferences.emailNotifications": "การแจ้งเตือนทางอีเมล",
+  "preferences.emailNotificationsDesc": "รับอัปเดตผ่านอีเมล",
+  "preferences.eyebrow": "ประสบการณ์",
+  "preferences.generating": "กำลังสร้าง...",
+  "preferences.linkedAt": "เชื่อมต่อเมื่อ: {{date}}",
+  "preferences.linkTelegram": "เชื่อมบัญชี Telegram",
+  "preferences.notificationLevel": "ระดับการแจ้งเตือน",
+  "preferences.notifications": "การแจ้งเตือน",
+  "preferences.notify.all": "ทุกการแจ้งเตือน",
+  "preferences.notify.criticalOnly": "เฉพาะ Critical",
+  "preferences.notify.highCritical": "เฉพาะ High + Critical",
+  "preferences.notify.off": "ปิด",
+  "preferences.pushNotifications": "การแจ้งเตือนแบบพุช",
+  "preferences.pushNotificationsDesc": "รับการแจ้งเตือนแบบพุช",
+  "preferences.telegramIntro": "เชื่อมบัญชี Telegram เพื่อรับการแจ้งเตือนสำคัญแบบทันที",
+  "preferences.telegramLinked": "เชื่อมบัญชี Telegram แล้ว",
+  "preferences.telegramLinkExpiry": "ลิงก์นี้หมดอายุใน 5 นาที และระบบจะตรวจทุก 3 วินาที...",
+  "preferences.telegramNotifications": "การแจ้งเตือน Telegram",
+  "preferences.telegramVerifyHint": "คลิกลิงก์ด้านล่างเพื่อยืนยันบัญชีใน Telegram:",
+  "preferences.title": "ค่ากำหนด",
+  "preferences.unlinkConfirm": "คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการเชื่อมบัญชี Telegram?",
+  "preferences.unlinking": "กำลังยกเลิกการเชื่อมต่อ...",
+  "preferences.unlinkTelegram": "ยกเลิกการเชื่อมบัญชี",
+  "preferences.waitingVerification": "กำลังรอยืนยัน...",
+  "privateVault.browserUnlocked": "เบราว์เซอร์นี้ปลดล็อกไฟล์ส่วนตัวแล้ว",
+  "privateVault.configured": "ตู้เก็บไฟล์ถูกตั้งค่าสำหรับบัญชีนี้แล้ว",
+  "privateVault.confirmPin": "ยืนยัน PIN",
+  "privateVault.currentPin": "PIN ปัจจุบัน",
+  "privateVault.currentPinOptional": "PIN ปัจจุบัน (ไม่บังคับ)",
+  "privateVault.description": "แยกไฟล์ส่วนตัวออกจากเอกสารงาน การอัปโหลดจะยังผ่าน pipeline RAG เดิม และสามารถใช้กับ OCR, ติดตามบิล และบันทึกส่วนตัวได้",
+  "privateVault.disable": "ปิดใช้งาน",
+  "privateVault.disableDescription": "การปิดจะซ่อน Private Files จนกว่าจะตั้งค่าตู้ใหม่อีกครั้ง โดยจะไม่ลบไฟล์ของคุณ",
+  "privateVault.disableTitle": "ปิดตู้เก็บไฟล์",
+  "privateVault.enterCurrentPin": "ป้อน PIN ปัจจุบันของคุณ",
+  "privateVault.enterNewPin": "ป้อนและยืนยัน PIN ใหม่ของคุณ",
+  "privateVault.enterPin": "ป้อน PIN ของคุณ",
+  "privateVault.eyebrow": "ตู้เก็บไฟล์",
+  "privateVault.loading": "กำลังโหลดการตั้งค่าตู้เก็บไฟล์...",
+  "privateVault.locked": "ล็อกอยู่",
+  "privateVault.newPin": "PIN ใหม่",
+  "privateVault.notConfigured": "ยังไม่ได้ตั้ง PIN สำหรับตู้เก็บไฟล์ส่วนตัว",
+  "privateVault.pinMismatch": "PIN ไม่ตรงกัน",
+  "privateVault.pinPlaceholder": "PIN code",
+  "privateVault.savePin": "บันทึก PIN",
+  "privateVault.setPinDescription": "ใช้ PIN 4-12 หลัก หากมี PIN อยู่แล้วต้องใช้ PIN เดิมเพื่อเปลี่ยน",
+  "privateVault.setPinTitle": "ตั้งหรือเปลี่ยน PIN",
+  "privateVault.setupHint": "ตั้ง PIN ในส่วนด้านล่างเพื่อเปิดใช้งาน Private Files สำหรับบัญชีของคุณ",
+  "privateVault.statusTitle": "สถานะตู้เก็บไฟล์",
+  "privateVault.title": "ตู้เก็บไฟล์ส่วนตัว",
+  "privateVault.unlock": "ปลดล็อก",
+  "privateVault.unlockDescription": "ป้อน PIN ของคุณเพื่อปลดล็อกพื้นที่ Private Files ในเซสชันเบราว์เซอร์นี้",
+  "privateVault.unlocked": "ปลดล็อกแล้ว",
+  "privateVault.unlockHint": "ปลดล็อกตู้เก็บไฟล์ที่ส่วนด้านขวา หรือสร้าง PIN ด้านล่างหากเป็นครั้งแรก",
+  "privateVault.unlockTitle": "ปลดล็อกตู้เก็บไฟล์",
+  "profile.bio": "ประวัติย่อ",
+  "profile.bioPlaceholder": "เล่าเกี่ยวกับตัวคุณ...",
+  "profile.description": "อัปเดตรายละเอียดส่วนตัวและรูปโปรไฟล์ของคุณ",
+  "profile.emailAddress": "อีเมล",
+  "profile.eyebrow": "โปรไฟล์",
+  "profile.fullName": "ชื่อ-นามสกุล",
+  "profile.photoHint": "JPG, PNG หรือ GIF ขนาดไม่เกิน 2MB",
+  "profile.title": "ข้อมูลโปรไฟล์",
+  "profile.uploadPhoto": "อัปโหลดรูปภาพ",
+  "recovery.backupEmailRemoved": "ลบอีเมลสำรองแล้ว",
+  "recovery.backupEmailSent": "ส่งรหัสไปยังอีเมลสำรองแล้ว",
+  "recovery.backupEmailVerified": "ยืนยันอีเมลสำรองแล้ว!",
+  "recovery.cancel": "ยกเลิก",
+  "recovery.codePlaceholder": "รหัส 6 หลัก",
+  "recovery.emailDescription": "เพิ่มอีเมลสำรองสำหรับกู้คืนรหัสผ่าน",
+  "recovery.emailPlaceholder": "backup@example.com",
+  "recovery.emailTitle": "อีเมลสำรองสำหรับกู้คืน",
+  "recovery.phoneCodeSent": "ส่งรหัสผ่าน SMS แล้ว",
+  "recovery.phoneDescription": "เพิ่มเบอร์โทรสำหรับกู้คืนรหัสผ่านผ่าน SMS (รูปแบบ E.164: +66812345678)",
+  "recovery.phonePlaceholder": "+66812345678",
+  "recovery.phoneRemoved": "ลบเบอร์โทรแล้ว",
+  "recovery.phoneTitle": "เบอร์โทรสำรองสำหรับกู้คืน",
+  "recovery.phoneVerified": "ยืนยันเบอร์โทรแล้ว!",
+  "recovery.remove": "ลบ",
+  "recovery.sendCode": "ส่งรหัส",
+  "recovery.verified": "ยืนยันแล้ว",
+  "recovery.verify": "ยืนยัน",
+  "saved": "บันทึกการตั้งค่าแล้ว",
+  "security.currentPassword": "รหัสผ่านปัจจุบัน",
+  "security.description": "จัดการรหัสผ่านและค่าความปลอดภัย",
+  "security.eyebrow": "ความปลอดภัย",
+  "security.newPassword": "รหัสผ่านใหม่",
+  "security.title": "การตั้งค่าความปลอดภัย",
+  "security.updatePassword": "อัปเดตรหัสผ่าน",
+  "skills": "สกิล",
+  "tabs.account": "บัญชี",
+  "tabs.apiKeys": "API Keys",
+  "tabs.automation": "อัตโนมัติ",
+  "tabs.billing": "การเรียกเก็บเงิน",
+  "tabs.integrations": "การเชื่อมต่อ",
+  "tabs.notifications": "การแจ้งเตือน",
+  "tabs.personas": "เพอร์โซนา",
+  "tabs.preferences": "ค่ากำหนด",
+  "tabs.privateVault": "ไฟล์ส่วนตัว",
+  "tabs.profile": "โปรไฟล์",
+  "tabs.security": "ความปลอดภัย",
+  "title": "การตั้งค่า",
+  "translation.language": "ภาษาสำหรับการแปล",
+  "translation.model": "โมเดลสำหรับการแปล",
+  "translation.saved": "บันทึกค่ากำหนดการแปลแล้ว",
+  "translation.savePreferences": "บันทึกค่ากำหนด",
+  "translation.searchModels": "ค้นหาโมเดล...",
+  "translation.selectLanguage": "เลือกภาษา..."
+}
diff --git a/apps/web/client/src/locales/th/social.json b/apps/web/client/src/locales/th/social.json
new file mode 100644
index 00000000..0967ef42
--- /dev/null
+++ b/apps/web/client/src/locales/th/social.json
@@ -0,0 +1 @@
+{}
diff --git a/apps/web/client/src/locales/th/workflow.json b/apps/web/client/src/locales/th/workflow.json
new file mode 100644
index 00000000..e17849a5
--- /dev/null
+++ b/apps/web/client/src/locales/th/workflow.json
@@ -0,0 +1,49 @@
+{
+  "description": "สร้างและจัดการเวิร์กโฟลว์อัตโนมัติ",
+  "empty.adjustSearch": "ลองปรับคำค้นหา",
+  "empty.createFirst": "สร้างเวิร์กโฟลว์แรกของคุณหรือเริ่มจากเทมเพลต",
+  "empty.filtered": "ไม่พบเวิร์กโฟลว์",
+  "empty.saved": "ยังไม่มีเวิร์กโฟลว์",
+  "executions.description": "รอบการรันเวิร์กโฟลว์ล่าสุดและสถานะการทำงาน",
+  "executions.eyebrow": "การทำงาน",
+  "executions.title": "การทำงานล่าสุด",
+  "gallery": "แกลเลอรี",
+  "galleryBrowseAll": "ดูทั้งหมด",
+  "library.description": "ฉบับร่างและเวิร์กโฟลว์ที่บันทึกไว้พร้อมเปิดหรือเผยแพร่",
+  "library.eyebrow": "คลังเวิร์กโฟลว์",
+  "library.title": "เวิร์กโฟลว์ของฉัน",
+  "newWorkflow": "เวิร์กโฟลว์ใหม่",
+  "nodesCount": "{{count}} โหนด",
+  "publish.cancel": "ยกเลิกคำขอเผยแพร่",
+  "publish.description": "จะพร้อมให้ใช้งานใน Workflow Gallery สาธารณะสำหรับผู้ใช้ทุกคน",
+  "publish.dialogPrefix": "ส่ง",
+  "publish.dialogSuffix": "เพื่อให้ผู้ดูแลตรวจสอบ เมื่ออนุมัติแล้ว",
+  "publish.next.step1": "เวิร์กโฟลว์ของคุณจะถูกส่งเป็นเทมเพลต",
+  "publish.next.step2": "ผู้ดูแลจะตรวจสอบคุณภาพและความปลอดภัย",
+  "publish.next.step3": "คุณจะได้รับแจ้งเมื่ออนุมัติหรือหากต้องแก้ไข",
+  "publish.nextTitle": "จะเกิดอะไรขึ้นต่อ:",
+  "publish.resubmit": "ส่งตรวจสอบอีกครั้ง",
+  "publish.submit": "ส่งเพื่อตรวจสอบ",
+  "publish.title": "เผยแพร่ไปยังแกลเลอรี",
+  "publish.toGallery": "เผยแพร่ไปยังแกลเลอรี",
+  "status.compiled": "คอมไพล์แล้ว",
+  "status.completed": "เสร็จแล้ว",
+  "status.draft": "ฉบับร่าง",
+  "status.failed": "ล้มเหลว",
+  "status.inGallery": "อยู่ในแกลเลอรี",
+  "status.pending": "รอตรวจสอบ",
+  "status.published": "เผยแพร่แล้ว",
+  "status.rejected": "ถูกปฏิเสธ",
+  "status.rejectedWithReason": "ถูกปฏิเสธ: {{reason}}",
+  "status.running": "กำลังทำงาน",
+  "templates.description": "เทมเพลตที่ผู้ใช้อื่นเปิดบ่อยที่สุด",
+  "templates.eyebrow": "เทมเพลต",
+  "templates.title": "เทมเพลตยอดนิยม",
+  "time.daysAgo": "{{count}} วันก่อน",
+  "time.hoursAgo": "{{count}} ชม.ที่แล้ว",
+  "time.justNow": "เมื่อสักครู่",
+  "time.minutesAgo": "{{count}} นาทีที่แล้ว",
+  "title": "เวิร์กโฟลว์",
+  "toast.cancelled": "ยกเลิกคำขอเผยแพร่แล้ว",
+  "toast.submitted": "ส่งเวิร์กโฟลว์เข้าตรวจสอบแล้ว"
+}
diff --git a/apps/web/scripts/generate-locale-json.mjs b/apps/web/scripts/generate-locale-json.mjs
new file mode 100644
index 00000000..4e143dc5
--- /dev/null
+++ b/apps/web/scripts/generate-locale-json.mjs
@@ -0,0 +1,510 @@
+#!/usr/bin/env node
+/**
+ * Script: generate-locale-json.mjs
+ * Transforms en.ts / th.ts flat key dictionaries into namespaced JSON files
+ * under client/src/locales/{en,th}/
+ */
+import { readFileSync, writeFileSync, mkdirSync } from "fs";
+import { dirname, join } from "path";
+import { fileURLToPath } from "url";
+
+const __dirname = dirname(fileURLToPath(import.meta.url));
+const WEB_ROOT = join(__dirname, "..");
+const LOCALES_SRC = join(WEB_ROOT, "client/src/lib/i18n/locales");
+const OUT_ROOT = join(WEB_ROOT, "client/src/locales");
+
+// Namespace mapping: source prefix → target JSON file (without .json)
+const NAMESPACE_MAP = {
+  help: "help",
+  bsHelp: "help",        // Browser-session help → merged into help.json
+  chat: "chat",
+  settings: "settings",
+  mediaStudio: "media",
+  credits: "billing",
+  workflows: "workflow",
+  notifications: "common",
+  common: "common",
+  invite: "admin",
+  editor: "presentation",
+  teams: "agency",
+  orchestrator: "agency",
+};
+
+/** Parse a .ts locale file → flat Record<string, string> */
+function parseLocaleTs(filepath) {
+  const src = readFileSync(filepath, "utf-8");
+  const result = {};
+
+  // Strategy: find each key-value pair.
+  // Keys are always: "some.key":
+  // Values are either:
+  //   - on the same line: "some.key": "value",
+  //   - on the next line: "some.key":\n    "value",
+  // Values can span multiple lines via string concatenation with +
+  //   "key": "part1" +
+  //     "part2",
+  // We handle all these cases.
+
+  // First, collapse the source into a manageable form.
+  // We use a state machine over characters.
+
+  // Simpler approach: use regex to find all "key": followed by string content
+  // The regex handles: key on one line, value on same or next lines
+  // Matches: "key": "value" (single line)
+  // or: "key":\n    "value" (value on next line)
+  // or: "key":\n    "value1" +\n      "value2" (multiline concatenation)
+
+  // We'll process line by line but with a lookahead buffer approach
+  const lines = src.split("\n");
+  let i = 0;
+
+  while (i < lines.length) {
+    const line = lines[i];
+
+    // Look for a key definition: starts with spaces, then "key":
+    const keyMatch = line.match(/^\s+"([^"]+)":\s*/);
+    if (!keyMatch) { i++; continue; }
+
+    const key = keyMatch[1];
+    // Don't process TypeScript-only keys (like object spread, etc.)
+    if (!key.includes(".")) { i++; continue; }
+
+    // Collect value: everything after the key on the same line, then subsequent lines
+    let rest = line.substring(keyMatch[0].length);
+    let value = "";
+
+    // Parse value from rest + potentially following lines
+    const parsed = parseValue(rest, lines, i);
+    if (parsed !== null) {
+      value = parsed.value;
+      i = parsed.nextLine;
+      result[key] = value;
+    } else {
+      i++;
+    }
+  }
+
+  return result;
+}
+
+/**
+ * Parse a value starting from `rest` (remainder of current line after "key": )
+ * Returns { value: string, nextLine: number } or null
+ */
+function parseValue(rest, lines, lineIdx) {
+  // Skip leading whitespace
+  rest = rest.trimStart();
+
+  if (rest.startsWith('"')) {
+    // Inline string value
+    return parseQuotedString(rest, lines, lineIdx);
+  } else if (rest === "" || rest.startsWith("//")) {
+    // Value on next line(s)
+    let nextLine = lineIdx + 1;
+    while (nextLine < lines.length) {
+      const nextRest = lines[nextLine].trimStart();
+      if (nextRest.startsWith('"')) {
+        return parseQuotedString(nextRest, lines, nextLine);
+      } else if (nextRest === "" || nextRest.startsWith("//")) {
+        nextLine++;
+      } else {
+        break;
+      }
+    }
+  }
+  return null;
+}
+
+/**
+ * Parse a (possibly multi-line concatenated) quoted string starting from `rest`
+ * which begins with a `"`. Handles `"part1" + "part2"` continuation.
+ */
+function parseQuotedString(rest, lines, lineIdx) {
+  let value = "";
+  let pos = 0;
+  let currentLine = rest;
+  let currentLineIdx = lineIdx;
+
+  while (true) {
+    // Must start with "
+    if (currentLine[pos] !== '"') break;
+    pos++; // skip opening "
+
+    // Read until closing " (respecting escapes)
+    let segment = "";
+    while (pos < currentLine.length) {
+      const ch = currentLine[pos];
+      if (ch === "\\") {
+        const next = currentLine[pos + 1];
+        if (next === "n") { segment += "\n"; pos += 2; }
+        else if (next === "t") { segment += "\t"; pos += 2; }
+        else if (next === '"') { segment += '"'; pos += 2; }
+        else if (next === "\\") { segment += "\\"; pos += 2; }
+        else { segment += next || ""; pos += 2; }
+      } else if (ch === '"') {
+        pos++; // skip closing "
+        value += segment;
+        break;
+      } else {
+        segment += ch;
+        pos++;
+      }
+    }
+
+    // Skip whitespace after closing "
+    while (pos < currentLine.length && (currentLine[pos] === " " || currentLine[pos] === "\t")) pos++;
+
+    // Check for continuation: ,  or + or end of line
+    if (pos < currentLine.length && currentLine[pos] === "+") {
+      // Concatenation on same or next line
+      pos++;
+      while (pos < currentLine.length && (currentLine[pos] === " " || currentLine[pos] === "\t")) pos++;
+      if (pos < currentLine.length) {
+        // Continue parsing on same line
+        currentLine = currentLine.substring(pos);
+        pos = 0;
+        continue;
+      } else {
+        // Value continues on next line
+        currentLineIdx++;
+        if (currentLineIdx >= lines.length) break;
+        currentLine = lines[currentLineIdx].trimStart();
+        pos = 0;
+        continue;
+      }
+    } else {
+      // Done: comma or end of line
+      return { value, nextLine: currentLineIdx + 1 };
+    }
+  }
+
+  return null;
+}
+
+/** Assign a key to a namespace file */
+function keyToNamespace(key) {
+  const dot = key.indexOf(".");
+  if (dot < 0) return "common";
+  const prefix = key.substring(0, dot);
+  return NAMESPACE_MAP[prefix] ?? "misc";
+}
+
+/** Strip namespace prefix from key */
+function stripPrefix(key, namespace) {
+  const prefixes = Object.entries(NAMESPACE_MAP)
+    .filter(([, ns]) => ns === namespace)
+    .map(([p]) => p);
+
+  for (const prefix of prefixes) {
+    if (key.startsWith(prefix + ".")) {
+      return key.substring(prefix.length + 1);
+    }
+  }
+  return key;
+}
+
+/** Write JSON file, sorted keys */
+function writeJson(filepath, data) {
+  const sorted = Object.fromEntries(
+    Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
+  );
+  writeFileSync(filepath, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
+}
+
+function processLocale(lang) {
+  const srcFile = join(LOCALES_SRC, `${lang}.ts`);
+  const flat = parseLocaleTs(srcFile);
+  const outDir = join(OUT_ROOT, lang);
+  mkdirSync(outDir, { recursive: true });
+
+  // Group by namespace
+  const groups = {};
+  for (const [key, value] of Object.entries(flat)) {
+    const ns = keyToNamespace(key);
+    if (!groups[ns]) groups[ns] = {};
+    const stripped = stripPrefix(key, ns);
+    groups[ns][stripped] = value;
+  }
+
+  // Write namespace files
+  for (const [ns, data] of Object.entries(groups)) {
+    writeJson(join(outDir, `${ns}.json`), data);
+  }
+
+  // Write empty placeholders for standard namespaces
+  const allNs = ["agency", "marketplace", "profile", "social", "dashboard"];
+  for (const ns of allNs) {
+    if (!groups[ns]) {
+      writeJson(join(outDir, `${ns}.json`), {});
+    }
+  }
+
+  const totalKeys = Object.keys(flat).length;
+  const outputKeys = Object.values(groups).reduce((sum, g) => sum + Object.keys(g).length, 0);
+  const fileCount = Object.keys(groups).length + allNs.filter(ns => !groups[ns]).length;
+  console.log(`${lang}: ${totalKeys} source keys → ${outputKeys} output keys across ${fileCount} files`);
+  return { totalKeys, outputKeys, groups };
+}
+
+// Process both locales
+const en = processLocale("en");
+const th = processLocale("th");
+
+// Ensure th has all en namespace files (empty if missing)
+for (const ns of Object.keys(en.groups)) {
+  const thFile = join(OUT_ROOT, "th", `${ns}.json`);
+  try { readFileSync(thFile); } catch {
+    writeJson(thFile, {});
+  }
+}
+
+// Create new Wave 1 files: nav.json, auth.json, errors.json
+const newNavEn = {
+  "header.notifications": "Notifications",
+  "header.profile": "Profile",
+  "header.search": "Search",
+  "header.signOut": "Sign out",
+  "navbar.features": "Features",
+  "navbar.getStarted": "Get Started",
+  "navbar.home": "Home",
+  "navbar.pricing": "Pricing",
+  "navbar.signIn": "Sign In",
+  "sidebar.agencies": "Agencies",
+  "sidebar.chat": "Chat",
+  "sidebar.credits": "Credits",
+  "sidebar.dashboard": "Dashboard",
+  "sidebar.library": "Library",
+  "sidebar.mediaStudio": "Media Studio",
+  "sidebar.presentations": "Presentations",
+  "sidebar.settings": "Settings",
+  "sidebar.teams": "Teams",
+  "sidebar.workflows": "Workflows",
+};
+
+const newNavTh = {
+  "header.notifications": "การแจ้งเตือน",
+  "header.profile": "โปรไฟล์",
+  "header.search": "ค้นหา",
+  "header.signOut": "ออกจากระบบ",
+  "navbar.features": "ฟีเจอร์",
+  "navbar.getStarted": "เริ่มต้นใช้งาน",
+  "navbar.home": "หน้าหลัก",
+  "navbar.pricing": "ราคา",
+  "navbar.signIn": "เข้าสู่ระบบ",
+  "sidebar.agencies": "เอเจนซี",
+  "sidebar.chat": "แชท",
+  "sidebar.credits": "เครดิต",
+  "sidebar.dashboard": "แดชบอร์ด",
+  "sidebar.library": "ไลบรารี",
+  "sidebar.mediaStudio": "มีเดียสตูดิโอ",
+  "sidebar.presentations": "งานนำเสนอ",
+  "sidebar.settings": "การตั้งค่า",
+  "sidebar.teams": "ทีม",
+  "sidebar.workflows": "เวิร์กโฟลว์",
+};
+
+const newAuthEn = {
+  "callback.error": "Authentication failed. Please try again.",
+  "callback.processing": "Processing your sign-in\u2026",
+  "mfa.codeLabel": "Authentication Code",
+  "mfa.submitButton": "Verify",
+  "mfa.title": "Two-Factor Authentication",
+  "resetPassword.emailLabel": "Email Address",
+  "resetPassword.submitButton": "Send Reset Link",
+  "resetPassword.title": "Reset Password",
+  "signIn.createAccount": "Create account",
+  "signIn.emailLabel": "Email",
+  "signIn.forgotPassword": "Forgot password?",
+  "signIn.noAccount": "Don't have an account?",
+  "signIn.passwordLabel": "Password",
+  "signIn.submitButton": "Sign In",
+  "signIn.title": "Sign In",
+  "signUp.createAccount": "Create Account",
+  "signUp.email": "Email",
+  "signUp.password": "Password",
+  "signUp.title": "Create Account",
+};
+
+const newAuthTh = {
+  "callback.error": "การยืนยันตัวตนล้มเหลว กรุณาลองใหม่",
+  "callback.processing": "กำลังดำเนินการลงชื่อเข้าใช้\u2026",
+  "mfa.codeLabel": "รหัสยืนยัน",
+  "mfa.submitButton": "ยืนยัน",
+  "mfa.title": "การยืนยันตัวตนสองขั้นตอน",
+  "resetPassword.emailLabel": "ที่อยู่อีเมล",
+  "resetPassword.submitButton": "ส่งลิงก์รีเซ็ต",
+  "resetPassword.title": "รีเซ็ตรหัสผ่าน",
+  "signIn.createAccount": "สร้างบัญชี",
+  "signIn.emailLabel": "อีเมล",
+  "signIn.forgotPassword": "ลืมรหัสผ่าน?",
+  "signIn.noAccount": "ยังไม่มีบัญชี?",
+  "signIn.passwordLabel": "รหัสผ่าน",
+  "signIn.submitButton": "เข้าสู่ระบบ",
+  "signIn.title": "เข้าสู่ระบบ",
+  "signUp.createAccount": "สร้างบัญชี",
+  "signUp.email": "อีเมล",
+  "signUp.password": "รหัสผ่าน",
+  "signUp.title": "สร้างบัญชี",
+};
+
+const newErrorsEn = {
+  "forbidden.message": "You don't have permission to access this resource.",
+  "forbidden.title": "Access Forbidden",
+  "generic.somethingWentWrong": "Something went wrong. Please try again.",
+  "generic.tryAgain": "Try Again",
+  "networkError": "Network error. Please check your connection.",
+  "notFound.message": "The page you're looking for doesn't exist.",
+  "notFound.title": "Page Not Found",
+  "requestFailed": "The request failed. Please try again.",
+  "serverError.message": "An internal server error occurred.",
+  "serverError.title": "Server Error",
+  "session.expired": "Your session has expired. Please sign in again.",
+  "validation.invalidEmail": "Please enter a valid email address.",
+  "validation.passwordTooShort": "Password must be at least 8 characters.",
+  "validation.required": "This field is required.",
+};
+
+const newErrorsTh = {
+  "forbidden.message": "คุณไม่มีสิทธิ์เข้าถึงทรัพยากรนี้",
+  "forbidden.title": "การเข้าถึงถูกปฏิเสธ",
+  "generic.somethingWentWrong": "เกิดข้อผิดพลาด กรุณาลองใหม่",
+  "generic.tryAgain": "ลองใหม่",
+  "networkError": "ข้อผิดพลาดเครือข่าย กรุณาตรวจสอบการเชื่อมต่อ",
+  "notFound.message": "ไม่พบหน้าที่คุณกำลังค้นหา",
+  "notFound.title": "ไม่พบหน้า",
+  "requestFailed": "คำขอล้มเหลว กรุณาลองใหม่",
+  "serverError.message": "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
+  "serverError.title": "ข้อผิดพลาดเซิร์ฟเวอร์",
+  "session.expired": "เซสชันของคุณหมดอายุ กรุณาลงชื่อเข้าใช้ใหม่",
+  "validation.invalidEmail": "กรุณากรอกที่อยู่อีเมลที่ถูกต้อง",
+  "validation.passwordTooShort": "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
+  "validation.required": "จำเป็นต้องกรอกข้อมูลในช่องนี้",
+};
+
+writeJson(join(OUT_ROOT, "en/nav.json"), newNavEn);
+writeJson(join(OUT_ROOT, "th/nav.json"), newNavTh);
+writeJson(join(OUT_ROOT, "en/auth.json"), newAuthEn);
+writeJson(join(OUT_ROOT, "th/auth.json"), newAuthTh);
+writeJson(join(OUT_ROOT, "en/errors.json"), newErrorsEn);
+writeJson(join(OUT_ROOT, "th/errors.json"), newErrorsTh);
+
+// Ensure common.json has required keys
+function ensureCommonKeys(langFile, requiredKeys) {
+  let data = {};
+  try { data = JSON.parse(readFileSync(langFile, "utf-8")); } catch {}
+  for (const [k, v] of Object.entries(requiredKeys)) {
+    if (!data[k]) data[k] = v;
+  }
+  writeJson(langFile, data);
+}
+
+const requiredCommonEn = {
+  "active": "Active",
+  "back": "Back",
+  "cancel": "Cancel",
+  "close": "Close",
+  "confirm": "Confirm",
+  "confirmDialog.irreversible": "This action cannot be undone.",
+  "confirmDialog.title": "Are you sure?",
+  "copy": "Copy",
+  "copied": "Copied!",
+  "create": "Create",
+  "delete": "Delete",
+  "deselectAll": "Deselect All",
+  "download": "Download",
+  "edit": "Edit",
+  "emptyState.noItems": "No items found.",
+  "emptyState.noResults": "No results for your search.",
+  "emptyState.nothingYet": "Nothing here yet.",
+  "error": "Error",
+  "export": "Export",
+  "filter": "Filter",
+  "import": "Import",
+  "inactive": "Inactive",
+  "loading": "Loading\u2026",
+  "next": "Next",
+  "ok": "OK",
+  "optional": "Optional",
+  "pagination.next": "Next",
+  "pagination.page": "Page {{page}}",
+  "pagination.previous": "Previous",
+  "pagination.showing": "Showing {{from}}\u2013{{to}} of {{total}}",
+  "pending": "Pending",
+  "refresh": "Refresh",
+  "required": "Required",
+  "retry": "Retry",
+  "save": "Save",
+  "search": "Search",
+  "selectAll": "Select All",
+  "showLess": "Show Less",
+  "showMore": "Show More",
+  "sort": "Sort",
+  "submit": "Submit",
+  "success": "Success",
+  "toast.copied": "Copied to clipboard",
+  "toast.created": "Created successfully",
+  "toast.deleted": "Deleted successfully",
+  "toast.failed": "Operation failed",
+  "toast.saved": "Saved successfully",
+  "upload": "Upload",
+  "yes": "Yes",
+  "no": "No",
+};
+
+const requiredCommonTh = {
+  "active": "ใช้งานอยู่",
+  "back": "กลับ",
+  "cancel": "ยกเลิก",
+  "close": "ปิด",
+  "confirm": "ยืนยัน",
+  "confirmDialog.irreversible": "การกระทำนี้ไม่สามารถย้อนกลับได้",
+  "confirmDialog.title": "คุณแน่ใจหรือไม่?",
+  "copy": "คัดลอก",
+  "copied": "คัดลอกแล้ว!",
+  "create": "สร้าง",
+  "delete": "ลบ",
+  "deselectAll": "ยกเลิกการเลือกทั้งหมด",
+  "download": "ดาวน์โหลด",
+  "edit": "แก้ไข",
+  "emptyState.noItems": "ไม่พบรายการ",
+  "emptyState.noResults": "ไม่พบผลลัพธ์",
+  "emptyState.nothingYet": "ยังไม่มีข้อมูล",
+  "error": "ข้อผิดพลาด",
+  "export": "ส่งออก",
+  "filter": "กรอง",
+  "import": "นำเข้า",
+  "inactive": "ไม่ใช้งาน",
+  "loading": "กำลังโหลด\u2026",
+  "next": "ถัดไป",
+  "ok": "ตกลง",
+  "optional": "ไม่บังคับ",
+  "pagination.next": "ถัดไป",
+  "pagination.page": "หน้า {{page}}",
+  "pagination.previous": "ก่อนหน้า",
+  "pagination.showing": "แสดง {{from}}\u2013{{to}} จาก {{total}}",
+  "pending": "รอดำเนินการ",
+  "refresh": "รีเฟรช",
+  "required": "จำเป็น",
+  "retry": "ลองใหม่",
+  "save": "บันทึก",
+  "search": "ค้นหา",
+  "selectAll": "เลือกทั้งหมด",
+  "showLess": "แสดงน้อยลง",
+  "showMore": "แสดงเพิ่มเติม",
+  "sort": "เรียงลำดับ",
+  "submit": "ส่ง",
+  "success": "สำเร็จ",
+  "toast.copied": "คัดลอกไปยังคลิปบอร์ด",
+  "toast.created": "สร้างสำเร็จ",
+  "toast.deleted": "ลบสำเร็จ",
+  "toast.failed": "การดำเนินการล้มเหลว",
+  "toast.saved": "บันทึกสำเร็จ",
+  "upload": "อัปโหลด",
+  "yes": "ใช่",
+  "no": "ไม่",
+};
+
+ensureCommonKeys(join(OUT_ROOT, "en/common.json"), requiredCommonEn);
+ensureCommonKeys(join(OUT_ROOT, "th/common.json"), requiredCommonTh);
+
+console.log("\nDone! Locale JSON files written to client/src/locales/");
