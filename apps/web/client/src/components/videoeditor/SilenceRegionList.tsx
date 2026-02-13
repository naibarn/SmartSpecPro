/**
 * SilenceRegionList - Displays a scrollable list of detected silent regions
 * with per-region checkboxes, bulk selection controls, and expandable details.
 */

import React, { useState } from 'react';
import {
  type SilentRegion,
  type Track,
  formatTime,
} from '../../types/videoEditor';

export interface SilenceRegionListProps {
  regions: SilentRegion[];
  onToggleRegion: (regionId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onScrollToRegion?: (regionId: string) => void;
  tracks: Track[];
}

export const SilenceRegionList: React.FC<SilenceRegionListProps> = ({
  regions,
  onToggleRegion,
  onSelectAll,
  onDeselectAll,
  onScrollToRegion,
  tracks,
}) => {
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

  const toggleExpanded = (regionId: string) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) {
        next.delete(regionId);
      } else {
        next.add(regionId);
      }
      return next;
    });
  };

  const resolveTrackName = (trackId: string): string => {
    return tracks.find((t) => t.id === trackId)?.name || 'Unknown';
  };

  const handleRegionClick = (regionId: string) => {
    onScrollToRegion?.(regionId);
  };

  return (
    <div className="silence-region-list">
      <style>{`
        .silence-region-list {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .region-list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #444;
          background: #2a2a2a;
        }
        .region-list-header > span {
          font-size: 14px;
          font-weight: 600;
          color: #fff;
        }
        .region-list-actions {
          display: flex;
          gap: 8px;
        }
        .region-list-actions button {
          padding: 6px 12px;
          background: #333;
          color: #e0e0e0;
          border: 1px solid #555;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        }
        .region-list-actions button:hover {
          background: #444;
        }
        .regions-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }
        .region-item {
          background: #1e1e1e;
          border: 1px solid #333;
          border-radius: 6px;
          margin-bottom: 8px;
          transition: all 0.2s;
        }
        .region-item:hover {
          border-color: #555;
        }
        .region-item.selected {
          border-color: #0078d4;
          background: #1a2332;
        }
        .region-item.skipped {
          opacity: 0.6;
        }
        .region-header {
          display: flex;
          align-items: center;
          padding: 12px;
          cursor: pointer;
          gap: 12px;
        }
        .region-checkbox {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }
        .region-checkbox:disabled {
          cursor: not-allowed;
        }
        .region-item.skipped .region-checkbox {
          cursor: not-allowed;
        }
        .region-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .region-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 500;
          color: #e0e0e0;
        }
        .badge-selected {
          background: #0078d4;
          color: #fff;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: 500;
        }
        .badge-skipped {
          background: #ff9800;
          color: #1e1e1e;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: 500;
        }
        .region-time {
          font-size: 12px;
          color: #999;
        }
        .expand-btn {
          padding: 4px 8px;
          background: none;
          border: 1px solid #555;
          border-radius: 3px;
          color: #999;
          cursor: pointer;
          font-size: 11px;
        }
        .expand-btn:hover {
          background: #333;
          color: #fff;
        }
        .region-details {
          padding: 12px;
          padding-top: 0;
          border-top: 1px solid #333;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 12px;
        }
        .detail-label {
          color: #999;
        }
        .detail-value {
          color: #e0e0e0;
          font-weight: 500;
        }
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #999;
        }
        .empty-state p {
          margin: 0;
          margin-bottom: 8px;
        }
        .empty-state .help-text {
          font-size: 12px;
          color: #666;
        }
      `}</style>

      {/* Header with bulk actions */}
      <div className="region-list-header">
        <span>Detected Regions ({regions.length})</span>
        <div className="region-list-actions">
          <button onClick={onSelectAll}>Select All</button>
          <button onClick={onDeselectAll}>Deselect All</button>
        </div>
      </div>

      {/* Scrollable region list */}
      <div
        className="regions-list"
        role="region"
        aria-label="Detected silent regions"
        aria-live="polite"
      >
        {regions.length === 0 ? (
          <div className="empty-state" role="status" aria-live="polite">
            <p>No silent regions detected</p>
            <p className="help-text">
              Try adjusting the threshold or minimum duration
            </p>
          </div>
        ) : (
          regions.map((region, index) => {
            const isExpanded = expandedRegions.has(region.id);
            const trackName = resolveTrackName(region.trackId);

            return (
              <div
                key={region.id}
                className={`region-item ${region.selected && !region.skipped ? 'selected' : ''} ${region.skipped ? 'skipped' : ''}`}
              >
                <div
                  className="region-header"
                  data-testid={`region-header-${region.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Scroll to region ${index + 1}`}
                  onClick={() => handleRegionClick(region.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRegionClick(region.id);
                    }
                  }}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    className="region-checkbox"
                    checked={region.selected}
                    disabled={region.skipped}
                    aria-label={`Select region ${index + 1}`}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleRegion(region.id);
                    }}
                  />

                  {/* Region info */}
                  <div className="region-info">
                    <div className="region-title">
                      <span>Region #{index + 1}</span>
                      {region.selected && !region.skipped && (
                        <span className="badge-selected">Selected</span>
                      )}
                      {region.skipped && (
                        <span className="badge-skipped">Skipped</span>
                      )}
                    </div>
                    <div className="region-time">
                      {formatTime(region.startTime)} → {formatTime(region.endTime)}{' '}
                      ({formatTime(region.duration)})
                    </div>
                  </div>

                  {/* Expand button */}
                  <button
                    className="expand-btn"
                    data-testid={`expand-btn-${region.id}`}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for region ${index + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(region.id);
                    }}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="region-details">
                    <div className="detail-row">
                      <span className="detail-label">Start</span>
                      <span className="detail-value">
                        {formatTime(region.startTime)}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">End</span>
                      <span className="detail-value">
                        {formatTime(region.endTime)}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Duration</span>
                      <span className="detail-value">
                        {formatTime(region.duration)}
                      </span>
                    </div>
                    {region.adjustedStartTime !== region.startTime && (
                      <div className="detail-row">
                        <span className="detail-label">Adj. Start</span>
                        <span className="detail-value">
                          {formatTime(region.adjustedStartTime)}
                        </span>
                      </div>
                    )}
                    {region.adjustedEndTime !== region.endTime && (
                      <div className="detail-row">
                        <span className="detail-label">Adj. End</span>
                        <span className="detail-value">
                          {formatTime(region.adjustedEndTime)}
                        </span>
                      </div>
                    )}
                    <div className="detail-row">
                      <span className="detail-label">Adj. Duration</span>
                      <span className="detail-value">
                        {region.skipped
                          ? 'Skipped'
                          : formatTime(region.adjustedDuration)}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Avg Level</span>
                      <span className="detail-value">
                        {region.averageDb.toFixed(1)} dB
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Track</span>
                      <span className="detail-value">{trackName}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
