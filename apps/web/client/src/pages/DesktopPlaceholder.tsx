import { detectPlatform } from '@smartspec/shared';
import { useLocation } from 'wouter';
import { Terminal, Container, Factory, Code } from 'lucide-react';

const featureInfo: Record<string, { icon: typeof Terminal; title: string; description: string }> = {
  '/factory': {
    icon: Factory,
    title: 'SaaS Factory',
    description: 'Build and deploy SaaS applications from specifications.',
  },
  '/terminal': {
    icon: Terminal,
    title: 'Terminal',
    description: 'Integrated terminal with PTY support.',
  },
  '/kilo': {
    icon: Code,
    title: 'CLI',
    description: 'Command-line interface for SmartSpec operations.',
  },
  '/docker': {
    icon: Container,
    title: 'Docker Sandbox',
    description: 'Manage Docker containers and sandboxed environments.',
  },
};

export default function DesktopPlaceholder() {
  const [location] = useLocation();
  const platform = detectPlatform();
  const info = featureInfo[location] || {
    icon: Terminal,
    title: 'Desktop Feature',
    description: 'This feature is available on the desktop app.',
  };
  const Icon = info.icon;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{info.title}</h1>
          <p className="text-muted-foreground">{info.description}</p>
        </div>
        {platform === 'desktop' ? (
          <p className="text-sm text-muted-foreground">
            Coming soon — native integration in progress.
          </p>
        ) : (
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">
              This feature requires the SmartSpec Pro desktop app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
