'use client';

import React, { useMemo } from 'react';
import { Stage, Layer, Rect, Line, Arrow } from 'react-konva';
import { PostIt, Connection, DrawingLine } from '@/store/useBoardStore';

interface MinimapProps {
  postIts: PostIt[];
  connections: Connection[];
  drawings: DrawingLine[];
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
  };
  theme: 'light' | 'dark';
  onMove?: (x: number, y: number) => void;
}

const MINIMAP_SIZE = 200;

export default function Minimap({ postIts, connections, drawings, viewport, theme, onMove }: MinimapProps) {
  // 1. Calculate content bounds
  const bounds = useMemo(() => {
    if (postIts.length === 0 && drawings.length === 0) {
      return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    postIts.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.width);
      maxY = Math.max(maxY, p.y + p.height);
    });

    drawings.forEach(d => {
      for (let i = 0; i < d.points.length; i += 2) {
        minX = Math.min(minX, d.points[i]);
        minY = Math.min(minY, d.points[i + 1]);
        maxX = Math.max(maxX, d.points[i]);
        maxY = Math.max(maxY, d.points[i + 1]);
      }
    });

    // Also consider connections if they have control points
    connections.forEach(c => {
      if (c.controlPoint) {
        minX = Math.min(minX, c.controlPoint.x);
        minY = Math.min(minY, c.controlPoint.y);
        maxX = Math.max(maxX, c.controlPoint.x);
        maxY = Math.max(maxY, c.controlPoint.y);
      }
    });

    // Add some padding
    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }, [postIts, drawings, connections]);

  // 2. Calculate scaling to fit MINIMAP_SIZE
  const minimapScale = useMemo(() => {
    const scaleX = MINIMAP_SIZE / bounds.width;
    const scaleY = (MINIMAP_SIZE * 0.75) / bounds.height; // Aspect ratio check
    return Math.min(scaleX, scaleY, 0.5); // Limit max scale for small boards
  }, [bounds]);

  const minimapWidth = bounds.width * minimapScale;
  const minimapHeight = bounds.height * minimapScale;

  // Viewport rectangle calculation (relative to bounds)
  const viewportRect = useMemo(() => {
    // Stage coordinates we currently see:
    // Left: -position.x / scale
    // Top: -position.y / scale
    // Right: (-position.x + stageWidth) / scale
    // Bottom: (-position.y + stageHeight) / scale
    
    const x = (-viewport.x / viewport.scale);
    const y = (-viewport.y / viewport.scale);
    const w = viewport.width / viewport.scale;
    const h = viewport.height / viewport.scale;

    return {
      x: (x - bounds.minX) * minimapScale,
      y: (y - bounds.minY) * minimapScale,
      width: w * minimapScale,
      height: h * minimapScale
    };
  }, [viewport, bounds, minimapScale]);

  const handleClick = (e: any) => {
    if (!onMove) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return;

    // Convert minimap click to stage position
    const targetX = (pos.x / minimapScale) + bounds.minX;
    const targetY = (pos.y / minimapScale) + bounds.minY;

    // We want this target point to be at the center of the viewport
    const newViewportX = - (targetX * viewport.scale) + (viewport.width / 2);
    const newViewportY = - (targetY * viewport.scale) + (viewport.height / 2);

    onMove(newViewportX, newViewportY);
  };

  return (
    <div 
      className={`fixed bottom-4 right-4 z-40 rounded-lg shadow-2xl border pointer-events-auto overflow-hidden transition-colors duration-300 ${
        theme === 'dark' ? 'bg-black/80 border-[#ff00ff]/30 shadow-[#ff00ff]/20' : 'bg-white/80 border-gray-200 shadow-black/10'
      }`}
      style={{
        width: minimapWidth,
        height: minimapHeight,
        backdropFilter: 'blur(8px)'
      }}
    >
      <Stage 
        width={minimapWidth} 
        height={minimapHeight}
        onClick={handleClick}
        onTap={handleClick}
      >
        <Layer scaleX={minimapScale} scaleY={minimapScale} x={-bounds.minX * minimapScale} y={-bounds.minY * minimapScale}>
          {/* Post-its simplified */}
          {postIts.map(p => (
            <Rect
              key={p.id}
              x={p.x}
              y={p.y}
              width={p.width}
              height={p.height}
              fill={p.color}
              stroke={theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}
              strokeWidth={2 / minimapScale}
              cornerRadius={5}
            />
          ))}

          {/* Drawings simplified */}
          {drawings.map(d => (
            <Line
              key={d.id}
              points={d.points}
              stroke={d.color !== '#000000' && d.color !== 'black' ? d.color : (theme === 'dark' ? 'white' : 'black')}
              strokeWidth={d.thickness / minimapScale / 2}
              tension={0.5}
              lineCap="round"
              opacity={0.6}
            />
          ))}

          {/* Content area highlight (optional) */}
          <Rect 
            x={bounds.minX}
            y={bounds.minY}
            width={bounds.width}
            height={bounds.height}
            stroke={theme === 'dark' ? 'rgba(255,0,255,0.1)' : 'rgba(59,130,246,0.1)'}
            strokeWidth={1 / minimapScale}
          />
        </Layer>
        
        {/* Viewport Outline - rendered in a separate layer to avoid clipping and keep on top */}
        <Layer>
          <Rect 
            x={viewportRect.x}
            y={viewportRect.y}
            width={viewportRect.width}
            height={viewportRect.height}
            stroke={theme === 'dark' ? '#ff00ff' : '#3b82f6'}
            strokeWidth={2}
            fill={theme === 'dark' ? 'rgba(255,0,255,0.1)' : 'rgba(59,130,246,0.1)'}
            listening={false}
          />
        </Layer>
      </Stage>
    </div>
  );
}
