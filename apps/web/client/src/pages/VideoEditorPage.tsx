import { detectPlatform } from '@smartspec/shared';
import DesktopOnlyMessage from '@/components/DesktopOnlyMessage';
import { VideoEditorPhase3 } from '@/components/videoeditor/VideoEditorPhase3';

export default function VideoEditorPage() {
  const platform = detectPlatform();

  if (platform !== 'desktop') {
    return <DesktopOnlyMessage feature="VideoEditor" />;
  }

  return <VideoEditorPhase3 />;
}
