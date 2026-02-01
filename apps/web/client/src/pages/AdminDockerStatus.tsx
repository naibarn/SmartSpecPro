/**
 * Admin Docker Status Page
 * Embedded view of Docker Status service with authentication
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ExternalLink } from 'lucide-react';

export default function AdminDockerStatus() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    console.log('[AdminDockerStatus] Mount', { user, isLoading, isAuthenticated });
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      console.log('[AdminDockerStatus] Redirecting to login - not authenticated');
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (!isLoading && user && user.role !== 'admin') {
      setLocation('/dashboard');
    }
  }, [isLoading, user, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
          <p className="text-sm text-gray-600">Loading Docker Status...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">Admin privileges required</p>
          <Button onClick={() => setLocation('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

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
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Docker Status Monitor</h1>
                <p className="text-sm text-gray-500">Real-time container monitoring and management</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('/docker/', '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in New Tab
            </Button>
          </div>
        </div>
      </header>

      {/* Embedded Docker Status */}
      <div className="h-[calc(100vh-80px)]">
        <iframe
          src={`/docker/?t=${Date.now()}`}
          className="w-full h-full border-0"
          title="Docker Status Monitor"
          key={Date.now()}
        />
      </div>
    </div>
  );
}
