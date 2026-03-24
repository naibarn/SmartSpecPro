/**
 * Settings Page - SmartAIHub
 * User settings and preferences
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { HelpButton } from "@/components/help";
import { useI18n } from '@/lib/i18n';
import i18next from 'i18next';
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, LANGUAGE_LABELS_EN, LANGUAGE_COVERAGE, type SupportedLanguage } from '@shared/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { pickEnabledModelId } from '@/lib/enabledModelSelection';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DashboardSectionHeader } from '@/components/dashboard';
import {
  Settings as SettingsIcon,
  User,
  Mail,
  Lock,
  Bell,
  Palette,
  Globe,
  Shield,
  Key,
  CreditCard,
  ChevronLeft,
  Save,
  Upload,
  Check,
  X,
  Eye,
  EyeOff,
  Trash2,
  AlertCircle,
  Loader2,
  Languages,
  Search,
  Bot,
  Phone,
  RefreshCw,
  Smartphone,
  Copy,
  ShieldCheck,
  ShieldOff,
  Send,
  Link2,
  UserCog,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { GoogleDrivePanel } from '@/components/settings/GoogleDrivePanel';
import { McpServersSettingsPanel } from '@/components/settings/McpServersSettingsPanel';
import { OneDrivePanel } from '@/components/settings/OneDrivePanel';
import { UploadPostGatewayPanel } from '@/components/settings/UploadPostGatewayPanel';
import { UserAPIKeysPanel } from '@/components/settings/UserAPIKeysPanel';
import { UserLlmKeysPanel } from '@/components/settings/UserLlmKeysPanel';
import { BudgetPanel } from '@/components/settings/BudgetPanel';
import { PersonasPanel } from '@/components/settings/PersonasPanel';
import { UserAutomationPreferencesPanel } from '@/components/settings/UserAutomationPreferencesPanel';
import { NotificationPreferencesPanel } from '@/components/settings/NotificationPreferencesPanel';
import { clearPrivateVaultAccessToken, getPrivateVaultAccessToken, setPrivateVaultAccessToken } from '@/lib/privateVault';

type SettingsTab = 'profile' | 'account' | 'security' | 'privateVault' | 'preferences' | 'notifications' | 'automation' | 'api' | 'billing' | 'integrations' | 'personas';

type TwoFAStep = 'idle' | 'setup' | 'verify' | 'done' | 'disable' | 'regen';

function TwoFactorSection() {
  const { t } = useI18n();
  const [step, setStep] = useState<TwoFAStep>('idle');
  const [setupData, setSetupData] = useState<{ secret: string; uri: string; recoveryCodes: string[] } | null>(null);
  const [code, setCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [regenCode, setRegenCode] = useState('');
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCodes, setShowCodes] = useState(false);

  const statusQuery = trpc.auth.get2FAStatus.useQuery();
  const enabled = statusQuery.data?.enabled || false;
  const codesRemaining = statusQuery.data?.recoveryCodesRemaining || 0;
  const adminEnabled = statusQuery.data?.adminEnabled !== false;
  const enforced = statusQuery.data?.enforced || false;

  const setup2FA = trpc.auth.setup2FA.useMutation({
    onSuccess: (result) => {
      setSetupData(result as { secret: string; uri: string; recoveryCodes: string[] });
      setStep('setup');
    },
    onError: () => toast.error(t('settings.2fa.error.startSetup')),
    onSettled: () => setIsLoading(false),
  });

  const confirm2FA = trpc.auth.confirm2FA.useMutation({
    onSuccess: () => {
      toast.success(t('settings.2fa.success.enabled'));
      setStep('done');
      setShowCodes(true);
      statusQuery.refetch();
    },
    onError: (err) => toast.error(err.message || t('settings.2fa.error.verificationFailed')),
    onSettled: () => setIsLoading(false),
  });

  const disable2FA = trpc.auth.disable2FA.useMutation({
    onSuccess: () => {
      toast.success(t('settings.2fa.success.disabled'));
      setStep('idle');
      setDisableCode('');
      setSetupData(null);
      statusQuery.refetch();
    },
    onError: (err) => toast.error(err.message || t('settings.2fa.error.disableFailed')),
    onSettled: () => setIsLoading(false),
  });

  const regenCodes = trpc.auth.regenerateRecoveryCodes.useMutation({
    onSuccess: (result) => {
      setNewCodes((result as { recoveryCodes: string[] })?.recoveryCodes || []);
      setStep('done');
      setShowCodes(true);
      setRegenCode('');
      statusQuery.refetch();
      toast.success(t('settings.2fa.success.newCodes'));
    },
    onError: () => toast.error(t('settings.2fa.error.regenFailed')),
    onSettled: () => setIsLoading(false),
  });

  const handleSetup = () => {
    setIsLoading(true);
    setup2FA.mutate();
  };

  const handleConfirm = () => {
    if (code.length !== 6) { toast.error(t('settings.2fa.error.enterCode')); return; }
    setIsLoading(true);
    confirm2FA.mutate({ code });
  };

  const handleDisable = () => {
    if (!disableCode) { toast.error(t('settings.2fa.error.enterDisableCode')); return; }
    setIsLoading(true);
    disable2FA.mutate({ code: disableCode });
  };

  const handleRegen = () => {
    if (regenCode.length !== 6) { toast.error(t('settings.2fa.error.enterCurrentCode')); return; }
    setIsLoading(true);
    regenCodes.mutate({ code: regenCode });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(t('common.copied')));
  };

  const codesToShow = newCodes || setupData?.recoveryCodes || [];

  return (
    <div className="pt-6 border-t border-gray-200">
      <h3 className="font-semibold text-gray-900 mb-4">{t('settings.2fa.title')}</h3>

      {/* Admin disabled */}
      {!adminEnabled && !enabled && (
        <div className="p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-3">
            <ShieldOff className="w-5 h-5 text-gray-400" />
            <div>
              <div className="font-medium text-gray-900">{t('settings.2fa.notAvailable')}</div>
              <div className="text-sm text-gray-500">{t('settings.2fa.disabledByAdmin')}</div>
            </div>
          </div>
        </div>
      )}

      {/* Enforced notice */}
      {enforced && !enabled && adminEnabled && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-3">
          {t('settings.2fa.enforcedNotice')}
        </div>
      )}

      {/* Status display */}
      {step === 'idle' && !enabled && adminEnabled && (
        <div className="p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-gray-400" />
              <div>
                <div className="font-medium text-gray-900">{t('settings.2fa.disabled')}</div>
                <div className="text-sm text-gray-500">{t('settings.2fa.protectAccount')}</div>
              </div>
            </div>
            <Button onClick={handleSetup} disabled={isLoading} size="sm">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
              {t('settings.2fa.enable')}
            </Button>
          </div>
        </div>
      )}

      {step === 'idle' && enabled && (
        <div className="space-y-3">
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-medium text-green-900">{t('settings.2fa.enabled')}</div>
                  <div className="text-sm text-green-700">{t('settings.2fa.codesRemaining', { count: codesRemaining })}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep('regen')}>
                  <RefreshCw className="w-3 h-3 mr-1" /> {t('settings.2fa.newCodes')}
                </Button>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setStep('disable')}>
                  <ShieldOff className="w-3 h-3 mr-1" /> {t('settings.2fa.disable')}
                </Button>
              </div>
            </div>
          </div>
          {codesRemaining <= 2 && codesRemaining > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              {t('settings.2fa.lowCodes', { count: codesRemaining })}
              </div>
          )}
        </div>
      )}

      {/* Setup step: show QR code */}
      {step === 'setup' && setupData && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm font-medium text-blue-900 mb-3">{t('settings.2fa.setup.scanQr')}</p>
            <div className="flex justify-center mb-3">
              <div className="bg-white p-3 rounded-xl">
                <QRCodeSVG value={setupData.uri} size={200} />
              </div>
            </div>
            <p className="text-xs text-blue-700 mb-2">{t('settings.2fa.setup.manualSecret')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-white rounded text-xs font-mono break-all">{setupData.secret}</code>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(setupData.secret)}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-900 mb-2">{t('settings.2fa.setup.enterCode')}</p>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder={t('settings.2fa.codePlaceholder')}
                maxLength={6}
                className="font-mono text-center text-lg tracking-widest w-40"
              />
              <Button onClick={handleConfirm} disabled={isLoading || code.length !== 6}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {t('settings.2fa.verifyEnable')}
              </Button>
              <Button variant="ghost" onClick={() => { setStep('idle'); setCode(''); setSetupData(null); }}>{t('settings.2fa.cancel')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Show recovery codes after setup or regen */}
      {step === 'done' && showCodes && codesToShow.length > 0 && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm font-semibold text-amber-900 mb-2">{t('settings.2fa.saveRecoveryCodes')}</p>
            <p className="text-xs text-amber-700 mb-3">
              {t('settings.2fa.recoveryCodesHint')}
            </p>
            <div className="grid grid-cols-2 gap-1 mb-3">
              {codesToShow.map((c, i) => (
                <code key={i} className="p-1.5 bg-white rounded text-sm font-mono text-center">{c}</code>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(codesToShow.join('\n'))}>
                <Copy className="w-3 h-3 mr-1" /> {t('settings.2fa.copyAll')}
              </Button>
              <Button size="sm" onClick={() => { setShowCodes(false); setStep('idle'); setNewCodes(null); }}>
                {t('settings.2fa.savedCodes')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Disable 2FA */}
      {step === 'disable' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
          <p className="text-sm font-medium text-red-900">{t('settings.2fa.disableTitle')}</p>
          <p className="text-xs text-red-700">{t('settings.2fa.disableDescription')}</p>
          <div className="flex gap-2">
            <Input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder={t('settings.2fa.disablePlaceholder')}
              className="w-56"
            />
            <Button variant="destructive" size="sm" onClick={handleDisable} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Disable 2FA
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setStep('idle'); setDisableCode(''); }}>{t('settings.2fa.cancel')}</Button>
          </div>
        </div>
      )}

      {/* Regenerate recovery codes */}
      {step === 'regen' && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
          <p className="text-sm font-medium text-blue-900">{t('settings.2fa.regenTitle')}</p>
          <p className="text-xs text-blue-700">{t('settings.2fa.regenDescription')}</p>
          <div className="flex gap-2">
            <Input
              value={regenCode}
              onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('settings.2fa.codePlaceholder')}
              maxLength={6}
              className="font-mono w-40"
            />
            <Button size="sm" onClick={handleRegen} disabled={isLoading || regenCode.length !== 6}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {t('settings.2fa.generateNewCodes')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setStep('idle'); setRegenCode(''); }}>{t('settings.2fa.cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Exported sub-component for testability — section-11 Display Language dropdown.
 * Handles i18next language change + localStorage + tRPC persistence.
 */
interface DisplayLanguageDropdownProps {
  defaultValue?: string;
  onLanguageChange?: (lang: string) => void;
}

export function DisplayLanguageDropdown({ defaultValue, onLanguageChange }: DisplayLanguageDropdownProps = {}) {
  // Normalize initial value — guard against browser-resolved codes like "en-US"
  const initialLang = (SUPPORTED_LANGUAGES as readonly string[]).find(
    (l) => (defaultValue || i18next.language || 'en').startsWith(l)
  ) ?? 'en';
  const [displayLanguage, setDisplayLanguage] = useState(initialLang);
  const { mutate: updatePrefs, isPending } = trpc.users.updatePreferences.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const displayLanguages = SUPPORTED_LANGUAGES.filter(
    (lng) => lng === 'en' || (LANGUAGE_COVERAGE[lng as SupportedLanguage] ?? 0) >= 50
  );

  function handleDisplayLangChange(newLng: string) {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(newLng)) return;
    if (isPending) return;
    void i18next.changeLanguage(newLng);
    try { localStorage.setItem('smartspec_locale', newLng); } catch { /* quota/private mode */ }
    setDisplayLanguage(newLng);
    onLanguageChange?.(newLng);
    updatePrefs({ translationLanguage: newLng as SupportedLanguage });
  }

  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Globe className="w-5 h-5" />
        Display Language
      </h3>
      <div>
        <label htmlFor="display-language-select" className="block text-sm font-medium text-gray-700 mb-2">
          Choose the language used for the application interface
        </label>
        <select
          id="display-language-select"
          value={displayLanguage}
          onChange={(e) => handleDisplayLangChange(e.target.value)}
          disabled={isPending}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          {displayLanguages.map((lng) => (
            <option key={lng} value={lng}>
              {LANGUAGE_LABELS[lng as SupportedLanguage]}
              {lng !== 'en' ? ` (${LANGUAGE_LABELS_EN[lng as SupportedLanguage]})` : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">English is always available as fallback.</p>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const initialTab = (new URLSearchParams(search).get('tab') as SettingsTab) || 'profile';
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [showPassword, setShowPassword] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Delete account states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // Delete account mutation
  const deleteAccountMutation = trpc.users.deleteAccount.useMutation({
    onSuccess: async () => {
      // Logout and redirect to home after deletion
      await logout();
      setLocation('/');
    },
    onError: (error) => {
      setDeleteError(error.message);
    },
  });

  // Recovery contact states
  const [backupEmailInput, setBackupEmailInput] = useState('');
  const [backupEmailCode, setBackupEmailCode] = useState('');
  const [backupEmailStep, setBackupEmailStep] = useState<'idle' | 'code_sent' | 'verified'>('idle');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'idle' | 'code_sent' | 'verified'>('idle');
  const [recoveryLoading, setRecoveryLoading] = useState('');

  const { data: recoveryInfo, refetch: refetchRecovery } =
    trpc.auth.getRecoveryInfo.useQuery(undefined, { enabled: isAuthenticated });

  const sendBackupEmailCodeMut = trpc.auth.sendBackupEmailCode.useMutation({
    onSuccess: () => { toast.success(t('settings.recovery.backupEmailSent')); setBackupEmailStep('code_sent'); },
    onError: (e: any) => toast.error(e.message),
  });
  const verifyBackupEmailMut = trpc.auth.verifyBackupEmail.useMutation({
    onSuccess: () => { toast.success(t('settings.recovery.backupEmailVerified')); setBackupEmailStep('verified'); refetchRecovery(); setBackupEmailCode(''); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeBackupEmailMut = trpc.auth.removeBackupEmail.useMutation({
    onSuccess: () => { toast.success(t('settings.recovery.backupEmailRemoved')); setBackupEmailStep('idle'); setBackupEmailInput(''); refetchRecovery(); },
    onError: (e: any) => toast.error(e.message),
  });
  const sendPhoneCodeMut = trpc.auth.sendPhoneCode.useMutation({
    onSuccess: () => { toast.success(t('settings.recovery.phoneCodeSent')); setPhoneStep('code_sent'); },
    onError: (e: any) => toast.error(e.message),
  });
  const verifyPhoneMut = trpc.auth.verifyPhone.useMutation({
    onSuccess: () => { toast.success(t('settings.recovery.phoneVerified')); setPhoneStep('verified'); refetchRecovery(); setPhoneCode(''); },
    onError: (e: any) => toast.error(e.message),
  });
  const removePhoneMut = trpc.auth.removePhone.useMutation({
    onSuccess: () => { toast.success(t('settings.recovery.phoneRemoved')); setPhoneStep('idle'); setPhoneInput(''); refetchRecovery(); },
    onError: (e: any) => toast.error(e.message),
  });

  // Context7 states
  const [context7Key, setContext7Key] = useState('');
  const [showContext7Key, setShowContext7Key] = useState(false);

  const { data: context7Data, refetch: refetchContext7 } =
    trpc.systemSettings.getContext7Key.useQuery(undefined, {
      enabled: isAuthenticated,
    });

  const saveContext7Mutation = trpc.systemSettings.saveContext7Key.useMutation({
    onSuccess: () => {
      toast.success(t('settings.context7.saved'));
      setContext7Key('');
      refetchContext7();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteContext7Mutation = trpc.systemSettings.deleteContext7Key.useMutation({
    onSuccess: () => {
      toast.success(t('settings.context7.removed'));
      refetchContext7();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');

  // Translation preferences (LLM translation target)
  const [translationLanguage, setTranslationLanguage] = useState('');
  const [translationModel, setTranslationModel] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [privateVaultCurrentPin, setPrivateVaultCurrentPin] = useState('');
  const [privateVaultNewPin, setPrivateVaultNewPin] = useState('');
  const [privateVaultConfirmPin, setPrivateVaultConfirmPin] = useState('');
  const [privateVaultUnlockPin, setPrivateVaultUnlockPin] = useState('');
  const [privateVaultDisablePin, setPrivateVaultDisablePin] = useState('');
  const [privateVaultToken, setPrivateVaultTokenState] = useState<string | null>(() => getPrivateVaultAccessToken());

  const prefsQuery = trpc.users.getPreferences.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: prefsData, isLoading: prefsLoading, refetch: refetchPrefs } = prefsQuery;
  const { data: modelsData } = trpc.llmProviders.availableModels.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const enabledTranslationModelIds = useMemo(
    () => (modelsData?.models ?? []).map((model) => model.id),
    [modelsData?.models],
  );
  const updatePrefsMutation = trpc.users.updatePreferences.useMutation({
    onSuccess: () => toast.success(t('settings.translation.saved')),
    onError: (err: any) => toast.error(err.message),
  });
  const setPrivateVaultPinMutation = trpc.users.setPrivateVaultPin.useMutation({
    onSuccess: () => {
      toast.success(t('settings.privateVault.pinSaved'));
      clearPrivateVaultAccessToken();
      setPrivateVaultTokenState(null);
      setPrivateVaultCurrentPin('');
      setPrivateVaultNewPin('');
      setPrivateVaultConfirmPin('');
      setPrivateVaultDisablePin('');
      void refetchPrefs();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const disablePrivateVaultMutation = trpc.users.disablePrivateVault.useMutation({
    onSuccess: () => {
      toast.success(t('settings.privateVault.disabled'));
      clearPrivateVaultAccessToken();
      setPrivateVaultTokenState(null);
      setPrivateVaultCurrentPin('');
      setPrivateVaultNewPin('');
      setPrivateVaultConfirmPin('');
      setPrivateVaultDisablePin('');
      void refetchPrefs();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const unlockPrivateVaultMutation = trpc.users.unlockPrivateVault.useMutation({
    onSuccess: (result) => {
      setPrivateVaultAccessToken(String(result.token));
      setPrivateVaultTokenState(String(result.token));
      setPrivateVaultUnlockPin('');
      toast.success(t('settings.privateVault.unlocked'));
      void refetchPrefs();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Telegram state
  const [telegramState, setTelegramState] = useState<'idle' | 'linking' | 'linked'>('idle');
  const [telegramLink, setTelegramLink] = useState('');
  const [linkStartTime, setLinkStartTime] = useState(0);

  const telegramStatus = trpc.telegram.checkTelegramStatus.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      if (telegramState !== 'linking') return false;
      if (query.state.data?.linked) {
        setTelegramState('linked');
        return false;
      }
      if (Date.now() - linkStartTime > 300000) return false; // 5 min timeout
      return 3000; // Poll every 3s
    },
  });

  const generateLinkMutation = trpc.telegram.generateTelegramLink.useMutation({
    onSuccess: (data) => {
      setTelegramLink(data.deepLink);
      setTelegramState('linking');
      setLinkStartTime(Date.now());
      telegramStatus.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const unlinkMutation = trpc.telegram.unlinkTelegram.useMutation({
    onSuccess: () => {
      toast.success('Telegram account unlinked');
      setTelegramState('idle');
      telegramStatus.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateTelegramPrefsMutation = trpc.telegram.updateTelegramPreferences.useMutation({
    onSuccess: () => toast.success('Telegram preferences updated'),
    onError: (err: any) => toast.error(err.message),
  });

  // Set initial Telegram state
  useEffect(() => {
    if (telegramStatus.data?.linked) {
      setTelegramState('linked');
    }
  }, [telegramStatus.data]);

  useEffect(() => {
    if (!prefsData || !modelsData?.models) {
      return;
    }

    setTranslationLanguage(prefsData.translationLanguage || '');
    setTranslationModel(
      pickEnabledModelId({
        preferredId: prefsData.translationModel || '',
        allowedIds: enabledTranslationModelIds,
      }),
    );
  }, [enabledTranslationModelIds, modelsData?.models, prefsData]);

  useEffect(() => {
    if (!modelsData?.models) {
      return;
    }

    const nextModelId = pickEnabledModelId({
      preferredId: translationModel,
      allowedIds: enabledTranslationModelIds,
    });
    if (nextModelId !== translationModel) {
      setTranslationModel(nextModelId);
    }
  }, [enabledTranslationModelIds, modelsData?.models, translationModel]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncVaultToken = () => setPrivateVaultTokenState(getPrivateVaultAccessToken());
    syncVaultToken();
    window.addEventListener('storage', syncVaultToken);
    return () => window.removeEventListener('storage', syncVaultToken);
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  const privateVaultPrefs = prefsData?.privateVault as {
    enabled?: boolean;
    pinVersion?: number;
    pinUpdatedAt?: string;
  } | undefined;
  const privateVaultConfigured = Boolean(privateVaultPrefs?.enabled);
  const privateVaultUnlocked = Boolean(privateVaultToken);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const tabs: Array<{ id: SettingsTab; label: string; icon: any }> = [
    { id: 'profile', label: t('settings.tabs.profile'), icon: User },
    { id: 'account', label: t('settings.tabs.account'), icon: Mail },
    { id: 'security', label: t('settings.tabs.security'), icon: Shield },
    { id: 'privateVault', label: t('settings.tabs.privateVault'), icon: Lock },
    { id: 'preferences', label: t('settings.tabs.preferences'), icon: Palette },
    { id: 'notifications', label: t('settings.tabs.notifications'), icon: Bell },
    { id: 'automation', label: t('settings.tabs.automation'), icon: Bot },
    { id: 'api', label: t('settings.tabs.apiKeys'), icon: Key },
    { id: 'billing', label: t('settings.tabs.billing'), icon: CreditCard },
    { id: 'integrations', label: t('settings.tabs.integrations'), icon: Link2 },
    { id: 'personas', label: t('settings.tabs.personas'), icon: UserCog },
  ];

  const handleSave = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/dashboard')}
                className="text-gray-600"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                {t('common.back')}
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center">
                  <SettingsIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{t('settings.title')}</h1>
                  <p className="text-sm text-gray-500">{t('settings.description')}</p>
                </div>
                <HelpButton page="/settings" variant="ghost" size="sm" />
              </div>
            </div>
            {saveSuccess && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg"
              >
                <Check className="w-4 h-4" />
                <span className="text-sm font-medium">{t('settings.saved')}</span>
              </motion.div>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Settings Navigation */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-1"
          >
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-blue-500/5 p-4">
              <nav className="flex flex-row overflow-x-auto lg:flex-col lg:overflow-visible gap-1 lg:gap-0 lg:space-y-1 pb-1 lg:pb-0">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-shrink-0 lg:w-full flex items-center gap-3 px-3 py-2 lg:px-4 lg:py-3 rounded-xl text-left transition-all ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <tab.icon className="w-5 h-5" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                ))}
                <div className="hidden lg:block border-t border-gray-200/50 my-2" />
                <button
                  onClick={() => setLocation('/settings/skills')}
                  className="flex-shrink-0 lg:w-full flex items-center gap-3 px-3 py-2 lg:px-4 lg:py-3 rounded-xl text-left transition-all text-gray-600 hover:bg-gray-50"
                >
                  <Bot className="w-5 h-5" />
                  <span className="font-medium">{t('settings.skills')}</span>
                </button>
              </nav>
            </div>
          </motion.div>

          {/* Settings Content */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-3"
          >
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-blue-500/5 p-6">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <DashboardSectionHeader
                    eyebrow={t('settings.profile.eyebrow')}
                    title={t('settings.profile.title')}
                    description={t('settings.profile.description')}
                  />

                  <div className="flex items-center gap-6 pb-6 border-b border-gray-200">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center text-white text-2xl font-bold">
                      {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div>
                      <Button variant="outline" size="sm" className="mb-2">
                        <Upload className="w-4 h-4 mr-2" />
                        {t('settings.profile.uploadPhoto')}
                      </Button>
                      <p className="text-xs text-gray-500">{t('settings.profile.photoHint')}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('settings.profile.fullName')}
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('settings.profile.emailAddress')}
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('settings.profile.bio')}
                      </label>
                      <textarea
                        rows={4}
                        placeholder={t('settings.profile.bioPlaceholder')}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <Button onClick={handleSave} className="bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white">
                    <Save className="w-4 h-4 mr-2" />
                    {t('common.saveChanges')}
                  </Button>
                </div>
              )}

              {/* Account Tab */}
              {activeTab === 'account' && (
                <div className="space-y-6">
                  <DashboardSectionHeader
                    eyebrow={t('settings.account.eyebrow')}
                    title={t('settings.account.title')}
                    description={t('settings.account.description')}
                  />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Mail className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{t('settings.account.emailVerified')}</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                      <Check className="w-5 h-5 text-green-500" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <CreditCard className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{t('settings.account.currentPlan')}</div>
                          <div className="text-sm text-gray-500">{user.plan.toUpperCase()}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">{t('settings.account.upgrade')}</Button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                          <Globe className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{t('settings.account.language')}</div>
                          <div className="text-sm text-gray-500">{t('settings.account.languageValue')}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">{t('common.change')}</Button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-200">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="font-semibold text-red-900 mb-1">{t('settings.account.deleteAccount')}</h3>
                          <p className="text-sm text-red-700 mb-3">
                            Permanently delete your account and all associated data. This action cannot be undone.
                          </p>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setDeleteConfirmEmail('');
                              setDeleteError('');
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t('settings.account.deleteAccount')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  <DashboardSectionHeader
                    eyebrow={t('settings.security.eyebrow')}
                    title={t('settings.security.title')}
                    description={t('settings.security.description')}
                  />

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('settings.security.currentPassword')}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('settings.security.newPassword')}
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <Button onClick={handleSave} className="bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white">
                    <Lock className="w-4 h-4 mr-2" />
                    {t('settings.security.updatePassword')}
                  </Button>

                  {/* Recovery Email */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-1">{t('settings.recovery.emailTitle')}</h3>
                    <p className="text-sm text-gray-500 mb-4">{t('settings.recovery.emailDescription')}</p>

                    {recoveryInfo?.backupEmailVerified ? (
                      <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-green-800 font-medium">{recoveryInfo.backupEmail}</span>
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">{t('settings.recovery.verified')}</Badge>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeBackupEmailMut.mutate()}
                          disabled={removeBackupEmailMut.isPending}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> {t('settings.recovery.remove')}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            placeholder={t('settings.recovery.emailPlaceholder')}
                            value={backupEmailInput}
                            onChange={(e) => setBackupEmailInput(e.target.value)}
                            className="flex-1"
                            disabled={backupEmailStep === 'code_sent'}
                          />
                          <Button
                            variant="outline"
                            onClick={() => sendBackupEmailCodeMut.mutate({ backupEmail: backupEmailInput })}
                            disabled={!backupEmailInput || sendBackupEmailCodeMut.isPending || backupEmailStep === 'code_sent'}
                          >
                            {sendBackupEmailCodeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.recovery.sendCode')}
                          </Button>
                        </div>
                        {backupEmailStep === 'code_sent' && (
                          <div className="flex gap-2">
                            <Input
                              placeholder={t('settings.recovery.codePlaceholder')}
                              maxLength={6}
                              value={backupEmailCode}
                              onChange={(e) => setBackupEmailCode(e.target.value.replace(/\D/g, ''))}
                              className="w-40"
                            />
                            <Button
                              onClick={() => verifyBackupEmailMut.mutate({ code: backupEmailCode })}
                              disabled={backupEmailCode.length !== 6 || verifyBackupEmailMut.isPending}
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              {verifyBackupEmailMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.recovery.verify')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setBackupEmailStep('idle'); setBackupEmailCode(''); }}
                            >
                              {t('settings.recovery.cancel')}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Recovery Phone */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-1">{t('settings.recovery.phoneTitle')}</h3>
                    <p className="text-sm text-gray-500 mb-4">{t('settings.recovery.phoneDescription')}</p>

                    {recoveryInfo?.phoneVerified ? (
                      <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-green-800 font-medium">{recoveryInfo.phone}</span>
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">{t('settings.recovery.verified')}</Badge>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removePhoneMut.mutate()}
                          disabled={removePhoneMut.isPending}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> {t('settings.recovery.remove')}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Input
                            type="tel"
                            placeholder={t('settings.recovery.phonePlaceholder')}
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            className="flex-1"
                            disabled={phoneStep === 'code_sent'}
                          />
                          <Button
                            variant="outline"
                            onClick={() => sendPhoneCodeMut.mutate({ phone: phoneInput })}
                            disabled={!phoneInput || sendPhoneCodeMut.isPending || phoneStep === 'code_sent'}
                          >
                            {sendPhoneCodeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.recovery.sendCode')}
                          </Button>
                        </div>
                        {phoneStep === 'code_sent' && (
                          <div className="flex gap-2">
                            <Input
                              placeholder={t('settings.recovery.codePlaceholder')}
                              maxLength={6}
                              value={phoneCode}
                              onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                              className="w-40"
                            />
                            <Button
                              onClick={() => verifyPhoneMut.mutate({ code: phoneCode })}
                              disabled={phoneCode.length !== 6 || verifyPhoneMut.isPending}
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              {verifyPhoneMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.recovery.verify')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setPhoneStep('idle'); setPhoneCode(''); }}
                            >
                              {t('settings.recovery.cancel')}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <TwoFactorSection />
                </div>
              )}

              {/* Private Vault Tab */}
              {activeTab === 'privateVault' && (
                <div className="space-y-6">
                  <DashboardSectionHeader
                    eyebrow={t('settings.privateVault.eyebrow')}
                    title={t('settings.privateVault.title')}
                    description={t('settings.privateVault.description')}
                  />

                  {prefsLoading ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      {t('settings.privateVault.loading')}
                    </div>
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                      <h3 className="text-lg font-semibold text-gray-900">{t('settings.privateVault.statusTitle')}</h3>
                          <p className="text-sm text-gray-600">
                            {privateVaultConfigured
                              ? t('settings.privateVault.configured')
                              : t('settings.privateVault.notConfigured')}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={privateVaultConfigured
                            ? privateVaultUnlocked
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-slate-100 text-slate-600"}
                        >
                          {privateVaultConfigured
                            ? privateVaultUnlocked
                              ? t('settings.privateVault.unlocked')
                              : t('settings.privateVault.locked')
                            : t('settings.privateVault.notConfigured')}
                        </Badge>
                      </div>

                      <div className="mt-4 space-y-2 text-sm text-gray-600">
                        <p>• Files stay inside the same library/RAG pipeline, but are hidden behind a PIN.</p>
                        <p>• Use this space for receipts, bills, scans, and private personal documents.</p>
                        <p>• Supported file types follow the same broad upload support as the rest of Document Management.</p>
                        {privateVaultPrefs?.pinUpdatedAt ? (
                          <p>• Last updated: {new Date(privateVaultPrefs.pinUpdatedAt).toLocaleString()}</p>
                        ) : null}
                      </div>

                      {privateVaultUnlocked ? (
                        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                          {t('settings.privateVault.browserUnlocked')}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                          {t('settings.privateVault.unlockHint')}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('settings.privateVault.unlockTitle')}</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        {t('settings.privateVault.unlockDescription')}
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          inputMode="numeric"
                          placeholder={t('settings.privateVault.pinPlaceholder')}
                          value={privateVaultUnlockPin}
                          onChange={(event) => setPrivateVaultUnlockPin(event.target.value.replace(/\s+/g, ""))}
                          className="flex-1"
                        />
                        <Button
                          onClick={() => {
                            const pin = privateVaultUnlockPin.trim();
                            if (!pin) {
                              toast.error(t('settings.privateVault.enterPin'));
                              return;
                            }
                            unlockPrivateVaultMutation.mutate({ pin });
                          }}
                          disabled={unlockPrivateVaultMutation.isPending || !privateVaultUnlockPin.trim()}
                          className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          {unlockPrivateVaultMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                          {t('settings.privateVault.unlock')}
                        </Button>
                      </div>
                      {!privateVaultConfigured ? (
                        <div className="mt-3 text-xs text-gray-500">
                          {t('settings.privateVault.setupHint')}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm xl:col-span-2">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('settings.privateVault.setPinTitle')}</h3>
                      <p className="text-sm text-gray-600 mb-4">
                        {t('settings.privateVault.setPinDescription')}
                      </p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <Input
                          type="password"
                          inputMode="numeric"
                          placeholder={privateVaultConfigured ? t('settings.privateVault.currentPin') : t('settings.privateVault.currentPinOptional')}
                          value={privateVaultCurrentPin}
                          onChange={(event) => setPrivateVaultCurrentPin(event.target.value.replace(/\s+/g, ""))}
                        />
                        <Input
                          type="password"
                          inputMode="numeric"
                          placeholder={t('settings.privateVault.newPin')}
                          value={privateVaultNewPin}
                          onChange={(event) => setPrivateVaultNewPin(event.target.value.replace(/\s+/g, ""))}
                        />
                        <Input
                          type="password"
                          inputMode="numeric"
                          placeholder={t('settings.privateVault.confirmPin')}
                          value={privateVaultConfirmPin}
                          onChange={(event) => setPrivateVaultConfirmPin(event.target.value.replace(/\s+/g, ""))}
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button
                          onClick={() => {
                            const newPin = privateVaultNewPin.trim();
                            const confirmPin = privateVaultConfirmPin.trim();
                            const currentPin = privateVaultCurrentPin.trim();
                            if (!newPin || !confirmPin) {
                              toast.error(t('settings.privateVault.enterNewPin'));
                              return;
                            }
                            if (newPin !== confirmPin) {
                              toast.error(t('settings.privateVault.pinMismatch'));
                              return;
                            }
                            setPrivateVaultPinMutation.mutate({
                              currentPin: currentPin || undefined,
                              newPin,
                              confirmPin,
                            });
                          }}
                          disabled={setPrivateVaultPinMutation.isPending || !privateVaultNewPin.trim() || !privateVaultConfirmPin.trim()}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {setPrivateVaultPinMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                          {t('settings.privateVault.savePin')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPrivateVaultCurrentPin('');
                            setPrivateVaultNewPin('');
                            setPrivateVaultConfirmPin('');
                          }}
                        >
                          {t('common.clear')}
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5 xl:col-span-2">
                      <h3 className="text-lg font-semibold text-red-900 mb-1">{t('settings.privateVault.disableTitle')}</h3>
                      <p className="text-sm text-red-700 mb-4">
                        {t('settings.privateVault.disableDescription')}
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          inputMode="numeric"
                          placeholder={t('settings.privateVault.currentPin')}
                          value={privateVaultDisablePin}
                          onChange={(event) => setPrivateVaultDisablePin(event.target.value.replace(/\s+/g, ""))}
                          className="flex-1"
                        />
                        <Button
                          variant="destructive"
                          onClick={() => {
                            const currentPin = privateVaultDisablePin.trim();
                            if (!currentPin) {
                              toast.error(t('settings.privateVault.enterCurrentPin'));
                              return;
                            }
                            disablePrivateVaultMutation.mutate({ currentPin });
                          }}
                          disabled={disablePrivateVaultMutation.isPending || !privateVaultDisablePin.trim()}
                        >
                          {disablePrivateVaultMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                          {t('settings.privateVault.disable')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Preferences Tab */}
              {activeTab === 'preferences' && (
                <div className="space-y-6">
                  <DashboardSectionHeader
                    eyebrow={t('settings.preferences.eyebrow')}
                    title={t('settings.preferences.title')}
                    description={t('settings.preferences.description')}
                  />

                  <div className="space-y-6">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">{t('settings.preferences.notifications')}</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <Bell className="w-5 h-5 text-gray-600" />
                            <div>
                              <div className="font-medium text-gray-900">{t('settings.preferences.emailNotifications')}</div>
                              <div className="text-sm text-gray-500">{t('settings.preferences.emailNotificationsDesc')}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setEmailNotifications(!emailNotifications)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              emailNotifications ? 'bg-blue-500' : 'bg-gray-300'
                            }`}
                          >
                            <div
                              className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                emailNotifications ? 'translate-x-6' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <Bell className="w-5 h-5 text-gray-600" />
                            <div>
                              <div className="font-medium text-gray-900">{t('settings.preferences.pushNotifications')}</div>
                              <div className="text-sm text-gray-500">{t('settings.preferences.pushNotificationsDesc')}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setPushNotifications(!pushNotifications)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              pushNotifications ? 'bg-blue-500' : 'bg-gray-300'
                            }`}
                          >
                            <div
                              className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                pushNotifications ? 'translate-x-6' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Telegram Notifications */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Send className="w-5 h-5" />
                        {t('settings.preferences.telegramNotifications')}
                      </h3>

                      {telegramState === 'idle' && (
                        <div className="space-y-4">
                          <p className="text-sm text-gray-600">{t('settings.preferences.telegramIntro')}</p>
                          <Button
                            onClick={() => generateLinkMutation.mutate()}
                            disabled={generateLinkMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            {generateLinkMutation.isPending ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('settings.preferences.generating')}</>
                            ) : (
                              <><Send className="w-4 h-4 mr-2" /> {t('settings.preferences.linkTelegram')}</>
                            )}
                          </Button>
                        </div>
                      )}

                      {telegramState === 'linking' && (
                        <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                          <div className="flex items-center gap-2 text-blue-800 font-medium">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('settings.preferences.waitingVerification')}
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm text-blue-700">{t('settings.preferences.telegramVerifyHint')}</p>
                            <a
                              href={telegramLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full p-3 bg-white rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 text-sm break-all"
                            >
                              {telegramLink}
                            </a>
                            <p className="text-xs text-blue-600">{t('settings.preferences.telegramLinkExpiry')}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setTelegramState('idle'); setTelegramLink(''); }}
                          >
                            {t('settings.recovery.cancel')}
                          </Button>
                        </div>
                      )}

                      {telegramState === 'linked' && telegramStatus.data && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 p-4 bg-green-50 rounded-xl border border-green-200">
                            <Check className="w-5 h-5 text-green-600" />
                            <div>
                              <div className="font-medium text-green-900">{t('settings.preferences.connected')}</div>
                              <div className="text-sm text-green-700">
                                {telegramStatus.data.username || t('settings.preferences.telegramLinked')}
                              </div>
                            </div>
                          </div>

                          {telegramStatus.data.connection && (
                            <div className="text-xs text-gray-500 space-y-1 mt-2">
                              {telegramStatus.data.connection.telegramUsername && (
                                <div>{t('settings.preferences.connectedAs', { username: telegramStatus.data.connection.telegramUsername })}</div>
                              )}
                              <div>{t('settings.preferences.linkedAt', { date: new Date(telegramStatus.data.connection.linkedAt).toLocaleDateString() })}</div>
                              {(telegramStatus.data.boundConversationCount ?? 0) > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {telegramStatus.data.boundConversationCount} conversation{telegramStatus.data.boundConversationCount !== 1 ? 's' : ''} bridged
                                </Badge>
                              )}
                            </div>
                          )}

                          {telegramStatus.data.deliveryFailing && (
                            <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                              <AlertCircle className="w-4 h-4 text-yellow-600" />
                              <div className="text-sm text-yellow-700">
                                Delivery issues detected. You may have blocked the bot. Unblock it in Telegram to resume.
                              </div>
                            </div>
                          )}

                          <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t('settings.preferences.notificationLevel')}
                            </label>
                            <select
                              value={telegramStatus.data.notifyLevel}
                              onChange={(e) => updateTelegramPrefsMutation.mutate({ notifyLevel: e.target.value as any })}
                              className="w-full p-2 border border-gray-300 rounded-lg"
                            >
                              <option value="all">{t('settings.preferences.notify.all')}</option>
                              <option value="high_critical">{t('settings.preferences.notify.highCritical')}</option>
                              <option value="critical_only">{t('settings.preferences.notify.criticalOnly')}</option>
                              <option value="off">{t('settings.preferences.notify.off')}</option>
                            </select>
                          </div>

                          <Button
                            variant="outline"
                            onClick={() => {
                                if (confirm(t('settings.preferences.unlinkConfirm'))) {
                                unlinkMutation.mutate();
                              }
                            }}
                            disabled={unlinkMutation.isPending}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                          >
                            {unlinkMutation.isPending ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('settings.preferences.unlinking')}</>
                            ) : (
                              <><X className="w-4 h-4 mr-2" /> {t('settings.preferences.unlinkTelegram')}</>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">{t('settings.preferences.appearance')}</h3>
                      <div className="grid grid-cols-3 gap-3">
                        {(['light', 'dark', 'system'] as const).map((themeOption) => (
                          <button
                            key={themeOption}
                            onClick={() => setTheme(themeOption)}
                            className={`p-4 border-2 rounded-xl text-center transition-all ${
                              theme === themeOption
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="font-medium text-gray-900 capitalize">{themeOption}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Display Language */}
                  <DisplayLanguageDropdown
                    defaultValue={prefsData?.translationLanguage || i18next.language}
                    onLanguageChange={(lng) => setTranslationLanguage(lng)}
                  />

                  {/* Translation */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Languages className="w-5 h-5" />
                      Translation
                    </h3>
                    <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t('settings.translation.language')}
                        </label>
                        <select
                          value={translationLanguage}
                          onChange={(e) => setTranslationLanguage(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        >
                          <option value="">{t('settings.translation.selectLanguage')}</option>
                          {SUPPORTED_LANGUAGES.filter((lng) => lng !== 'en').map((lng) => (
                            <option key={lng} value={lng}>
                              {LANGUAGE_LABELS_EN[lng as SupportedLanguage]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t('settings.translation.model')}
                        </label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowModelPicker(!showModelPicker)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-left flex items-center justify-between bg-white hover:border-gray-300 transition-colors"
                          >
                            <span className={translationModel ? 'text-gray-900' : 'text-gray-400'}>
                              {translationModel || 'Select model...'}
                            </span>
                            <Bot className="w-4 h-4 text-gray-400" />
                          </button>
                          {showModelPicker && (
                            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-hidden">
                              <div className="p-2 border-b border-gray-100">
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                  <input
                                    type="text"
                                    placeholder={t('settings.translation.searchModels')}
                                    value={modelSearch}
                                    onChange={(e) => setModelSearch(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    autoFocus
                                  />
                                </div>
                              </div>
                              <div className="overflow-y-auto max-h-48">
                                {(modelsData?.models || [])
                                  .filter((m: any) => !modelSearch || m.id?.toLowerCase().includes(modelSearch.toLowerCase()) || m.name?.toLowerCase().includes(modelSearch.toLowerCase()))
                                  .map((m: any) => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={() => {
                                        setTranslationModel(m.id);
                                        setShowModelPicker(false);
                                        setModelSearch('');
                                      }}
                                      className={`w-full px-4 py-2 text-left text-sm hover:bg-blue-50 flex items-center justify-between ${
                                        translationModel === m.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                                      }`}
                                    >
                                      <div>
                                        <div className="font-medium">{m.name || m.id}</div>
                                        {m.providerDisplayName && (
                                          <div className="text-xs text-gray-400">{m.providerDisplayName}</div>
                                        )}
                                      </div>
                                      {translationModel === m.id && <Check className="w-4 h-4 text-blue-500" />}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Dedicated model for translations. Uses credits based on token usage.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      updatePrefsMutation.mutate({
                        translationLanguage: translationLanguage ? (translationLanguage as any) : undefined,
                        translationModel: translationModel || undefined,
                      });
                    }}
                    disabled={updatePrefsMutation.isPending}
                    className="bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white"
                  >
                    {updatePrefsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    {t('settings.translation.savePreferences')}
                  </Button>
                </div>
              )}

              {activeTab === 'automation' && (
                <div className="space-y-6">
                  <DashboardSectionHeader
                    eyebrow={t('settings.automation.eyebrow')}
                    title={t('settings.automation.title')}
                    description={t('settings.automation.description')}
                  />

                  <UserAutomationPreferencesPanel />

                  {(user.role === 'admin' || user.role === 'domain_admin') && (
                    <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-sky-950">{t('settings.automation.tenantPolicyTitle')}</h3>
                            <Badge variant="outline" className="border-sky-300 bg-white text-sky-800">
                              {t('settings.automation.adminOnly')}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-sky-900">
                            {t('settings.automation.tenantPolicyDescription')}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="border-sky-300 bg-white text-sky-900 hover:bg-sky-100"
                          onClick={() => setLocation('/admin/settings')}
                        >
                          {t('settings.automation.openAdminSettings')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* API Keys Tab */}
              {activeTab === 'api' && (
                <div className="space-y-6">
                  <UserAPIKeysPanel />
                  <div className="border-t border-gray-200 pt-6 mt-6">
                    <UserLlmKeysPanel />
                  </div>

                  {/* Context7 API Key */}
                  <div className="border-t border-gray-200 pt-6 mt-6">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{t('settings.context7.title')}</h3>
                      {context7Data?.configured && (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <Check className="w-3 h-3 mr-1" />
                          {t('settings.context7.configured')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                      {t('settings.context7.description')}{' '}
                      {t('settings.context7.getFreeKeyAt')} {' '}
                      <a href="https://context7.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        context7.com/dashboard
                      </a>
                    </p>

                    {context7Data?.configured && (
                      <div className="p-3 bg-gray-50 rounded-lg mb-3 flex items-center justify-between">
                        <code className="text-sm text-gray-600">{context7Data.maskedKey}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => deleteContext7Mutation.mutate()}
                          disabled={deleteContext7Mutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showContext7Key ? "text" : "password"}
                          placeholder={context7Data?.configured ? t('settings.context7.updatePlaceholder') : t('settings.context7.enterPlaceholder')}
                          value={context7Key}
                          onChange={(e) => setContext7Key(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowContext7Key(!showContext7Key)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showContext7Key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button
                        onClick={() => saveContext7Mutation.mutate({ apiKey: context7Key })}
                        disabled={!context7Key.trim() || saveContext7Mutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {saveContext7Mutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Billing Tab */}
              {activeTab === 'billing' && (
                <div className="space-y-6">
                    <DashboardSectionHeader
                    eyebrow={t('settings.billing.eyebrow')}
                    title={t('settings.billing.title')}
                    description={t('settings.billing.description')}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 rounded-xl text-white">
                      <div className="text-sm opacity-90 mb-2">{t('settings.billing.primaryPaymentMethod')}</div>
                      <div className="flex items-center gap-3 mb-4">
                        <CreditCard className="w-8 h-8" />
                        <div>
                          <div className="font-semibold">•••• •••• •••• 4242</div>
                          <div className="text-sm opacity-90">{t('settings.billing.expires')}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30">
                        {t('common.update')}
                      </Button>
                    </div>

                    <div className="p-4 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center">
                      <Button variant="outline">
                        <CreditCard className="w-4 h-4 mr-2" />
                        {t('settings.billing.addPaymentMethod')}
                      </Button>
                    </div>
                  </div>

                  <BudgetPanel />

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4">{t('settings.billing.recentInvoices')}</h3>
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                          <div>
                            <div className="font-medium text-gray-900">{t('settings.billing.invoice', { number: 1000 + i })}</div>
                            <div className="text-sm text-gray-500">{t('settings.billing.invoiceDate', { day: i })}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-900">$45.00</span>
                            <Button variant="ghost" size="sm">
                              {t('common.download')}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Integrations Tab */}
              {activeTab === 'integrations' && (
                <div className="space-y-6">
                  <DashboardSectionHeader
                    eyebrow={t('settings.integrations.eyebrow')}
                    title={t('settings.integrations.title')}
                    description={t('settings.integrations.description')}
                  />
                  <UploadPostGatewayPanel tenantId={user.currentTenantId ?? null} />
                  <McpServersSettingsPanel />
                  <GoogleDrivePanel />
                  <OneDrivePanel />
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && <NotificationPreferencesPanel />}

              {/* Personas Tab */}
              {activeTab === 'personas' && <PersonasPanel />}
            </div>
          </motion.div>
        </div>
      </main>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All your data including conversations,
              credits, and settings will be permanently deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To confirm, type your email address: <strong>{user?.email}</strong>
              </label>
              <input
                type="email"
                value={deleteConfirmEmail}
                onChange={(e) => {
                  setDeleteConfirmEmail(e.target.value);
                  setDeleteError('');
                }}
                placeholder="Enter your email to confirm"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            {deleteError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {deleteError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteAccountMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteAccountMutation.mutate({ confirmEmail: deleteConfirmEmail });
              }}
              disabled={deleteAccountMutation.isPending || deleteConfirmEmail.toLowerCase() !== user?.email?.toLowerCase()}
            >
              {deleteAccountMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('settings.account.deleting')}
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete My Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
