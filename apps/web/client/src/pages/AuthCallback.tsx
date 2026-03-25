/**
 * Auth Callback Page
 * Handles OAuth callback from Google/GitHub
 */

import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Sparkles, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';

export default function AuthCallback() {
  const [, params] = useRoute('/auth/callback/:provider');
  const [, setLocation] = useLocation();
  const { t } = useTranslation('auth');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState(t('callback.processing'));
  const metaCompleteOAuth = trpc.metaChannels.completeOAuth.useMutation({
    onSuccess: () => {
      setStatus('success');
      setMessage(t('callback.metaConnected') + ' ' + t('callback.redirecting'));

      setTimeout(() => {
        setLocation('/social/channels');
      }, 1500);
    },
    onError: (error) => {
      setStatus('error');
      setMessage(error.message || 'Meta connection failed');

      setTimeout(() => {
        setLocation('/social/channels');
      }, 3000);
    },
  });

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the authorization code from URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
          throw new Error(error);
        }

        if (!code) {
          throw new Error('No authorization code received');
        }

        const provider = params?.provider;
        const API_BASE_URL = import.meta.env.VITE_API_URL || '';

        // Retrieve CSRF state token
        const savedState = sessionStorage.getItem('oauth_state');
        const urlState = urlParams.get('state');
        const state = urlState || savedState || '';
        sessionStorage.removeItem('oauth_state');

        if (provider === 'meta') {
          metaCompleteOAuth.mutate({ code, state });
          return;
        }

        // Exchange code for token via OAuth endpoint
        const response = await fetch(`${API_BASE_URL}/api/oauth/${provider}/callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code, state }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Authentication failed');
        }

        const data = await response.json();

        // Exchange the Python OAuth token for a Node.js session cookie
        const sessionRes = await fetch('/trpc/auth.oauthExchangeSession', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ json: { accessToken: data.access_token, provider } }),
        });

        if (!sessionRes.ok) {
          const sessionErr = await sessionRes.json().catch(() => null);
          throw new Error(
            sessionErr?.error?.json?.message || 'Failed to create session'
          );
        }

        setStatus('success');
        setMessage(t('callback.success') + ' ' + t('callback.redirecting'));

        // Redirect to dashboard
        setTimeout(() => {
          setLocation('/dashboard');
        }, 1500);
      } catch (error) {
        console.error('Auth callback error:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : t('callback.error'));
        
        // Redirect to login after delay
        setTimeout(() => {
          setLocation('/login');
        }, 3000);
      }
    };

    handleCallback();
  }, [params?.provider, setLocation]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
      <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/50 shadow-xl shadow-purple-500/10 p-8 max-w-md w-full mx-4 text-center">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-8 h-8 text-white" />
        </div>

        {/* Status Icon */}
        <div className="mb-6">
          {status === 'loading' && (
            <Loader2 className="w-12 h-12 text-purple-500 animate-spin mx-auto" />
          )}
          {status === 'success' && (
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
          )}
          {status === 'error' && (
            <XCircle className="w-12 h-12 text-red-500 mx-auto" />
          )}
        </div>

        {/* Message */}
        <h2 className={`text-xl font-bold mb-2 ${
          status === 'error' ? 'text-red-600' : 'text-gray-900'
        }`}>
          {status === 'loading' && 'Authenticating...'}
          {status === 'success' && 'Success!'}
          {status === 'error' && 'Authentication Failed'}
        </h2>
        <p className="text-gray-600">{message}</p>

        {/* Provider Info */}
        {params?.provider && (
          <p className="text-sm text-gray-500 mt-4">
            Provider: {params.provider.charAt(0).toUpperCase() + params.provider.slice(1)}
          </p>
        )}
      </div>
    </div>
  );
}
