/**
 * Forgot Password Page - SmartAIHub
 * Design: Ethereal Gradient Flow
 * - Glassmorphism cards with aurora gradients
 * - Soft shadows and backdrop blur
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useScopedTranslation } from '@/i18n/useScopedTranslation';
import {
  Sparkles,
  Mail,
  ArrowLeft,
  CheckCircle,
  Loader2,
  KeyRound,
  Shield,
  Phone,
  MailPlus,
} from 'lucide-react';

type Channel = 'email' | 'backup_email' | 'sms';
type Step = 'choose' | 'input' | 'sent' | 'reset' | 'success';

export default function ForgotPassword() {
  const { t } = useScopedTranslation('auth');
  const [step, setStep] = useState<Step>('choose');
  const [channel, setChannel] = useState<Channel>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const destination = channel === 'sms' ? phone : email;
  const destinationLabel = channel === 'sms' ? phone : email;

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (channel === 'sms' && !phone) { toast.error(t('forgot.toast.phoneRequired')); return; }
    if (channel !== 'sms' && !email) { toast.error(t('forgot.toast.emailRequired')); return; }

    setIsLoading(true);
    try {
      const body: any = { channel };
      if (channel === 'sms') { body.phone = phone; } else { body.email = email; }

      const response = await fetch('/trpc/auth.forgotPassword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: body }),
        credentials: 'include',
      });
      const data = await response.json();
      const errorMsg = data.error?.json?.message;
      if (errorMsg) {
        toast.error(errorMsg);
      } else {
        setStep('sent');
        toast.success(channel === 'sms' ? 'Reset code sent via SMS!' : 'Reset code sent! Check your email inbox.');
      }
    } catch {
      toast.error(t('forgot.toast.sendFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) { toast.error(t('forgot.toast.enterValidCode')); return; }

    setIsLoading(true);
    try {
      const body: any = { code, channel };
      if (channel === 'sms') { body.phone = phone; } else { body.email = email; }

      const response = await fetch('/trpc/auth.verifyResetCode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: body }),
        credentials: 'include',
      });
      const data = await response.json();
      const errorMsg = data.error?.json?.message;
      if (errorMsg) { toast.error(errorMsg); } else { setStep('reset'); }
    } catch {
      toast.error(t('forgot.toast.verifyFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error(t('forgot.toast.passwordTooShort')); return; }
    if (newPassword !== confirmPassword) { toast.error(t('forgot.toast.passwordMismatch')); return; }

    setIsLoading(true);
    try {
      const body: any = { code, newPassword, channel };
      if (channel === 'sms') { body.phone = phone; } else { body.email = email; }

      const response = await fetch('/trpc/auth.resetPassword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: body }),
        credentials: 'include',
      });
      const data = await response.json();
      const errorMsg = data.error?.json?.message;
      if (errorMsg) { toast.error(errorMsg); } else { setStep('success'); toast.success(t('forgot.toast.resetSuccess')); }
    } catch {
      toast.error(t('forgot.toast.resetFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-600 via-cyan-500 to-teal-400">
        {/* Animated Background */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-300/30 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <Link href="/" className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold">SmartAIHub</span>
          </Link>

          <h1 className="text-4xl font-bold mb-6">
            Secure Account Recovery
          </h1>
          <p className="text-xl text-white/80 mb-8">
            We'll help you get back into your account safely and securely.
          </p>

          <div className="space-y-4">
            {[
              { icon: Mail, text: 'Receive a verification code via email' },
              { icon: KeyRound, text: 'Create a new secure password' },
              { icon: Shield, text: 'Your account stays protected' },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.2 }}
                className="flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="text-white/90">{item.text}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Grid Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="h-full w-full" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }} />
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Mobile Logo */}
          <Link href="/" className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">SmartAIHub</span>
          </Link>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {['choose', 'input', 'sent', 'reset', 'success'].map((s, index) => (
              <div key={s} className="flex items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                  step === s
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : ['choose', 'input', 'sent', 'reset', 'success'].indexOf(step) > index
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {['choose', 'input', 'sent', 'reset', 'success'].indexOf(step) > index ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < 4 && (
                  <div className={`w-6 h-0.5 ${
                    ['choose', 'input', 'sent', 'reset', 'success'].indexOf(step) > index
                      ? 'bg-green-500'
                      : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Form Card */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/50 shadow-xl shadow-cyan-500/10 p-8">
            <AnimatePresence mode="wait">
              {/* Step 0: Choose recovery channel */}
              {step === 'choose' && (
                <motion.div
                  key="choose"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Forgot your password?
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Choose how you'd like to receive your reset code.
                  </p>

                  <div className="space-y-3">
                    {[
                      { ch: 'email' as Channel, icon: Mail, label: 'Primary Email', desc: 'Send code to your registered email' },
                      { ch: 'backup_email' as Channel, icon: MailPlus, label: 'Backup Email', desc: 'Send code to your recovery email' },
                      { ch: 'sms' as Channel, icon: Phone, label: 'SMS', desc: 'Send code to your verified phone number' },
                    ].map((opt) => (
                      <button
                        key={opt.ch}
                        onClick={() => { setChannel(opt.ch); setStep('input'); }}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-cyan-400 hover:bg-cyan-50/50 transition-all text-left"
                      >
                        <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center shrink-0">
                          <opt.icon className="w-5 h-5 text-cyan-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{opt.label}</div>
                          <div className="text-sm text-gray-500">{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 text-center">
                    <Link href="/login" className="text-cyan-600 hover:text-cyan-700 font-medium inline-flex items-center gap-1">
                      <ArrowLeft className="w-4 h-4" />
                      Back to Sign In
                    </Link>
                  </div>
                </motion.div>
              )}

              {/* Step 1: Enter email/phone */}
              {step === 'input' && (
                <motion.div
                  key="input"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {channel === 'sms' ? 'Enter your phone number' : channel === 'backup_email' ? 'Enter your backup email' : 'Enter your email'}
                  </h2>
                  <p className="text-gray-600 mb-6">
                    {channel === 'sms' ? 'We\'ll send a code to your verified phone number.' : 'We\'ll send a reset code to this address.'}
                  </p>

                  <form onSubmit={handleSendCode} className="space-y-4">
                    <div>
                      {channel === 'sms' ? (
                        <>
                          <Label htmlFor="phone" className="text-gray-700">Phone Number (E.164)</Label>
                          <div className="relative mt-1">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                              id="phone"
                              type="tel"
                              placeholder="+66812345678"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-cyan-500 focus:ring-cyan-500"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <Label htmlFor="email" className="text-gray-700">{channel === 'backup_email' ? 'Backup Email' : 'Email Address'}</Label>
                          <div className="relative mt-1">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                              id="email"
                              type="email"
                              placeholder="you@example.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-cyan-500 focus:ring-cyan-500"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium"
                    >
                      {isLoading ? (
                        <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Sending...</>
                      ) : (
                        'Send Reset Code'
                      )}
                    </Button>
                  </form>

                  <div className="mt-6 text-center">
                    <button onClick={() => setStep('choose')} className="text-cyan-600 hover:text-cyan-700 font-medium inline-flex items-center gap-1">
                      <ArrowLeft className="w-4 h-4" /> Choose another method
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Enter Code */}
              {step === 'sent' && (
                <motion.div
                  key="sent"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto mb-6">
                    <Mail className="w-8 h-8 text-cyan-600" />
                  </div>

                  <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
                    {channel === 'sms' ? 'Check your phone' : 'Check your email'}
                  </h2>
                  <p className="text-gray-600 mb-6 text-center">
                    We sent a 6-digit code to<br />
                    <span className="font-medium text-gray-900">{destinationLabel}</span>
                  </p>

                  <form onSubmit={handleVerifyCode} className="space-y-4">
                    <div>
                      <Label htmlFor="code" className="text-gray-700">Verification Code</Label>
                      <Input
                        id="code"
                        type="text"
                        placeholder="000000"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="h-12 text-center text-2xl tracking-widest bg-white/50 border-gray-200 focus:border-cyan-500 focus:ring-cyan-500"
                        maxLength={6}
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading || code.length !== 6}
                      className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        'Verify Code'
                      )}
                    </Button>
                  </form>

                  <div className="mt-6 text-center">
                    <button
                      onClick={() => setStep('input')}
                      className="text-gray-500 hover:text-gray-700 text-sm"
                    >
                      Didn't receive the code? <span className="text-cyan-600 font-medium">Resend</span>
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Reset Password */}
              {step === 'reset' && (
                <motion.div
                  key="reset"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Create new password
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Your new password must be at least 8 characters long.
                  </p>

                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                      <Label htmlFor="newPassword" className="text-gray-700">New Password</Label>
                      <div className="relative mt-1">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          id="newPassword"
                          type="password"
                          placeholder="••••••••"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-cyan-500 focus:ring-cyan-500"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="confirmPassword" className="text-gray-700">Confirm Password</Label>
                      <div className="relative mt-1">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          id="confirmPassword"
                          type="password"
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-cyan-500 focus:ring-cyan-500"
                        />
                      </div>
                    </div>

                    {/* Password Strength Indicator */}
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className={`h-1 flex-1 rounded-full ${
                              newPassword.length >= level * 3
                                ? level <= 2
                                  ? 'bg-red-500'
                                  : level === 3
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                                : 'bg-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-gray-500">
                        {newPassword.length === 0
                          ? 'Enter a password'
                          : newPassword.length < 6
                          ? 'Too weak'
                          : newPassword.length < 9
                          ? 'Could be stronger'
                          : newPassword.length < 12
                          ? 'Good password'
                          : 'Strong password'}
                      </p>
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Resetting...
                        </>
                      ) : (
                        'Reset Password'
                      )}
                    </Button>
                  </form>
                </motion.div>
              )}

              {/* Step 4: Success */}
              {step === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-4"
                >
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-10 h-10 text-white" />
                  </div>

                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Password Reset!
                  </h2>
                  <p className="text-gray-600 mb-8">
                    Your password has been successfully reset. You can now sign in with your new password.
                  </p>

                  <Link href="/login">
                    <Button className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium">
                      Sign In Now
                    </Button>
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
