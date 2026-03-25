diff --git a/apps/web/client/src/pages/Settings.tsx b/apps/web/client/src/pages/Settings.tsx
index 5bd173bd..96e6792a 100644
--- a/apps/web/client/src/pages/Settings.tsx
+++ b/apps/web/client/src/pages/Settings.tsx
@@ -9,6 +9,9 @@ import { motion } from 'framer-motion';
 import { useAuth } from '@/contexts/AuthContext';
 import { Button } from '@/components/ui/button';
 import { HelpButton } from "@/components/help";
+import { useI18n } from '@/lib/i18n';
+import i18next from 'i18next';
+import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, LANGUAGE_LABELS_EN, LANGUAGE_COVERAGE, type SupportedLanguage } from '@shared/i18n';
 import {
   Dialog,
   DialogContent,
@@ -22,6 +25,7 @@ import { toast } from 'sonner';
 import { pickEnabledModelId } from '@/lib/enabledModelSelection';
 import { Input } from '@/components/ui/input';
 import { Badge } from '@/components/ui/badge';
+import { DashboardSectionHeader } from '@/components/dashboard';
 import {
   Settings as SettingsIcon,
   User,
@@ -60,6 +64,7 @@ import { QRCodeSVG } from 'qrcode.react';
 import { GoogleDrivePanel } from '@/components/settings/GoogleDrivePanel';
 import { McpServersSettingsPanel } from '@/components/settings/McpServersSettingsPanel';
 import { OneDrivePanel } from '@/components/settings/OneDrivePanel';
+import { UploadPostGatewayPanel } from '@/components/settings/UploadPostGatewayPanel';
 import { UserAPIKeysPanel } from '@/components/settings/UserAPIKeysPanel';
 import { UserLlmKeysPanel } from '@/components/settings/UserLlmKeysPanel';
 import { BudgetPanel } from '@/components/settings/BudgetPanel';
@@ -73,6 +78,7 @@ type SettingsTab = 'profile' | 'account' | 'security' | 'privateVault' | 'prefer
 type TwoFAStep = 'idle' | 'setup' | 'verify' | 'done' | 'disable' | 'regen';
 
 function TwoFactorSection() {
+  const { t } = useI18n();
   const [step, setStep] = useState<TwoFAStep>('idle');
   const [setupData, setSetupData] = useState<{ secret: string; uri: string; recoveryCodes: string[] } | null>(null);
   const [code, setCode] = useState('');
@@ -93,30 +99,30 @@ function TwoFactorSection() {
       setSetupData(result as { secret: string; uri: string; recoveryCodes: string[] });
       setStep('setup');
     },
-    onError: () => toast.error('Failed to start 2FA setup'),
+    onError: () => toast.error(t('settings.2fa.error.startSetup')),
     onSettled: () => setIsLoading(false),
   });
 
   const confirm2FA = trpc.auth.confirm2FA.useMutation({
     onSuccess: () => {
-      toast.success('2FA enabled successfully!');
+      toast.success(t('settings.2fa.success.enabled'));
       setStep('done');
       setShowCodes(true);
       statusQuery.refetch();
     },
-    onError: (err) => toast.error(err.message || 'Verification failed'),
+    onError: (err) => toast.error(err.message || t('settings.2fa.error.verificationFailed')),
     onSettled: () => setIsLoading(false),
   });
 
   const disable2FA = trpc.auth.disable2FA.useMutation({
     onSuccess: () => {
-      toast.success('2FA disabled');
+      toast.success(t('settings.2fa.success.disabled'));
       setStep('idle');
       setDisableCode('');
       setSetupData(null);
       statusQuery.refetch();
     },
-    onError: (err) => toast.error(err.message || 'Failed to disable 2FA'),
+    onError: (err) => toast.error(err.message || t('settings.2fa.error.disableFailed')),
     onSettled: () => setIsLoading(false),
   });
 
@@ -127,9 +133,9 @@ function TwoFactorSection() {
       setShowCodes(true);
       setRegenCode('');
       statusQuery.refetch();
-      toast.success('New recovery codes generated');
+      toast.success(t('settings.2fa.success.newCodes'));
     },
-    onError: () => toast.error('Failed to regenerate codes'),
+    onError: () => toast.error(t('settings.2fa.error.regenFailed')),
     onSettled: () => setIsLoading(false),
   });
 
@@ -139,32 +145,32 @@ function TwoFactorSection() {
   };
 
   const handleConfirm = () => {
-    if (code.length !== 6) { toast.error('Enter a 6-digit code'); return; }
+    if (code.length !== 6) { toast.error(t('settings.2fa.error.enterCode')); return; }
     setIsLoading(true);
     confirm2FA.mutate({ code });
   };
 
   const handleDisable = () => {
-    if (!disableCode) { toast.error('Enter your TOTP or recovery code'); return; }
+    if (!disableCode) { toast.error(t('settings.2fa.error.enterDisableCode')); return; }
     setIsLoading(true);
     disable2FA.mutate({ code: disableCode });
   };
 
   const handleRegen = () => {
-    if (regenCode.length !== 6) { toast.error('Enter your current TOTP code'); return; }
+    if (regenCode.length !== 6) { toast.error(t('settings.2fa.error.enterCurrentCode')); return; }
     setIsLoading(true);
     regenCodes.mutate({ code: regenCode });
   };
 
   const copyToClipboard = (text: string) => {
-    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
+    navigator.clipboard.writeText(text).then(() => toast.success(t('common.copied')));
   };
 
   const codesToShow = newCodes || setupData?.recoveryCodes || [];
 
   return (
     <div className="pt-6 border-t border-gray-200">
-      <h3 className="font-semibold text-gray-900 mb-4">Two-Factor Authentication</h3>
+      <h3 className="font-semibold text-gray-900 mb-4">{t('settings.2fa.title')}</h3>
 
       {/* Admin disabled */}
       {!adminEnabled && !enabled && (
@@ -172,8 +178,8 @@ function TwoFactorSection() {
           <div className="flex items-center gap-3">
             <ShieldOff className="w-5 h-5 text-gray-400" />
             <div>
-              <div className="font-medium text-gray-900">2FA is not available</div>
-              <div className="text-sm text-gray-500">Two-factor authentication has been disabled by your administrator.</div>
+              <div className="font-medium text-gray-900">{t('settings.2fa.notAvailable')}</div>
+              <div className="text-sm text-gray-500">{t('settings.2fa.disabledByAdmin')}</div>
             </div>
           </div>
         </div>
@@ -182,7 +188,7 @@ function TwoFactorSection() {
       {/* Enforced notice */}
       {enforced && !enabled && adminEnabled && (
         <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-3">
-          Your administrator requires two-factor authentication. Please enable 2FA to continue using the platform.
+          {t('settings.2fa.enforcedNotice')}
         </div>
       )}
 
@@ -193,13 +199,13 @@ function TwoFactorSection() {
             <div className="flex items-center gap-3">
               <Smartphone className="w-5 h-5 text-gray-400" />
               <div>
-                <div className="font-medium text-gray-900">2FA is disabled</div>
-                <div className="text-sm text-gray-500">Protect your account with an authenticator app</div>
+                <div className="font-medium text-gray-900">{t('settings.2fa.disabled')}</div>
+                <div className="text-sm text-gray-500">{t('settings.2fa.protectAccount')}</div>
               </div>
             </div>
             <Button onClick={handleSetup} disabled={isLoading} size="sm">
               {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
-              Enable 2FA
+              {t('settings.2fa.enable')}
             </Button>
           </div>
         </div>
@@ -212,24 +218,24 @@ function TwoFactorSection() {
               <div className="flex items-center gap-3">
                 <ShieldCheck className="w-5 h-5 text-green-600" />
                 <div>
-                  <div className="font-medium text-green-900">2FA is enabled</div>
-                  <div className="text-sm text-green-700">{codesRemaining} recovery codes remaining</div>
+                  <div className="font-medium text-green-900">{t('settings.2fa.enabled')}</div>
+                  <div className="text-sm text-green-700">{t('settings.2fa.codesRemaining', { count: codesRemaining })}</div>
                 </div>
               </div>
               <div className="flex gap-2">
                 <Button variant="outline" size="sm" onClick={() => setStep('regen')}>
-                  <RefreshCw className="w-3 h-3 mr-1" /> New Codes
+                  <RefreshCw className="w-3 h-3 mr-1" /> {t('settings.2fa.newCodes')}
                 </Button>
                 <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setStep('disable')}>
-                  <ShieldOff className="w-3 h-3 mr-1" /> Disable
+                  <ShieldOff className="w-3 h-3 mr-1" /> {t('settings.2fa.disable')}
                 </Button>
               </div>
             </div>
           </div>
           {codesRemaining <= 2 && codesRemaining > 0 && (
-            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
-              You have only {codesRemaining} recovery code{codesRemaining === 1 ? '' : 's'} left. Consider regenerating them.
-            </div>
+              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
+              {t('settings.2fa.lowCodes', { count: codesRemaining })}
+              </div>
           )}
         </div>
       )}
@@ -237,14 +243,14 @@ function TwoFactorSection() {
       {/* Setup step: show QR code */}
       {step === 'setup' && setupData && (
         <div className="space-y-4">
-          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
-            <p className="text-sm font-medium text-purple-900 mb-3">1. Scan this QR code with your authenticator app</p>
+          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
+            <p className="text-sm font-medium text-blue-900 mb-3">{t('settings.2fa.setup.scanQr')}</p>
             <div className="flex justify-center mb-3">
               <div className="bg-white p-3 rounded-xl">
                 <QRCodeSVG value={setupData.uri} size={200} />
               </div>
             </div>
-            <p className="text-xs text-purple-700 mb-2">Or enter this secret manually:</p>
+            <p className="text-xs text-blue-700 mb-2">{t('settings.2fa.setup.manualSecret')}</p>
             <div className="flex items-center gap-2">
               <code className="flex-1 p-2 bg-white rounded text-xs font-mono break-all">{setupData.secret}</code>
               <Button variant="ghost" size="sm" onClick={() => copyToClipboard(setupData.secret)}>
@@ -254,20 +260,20 @@ function TwoFactorSection() {
           </div>
 
           <div>
-            <p className="text-sm font-medium text-gray-900 mb-2">2. Enter the 6-digit code from your app</p>
+            <p className="text-sm font-medium text-gray-900 mb-2">{t('settings.2fa.setup.enterCode')}</p>
             <div className="flex gap-2">
               <Input
                 value={code}
                 onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
-                placeholder="000000"
+                          placeholder={t('settings.2fa.codePlaceholder')}
                 maxLength={6}
                 className="font-mono text-center text-lg tracking-widest w-40"
               />
               <Button onClick={handleConfirm} disabled={isLoading || code.length !== 6}>
                 {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
-                Verify & Enable
+                {t('settings.2fa.verifyEnable')}
               </Button>
-              <Button variant="ghost" onClick={() => { setStep('idle'); setCode(''); setSetupData(null); }}>Cancel</Button>
+              <Button variant="ghost" onClick={() => { setStep('idle'); setCode(''); setSetupData(null); }}>{t('settings.2fa.cancel')}</Button>
             </div>
           </div>
         </div>
@@ -277,9 +283,9 @@ function TwoFactorSection() {
       {step === 'done' && showCodes && codesToShow.length > 0 && (
         <div className="space-y-4">
           <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
-            <p className="text-sm font-semibold text-amber-900 mb-2">Save your recovery codes</p>
+            <p className="text-sm font-semibold text-amber-900 mb-2">{t('settings.2fa.saveRecoveryCodes')}</p>
             <p className="text-xs text-amber-700 mb-3">
-              Store these codes in a safe place. Each code can only be used once to sign in if you lose access to your authenticator app.
+              {t('settings.2fa.recoveryCodesHint')}
             </p>
             <div className="grid grid-cols-2 gap-1 mb-3">
               {codesToShow.map((c, i) => (
@@ -288,10 +294,10 @@ function TwoFactorSection() {
             </div>
             <div className="flex gap-2">
               <Button variant="outline" size="sm" onClick={() => copyToClipboard(codesToShow.join('\n'))}>
-                <Copy className="w-3 h-3 mr-1" /> Copy All
+                <Copy className="w-3 h-3 mr-1" /> {t('settings.2fa.copyAll')}
               </Button>
               <Button size="sm" onClick={() => { setShowCodes(false); setStep('idle'); setNewCodes(null); }}>
-                I've saved my codes
+                {t('settings.2fa.savedCodes')}
               </Button>
             </div>
           </div>
@@ -301,20 +307,20 @@ function TwoFactorSection() {
       {/* Disable 2FA */}
       {step === 'disable' && (
         <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
-          <p className="text-sm font-medium text-red-900">Disable Two-Factor Authentication</p>
-          <p className="text-xs text-red-700">Enter your current TOTP code or a recovery code to disable 2FA.</p>
+          <p className="text-sm font-medium text-red-900">{t('settings.2fa.disableTitle')}</p>
+          <p className="text-xs text-red-700">{t('settings.2fa.disableDescription')}</p>
           <div className="flex gap-2">
             <Input
               value={disableCode}
               onChange={(e) => setDisableCode(e.target.value)}
-              placeholder="TOTP code or recovery code"
+              placeholder={t('settings.2fa.disablePlaceholder')}
               className="w-56"
             />
             <Button variant="destructive" size="sm" onClick={handleDisable} disabled={isLoading}>
               {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
               Disable 2FA
             </Button>
-            <Button variant="ghost" size="sm" onClick={() => { setStep('idle'); setDisableCode(''); }}>Cancel</Button>
+            <Button variant="ghost" size="sm" onClick={() => { setStep('idle'); setDisableCode(''); }}>{t('settings.2fa.cancel')}</Button>
           </div>
         </div>
       )}
@@ -322,21 +328,21 @@ function TwoFactorSection() {
       {/* Regenerate recovery codes */}
       {step === 'regen' && (
         <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
-          <p className="text-sm font-medium text-blue-900">Regenerate Recovery Codes</p>
-          <p className="text-xs text-blue-700">Enter your current TOTP code to generate new recovery codes. Old codes will be invalidated.</p>
+          <p className="text-sm font-medium text-blue-900">{t('settings.2fa.regenTitle')}</p>
+          <p className="text-xs text-blue-700">{t('settings.2fa.regenDescription')}</p>
           <div className="flex gap-2">
             <Input
               value={regenCode}
               onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
-              placeholder="000000"
+              placeholder={t('settings.2fa.codePlaceholder')}
               maxLength={6}
               className="font-mono w-40"
             />
             <Button size="sm" onClick={handleRegen} disabled={isLoading || regenCode.length !== 6}>
               {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
-              Generate New Codes
+              {t('settings.2fa.generateNewCodes')}
             </Button>
-            <Button variant="ghost" size="sm" onClick={() => { setStep('idle'); setRegenCode(''); }}>Cancel</Button>
+            <Button variant="ghost" size="sm" onClick={() => { setStep('idle'); setRegenCode(''); }}>{t('settings.2fa.cancel')}</Button>
           </div>
         </div>
       )}
@@ -344,8 +350,57 @@ function TwoFactorSection() {
   );
 }
 
+/**
+ * Exported sub-component for testability — section-11 Display Language dropdown.
+ * Handles i18next language change + localStorage + tRPC persistence.
+ */
+export function DisplayLanguageDropdown() {
+  const [displayLanguage, setDisplayLanguage] = useState(i18next.language || 'en');
+  const { mutate: updatePrefs } = trpc.users.updatePreferences.useMutation();
+
+  const displayLanguages = SUPPORTED_LANGUAGES.filter(
+    (lng) => lng === 'en' || (LANGUAGE_COVERAGE[lng as SupportedLanguage] ?? 0) >= 50
+  );
+
+  function handleDisplayLangChange(newLng: string) {
+    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(newLng)) return;
+    void i18next.changeLanguage(newLng);
+    try { localStorage.setItem('smartspec_locale', newLng); } catch { /* quota/private mode */ }
+    setDisplayLanguage(newLng);
+    updatePrefs({ translationLanguage: newLng as SupportedLanguage });
+  }
+
+  return (
+    <div>
+      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
+        <Globe className="w-5 h-5" />
+        Display Language
+      </h3>
+      <div>
+        <label className="block text-sm font-medium text-gray-700 mb-2">
+          Choose the language used for the application interface
+        </label>
+        <select
+          value={displayLanguage}
+          onChange={(e) => handleDisplayLangChange(e.target.value)}
+          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
+        >
+          {displayLanguages.map((lng) => (
+            <option key={lng} value={lng}>
+              {LANGUAGE_LABELS[lng as SupportedLanguage]}
+              {lng !== 'en' ? ` (${LANGUAGE_LABELS_EN[lng as SupportedLanguage]})` : ''}
+            </option>
+          ))}
+        </select>
+        <p className="text-xs text-gray-500 mt-1">English is always available as fallback.</p>
+      </div>
+    </div>
+  );
+}
+
 export default function Settings() {
   const { user, isLoading, isAuthenticated, logout } = useAuth();
+  const { t } = useI18n();
   const [, setLocation] = useLocation();
   const search = useSearch();
   const initialTab = (new URLSearchParams(search).get('tab') as SettingsTab) || 'profile';
@@ -383,27 +438,27 @@ export default function Settings() {
     trpc.auth.getRecoveryInfo.useQuery(undefined, { enabled: isAuthenticated });
 
   const sendBackupEmailCodeMut = trpc.auth.sendBackupEmailCode.useMutation({
-    onSuccess: () => { toast.success('Code sent to backup email'); setBackupEmailStep('code_sent'); },
+    onSuccess: () => { toast.success(t('settings.recovery.backupEmailSent')); setBackupEmailStep('code_sent'); },
     onError: (e: any) => toast.error(e.message),
   });
   const verifyBackupEmailMut = trpc.auth.verifyBackupEmail.useMutation({
-    onSuccess: () => { toast.success('Backup email verified!'); setBackupEmailStep('verified'); refetchRecovery(); setBackupEmailCode(''); },
+    onSuccess: () => { toast.success(t('settings.recovery.backupEmailVerified')); setBackupEmailStep('verified'); refetchRecovery(); setBackupEmailCode(''); },
     onError: (e: any) => toast.error(e.message),
   });
   const removeBackupEmailMut = trpc.auth.removeBackupEmail.useMutation({
-    onSuccess: () => { toast.success('Backup email removed'); setBackupEmailStep('idle'); setBackupEmailInput(''); refetchRecovery(); },
+    onSuccess: () => { toast.success(t('settings.recovery.backupEmailRemoved')); setBackupEmailStep('idle'); setBackupEmailInput(''); refetchRecovery(); },
     onError: (e: any) => toast.error(e.message),
   });
   const sendPhoneCodeMut = trpc.auth.sendPhoneCode.useMutation({
-    onSuccess: () => { toast.success('Code sent via SMS'); setPhoneStep('code_sent'); },
+    onSuccess: () => { toast.success(t('settings.recovery.phoneCodeSent')); setPhoneStep('code_sent'); },
     onError: (e: any) => toast.error(e.message),
   });
   const verifyPhoneMut = trpc.auth.verifyPhone.useMutation({
-    onSuccess: () => { toast.success('Phone verified!'); setPhoneStep('verified'); refetchRecovery(); setPhoneCode(''); },
+    onSuccess: () => { toast.success(t('settings.recovery.phoneVerified')); setPhoneStep('verified'); refetchRecovery(); setPhoneCode(''); },
     onError: (e: any) => toast.error(e.message),
   });
   const removePhoneMut = trpc.auth.removePhone.useMutation({
-    onSuccess: () => { toast.success('Phone removed'); setPhoneStep('idle'); setPhoneInput(''); refetchRecovery(); },
+    onSuccess: () => { toast.success(t('settings.recovery.phoneRemoved')); setPhoneStep('idle'); setPhoneInput(''); refetchRecovery(); },
     onError: (e: any) => toast.error(e.message),
   });
 
@@ -418,7 +473,7 @@ export default function Settings() {
 
   const saveContext7Mutation = trpc.systemSettings.saveContext7Key.useMutation({
     onSuccess: () => {
-      toast.success("Context7 API key saved");
+      toast.success(t('settings.context7.saved'));
       setContext7Key('');
       refetchContext7();
     },
@@ -427,7 +482,7 @@ export default function Settings() {
 
   const deleteContext7Mutation = trpc.systemSettings.deleteContext7Key.useMutation({
     onSuccess: () => {
-      toast.success("Context7 API key removed");
+      toast.success(t('settings.context7.removed'));
       refetchContext7();
     },
     onError: (err: any) => toast.error(err.message),
@@ -443,7 +498,10 @@ export default function Settings() {
   const [pushNotifications, setPushNotifications] = useState(false);
   const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
 
-  // Translation preferences
+  // Display language (UI language via i18next)
+  const [displayLanguage, setDisplayLanguage] = useState(i18next.language || 'en');
+
+  // Translation preferences (LLM translation target)
   const [translationLanguage, setTranslationLanguage] = useState('');
   const [translationModel, setTranslationModel] = useState('');
   const [modelSearch, setModelSearch] = useState('');
@@ -467,12 +525,12 @@ export default function Settings() {
     [modelsData?.models],
   );
   const updatePrefsMutation = trpc.users.updatePreferences.useMutation({
-    onSuccess: () => toast.success('Translation preferences saved'),
+    onSuccess: () => toast.success(t('settings.translation.saved')),
     onError: (err: any) => toast.error(err.message),
   });
   const setPrivateVaultPinMutation = trpc.users.setPrivateVaultPin.useMutation({
     onSuccess: () => {
-      toast.success('Private Files PIN saved');
+      toast.success(t('settings.privateVault.pinSaved'));
       clearPrivateVaultAccessToken();
       setPrivateVaultTokenState(null);
       setPrivateVaultCurrentPin('');
@@ -485,7 +543,7 @@ export default function Settings() {
   });
   const disablePrivateVaultMutation = trpc.users.disablePrivateVault.useMutation({
     onSuccess: () => {
-      toast.success('Private Files vault disabled');
+      toast.success(t('settings.privateVault.disabled'));
       clearPrivateVaultAccessToken();
       setPrivateVaultTokenState(null);
       setPrivateVaultCurrentPin('');
@@ -501,7 +559,7 @@ export default function Settings() {
       setPrivateVaultAccessToken(String(result.token));
       setPrivateVaultTokenState(String(result.token));
       setPrivateVaultUnlockPin('');
-      toast.success('Private Files unlocked');
+      toast.success(t('settings.privateVault.unlocked'));
       void refetchPrefs();
     },
     onError: (err: any) => toast.error(err.message),
@@ -562,6 +620,9 @@ export default function Settings() {
     }
 
     setTranslationLanguage(prefsData.translationLanguage || '');
+    if (prefsData.translationLanguage) {
+      setDisplayLanguage(prefsData.translationLanguage);
+    }
     setTranslationModel(
       pickEnabledModelId({
         preferredId: prefsData.translationModel || '',
@@ -615,8 +676,8 @@ export default function Settings() {
 
   if (isLoading) {
     return (
-      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
-        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
+      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 flex items-center justify-center">
+        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
       </div>
     );
   }
@@ -626,17 +687,17 @@ export default function Settings() {
   }
 
   const tabs: Array<{ id: SettingsTab; label: string; icon: any }> = [
-    { id: 'profile', label: 'Profile', icon: User },
-    { id: 'account', label: 'Account', icon: Mail },
-    { id: 'security', label: 'Security', icon: Shield },
-    { id: 'privateVault', label: 'Private Files', icon: Lock },
-    { id: 'preferences', label: 'Preferences', icon: Palette },
-    { id: 'notifications', label: 'Notifications', icon: Bell },
-    { id: 'automation', label: 'Automation', icon: Bot },
-    { id: 'api', label: 'API Keys', icon: Key },
-    { id: 'billing', label: 'Billing', icon: CreditCard },
-    { id: 'integrations', label: 'Integrations', icon: Link2 },
-    { id: 'personas', label: 'Personas', icon: UserCog },
+    { id: 'profile', label: t('settings.tabs.profile'), icon: User },
+    { id: 'account', label: t('settings.tabs.account'), icon: Mail },
+    { id: 'security', label: t('settings.tabs.security'), icon: Shield },
+    { id: 'privateVault', label: t('settings.tabs.privateVault'), icon: Lock },
+    { id: 'preferences', label: t('settings.tabs.preferences'), icon: Palette },
+    { id: 'notifications', label: t('settings.tabs.notifications'), icon: Bell },
+    { id: 'automation', label: t('settings.tabs.automation'), icon: Bot },
+    { id: 'api', label: t('settings.tabs.apiKeys'), icon: Key },
+    { id: 'billing', label: t('settings.tabs.billing'), icon: CreditCard },
+    { id: 'integrations', label: t('settings.tabs.integrations'), icon: Link2 },
+    { id: 'personas', label: t('settings.tabs.personas'), icon: UserCog },
   ];
 
   const handleSave = () => {
@@ -645,7 +706,7 @@ export default function Settings() {
   };
 
   return (
-    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
+    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
       {/* Header */}
       <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
         <div className="px-4 sm:px-6 lg:px-8 py-4">
@@ -658,15 +719,15 @@ export default function Settings() {
                 className="text-gray-600"
               >
                 <ChevronLeft className="w-5 h-5 mr-1" />
-                Back
+                {t('common.back')}
               </Button>
               <div className="flex items-center gap-3">
-                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
+                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center">
                   <SettingsIcon className="w-5 h-5 text-white" />
                 </div>
                 <div>
-                  <h1 className="text-xl font-bold text-gray-900">Settings</h1>
-                  <p className="text-sm text-gray-500">Manage your account settings</p>
+                  <h1 className="text-xl font-bold text-gray-900">{t('settings.title')}</h1>
+                  <p className="text-sm text-gray-500">{t('settings.description')}</p>
                 </div>
                 <HelpButton page="/settings" variant="ghost" size="sm" />
               </div>
@@ -679,7 +740,7 @@ export default function Settings() {
                 className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg"
               >
                 <Check className="w-4 h-4" />
-                <span className="text-sm font-medium">Settings saved</span>
+                <span className="text-sm font-medium">{t('settings.saved')}</span>
               </motion.div>
             )}
           </div>
@@ -694,7 +755,7 @@ export default function Settings() {
             animate={{ opacity: 1, x: 0 }}
             className="lg:col-span-1"
           >
-            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-4">
+            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-blue-500/5 p-4">
               <nav className="flex flex-row overflow-x-auto lg:flex-col lg:overflow-visible gap-1 lg:gap-0 lg:space-y-1 pb-1 lg:pb-0">
                 {tabs.map((tab) => (
                   <button
@@ -702,7 +763,7 @@ export default function Settings() {
                     onClick={() => setActiveTab(tab.id)}
                     className={`flex-shrink-0 lg:w-full flex items-center gap-3 px-3 py-2 lg:px-4 lg:py-3 rounded-xl text-left transition-all ${
                       activeTab === tab.id
-                        ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-700'
+                        ? 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 text-blue-700'
                         : 'text-gray-600 hover:bg-gray-50'
                     }`}
                   >
@@ -716,7 +777,7 @@ export default function Settings() {
                   className="flex-shrink-0 lg:w-full flex items-center gap-3 px-3 py-2 lg:px-4 lg:py-3 rounded-xl text-left transition-all text-gray-600 hover:bg-gray-50"
                 >
                   <Bot className="w-5 h-5" />
-                  <span className="font-medium">Skills</span>
+                  <span className="font-medium">{t('settings.skills')}</span>
                 </button>
               </nav>
             </div>
@@ -729,68 +790,69 @@ export default function Settings() {
             transition={{ delay: 0.1 }}
             className="lg:col-span-3"
           >
-            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-6">
+            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-blue-500/5 p-6">
               {/* Profile Tab */}
               {activeTab === 'profile' && (
                 <div className="space-y-6">
-                  <div>
-                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Profile Information</h2>
-                    <p className="text-gray-600">Update your personal details and profile picture</p>
-                  </div>
+                  <DashboardSectionHeader
+                    eyebrow={t('settings.profile.eyebrow')}
+                    title={t('settings.profile.title')}
+                    description={t('settings.profile.description')}
+                  />
 
                   <div className="flex items-center gap-6 pb-6 border-b border-gray-200">
-                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold">
+                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center text-white text-2xl font-bold">
                       {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                     </div>
                     <div>
                       <Button variant="outline" size="sm" className="mb-2">
                         <Upload className="w-4 h-4 mr-2" />
-                        Upload Photo
+                        {t('settings.profile.uploadPhoto')}
                       </Button>
-                      <p className="text-xs text-gray-500">JPG, PNG or GIF. Max 2MB.</p>
+                      <p className="text-xs text-gray-500">{t('settings.profile.photoHint')}</p>
                     </div>
                   </div>
 
                   <div className="space-y-4">
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">
-                        Full Name
+                        {t('settings.profile.fullName')}
                       </label>
                       <input
                         type="text"
                         value={name}
                         onChange={(e) => setName(e.target.value)}
-                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
+                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                       />
                     </div>
 
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">
-                        Email Address
+                        {t('settings.profile.emailAddress')}
                       </label>
                       <input
                         type="email"
                         value={email}
                         onChange={(e) => setEmail(e.target.value)}
-                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
+                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                       />
                     </div>
 
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">
-                        Bio
+                        {t('settings.profile.bio')}
                       </label>
                       <textarea
                         rows={4}
-                        placeholder="Tell us about yourself..."
-                        className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
+                        placeholder={t('settings.profile.bioPlaceholder')}
+                        className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                       />
                     </div>
                   </div>
 
-                  <Button onClick={handleSave} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
+                  <Button onClick={handleSave} className="bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white">
                     <Save className="w-4 h-4 mr-2" />
-                    Save Changes
+                    {t('common.saveChanges')}
                   </Button>
                 </div>
               )}
@@ -798,10 +860,11 @@ export default function Settings() {
               {/* Account Tab */}
               {activeTab === 'account' && (
                 <div className="space-y-6">
-                  <div>
-                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Settings</h2>
-                    <p className="text-gray-600">Manage your account preferences</p>
-                  </div>
+                  <DashboardSectionHeader
+                    eyebrow={t('settings.account.eyebrow')}
+                    title={t('settings.account.title')}
+                    description={t('settings.account.description')}
+                  />
 
                   <div className="space-y-4">
                     <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
@@ -810,7 +873,7 @@ export default function Settings() {
                           <Mail className="w-5 h-5 text-blue-600" />
                         </div>
                         <div>
-                          <div className="font-medium text-gray-900">Email Verified</div>
+                          <div className="font-medium text-gray-900">{t('settings.account.emailVerified')}</div>
                           <div className="text-sm text-gray-500">{user.email}</div>
                         </div>
                       </div>
@@ -819,15 +882,15 @@ export default function Settings() {
 
                     <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                       <div className="flex items-center gap-3">
-                        <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
-                          <CreditCard className="w-5 h-5 text-purple-600" />
+                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
+                          <CreditCard className="w-5 h-5 text-blue-600" />
                         </div>
                         <div>
-                          <div className="font-medium text-gray-900">Current Plan</div>
+                          <div className="font-medium text-gray-900">{t('settings.account.currentPlan')}</div>
                           <div className="text-sm text-gray-500">{user.plan.toUpperCase()}</div>
                         </div>
                       </div>
-                      <Button variant="outline" size="sm">Upgrade</Button>
+                      <Button variant="outline" size="sm">{t('settings.account.upgrade')}</Button>
                     </div>
 
                     <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
@@ -836,11 +899,11 @@ export default function Settings() {
                           <Globe className="w-5 h-5 text-green-600" />
                         </div>
                         <div>
-                          <div className="font-medium text-gray-900">Language</div>
-                          <div className="text-sm text-gray-500">English (US)</div>
+                          <div className="font-medium text-gray-900">{t('settings.account.language')}</div>
+                          <div className="text-sm text-gray-500">{t('settings.account.languageValue')}</div>
                         </div>
                       </div>
-                      <Button variant="outline" size="sm">Change</Button>
+                      <Button variant="outline" size="sm">{t('common.change')}</Button>
                     </div>
                   </div>
 
@@ -849,7 +912,7 @@ export default function Settings() {
                       <div className="flex items-start gap-3">
                         <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                         <div className="flex-1">
-                          <h3 className="font-semibold text-red-900 mb-1">Delete Account</h3>
+                          <h3 className="font-semibold text-red-900 mb-1">{t('settings.account.deleteAccount')}</h3>
                           <p className="text-sm text-red-700 mb-3">
                             Permanently delete your account and all associated data. This action cannot be undone.
                           </p>
@@ -863,7 +926,7 @@ export default function Settings() {
                             }}
                           >
                             <Trash2 className="w-4 h-4 mr-2" />
-                            Delete Account
+                            {t('settings.account.deleteAccount')}
                           </Button>
                         </div>
                       </div>
@@ -875,22 +938,23 @@ export default function Settings() {
               {/* Security Tab */}
               {activeTab === 'security' && (
                 <div className="space-y-6">
-                  <div>
-                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Security Settings</h2>
-                    <p className="text-gray-600">Manage your password and security preferences</p>
-                  </div>
+                  <DashboardSectionHeader
+                    eyebrow={t('settings.security.eyebrow')}
+                    title={t('settings.security.title')}
+                    description={t('settings.security.description')}
+                  />
 
                   <div className="space-y-4">
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">
-                        Current Password
+                        {t('settings.security.currentPassword')}
                       </label>
                       <div className="relative">
                         <input
                           type={showPassword ? 'text' : 'password'}
                           value={currentPassword}
                           onChange={(e) => setCurrentPassword(e.target.value)}
-                          className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
+                          className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                         />
                         <button
                           onClick={() => setShowPassword(!showPassword)}
@@ -903,13 +967,13 @@ export default function Settings() {
 
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">
-                        New Password
+                        {t('settings.security.newPassword')}
                       </label>
                       <input
                         type="password"
                         value={newPassword}
                         onChange={(e) => setNewPassword(e.target.value)}
-                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
+                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                       />
                     </div>
 
@@ -921,27 +985,27 @@ export default function Settings() {
                         type="password"
                         value={confirmPassword}
                         onChange={(e) => setConfirmPassword(e.target.value)}
-                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
+                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                       />
                     </div>
                   </div>
 
-                  <Button onClick={handleSave} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
+                  <Button onClick={handleSave} className="bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white">
                     <Lock className="w-4 h-4 mr-2" />
-                    Update Password
+                    {t('settings.security.updatePassword')}
                   </Button>
 
                   {/* Recovery Email */}
                   <div className="pt-6 border-t border-gray-200">
-                    <h3 className="font-semibold text-gray-900 mb-1">Recovery Email</h3>
-                    <p className="text-sm text-gray-500 mb-4">Add a backup email for password recovery</p>
+                    <h3 className="font-semibold text-gray-900 mb-1">{t('settings.recovery.emailTitle')}</h3>
+                    <p className="text-sm text-gray-500 mb-4">{t('settings.recovery.emailDescription')}</p>
 
                     {recoveryInfo?.backupEmailVerified ? (
                       <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                         <div className="flex items-center gap-2">
                           <Mail className="w-4 h-4 text-green-600" />
                           <span className="text-sm text-green-800 font-medium">{recoveryInfo.backupEmail}</span>
-                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">Verified</Badge>
+                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">{t('settings.recovery.verified')}</Badge>
                         </div>
                         <Button
                           variant="outline"
@@ -950,7 +1014,7 @@ export default function Settings() {
                           disabled={removeBackupEmailMut.isPending}
                           className="text-red-600 border-red-200 hover:bg-red-50"
                         >
-                          <Trash2 className="w-3 h-3 mr-1" /> Remove
+                          <Trash2 className="w-3 h-3 mr-1" /> {t('settings.recovery.remove')}
                         </Button>
                       </div>
                     ) : (
@@ -958,7 +1022,7 @@ export default function Settings() {
                         <div className="flex gap-2">
                           <Input
                             type="email"
-                            placeholder="backup@example.com"
+                            placeholder={t('settings.recovery.emailPlaceholder')}
                             value={backupEmailInput}
                             onChange={(e) => setBackupEmailInput(e.target.value)}
                             className="flex-1"
@@ -969,13 +1033,13 @@ export default function Settings() {
                             onClick={() => sendBackupEmailCodeMut.mutate({ backupEmail: backupEmailInput })}
                             disabled={!backupEmailInput || sendBackupEmailCodeMut.isPending || backupEmailStep === 'code_sent'}
                           >
-                            {sendBackupEmailCodeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Code'}
+                            {sendBackupEmailCodeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.recovery.sendCode')}
                           </Button>
                         </div>
                         {backupEmailStep === 'code_sent' && (
                           <div className="flex gap-2">
                             <Input
-                              placeholder="6-digit code"
+                              placeholder={t('settings.recovery.codePlaceholder')}
                               maxLength={6}
                               value={backupEmailCode}
                               onChange={(e) => setBackupEmailCode(e.target.value.replace(/\D/g, ''))}
@@ -984,16 +1048,16 @@ export default function Settings() {
                             <Button
                               onClick={() => verifyBackupEmailMut.mutate({ code: backupEmailCode })}
                               disabled={backupEmailCode.length !== 6 || verifyBackupEmailMut.isPending}
-                              className="bg-purple-600 hover:bg-purple-700 text-white"
+                              className="bg-blue-600 hover:bg-blue-700 text-white"
                             >
-                              {verifyBackupEmailMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
+                              {verifyBackupEmailMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.recovery.verify')}
                             </Button>
                             <Button
                               variant="ghost"
                               size="sm"
                               onClick={() => { setBackupEmailStep('idle'); setBackupEmailCode(''); }}
                             >
-                              Cancel
+                              {t('settings.recovery.cancel')}
                             </Button>
                           </div>
                         )}
@@ -1003,15 +1067,15 @@ export default function Settings() {
 
                   {/* Recovery Phone */}
                   <div className="pt-6 border-t border-gray-200">
-                    <h3 className="font-semibold text-gray-900 mb-1">Recovery Phone</h3>
-                    <p className="text-sm text-gray-500 mb-4">Add a phone number for SMS-based password recovery (E.164 format: +66812345678)</p>
+                    <h3 className="font-semibold text-gray-900 mb-1">{t('settings.recovery.phoneTitle')}</h3>
+                    <p className="text-sm text-gray-500 mb-4">{t('settings.recovery.phoneDescription')}</p>
 
                     {recoveryInfo?.phoneVerified ? (
                       <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                         <div className="flex items-center gap-2">
                           <Phone className="w-4 h-4 text-green-600" />
                           <span className="text-sm text-green-800 font-medium">{recoveryInfo.phone}</span>
-                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">Verified</Badge>
+                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">{t('settings.recovery.verified')}</Badge>
                         </div>
                         <Button
                           variant="outline"
@@ -1020,7 +1084,7 @@ export default function Settings() {
                           disabled={removePhoneMut.isPending}
                           className="text-red-600 border-red-200 hover:bg-red-50"
                         >
-                          <Trash2 className="w-3 h-3 mr-1" /> Remove
+                          <Trash2 className="w-3 h-3 mr-1" /> {t('settings.recovery.remove')}
                         </Button>
                       </div>
                     ) : (
@@ -1028,7 +1092,7 @@ export default function Settings() {
                         <div className="flex gap-2">
                           <Input
                             type="tel"
-                            placeholder="+66812345678"
+                            placeholder={t('settings.recovery.phonePlaceholder')}
                             value={phoneInput}
                             onChange={(e) => setPhoneInput(e.target.value)}
                             className="flex-1"
@@ -1039,13 +1103,13 @@ export default function Settings() {
                             onClick={() => sendPhoneCodeMut.mutate({ phone: phoneInput })}
                             disabled={!phoneInput || sendPhoneCodeMut.isPending || phoneStep === 'code_sent'}
                           >
-                            {sendPhoneCodeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Code'}
+                            {sendPhoneCodeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.recovery.sendCode')}
                           </Button>
                         </div>
                         {phoneStep === 'code_sent' && (
                           <div className="flex gap-2">
                             <Input
-                              placeholder="6-digit code"
+                              placeholder={t('settings.recovery.codePlaceholder')}
                               maxLength={6}
                               value={phoneCode}
                               onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
@@ -1054,16 +1118,16 @@ export default function Settings() {
                             <Button
                               onClick={() => verifyPhoneMut.mutate({ code: phoneCode })}
                               disabled={phoneCode.length !== 6 || verifyPhoneMut.isPending}
-                              className="bg-purple-600 hover:bg-purple-700 text-white"
+                              className="bg-blue-600 hover:bg-blue-700 text-white"
                             >
-                              {verifyPhoneMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
+                              {verifyPhoneMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.recovery.verify')}
                             </Button>
                             <Button
                               variant="ghost"
                               size="sm"
                               onClick={() => { setPhoneStep('idle'); setPhoneCode(''); }}
                             >
-                              Cancel
+                              {t('settings.recovery.cancel')}
                             </Button>
                           </div>
                         )}
@@ -1078,16 +1142,15 @@ export default function Settings() {
               {/* Private Vault Tab */}
               {activeTab === 'privateVault' && (
                 <div className="space-y-6">
-                  <div>
-                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Private Files Vault</h2>
-                    <p className="text-gray-600">
-                      Keep personal files separate from work documents. Uploads in this area still go through the same RAG pipeline and can later power OCR, bill tracking, and personal records.
-                    </p>
-                  </div>
+                  <DashboardSectionHeader
+                    eyebrow={t('settings.privateVault.eyebrow')}
+                    title={t('settings.privateVault.title')}
+                    description={t('settings.privateVault.description')}
+                  />
 
                   {prefsLoading ? (
                     <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
-                      Loading vault settings...
+                      {t('settings.privateVault.loading')}
                     </div>
                   ) : null}
 
@@ -1095,11 +1158,11 @@ export default function Settings() {
                     <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5">
                       <div className="flex items-start justify-between gap-3">
                         <div>
-                          <h3 className="text-lg font-semibold text-gray-900">Vault status</h3>
+                      <h3 className="text-lg font-semibold text-gray-900">{t('settings.privateVault.statusTitle')}</h3>
                           <p className="text-sm text-gray-600">
                             {privateVaultConfigured
-                              ? "The vault is configured for this account."
-                              : "No private vault PIN has been set yet."}
+                              ? t('settings.privateVault.configured')
+                              : t('settings.privateVault.notConfigured')}
                           </p>
                         </div>
                         <Badge
@@ -1112,9 +1175,9 @@ export default function Settings() {
                         >
                           {privateVaultConfigured
                             ? privateVaultUnlocked
-                              ? "Unlocked"
-                              : "Locked"
-                            : "Not configured"}
+                              ? t('settings.privateVault.unlocked')
+                              : t('settings.privateVault.locked')
+                            : t('settings.privateVault.notConfigured')}
                         </Badge>
                       </div>
 
@@ -1129,25 +1192,25 @@ export default function Settings() {
 
                       {privateVaultUnlocked ? (
                         <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
-                          This browser is currently unlocked for Private Files.
+                          {t('settings.privateVault.browserUnlocked')}
                         </div>
                       ) : (
                         <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
-                          Unlock this vault in the section on the right, or create a PIN below if this is your first time setting it up.
+                          {t('settings.privateVault.unlockHint')}
                         </div>
                       )}
                     </div>
 
                     <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
-                      <h3 className="text-lg font-semibold text-gray-900 mb-1">Unlock vault</h3>
+                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('settings.privateVault.unlockTitle')}</h3>
                       <p className="text-sm text-gray-600 mb-4">
-                        Enter your vault PIN to unlock the Private Files area in this browser session.
+                        {t('settings.privateVault.unlockDescription')}
                       </p>
                       <div className="flex gap-2">
                         <Input
                           type="password"
                           inputMode="numeric"
-                          placeholder="PIN code"
+                          placeholder={t('settings.privateVault.pinPlaceholder')}
                           value={privateVaultUnlockPin}
                           onChange={(event) => setPrivateVaultUnlockPin(event.target.value.replace(/\s+/g, ""))}
                           className="flex-1"
@@ -1156,7 +1219,7 @@ export default function Settings() {
                           onClick={() => {
                             const pin = privateVaultUnlockPin.trim();
                             if (!pin) {
-                              toast.error('Enter your vault PIN');
+                              toast.error(t('settings.privateVault.enterPin'));
                               return;
                             }
                             unlockPrivateVaultMutation.mutate({ pin });
@@ -1165,40 +1228,40 @@ export default function Settings() {
                           className="bg-amber-600 hover:bg-amber-700 text-white"
                         >
                           {unlockPrivateVaultMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
-                          Unlock
+                          {t('settings.privateVault.unlock')}
                         </Button>
                       </div>
                       {!privateVaultConfigured ? (
                         <div className="mt-3 text-xs text-gray-500">
-                          Set a PIN in the section below to activate Private Files for your account.
+                          {t('settings.privateVault.setupHint')}
                         </div>
                       ) : null}
                     </div>
 
                     <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm xl:col-span-2">
-                      <h3 className="text-lg font-semibold text-gray-900 mb-1">Set or change PIN</h3>
+                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('settings.privateVault.setPinTitle')}</h3>
                       <p className="text-sm text-gray-600 mb-4">
-                        Use a 4-12 digit PIN. If a PIN already exists, the current PIN is required to change it.
+                        {t('settings.privateVault.setPinDescription')}
                       </p>
                       <div className="grid gap-3 md:grid-cols-3">
                         <Input
                           type="password"
                           inputMode="numeric"
-                          placeholder={privateVaultConfigured ? "Current PIN" : "Current PIN (optional)"}
+                          placeholder={privateVaultConfigured ? t('settings.privateVault.currentPin') : t('settings.privateVault.currentPinOptional')}
                           value={privateVaultCurrentPin}
                           onChange={(event) => setPrivateVaultCurrentPin(event.target.value.replace(/\s+/g, ""))}
                         />
                         <Input
                           type="password"
                           inputMode="numeric"
-                          placeholder="New PIN"
+                          placeholder={t('settings.privateVault.newPin')}
                           value={privateVaultNewPin}
                           onChange={(event) => setPrivateVaultNewPin(event.target.value.replace(/\s+/g, ""))}
                         />
                         <Input
                           type="password"
                           inputMode="numeric"
-                          placeholder="Confirm PIN"
+                          placeholder={t('settings.privateVault.confirmPin')}
                           value={privateVaultConfirmPin}
                           onChange={(event) => setPrivateVaultConfirmPin(event.target.value.replace(/\s+/g, ""))}
                         />
@@ -1210,11 +1273,11 @@ export default function Settings() {
                             const confirmPin = privateVaultConfirmPin.trim();
                             const currentPin = privateVaultCurrentPin.trim();
                             if (!newPin || !confirmPin) {
-                              toast.error('Enter and confirm your new PIN');
+                              toast.error(t('settings.privateVault.enterNewPin'));
                               return;
                             }
                             if (newPin !== confirmPin) {
-                              toast.error('PIN codes do not match');
+                              toast.error(t('settings.privateVault.pinMismatch'));
                               return;
                             }
                             setPrivateVaultPinMutation.mutate({
@@ -1224,10 +1287,10 @@ export default function Settings() {
                             });
                           }}
                           disabled={setPrivateVaultPinMutation.isPending || !privateVaultNewPin.trim() || !privateVaultConfirmPin.trim()}
-                          className="bg-purple-600 hover:bg-purple-700 text-white"
+                          className="bg-blue-600 hover:bg-blue-700 text-white"
                         >
                           {setPrivateVaultPinMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
-                          Save PIN
+                          {t('settings.privateVault.savePin')}
                         </Button>
                         <Button
                           variant="outline"
@@ -1238,21 +1301,21 @@ export default function Settings() {
                             setPrivateVaultConfirmPin('');
                           }}
                         >
-                          Clear
+                          {t('common.clear')}
                         </Button>
                       </div>
                     </div>
 
                     <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5 xl:col-span-2">
-                      <h3 className="text-lg font-semibold text-red-900 mb-1">Disable vault</h3>
+                      <h3 className="text-lg font-semibold text-red-900 mb-1">{t('settings.privateVault.disableTitle')}</h3>
                       <p className="text-sm text-red-700 mb-4">
-                        Turning this off hides Private Files until the vault is set up again. This does not delete your files.
+                        {t('settings.privateVault.disableDescription')}
                       </p>
                       <div className="flex gap-2">
                         <Input
                           type="password"
                           inputMode="numeric"
-                          placeholder="Current PIN"
+                          placeholder={t('settings.privateVault.currentPin')}
                           value={privateVaultDisablePin}
                           onChange={(event) => setPrivateVaultDisablePin(event.target.value.replace(/\s+/g, ""))}
                           className="flex-1"
@@ -1262,7 +1325,7 @@ export default function Settings() {
                           onClick={() => {
                             const currentPin = privateVaultDisablePin.trim();
                             if (!currentPin) {
-                              toast.error('Enter your current PIN');
+                              toast.error(t('settings.privateVault.enterCurrentPin'));
                               return;
                             }
                             disablePrivateVaultMutation.mutate({ currentPin });
@@ -1270,7 +1333,7 @@ export default function Settings() {
                           disabled={disablePrivateVaultMutation.isPending || !privateVaultDisablePin.trim()}
                         >
                           {disablePrivateVaultMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
-                          Disable
+                          {t('settings.privateVault.disable')}
                         </Button>
                       </div>
                     </div>
@@ -1281,27 +1344,28 @@ export default function Settings() {
               {/* Preferences Tab */}
               {activeTab === 'preferences' && (
                 <div className="space-y-6">
-                  <div>
-                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Preferences</h2>
-                    <p className="text-gray-600">Customize your experience</p>
-                  </div>
+                  <DashboardSectionHeader
+                    eyebrow={t('settings.preferences.eyebrow')}
+                    title={t('settings.preferences.title')}
+                    description={t('settings.preferences.description')}
+                  />
 
                   <div className="space-y-6">
                     <div>
-                      <h3 className="font-semibold text-gray-900 mb-4">Notifications</h3>
+                      <h3 className="font-semibold text-gray-900 mb-4">{t('settings.preferences.notifications')}</h3>
                       <div className="space-y-3">
                         <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                           <div className="flex items-center gap-3">
                             <Bell className="w-5 h-5 text-gray-600" />
                             <div>
-                              <div className="font-medium text-gray-900">Email Notifications</div>
-                              <div className="text-sm text-gray-500">Receive updates via email</div>
+                              <div className="font-medium text-gray-900">{t('settings.preferences.emailNotifications')}</div>
+                              <div className="text-sm text-gray-500">{t('settings.preferences.emailNotificationsDesc')}</div>
                             </div>
                           </div>
                           <button
                             onClick={() => setEmailNotifications(!emailNotifications)}
                             className={`relative w-12 h-6 rounded-full transition-colors ${
-                              emailNotifications ? 'bg-purple-500' : 'bg-gray-300'
+                              emailNotifications ? 'bg-blue-500' : 'bg-gray-300'
                             }`}
                           >
                             <div
@@ -1316,14 +1380,14 @@ export default function Settings() {
                           <div className="flex items-center gap-3">
                             <Bell className="w-5 h-5 text-gray-600" />
                             <div>
-                              <div className="font-medium text-gray-900">Push Notifications</div>
-                              <div className="text-sm text-gray-500">Receive push notifications</div>
+                              <div className="font-medium text-gray-900">{t('settings.preferences.pushNotifications')}</div>
+                              <div className="text-sm text-gray-500">{t('settings.preferences.pushNotificationsDesc')}</div>
                             </div>
                           </div>
                           <button
                             onClick={() => setPushNotifications(!pushNotifications)}
                             className={`relative w-12 h-6 rounded-full transition-colors ${
-                              pushNotifications ? 'bg-purple-500' : 'bg-gray-300'
+                              pushNotifications ? 'bg-blue-500' : 'bg-gray-300'
                             }`}
                           >
                             <div
@@ -1340,23 +1404,21 @@ export default function Settings() {
                     <div>
                       <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                         <Send className="w-5 h-5" />
-                        Telegram Notifications
+                        {t('settings.preferences.telegramNotifications')}
                       </h3>
 
                       {telegramState === 'idle' && (
                         <div className="space-y-4">
-                          <p className="text-sm text-gray-600">
-                            Link your Telegram account to receive instant alerts for important notifications.
-                          </p>
+                          <p className="text-sm text-gray-600">{t('settings.preferences.telegramIntro')}</p>
                           <Button
                             onClick={() => generateLinkMutation.mutate()}
                             disabled={generateLinkMutation.isPending}
-                            className="bg-purple-600 hover:bg-purple-700"
+                            className="bg-blue-600 hover:bg-blue-700"
                           >
                             {generateLinkMutation.isPending ? (
-                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
+                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('settings.preferences.generating')}</>
                             ) : (
-                              <><Send className="w-4 h-4 mr-2" /> Link Telegram Account</>
+                              <><Send className="w-4 h-4 mr-2" /> {t('settings.preferences.linkTelegram')}</>
                             )}
                           </Button>
                         </div>
@@ -1366,10 +1428,10 @@ export default function Settings() {
                         <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                           <div className="flex items-center gap-2 text-blue-800 font-medium">
                             <Loader2 className="w-4 h-4 animate-spin" />
-                            Waiting for verification...
+                            {t('settings.preferences.waitingVerification')}
                           </div>
                           <div className="space-y-2">
-                            <p className="text-sm text-blue-700">Click the link below to verify your account in Telegram:</p>
+                            <p className="text-sm text-blue-700">{t('settings.preferences.telegramVerifyHint')}</p>
                             <a
                               href={telegramLink}
                               target="_blank"
@@ -1378,14 +1440,14 @@ export default function Settings() {
                             >
                               {telegramLink}
                             </a>
-                            <p className="text-xs text-blue-600">This link expires in 5 minutes. Checking every 3 seconds...</p>
+                            <p className="text-xs text-blue-600">{t('settings.preferences.telegramLinkExpiry')}</p>
                           </div>
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => { setTelegramState('idle'); setTelegramLink(''); }}
                           >
-                            Cancel
+                            {t('settings.recovery.cancel')}
                           </Button>
                         </div>
                       )}
@@ -1395,9 +1457,9 @@ export default function Settings() {
                           <div className="flex items-center gap-2 p-4 bg-green-50 rounded-xl border border-green-200">
                             <Check className="w-5 h-5 text-green-600" />
                             <div>
-                              <div className="font-medium text-green-900">Connected</div>
+                              <div className="font-medium text-green-900">{t('settings.preferences.connected')}</div>
                               <div className="text-sm text-green-700">
-                                {telegramStatus.data.username || 'Telegram account linked'}
+                                {telegramStatus.data.username || t('settings.preferences.telegramLinked')}
                               </div>
                             </div>
                           </div>
@@ -1405,9 +1467,9 @@ export default function Settings() {
                           {telegramStatus.data.connection && (
                             <div className="text-xs text-gray-500 space-y-1 mt-2">
                               {telegramStatus.data.connection.telegramUsername && (
-                                <div>Connected as: @{telegramStatus.data.connection.telegramUsername}</div>
+                                <div>{t('settings.preferences.connectedAs', { username: telegramStatus.data.connection.telegramUsername })}</div>
                               )}
-                              <div>Linked: {new Date(telegramStatus.data.connection.linkedAt).toLocaleDateString()}</div>
+                              <div>{t('settings.preferences.linkedAt', { date: new Date(telegramStatus.data.connection.linkedAt).toLocaleDateString() })}</div>
                               {(telegramStatus.data.boundConversationCount ?? 0) > 0 && (
                                 <Badge variant="secondary" className="text-xs">
                                   {telegramStatus.data.boundConversationCount} conversation{telegramStatus.data.boundConversationCount !== 1 ? 's' : ''} bridged
@@ -1426,25 +1488,25 @@ export default function Settings() {
                           )}
 
                           <div>
-                            <label className="block text-sm font-medium text-gray-700 mb-2">
-                              Notification Level
+                          <label className="block text-sm font-medium text-gray-700 mb-2">
+                          {t('settings.preferences.notificationLevel')}
                             </label>
                             <select
                               value={telegramStatus.data.notifyLevel}
                               onChange={(e) => updateTelegramPrefsMutation.mutate({ notifyLevel: e.target.value as any })}
                               className="w-full p-2 border border-gray-300 rounded-lg"
                             >
-                              <option value="all">All Notifications</option>
-                              <option value="high_critical">High + Critical Only</option>
-                              <option value="critical_only">Critical Only</option>
-                              <option value="off">Off</option>
+                              <option value="all">{t('settings.preferences.notify.all')}</option>
+                              <option value="high_critical">{t('settings.preferences.notify.highCritical')}</option>
+                              <option value="critical_only">{t('settings.preferences.notify.criticalOnly')}</option>
+                              <option value="off">{t('settings.preferences.notify.off')}</option>
                             </select>
                           </div>
 
                           <Button
                             variant="outline"
                             onClick={() => {
-                              if (confirm('Are you sure you want to unlink your Telegram account?')) {
+                                if (confirm(t('settings.preferences.unlinkConfirm'))) {
                                 unlinkMutation.mutate();
                               }
                             }}
@@ -1452,9 +1514,9 @@ export default function Settings() {
                             className="text-red-600 border-red-300 hover:bg-red-50"
                           >
                             {unlinkMutation.isPending ? (
-                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Unlinking...</>
+                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('settings.preferences.unlinking')}</>
                             ) : (
-                              <><X className="w-4 h-4 mr-2" /> Unlink Account</>
+                              <><X className="w-4 h-4 mr-2" /> {t('settings.preferences.unlinkTelegram')}</>
                             )}
                           </Button>
                         </div>
@@ -1462,7 +1524,7 @@ export default function Settings() {
                     </div>
 
                     <div>
-                      <h3 className="font-semibold text-gray-900 mb-4">Appearance</h3>
+                      <h3 className="font-semibold text-gray-900 mb-4">{t('settings.preferences.appearance')}</h3>
                       <div className="grid grid-cols-3 gap-3">
                         {(['light', 'dark', 'system'] as const).map((themeOption) => (
                           <button
@@ -1470,7 +1532,7 @@ export default function Settings() {
                             onClick={() => setTheme(themeOption)}
                             className={`p-4 border-2 rounded-xl text-center transition-all ${
                               theme === themeOption
-                                ? 'border-purple-500 bg-purple-50'
+                                ? 'border-blue-500 bg-blue-50'
                                 : 'border-gray-200 hover:border-gray-300'
                             }`}
                           >
@@ -1481,6 +1543,9 @@ export default function Settings() {
                     </div>
                   </div>
 
+                  {/* Display Language */}
+                  <DisplayLanguageDropdown />
+
                   {/* Translation */}
                   <div>
                     <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
@@ -1489,40 +1554,26 @@ export default function Settings() {
                     </h3>
                     <div className="space-y-4">
                       <div>
-                        <label className="block text-sm font-medium text-gray-700 mb-2">
-                          Translation Language
+                          <label className="block text-sm font-medium text-gray-700 mb-2">
+                          {t('settings.translation.language')}
                         </label>
                         <select
                           value={translationLanguage}
                           onChange={(e) => setTranslationLanguage(e.target.value)}
-                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
+                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                         >
-                          <option value="">Select language...</option>
-                          <option value="th">Thai</option>
-                          <option value="zh">Chinese (Simplified)</option>
-                          <option value="zh-TW">Chinese (Traditional)</option>
-                          <option value="ja">Japanese</option>
-                          <option value="ko">Korean</option>
-                          <option value="fr">French</option>
-                          <option value="es">Spanish</option>
-                          <option value="de">German</option>
-                          <option value="pt">Portuguese</option>
-                          <option value="ar">Arabic</option>
-                          <option value="ru">Russian</option>
-                          <option value="hi">Hindi</option>
-                          <option value="vi">Vietnamese</option>
-                          <option value="id">Indonesian</option>
-                          <option value="it">Italian</option>
-                          <option value="nl">Dutch</option>
-                          <option value="pl">Polish</option>
-                          <option value="tr">Turkish</option>
-                          <option value="sv">Swedish</option>
+                          <option value="">{t('settings.translation.selectLanguage')}</option>
+                          {SUPPORTED_LANGUAGES.filter((lng) => lng !== 'en').map((lng) => (
+                            <option key={lng} value={lng}>
+                              {LANGUAGE_LABELS_EN[lng as SupportedLanguage]}
+                            </option>
+                          ))}
                         </select>
                       </div>
 
                       <div>
-                        <label className="block text-sm font-medium text-gray-700 mb-2">
-                          Translation Model
+                          <label className="block text-sm font-medium text-gray-700 mb-2">
+                          {t('settings.translation.model')}
                         </label>
                         <div className="relative">
                           <button
@@ -1542,10 +1593,10 @@ export default function Settings() {
                                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                   <input
                                     type="text"
-                                    placeholder="Search models..."
+                                    placeholder={t('settings.translation.searchModels')}
                                     value={modelSearch}
                                     onChange={(e) => setModelSearch(e.target.value)}
-                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
+                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                     autoFocus
                                   />
                                 </div>
@@ -1562,8 +1613,8 @@ export default function Settings() {
                                         setShowModelPicker(false);
                                         setModelSearch('');
                                       }}
-                                      className={`w-full px-4 py-2 text-left text-sm hover:bg-purple-50 flex items-center justify-between ${
-                                        translationModel === m.id ? 'bg-purple-50 text-purple-700' : 'text-gray-700'
+                                      className={`w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center justify-between ${
+                                        translationModel === m.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                                       }`}
                                     >
                                       <div>
@@ -1572,7 +1623,7 @@ export default function Settings() {
                                           <div className="text-xs text-gray-400">{m.providerDisplayName}</div>
                                         )}
                                       </div>
-                                      {translationModel === m.id && <Check className="w-4 h-4 text-purple-500" />}
+                                      {translationModel === m.id && <Check className="w-4 h-4 text-blue-500" />}
                                     </button>
                                   ))}
                               </div>
@@ -1589,31 +1640,30 @@ export default function Settings() {
                   <Button
                     onClick={() => {
                       updatePrefsMutation.mutate({
-                        translationLanguage: translationLanguage || undefined,
+                        translationLanguage: translationLanguage ? (translationLanguage as any) : undefined,
                         translationModel: translationModel || undefined,
                       });
                     }}
                     disabled={updatePrefsMutation.isPending}
-                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
+                    className="bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white"
                   >
                     {updatePrefsMutation.isPending ? (
                       <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                     ) : (
                       <Save className="w-4 h-4 mr-2" />
                     )}
-                    Save Preferences
+                    {t('settings.translation.savePreferences')}
                   </Button>
                 </div>
               )}
 
               {activeTab === 'automation' && (
                 <div className="space-y-6">
-                  <div>
-                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Automation Policy</h2>
-                    <p className="text-gray-600">
-                      Manage only your own automation restrictions here. Tenant-wide browser policy is configured separately by administrators.
-                    </p>
-                  </div>
+                  <DashboardSectionHeader
+                    eyebrow={t('settings.automation.eyebrow')}
+                    title={t('settings.automation.title')}
+                    description={t('settings.automation.description')}
+                  />
 
                   <UserAutomationPreferencesPanel />
 
@@ -1622,13 +1672,13 @@ export default function Settings() {
                       <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                         <div>
                           <div className="flex flex-wrap items-center gap-2">
-                            <h3 className="text-base font-semibold text-sky-950">Tenant-wide policy is managed separately</h3>
+                            <h3 className="text-base font-semibold text-sky-950">{t('settings.automation.tenantPolicyTitle')}</h3>
                             <Badge variant="outline" className="border-sky-300 bg-white text-sky-800">
-                              Admin only
+                              {t('settings.automation.adminOnly')}
                             </Badge>
                           </div>
                           <p className="mt-1 text-sm text-sky-900">
-                            This page is reserved for personal user preferences. Tenant-wide automation policy now lives in Admin Settings to avoid mixing user and tenant scope.
+                            {t('settings.automation.tenantPolicyDescription')}
                           </p>
                         </div>
                         <Button
@@ -1636,7 +1686,7 @@ export default function Settings() {
                           className="border-sky-300 bg-white text-sky-900 hover:bg-sky-100"
                           onClick={() => setLocation('/admin/settings')}
                         >
-                          Open Admin Settings
+                          {t('settings.automation.openAdminSettings')}
                         </Button>
                       </div>
                     </div>
@@ -1655,18 +1705,18 @@ export default function Settings() {
                   {/* Context7 API Key */}
                   <div className="border-t border-gray-200 pt-6 mt-6">
                     <div className="flex items-center gap-3 mb-2">
-                      <h3 className="text-lg font-semibold text-gray-900">Context7 API Key</h3>
+                      <h3 className="text-lg font-semibold text-gray-900">{t('settings.context7.title')}</h3>
                       {context7Data?.configured && (
                         <Badge variant="outline" className="text-green-600 border-green-600">
                           <Check className="w-3 h-3 mr-1" />
-                          Configured
+                          {t('settings.context7.configured')}
                         </Badge>
                       )}
                     </div>
                     <p className="text-sm text-gray-500 mb-4">
-                      Your personal Context7 API key for fetching up-to-date library documentation in chat.
-                      Get a free key at{' '}
-                      <a href="https://context7.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">
+                      {t('settings.context7.description')}{' '}
+                      {t('settings.context7.getFreeKeyAt')} {' '}
+                      <a href="https://context7.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                         context7.com/dashboard
                       </a>
                     </p>
@@ -1690,7 +1740,7 @@ export default function Settings() {
                       <div className="relative flex-1">
                         <Input
                           type={showContext7Key ? "text" : "password"}
-                          placeholder={context7Data?.configured ? "Enter new key to update..." : "Enter your Context7 API key"}
+                          placeholder={context7Data?.configured ? t('settings.context7.updatePlaceholder') : t('settings.context7.enterPlaceholder')}
                           value={context7Key}
                           onChange={(e) => setContext7Key(e.target.value)}
                         />
@@ -1705,7 +1755,7 @@ export default function Settings() {
                       <Button
                         onClick={() => saveContext7Mutation.mutate({ apiKey: context7Key })}
                         disabled={!context7Key.trim() || saveContext7Mutation.isPending}
-                        className="bg-purple-600 hover:bg-purple-700"
+                        className="bg-blue-600 hover:bg-blue-700"
                       >
                         {saveContext7Mutation.isPending ? (
                           <Loader2 className="w-4 h-4 animate-spin" />
@@ -1721,30 +1771,31 @@ export default function Settings() {
               {/* Billing Tab */}
               {activeTab === 'billing' && (
                 <div className="space-y-6">
-                  <div>
-                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Billing Information</h2>
-                    <p className="text-gray-600">Manage your payment methods and billing details</p>
-                  </div>
+                    <DashboardSectionHeader
+                    eyebrow={t('settings.billing.eyebrow')}
+                    title={t('settings.billing.title')}
+                    description={t('settings.billing.description')}
+                  />
 
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
-                    <div className="p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl text-white">
-                      <div className="text-sm opacity-90 mb-2">Primary Payment Method</div>
+                    <div className="p-4 bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 rounded-xl text-white">
+                      <div className="text-sm opacity-90 mb-2">{t('settings.billing.primaryPaymentMethod')}</div>
                       <div className="flex items-center gap-3 mb-4">
                         <CreditCard className="w-8 h-8" />
                         <div>
                           <div className="font-semibold">•••• •••• •••• 4242</div>
-                          <div className="text-sm opacity-90">Expires 12/25</div>
+                          <div className="text-sm opacity-90">{t('settings.billing.expires')}</div>
                         </div>
                       </div>
                       <Button variant="outline" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30">
-                        Update
+                        {t('common.update')}
                       </Button>
                     </div>
 
                     <div className="p-4 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center">
                       <Button variant="outline">
                         <CreditCard className="w-4 h-4 mr-2" />
-                        Add Payment Method
+                        {t('settings.billing.addPaymentMethod')}
                       </Button>
                     </div>
                   </div>
@@ -1752,18 +1803,18 @@ export default function Settings() {
                   <BudgetPanel />
 
                   <div>
-                    <h3 className="font-semibold text-gray-900 mb-4">Recent Invoices</h3>
+                    <h3 className="font-semibold text-gray-900 mb-4">{t('settings.billing.recentInvoices')}</h3>
                     <div className="space-y-2">
                       {[1, 2, 3].map((i) => (
                         <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                           <div>
-                            <div className="font-medium text-gray-900">Invoice #{1000 + i}</div>
-                            <div className="text-sm text-gray-500">January {i}, 2026</div>
+                            <div className="font-medium text-gray-900">{t('settings.billing.invoice', { number: 1000 + i })}</div>
+                            <div className="text-sm text-gray-500">{t('settings.billing.invoiceDate', { day: i })}</div>
                           </div>
                           <div className="flex items-center gap-3">
                             <span className="font-semibold text-gray-900">$45.00</span>
                             <Button variant="ghost" size="sm">
-                              Download
+                              {t('common.download')}
                             </Button>
                           </div>
                         </div>
@@ -1776,10 +1827,12 @@ export default function Settings() {
               {/* Integrations Tab */}
               {activeTab === 'integrations' && (
                 <div className="space-y-6">
-                  <div>
-                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Integrations</h2>
-                    <p className="text-gray-600 dark:text-gray-400">Connect external services to enhance your workflow</p>
-                  </div>
+                  <DashboardSectionHeader
+                    eyebrow={t('settings.integrations.eyebrow')}
+                    title={t('settings.integrations.title')}
+                    description={t('settings.integrations.description')}
+                  />
+                  <UploadPostGatewayPanel tenantId={user.currentTenantId ?? null} />
                   <McpServersSettingsPanel />
                   <GoogleDrivePanel />
                   <OneDrivePanel />
@@ -1840,7 +1893,7 @@ export default function Settings() {
               onClick={() => setShowDeleteDialog(false)}
               disabled={deleteAccountMutation.isPending}
             >
-              Cancel
+              {t('common.cancel')}
             </Button>
             <Button
               variant="destructive"
@@ -1852,7 +1905,7 @@ export default function Settings() {
               {deleteAccountMutation.isPending ? (
                 <>
                   <Loader2 className="w-4 h-4 mr-2 animate-spin" />
-                  Deleting...
+                  {t('settings.account.deleting')}
                 </>
               ) : (
                 <>
diff --git a/apps/web/client/src/pages/__tests__/Settings.i18n.test.tsx b/apps/web/client/src/pages/__tests__/Settings.i18n.test.tsx
new file mode 100644
index 00000000..d82b5552
--- /dev/null
+++ b/apps/web/client/src/pages/__tests__/Settings.i18n.test.tsx
@@ -0,0 +1,111 @@
+/**
+ * Tests for section-11: Display Language dropdown in Settings preferences tab.
+ * Focused unit tests for the display language controls without mounting the full Settings page.
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent, waitFor } from "@testing-library/react";
+
+// Hoisted mocks
+const { mockChangeLanguage, mockMutate } = vi.hoisted(() => ({
+  mockChangeLanguage: vi.fn().mockResolvedValue(undefined),
+  mockMutate: vi.fn(),
+}));
+
+vi.mock("i18next", () => ({
+  default: { changeLanguage: mockChangeLanguage, language: "en" },
+}));
+
+vi.mock("react-i18next", () => ({
+  useTranslation: () => ({
+    t: (key: string) => key,
+    i18n: { language: "en", changeLanguage: mockChangeLanguage },
+  }),
+}));
+
+vi.mock("@/contexts/AuthContext", () => ({
+  useAuth: () => ({
+    isAuthenticated: true,
+    user: { id: "1", name: "Test", email: "test@example.com", role: "user", credits: 100 },
+  }),
+}));
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    users: {
+      getPreferences: { useQuery: () => ({ data: { translationLanguage: "", translationModel: "" }, isSuccess: true, isError: false }) },
+      updatePreferences: { useMutation: () => ({ mutate: mockMutate, isPending: false }) },
+    },
+    llm: {
+      listEnabledModels: { useQuery: () => ({ data: { models: [] } }) },
+    },
+  },
+}));
+
+vi.mock("@shared/i18n", () => ({
+  SUPPORTED_LANGUAGES: ["en", "th", "ja"],
+  LANGUAGE_LABELS: { en: "English", th: "ไทย", ja: "日本語" },
+  LANGUAGE_LABELS_EN: { en: "English", th: "Thai", ja: "Japanese" },
+  LANGUAGE_COVERAGE: { en: 100, th: 60, ja: 0 },
+}));
+
+// Mock localStorage
+const localStorageMock = { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() };
+Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });
+
+// Import after mocks
+import { DisplayLanguageDropdown } from "@/pages/Settings";
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+describe("DisplayLanguageDropdown", () => {
+  it("shows Display Language label", () => {
+    render(<DisplayLanguageDropdown />);
+    expect(screen.getByText(/display language/i)).toBeTruthy();
+  });
+
+  it("dropdown lists only languages with >= 50% coverage plus English", () => {
+    render(<DisplayLanguageDropdown />);
+    const select = screen.getByRole("combobox");
+    const options = Array.from(select.querySelectorAll("option")).map((o) => (o as HTMLOptionElement).value);
+    expect(options).toContain("en");
+    expect(options).toContain("th"); // 60% coverage
+    expect(options).not.toContain("ja"); // 0% coverage
+  });
+
+  it("dropdown shows native name with English name for non-English options", () => {
+    render(<DisplayLanguageDropdown />);
+    const thOption = screen.getByRole("option", { name: /ไทย/i });
+    expect(thOption).toBeTruthy();
+  });
+
+  it("changing language calls i18next.changeLanguage with selected code", () => {
+    render(<DisplayLanguageDropdown />);
+    const select = screen.getByRole("combobox");
+    fireEvent.change(select, { target: { value: "th" } });
+    expect(mockChangeLanguage).toHaveBeenCalledWith("th");
+  });
+
+  it("changing language updates localStorage smartspec_locale", () => {
+    render(<DisplayLanguageDropdown />);
+    const select = screen.getByRole("combobox");
+    fireEvent.change(select, { target: { value: "th" } });
+    expect(localStorageMock.setItem).toHaveBeenCalledWith("smartspec_locale", "th");
+  });
+
+  it("changing language fires tRPC updatePreferences mutation with translationLanguage", () => {
+    render(<DisplayLanguageDropdown />);
+    const select = screen.getByRole("combobox");
+    fireEvent.change(select, { target: { value: "th" } });
+    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ translationLanguage: "th" }));
+  });
+
+  it("English always appears as option even with filtered coverage", () => {
+    render(<DisplayLanguageDropdown />);
+    const select = screen.getByRole("combobox");
+    const options = Array.from(select.querySelectorAll("option")).map((o) => (o as HTMLOptionElement).value);
+    expect(options).toContain("en");
+  });
+});
