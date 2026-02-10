/**
 * Docker Redirect Page
 *
 * This page serves as an intermediate redirect after login
 * to ensure session cookies are properly set before redirecting
 * to the Docker Status subdomain for token exchange.
 *
 * Flow:
 * 1. User logs in at smartspec.local
 * 2. Redirects to /docker-redirect (this page)
 * 3. This page waits briefly to ensure cookies are set
 * 4. Redirects to docker.smartspec.local/token-exchange
 */

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function DockerRedirect() {
  useEffect(() => {
    // Get the target docker subdomain
    const hostname = window.location.hostname;
    let dockerUrl: string;

    if (hostname === 'smartaihub.app' || hostname === 'smartspec.pro') {
      dockerUrl = 'https://docker.smartaihub.app/token-exchange';
    } else if (hostname === 'smartspec.local') {
      dockerUrl = 'https://docker.smartspec.local/token-exchange';
    } else {
      // Fallback for localhost development
      dockerUrl = 'https://docker.localhost/token-exchange';
    }

    // Wait a brief moment to ensure session cookie is fully set
    // Then redirect to Docker Status token exchange page
    const timer = setTimeout(() => {
      window.location.href = dockerUrl;
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-100 mb-4">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Redirecting to Docker Status...
        </h1>
        <p className="text-gray-600 text-sm">
          Please wait a moment
        </p>
      </div>
    </div>
  );
}
