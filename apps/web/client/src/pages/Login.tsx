/**
 * Login Page - SmartAIHub
 * User authentication with multiple providers
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'wouter';
import { generateFingerprint } from '@/lib/fingerprint';
import { getPostHog } from '@/lib/posthog';
import {
  clearPendingOAuthTwoFactor,
  getPendingOAuthTwoFactor,
  getRequestedAuthReturnUrl,
  rememberAuthReturnUrl,
} from '@/lib/authRedirects';
import { getSmartSpecWebEndpoint } from '@/lib/webRuntime';
import { hasTauriRuntime } from '@/lib/webRuntime';
import { useAuth } from '@/_core/hooks/useAuth';
import {
  setAuthRefreshToken,
  setAuthToken,
  setUser as setDesktopAuthUser,
  signInDesktopWithBrowser,
} from '@/services/authService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';
import { useScopedTranslation } from '@/i18n/useScopedTranslation';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  Github,
  Chrome,
  RefreshCw,
  AlertTriangle,
  Shield,
} from 'lucide-react';

const ALLOWED_OAUTH_ORIGINS = [
  'https://accounts.google.com/',
  'https://github.com/login/oauth/authorize',
];

type LoginResponsePayload = {
  result?: {
    data?: {
      json?: {
        success?: boolean;
        requires2FA?: boolean;
        email?: string;
        hasBackupEmail?: boolean;
        hasPhone?: boolean;
        user?: {
          id?: string | number;
          email?: string | null;
          name?: string | null;
          currentTenantId?: string | number | null;
        };
        message?: string;
      };
    };
  };
  error?: {
    json?: {
      message?: string;
    };
  };
};

type DesktopLoginResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: {
    id?: string | number;
    email?: string | null;
    name?: string | null;
    role?: string | null;
  };
  error?: {
    message?: string;
  };
  requiresBrowserSignIn?: boolean;
  reason?: string;
};

async function parseJsonResponse(response: Response): Promise<unknown | null> {
  const raw = await response.text();
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function extractDesktopLoginMessage(
  response: Response,
  payload: DesktopLoginResponse | null,
  t: (key: string, options?: Record<string, string | number>) => string,
) {
  const message = payload?.error?.message ?? "";
  const reason = payload?.reason ?? "";

  if (payload?.requiresBrowserSignIn || reason === "social_login_requires_browser" || reason === "two_factor_requires_browser") {
    return t("login.toast.desktopBrowserRequired");
  }

  if (response.status === 401) {
    return t("login.invalidCredentials");
  }

  if (response.status === 403) {
    return message || t("login.toast.emailVerificationRequired");
  }

  if (response.status === 409) {
    return message || t("login.toast.desktopBrowserRequired");
  }

  if (response.status === 429) {
    return message || t("login.toast.accountLocked");
  }

  if (response.status >= 500) {
    return message || t("login.toast.serverError");
  }

  return message || t("login.toast.unexpectedResponse");
}

function extractWebLoginMessage(
  response: Response,
  payload: LoginResponsePayload | null,
  t: (key: string, options?: Record<string, string | number>) => string,
) {
  const result = payload?.result?.data?.json;
  const errorMessage = payload?.error?.json?.message ?? result?.message ?? "";

  if (result?.requires2FA) {
    return "";
  }

  if (response.status === 401) {
    return t("login.invalidCredentials");
  }

  if (response.status === 403) {
    return errorMessage || t("login.toast.emailVerificationRequired");
  }

  if (response.status === 429) {
    return errorMessage || t("login.toast.accountLocked");
  }

  if (response.status >= 500) {
    return errorMessage || t("login.toast.serverError");
  }

  return errorMessage || t("login.toast.unexpectedResponse");
}

function toDesktopAuthUser(user: NonNullable<DesktopLoginResponse["user"]>) {
  const email = user.email ?? "";
  return {
    id: String(user.id ?? email),
    email,
    full_name: user.name ?? email.split("@")[0] ?? "",
    is_admin: user.role === "admin",
  };
}

export default function Login() {
  const { t } = useScopedTranslation('auth');
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBrowserSignInLoading, setIsBrowserSignInLoading] = useState(false);
  const [browserSignInCode, setBrowserSignInCode] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAEmail, setTwoFAEmail] = useState('');
  const [has2FABackup, setHas2FABackup] = useState({ email: false, phone: false });
  const [show2FAReset, setShow2FAReset] = useState(false);
  const [resetChannel, setResetChannel] = useState<'backup_email' | 'sms'>('backup_email');
  const [resetCode, setResetCode] = useState('');
  const [resetStep, setResetStep] = useState<'choose' | 'sent' | 'done'>('choose');

  const getReturnUrl = () => getRequestedAuthReturnUrl() ?? '/dashboard';
  const redirectToReturnUrl = (returnUrl: string) => {
    if (returnUrl.startsWith('http://') || returnUrl.startsWith('https://')) {
      window.location.href = returnUrl;
      return;
    }

    navigate(returnUrl);
  };

  // Redirect to dashboard (or returnUrl) if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      redirectToReturnUrl(getReturnUrl());
    }
  }, [authLoading, user, navigate]);

  // Check which OAuth providers are configured
  const { data: oauthProviders } = trpc.auth.oauthProviders.useQuery();
  const { data: recoveryCapabilities } = trpc.auth.getRecoveryCapabilities.useQuery();
  const googleLoginEnabled = oauthProviders?.google === true;
  const githubLoginEnabled = oauthProviders?.github === true;
  const hasAnySocial = googleLoginEnabled || githubLoginEnabled;
  const smsRecoveryEnabled = recoveryCapabilities?.sms.enabled ?? false;

  // Generate device fingerprint on mount (stored as __fp cookie)
  useEffect(() => { generateFingerprint().catch(() => {}); }, []);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('returnUrl') || params.get('redirect')) {
      rememberAuthReturnUrl(getReturnUrl());
    }

    if (params.get('mode') !== '2fa') {
      return;
    }

    const pending = getPendingOAuthTwoFactor();
    if (!pending) {
      return;
    }

    setNeeds2FA(true);
    setTwoFAEmail(pending.email);
    setHas2FABackup({ email: pending.hasBackupEmail, phone: pending.hasPhone });
    setShow2FAReset(false);
    setResetCode('');
    setResetStep('choose');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    getPostHog()?.capture("login_started", { auth_method: "email" });
    setIsLoading(true);

    try {
      const isDesktop = hasTauriRuntime();
      const endpoint = isDesktop ? '/auth/desktop/login' : '/trpc/auth.login';
      const response = await fetch(getSmartSpecWebEndpoint(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          isDesktop
            ? { email, password }
            : { json: { email, password } },
        ),
        credentials: isDesktop ? 'omit' : 'include',
      });

      const data = await parseJsonResponse(response);

      if (isDesktop) {
        const payload = data as DesktopLoginResponse | null;
        const desktopUser = payload?.user ?? null;
        if (response.ok && payload?.access_token && payload?.refresh_token && desktopUser) {
          await setAuthToken(payload.access_token);
          await setAuthRefreshToken(payload.refresh_token);
          await setDesktopAuthUser(toDesktopAuthUser(desktopUser));

          const loginUserId = desktopUser.id;
          if (loginUserId != null) getPostHog()?.identify(String(loginUserId));
          getPostHog()?.capture("login_succeeded", { auth_method: "email", runtime: "desktop" });
          toast.success(t('login.toast.success'));
          clearPendingOAuthTwoFactor();
          redirectToReturnUrl(getReturnUrl());
          return;
        }

        const errorMessage = extractDesktopLoginMessage(response, payload, t);
        const reason = response.status === 401 ? 'invalid_credentials'
          : response.status === 403 ? 'email_not_verified'
          : response.status === 409 ? 'browser_sign_in_required'
          : response.status === 429 ? 'account_locked'
          : response.status >= 500 ? 'server_error'
          : 'unexpected_response';
        getPostHog()?.capture("login_failed", { failure_reason: reason, auth_method: "email", runtime: "desktop" });
        if (errorMessage.toLowerCase().includes('verify your email')) {
          setNeedsVerification(true);
        }
        toast.error(errorMessage);
        return;
      }

      const payload = data as LoginResponsePayload | null;
      const result = payload?.result?.data?.json;

      if (result?.requires2FA) {
        clearPendingOAuthTwoFactor();
        setNeeds2FA(true);
        setTwoFAEmail(result.email ?? email);
        setHas2FABackup({ email: !!result.hasBackupEmail, phone: !!result.hasPhone });
        return;
      }

      if (result?.success) {
        const loginUserId = result.user?.id || result.user?.currentTenantId;
        if (loginUserId) getPostHog()?.identify(String(loginUserId));
        getPostHog()?.capture("login_succeeded", { auth_method: "email", runtime: "web" });
        toast.success(t('login.toast.success'));
        setNeedsVerification(false);
        clearPendingOAuthTwoFactor();
        redirectToReturnUrl(getReturnUrl());
      } else {
        const errorMessage = extractWebLoginMessage(response, payload, t);
        const reason = response.status === 401 ? 'invalid_credentials'
          : response.status === 403 ? 'email_not_verified'
          : response.status === 429 ? 'account_locked'
          : response.status >= 500 ? 'server_error'
          : 'unexpected_response';
        getPostHog()?.capture("login_failed", { failure_reason: reason, auth_method: "email", runtime: "web" });
        if (errorMessage.toLowerCase().includes('verify your email')) {
          setNeedsVerification(true);
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('Login error:', error);
      getPostHog()?.capture("login_failed", { failure_reason: "network_error", auth_method: "email", runtime: hasTauriRuntime() ? "desktop" : "web" });
      toast.error(
        hasTauriRuntime()
          ? t('login.toast.networkError')
          : t('login.toast.failed'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDesktopBrowserSignIn = async () => {
    getPostHog()?.capture("login_started", { auth_method: "browser", runtime: "desktop" });
    rememberAuthReturnUrl(getReturnUrl());
    setIsBrowserSignInLoading(true);
    setBrowserSignInCode('');

    try {
      const desktopUser = await signInDesktopWithBrowser({
        onUserCode: setBrowserSignInCode,
      });
      if (desktopUser.id) getPostHog()?.identify(String(desktopUser.id));
      getPostHog()?.capture("login_succeeded", { auth_method: "browser", runtime: "desktop" });
      toast.success(t('login.toast.success'));
      clearPendingOAuthTwoFactor();
      redirectToReturnUrl(getReturnUrl());
    } catch (error) {
      console.error('Desktop browser sign-in error:', error);
      getPostHog()?.capture("login_failed", {
        failure_reason: "browser_sign_in_failed",
        auth_method: "browser",
        runtime: "desktop",
      });
      toast.error(error instanceof Error ? error.message : t('login.toast.desktopBrowserFailed'));
    } finally {
      setIsBrowserSignInLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      toast.error(t('login.toast.emailRequired'));
      return;
    }
    setIsResending(true);
    try {
      const response = await fetch(getSmartSpecWebEndpoint('/trpc/auth.resendVerification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { email } }),
        credentials: 'include',
      });
      const data = await response.json();
      const errorMsg = data.error?.json?.message;
      if (errorMsg) {
        toast.error(errorMsg);
      } else {
        toast.success(t('login.toast.codeSentEmail'));
        setResendCountdown(60);
      }
    } catch {
      toast.error(t('login.toast.resendFailed'));
    } finally {
      setIsResending(false);
    }
  };

  const handle2FAVerify = async () => {
    if (!twoFACode) { toast.error(t('login.toast.enterCode')); return; }
    setIsLoading(true);
    try {
      const response = await fetch(getSmartSpecWebEndpoint('/trpc/auth.verify2FA'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { email: twoFAEmail, code: twoFACode } }),
        credentials: 'include',
      });
      const data = await response.json();
      const result = data.result?.data?.json;
      const err = data.error?.json?.message;
      if (err) { toast.error(err); return; }
      if (result?.success) {
        if (result.usedRecoveryCode) {
          toast.success(t('login.toast.signedInRecovery', { count: result.recoveryCodesRemaining }));
        } else {
          toast.success(t('login.toast.success'));
        }
        clearPendingOAuthTwoFactor();
        redirectToReturnUrl(getReturnUrl());
      }
    } catch { toast.error(t('login.toast.verifyFailed')); } finally { setIsLoading(false); }
  };

  const handle2FAResetRequest = async () => {
    if (resetChannel === 'sms' && !smsRecoveryEnabled) {
      toast.error(t('recovery.smsUnavailable'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(getSmartSpecWebEndpoint('/trpc/auth.request2FAReset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { email: twoFAEmail, channel: resetChannel } }),
        credentials: 'include',
      });
      const data = await response.json();
      const err = data.error?.json?.message;
      if (err) { toast.error(err); return; }
      toast.success(t('login.toast.resetCodeSent'));
      setResetStep('sent');
    } catch { toast.error(t('login.toast.resetCodeFailed')); } finally { setIsLoading(false); }
  };

  const handle2FAResetConfirm = async () => {
    if (resetCode.length !== 6) { toast.error(t('login.toast.enterSixDigit')); return; }
    setIsLoading(true);
    try {
      const response = await fetch(getSmartSpecWebEndpoint('/trpc/auth.confirm2FAReset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { email: twoFAEmail, code: resetCode, channel: resetChannel } }),
        credentials: 'include',
      });
      const data = await response.json();
      const result = data.result?.data?.json;
      const err = data.error?.json?.message;
      if (err) { toast.error(err); return; }
      if (result?.success) {
        toast.success('2FA disabled. You are now signed in.');
        clearPendingOAuthTwoFactor();
        redirectToReturnUrl(getReturnUrl());
      }
    } catch { toast.error(t('login.toast.resetFailed')); } finally { setIsLoading(false); }
  };

  const handleSocialLogin = async (provider: string) => {
    const normalizedProvider = provider.toLowerCase();
    if (normalizedProvider === 'google' && !googleLoginEnabled) {
      toast.error(t('login.googleUnavailableToast'));
      return;
    }

    try {
      rememberAuthReturnUrl(getReturnUrl());

      const response = await fetch(getSmartSpecWebEndpoint(`/api/oauth/${normalizedProvider}/authorize`));
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        if (response.status === 503) {
          toast.error(`${provider} OAuth is not configured. Please contact your administrator.`);
        } else {
          toast.error(err?.detail || `${provider} login is currently unavailable`);
        }
        return;
      }
      const data = await response.json();
      sessionStorage.setItem('oauth_state', data.state);
      const redirectUrl = data.authorization_url;

      if (!ALLOWED_OAUTH_ORIGINS.some((origin) => redirectUrl.startsWith(origin))) {
        toast.error(t('login.toast.oauthFailed'));
        return;
      }

      window.location.href = redirectUrl;
    } catch {
      toast.error(t('login.toast.oauthFailed'));
    }
  };

  const isDesktopRuntime = hasTauriRuntime();

  // Show loading while checking auth or redirecting
  if (authLoading || user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center animate-pulse">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400">
          <div className="absolute inset-0 opacity-20">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#grid)" />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center p-12 text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Link href="/" className="flex items-center gap-3 mb-12">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold">SmartAIHub</span>
            </Link>

            <h1 className="text-4xl font-bold mb-6">
              {t('login.title')}
            </h1>
            <p className="text-xl text-white/80 mb-8">
              {t('login.subtitle')}
            </p>

            {/* Features List */}
            <div className="space-y-4">
              {[
                'Generate production-ready code in seconds',
                'Access 50+ AI models and templates',
                'Collaborate with your team in real-time',
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <span className="text-white/90">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute top-20 right-20 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl" />
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Mobile Logo */}
          <Link href="/" className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">SmartAIHub</span>
          </Link>

          <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/50 shadow-xl shadow-purple-500/10 p-8">
            {needs2FA ? (
              /* ── 2FA Challenge ── */
              show2FAReset ? (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                      <Shield className="w-7 h-7 text-amber-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Reset Two-Factor Authentication</h2>
                    <p className="text-sm text-gray-500 mt-1">Verify your identity to disable 2FA</p>
                  </div>

                  {resetStep === 'choose' && (
                    <div className="space-y-3">
                      {has2FABackup.email && (
                        <button
                          onClick={() => { setResetChannel('backup_email'); handle2FAResetRequest(); }}
                          disabled={isLoading}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-purple-400 hover:bg-purple-50/50 text-left"
                        >
                          <Mail className="w-5 h-5 text-purple-600" />
                          <div>
                            <div className="text-sm font-medium">Send code to backup email</div>
                          </div>
                        </button>
                      )}
                      {has2FABackup.phone && (
                        <button
                          onClick={() => { if (smsRecoveryEnabled) { setResetChannel('sms'); handle2FAResetRequest(); } }}
                          disabled={isLoading || !smsRecoveryEnabled}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${
                            smsRecoveryEnabled
                              ? 'border-gray-200 hover:border-purple-400 hover:bg-purple-50/50'
                              : 'cursor-not-allowed border-gray-200 bg-gray-50/60 opacity-60'
                          }`}
                        >
                          <Lock className="w-5 h-5 text-purple-600" />
                          <div>
                            <div className="text-sm font-medium">Send code via SMS</div>
                            {!smsRecoveryEnabled && (
                              <div className="text-xs text-amber-700">{t('recovery.smsUnavailable')}</div>
                            )}
                          </div>
                        </button>
                      )}
                      {!has2FABackup.email && !has2FABackup.phone && (
                        <p className="text-sm text-gray-500 text-center">No backup methods available. Please contact support.</p>
                      )}
                      <button onClick={() => setShow2FAReset(false)} className="w-full text-sm text-purple-600 hover:text-purple-700 mt-2">
                        Back to 2FA verification
                      </button>
                    </div>
                  )}

                  {resetStep === 'sent' && (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600 text-center">Enter the 6-digit code we sent to your {resetChannel === 'sms' ? 'phone' : 'backup email'}.</p>
                      <Input
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        className="text-center text-lg font-mono tracking-widest"
                      />
                      <Button onClick={handle2FAResetConfirm} disabled={isLoading || resetCode.length !== 6} className="w-full bg-gradient-to-r from-purple-600 to-pink-500">
                        {isLoading ? 'Verifying...' : 'Verify & Disable 2FA'}
                      </Button>
                      <button onClick={() => { setResetStep('choose'); setResetCode(''); }} className="w-full text-sm text-gray-500">
                        Try another method
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                      <Shield className="w-7 h-7 text-purple-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Two-Factor Authentication</h2>
                    <p className="text-sm text-gray-500 mt-1">Enter the code from your authenticator app, or use a recovery code</p>
                  </div>

                  <Input
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value)}
                    placeholder="6-digit code or recovery code"
                    className="text-center text-lg font-mono tracking-widest"
                    onKeyDown={(e) => { if (e.key === 'Enter') handle2FAVerify(); }}
                    autoFocus
                  />

                  <Button
                    onClick={handle2FAVerify}
                    disabled={isLoading || !twoFACode}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600"
                  >
                    {isLoading ? 'Verifying...' : 'Verify'}
                  </Button>

                  <div className="flex items-center justify-between text-sm">
                    <button onClick={() => { clearPendingOAuthTwoFactor(); setNeeds2FA(false); setTwoFACode(''); }} className="text-gray-500 hover:text-gray-700">
                      Back to login
                    </button>
                    {(has2FABackup.email || has2FABackup.phone) && (
                      <button onClick={() => setShow2FAReset(true)} className="text-purple-600 hover:text-purple-700 font-medium">
                        Can't access your 2FA?
                      </button>
                    )}
                  </div>
                </div>
              )
            ) : (
            <>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('login.signIn')}</h2>
              <p className="text-gray-600">
                Don't have an account?{' '}
                <Link href="/signup" className="text-purple-600 hover:text-purple-700 font-medium">
                  Sign up free
                </Link>
              </p>
            </div>

            {isDesktopRuntime && (
              <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/80 p-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDesktopBrowserSignIn}
                  disabled={isLoading || isBrowserSignInLoading}
                  className="w-full border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                >
                  {isBrowserSignInLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      {t('login.desktopBrowserWaiting')}
                    </>
                  ) : (
                    <>
                      <Chrome className="w-5 h-5 mr-2 text-[#4285F4]" />
                      {t('login.desktopBrowserSignIn')}
                    </>
                  )}
                </Button>
                <p className="mt-3 text-xs leading-5 text-blue-800">
                  {t('login.desktopBrowserSignInHint')}
                </p>
                {browserSignInCode && (
                  <p className="mt-2 rounded-lg bg-white px-3 py-2 text-center text-xs font-semibold text-blue-900">
                    {t('login.desktopBrowserCode', { code: browserSignInCode })}
                  </p>
                )}
                <div className="relative mt-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-blue-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 bg-blue-50 text-blue-700">{t('login.continueWithEmailDivider')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Social Login Buttons */}
            {!isDesktopRuntime && (oauthProviders || hasAnySocial) && (
              <>
                <div className={`grid ${githubLoginEnabled ? 'grid-cols-2' : 'grid-cols-1'} gap-3 mb-3`}>
                  <Button
                    variant="outline"
                    onClick={() => handleSocialLogin('Google')}
                    disabled={!googleLoginEnabled}
                    className="bg-white hover:bg-gray-50 border-gray-200 disabled:cursor-not-allowed disabled:border-amber-200 disabled:bg-amber-50/60 disabled:text-gray-500"
                  >
                    <Chrome className="w-5 h-5 mr-2 text-[#4285F4]" />
                    Google
                  </Button>
                  {githubLoginEnabled && (
                    <Button
                      variant="outline"
                      onClick={() => handleSocialLogin('GitHub')}
                      className="bg-white hover:bg-gray-50 border-gray-200"
                    >
                      <Github className="w-5 h-5 mr-2" />
                      GitHub
                    </Button>
                  )}
                </div>

                {oauthProviders && !googleLoginEnabled && (
                  <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                    <p>{t('login.googleUnavailableMessage')}</p>
                  </div>
                )}

                {/* Divider */}
                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-gray-500">or continue with email</span>
                  </div>
                </div>
              </>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="pl-10 bg-white/50 border-gray-200 focus:border-purple-400 focus:ring-purple-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="pl-10 pr-10 bg-white/50 border-gray-200 focus:border-purple-400 focus:ring-purple-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  />
                  <label htmlFor="remember" className="text-sm text-gray-600 cursor-pointer">
                    Remember me
                  </label>
                </div>
                <Link href="/forgot-password" className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                disabled={isLoading || isBrowserSignInLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white py-3 rounded-xl shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-300"
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            {/* Email not verified banner */}
            {needsVerification && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">Email not verified</p>
                    <p className="text-xs text-amber-600 mt-1">
                      Please verify your email before logging in. Check your inbox or request a new code.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleResendVerification}
                        disabled={isResending || resendCountdown > 0}
                        className="text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                      >
                        {isResending ? (
                          <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Sending...</>
                        ) : resendCountdown > 0 ? (
                          `Resend in ${resendCountdown}s`
                        ) : (
                          <><Mail className="w-3 h-3 mr-1" /> Resend Code</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { window.location.href = `/verify-email?email=${encodeURIComponent(email)}`; }}
                        className="text-xs border-purple-300 text-purple-700 hover:bg-purple-100"
                      >
                        Go to Verify Page
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Terms */}
            <p className="text-xs text-gray-500 text-center mt-6">
              By signing in, you agree to our{' '}
              <Link href="/terms" className="text-purple-600 hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-purple-600 hover:underline">
                Privacy Policy
              </Link>
            </p>
            </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
