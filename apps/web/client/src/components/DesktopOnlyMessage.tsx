import { Terminal, Container, Factory, Code, Download, Film, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const featureMap: Record<string, { icon: LucideIcon; title: string; description: string }> = {
  Docker: {
    icon: Container,
    title: 'Docker Sandbox',
    description: 'Manage Docker containers and sandboxed environments for safe development.',
  },
  Terminal: {
    icon: Terminal,
    title: 'Terminal',
    description: 'Integrated terminal with full PTY support for command-line workflows.',
  },
  CLI: {
    icon: Code,
    title: 'File Explorer & Editor',
    description: 'Browse, edit, and manage local files with Git integration.',
  },
  Factory: {
    icon: Factory,
    title: 'SaaS Factory',
    description: 'Build and deploy SaaS applications from specifications.',
  },
  VideoEditor: {
    icon: Film,
    title: 'Video Editor',
    description: 'Professional video editor with timeline, multi-track, audio ducking, and export.',
  },
};

interface Props {
  feature: string;
}

export default function DesktopOnlyMessage({ feature }: Props) {
  const info = featureMap[feature] ?? {
    icon: Terminal,
    title: feature,
    description: 'This feature is available on the desktop app.',
  };
  const Icon = info.icon;

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="glass-card max-w-lg w-full p-8 text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-10 h-10 text-primary" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold gradient-text">{info.title}</h1>
          <p className="text-muted-foreground leading-relaxed">{info.description}</p>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/30 p-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            This feature requires native system access and is only available in the
            <span className="font-semibold text-foreground"> SmartSpec Pro Desktop App</span>.
          </p>
          <Button variant="default" size="lg" className="gap-2">
            <Download className="w-4 h-4" />
            Download Desktop App
          </Button>
        </div>
      </div>
    </div>
  );
}
