/**
 * Login Page - SmartSpec Pro
 * User authentication with multiple providers
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'wouter';
import { generateFingerprint } from '@/lib/fingerprint';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
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

export default function Login() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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

  // Redirect to dashboard (or returnUrl) if already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      const redirectUrl = getReturnUrl();
      // Use window.location.href for external URLs, navigate() for internal paths
      if (redirectUrl.startsWith('http://') || redirectUrl.startsWith('https://')) {
        window.location.href = redirectUrl;
      } else {
        navigate(redirectUrl);
      }
    }
  }, [authLoading, user, navigate]);

  // Generate device fingerprint on mount (stored as __fp cookie)
  useEffect(() => { generateFingerprint().catch(() => {}); }, []);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  // Get returnUrl from query params (with strict domain allowlist)
  const getReturnUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const returnUrl = params.get('returnUrl');
    if (returnUrl) {
      try {
        const url = new URL(returnUrl);
        const currentHost = window.location.hostname;
        const ALLOWED_HOSTS = [currentHost, 'smartspec.pro', 'smartaihub.app', 'smartspec.local'];
        const isAllowed = ALLOWED_HOSTS.some(h =>
          url.hostname === h || url.hostname.endsWith('.' + h)
        );
        if (isAllowed) {
          return returnUrl;
        }
      } catch {
        // Invalid URL, ignore
      }
    }
    return '/dashboard';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Call login API
      const response = await fetch('/trpc/auth.login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          json: { email, password }
        }),
        credentials: 'include',
      });

      const data = await response.json();

      // Extract the response from tRPC structure: { result: { data: { json: {...} } } }
      const result = data.result?.data?.json;

      if (result?.requires2FA) {
        setNeeds2FA(true);
        setTwoFAEmail(result.email);
        setHas2FABackup({ email: result.hasBackupEmail, phone: result.hasPhone });
        return;
      }

      if (result?.success) {
        toast.success('Login successful! Redirecting...');
        setNeedsVerification(false);
        const redirectUrl = getReturnUrl();
        window.location.href = redirectUrl;
      } else {
        const errorMessage = result?.message || data.error?.json?.message || 'Invalid email or password';
        if (errorMessage.toLowerCase().includes('verify your email')) {
          setNeedsVerification(true);
        }
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      toast.error('Please enter your email address first');
      return;
    }
    setIsResending(true);
    try {
      const response = await fetch('/trpc/auth.resendVerification', {
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
        toast.success('Verification code sent! Check your email inbox.');
        setResendCountdown(60);
      }
    } catch {
      toast.error('Failed to resend verification code');
    } finally {
      setIsResending(false);
    }
  };

  const handle2FAVerify = async () => {
    if (!twoFACode) { toast.error('Please enter your code'); return; }
    setIsLoading(true);
    try {
      const response = await fetch('/trpc/auth.verify2FA', {
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
          toast.success(`Signed in. ${result.recoveryCodesRemaining} recovery codes remaining.`);
        } else {
          toast.success('Login successful! Redirecting...');
        }
        window.location.href = getReturnUrl();
      }
    } catch { toast.error('Verification failed'); } finally { setIsLoading(false); }
  };

  const handle2FAResetRequest = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/trpc/auth.request2FAReset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { email: twoFAEmail, channel: resetChannel } }),
        credentials: 'include',
      });
      const data = await response.json();
      const err = data.error?.json?.message;
      if (err) { toast.error(err); return; }
      toast.success('Reset code sent!');
      setResetStep('sent');
    } catch { toast.error('Failed to send reset code'); } finally { setIsLoading(false); }
  };

  const handle2FAResetConfirm = async () => {
    if (resetCode.length !== 6) { toast.error('Enter the 6-digit code'); return; }
    setIsLoading(true);
    try {
      const response = await fetch('/trpc/auth.confirm2FAReset', {
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
        window.location.href = getReturnUrl();
      }
    } catch { toast.error('Reset failed'); } finally { setIsLoading(false); }
  };

  const handleSocialLogin = async (provider: string) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${API_BASE_URL}/api/oauth/${provider.toLowerCase()}/authorize`);
      if (!response.ok) {
        const err = await response.json();
        toast.error(err.detail || `${provider} login not available`);
        return;
      }
      const data = await response.json();
      // Store state for CSRF validation on callback
      sessionStorage.setItem('oauth_state', data.state);
      // Redirect to provider's auth page
      window.location.href = data.authorization_url;
    } catch (error) {
      toast.error(`Failed to initiate ${provider} login`);
    }
  };

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
              <span className="text-2xl font-bold">SmartSpec Pro</span>
            </Link>

            <h1 className="text-4xl font-bold mb-6">
              Welcome back to the future of development
            </h1>
            <p className="text-xl text-white/80 mb-8">
              Sign in to continue building amazing applications with AI-powered tools.
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
            <span className="text-xl font-bold text-gray-900">SmartSpec Pro</span>
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
                          onClick={() => { setResetChannel('sms'); handle2FAResetRequest(); }}
                          disabled={isLoading}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-purple-400 hover:bg-purple-50/50 text-left"
                        >
                          <Lock className="w-5 h-5 text-purple-600" />
                          <div>
                            <div className="text-sm font-medium">Send code via SMS</div>
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
                    <button onClick={() => { setNeeds2FA(false); setTwoFACode(''); }} className="text-gray-500 hover:text-gray-700">
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
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in to your account</h2>
              <p className="text-gray-600">
                Don't have an account?{' '}
                <Link href="/signup" className="text-purple-600 hover:text-purple-700 font-medium">
                  Sign up free
                </Link>
              </p>
            </div>

            {/* Social Login Buttons */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Button
                variant="outline"
                onClick={() => handleSocialLogin('Google')}
                className="bg-white hover:bg-gray-50 border-gray-200"
              >
                <Chrome className="w-5 h-5 mr-2 text-[#4285F4]" />
                Google
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSocialLogin('GitHub')}
                className="bg-white hover:bg-gray-50 border-gray-200"
              >
                <Github className="w-5 h-5 mr-2" />
                GitHub
              </Button>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">or continue with email</span>
              </div>
            </div>

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
                disabled={isLoading}
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
