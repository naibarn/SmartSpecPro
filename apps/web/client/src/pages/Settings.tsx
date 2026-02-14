/**
 * Settings Page - SmartSpec Pro
 * User settings and preferences
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { GoogleDrivePanel } from '@/components/settings/GoogleDrivePanel';

type SettingsTab = 'profile' | 'account' | 'security' | 'preferences' | 'api' | 'billing' | 'integrations';

type TwoFAStep = 'idle' | 'setup' | 'verify' | 'done' | 'disable' | 'regen';

function TwoFactorSection() {
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

  const handleSetup = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/trpc/auth.setup2FA', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: {} }),
        credentials: 'include',
      });
      const data = await res.json();
      const result = data.result?.data?.json;
      const err = data.error?.json?.message;
      if (err) { toast.error(err); return; }
      setSetupData(result);
      setStep('setup');
    } catch { toast.error('Failed to start 2FA setup'); } finally { setIsLoading(false); }
  };

  const handleConfirm = async () => {
    if (code.length !== 6) { toast.error('Enter a 6-digit code'); return; }
    setIsLoading(true);
    try {
      const res = await fetch('/trpc/auth.confirm2FA', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { code } }),
        credentials: 'include',
      });
      const data = await res.json();
      const err = data.error?.json?.message;
      if (err) { toast.error(err); return; }
      toast.success('2FA enabled successfully!');
      setStep('done');
      setShowCodes(true);
      statusQuery.refetch();
    } catch { toast.error('Verification failed'); } finally { setIsLoading(false); }
  };

  const handleDisable = async () => {
    if (!disableCode) { toast.error('Enter your TOTP or recovery code'); return; }
    setIsLoading(true);
    try {
      const res = await fetch('/trpc/auth.disable2FA', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { code: disableCode } }),
        credentials: 'include',
      });
      const data = await res.json();
      const err = data.error?.json?.message;
      if (err) { toast.error(err); return; }
      toast.success('2FA disabled');
      setStep('idle');
      setDisableCode('');
      setSetupData(null);
      statusQuery.refetch();
    } catch { toast.error('Failed to disable 2FA'); } finally { setIsLoading(false); }
  };

  const handleRegen = async () => {
    if (regenCode.length !== 6) { toast.error('Enter your current TOTP code'); return; }
    setIsLoading(true);
    try {
      const res = await fetch('/trpc/auth.regenerateRecoveryCodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { code: regenCode } }),
        credentials: 'include',
      });
      const data = await res.json();
      const err = data.error?.json?.message;
      if (err) { toast.error(err); return; }
      setNewCodes(data.result?.data?.json?.recoveryCodes || []);
      setStep('done');
      setShowCodes(true);
      setRegenCode('');
      statusQuery.refetch();
      toast.success('New recovery codes generated');
    } catch { toast.error('Failed to regenerate codes'); } finally { setIsLoading(false); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
  };

  const codesToShow = newCodes || setupData?.recoveryCodes || [];

  return (
    <div className="pt-6 border-t border-gray-200">
      <h3 className="font-semibold text-gray-900 mb-4">Two-Factor Authentication</h3>

      {/* Admin disabled */}
      {!adminEnabled && !enabled && (
        <div className="p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-3">
            <ShieldOff className="w-5 h-5 text-gray-400" />
            <div>
              <div className="font-medium text-gray-900">2FA is not available</div>
              <div className="text-sm text-gray-500">Two-factor authentication has been disabled by your administrator.</div>
            </div>
          </div>
        </div>
      )}

      {/* Enforced notice */}
      {enforced && !enabled && adminEnabled && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-3">
          Your administrator requires two-factor authentication. Please enable 2FA to continue using the platform.
        </div>
      )}

      {/* Status display */}
      {step === 'idle' && !enabled && adminEnabled && (
        <div className="p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-gray-400" />
              <div>
                <div className="font-medium text-gray-900">2FA is disabled</div>
                <div className="text-sm text-gray-500">Protect your account with an authenticator app</div>
              </div>
            </div>
            <Button onClick={handleSetup} disabled={isLoading} size="sm">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
              Enable 2FA
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
                  <div className="font-medium text-green-900">2FA is enabled</div>
                  <div className="text-sm text-green-700">{codesRemaining} recovery codes remaining</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep('regen')}>
                  <RefreshCw className="w-3 h-3 mr-1" /> New Codes
                </Button>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setStep('disable')}>
                  <ShieldOff className="w-3 h-3 mr-1" /> Disable
                </Button>
              </div>
            </div>
          </div>
          {codesRemaining <= 2 && codesRemaining > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              You have only {codesRemaining} recovery code{codesRemaining === 1 ? '' : 's'} left. Consider regenerating them.
            </div>
          )}
        </div>
      )}

      {/* Setup step: show QR code */}
      {step === 'setup' && setupData && (
        <div className="space-y-4">
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
            <p className="text-sm font-medium text-purple-900 mb-3">1. Scan this QR code with your authenticator app</p>
            <div className="flex justify-center mb-3">
              <div className="bg-white p-3 rounded-xl">
                <QRCodeSVG value={setupData.uri} size={200} />
              </div>
            </div>
            <p className="text-xs text-purple-700 mb-2">Or enter this secret manually:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-white rounded text-xs font-mono break-all">{setupData.secret}</code>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(setupData.secret)}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-900 mb-2">2. Enter the 6-digit code from your app</p>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="font-mono text-center text-lg tracking-widest w-40"
              />
              <Button onClick={handleConfirm} disabled={isLoading || code.length !== 6}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Verify & Enable
              </Button>
              <Button variant="ghost" onClick={() => { setStep('idle'); setCode(''); setSetupData(null); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Show recovery codes after setup or regen */}
      {step === 'done' && showCodes && codesToShow.length > 0 && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm font-semibold text-amber-900 mb-2">Save your recovery codes</p>
            <p className="text-xs text-amber-700 mb-3">
              Store these codes in a safe place. Each code can only be used once to sign in if you lose access to your authenticator app.
            </p>
            <div className="grid grid-cols-2 gap-1 mb-3">
              {codesToShow.map((c, i) => (
                <code key={i} className="p-1.5 bg-white rounded text-sm font-mono text-center">{c}</code>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(codesToShow.join('\n'))}>
                <Copy className="w-3 h-3 mr-1" /> Copy All
              </Button>
              <Button size="sm" onClick={() => { setShowCodes(false); setStep('idle'); setNewCodes(null); }}>
                I've saved my codes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Disable 2FA */}
      {step === 'disable' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
          <p className="text-sm font-medium text-red-900">Disable Two-Factor Authentication</p>
          <p className="text-xs text-red-700">Enter your current TOTP code or a recovery code to disable 2FA.</p>
          <div className="flex gap-2">
            <Input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="TOTP code or recovery code"
              className="w-56"
            />
            <Button variant="destructive" size="sm" onClick={handleDisable} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Disable 2FA
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setStep('idle'); setDisableCode(''); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Regenerate recovery codes */}
      {step === 'regen' && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
          <p className="text-sm font-medium text-blue-900">Regenerate Recovery Codes</p>
          <p className="text-xs text-blue-700">Enter your current TOTP code to generate new recovery codes. Old codes will be invalidated.</p>
          <div className="flex gap-2">
            <Input
              value={regenCode}
              onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="font-mono w-40"
            />
            <Button size="sm" onClick={handleRegen} disabled={isLoading || regenCode.length !== 6}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Generate New Codes
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setStep('idle'); setRegenCode(''); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
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
    onSuccess: () => { toast.success('Code sent to backup email'); setBackupEmailStep('code_sent'); },
    onError: (e: any) => toast.error(e.message),
  });
  const verifyBackupEmailMut = trpc.auth.verifyBackupEmail.useMutation({
    onSuccess: () => { toast.success('Backup email verified!'); setBackupEmailStep('verified'); refetchRecovery(); setBackupEmailCode(''); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeBackupEmailMut = trpc.auth.removeBackupEmail.useMutation({
    onSuccess: () => { toast.success('Backup email removed'); setBackupEmailStep('idle'); setBackupEmailInput(''); refetchRecovery(); },
    onError: (e: any) => toast.error(e.message),
  });
  const sendPhoneCodeMut = trpc.auth.sendPhoneCode.useMutation({
    onSuccess: () => { toast.success('Code sent via SMS'); setPhoneStep('code_sent'); },
    onError: (e: any) => toast.error(e.message),
  });
  const verifyPhoneMut = trpc.auth.verifyPhone.useMutation({
    onSuccess: () => { toast.success('Phone verified!'); setPhoneStep('verified'); refetchRecovery(); setPhoneCode(''); },
    onError: (e: any) => toast.error(e.message),
  });
  const removePhoneMut = trpc.auth.removePhone.useMutation({
    onSuccess: () => { toast.success('Phone removed'); setPhoneStep('idle'); setPhoneInput(''); refetchRecovery(); },
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
      toast.success("Context7 API key saved");
      setContext7Key('');
      refetchContext7();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteContext7Mutation = trpc.systemSettings.deleteContext7Key.useMutation({
    onSuccess: () => {
      toast.success("Context7 API key removed");
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

  // Translation preferences
  const [translationLanguage, setTranslationLanguage] = useState('');
  const [translationModel, setTranslationModel] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [showModelPicker, setShowModelPicker] = useState(false);

  const { data: prefsData, isLoading: prefsLoading } = trpc.users.getPreferences.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: modelsData } = trpc.llmProviders.availableModels.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const updatePrefsMutation = trpc.users.updatePreferences.useMutation({
    onSuccess: () => toast.success('Translation preferences saved'),
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
    if (prefsData) {
      setTranslationLanguage(prefsData.translationLanguage || '');
      setTranslationModel(prefsData.translationModel || '');
    }
  }, [prefsData]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const tabs: Array<{ id: SettingsTab; label: string; icon: any }> = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'account', label: 'Account', icon: Mail },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'preferences', label: 'Preferences', icon: Palette },
    { id: 'api', label: 'API Keys', icon: Key },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'integrations', label: 'Integrations', icon: Link2 },
  ];

  const handleSave = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
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
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                  <SettingsIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Settings</h1>
                  <p className="text-sm text-gray-500">Manage your account settings</p>
                </div>
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
                <span className="text-sm font-medium">Settings saved</span>
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
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-4">
              <nav className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <tab.icon className="w-5 h-5" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                ))}
                <div className="border-t border-gray-200/50 my-2" />
                <button
                  onClick={() => setLocation('/settings/skills')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all text-gray-600 hover:bg-gray-50"
                >
                  <Bot className="w-5 h-5" />
                  <span className="font-medium">Skills</span>
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
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-6">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Profile Information</h2>
                    <p className="text-gray-600">Update your personal details and profile picture</p>
                  </div>

                  <div className="flex items-center gap-6 pb-6 border-b border-gray-200">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold">
                      {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div>
                      <Button variant="outline" size="sm" className="mb-2">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Photo
                      </Button>
                      <p className="text-xs text-gray-500">JPG, PNG or GIF. Max 2MB.</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bio
                      </label>
                      <textarea
                        rows={4}
                        placeholder="Tell us about yourself..."
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <Button onClick={handleSave} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              )}

              {/* Account Tab */}
              {activeTab === 'account' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Settings</h2>
                    <p className="text-gray-600">Manage your account preferences</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Mail className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Email Verified</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                      <Check className="w-5 h-5 text-green-500" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                          <CreditCard className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Current Plan</div>
                          <div className="text-sm text-gray-500">{user.plan.toUpperCase()}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Upgrade</Button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                          <Globe className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Language</div>
                          <div className="text-sm text-gray-500">English (US)</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Change</Button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-200">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="font-semibold text-red-900 mb-1">Delete Account</h3>
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
                            Delete Account
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
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Security Settings</h2>
                    <p className="text-gray-600">Manage your password and security preferences</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                        New Password
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <Button onClick={handleSave} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                    <Lock className="w-4 h-4 mr-2" />
                    Update Password
                  </Button>

                  {/* Recovery Email */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-1">Recovery Email</h3>
                    <p className="text-sm text-gray-500 mb-4">Add a backup email for password recovery</p>

                    {recoveryInfo?.backupEmailVerified ? (
                      <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-green-800 font-medium">{recoveryInfo.backupEmail}</span>
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">Verified</Badge>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeBackupEmailMut.mutate()}
                          disabled={removeBackupEmailMut.isPending}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            placeholder="backup@example.com"
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
                            {sendBackupEmailCodeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Code'}
                          </Button>
                        </div>
                        {backupEmailStep === 'code_sent' && (
                          <div className="flex gap-2">
                            <Input
                              placeholder="6-digit code"
                              maxLength={6}
                              value={backupEmailCode}
                              onChange={(e) => setBackupEmailCode(e.target.value.replace(/\D/g, ''))}
                              className="w-40"
                            />
                            <Button
                              onClick={() => verifyBackupEmailMut.mutate({ code: backupEmailCode })}
                              disabled={backupEmailCode.length !== 6 || verifyBackupEmailMut.isPending}
                              className="bg-purple-600 hover:bg-purple-700 text-white"
                            >
                              {verifyBackupEmailMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setBackupEmailStep('idle'); setBackupEmailCode(''); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Recovery Phone */}
                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-1">Recovery Phone</h3>
                    <p className="text-sm text-gray-500 mb-4">Add a phone number for SMS-based password recovery (E.164 format: +66812345678)</p>

                    {recoveryInfo?.phoneVerified ? (
                      <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-green-800 font-medium">{recoveryInfo.phone}</span>
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">Verified</Badge>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removePhoneMut.mutate()}
                          disabled={removePhoneMut.isPending}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Input
                            type="tel"
                            placeholder="+66812345678"
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
                            {sendPhoneCodeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Code'}
                          </Button>
                        </div>
                        {phoneStep === 'code_sent' && (
                          <div className="flex gap-2">
                            <Input
                              placeholder="6-digit code"
                              maxLength={6}
                              value={phoneCode}
                              onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                              className="w-40"
                            />
                            <Button
                              onClick={() => verifyPhoneMut.mutate({ code: phoneCode })}
                              disabled={phoneCode.length !== 6 || verifyPhoneMut.isPending}
                              className="bg-purple-600 hover:bg-purple-700 text-white"
                            >
                              {verifyPhoneMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setPhoneStep('idle'); setPhoneCode(''); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <TwoFactorSection />
                </div>
              )}

              {/* Preferences Tab */}
              {activeTab === 'preferences' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Preferences</h2>
                    <p className="text-gray-600">Customize your experience</p>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">Notifications</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <Bell className="w-5 h-5 text-gray-600" />
                            <div>
                              <div className="font-medium text-gray-900">Email Notifications</div>
                              <div className="text-sm text-gray-500">Receive updates via email</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setEmailNotifications(!emailNotifications)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              emailNotifications ? 'bg-purple-500' : 'bg-gray-300'
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
                              <div className="font-medium text-gray-900">Push Notifications</div>
                              <div className="text-sm text-gray-500">Receive push notifications</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setPushNotifications(!pushNotifications)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              pushNotifications ? 'bg-purple-500' : 'bg-gray-300'
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
                        Telegram Notifications
                      </h3>

                      {telegramState === 'idle' && (
                        <div className="space-y-4">
                          <p className="text-sm text-gray-600">
                            Link your Telegram account to receive instant alerts for important notifications.
                          </p>
                          <Button
                            onClick={() => generateLinkMutation.mutate()}
                            disabled={generateLinkMutation.isPending}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            {generateLinkMutation.isPending ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                            ) : (
                              <><Send className="w-4 h-4 mr-2" /> Link Telegram Account</>
                            )}
                          </Button>
                        </div>
                      )}

                      {telegramState === 'linking' && (
                        <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                          <div className="flex items-center gap-2 text-blue-800 font-medium">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Waiting for verification...
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm text-blue-700">Click the link below to verify your account in Telegram:</p>
                            <a
                              href={telegramLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full p-3 bg-white rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 text-sm break-all"
                            >
                              {telegramLink}
                            </a>
                            <p className="text-xs text-blue-600">This link expires in 5 minutes. Checking every 3 seconds...</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setTelegramState('idle'); setTelegramLink(''); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}

                      {telegramState === 'linked' && telegramStatus.data && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 p-4 bg-green-50 rounded-xl border border-green-200">
                            <Check className="w-5 h-5 text-green-600" />
                            <div>
                              <div className="font-medium text-green-900">Connected</div>
                              <div className="text-sm text-green-700">
                                {telegramStatus.data.username || 'Telegram account linked'}
                              </div>
                            </div>
                          </div>

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
                              Notification Level
                            </label>
                            <select
                              value={telegramStatus.data.notifyLevel}
                              onChange={(e) => updateTelegramPrefsMutation.mutate({ notifyLevel: e.target.value as any })}
                              className="w-full p-2 border border-gray-300 rounded-lg"
                            >
                              <option value="all">All Notifications</option>
                              <option value="high_critical">High + Critical Only</option>
                              <option value="critical_only">Critical Only</option>
                              <option value="off">Off</option>
                            </select>
                          </div>

                          <Button
                            variant="outline"
                            onClick={() => {
                              if (confirm('Are you sure you want to unlink your Telegram account?')) {
                                unlinkMutation.mutate();
                              }
                            }}
                            disabled={unlinkMutation.isPending}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                          >
                            {unlinkMutation.isPending ? (
                              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Unlinking...</>
                            ) : (
                              <><X className="w-4 h-4 mr-2" /> Unlink Account</>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">Appearance</h3>
                      <div className="grid grid-cols-3 gap-3">
                        {(['light', 'dark', 'system'] as const).map((themeOption) => (
                          <button
                            key={themeOption}
                            onClick={() => setTheme(themeOption)}
                            className={`p-4 border-2 rounded-xl text-center transition-all ${
                              theme === themeOption
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="font-medium text-gray-900 capitalize">{themeOption}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Translation */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Languages className="w-5 h-5" />
                      Translation
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Translation Language
                        </label>
                        <select
                          value={translationLanguage}
                          onChange={(e) => setTranslationLanguage(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                        >
                          <option value="">Select language...</option>
                          <option value="th">Thai</option>
                          <option value="zh">Chinese (Simplified)</option>
                          <option value="zh-TW">Chinese (Traditional)</option>
                          <option value="ja">Japanese</option>
                          <option value="ko">Korean</option>
                          <option value="fr">French</option>
                          <option value="es">Spanish</option>
                          <option value="de">German</option>
                          <option value="pt">Portuguese</option>
                          <option value="ar">Arabic</option>
                          <option value="ru">Russian</option>
                          <option value="hi">Hindi</option>
                          <option value="vi">Vietnamese</option>
                          <option value="id">Indonesian</option>
                          <option value="it">Italian</option>
                          <option value="nl">Dutch</option>
                          <option value="pl">Polish</option>
                          <option value="tr">Turkish</option>
                          <option value="sv">Swedish</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Translation Model
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
                                    placeholder="Search models..."
                                    value={modelSearch}
                                    onChange={(e) => setModelSearch(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                                      className={`w-full px-4 py-2 text-left text-sm hover:bg-purple-50 flex items-center justify-between ${
                                        translationModel === m.id ? 'bg-purple-50 text-purple-700' : 'text-gray-700'
                                      }`}
                                    >
                                      <div>
                                        <div className="font-medium">{m.name || m.id}</div>
                                        {m.providerDisplayName && (
                                          <div className="text-xs text-gray-400">{m.providerDisplayName}</div>
                                        )}
                                      </div>
                                      {translationModel === m.id && <Check className="w-4 h-4 text-purple-500" />}
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
                        translationLanguage: translationLanguage || undefined,
                        translationModel: translationModel || undefined,
                      });
                    }}
                    disabled={updatePrefsMutation.isPending}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  >
                    {updatePrefsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Preferences
                  </Button>
                </div>
              )}

              {/* API Keys Tab */}
              {activeTab === 'api' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">API Keys</h2>
                    <p className="text-gray-600">Manage your API keys for integration</p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Key className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-blue-900 mb-1">API Documentation</h3>
                        <p className="text-sm text-blue-700">
                          Learn how to integrate SmartSpec Pro with your applications using our API.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900">Production API Key</div>
                        <Button variant="outline" size="sm">Regenerate</Button>
                      </div>
                      <code className="text-sm text-gray-600 bg-white px-3 py-2 rounded border border-gray-200 block">
                        sk_prod_••••••••••••••••••••••••••••
                      </code>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900">Development API Key</div>
                        <Button variant="outline" size="sm">Regenerate</Button>
                      </div>
                      <code className="text-sm text-gray-600 bg-white px-3 py-2 rounded border border-gray-200 block">
                        sk_dev_••••••••••••••••••••••••••••
                      </code>
                    </div>
                  </div>

                  <Button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                    <Key className="w-4 h-4 mr-2" />
                    Create New Key
                  </Button>

                  {/* Context7 API Key */}
                  <div className="border-t border-gray-200 pt-6 mt-6">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">Context7 API Key</h3>
                      {context7Data?.configured && (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <Check className="w-3 h-3 mr-1" />
                          Configured
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                      Your personal Context7 API key for fetching up-to-date library documentation in chat.
                      Get a free key at{' '}
                      <a href="https://context7.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">
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
                          placeholder={context7Data?.configured ? "Enter new key to update..." : "Enter your Context7 API key"}
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
                        className="bg-purple-600 hover:bg-purple-700"
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
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Billing Information</h2>
                    <p className="text-gray-600">Manage your payment methods and billing details</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl text-white">
                      <div className="text-sm opacity-90 mb-2">Primary Payment Method</div>
                      <div className="flex items-center gap-3 mb-4">
                        <CreditCard className="w-8 h-8" />
                        <div>
                          <div className="font-semibold">•••• •••• •••• 4242</div>
                          <div className="text-sm opacity-90">Expires 12/25</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30">
                        Update
                      </Button>
                    </div>

                    <div className="p-4 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center">
                      <Button variant="outline">
                        <CreditCard className="w-4 h-4 mr-2" />
                        Add Payment Method
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4">Recent Invoices</h3>
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                          <div>
                            <div className="font-medium text-gray-900">Invoice #{1000 + i}</div>
                            <div className="text-sm text-gray-500">January {i}, 2026</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-900">$45.00</span>
                            <Button variant="ghost" size="sm">
                              Download
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
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Integrations</h2>
                    <p className="text-gray-600 dark:text-gray-400">Connect external services to enhance your workflow</p>
                  </div>
                  <GoogleDrivePanel />
                </div>
              )}
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
              Cancel
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
                  Deleting...
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
