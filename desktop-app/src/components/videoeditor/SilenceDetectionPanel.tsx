/**
 * Silence Detection Panel - Dead Air Removal & Video Combine
 * Supports auto-detection and manual selection of silent regions
 */

import React, { useState, useEffect } from 'react';
import {
  type SilentRegion,
  type SilenceDetectionConfig,
  type VideoEditorProject,
  type Track,
  formatTime,
  generateId
} from '../../types/videoEditor';
import './SilenceDetectionPanel.css';

interface SilenceDetectionPanelProps {
  project: VideoEditorProject;
  onCutAndCombine: (selectedRegions: SilentRegion[]) => void;
  onAnalyzeComplete?: (regions: SilentRegion[]) => void;
}

const SilenceDetectionPanel: React.FC<SilenceDetectionPanelProps> = ({
  project,
  onCutAndCombine,
  onAnalyzeComplete
}) => {
  // Config state
  const [threshold, setThreshold] = useState(-40); // dB
  const [minDuration, setMinDuration] = useState(0.5); // seconds
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);

  // Detection state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [silentRegions, setSilentRegions] = useState<SilentRegion[]>([]);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  // Stats
  const [totalSilence, setTotalSilence] = useState(0);
  const [totalActive, setTotalActive] = useState(0);

  // UI state
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  // Initialize with audio tracks
  useEffect(() => {
    const audioTracks = project.timeline.tracks.filter(t => t.type === 'audio' && t.clips.length > 0);
    if (audioTracks.length > 0 && selectedTrackIds.length === 0) {
      setSelectedTrackIds([audioTracks[0].id]);
    }
  }, [project.timeline.tracks]);

  // Handle track selection
  const handleTrackToggle = (trackId: string) => {
    setSelectedTrackIds(prev => {
      if (prev.includes(trackId)) {
        return prev.filter(id => id !== trackId);
      } else {
        return [...prev, trackId];
      }
    });
  };

  // Auto-detect silent regions
  const handleAutoDetect = async () => {
    if (selectedTrackIds.length === 0) {
      alert('Please select at least one track to analyze');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisComplete(false);
    setSilentRegions([]);

    try {
      // Call backend API to analyze audio
      const response = await fetch('/api/video-editor/analyze-silence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project,
          config: {
            threshold,
            minDuration,
            enabled: true,
            trackIds: selectedTrackIds
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to analyze silence');
      }

      const result = await response.json();
      const regions: SilentRegion[] = result.regions.map((r: any) => ({
        ...r,
        selected: true // Select all by default
      }));

      setSilentRegions(regions);
      setTotalSilence(result.totalSilenceDuration);
      setTotalActive(result.totalActiveDuration);
      setAnalysisComplete(true);

      if (onAnalyzeComplete) {
        onAnalyzeComplete(regions);
      }
    } catch (error) {
      console.error('Error analyzing silence:', error);
      alert('Failed to analyze silence. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Toggle region selection
  const handleToggleRegion = (regionId: string) => {
    setSilentRegions(prev =>
      prev.map(r => r.id === regionId ? { ...r, selected: !r.selected } : r)
    );
  };

  // Select/deselect all regions
  const handleSelectAll = () => {
    setSilentRegions(prev => prev.map(r => ({ ...r, selected: true })));
  };

  const handleDeselectAll = () => {
    setSilentRegions(prev => prev.map(r => ({ ...r, selected: false })));
  };

  // Toggle region expanded state
  const handleToggleExpanded = (regionId: string) => {
    setExpandedRegions(prev => {
      const next = new Set(prev);
      if (next.has(regionId)) {
        next.delete(regionId);
      } else {
        next.add(regionId);
      }
      return next;
    });
  };

  // Cut and combine video
  const handleCutAndCombine = () => {
    const selectedRegions = silentRegions.filter(r => r.selected);

    if (selectedRegions.length === 0) {
      alert('No silent regions selected. Please select regions to remove.');
      return;
    }

    const totalRemoved = selectedRegions.reduce((sum, r) => sum + r.duration, 0);
    const confirmed = confirm(
      `Remove ${selectedRegions.length} silent region(s) totaling ${formatTime(totalRemoved)}?\n\n` +
      `This will cut out the selected regions and combine the remaining segments into a continuous video.`
    );

    if (confirmed) {
      onCutAndCombine(selectedRegions);
    }
  };

  // Get audio tracks for selection
  const audioTracks = project.timeline.tracks.filter(t => t.type === 'audio' && t.clips.length > 0);
  const selectedCount = silentRegions.filter(r => r.selected).length;
  const selectedDuration = silentRegions.filter(r => r.selected).reduce((sum, r) => sum + r.duration, 0);

  return (
    <div className="silence-detection-panel">
      <div className="panel-header">
        <h3>🔇 Dead Air Detection</h3>
        <p className="panel-description">
          Automatically detect and remove silent regions from your video
        </p>
      </div>

      {/* Configuration Section */}
      <div className="config-section">
        <h4>Detection Settings</h4>

        {/* Threshold Slider */}
        <div className="control-group">
          <label>
            Silence Threshold: <strong>{threshold} dB</strong>
            <span className="help-text">Lower = more sensitive</span>
          </label>
          <input
            type="range"
            min="-60"
            max="-20"
            step="1"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="slider"
            disabled={isAnalyzing}
          />
          <div className="slider-labels">
            <span>-60 dB (Quiet)</span>
            <span>-20 dB (Loud)</span>
          </div>
        </div>

        {/* Min Duration Slider */}
        <div className="control-group">
          <label>
            Minimum Duration: <strong>{minDuration.toFixed(1)}s</strong>
            <span className="help-text">Ignore shorter silences</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="5.0"
            step="0.1"
            value={minDuration}
            onChange={(e) => setMinDuration(Number(e.target.value))}
            className="slider"
            disabled={isAnalyzing}
          />
          <div className="slider-labels">
            <span>0.1s</span>
            <span>5.0s</span>
          </div>
        </div>

        {/* Track Selection */}
        <div className="control-group">
          <label>Analyze Tracks:</label>
          <div className="track-checkboxes">
            {audioTracks.map(track => (
              <label key={track.id} className="track-checkbox">
                <input
                  type="checkbox"
                  checked={selectedTrackIds.includes(track.id)}
                  onChange={() => handleTrackToggle(track.id)}
                  disabled={isAnalyzing}
                />
                <span>{track.name}</span>
                <span className="clip-count">({track.clips.length} clips)</span>
              </label>
            ))}
          </div>
          {audioTracks.length === 0 && (
            <p className="warning-text">No audio tracks with clips found</p>
          )}
        </div>

        {/* Analyze Button */}
        <button
          className="analyze-button"
          onClick={handleAutoDetect}
          disabled={isAnalyzing || selectedTrackIds.length === 0 || audioTracks.length === 0}
        >
          {isAnalyzing ? (
            <>
              <span className="spinner">⏳</span> Analyzing...
            </>
          ) : (
            <>🔍 Auto-Detect Silent Regions</>
          )}
        </button>
      </div>

      {/* Results Section */}
      {analysisComplete && (
        <div className="results-section">
          <div className="results-header">
            <h4>Detected Regions ({silentRegions.length})</h4>
            <div className="results-actions">
              <button onClick={handleSelectAll} className="btn-text">Select All</button>
              <button onClick={handleDeselectAll} className="btn-text">Deselect All</button>
            </div>
          </div>

          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Silent</div>
              <div className="stat-value">{formatTime(totalSilence)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Active</div>
              <div className="stat-value">{formatTime(totalActive)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Selected</div>
              <div className="stat-value">
                {selectedCount} ({formatTime(selectedDuration)})
              </div>
            </div>
          </div>

          {/* Region List */}
          <div className="regions-list">
            {silentRegions.length === 0 ? (
              <div className="empty-state">
                <p>✨ No silent regions detected!</p>
                <p className="help-text">Try adjusting the threshold or minimum duration</p>
              </div>
            ) : (
              silentRegions.map((region, index) => (
                <div
                  key={region.id}
                  className={`region-item ${region.selected ? 'selected' : ''} ${
                    expandedRegions.has(region.id) ? 'expanded' : ''
                  }`}
                >
                  <div className="region-header" onClick={() => handleToggleExpanded(region.id)}>
                    <input
                      type="checkbox"
                      checked={region.selected}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleRegion(region.id);
                      }}
                      className="region-checkbox"
                    />
                    <div className="region-info">
                      <div className="region-title">
                        Region #{index + 1}
                        {region.selected && <span className="badge-selected">✓ Selected</span>}
                      </div>
                      <div className="region-time">
                        {formatTime(region.startTime)} → {formatTime(region.endTime)}
                        <span className="duration">({formatTime(region.duration)})</span>
                      </div>
                    </div>
                    <button
                      className="expand-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleExpanded(region.id);
                      }}
                    >
                      {expandedRegions.has(region.id) ? '▼' : '▶'}
                    </button>
                  </div>

                  {expandedRegions.has(region.id) && (
                    <div className="region-details">
                      <div className="detail-row">
                        <span className="detail-label">Start:</span>
                        <span className="detail-value">{formatTime(region.startTime)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">End:</span>
                        <span className="detail-value">{formatTime(region.endTime)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Duration:</span>
                        <span className="detail-value">{formatTime(region.duration)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Avg Level:</span>
                        <span className="detail-value">{region.averageDb.toFixed(1)} dB</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Track:</span>
                        <span className="detail-value">
                          {project.timeline.tracks.find(t => t.id === region.trackId)?.name || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Cut & Combine Button */}
          {silentRegions.length > 0 && (
            <button
              className="cut-combine-button"
              onClick={handleCutAndCombine}
              disabled={selectedCount === 0}
            >
              ✂️ Cut & Combine ({selectedCount} region{selectedCount !== 1 ? 's' : ''})
            </button>
          )}
        </div>
      )}

      {/* Help Section */}
      <div className="help-section">
        <details>
          <summary>💡 How to use</summary>
          <div className="help-content">
            <ol>
              <li>Adjust the <strong>Silence Threshold</strong> (lower = more sensitive)</li>
              <li>Set the <strong>Minimum Duration</strong> (ignore very short pauses)</li>
              <li>Select which <strong>Audio Tracks</strong> to analyze</li>
              <li>Click <strong>Auto-Detect</strong> to find silent regions</li>
              <li>Review detected regions and <strong>toggle selection</strong> as needed</li>
              <li>Click <strong>Cut & Combine</strong> to remove selected regions</li>
            </ol>
            <p className="help-note">
              <strong>Note:</strong> The cut operation will remove all selected silent regions
              and automatically combine the remaining segments into a continuous video.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
};

export default SilenceDetectionPanel;
