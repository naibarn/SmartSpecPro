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
import { STORAGE_KEY as LOCALE_STORAGE_KEY } from '@/i18n/languageDetector';
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
import { useConfirm } from '@/components/ui/confirm/ConfirmProvider';
import { useTheme } from '@/contexts/ThemeContext';
import { useAstryxPalette } from '@/contexts/AstryxPaletteContext';
import { getAstryxPaletteAccent } from '@/themes/catalog';
import {
  desktopDeviceDisableResponseSchema,
  desktopRootActionResponseSchema,
} from '@shared/desktopHost';
import { pickEnabledModelId } from '@/lib/enabledModelSelection';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DashboardCard, DashboardSectionHeader } from '@/components/dashboard';
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
  Cpu,
  MonitorPlay,
  Store,
  Plug,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { GoogleDrivePanel } from '@/components/settings/GoogleDrivePanel';
import { McpConnectPanel } from '@/components/settings/McpConnectPanel';
import { HermesConnectPanel } from '@/components/settings/HermesConnectPanel';
import { McpServersSettingsPanel } from '@/components/settings/McpServersSettingsPanel';
import { MarketplaceConnectorSettingsPanel } from '@/components/settings/MarketplaceConnectorSettingsPanel';
import { OneDrivePanel } from '@/components/settings/OneDrivePanel';
import { UploadPostGatewayPanel } from '@/components/settings/UploadPostGatewayPanel';
import { UserAPIKeysPanel } from '@/components/settings/UserAPIKeysPanel';
import { UserLlmKeysPanel } from '@/components/settings/UserLlmKeysPanel';
import { BudgetPanel } from '@/components/settings/BudgetPanel';
import { PersonasPanel } from '@/components/settings/PersonasPanel';
import { UserAutomationPreferencesPanel } from '@/components/settings/UserAutomationPreferencesPanel';
import { NotificationPreferencesPanel } from '@/components/settings/NotificationPreferencesPanel';
import { WorkerAccessKeysPanel } from '@/components/settings/WorkerAccessKeysPanel';
import { WorkerLocalAiPanel } from '@/components/settings/WorkerLocalAiPanel';
import { ConnectedDevicesPanel } from '@/components/settings/ConnectedDevicesPanel';
import { LocalAiSettingsSection } from '@/features/local-ai/components/LocalAiSettingsSection';
import { DesktopHostSettingsPanel } from '@/features/desktop-host/DesktopHostSettingsPanel';
import { useDesktopHostStatus } from '@/features/desktop-host/useDesktopHostStatus';
import { useDesktopDeviceControlPlaneState } from '@/features/desktop-host/useDesktopDeviceControlPlaneState';
import { useDesktopPackageCatalog } from '@/features/desktop-host/useDesktopPackageCatalog';
import { clearPrivateVaultAccessToken, getPrivateVaultAccessToken, setPrivateVaultAccessToken } from '@/lib/privateVault';
import { LocaleToggle } from '@/components/LocaleToggle';
import { useScopedTranslation } from '@/i18n/useScopedTranslation';
import { useTenantFeatureFlag } from '@/hooks/useTenantFeatureFlag';
import { useTenant } from '@/contexts/TenantContext';

type SettingsTab = 'profile' | 'account' | 'security' | 'privateVault' | 'preferences' | 'marketplaceSharing' | 'localAi' | 'desktopHost' | 'notifications' | 'automation' | 'mcpDevices' | 'workers' | 'api' | 'billing' | 'integrations' | 'personas';

type TwoFAStep = 'idle' | 'setup' | 'verify' | 'done' | 'disable' | 'regen';

const SETTINGS_TABS: SettingsTab[] = ['profile', 'account', 'security', 'privateVault', 'preferences', 'marketplaceSharing', 'localAi', 'desktopHost', 'notifications', 'automation', 'mcpDevices', 'workers', 'api', 'billing', 'integrations', 'personas'];
const SAFETY_PROFILE_COUNTRIES = [
  { code: 'TH', en: 'Thailand', th: 'ไทย' },
  { code: 'US', en: 'United States', th: 'สหรัฐอเมริกา' },
  { code: 'GB', en: 'United Kingdom', th: 'สหราชอาณาจักร' },
  { code: 'AT', en: 'Austria', th: 'ออสเตรีย' },
  { code: 'BE', en: 'Belgium', th: 'เบลเยียม' },
  { code: 'BG', en: 'Bulgaria', th: 'บัลแกเรีย' },
  { code: 'HR', en: 'Croatia', th: 'โครเอเชีย' },
  { code: 'CY', en: 'Cyprus', th: 'ไซปรัส' },
  { code: 'CZ', en: 'Czechia', th: 'เช็ก' },
  { code: 'DK', en: 'Denmark', th: 'เดนมาร์ก' },
  { code: 'EE', en: 'Estonia', th: 'เอสโตเนีย' },
  { code: 'FI', en: 'Finland', th: 'ฟินแลนด์' },
  { code: 'FR', en: 'France', th: 'ฝรั่งเศส' },
  { code: 'DE', en: 'Germany', th: 'เยอรมนี' },
  { code: 'GR', en: 'Greece', th: 'กรีซ' },
  { code: 'HU', en: 'Hungary', th: 'ฮังการี' },
  { code: 'IE', en: 'Ireland', th: 'ไอร์แลนด์' },
  { code: 'IT', en: 'Italy', th: 'อิตาลี' },
  { code: 'LV', en: 'Latvia', th: 'ลัตเวีย' },
  { code: 'LT', en: 'Lithuania', th: 'ลิทัวเนีย' },
  { code: 'LU', en: 'Luxembourg', th: 'ลักเซมเบิร์ก' },
  { code: 'MT', en: 'Malta', th: 'มอลตา' },
  { code: 'NL', en: 'Netherlands', th: 'เนเธอร์แลนด์' },
  { code: 'PL', en: 'Poland', th: 'โปแลนด์' },
  { code: 'PT', en: 'Portugal', th: 'โปรตุเกส' },
  { code: 'RO', en: 'Romania', th: 'โรมาเนีย' },
  { code: 'SK', en: 'Slovakia', th: 'สโลวาเกีย' },
  { code: 'SI', en: 'Slovenia', th: 'สโลวีเนีย' },
  { code: 'ES', en: 'Spain', th: 'สเปน' },
  { code: 'SE', en: 'Sweden', th: 'สวีเดน' },
];

function MarketplaceSharingSettingsPanel() {
  const utils = trpc.useUtils();
  const language = typeof window !== 'undefined' ? window.localStorage.getItem(LOCALE_STORAGE_KEY) || navigator.language || 'en' : 'en';
  const th = language.startsWith('th');
  const groups = trpc.groups.list.useQuery({ scope: 'all' });
  const shareSettings = trpc.marketplaceCapture.getShareSettings.useQuery();
  const saveShareSetting = trpc.marketplaceCapture.saveShareSetting.useMutation({
    onSuccess: async () => {
      toast.success(th ? 'บันทึกการตั้งค่าแชร์แล้ว' : 'Marketplace sharing settings saved');
      await utils.marketplaceCapture.getShareSettings.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  function settingFor(platform: 'shopee' | 'tiktok_shop') {
    return (shareSettings.data?.settings ?? []).find((setting: any) => setting.platform === platform);
  }

  function toggleGroup(platform: 'shopee' | 'tiktok_shop', groupId: number, checked: boolean) {
    const current = settingFor(platform);
    const ids = new Set<number>(current?.groupIdsJson ?? []);
    if (checked) ids.add(groupId);
    else ids.delete(groupId);
    saveShareSetting.mutate({
      platform,
      enabled: ids.size > 0,
      groupIds: Array.from(ids),
      permission: 'read_update',
    });
  }

  function setPrivate(platform: 'shopee' | 'tiktok_shop') {
    saveShareSetting.mutate({
      platform,
      enabled: false,
      groupIds: [],
      permission: 'read_update',
    });
  }

  return (
    <div className="space-y-6">
      <DashboardSectionHeader
        eyebrow={th ? 'Marketplace' : 'Marketplace'}
        title={th ? 'การแชร์สินค้า Marketplace' : 'Marketplace product sharing'}
        description={th
          ? 'เลือกเองว่าสินค้า Shopee/TikTok ที่คุณเพิ่มจะเป็นส่วนตัว หรือแชร์ให้ group ที่คุณเป็นสมาชิก เพื่อให้ทุกคน update สินค้าเดียวกันและลดรายการซ้ำ'
          : 'Choose whether newly captured Shopee/TikTok products stay private or are shared with groups you belong to, so updates land on the same product instead of creating duplicates.'}
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {th
          ? 'ค่าเริ่มต้นคือ Private หากไม่เลือก group ระบบจะไม่แชร์สินค้าใหม่ของคุณให้ใครเห็น'
          : 'Default is private. If no group is selected, your newly saved products are not shared.'}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(['shopee', 'tiktok_shop'] as const).map((platform) => {
          const setting = settingFor(platform);
          const selected = new Set<number>(setting?.enabled ? setting.groupIdsJson ?? [] : []);
          return (
            <div key={platform} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-950">{platform === 'shopee' ? 'Shopee' : 'TikTok Shop'}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {selected.size === 0
                      ? th ? 'โหมดส่วนตัว' : 'Private mode'
                      : th ? `แชร์ให้ ${selected.size} group` : `Shared with ${selected.size} group(s)`}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPrivate(platform)} disabled={saveShareSetting.isPending || selected.size === 0}>
                  {th ? 'Private' : 'Private'}
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {(groups.data ?? []).map((group: any) => (
                  <label key={group.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium text-gray-900">{group.name}</span>
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{group.role}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={selected.has(group.id)}
                      disabled={saveShareSetting.isPending}
                      onChange={(event) => toggleGroup(platform, group.id, event.target.checked)}
                    />
                  </label>
                ))}
                {(groups.data ?? []).length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-gray-500">
                    {th ? 'ยังไม่พบ group ที่คุณเป็นสมาชิก' : 'No groups available yet'}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TwoFactorSection() {
  const { t } = useScopedTranslation('settings');
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
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldOff className="w-5 h-5 text-gray-400" />
              <div>
                <div className="font-medium text-gray-900">{t('settings.2fa.notAvailable')}</div>
                <div className="text-sm text-gray-500">{t('settings.2fa.disabledByAdmin')}</div>
              </div>
            </div>
            <Button size="sm" disabled>
              <ShieldCheck className="mr-1 h-4 w-4" />
              {t('settings.2fa.enable')}
            </Button>
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

      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        {t('settings.2fa.desktopFlowNote')}
      </div>

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
  const { t: ts, i18n } = useScopedTranslation('settings');
  // Normalize initial value — guard against browser-resolved codes like "en-US"
  const initialLang = (SUPPORTED_LANGUAGES as readonly string[]).find(
    (l) => (defaultValue || i18n.language || 'en').startsWith(l)
  ) ?? 'en';
  const [displayLanguage, setDisplayLanguage] = useState(initialLang);
  const { mutate: updatePrefs, isPending } = trpc.users.updatePreferences.useMutation({
    onError: (err) => toast.error(err.message),
  });

  // Settings shows ALL supported languages so users can select any language.
  // Coverage % is shown in the label to indicate translation completeness.
  const displayLanguages = SUPPORTED_LANGUAGES;

  function handleDisplayLangChange(newLng: string) {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(newLng)) return;
    if (isPending) return;
    void i18n.changeLanguage(newLng);
    try { localStorage.setItem(LOCALE_STORAGE_KEY, newLng); } catch { /* quota/private mode */ }
    setDisplayLanguage(newLng);
    onLanguageChange?.(newLng);
    updatePrefs({ translationLanguage: newLng as SupportedLanguage, displayLocale: newLng as SupportedLanguage });
  }

  return (
    <div>
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Globe className="w-5 h-5" />
        {ts('displayLanguage.title')}
      </h3>
      <div>
        <label htmlFor="display-language-select" className="block text-sm font-medium text-gray-700 mb-2">
          {ts('displayLanguage.description')}
        </label>
        <select
          id="display-language-select"
          value={displayLanguage}
          onChange={(e) => handleDisplayLangChange(e.target.value)}
          disabled={isPending}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          {displayLanguages.map((lng) => {
            const coverage = LANGUAGE_COVERAGE[lng as SupportedLanguage] ?? 0;
            const nativeName = LANGUAGE_LABELS[lng as SupportedLanguage];
            const englishName = lng !== 'en' ? LANGUAGE_LABELS_EN[lng as SupportedLanguage] : '';
            const coverageLabel = lng === 'en'
              ? ''
              : coverage >= 90
                ? ''
                : ts('displayLanguage.coverageNote', { coverage });
            return (
              <option key={lng} value={lng}>
                {nativeName}{englishName ? ` (${englishName})` : ''}{coverageLabel}
              </option>
            );
          })}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {ts('displayLanguage.fallbackNote')}
        </p>
      </div>
    </div>
  );
}

export default function Settings() {
  const { confirm } = useConfirm();
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { tenant } = useTenant();
  const { t, i18n } = useScopedTranslation(['settings', 'common']);
  const isThaiUi = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('th');
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const initialTab = ((searchParams.get('tab') || searchParams.get('section')) as SettingsTab) || 'profile';
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [showPassword, setShowPassword] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const localClientLlmModeEnabled = useTenantFeatureFlag("localClientLlmMode");
  const desktopHostEnabled = useTenantFeatureFlag("desktopHostEnabled");
  const desktopAdvancedLocalModeEnabled = useTenantFeatureFlag("desktopAdvancedLocalMode");
  const desktopPackageSyncEnabled = useTenantFeatureFlag("desktopPackageSync");
  const desktopAgencyRuntimeEnabled = useTenantFeatureFlag("desktopAgencyRuntime");
  const desktopWorkerProjectionEnabled = useTenantFeatureFlag("desktopWorkerProjection");
  const desktopHostStatus = useDesktopHostStatus(
    desktopHostEnabled && activeTab === 'desktopHost' && Boolean(user?.currentTenantId),
  );
  const [selectedDesktopDeviceId, setSelectedDesktopDeviceId] = useState<string | null>(null);
  const [desktopDisableDeviceId, setDesktopDisableDeviceId] = useState<string | null>(null);
  const [desktopRootActionKey, setDesktopRootActionKey] = useState<string | null>(null);
  const selectedDesktopDevice = useMemo(
    () => desktopHostStatus.status?.devices.find((device) => device.deviceId === selectedDesktopDeviceId)
      ?? desktopHostStatus.status?.devices[0]
      ?? null,
    [desktopHostStatus.status?.devices, selectedDesktopDeviceId],
  );
  const desktopDeviceControlPlane = useDesktopDeviceControlPlaneState(
    desktopHostEnabled && activeTab === 'desktopHost',
    selectedDesktopDevice?.deviceId ?? null,
  );
  const desktopPackageCatalog = useDesktopPackageCatalog(
    desktopHostEnabled && activeTab === 'desktopHost' && desktopPackageSyncEnabled,
  );

  useEffect(() => {
    if (!desktopHostEnabled || activeTab !== 'desktopHost') {
      return;
    }
    if (!selectedDesktopDeviceId && desktopHostStatus.status?.devices[0]?.deviceId) {
      setSelectedDesktopDeviceId(desktopHostStatus.status.devices[0].deviceId);
      return;
    }
    if (
      selectedDesktopDeviceId
      && !(desktopHostStatus.status?.devices ?? []).some((device) => device.deviceId === selectedDesktopDeviceId)
    ) {
      setSelectedDesktopDeviceId(desktopHostStatus.status?.devices[0]?.deviceId ?? null);
    }
  }, [activeTab, desktopHostEnabled, desktopHostStatus.status?.devices, selectedDesktopDeviceId]);

  const handleDisableDesktopDevice = async (deviceId: string) => {
    setDesktopDisableDeviceId(deviceId);
    try {
      const device = desktopHostStatus.status?.devices.find((candidate) => candidate.deviceId === deviceId) ?? null;
      const response = await fetch(`/api/desktop-host/devices/${encodeURIComponent(deviceId)}/disable`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'user_requested_disable',
          cleanupOnNextContact: true,
          packageCachePaths: device?.packageCachePaths ?? [],
          localRoots: device?.localRoots ?? [],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'desktop_device_disable_failed');
      }
      const parsed = desktopDeviceDisableResponseSchema.parse(payload);
      toast.success(
        parsed.offboardingPlan.cleanupOnNextContact
          ? 'Desktop device disabled. Cleanup will run on next contact.'
          : 'Desktop device disabled.',
      );
      desktopHostStatus.refresh();
      desktopDeviceControlPlane.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to disable desktop device');
    } finally {
      setDesktopDisableDeviceId(null);
    }
  };

  const handleDesktopRootAction = async (
    deviceId: string,
    rootId: string,
    actionType: 'reindex_root' | 'purge_root_derived_store' | 'revoke_root',
  ) => {
    const inFlightKey = `${rootId}:${actionType}`;
    setDesktopRootActionKey(inFlightKey);
    try {
      const response = await fetch(
        `/api/desktop-host/devices/${encodeURIComponent(deviceId)}/roots/${encodeURIComponent(rootId)}/actions`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            actionType,
            note: 'settings_panel_requested_action',
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'desktop_root_action_failed');
      }
      desktopRootActionResponseSchema.parse(payload);
      toast.success(actionType === 'revoke_root' ? 'Managed root revoked.' : 'Managed root action queued.');
      desktopHostStatus.refresh();
      desktopDeviceControlPlane.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to queue desktop root action');
    } finally {
      setDesktopRootActionKey(null);
    }
  };

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
  const { data: recoveryCapabilities } =
    trpc.auth.getRecoveryCapabilities.useQuery(undefined, { enabled: isAuthenticated });
  const smsRecoveryEnabled = recoveryCapabilities?.sms.enabled ?? false;

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
  const { theme, toggleTheme } = useTheme();
  const { palette, setPalette, themes: astryxPalettes } = useAstryxPalette();

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
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [countryOfResidence, setCountryOfResidence] = useState('');

  const prefsQuery = trpc.users.getPreferences.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const safetyProfileStatus = trpc.users.getSafetyProfileCompletionStatus.useQuery(undefined, {
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
  const updateSafetyProfileMutation = trpc.users.updateSafetyProfile.useMutation({
    onSuccess: async () => {
      toast.success(isThaiUi ? 'บันทึกข้อมูลความปลอดภัยแล้ว' : 'Safety profile saved');
      await Promise.all([refetchPrefs(), safetyProfileStatus.refetch()]);
      const returnTo = new URLSearchParams(search).get('returnTo');
      if (returnTo) {
        setLocation(returnTo);
      }
    },
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
      toast.success(t('settings.preferences.telegramUnlinked'));
      setTelegramState('idle');
      telegramStatus.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateTelegramPrefsMutation = trpc.telegram.updateTelegramPreferences.useMutation({
    onSuccess: () => toast.success(t('settings.preferences.telegramPreferencesUpdated')),
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
    const profile = (prefsData as any)?.safetyProfile;
    if (profile?.dateOfBirth && !dateOfBirth) {
      setDateOfBirth(String(profile.dateOfBirth));
    }
    if (profile?.countryOfResidence && !countryOfResidence) {
      setCountryOfResidence(String(profile.countryOfResidence));
    }
  }, [countryOfResidence, dateOfBirth, prefsData]);

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
    const params = new URLSearchParams(search);
    const requestedTab = params.get('tab') || params.get('section');
    if (requestedTab && SETTINGS_TABS.includes(requestedTab as SettingsTab)) {
      setActiveTab(requestedTab as SettingsTab);
    }
  }, [search]);

  useEffect(() => {
    if (activeTab === "localAi" && !localClientLlmModeEnabled) {
      setActiveTab("preferences");
    }
  }, [activeTab, localClientLlmModeEnabled]);

  useEffect(() => {
    if (activeTab === "desktopHost" && !desktopHostEnabled) {
      setActiveTab("preferences");
    }
  }, [activeTab, desktopHostEnabled]);

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

  const currentUiLanguage = (SUPPORTED_LANGUAGES as readonly string[]).find(
    (lng) => (i18n.resolvedLanguage || i18n.language || 'en').startsWith(lng),
  ) ?? 'en';
  const currentUiLanguageLabel = LANGUAGE_LABELS[currentUiLanguage as keyof typeof LANGUAGE_LABELS] ?? LANGUAGE_LABELS.en;

  const tabs: Array<{ id: SettingsTab; label: string; icon: any }> = [
    { id: 'profile', label: t('settings.tabs.profile'), icon: User },
    { id: 'account', label: t('settings.tabs.account'), icon: Mail },
    { id: 'security', label: t('settings.tabs.security'), icon: Shield },
    { id: 'privateVault', label: t('settings.tabs.privateVault'), icon: Lock },
    { id: 'preferences', label: t('settings.tabs.preferences'), icon: Palette },
    { id: 'marketplaceSharing', label: currentUiLanguage === 'th' ? 'แชร์ Marketplace' : 'Marketplace Sharing', icon: Store },
    ...(localClientLlmModeEnabled
      ? [{ id: 'localAi' as const, label: t('settings.tabs.localAi'), icon: Cpu }]
      : []),
    ...(desktopHostEnabled
      ? [{ id: 'desktopHost' as const, label: t('settings.tabs.desktopHost'), icon: MonitorPlay }]
      : []),
    { id: 'notifications', label: t('settings.tabs.notifications'), icon: Bell },
    { id: 'automation', label: t('settings.tabs.automation'), icon: Bot },
    { id: 'mcpDevices', label: t('settings.tabs.mcpDevices'), icon: Plug },
    { id: 'workers', label: t('settings.tabs.workers'), icon: Key },
    { id: 'api', label: t('settings.tabs.apiKeys'), icon: Key },
    { id: 'billing', label: t('settings.tabs.billing'), icon: CreditCard },
    { id: 'integrations', label: t('settings.tabs.integrations'), icon: Link2 },
    { id: 'personas', label: t('settings.tabs.personas'), icon: UserCog },
  ];

  const handleSave = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleSaveSafetyProfile = () => {
    if (!dateOfBirth || !countryOfResidence) {
      toast.error(isThaiUi ? 'กรุณาระบุวันเกิดและประเทศที่ใช้งานปัจจุบัน' : 'Enter your date of birth and country of residence');
      return;
    }
    updateSafetyProfileMutation.mutate({
      dateOfBirth,
      countryOfResidence,
    });
  };

  const safetyProfileComplete = safetyProfileStatus.data?.complete === true;
  const safetyProfileRequiredBanner = !safetyProfileComplete ? (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-5 shadow-sm shadow-amber-200/60">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-amber-950 md:text-2xl">
              {isThaiUi ? 'จำเป็นต้องกรอกวันเกิดและประเทศที่ใช้งาน' : 'Date of birth and country are required'}
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-amber-800 md:text-base">
              {isThaiUi
                ? 'กรุณากรอกข้อมูลทั้ง 2 ช่องให้ครบก่อนใช้งานหน้าปกติ เช่น Chat, Media Studio และพื้นที่ที่มีการควบคุมตามอายุ ระบบจะใช้ข้อมูลนี้เพื่อคำนวณอายุจริง ณ วันที่ใช้งานและเลือกนโยบายความปลอดภัยที่เหมาะสม'
                : 'Complete both fields before using normal product areas such as Chat, Media Studio, and age-gated surfaces. SmartSpecPro uses this to calculate your current age and apply the right safety policy.'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => {
            const target = document.getElementById('safety-profile-required-form');
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          className="bg-amber-600 text-white hover:bg-amber-700"
        >
          {isThaiUi ? 'ไปกรอกข้อมูล' : 'Complete now'}
        </Button>
      </div>
    </div>
  ) : null;
  const safetyProfilePanel = (
    <div id="safety-profile-required-form" className={`rounded-2xl border p-5 ${safetyProfileComplete ? 'border-green-200 bg-green-50/70' : 'border-amber-300 bg-amber-50/90 ring-1 ring-amber-200'}`}>
      <div className="mb-4 flex items-start gap-3">
        <ShieldCheck className={`mt-0.5 h-5 w-5 ${safetyProfileComplete ? 'text-green-600' : 'text-amber-600'}`} />
        <div>
          <h3 className={`font-semibold ${safetyProfileComplete ? 'text-gray-900' : 'text-amber-950'}`}>
            {isThaiUi ? 'ข้อมูลอายุและประเทศที่ใช้งาน' : 'Age and country profile'}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {isThaiUi
              ? 'ระบบใช้ข้อมูลนี้เพื่อคำนวณอายุจริง ณ วันที่ใช้งาน และเลือกนโยบายความปลอดภัยที่เหมาะสมกับประเทศของคุณ'
              : 'SmartSpecPro uses this to calculate your current age and apply the right safety policy for your country.'}
          </p>
          {!safetyProfileComplete && safetyProfileStatus.data?.missingFields?.length ? (
            <p className="mt-2 text-sm font-medium text-amber-700">
              {isThaiUi ? 'ต้องกรอกข้อมูลนี้ก่อนใช้งานหน้าปกติ' : 'Required before normal product access is released.'}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            {isThaiUi ? 'วันเกิด' : 'Date of birth'}
          </label>
          <Input
            type="date"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
            max={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            {isThaiUi ? 'ประเทศที่ใช้งานปัจจุบัน' : 'Current country of residence'}
          </label>
          <select
            value={countryOfResidence}
            onChange={(event) => setCountryOfResidence(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{isThaiUi ? 'เลือกประเทศ' : 'Select country'}</option>
            {SAFETY_PROFILE_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {isThaiUi ? country.th : country.en}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-gray-500">
          {safetyProfileComplete
            ? (isThaiUi ? 'บันทึกข้อมูลแล้ว' : 'Profile completed')
            : (isThaiUi ? 'หากยังไม่กรอก ระบบจะถือว่าใช้นโยบายเทียบเท่าเด็ก' : 'Until completed, protected actions use child-safe policy.')}
        </div>
        <Button
          onClick={handleSaveSafetyProfile}
          disabled={!dateOfBirth || !countryOfResidence || updateSafetyProfileMutation.isPending}
          className="bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white"
        >
          {updateSafetyProfileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isThaiUi ? 'บันทึกข้อมูลอายุ' : 'Save safety profile'}
        </Button>
      </div>
    </div>
  );

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
            <div className="flex items-center gap-2 sm:gap-3">
              <LocaleToggle className="hidden sm:inline-flex" />
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
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        {activeTab !== 'workers' && (
          <div className="mb-6 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-cyan-950">{t('settings.workers.quickAccessTitle')}</p>
                <p className="mt-1 text-sm text-cyan-900">{t('settings.workers.quickAccessDescription')}</p>
              </div>
              <Button
                variant="outline"
                className="border-cyan-300 bg-white text-cyan-950 hover:bg-cyan-100"
                onClick={() => setActiveTab('workers')}
              >
                <Key className="mr-2 h-4 w-4" />
                {t('settings.workers.openWorkers')}
              </Button>
            </div>
          </div>
        )}
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
            <DashboardCard className="rounded-2xl border border-white/50 bg-white/70 shadow-lg shadow-blue-500/5 backdrop-blur-xl" bodyClassName="p-6">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <DashboardSectionHeader
                    eyebrow={t('settings.profile.eyebrow')}
                    title={t('settings.profile.title')}
                    description={t('settings.profile.description')}
                  />

                  {safetyProfileRequiredBanner}

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

                  {safetyProfilePanel}

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
                          <div className="text-sm text-gray-500">{t('settings.account.languageValue', { language: currentUiLanguageLabel })}</div>
                        </div>
                      </div>
                      <LocaleToggle />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-200">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                          <div className="flex-1">
                            <h3 className="font-semibold text-red-900 mb-1">{t('settings.account.deleteAccount')}</h3>
                            <p className="text-sm text-red-700 mb-3">
                              {t('settings.account.deleteAccountDescription')}
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

                  {safetyProfileRequiredBanner}

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
                        {t('settings.security.confirmNewPassword')}
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

                  {safetyProfilePanel}

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
                        {!smsRecoveryEnabled && (
                          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{t('recovery.smsUnavailable')}</span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Input
                            type="tel"
                            placeholder={t('settings.recovery.phonePlaceholder')}
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            className="flex-1"
                            disabled={!smsRecoveryEnabled || phoneStep === 'code_sent'}
                          />
                          <Button
                            variant="outline"
                            onClick={() => sendPhoneCodeMut.mutate({ phone: phoneInput })}
                            disabled={!smsRecoveryEnabled || !phoneInput || sendPhoneCodeMut.isPending || phoneStep === 'code_sent'}
                          >
                            {sendPhoneCodeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('settings.recovery.sendCode')}
                          </Button>
                        </div>
                        {smsRecoveryEnabled && phoneStep === 'code_sent' && (
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
                        <p>• {t('settings.privateVault.filesStayInside')}</p>
                        <p>• {t('settings.privateVault.useThisSpace')}</p>
                        <p>• {t('settings.privateVault.supportedFileTypes')}</p>
                        {privateVaultPrefs?.pinUpdatedAt ? (
                          <p>• {t('settings.privateVault.lastUpdated', { date: new Date(privateVaultPrefs.pinUpdatedAt).toLocaleString() })}</p>
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
                            onClick={async () => {
                                const confirmed = await confirm({
                                  title: t('settings.preferences.unlinkConfirm'),
                                  tone: 'danger',
                                });
                                if (confirmed) {
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
                  <div className="grid grid-cols-2 gap-3">
                    {(['light', 'dark'] as const).map((themeOption) => (
                          <button
                            key={themeOption}
                            onClick={() => {
                              if (theme !== themeOption) toggleTheme?.();
                            }}
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

                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">{t('settings.preferences.colorPalette')}</h3>
                      <p className="text-sm text-gray-500 mb-4">{t('settings.preferences.colorPaletteDescription')}</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {astryxPalettes.map((paletteOption) => {
                          const active = palette === paletteOption.slug;
                          return (
                            <button
                              key={paletteOption.slug}
                              type="button"
                              onClick={() => setPalette(paletteOption.slug)}
                              aria-pressed={active}
                              className={`relative flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all ${
                                active
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <span
                                className="h-6 w-6 rounded-full border border-black/10"
                                style={{ backgroundColor: getAstryxPaletteAccent(paletteOption) }}
                                aria-hidden="true"
                              />
                              <span className="font-medium text-gray-900">{paletteOption.name}</span>
                              <span className="text-xs text-gray-500 leading-snug">
                                {paletteOption.description}
                              </span>
                              {active && (
                                <Badge
                                  variant="secondary"
                                  className="absolute right-2 top-2 gap-1 text-[10px]"
                                >
                                  <Check className="h-3 w-3" />
                                  {t('settings.preferences.colorPaletteActive')}
                                </Badge>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Display Language */}
                  <DisplayLanguageDropdown
                    defaultValue={prefsData?.displayLocale || prefsData?.translationLanguage || i18n.language}
                    onLanguageChange={(lng) => setTranslationLanguage(lng)}
                  />

                  {/* Translation */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Languages className="w-5 h-5" />
                      {t('settings.translation.title')}
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
                              {translationModel || t('settings.translation.selectModel')}
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

              {activeTab === 'marketplaceSharing' && <MarketplaceSharingSettingsPanel />}

              {activeTab === 'localAi' && localClientLlmModeEnabled && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                        {t('settings.tabs.localAi')}
                      </div>
                      <h2 className="mt-1 text-xl font-semibold text-slate-900">
                        {t('settings.localAi.title')}
                      </h2>
                      <p className="mt-2 max-w-3xl text-sm text-slate-600">
                        {t('settings.localAi.description')}
                      </p>
                    </div>
                    <HelpButton
                      page="/settings"
                      topic="local-ai"
                      variant="outline"
                      size="sm"
                      label={t('settings.localAi.helpButton')}
                    />
                  </div>

                  <LocalAiSettingsSection hideHeading />
                </div>
              )}

              {activeTab === 'desktopHost' && desktopHostEnabled && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
                        {t('settings.tabs.desktopHost')}
                      </div>
                      <h2 className="mt-1 text-xl font-semibold text-slate-900">
                        {t('settings.desktopHost.title')}
                      </h2>
                      <p className="mt-2 max-w-3xl text-sm text-slate-600">
                        {t('settings.desktopHost.description')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={desktopHostEnabled
                          ? "border-emerald-200 bg-white text-emerald-700"
                          : "border-amber-200 bg-white text-amber-700"}
                      >
                        {desktopHostEnabled
                          ? t('settings.desktopHost.badges.enabled')
                          : t('settings.desktopHost.badges.preview')}
                      </Badge>
                      <HelpButton
                        page="/settings"
                        topic="desktop-host"
                        variant="outline"
                        size="sm"
                        label={t('settings.desktopHost.helpButton')}
                      />
                    </div>
                  </div>

                  <DesktopHostSettingsPanel
                    featureFlags={{
                      desktopHostEnabled,
                      desktopAdvancedLocalMode: desktopAdvancedLocalModeEnabled,
                      desktopPackageSync: desktopPackageSyncEnabled,
                      desktopAgencyRuntime: desktopAgencyRuntimeEnabled,
                      desktopWorkerProjection: desktopWorkerProjectionEnabled,
                    }}
                    status={desktopHostStatus.status}
                    statusLoading={desktopHostStatus.isLoading}
                    statusError={desktopHostStatus.error}
                    selectedDeviceId={selectedDesktopDevice?.deviceId ?? null}
                    onSelectedDeviceIdChange={setSelectedDesktopDeviceId}
                    controlPlaneState={desktopDeviceControlPlane.state}
                    controlPlaneLoading={desktopDeviceControlPlane.isLoading}
                    controlPlaneError={desktopDeviceControlPlane.error}
                    packageCatalog={desktopPackageCatalog.catalog}
                    packageCatalogLoading={desktopPackageCatalog.isLoading}
                    packageCatalogError={desktopPackageCatalog.error}
                    onDisableDevice={handleDisableDesktopDevice}
                    disableInFlightDeviceId={desktopDisableDeviceId}
                    onRequestRootAction={handleDesktopRootAction}
                    rootActionInFlightKey={desktopRootActionKey}
                    adminConsoleHref={
                      user?.role === 'admin'
                        ? '/admin/desktop-host/governance'
                        : user?.role === 'domain_admin'
                          ? '/domain-admin/desktop-host/governance'
                        : null
                    }
                  />
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

              {activeTab === 'workers' && (
                <div className="space-y-6">
              <WorkerAccessKeysPanel tenantName={tenant?.name ?? null} />
              <WorkerLocalAiPanel />
                </div>
              )}

              {activeTab === 'mcpDevices' && (
                <div className="space-y-6">
                  <ConnectedDevicesPanel />
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

                  <div className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Beam Billing Center</div>
                        <div className="text-sm text-slate-600">
                          Manage your billing profile, create PromptPay top-up checkout, and open invoice PDFs from one place.
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        className="border-cyan-300 bg-white text-cyan-700 hover:bg-cyan-50"
                        onClick={() => setLocation("/billing")}
                      >
                        Open billing center
                      </Button>
                    </div>
                  </div>

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
                  <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-4">
                    <div className="flex items-start gap-3">
                      <Plug className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                      <div>
                        <div className="font-medium text-slate-950">{t('settings.integrations.mcpBoundaryTitle')}</div>
                        <p className="mt-1 text-sm text-slate-600">{t('settings.integrations.mcpBoundaryDescription')}</p>
                      </div>
                    </div>
                  </div>
                  <UploadPostGatewayPanel tenantId={user.currentTenantId ?? null} />
                  <MarketplaceConnectorSettingsPanel />
                  <McpConnectPanel />
                  <HermesConnectPanel />
                  <McpServersSettingsPanel />
                  <GoogleDrivePanel />
                  <OneDrivePanel />
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && <NotificationPreferencesPanel />}

              {/* Personas Tab */}
              {activeTab === 'personas' && <PersonasPanel />}
            </DashboardCard>
          </motion.div>
        </div>
      </main>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {t('settings.account.deleteTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('settings.account.deleteAccountDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.account.deleteConfirmLabel')} <strong>{user?.email}</strong>
              </label>
              <input
                type="email"
                value={deleteConfirmEmail}
                onChange={(e) => {
                  setDeleteConfirmEmail(e.target.value);
                  setDeleteError('');
                }}
                placeholder={t('settings.account.deleteConfirmPlaceholder')}
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
