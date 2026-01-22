import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useLocation } from 'wouter';

export default function Login() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [fromRedirect, setFromRedirect] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if we came from a redirect (to prevent loops)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'redirect') {
      setFromRedirect(true);
      setIsCheckingAuth(false);
    } else {
      // Wait for auth check to complete
      setTimeout(() => {
        setIsCheckingAuth(false);
      }, 1500);
    }
  }, []);

  // If user is authenticated and is admin, redirect to home
  useEffect(() => {
    if (!isAuthLoading && !isCheckingAuth && user && user.role === 'admin') {
      setLocation('/');
    }
  }, [isAuthLoading, isCheckingAuth, user, setLocation]);

  // Redirect to SmartSpec Web login page
  const hostname = window.location.hostname;

  // Determine the main site URL based on current hostname
  let mainSiteUrl: string;
  if (hostname === 'docker.smartspec.pro') {
    mainSiteUrl = 'https://smartspec.pro';
  } else if (hostname === 'docker.smartspec.local') {
    mainSiteUrl = 'https://smartspec.local';
  } else if (hostname === 'docker.localhost') {
    mainSiteUrl = 'https://localhost';
  } else {
    // Fallback for direct port access (localhost:3001)
    mainSiteUrl = 'https://localhost';
  }

  // Redirect to main site's docker-redirect page after login
  // This intermediate page ensures cookies are set before redirecting to token-exchange
  const dockerRedirectUrl = `${mainSiteUrl}/docker-redirect`;
  const returnUrl = encodeURIComponent(dockerRedirectUrl);
  const loginUrl = `${mainSiteUrl}/login?returnUrl=${returnUrl}`;

  useEffect(() => {
    // Only auto-redirect if:
    // 1. NOT coming from a redirect (prevent loop)
    // 2. Auth check is complete
    // 3. User is not authenticated or not admin
    if (!fromRedirect && !isCheckingAuth && !isAuthLoading) {
      if (!user || user.role !== 'admin') {
        // Redirect immediately to prevent any API calls
        window.location.href = loginUrl;
      }
    }
  }, [loginUrl, fromRedirect, isCheckingAuth, isAuthLoading, user]);

  const handleManualRedirect = () => {
    window.location.href = loginUrl;
  };

  // Show loading while checking auth
  if (isAuthLoading || isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-8 shadow-2xl">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/20 mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
              </div>
              <h1 className="text-xl font-bold text-white mb-2">
                Checking authentication...
              </h1>
              <p className="text-gray-400 text-sm">
                Please wait
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If user is already authenticated as admin, show success message
  if (user && user.role === 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-8 shadow-2xl">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h1 className="text-xl font-bold text-white mb-2">
                Already authenticated
              </h1>
              <p className="text-gray-400 text-sm mb-4">
                Redirecting to dashboard...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show error if redirect loop detected
  if (fromRedirect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-8 shadow-2xl">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 mb-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">
                Admin Access Required
              </h1>
              <p className="text-gray-400 text-sm mb-4">
                You must be logged in as an admin to access Docker Status
              </p>
              <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-6" />
            </div>

            <div className="space-y-4">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-yellow-300 text-sm text-center">
                  <strong>Note:</strong> Make sure you're logged in to SmartSpec Web with an admin account.
                </p>
              </div>

              <button
                onClick={handleManualRedirect}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 group"
              >
                Go to Login
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <div className="text-center">
                <p className="text-gray-500 text-xs">
                  If you're already logged in, make sure your account has admin role.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default: show redirect message
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/20 mb-4 animate-pulse">
              <LogIn className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Docker Status Monitor
            </h1>
            <p className="text-gray-400 text-sm mb-4">
              Admin access required
            </p>
            <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-6" />
          </div>

          {/* Redirect Message */}
          <div className="space-y-6">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-blue-300 text-sm text-center mb-2">
                Redirecting to SmartSpec login...
              </p>
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
              </div>
            </div>

            <button
              onClick={handleManualRedirect}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 group"
            >
              Go to Login
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Info */}
          <div className="mt-6 text-center">
            <p className="text-gray-500 text-xs">
              You will be redirected to the main SmartSpec login page.
              <br />
              After logging in, you'll return here automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
