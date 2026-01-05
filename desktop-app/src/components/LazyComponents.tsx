/**
 * SmartSpec Pro - Lazy Loading Components
 * Priority 5: Performance Optimization
 * 
 * Features:
 * - Code splitting with React.lazy
 * - Suspense boundaries with fallbacks
 * - Error boundaries for lazy components
 * - Preloading utilities
 */

import React, { Suspense, lazy, ComponentType, useState, useEffect } from 'react';

// Loading spinner component
const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; message?: string }> = ({ 
  size = 'md', 
  message 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-gray-300 border-t-blue-600`} />
      {message && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{message}</p>
      )}
    </div>
  );
};

// Skeleton loader for different component types
const SkeletonLoader: React.FC<{ type: 'card' | 'list' | 'form' | 'dashboard' }> = ({ type }) => {
  const skeletonBase = "animate-pulse bg-gray-200 dark:bg-gray-700 rounded";
  
  switch (type) {
    case 'card':
      return (
        <div className="p-6 space-y-4">
          <div className={`${skeletonBase} h-6 w-1/3`} />
          <div className={`${skeletonBase} h-4 w-full`} />
          <div className={`${skeletonBase} h-4 w-2/3`} />
          <div className={`${skeletonBase} h-32 w-full`} />
        </div>
      );
    
    case 'list':
      return (
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <div className={`${skeletonBase} h-10 w-10 rounded-full`} />
              <div className="flex-1 space-y-2">
                <div className={`${skeletonBase} h-4 w-1/4`} />
                <div className={`${skeletonBase} h-3 w-1/2`} />
              </div>
            </div>
          ))}
        </div>
      );
    
    case 'form':
      return (
        <div className="p-6 space-y-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className={`${skeletonBase} h-4 w-1/4`} />
              <div className={`${skeletonBase} h-10 w-full`} />
            </div>
          ))}
          <div className={`${skeletonBase} h-10 w-32`} />
        </div>
      );
    
    case 'dashboard':
      return (
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`${skeletonBase} h-24`} />
            ))}
          </div>
          <div className={`${skeletonBase} h-64`} />
        </div>
      );
    
    default:
      return <LoadingSpinner />;
  }
};

// Error boundary for lazy components
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class LazyErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Lazy component error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-6 text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Failed to load component
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC for creating lazy components with loading states
function createLazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options: {
    fallbackType?: 'spinner' | 'skeleton';
    skeletonType?: 'card' | 'list' | 'form' | 'dashboard';
    loadingMessage?: string;
    minLoadTime?: number; // Minimum loading time to prevent flash
  } = {}
) {
  const { 
    fallbackType = 'spinner', 
    skeletonType = 'card',
    loadingMessage,
    minLoadTime = 0
  } = options;

  // Add artificial delay if needed
  const delayedImport = async () => {
    const [module] = await Promise.all([
      importFn(),
      minLoadTime > 0 ? new Promise(r => setTimeout(r, minLoadTime)) : Promise.resolve()
    ]);
    return module;
  };

  const LazyComponent = lazy(delayedImport);

  const Fallback = fallbackType === 'skeleton' 
    ? <SkeletonLoader type={skeletonType} />
    : <LoadingSpinner message={loadingMessage} />;

  return function LazyWrapper(props: React.ComponentProps<T>) {
    return (
      <LazyErrorBoundary>
        <Suspense fallback={Fallback}>
          <LazyComponent {...props} />
        </Suspense>
      </LazyErrorBoundary>
    );
  };
}

// Preload utility for route-based code splitting
const preloadedComponents = new Set<string>();

function preloadComponent(
  importFn: () => Promise<any>,
  componentName: string
): void {
  if (preloadedComponents.has(componentName)) {
    return;
  }
  
  preloadedComponents.add(componentName);
  importFn().catch(err => {
    console.warn(`Failed to preload ${componentName}:`, err);
    preloadedComponents.delete(componentName);
  });
}

// Lazy loaded components with code splitting
export const LazySkillManager = createLazyComponent(
  () => import('./SkillManager').then(m => ({ default: m.SkillManager })),
  { fallbackType: 'skeleton', skeletonType: 'list', loadingMessage: 'Loading Skills...' }
);

export const LazySkillEditor = createLazyComponent(
  () => import('./SkillEditor').then(m => ({ default: m.SkillEditor })),
  { fallbackType: 'skeleton', skeletonType: 'form' }
);

export const LazySkillTemplateSelector = createLazyComponent(
  () => import('./SkillTemplateSelector').then(m => ({ default: m.SkillTemplateSelector })),
  { fallbackType: 'skeleton', skeletonType: 'card' }
);

export const LazyMemoryDashboard = createLazyComponent(
  () => import('./MemoryDashboard').then(m => ({ default: m.MemoryDashboard })),
  { fallbackType: 'skeleton', skeletonType: 'dashboard', loadingMessage: 'Loading Memory Dashboard...' }
);

export const LazyExecutionProgress = createLazyComponent(
  () => import('./ExecutionProgress').then(m => ({ default: m.ExecutionProgress })),
  { fallbackType: 'skeleton', skeletonType: 'list' }
);

export const LazySettingsPanel = createLazyComponent(
  () => import('./SettingsPanel').then(m => ({ default: m.SettingsPanel })),
  { fallbackType: 'skeleton', skeletonType: 'form', loadingMessage: 'Loading Settings...' }
);

// Preload functions for route anticipation
export const preloadSkillManager = () => preloadComponent(
  () => import('./SkillManager'),
  'SkillManager'
);

export const preloadMemoryDashboard = () => preloadComponent(
  () => import('./MemoryDashboard'),
  'MemoryDashboard'
);

export const preloadSettingsPanel = () => preloadComponent(
  () => import('./SettingsPanel'),
  'SettingsPanel'
);

// Hook for preloading on hover/focus
export function usePreloadOnHover(preloadFn: () => void) {
  const [hasPreloaded, setHasPreloaded] = useState(false);

  const handleInteraction = () => {
    if (!hasPreloaded) {
      preloadFn();
      setHasPreloaded(true);
    }
  };

  return {
    onMouseEnter: handleInteraction,
    onFocus: handleInteraction,
  };
}

// Intersection observer based preloading
export function usePreloadOnVisible(
  preloadFn: () => void,
  options: IntersectionObserverInit = { rootMargin: '100px' }
) {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  const [hasPreloaded, setHasPreloaded] = useState(false);

  useEffect(() => {
    if (!ref || hasPreloaded) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          preloadFn();
          setHasPreloaded(true);
          observer.disconnect();
        }
      },
      options
    );

    observer.observe(ref);

    return () => observer.disconnect();
  }, [ref, hasPreloaded, preloadFn, options]);

  return setRef;
}

// Export utilities
export {
  LoadingSpinner,
  SkeletonLoader,
  LazyErrorBoundary,
  createLazyComponent,
  preloadComponent,
};
