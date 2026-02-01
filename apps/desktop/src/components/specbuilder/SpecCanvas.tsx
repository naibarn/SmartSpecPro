// Spec Canvas Component
// Main canvas for visual spec building with drag-and-drop

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  useSpecBuilder,
  CanvasComponent,
  Connection,
  Anchor,
  getComponentTypeIcon,
} from '../../services/specBuilderService';

interface SpecCanvasProps {
  className?: string;
}

export function SpecCanvas({ className = '' }: SpecCanvasProps) {
  const {
    currentDocument,
    selectedComponentIds,
    hoveredComponentId,
    tool,
    connectionInProgress,
    selectComponent,
    deselectAll,
    setHoveredComponent,
    updateComponentOnCanvas,
    addComponentToCanvas,
    completeConnection,
    cancelConnection,
    setZoom,
    setPan,
  } = useSpecBuilder();

  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const canvas = currentDocument?.canvas;

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (connectionInProgress) {
          cancelConnection();
        } else {
          deselectAll();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectionInProgress, cancelConnection, deselectAll]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((canvas?.zoom || 1) + delta);
    }
  }, [canvas?.zoom, setZoom]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && tool === 'pan')) {
      // Middle click or pan tool - start panning
      setIsPanning(true);
      setPanStart({ x: e.clientX - (canvas?.pan_x || 0), y: e.clientY - (canvas?.pan_y || 0) });
    } else if (e.button === 0 && e.target === canvasRef.current) {
      // Left click on canvas background - deselect
      deselectAll();
    }
  }, [tool, canvas, deselectAll]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan(e.clientX - panStart.x, e.clientY - panStart.y);
    } else if (isDragging && selectedComponentIds.length > 0) {
      const dx = (e.clientX - dragStart.x) / (canvas?.zoom || 1);
      const dy = (e.clientY - dragStart.y) / (canvas?.zoom || 1);
      setDragOffset({ x: dx, y: dy });
    }
  }, [isPanning, isDragging, panStart, dragStart, canvas?.zoom, selectedComponentIds, setPan]);

  // Handle mouse up
  const handleMouseUp = useCallback(async () => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (isDragging && selectedComponentIds.length > 0 && (dragOffset.x !== 0 || dragOffset.y !== 0)) {
      // Apply drag offset to selected components
      for (const id of selectedComponentIds) {
        const component = canvas?.components.find(c => c.id === id);
        if (component) {
          await updateComponentOnCanvas(id, {
            x: component.x + dragOffset.x,
            y: component.y + dragOffset.y,
          });
        }
      }
    }
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
  }, [isPanning, isDragging, selectedComponentIds, dragOffset, canvas, updateComponentOnCanvas]);

  // Handle drop from library
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const templateId = e.dataTransfer.getData('template-id');
    if (!templateId || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - (canvas?.pan_x || 0)) / (canvas?.zoom || 1);
    const y = (e.clientY - rect.top - (canvas?.pan_y || 0)) / (canvas?.zoom || 1);

    await addComponentToCanvas(templateId, x, y);
  }, [canvas, addComponentToCanvas]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  if (!currentDocument || !canvas) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-100 dark:bg-gray-900 ${className}`}>
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-4">📋</div>
          <p>No document open</p>
          <p className="text-sm mt-2">Create or open a document to start building</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      className={`relative overflow-hidden bg-gray-100 dark:bg-gray-900 ${className}`}
      style={{ cursor: isPanning ? 'grabbing' : tool === 'pan' ? 'grab' : 'default' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Canvas Content */}
      <div
        className="absolute"
        style={{
          transform: `translate(${canvas.pan_x}px, ${canvas.pan_y}px) scale(${canvas.zoom})`,
          transformOrigin: '0 0',
          width: canvas.width,
          height: canvas.height,
        }}
      >
        {/* Grid */}
        {canvas.grid_enabled && (
          <svg
            className="absolute inset-0 pointer-events-none"
            width={canvas.width}
            height={canvas.height}
          >
            <defs>
              <pattern
                id="grid"
                width={canvas.grid_size}
                height={canvas.grid_size}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${canvas.grid_size} 0 L 0 0 0 ${canvas.grid_size}`}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  strokeWidth={1}
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        )}

        {/* Connections */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={canvas.width}
          height={canvas.height}
        >
          {canvas.connections.map((connection) => (
            <ConnectionLine
              key={connection.id}
              connection={connection}
              components={canvas.components}
            />
          ))}
        </svg>

        {/* Components */}
        {canvas.components
          .sort((a, b) => a.z_index - b.z_index)
          .map((component) => (
            <CanvasComponentView
              key={component.id}
              component={component}
              isSelected={selectedComponentIds.includes(component.id)}
              isHovered={hoveredComponentId === component.id}
              isDragging={isDragging && selectedComponentIds.includes(component.id)}
              dragOffset={selectedComponentIds.includes(component.id) ? dragOffset : { x: 0, y: 0 }}
              onSelect={(addToSelection) => selectComponent(component.id, addToSelection)}
              onHover={(hovered) => setHoveredComponent(hovered ? component.id : null)}
              onDragStart={(e) => {
                if (component.locked) return;
                setIsDragging(true);
                setDragStart({ x: e.clientX, y: e.clientY });
                if (!selectedComponentIds.includes(component.id)) {
                  selectComponent(component.id);
                }
              }}
              onAnchorClick={(anchor) => {
                if (connectionInProgress) {
                  completeConnection(component.id, anchor);
                }
              }}
              showAnchors={tool === 'connect' || !!connectionInProgress}
            />
          ))}
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 px-3 py-1 bg-white dark:bg-gray-800 rounded-lg shadow text-sm">
        {Math.round(canvas.zoom * 100)}%
      </div>
    </div>
  );
}

// ============================================
// Canvas Component View
// ============================================

interface CanvasComponentViewProps {
  component: CanvasComponent;
  isSelected: boolean;
  isHovered: boolean;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
  onSelect: (addToSelection: boolean) => void;
  onHover: (hovered: boolean) => void;
  onDragStart: (e: React.MouseEvent) => void;
  onAnchorClick: (anchor: Anchor) => void;
  showAnchors: boolean;
}

function CanvasComponentView({
  component,
  isSelected,
  isHovered,
  isDragging,
  dragOffset,
  onSelect,
  onHover,
  onDragStart,
  onAnchorClick,
  showAnchors,
}: CanvasComponentViewProps) {
  const x = component.x + dragOffset.x;
  const y = component.y + dragOffset.y;

  return (
    <div
      className={`absolute select-none ${isDragging ? 'opacity-80' : ''}`}
      style={{
        left: x,
        top: y,
        width: component.width,
        height: component.height,
        transform: `rotate(${component.rotation}deg)`,
        opacity: component.style.opacity,
        zIndex: component.z_index,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.shiftKey) {
          onSelect(true);
        } else if (!isSelected) {
          onSelect(false);
        }
        onDragStart(e);
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* Component Content */}
      <div
        className={`w-full h-full overflow-hidden ${
          isSelected ? 'ring-2 ring-blue-500' : isHovered ? 'ring-1 ring-blue-300' : ''
        }`}
        style={{
          backgroundColor: component.style.background_color || 'white',
          borderColor: component.style.border_color || '#e5e7eb',
          borderWidth: component.style.border_width || 1,
          borderStyle: 'solid',
          borderRadius: component.style.border_radius || 8,
          padding: component.style.padding || 16,
          boxShadow: component.style.shadow ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none',
        }}
      >
        {/* Icon */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{getComponentTypeIcon(component.component_type)}</span>
          {component.properties.title && (
            <span
              className="font-semibold truncate"
              style={{
                color: component.style.text_color || '#1f2937',
                fontSize: component.style.font_size || 14,
                fontWeight: component.style.font_weight || 'normal',
              }}
            >
              {component.properties.title}
            </span>
          )}
        </div>

        {/* Content */}
        {component.properties.content && (
          <p
            className="text-sm whitespace-pre-wrap"
            style={{ color: component.style.text_color || '#1f2937' }}
          >
            {component.properties.content}
          </p>
        )}

        {/* List Items */}
        {component.properties.items && (
          <ul className="text-sm space-y-1">
            {component.properties.items.map((item, i) => (
              <li key={i} style={{ color: component.style.text_color || '#1f2937' }}>
                • {item}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Connection Anchors */}
      {showAnchors && (
        <>
          <AnchorPoint position="top" onClick={() => onAnchorClick('top')} />
          <AnchorPoint position="right" onClick={() => onAnchorClick('right')} />
          <AnchorPoint position="bottom" onClick={() => onAnchorClick('bottom')} />
          <AnchorPoint position="left" onClick={() => onAnchorClick('left')} />
        </>
      )}

      {/* Resize Handles */}
      {isSelected && !component.locked && (
        <>
          <div className="absolute -right-1 -bottom-1 w-3 h-3 bg-blue-500 rounded-sm cursor-se-resize" />
        </>
      )}

      {/* Lock indicator */}
      {component.locked && (
        <div className="absolute top-1 right-1 text-xs">🔒</div>
      )}
    </div>
  );
}

// ============================================
// Anchor Point
// ============================================

function AnchorPoint({
  position,
  onClick,
}: {
  position: 'top' | 'right' | 'bottom' | 'left';
  onClick: () => void;
}) {
  const positionStyles: Record<string, React.CSSProperties> = {
    top: { top: -4, left: '50%', transform: 'translateX(-50%)' },
    right: { right: -4, top: '50%', transform: 'translateY(-50%)' },
    bottom: { bottom: -4, left: '50%', transform: 'translateX(-50%)' },
    left: { left: -4, top: '50%', transform: 'translateY(-50%)' },
  };

  return (
    <button
      className="absolute w-3 h-3 bg-blue-500 rounded-full border-2 border-white hover:bg-blue-600 z-10"
      style={positionStyles[position]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    />
  );
}

// ============================================
// Connection Line
// ============================================

function ConnectionLine({
  connection,
  components,
}: {
  connection: Connection;
  components: CanvasComponent[];
}) {
  const fromComponent = components.find(c => c.id === connection.from_component);
  const toComponent = components.find(c => c.id === connection.to_component);

  if (!fromComponent || !toComponent) return null;

  const getAnchorPoint = (component: CanvasComponent, anchor: Anchor) => {
    const cx = component.x + component.width / 2;
    const cy = component.y + component.height / 2;

    switch (anchor) {
      case 'top':
        return { x: cx, y: component.y };
      case 'right':
        return { x: component.x + component.width, y: cy };
      case 'bottom':
        return { x: cx, y: component.y + component.height };
      case 'left':
        return { x: component.x, y: cy };
      default:
        return { x: cx, y: cy };
    }
  };

  const from = getAnchorPoint(fromComponent, connection.from_anchor);
  const to = getAnchorPoint(toComponent, connection.to_anchor);

  // Calculate control points for curved line
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cx1 = from.x + dx * 0.5;
  const cy1 = from.y;
  const cx2 = from.x + dx * 0.5;
  const cy2 = to.y;

  const pathD = `M ${from.x} ${from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${to.x} ${to.y}`;

  return (
    <g>
      <path
        d={pathD}
        fill="none"
        stroke={connection.style.color}
        strokeWidth={connection.style.width}
        strokeDasharray={connection.connection_type === 'dashed' ? '5,5' : undefined}
        markerEnd={connection.connection_type === 'arrow' ? 'url(#arrowhead)' : undefined}
      />
      {connection.label && (
        <text
          x={(from.x + to.x) / 2}
          y={(from.y + to.y) / 2 - 10}
          textAnchor="middle"
          fontSize={12}
          fill={connection.style.color}
        >
          {connection.label}
        </text>
      )}
      <defs>
        <marker
          id="arrowhead"
          markerWidth={connection.style.arrow_size}
          markerHeight={connection.style.arrow_size}
          refX={connection.style.arrow_size - 2}
          refY={connection.style.arrow_size / 2}
          orient="auto"
        >
          <polygon
            points={`0 0, ${connection.style.arrow_size} ${connection.style.arrow_size / 2}, 0 ${connection.style.arrow_size}`}
            fill={connection.style.color}
          />
        </marker>
      </defs>
    </g>
  );
}

export default SpecCanvas;
