/**
 * SilenceDetectionDialog - Full-screen modal for silence detection workflow.
 * Contains: header, main content (preview + settings), timeline, footer.
 * Uses Radix UI Dialog for focus trapping, ESC-to-close, and ARIA support.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import type {
  VideoEditorProject,
  SilentRegion,
  SilenceDetectionConfig,
  AnalysisStage,
} from '../../types/videoEditor';
import { createMediaJobClient } from '../../services/mediaJobClient';

interface AssetWithWaveform {
  path: string;
  waveformData?: number[];
}

interface SilenceDetectionDialogProps {
  project: VideoEditorProject;
  onExportToTimeline: (
    selectedRegions: SilentRegion[],
    applyToAllTracks: boolean,
  ) => void;
  onClose: () => void;
}

const SilenceDetectionDialog: React.FC<SilenceDetectionDialogProps> = ({
  project,
  onExportToTimeline,
  onClose,
}) => {
  // Detection config
  const [config, setConfig] = useState<SilenceDetectionConfig>({
    threshold: -40,
    minDuration: 0.5,
    softeningBuffer: 0.2,
    enabled: true,
    trackIds: [],
  });
  const [regions, setRegions] = useState<SilentRegion[]>([]);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle');
  const [playbackTime, setPlaybackTime] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(100);
  const [skipSilencePreview, setSkipSilencePreview] = useState(false);
  const [applyToAllTracks, setApplyToAllTracks] = useState(false);

  // Waveform state
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [waveformLoading, setWaveformLoading] = useState(false);
  const [waveformError, setWaveformError] = useState(false);

  // Pre-compute skeleton bar heights to avoid Math.random() in render
  const skeletonHeights = useMemo(
    () => Array.from({ length: 40 }, () => 20 + Math.random() * 60),
    [],
  );

  // Mounted guard for async cleanup
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Waveform data availability check
  useEffect(() => {
    const audioTracks = project.timeline.tracks.filter(
      (t) => t.type === 'audio' && t.clips.length > 0,
    );
    if (audioTracks.length === 0) return;

    const firstClip = audioTracks[0].clips[0];
    const asset = project.assets[firstClip.assetId] as AssetWithWaveform | undefined;
    if (!asset) return;

    if (asset.waveformData && asset.waveformData.length > 0) {
      setWaveformData(asset.waveformData);
      return;
    }

    // Waveform data missing -- trigger generation
    setWaveformLoading(true);
    const fetchWaveform = async () => {
      try {
        const client = await createMediaJobClient();
        const result = await client.getWaveformPeaks(asset.path);
        if (!mountedRef.current) return;
        const peaks = (result as { derived?: { peaks?: number[] } }).derived?.peaks || [];
        setWaveformData(peaks);
      } catch (err) {
        if (!mountedRef.current) return;
        console.error('Waveform generation failed:', err);
        setWaveformError(true);
      } finally {
        if (mountedRef.current) {
          setWaveformLoading(false);
        }
      }
    };
    fetchWaveform();
  }, [project]);

  const selectedRegionCount = regions.filter((r) => r.selected && !r.skipped).length;
  const exportDisabled = !analysisComplete || selectedRegionCount === 0;

  const handleExport = () => {
    const selectedRegions = regions.filter((r) => r.selected && !r.skipped);
    onExportToTimeline(selectedRegions, applyToAllTracks);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPortal>
        <DialogOverlay className="silence-dialog-overlay" />
        <DialogPrimitive.Content
          className="silence-dialog-content"
          aria-describedby={undefined}
        >
          <style>{`
            .silence-dialog-overlay {
              position: fixed;
              inset: 0;
              background: rgba(0, 0, 0, 0.9);
              z-index: 2000;
            }
            .silence-dialog-content {
              position: fixed;
              inset: 0;
              z-index: 2001;
              display: flex;
              flex-direction: column;
              background: #1a1a1a;
              color: #e0e0e0;
              max-width: none;
              width: 100vw;
              height: 100vh;
              border: none;
              border-radius: 0;
              padding: 0;
              gap: 0;
            }
            .silence-dialog-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 12px 20px;
              border-bottom: 1px solid #444;
              background: #222;
              min-height: 56px;
            }
            .silence-dialog-header-left {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .silence-dialog-back-btn,
            .silence-dialog-close-btn {
              background: none;
              border: 1px solid #555;
              color: #e0e0e0;
              cursor: pointer;
              padding: 6px 12px;
              border-radius: 4px;
              font-size: 14px;
            }
            .silence-dialog-back-btn:hover,
            .silence-dialog-close-btn:hover {
              background: #333;
            }
            .silence-dialog-title {
              font-size: 18px;
              font-weight: 600;
              color: #fff;
            }
            .silence-dialog-main {
              display: flex;
              flex: 1;
              overflow: hidden;
            }
            .silence-dialog-preview {
              flex: 0 0 60%;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #111;
              border-right: 1px solid #444;
              color: #666;
              font-size: 14px;
            }
            .silence-dialog-settings {
              flex: 0 0 40%;
              overflow-y: auto;
              padding: 20px;
              background: #2a2a2a;
            }
            .silence-dialog-timeline {
              height: 200px;
              border-top: 1px solid #444;
              background: #1e1e1e;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #666;
              font-size: 14px;
            }
            .silence-dialog-footer {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 12px 20px;
              border-top: 1px solid #444;
              background: #222;
              min-height: 56px;
            }
            .silence-dialog-footer-left {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .silence-dialog-toggle {
              display: flex;
              align-items: center;
              gap: 8px;
              cursor: pointer;
              font-size: 14px;
            }
            .silence-dialog-toggle input {
              cursor: pointer;
            }
            .silence-dialog-export-btn {
              background: #0078d4;
              color: #fff;
              border: none;
              padding: 8px 20px;
              border-radius: 4px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
            }
            .silence-dialog-export-btn:hover:not(:disabled) {
              background: #006cbd;
            }
            .silence-dialog-export-btn:disabled {
              background: #444;
              color: #888;
              cursor: not-allowed;
            }
            .waveform-skeleton {
              display: flex;
              gap: 2px;
              align-items: flex-end;
              height: 80px;
              padding: 0 20px;
            }
            .waveform-skeleton-bar {
              width: 3px;
              background: #333;
              border-radius: 1px;
              animation: silence-pulse 1.5s ease-in-out infinite;
            }
            @keyframes silence-pulse {
              0%, 100% { opacity: 0.3; }
              50% { opacity: 0.6; }
            }
            .waveform-error {
              color: #888;
              font-size: 13px;
            }
            @media (max-width: 1279px) {
              .silence-dialog-main {
                flex-direction: column;
              }
              .silence-dialog-preview,
              .silence-dialog-settings {
                flex: none;
                width: 100%;
                border-right: none;
              }
              .silence-dialog-preview {
                height: 300px;
                border-bottom: 1px solid #444;
              }
            }
          `}</style>

          {/* Header */}
          <div className="silence-dialog-header" data-testid="silence-dialog-header">
            <div className="silence-dialog-header-left">
              <DialogClose asChild>
                <button className="silence-dialog-back-btn" aria-label="Back">
                  Back
                </button>
              </DialogClose>
              <DialogTitle className="silence-dialog-title">
                Silence Detection
              </DialogTitle>
            </div>
            <DialogClose asChild>
              <button className="silence-dialog-close-btn" aria-label="Close" data-testid="silence-dialog-close">
                X
              </button>
            </DialogClose>
          </div>

          {/* Main Content: Preview (left) + Settings (right) */}
          <div className="silence-dialog-main">
            <div className="silence-dialog-preview" data-testid="silence-dialog-preview">
              {/* PreviewPlayer placeholder (section 07) */}
              Preview Player (Section 07)
            </div>
            <div className="silence-dialog-settings" data-testid="silence-dialog-settings">
              {/* Settings panel placeholder (section 03) */}
              Settings Panel (Section 03)
            </div>
          </div>

          {/* Timeline Zone */}
          <div className="silence-dialog-timeline" data-testid="silence-dialog-timeline">
            {waveformLoading && (
              <div className="waveform-skeleton" data-testid="waveform-loading">
                {skeletonHeights.map((h, i) => (
                  <div
                    key={i}
                    className="waveform-skeleton-bar"
                    style={{
                      height: `${h}%`,
                      animationDelay: `${i * 0.03}s`,
                    }}
                  />
                ))}
              </div>
            )}
            {waveformError && (
              <div className="waveform-error" data-testid="waveform-error">
                Waveform unavailable
              </div>
            )}
            {!waveformLoading && !waveformError && (
              <span>Timeline (Section 06)</span>
            )}
          </div>

          {/* Footer */}
          <div className="silence-dialog-footer" data-testid="silence-dialog-footer">
            <div className="silence-dialog-footer-left">
              <label className="silence-dialog-toggle">
                <input
                  type="checkbox"
                  checked={applyToAllTracks}
                  onChange={(e) => setApplyToAllTracks(e.target.checked)}
                />
                Apply to all tracks
              </label>
            </div>
            <button
              className="silence-dialog-export-btn"
              disabled={exportDisabled}
              onClick={handleExport}
              data-testid="export-to-timeline-btn"
            >
              Export to Timeline
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};

export default SilenceDetectionDialog;
