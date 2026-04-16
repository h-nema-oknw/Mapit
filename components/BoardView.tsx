'use client';

import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Stage, Layer, Line, Arrow, Group, Rect, Text, Transformer, Circle, Image as KonvaImage } from 'react-konva';
import { useBoardStore, PostIt, Connection, DrawingLine } from '@/store/useBoardStore';
import { v4 as uuidv4 } from 'uuid';
import Konva from 'konva';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { File, Trash2, Edit2, Plus, X, Check } from 'lucide-react';

interface BoardViewProps {
  tool: 'board' | 'postit' | 'draw' | 'erase' | 'connect';
  drawingColor: string;
  drawingThickness: number;
  postItColor: string;
}

// Custom Image Component for Post-its
const PostItImage = ({ url, width, height }: { url: string, width: number, height: number }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new window.Image();
    img.src = url;
    img.onload = () => setImage(img);
  }, [url]);
  
  if (!image) return null;
  
  const padding = 10;
  const availableWidth = width - padding * 2;
  const availableHeight = height / 2; // Use bottom half for image
  
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  const imgWidth = image.width * scale;
  const imgHeight = image.height * scale;
  
  return (
    <KonvaImage 
      image={image} 
      x={(width - imgWidth) / 2} 
      y={height - imgHeight - 10} 
      width={imgWidth} 
      height={imgHeight} 
    />
  );
};

// Custom component to render drawings on a post-it using an offscreen canvas
// This isolates the 'destination-out' eraser operation to only the post-it's drawings.
const PostItDrawingCanvas = ({ postIt, drawings, theme, currentLine }: { postIt: PostIt, drawings: DrawingLine[], theme: 'light' | 'dark', currentLine: DrawingLine | null }) => {
  const canvas = React.useMemo(() => {
    const c = document.createElement('canvas');
    c.width = postIt.width;
    c.height = postIt.height;
    return c;
  }, [postIt.width, postIt.height]);

  React.useEffect(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const drawLine = (line: DrawingLine) => {
      ctx.beginPath();
      ctx.lineWidth = line.thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = getInvertedColor(line.color, theme, line.tool);
      ctx.globalCompositeOperation = line.tool === 'eraser' ? 'destination-out' : 'source-over';
      
      const points = line.points;
      if (points.length < 2) return;
      
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) {
        ctx.lineTo(points[i], points[i+1]);
      }
      ctx.stroke();
    };

    drawings.forEach(drawLine);
    if (currentLine && currentLine.postItId === postIt.id) {
      drawLine(currentLine);
    }
  }, [canvas, drawings, currentLine, theme, postIt.id]);

  return <KonvaImage image={canvas} listening={false} />;
};

// Helper to get intersection point on rectangle edge
const getEdgePoint = (rect: {x: number, y: number, width: number, height: number}, target: {x: number, y: number}, padding: number = 0) => {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const angle = Math.atan2(dy, dx);
  
  const hw = rect.width / 2 + padding;
  const hh = rect.height / 2 + padding;
  
  let x = 0, y = 0;
  if (Math.abs(dx) * hh > Math.abs(dy) * hw) {
    x = Math.sign(dx) * hw;
    y = x * Math.tan(angle);
  } else {
    y = Math.sign(dy) * hh;
    x = y / Math.tan(angle);
  }
  return { x: cx + x, y: cy + y };
};

// Helper to get inverted color for dark mode
const getInvertedColor = (color: string, theme: 'light' | 'dark', tool?: 'pen' | 'eraser') => {
  if (tool === 'eraser') return '#000000';
  if (theme === 'dark') {
    const lower = color.toLowerCase();
    if (lower === '#000000' || lower === 'black' || lower === '#000') return '#ffffff';
    if (lower === '#ffffff' || lower === 'white' || lower === '#fff') return '#000000';
  }
  return color;
};

// Helper to calculate convex hull (Monotone Chain algorithm)
const getConvexHull = (points: {x: number, y: number}[]) => {
  if (points.length <= 3) return points;
  
  const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
  
  const cross = (o: {x: number, y: number}, a: {x: number, y: number}, b: {x: number, y: number}) => {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  };
  
  const lower = [];
  for (let i = 0; i < sorted.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) {
      lower.pop();
    }
    lower.push(sorted[i]);
  }
  
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) {
      upper.pop();
    }
    upper.push(sorted[i]);
  }
  
  upper.pop();
  lower.pop();
  return lower.concat(upper);
};

export default function BoardView({ tool, drawingColor, drawingThickness, postItColor }: BoardViewProps) {
  const { 
    currentBoardId, 
    boards,
    postIts, 
    connections, 
    drawings, 
    addPostIt, 
    updatePostIt, 
    addDrawing,
    updateDrawing,
    deleteDrawing,
    addConnection,
    updateConnection,
    deleteConnection,
    saveHistory,
    deletePostIt,
    bringToFront,
    sendToBack,
    setCurrentBoard,
    setPostIts,
    mergePostIts,
    switchMergedPostIt,
    unmergePostIt,
    updateMergedPostIt,
    deleteMergedPostIt,
    theme,
    selectedIds,
    setSelectedIds
  } = useBoardStore();

  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const drawingsLayerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentLine, setCurrentLine] = useState<DrawingLine | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [tempConnectionEnd, setTempConnectionEnd] = useState<{ x: number, y: number } | null>(null);
  
  // Text editing state
  const [editingPostIt, setEditingPostIt] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editPos, setEditPos] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{visible: boolean, x: number, y: number, postIt: PostIt | null}>({visible: false, x: 0, y: 0, postIt: null});
  const [connectionContextMenu, setConnectionContextMenu] = useState<{visible: boolean, x: number, y: number, connection: Connection | null}>({visible: false, x: 0, y: 0, connection: null});

  // Tag management state
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [editingTagValue, setEditingTagValue] = useState('');
  const [multiSelectContextMenu, setMultiSelectContextMenu] = useState<{visible: boolean, x: number, y: number}>({visible: false, x: 0, y: 0});
  const [uploadingPostItId, setUploadingPostItId] = useState<string | null>(null);
  const [isLinkBoardDialogOpen, setIsLinkBoardDialogOpen] = useState(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isMergeManagementOpen, setIsMergeManagementOpen] = useState(false);
  const [editingMergedIndex, setEditingMergedIndex] = useState<number | null>(null);
  const [editingMergedData, setEditingMergedData] = useState<{title: string, text: string, color: string} | null>(null);
  const [groupContextMenu, setGroupContextMenu] = useState<{visible: boolean, x: number, y: number, groupId: string | null}>({visible: false, x: 0, y: 0, groupId: null});
  const [groupName, setGroupName] = useState('');
  
  // Selection Rect state
  const [selectionRect, setSelectionRect] = useState({ visible: false, startX: 0, startY: 0, endX: 0, endY: 0 });
  const [editingConnection, setEditingConnection] = useState<string | null>(null);

  const currentPostIts = postIts.filter(p => p.boardId === currentBoardId);
  const currentPostItGroups = useBoardStore(state => state.postItGroups).filter(g => g.boardId === currentBoardId);
  const currentConnections = connections.filter(c => c.boardId === currentBoardId);
  const currentDrawings = drawings.filter(d => d.boardId === currentBoardId);
  
  const getRect = (id: string) => {
    const p = currentPostIts.find(x => x.id === id);
    if (p) return { x: p.x, y: p.y, width: p.width, height: p.height };
    const g = currentPostItGroups.find(x => x.id === id);
    if (g) {
      const gPostIts = currentPostIts.filter(p => g.postItIds.includes(p.id));
      if (gPostIts.length === 0) return null;
      const minX = Math.min(...gPostIts.map(p => p.x)) - 20;
      const minY = Math.min(...gPostIts.map(p => p.y)) - 40;
      const maxX = Math.max(...gPostIts.map(p => p.x + p.width)) + 20;
      const maxY = Math.max(...gPostIts.map(p => p.y + p.height)) + 20;
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    return null;
  };

  useEffect(() => {
    if (transformerRef.current && layerRef.current) {
      const nodes = selectedIds.map(id => layerRef.current?.findOne(`#${id}`)).filter(Boolean) as Konva.Node[];
      transformerRef.current.nodes(nodes);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedIds]);

  // Handle keyboard delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0 && !editingPostIt) {
        selectedIds.forEach(id => deletePostIt(id));
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, editingPostIt, deletePostIt, setSelectedIds]);

  useLayoutEffect(() => {
    const checkSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setStageSize({ width: clientWidth, height: clientHeight });
        }
      }
    };

    // Initial check
    checkSize();

    // Use ResizeObserver for continuous monitoring
    const observer = new ResizeObserver((entries) => {
      window.requestAnimationFrame(() => {
        if (containerRef.current) {
          const { clientWidth, clientHeight } = containerRef.current;
          if (clientWidth > 0 && clientHeight > 0) {
            setStageSize({ width: clientWidth, height: clientHeight });
          }
        }
      });
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    const handleResize = () => checkSize();
    window.addEventListener('resize', handleResize);

    // Fallback for initial load
    const timer = setTimeout(checkSize, 100);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [currentBoardId]); // Re-run when board changes to ensure containerRef is captured

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    let newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    newScale = Math.max(0.1, Math.min(newScale, 5));

    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handleMouseDown = (e: any) => {
    if (!currentBoardId) return;
    
    // Close context menu on any click
    if (contextMenu.visible) {
      setContextMenu({ ...contextMenu, visible: false });
    }
    if (connectionContextMenu.visible) {
      setConnectionContextMenu({ ...connectionContextMenu, visible: false });
    }
    if (multiSelectContextMenu.visible) {
      setMultiSelectContextMenu({ ...multiSelectContextMenu, visible: false });
    }
    if (groupContextMenu.visible) {
      setGroupContextMenu({ ...groupContextMenu, visible: false });
    }

    if (editingPostIt) {
      updatePostIt(editingPostIt, { text: editValue });
      setEditingPostIt(null);
      return;
    }

    if (editingConnection) {
      // Don't close if we clicked on the control point handle itself
      const isHandle = e.target instanceof Konva.Circle && e.target.draggable();
      if (!isHandle) {
        setEditingConnection(null);
      }
    }

    const stage = e.target.getStage();
    const pos = stage.getRelativePointerPosition();
    const clickedOnEmpty = e.target === stage;

    if (e.evt.button === 2 && clickedOnEmpty && selectedIds.length > 1) {
      // Right click on empty space with multiple selection
      e.evt.preventDefault();
      setMultiSelectContextMenu({ visible: true, x: e.evt.clientX, y: e.evt.clientY });
      return;
    }

    if (clickedOnEmpty && connectingFrom) {
      setConnectingFrom(null);
      setTempConnectionEnd(null);
    }

    if (tool === 'postit') {
      if (clickedOnEmpty) {
        setSelectedIds([]);
        setSelectionRect({ visible: true, startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y });
      }
    } else if (tool === 'draw' || tool === 'erase') {
      // If board is selected (not exactly one post-it), ignore drawing if clicked on a post-it
      if (selectedIds.length !== 1 && !clickedOnEmpty) {
        let node = e.target;
        let isOnPostIt = false;
        while (node && node !== stage) {
          if (node.attrs.id && currentPostIts.some(p => p.id === node.attrs.id)) {
            isOnPostIt = true;
            break;
          }
          node = node.getParent();
        }
        if (isOnPostIt) return;
      }

      setIsDrawing(true);
      
      let drawingPos = pos;
      let targetPostItId: string | undefined = undefined;
      let mergedSourceId: string | undefined = undefined;

      // If exactly one post-it is selected, draw relative to it
      if (selectedIds.length === 1) {
        const postIt = currentPostIts.find(p => p.id === selectedIds[0]);
        if (postIt) {
          targetPostItId = postIt.id;
          if (postIt.mergedPostItIds && postIt.mergedPostItIds.length > 1) {
            mergedSourceId = postIt.mergedPostItIds[postIt.activeMergedIndex || 0];
          }
          // Calculate relative position manually to avoid complex Konva node lookups here
          // We need to account for rotation: (x, y) -> (x-px, y-py) then rotate back
          const dx = pos.x - postIt.x;
          const dy = pos.y - postIt.y;
          const rad = -postIt.rotation * Math.PI / 180;
          const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
          const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
          drawingPos = { x: rx, y: ry };
        }
      }

      const newLine: DrawingLine = {
        id: uuidv4(),
        boardId: currentBoardId,
        postItId: targetPostItId,
        mergedSourceId: mergedSourceId,
        points: [drawingPos.x, drawingPos.y],
        color: tool === 'erase' ? '#000000' : drawingColor,
        thickness: drawingThickness,
        tool: tool === 'erase' ? 'eraser' : 'pen'
      };
      setCurrentLine(newLine);
      saveHistory();
    }
  };

  const handleMouseMove = (e: any) => {
    if (!currentBoardId) return;
    const stage = e.target.getStage();
    const pos = stage.getRelativePointerPosition();

    if (isDrawing && currentLine) {
      let drawingPos = pos;
      if (currentLine.postItId) {
        const postIt = currentPostIts.find(p => p.id === currentLine.postItId);
        if (postIt) {
          const dx = pos.x - postIt.x;
          const dy = pos.y - postIt.y;
          const rad = -postIt.rotation * Math.PI / 180;
          const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
          const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
          drawingPos = { x: rx, y: ry };
        }
      }
      setCurrentLine({
        ...currentLine,
        points: [...currentLine.points, drawingPos.x, drawingPos.y]
      });
    }

    if (selectionRect.visible) {
      setSelectionRect({ ...selectionRect, endX: pos.x, endY: pos.y });
    }

    if (connectingFrom) {
      setTempConnectionEnd({ x: pos.x, y: pos.y });
    }
  };

  const handleMouseUp = (e: any) => {
    if (isDrawing && currentLine) {
      setIsDrawing(false);
      addDrawing(currentLine);
      setCurrentLine(null);
    }

    if (selectionRect.visible) {
      const box = {
        x: Math.min(selectionRect.startX, selectionRect.endX),
        y: Math.min(selectionRect.startY, selectionRect.endY),
        width: Math.abs(selectionRect.startX - selectionRect.endX),
        height: Math.abs(selectionRect.startY - selectionRect.endY)
      };
      
      // Only select if box is large enough to avoid accidental clicks
      if (box.width > 5 && box.height > 5) {
        const newSelectedIds = currentPostIts.filter(p => {
          return (
            p.x < box.x + box.width &&
            p.x + p.width > box.x &&
            p.y < box.y + box.height &&
            p.y + p.height > box.y
          );
        }).map(p => p.id);
        
        if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) {
          setSelectedIds([...new Set([...selectedIds, ...newSelectedIds])]);
        } else {
          setSelectedIds(newSelectedIds);
        }
      }
      setSelectionRect({ ...selectionRect, visible: false });
    }
  };

  const handlePostItClick = (e: any, postIt: PostIt) => {
    if (e.evt.button === 2) return; // Ignore right click

    if (connectingFrom) {
      if (connectingFrom !== postIt.id) {
        addConnection({
          fromId: connectingFrom,
          toId: postIt.id,
          color: '#000000',
          startShape: 'none',
          endShape: 'arrow'
        });
      }
      setConnectingFrom(null);
      setTempConnectionEnd(null);
      return;
    }

    if (tool === 'postit') {
      // Check if clicked on linked board icon
      const pos = stageRef.current?.getPointerPosition();
      if (pos && postIt.linkedBoardId) {
        const node = layerRef.current?.findOne(`#${postIt.id}`);
        if (node) {
          const transform = node.getAbsoluteTransform().copy();
          transform.invert();
          const localPos = transform.point(pos);
          // Icon is at x: width - 30, y: 10, width: 20, height: 20
          if (localPos.x >= postIt.width - 30 && localPos.x <= postIt.width - 10 &&
              localPos.y >= 10 && localPos.y <= 30) {
            setCurrentBoard(postIt.linkedBoardId);
            return;
          }
        }
      }

      const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
      const isSelected = selectedIds.includes(postIt.id);

      if (!metaPressed && !isSelected) {
        setSelectedIds([postIt.id]);
      } else if (metaPressed && isSelected) {
        setSelectedIds(selectedIds.filter((sid) => sid !== postIt.id));
      } else if (metaPressed && !isSelected) {
        setSelectedIds([...selectedIds, postIt.id]);
      }
    } else if (tool === 'postit') {
      const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
      const isSelected = selectedIds.includes(postIt.id);

      if (!metaPressed && !isSelected) {
        setSelectedIds([postIt.id]);
      } else if (metaPressed && isSelected) {
        setSelectedIds(selectedIds.filter((sid) => sid !== postIt.id));
      } else if (metaPressed && !isSelected) {
        setSelectedIds([...selectedIds, postIt.id]);
      }
    } else if (tool === 'connect') {
      if (!connectingFrom) {
        setConnectingFrom(postIt.id);
      }
    }
  };

  const handleGroupClick = (e: any, group: PostItGroup) => {
    if (e.evt.button === 2) return; // Ignore right click

    if (connectingFrom) {
      if (connectingFrom !== group.id) {
        addConnection({
          fromId: connectingFrom,
          toId: group.id,
          color: '#000000',
          startShape: 'none',
          endShape: 'arrow'
        });
      }
      setConnectingFrom(null);
      setTempConnectionEnd(null);
      return;
    }

    if (tool === 'connect') {
      setConnectingFrom(group.id);
    }
  };

  const handlePostItDblClick = (e: any, postIt: PostIt) => {
    if (tool === 'postit') {
      const node = layerRef.current?.findOne(`#${postIt.id}`);
      if (!node) return;

      const textPosition = node.getAbsolutePosition();
      const areaPosition = {
        x: textPosition.x + 10 * scale,
        y: textPosition.y + 10 * scale,
      };

      setEditPos({
        x: areaPosition.x,
        y: areaPosition.y,
        width: (postIt.width - 20) * scale,
        height: (postIt.height - 20) * scale,
      });
      setEditValue(postIt.text);
      setEditingPostIt(postIt.id);
    }
  };

  const handlePostItDragEnd = (e: any, id: string) => {
    saveHistory();
    if (selectedIds.includes(id) && selectedIds.length > 1) {
      const postIt = currentPostIts.find(p => p.id === id);
      if (!postIt) return;
      const dx = e.target.x() - postIt.x;
      const dy = e.target.y() - postIt.y;

      const newPostIts = postIts.map(p => {
        if (selectedIds.includes(p.id)) {
          return { ...p, x: p.x + dx, y: p.y + dy };
        }
        return p;
      });
      setPostIts(newPostIts);
    } else {
      updatePostIt(id, {
        x: e.target.x(),
        y: e.target.y()
      });
    }
  };

  const handlePostItDragSync = (e: any, id: string) => {
    if (selectedIds.includes(id) && selectedIds.length > 1) {
      const postIt = currentPostIts.find(p => p.id === id);
      if (!postIt) return;

      const dx = e.target.x() - postIt.x;
      const dy = e.target.y() - postIt.y;

      selectedIds.forEach(sid => {
        if (sid !== id) {
          const node = layerRef.current?.findOne(`#${sid}`);
          if (node) {
            const p = currentPostIts.find(item => item.id === sid);
            if (p) {
              node.x(p.x + dx);
              node.y(p.y + dy);
            }
          }
        }
      });
    }
  };

  const handlePostItTransformSync = (e: any, id: string) => {
    // Visual sync is handled by Transformer
  };

  const handlePostItTransformEnd = (e: any, id: string) => {
    saveHistory();
    if (selectedIds.includes(id) && selectedIds.length > 1) {
      const updatedPostIts = postIts.map(p => {
        if (selectedIds.includes(p.id)) {
          const node = layerRef.current?.findOne(`#${p.id}`);
          if (node) {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            const newWidth = Math.max(50, node.width() * scaleX);
            const newHeight = Math.max(50, node.height() * scaleY);
            
            node.scaleX(1);
            node.scaleY(1);
            
            return {
              ...p,
              x: node.x(),
              y: node.y(),
              width: newWidth,
              height: newHeight,
              rotation: node.rotation()
            };
          }
        }
        return p;
      });
      setPostIts(updatedPostIts);
    } else {
      const node = layerRef.current?.findOne(`#${id}`);
      if (node) {
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        
        // Scale bound drawings
        const boundDrawings = drawings.filter(d => d.postItId === id);
        boundDrawings.forEach(d => {
          const newPoints = d.points.map((p, i) => i % 2 === 0 ? p * scaleX : p * scaleY);
          updateDrawing(d.id, { 
            points: newPoints,
            thickness: d.thickness * ((scaleX + scaleY) / 2)
          });
        });

        node.scaleX(1);
        node.scaleY(1);
        
        updatePostIt(id, {
          x: node.x(),
          y: node.y(),
          width: Math.max(50, node.width() * scaleX),
          height: Math.max(50, node.height() * scaleY),
          rotation: node.rotation()
        });
      }
    }
  };

  const handleContextMenu = (e: any, postIt: PostIt) => {
    e.evt.preventDefault();
    setContextMenu({
      visible: true,
      x: e.evt.clientX,
      y: e.evt.clientY,
      postIt
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!currentBoardId) return;

    const color = e.dataTransfer.getData('application/mindmap-color');
    const boardId = e.dataTransfer.getData('application/mindmap-board');
    
    const stage = stageRef.current;
    const container = containerRef.current;
    if (!stage || !container) return;

    // Calculate relative position manually for drag events using the container's rect
    const rect = container.getBoundingClientRect();
    const pos = {
      x: (e.clientX - rect.left - position.x) / scale,
      y: (e.clientY - rect.top - position.y) / scale
    };

    if (color) {
      addPostIt({ title: '', text: '', x: pos.x, y: pos.y, width: 180, height: 150, rotation: 0, color, tags: [], fontSize: 14 });
    } else if (boardId) {
      const board = boards.find(b => b.id === boardId);
      addPostIt({ title: board?.name || 'リンクされたボード', text: '', x: pos.x, y: pos.y, width: 180, height: 150, rotation: 0, color: '#e5e7eb', tags: [], linkedBoardId: boardId, fontSize: 14 });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && uploadingPostItId) {
      const reader = new FileReader();
      reader.onload = (event) => {
        updatePostIt(uploadingPostItId, { imageUrl: event.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  if (!currentBoardId) {
    return <div className={`flex-1 transition-colors duration-300 ${theme === 'dark' ? 'bg-[#000000]' : 'bg-[#f2f2f2]'}`} />;
  }

  return (
    <div 
      ref={containerRef}
      className={`flex-1 w-full h-full relative overflow-hidden transition-colors duration-300 ${theme === 'dark' ? 'bg-[#000000]' : 'bg-[#f2f2f2]'}`}
      id="canvas-container"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onFileChange} />
      
      <div style={{ opacity: stageSize.width > 0 ? 1 : 0, transition: 'opacity 0.2s' }}>
        <Stage
          ref={stageRef}
          width={stageSize.width || 1}
          height={stageSize.height || 1}
          onWheel={handleWheel}
          scaleX={scale}
          scaleY={scale}
          x={position.x}
          y={position.y}
          draggable={tool === 'board' && !editingPostIt}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          onContextMenu={(e) => e.evt.preventDefault()}
        >
        <Layer>
          <Rect
            x={-position.x / scale}
            y={-position.y / scale}
            width={stageSize.width / scale}
            height={stageSize.height / scale}
            fill={theme === 'dark' ? '#000000' : '#f2f2f2'}
            listening={false}
          />
        </Layer>
        {/* Board Drawings Layer - Isolated to prevent eraser from affecting other elements */}
        <Layer ref={drawingsLayerRef}>
          {/* Board drawings */}
          {currentDrawings.filter(d => !d.postItId).map((line) => (
            <Line
              key={line.id}
              points={line.points}
              stroke={getInvertedColor(line.color, theme, line.tool)}
              strokeWidth={line.thickness}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              shadowColor={line.color === '#ffffff' && theme === 'light' ? 'rgba(0,0,0,0.3)' : undefined}
              shadowBlur={line.color === '#ffffff' && theme === 'light' ? 2 : 0}
              shadowOffset={line.color === '#ffffff' && theme === 'light' ? { x: 1, y: 1 } : { x: 0, y: 0 }}
              globalCompositeOperation={
                line.tool === 'eraser' ? 'destination-out' : 'source-over'
              }
              listening={false}
            />
          ))}
          {currentLine && !currentLine.postItId && (
            <Line
              points={currentLine.points}
              stroke={getInvertedColor(currentLine.color, theme, currentLine.tool)}
              strokeWidth={currentLine.thickness}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              shadowColor={currentLine.color === '#ffffff' && theme === 'light' ? 'rgba(0,0,0,0.3)' : undefined}
              shadowBlur={currentLine.color === '#ffffff' && theme === 'light' ? 2 : 0}
              shadowOffset={currentLine.color === '#ffffff' && theme === 'light' ? { x: 1, y: 1 } : { x: 0, y: 0 }}
              globalCompositeOperation={
                currentLine.tool === 'eraser' ? 'destination-out' : 'source-over'
              }
              listening={false}
            />
          )}
        </Layer>

        <Layer ref={layerRef}>
          {/* Grid lines for background texture */}
          <Group>
            {Array.from({ length: 100 }).map((_, i) => (
              <React.Fragment key={i}>
                <Line 
                  points={[-5000, i * 100 - 2500, 5000, i * 100 - 2500]} 
                  stroke={theme === 'dark' ? "rgba(229, 231, 235, 0.2)" : "rgba(128, 128, 128, 0.15)"} 
                  strokeWidth={1} 
                  listening={false}
                />
                <Line 
                  points={[i * 100 - 2500, -5000, i * 100 - 2500, 5000]} 
                  stroke={theme === 'dark' ? "rgba(229, 231, 235, 0.2)" : "rgba(128, 128, 128, 0.15)"} 
                  strokeWidth={1} 
                  listening={false}
                />
              </React.Fragment>
            ))}
          </Group>
          {/* Groups */}
          {currentPostItGroups.map(group => {
            const groupPostIts = currentPostIts.filter(p => group.postItIds.includes(p.id));
            if (groupPostIts.length === 0) return null;
            
            const minX = Math.min(...groupPostIts.map(p => p.x)) - 20;
            const minY = Math.min(...groupPostIts.map(p => p.y)) - 40;
            const maxX = Math.max(...groupPostIts.map(p => p.x + p.width)) + 20;
            const maxY = Math.max(...groupPostIts.map(p => p.y + p.height)) + 20;
            
            let hullPoints: number[] = [];
            if (group.shape === 'hull') {
              const points: {x: number, y: number}[] = [];
              groupPostIts.forEach(p => {
                const pad = 20;
                points.push({x: p.x - pad, y: p.y - pad});
                points.push({x: p.x + p.width + pad, y: p.y - pad});
                points.push({x: p.x + p.width + pad, y: p.y + p.height + pad});
                points.push({x: p.x - pad, y: p.y + p.height + pad});
              });
              const hull = getConvexHull(points);
              hullPoints = hull.flatMap(p => [p.x, p.y]);
            }

            return (
              <Group 
                key={group.id} 
                onClick={(e) => handleGroupClick(e, group)}
                onContextMenu={(e) => {
                  e.evt.preventDefault();
                  e.cancelBubble = true;
                  setGroupContextMenu({ visible: true, x: e.evt.clientX, y: e.evt.clientY, groupId: group.id });
                }}
              >
                {group.shape === 'hull' && hullPoints.length > 0 ? (
                  <Line
                    points={hullPoints}
                    stroke={connectingFrom === group.id ? '#00f3ff' : group.color}
                    strokeWidth={connectingFrom === group.id ? 4 : 2}
                    dash={group.borderStyle === 'solid' ? undefined : [5, 5]}
                    closed={true}
                    fill={connectingFrom === group.id ? "rgba(0, 243, 255, 0.1)" : "rgba(0,0,0,0.02)"}
                    tension={0.2}
                    shadowColor={connectingFrom === group.id ? '#00f3ff' : undefined}
                    shadowBlur={connectingFrom === group.id ? 10 : 0}
                  />
                ) : (
                  <Rect 
                    x={minX}
                    y={minY}
                    width={maxX - minX} 
                    height={maxY - minY} 
                    stroke={connectingFrom === group.id ? '#00f3ff' : group.color} 
                    strokeWidth={connectingFrom === group.id ? 4 : 2} 
                    dash={group.borderStyle === 'solid' ? undefined : [5, 5]} 
                    cornerRadius={8} 
                    fill={connectingFrom === group.id ? "rgba(0, 243, 255, 0.1)" : "rgba(0,0,0,0.02)"} 
                    shadowColor={connectingFrom === group.id ? '#00f3ff' : undefined}
                    shadowBlur={connectingFrom === group.id ? 10 : 0}
                  />
                )}
                <Text 
                  text={group.name} 
                  x={group.shape === 'hull' ? minX + 10 : minX + 10} 
                  y={group.shape === 'hull' ? minY + 10 : minY + 10} 
                  fontSize={16} 
                  fontStyle="bold" 
                  fill={group.color} 
                />
              </Group>
            );
          })}

          {/* Connections */}
          {currentConnections.map(conn => {
            const fromRect = getRect(conn.fromId);
            const toRect = getRect(conn.toId);
            if (!fromRect || !toRect) return null;
            
            const fromCenter = { x: fromRect.x + fromRect.width / 2, y: fromRect.y + fromRect.height / 2 };
            const toCenter = { x: toRect.x + toRect.width / 2, y: toRect.y + toRect.height / 2 };
            
            // If control point exists, calculate start/end points towards it
            const targetForStart = conn.controlPoint || toCenter;
            const targetForEnd = conn.controlPoint || fromCenter;

            // Add padding to ensure arrow tips are visible and not hidden by post-it background
            const startPoint = getEdgePoint(fromRect, targetForStart, 2);
            const endPoint = getEdgePoint(toRect, targetForEnd, 5);
            
            const dx = endPoint.x - startPoint.x;
            const dy = endPoint.y - startPoint.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            const nx = -dy / len * 10;
            const ny = dx / len * 10;

            const handleConnContextMenu = (e: any) => {
              e.evt.preventDefault();
              e.cancelBubble = true;
              setConnectionContextMenu({ visible: true, x: e.evt.clientX, y: e.evt.clientY, connection: conn });
            };

            const points = conn.controlPoint 
              ? [startPoint.x, startPoint.y, conn.controlPoint.x, conn.controlPoint.y, endPoint.x, endPoint.y]
              : [startPoint.x, startPoint.y, endPoint.x, endPoint.y];

            return (
              <Group key={conn.id} onContextMenu={handleConnContextMenu}>
                {/* Invisible thicker line for easier clicking */}
                <Line
                  points={points}
                  stroke="transparent"
                  strokeWidth={20}
                  tension={conn.controlPoint ? 0.5 : 0}
                />
                {conn.bidirectionalStyle === 'double' ? (
                  <>
                    <Arrow
                      points={conn.controlPoint 
                        ? [startPoint.x + nx, startPoint.y + ny, conn.controlPoint.x + nx, conn.controlPoint.y + ny, endPoint.x + nx, endPoint.y + ny]
                        : [startPoint.x + nx, startPoint.y + ny, endPoint.x + nx, endPoint.y + ny]}
                      stroke={getInvertedColor(conn.color, theme)}
                      fill={getInvertedColor(conn.color, theme)}
                      strokeWidth={2}
                      pointerLength={10}
                      pointerWidth={10}
                      dash={conn.isDashed ? [5, 5] : undefined}
                      tension={conn.controlPoint ? 0.5 : 0}
                    />
                    <Arrow
                      points={conn.controlPoint
                        ? [endPoint.x - nx, endPoint.y - ny, conn.controlPoint.x - nx, conn.controlPoint.y - ny, startPoint.x - nx, startPoint.y - ny]
                        : [endPoint.x - nx, endPoint.y - ny, startPoint.x - nx, startPoint.y - ny]}
                      stroke={getInvertedColor(conn.color, theme)}
                      fill={getInvertedColor(conn.color, theme)}
                      strokeWidth={2}
                      pointerLength={10}
                      pointerWidth={10}
                      dash={conn.isDashed ? [5, 5] : undefined}
                      tension={conn.controlPoint ? 0.5 : 0}
                    />
                  </>
                ) : (
                  <Arrow
                    points={points}
                    stroke={getInvertedColor(conn.color, theme)}
                    fill={getInvertedColor(conn.color, theme)}
                    strokeWidth={2}
                    pointerLength={conn.endShape === 'arrow' ? 10 : 0}
                    pointerWidth={conn.endShape === 'arrow' ? 10 : 0}
                    pointerAtBeginning={conn.startShape === 'arrow'}
                    dash={conn.isDashed ? [5, 5] : undefined}
                    tension={conn.controlPoint ? 0.5 : 0}
                  />
                )}
                {conn.text && (
                  <Text
                    text={conn.text}
                    x={conn.controlPoint ? conn.controlPoint.x - 20 : startPoint.x + dx / 2 - 20}
                    y={conn.controlPoint ? conn.controlPoint.y - 10 : startPoint.y + dy / 2 - 10}
                    fill={getInvertedColor(conn.color, theme)}
                    fontSize={14}
                    background={theme === 'dark' ? '#000000' : 'white'}
                  />
                )}
                {/* Control Point Handle */}
                {conn.controlPoint && editingConnection === conn.id && (
                  <Circle
                    x={conn.controlPoint.x}
                    y={conn.controlPoint.y}
                    radius={6}
                    fill={theme === 'dark' ? '#ff00ff' : '#3b82f6'}
                    stroke="white"
                    strokeWidth={2}
                    draggable
                    onDragMove={(e) => {
                      updateConnection(conn.id, { 
                        controlPoint: { x: e.target.x(), y: e.target.y() } 
                      });
                    }}
                    onDragEnd={() => saveHistory()}
                  />
                )}
              </Group>
            );
          })}

          {/* Temp Connection */}
          {connectingFrom && tempConnectionEnd && (() => {
            const fromRect = getRect(connectingFrom);
            if (!fromRect) return null;
            const startPoint = getEdgePoint(fromRect, tempConnectionEnd, 2);
            return (
              <Line
                points={[startPoint.x, startPoint.y, tempConnectionEnd.x, tempConnectionEnd.y]}
                stroke={theme === 'dark' ? '#ffffff' : '#000000'}
                strokeWidth={2}
                dash={[5, 5]}
              />
            );
          })()}

          {/* Transformer for Selection */}
          {selectedIds.length > 0 && tool === 'postit' && !editingPostIt && (
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 50 || newBox.height < 50) {
                  return oldBox;
                }
                return newBox;
              }}
            />
          )}

          {/* Post-its */}
          {currentPostIts.map((postIt) => (
            <Group
              key={postIt.id}
              id={postIt.id}
              x={postIt.x}
              y={postIt.y}
              width={postIt.width}
              height={postIt.height}
              rotation={postIt.rotation}
              draggable={tool === 'postit' && !editingPostIt}
              onClick={(e) => handlePostItClick(e, postIt)}
              onTap={(e) => handlePostItClick(e, postIt)}
              onDblClick={(e) => handlePostItDblClick(e, postIt)}
              onDblTap={(e) => handlePostItDblClick(e, postIt)}
              onDragEnd={(e) => handlePostItDragEnd(e, postIt.id)}
              onDragMove={(e) => handlePostItDragSync(e, postIt.id)}
              onTransform={(e) => handlePostItTransformSync(e, postIt.id)}
              onTransformEnd={(e) => handlePostItTransformEnd(e, postIt.id)}
              onContextMenu={(e) => handleContextMenu(e, postIt)}
            >
              <Rect
                width={postIt.width}
                height={postIt.height}
                fill={postIt.color}
                shadowOffset={{ x: 5, y: 5 }}
                cornerRadius={4}
                stroke={connectingFrom === postIt.id ? '#00f3ff' : (selectedIds.includes(postIt.id) ? '#3b82f6' : undefined)}
                strokeWidth={connectingFrom === postIt.id ? 4 : (selectedIds.includes(postIt.id) ? 2 : 0)}
                shadowColor={connectingFrom === postIt.id ? '#00f3ff' : "black"}
                shadowBlur={connectingFrom === postIt.id ? 15 : 10}
                shadowOpacity={connectingFrom === postIt.id ? 0.8 : 0.2}
              />

              {/* Merged Indicator (Double Border) */}
              {postIt.mergedPostItIds && postIt.mergedPostItIds.length > 1 && (
                <Rect
                  x={-4}
                  y={-4}
                  width={postIt.width + 8}
                  height={postIt.height + 8}
                  stroke={postIt.color}
                  strokeWidth={2}
                  cornerRadius={6}
                  listening={false}
                />
              )}
              
              {postIt.imageUrl && (
                <PostItImage url={postIt.imageUrl} width={postIt.width} height={postIt.height} />
              )}

              {/* Post-it Drawings (Isolated using offscreen canvas) */}
              <PostItDrawingCanvas 
                postIt={postIt} 
                drawings={drawings.filter(d => {
                  if (d.postItId !== postIt.id) return false;
                  if (postIt.mergedPostItIds && postIt.mergedPostItIds.length > 1) {
                    const activeId = postIt.mergedPostItIds[postIt.activeMergedIndex || 0];
                    return d.mergedSourceId === activeId;
                  }
                  return true;
                })} 
                theme={theme} 
                currentLine={currentLine} 
              />

              {editingPostIt !== postIt.id && (
                <>
                  {postIt.title && (
                    <Text
                      text={postIt.title}
                      width={postIt.width - 20}
                      height={20}
                      x={10}
                      y={10}
                      fontSize={(postIt.fontSize || 14) + 2}
                      fontStyle="bold"
                      fontFamily="sans-serif"
                      fill="#1f2937"
                      wrap="none"
                      ellipsis={true}
                    />
                  )}
                  <Text
                    text={postIt.text}
                    width={postIt.width - 20}
                    height={postIt.height - (postIt.imageUrl ? postIt.height / 2 + 10 : 20) - (postIt.title ? 25 : 0)}
                    x={10}
                    y={postIt.title ? 35 : 10}
                    fontSize={postIt.fontSize || 14}
                    fontFamily="sans-serif"
                    fill="#333"
                    wrap="word"
                    ellipsis={true}
                  />
                </>
              )}
              
              {/* Linked Board Indicator */}
              {postIt.linkedBoardId && (
                <Group x={postIt.width - 30} y={10}>
                  <Rect width={20} height={20} fill="rgba(255,255,255,0.5)" cornerRadius={4} />
                  <Text text="🔗" fontSize={14} x={2} y={3} />
                </Group>
              )}

              {/* Merged Navigation Buttons */}
              {postIt.mergedPostItIds && postIt.mergedPostItIds.length > 1 && (
                <Group x={postIt.width - (postIt.linkedBoardId ? 85 : 55)} y={10}>
                  <Group onClick={(e) => { e.cancelBubble = true; switchMergedPostIt(postIt.id, 'prev'); }}>
                    <Rect width={20} height={20} fill="rgba(255,255,255,0.5)" cornerRadius={4} />
                    <Text text="<" fontSize={14} x={5} y={3} fill="#333" />
                  </Group>
                  <Group x={25} onClick={(e) => { e.cancelBubble = true; switchMergedPostIt(postIt.id, 'next'); }}>
                    <Rect width={20} height={20} fill="rgba(255,255,255,0.5)" cornerRadius={4} />
                    <Text text=">" fontSize={14} x={5} y={3} fill="#333" />
                  </Group>
                </Group>
              )}

              {/* Tags indicator */}
              {postIt.tags && postIt.tags.length > 0 && (() => {
                const mainFontSize = postIt.fontSize || 14;
                const tagFontSize = Math.round(mainFontSize * 0.75);
                const tagHeight = tagFontSize + 8;
                const tagPadding = 6;
                const tagMargin = 4;
                
                let currentX = 10;
                let currentY = postIt.height - tagHeight - 7;
                
                const tagsToRender: React.ReactNode[] = [];
                
                // Sort tags to render from bottom up if they wrap
                const sortedTags = [...postIt.tags];
                
                sortedTags.forEach((tag, i) => {
                  const text = `#${tag}`;
                  // More accurate width estimation handling full-width characters
                  const estimatedWidth = Array.from(text).reduce((acc, char) => {
                    // Full-width characters are roughly 1em, half-width are roughly 0.6em
                    return acc + (char.match(/[^\x00-\xff]/) ? tagFontSize : tagFontSize * 0.65);
                  }, 0) + tagPadding * 2;
                  
                  // Check if it fits in current line
                  if (currentX + estimatedWidth > postIt.width - 10) {
                    currentX = 10;
                    currentY -= (tagHeight + 4); // Move up for next line
                  }
                  
                  const x = currentX;
                  const y = currentY;
                  currentX += estimatedWidth + tagMargin;
                  
                  // Don't render if it goes above the post-it content area
                  if (y >= (postIt.title ? 35 : 10)) {
                    tagsToRender.push(
                      <Group key={i} x={x} y={y}>
                        <Rect width={estimatedWidth} height={tagHeight} fill={theme === 'dark' ? '#334155' : '#e2e8f0'} cornerRadius={4} />
                        <Text 
                          text={text} 
                          fontSize={tagFontSize} 
                          fill={theme === 'dark' ? '#94a3b8' : '#475569'} 
                          x={tagPadding} 
                          y={(tagHeight - tagFontSize) / 2} 
                          wrap="none" 
                        />
                      </Group>
                    );
                  }
                });
                
                return <Group>{tagsToRender}</Group>;
              })()}
            </Group>
          ))}

          {/* Selection Rect */}
          {selectionRect.visible && (
            <Rect
              x={Math.min(selectionRect.startX, selectionRect.endX)}
              y={Math.min(selectionRect.startY, selectionRect.endY)}
              width={Math.abs(selectionRect.startX - selectionRect.endX)}
              height={Math.abs(selectionRect.startY - selectionRect.endY)}
              fill="rgba(59, 130, 246, 0.1)"
              stroke="#3b82f6"
              strokeWidth={1}
            />
          )}
        </Layer>
      </Stage>
      </div>

      {/* HTML Overlay for Text Editing */}
      {editingPostIt && (
        <div
          style={{
            position: 'absolute',
            top: editPos.y,
            left: editPos.x,
            width: editPos.width,
            height: editPos.height,
            backgroundColor: theme === 'dark' ? '#000000' : 'white',
            border: theme === 'dark' ? '2px solid #ff00ff' : '1px solid #3b82f6',
            borderRadius: '4px',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            zIndex: 100,
            boxShadow: theme === 'dark' ? '0 0 15px rgba(255, 0, 255, 0.5)' : '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          }}
        >
          <input
            type="text"
            placeholder="見出し"
            value={useBoardStore.getState().postIts.find(p => p.id === editingPostIt)?.title || ''}
            onChange={(e) => updatePostIt(editingPostIt, { title: e.target.value })}
            className={`w-full text-sm font-bold border-b pb-1 outline-none ${theme === 'dark' ? 'bg-transparent text-[#00f3ff] border-[#ff00ff]' : 'bg-white text-gray-900 border-gray-200'}`}
            autoFocus
          />
          <textarea
            placeholder="本文"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                updatePostIt(editingPostIt, { text: editValue });
                setEditingPostIt(null);
              }
            }}
            style={{
              width: '100%',
              height: '100%',
              fontSize: `${(useBoardStore.getState().postIts.find(p => p.id === editingPostIt)?.fontSize || 14) * scale}px`,
              border: 'none',
              padding: '0px',
              margin: '0px',
              overflowY: 'auto',
              background: 'none',
              outline: 'none',
              resize: 'none',
              lineHeight: 1.2,
              fontFamily: 'sans-serif',
              color: theme === 'dark' ? '#ffffff' : '#333',
            }}
          />
          <div className="flex justify-end gap-2 mt-1">
            <Button size="sm" variant="ghost" className={`h-8 text-xs ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-white/10' : ''}`} onClick={() => setEditingPostIt(null)}>キャンセル</Button>
            <Button size="sm" className={`h-8 text-xs ${theme === 'dark' ? 'bg-[#ff00ff] hover:bg-[#ff00ff]/80 text-white shadow-[0_0_10px_rgba(255,0,255,0.5)]' : ''}`} onClick={() => {
              updatePostIt(editingPostIt, { text: editValue });
              setEditingPostIt(null);
            }}>保存</Button>
          </div>
        </div>
      )}

      {/* Context Menu Overlay */}
      {contextMenu.visible && contextMenu.postIt && (
        <div 
          style={{ top: contextMenu.y, left: contextMenu.x }} 
          className={`fixed border shadow-lg rounded-md py-1 z-50 text-sm min-w-[180px] flex flex-col ${theme === 'dark' ? 'bg-[#000000] border-[#ff00ff] text-[#00f3ff] shadow-[0_0_20px_rgba(255,0,255,0.3)]' : 'bg-white border-gray-200 text-gray-900'}`}
        >
          {selectedIds.length > 1 && selectedIds.includes(contextMenu.postIt.id) && (
            <>
              <button className={`px-4 py-3 text-left font-semibold border-b mb-1 pb-2 ${theme === 'dark' ? 'hover:bg-[#ff00ff]/10 text-[#ff00ff] border-[#ff00ff]/30' : 'hover:bg-gray-100 text-blue-600 border-gray-100'}`} onClick={() => {
                setIsGroupDialogOpen(true);
                setContextMenu({...contextMenu, visible: false});
              }}>選択した付箋をグループ化</button>
              <button className={`px-4 py-3 text-left font-semibold border-b mb-1 pb-2 ${theme === 'dark' ? 'hover:bg-[#ff00ff]/10 text-[#ff00ff] border-[#ff00ff]/30' : 'hover:bg-gray-100 text-blue-600 border-gray-100'}`} onClick={() => {
                mergePostIts(selectedIds);
                setContextMenu({...contextMenu, visible: false});
              }}>選択した付箋を統合</button>
            </>
          )}

          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            fileInputRef.current?.click();
            setUploadingPostItId(contextMenu.postIt!.id);
            setContextMenu({...contextMenu, visible: false});
          }}>画像をアップロード</button>
          
          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            setIsLinkBoardDialogOpen(true);
            setContextMenu({...contextMenu, visible: false});
          }}>ボードと連結</button>
          
          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            setIsTagDialogOpen(true);
            setContextMenu({...contextMenu, visible: false});
          }}>タグの管理</button>
          
          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            setConnectingFrom(contextMenu.postIt!.id);
            setContextMenu({...contextMenu, visible: false});
          }}>連結</button>

          {contextMenu.postIt?.mergedPostItIds && contextMenu.postIt.mergedPostItIds.length > 1 && (
            <button className={`px-4 py-3 text-left font-semibold border-t mt-1 ${theme === 'dark' ? 'hover:bg-[#ff00ff]/10 text-[#ff00ff] border-[#ff00ff]/30' : 'hover:bg-gray-100 text-blue-600 border-gray-100'}`} onClick={() => {
              setIsMergeManagementOpen(true);
              setContextMenu({...contextMenu, visible: false});
            }}>統合を管理</button>
          )}

          <button className={`px-4 py-3 text-left border-t mt-1 ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10 border-[#ff00ff]/30' : 'hover:bg-gray-100 border-gray-100'}`} onClick={() => {
            bringToFront(contextMenu.postIt!.id);
            setContextMenu({...contextMenu, visible: false});
          }}>最前面に表示</button>

          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            sendToBack(contextMenu.postIt!.id);
            setContextMenu({...contextMenu, visible: false});
          }}>最背面に表示</button>
          
          <div className={`px-4 py-2 flex flex-wrap gap-1 border-t mt-1 pt-2 ${theme === 'dark' ? 'border-[#ff00ff]/30' : 'border-gray-100'}`}>
            {[12, 14, 16, 20, 24].map(size => (
              <button 
                key={size}
                className={`w-7 h-7 flex items-center justify-center rounded border text-[10px] transition-colors ${theme === 'dark' 
                  ? (contextMenu.postIt?.fontSize === size ? 'bg-[#ff00ff]/20 border-[#ff00ff] text-[#ff00ff]' : 'border-[#00f3ff]/30 text-[#00f3ff]/70 hover:bg-[#00f3ff]/10') 
                  : (contextMenu.postIt?.fontSize === size ? 'bg-blue-50 border-blue-200 text-blue-600' : 'text-gray-600 hover:bg-gray-50')}`}
                onClick={() => {
                  updatePostIt(contextMenu.postIt!.id, { fontSize: size });
                  setContextMenu({...contextMenu, visible: false});
                }}
              >
                {size}
              </button>
            ))}
          </div>

          <div className={`px-4 py-2 flex gap-1 border-t mt-1 pt-2 ${theme === 'dark' ? 'border-[#ff00ff]/30' : 'border-gray-100'}`}>
            {['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e5e7eb'].map(c => (
              <div 
                key={c} 
                className="w-5 h-5 rounded-full cursor-pointer border shadow-sm" 
                style={{backgroundColor: c}} 
                onClick={() => { 
                  updatePostIt(contextMenu.postIt!.id, {color: c}); 
                  setContextMenu({...contextMenu, visible: false}); 
                }} 
              />
            ))}
          </div>
          
          <button className={`px-4 py-3 text-left border-t mt-1 ${theme === 'dark' ? 'hover:bg-red-900/30 text-red-400 border-[#ff00ff]/30' : 'hover:bg-red-50 text-red-600 border-gray-100'}`} onClick={() => { 
            deletePostIt(contextMenu.postIt!.id); 
            setContextMenu({...contextMenu, visible: false}); 
          }}>削除</button>
        </div>
      )}

      {/* Connection Context Menu Overlay */}
      {connectionContextMenu.visible && connectionContextMenu.connection && (
        <div 
          style={{ top: connectionContextMenu.y, left: connectionContextMenu.x }} 
          className={`fixed border shadow-lg rounded-md py-1 z-50 text-sm min-w-[180px] flex flex-col ${theme === 'dark' ? 'bg-[#000000] border-[#ff00ff] text-[#00f3ff] shadow-[0_0_20px_rgba(255,0,255,0.3)]' : 'bg-white border-gray-200 text-gray-900'}`}
        >
          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            const text = prompt('コメントを入力してください', connectionContextMenu.connection?.text || '');
            if (text !== null) {
              updateConnection(connectionContextMenu.connection!.id, { text });
            }
            setConnectionContextMenu({...connectionContextMenu, visible: false});
          }}>コメントを追加</button>
          
          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            updateConnection(connectionContextMenu.connection!.id, { isDashed: !connectionContextMenu.connection!.isDashed });
            setConnectionContextMenu({...connectionContextMenu, visible: false});
          }}>線と点線の切り替え</button>
          
          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            const current = connectionContextMenu.connection!;
            const isBoth = current.startShape === 'arrow' && current.endShape === 'arrow';
            const isEnd = current.startShape === 'none' && current.endShape === 'arrow';
            
            if (isBoth) {
              updateConnection(current.id, { startShape: 'none', endShape: 'arrow' });
            } else if (isEnd) {
              updateConnection(current.id, { startShape: 'none', endShape: 'none' });
            } else {
              updateConnection(current.id, { startShape: 'arrow', endShape: 'arrow' });
            }
            setConnectionContextMenu({...connectionContextMenu, visible: false});
          }}>矢印の切り替え</button>
          
          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            const current = connectionContextMenu.connection!;
            updateConnection(current.id, { bidirectionalStyle: current.bidirectionalStyle === 'double' ? 'single' : 'double' });
            setConnectionContextMenu({...connectionContextMenu, visible: false});
          }}>双方向スタイルの切り替え (↔ / ⇄)</button>

          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            const current = connectionContextMenu.connection!;
            if (current.controlPoint) {
              updateConnection(current.id, { controlPoint: undefined });
              setEditingConnection(null);
            } else {
              const fromRect = getRect(current.fromId);
              const toRect = getRect(current.toId);
              if (fromRect && toRect) {
                const fromCenter = { x: fromRect.x + fromRect.width / 2, y: fromRect.y + fromRect.height / 2 };
                const toCenter = { x: toRect.x + toRect.width / 2, y: toRect.y + toRect.height / 2 };
                updateConnection(current.id, { 
                  controlPoint: { 
                    x: (fromCenter.x + toCenter.x) / 2, 
                    y: (fromCenter.y + toCenter.y) / 2 
                  } 
                });
                setEditingConnection(current.id);
              }
            }
            setConnectionContextMenu({...connectionContextMenu, visible: false});
          }}>{connectionContextMenu.connection?.controlPoint ? '曲線を解除' : '線を曲げる'}</button>

          {connectionContextMenu.connection?.controlPoint && (
            <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
              setEditingConnection(connectionContextMenu.connection!.id);
              setConnectionContextMenu({...connectionContextMenu, visible: false});
            }}>頂点を調整</button>
          )}

          <button className={`px-4 py-3 text-left border-t mt-1 ${theme === 'dark' ? 'hover:bg-red-900/30 text-red-400 border-[#ff00ff]/30' : 'hover:bg-red-50 text-red-600 border-gray-100'}`} onClick={() => { 
            deleteConnection(connectionContextMenu.connection!.id); 
            setConnectionContextMenu({...connectionContextMenu, visible: false}); 
          }}>削除</button>
        </div>
      )}

      {/* Multi-Select Context Menu Overlay */}
      {multiSelectContextMenu.visible && (
        <div 
          style={{ top: multiSelectContextMenu.y, left: multiSelectContextMenu.x }} 
          className={`fixed border shadow-lg rounded-md py-1 z-50 text-sm min-w-[180px] flex flex-col ${theme === 'dark' ? 'bg-[#000000] border-[#ff00ff] text-[#00f3ff] shadow-[0_0_20px_rgba(255,0,255,0.3)]' : 'bg-white border-gray-200 text-gray-900'}`}
        >
          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            setIsGroupDialogOpen(true);
            setMultiSelectContextMenu({...multiSelectContextMenu, visible: false});
          }}>グルーピング</button>
        </div>
      )}

      {/* Group Context Menu Overlay */}
      {groupContextMenu.visible && groupContextMenu.groupId && (
        <div 
          style={{ top: groupContextMenu.y, left: groupContextMenu.x }} 
          className={`fixed border shadow-lg rounded-md py-1 z-50 text-sm min-w-[180px] flex flex-col ${theme === 'dark' ? 'bg-[#000000] border-[#ff00ff] text-[#00f3ff] shadow-[0_0_20px_rgba(255,0,255,0.3)]' : 'bg-white border-gray-200 text-gray-900'}`}
        >
          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            const newName = prompt('新しいグループ名を入力してください', currentPostItGroups.find(g => g.id === groupContextMenu.groupId)?.name || '');
            if (newName !== null && newName.trim() !== '') {
              useBoardStore.getState().updatePostItGroup(groupContextMenu.groupId!, { name: newName.trim() });
            }
            setGroupContextMenu({...groupContextMenu, visible: false});
          }}>名前を変更</button>
          
          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            const current = currentPostItGroups.find(g => g.id === groupContextMenu.groupId);
            useBoardStore.getState().updatePostItGroup(groupContextMenu.groupId!, { borderStyle: current?.borderStyle === 'solid' ? 'dashed' : 'solid' });
            setGroupContextMenu({...groupContextMenu, visible: false});
          }}>枠線の種類を変更 (実線/点線)</button>
          
          <button className={`px-4 py-3 text-left ${theme === 'dark' ? 'hover:bg-[#00f3ff]/10' : 'hover:bg-gray-100'}`} onClick={() => {
            const current = currentPostItGroups.find(g => g.id === groupContextMenu.groupId);
            useBoardStore.getState().updatePostItGroup(groupContextMenu.groupId!, { shape: current?.shape === 'hull' ? 'rect' : 'hull' });
            setGroupContextMenu({...groupContextMenu, visible: false});
          }}>枠線の形を変更 (四角/配置に沿う)</button>
          
          <div className={`px-4 py-3 flex gap-1 border-t mt-1 pt-2 ${theme === 'dark' ? 'border-[#ff00ff]/30' : 'border-gray-100'}`}>
            {['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e5e7eb', '#94a3b8', '#f87171'].map(c => (
              <div 
                key={c} 
                className="w-5 h-5 rounded-full cursor-pointer border shadow-sm" 
                style={{backgroundColor: c}} 
                onClick={() => { 
                  useBoardStore.getState().updatePostItGroup(groupContextMenu.groupId!, { color: c });
                  setGroupContextMenu({...groupContextMenu, visible: false}); 
                }} 
              />
            ))}
          </div>

          <button className={`px-4 py-3 text-left border-t mt-1 ${theme === 'dark' ? 'hover:bg-red-900/30 text-red-400 border-[#ff00ff]/30' : 'hover:bg-red-50 text-red-600 border-gray-100'}`} onClick={() => { 
            useBoardStore.getState().deletePostItGroup(groupContextMenu.groupId!); 
            setGroupContextMenu({...groupContextMenu, visible: false}); 
          }}>グループを解除</button>
        </div>
      )}

      {/* Group Dialog */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>グループを作成</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="グループ名" />
            <Button className="w-full" onClick={() => {
              if (groupName.trim() && selectedIds.length > 0) {
                useBoardStore.getState().createPostItGroup(groupName.trim(), selectedIds);
              }
              setIsGroupDialogOpen(false);
              setGroupName('');
            }}>作成</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link Board Dialog */}
      <Dialog open={isLinkBoardDialogOpen} onOpenChange={setIsLinkBoardDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>ボードと連結</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {boards.map(b => (
              <Button key={b.id} variant="ghost" className="w-full justify-start" onClick={() => {
                if (contextMenu.postIt) {
                  updatePostIt(contextMenu.postIt.id, { linkedBoardId: b.id });
                }
                setIsLinkBoardDialogOpen(false);
              }}>
                <File className="w-4 h-4 mr-2" /> {b.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge Management Dialog */}
      <Dialog open={isMergeManagementOpen} onOpenChange={(open) => {
        setIsMergeManagementOpen(open);
        if (!open) {
          setEditingMergedIndex(null);
          setEditingMergedData(null);
        }
      }}>
        <DialogContent className={`max-w-2xl ${theme === 'dark' ? 'bg-[#000000] border-[#ff00ff] text-white' : ''}`}>
          <DialogHeader>
            <DialogTitle className={theme === 'dark' ? 'text-[#00f3ff]' : ''}>統合された付箋の管理</DialogTitle>
          </DialogHeader>
          
          {editingMergedIndex !== null && editingMergedData ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-bold opacity-70">見出し</label>
                <Input 
                  value={editingMergedData.title} 
                  onChange={e => setEditingMergedData({...editingMergedData, title: e.target.value})}
                  className={theme === 'dark' ? 'bg-[#000000] border-[#ff00ff]/30 text-white focus:border-[#ff00ff]' : ''}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold opacity-70">テキスト</label>
                <textarea 
                  value={editingMergedData.text} 
                  onChange={e => setEditingMergedData({...editingMergedData, text: e.target.value})}
                  className={`w-full h-32 p-3 rounded-md border resize-none focus:outline-none focus:ring-1 ${
                    theme === 'dark' ? 'bg-[#000000] border-[#ff00ff]/30 text-white focus:border-[#ff00ff] focus:ring-[#ff00ff]' : 'bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold opacity-70">色</label>
                <div className="flex gap-2">
                  {['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e5e7eb'].map(c => (
                    <div 
                      key={c} 
                      className={`w-8 h-8 rounded-full cursor-pointer border-2 transition-transform hover:scale-110 ${editingMergedData.color === c ? 'border-blue-500 scale-110' : 'border-transparent'}`} 
                      style={{backgroundColor: c}} 
                      onClick={() => setEditingMergedData({...editingMergedData, color: c})} 
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="ghost" onClick={() => {
                  setEditingMergedIndex(null);
                  setEditingMergedData(null);
                }}>キャンセル</Button>
                <Button 
                  className={theme === 'dark' ? 'bg-[#ff00ff] hover:bg-[#ff00ff]/80 text-white' : ''}
                  onClick={() => {
                    updateMergedPostIt(contextMenu.postIt!.id, editingMergedIndex, editingMergedData);
                    setEditingMergedIndex(null);
                    setEditingMergedData(null);
                  }}
                >保存</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
                {contextMenu.postIt?.mergedData?.map((data, index) => (
                  <div 
                    key={index} 
                    className={`p-4 rounded-lg border flex items-center justify-between gap-4 transition-colors ${
                      theme === 'dark' ? 'bg-[#000000] border-[#ff00ff]/30 hover:border-[#ff00ff]' : 'bg-white border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: data.color }} />
                        <span className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-[#00f3ff]' : 'text-gray-500'}`}>
                          {data.title || '見出しなし'}
                        </span>
                      </div>
                      <p className={`text-sm truncate ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>
                        {data.text || '(テキストなし)'}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`h-8 w-8 ${theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`}
                        title="編集"
                        onClick={() => {
                          setEditingMergedIndex(index);
                          setEditingMergedData({
                            title: data.title || '',
                            text: data.text || '',
                            color: data.color || '#fef08a'
                          });
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`h-8 w-8 ${theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`}
                        title="統合を解除"
                        onClick={() => {
                          unmergePostIt(contextMenu.postIt!.id, index);
                          if (contextMenu.postIt!.mergedData!.length <= 2) {
                            setIsMergeManagementOpen(false);
                          }
                        }}
                      >
                        <Plus className="w-4 h-4 rotate-45" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`h-8 w-8 ${theme === 'dark' ? 'text-red-400 hover:bg-red-900/20' : 'text-red-500 hover:bg-red-50'}`}
                        title="削除"
                        onClick={() => {
                          if (confirm('この付箋を削除してもよろしいですか？')) {
                            deleteMergedPostIt(contextMenu.postIt!.id, index);
                            if (contextMenu.postIt!.mergedData!.length <= 2) {
                              setIsMergeManagementOpen(false);
                            }
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" onClick={() => setIsMergeManagementOpen(false)}>閉じる</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Tag Dialog */}
      <Dialog open={isTagDialogOpen} onOpenChange={(open) => {
        setIsTagDialogOpen(open);
        if (!open) {
          setEditingTagIndex(null);
          setEditingTagValue('');
          setNewTag('');
        }
      }}>
        <DialogContent className={theme === 'dark' ? 'bg-[#000000] border-[#ff00ff] text-[#00f3ff]' : ''}>
          {(() => {
            const livePostIt = contextMenu.postIt ? postIts.find(p => p.id === contextMenu.postIt!.id) : null;
            const tags = livePostIt?.tags || [];
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle className={theme === 'dark' ? 'text-[#ff00ff]' : ''}>タグの管理</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4">
                  {/* Existing Tags List */}
                  {tags.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold opacity-70">現在のタグ:</p>
                      <div className="flex flex-col gap-2 max-h-60 overflow-y-auto p-1">
                        {tags.map((tag, index) => (
                          <div key={index} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm ${theme === 'dark' ? 'bg-[#334155] text-[#94a3b8]' : 'bg-gray-100 text-gray-700'}`}>
                            {editingTagIndex === index ? (
                              <div className="flex items-center gap-2 w-full">
                                <Input 
                                  value={editingTagValue} 
                                  onChange={e => setEditingTagValue(e.target.value)} 
                                  className="h-8 py-0 px-2 text-sm flex-1"
                                  autoFocus
                                />
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                                    if (editingTagValue.trim() && livePostIt) {
                                      const updatedTags = [...tags];
                                      updatedTags[index] = editingTagValue.trim();
                                      updatePostIt(livePostIt.id, { tags: updatedTags });
                                    }
                                    setEditingTagIndex(null);
                                  }}>
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingTagIndex(null)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="font-medium truncate">#{tag}</span>
                                <div className="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-blue-500" onClick={() => {
                                    setEditingTagIndex(index);
                                    setEditingTagValue(tag);
                                  }}>
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-red-500" onClick={() => {
                                    if (livePostIt) {
                                      const updatedTags = tags.filter((_, i) => i !== index);
                                      updatePostIt(livePostIt.id, { tags: updatedTags });
                                    }
                                  }}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add New Tag */}
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-semibold opacity-70">新しいタグを追加:</p>
                      <p className={`text-[10px] ${tags.length >= 10 ? 'text-red-500 font-bold' : 'opacity-50'}`}>
                        {tags.length} / 10
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input 
                        value={newTag} 
                        onChange={e => setNewTag(e.target.value)} 
                        placeholder={tags.length >= 10 ? "上限に達しました" : "タグ名"} 
                        disabled={tags.length >= 10}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newTag.trim() && livePostIt && tags.length < 10) {
                            updatePostIt(livePostIt.id, { tags: [...tags, newTag.trim()] });
                            setNewTag('');
                          }
                        }}
                      />
                      <Button 
                        disabled={!newTag.trim() || tags.length >= 10}
                        onClick={() => {
                          if (newTag.trim() && livePostIt && tags.length < 10) {
                            updatePostIt(livePostIt.id, { tags: [...tags, newTag.trim()] });
                            setNewTag('');
                          }
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <Button className="w-full mt-4" onClick={() => setIsTagDialogOpen(false)}>閉じる</Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

    </div>
  );
}
