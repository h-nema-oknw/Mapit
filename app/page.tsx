'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';
import Toolbar from '@/components/Toolbar';
import AIAssistant from '@/components/AIAssistant';

import { useBoardStore } from '@/store/useBoardStore';
import { motion, AnimatePresence } from 'motion/react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { polyfill } from "mobile-drag-drop";
import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour";

// Initialize mobile drag and drop polyfill
if (typeof window !== 'undefined') {
  polyfill({
    dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride
  });
  
  // Workaround for iOS Safari
  window.addEventListener('touchmove', function() {}, {passive: false});
}

// Dynamically import BoardView to avoid SSR issues with Konva
const BoardView = dynamic(() => import('@/components/BoardView'), {
  ssr: false,
});

export default function Home() {
  const [tool, setTool] = useState<'board' | 'postit' | 'draw' | 'erase' | 'connect'>('postit');
  const [postItColor, setPostItColor] = useState('#fef08a');
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [penThickness, setPenThickness] = useState(2);
  const [eraserThickness, setEraserThickness] = useState(10);
  const [isMounted, setIsMounted] = useState(false);
  const [isAIVisible, setIsAIVisible] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { isLoaded, theme } = useBoardStore();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    // Auto-close sidebar on mobile
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isMounted || !isLoaded) return <div className="flex h-screen w-full items-center justify-center bg-white"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  const currentThickness = tool === 'erase' ? eraserThickness : penThickness;
  const setCurrentThickness = tool === 'erase' ? setEraserThickness : setPenThickness;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-white relative">
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-64 lg:relative lg:translate-x-0"
            >
              <Sidebar onClose={() => setIsSidebarOpen(false)} />
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40 lg:hidden" 
              onClick={() => setIsSidebarOpen(false)}
            />
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 relative flex flex-col min-w-0 h-full">
        {!isSidebarOpen && (
          <div className="absolute top-4 left-4 z-50">
            <Button 
              variant="ghost" 
              size="icon" 
              className={`rounded-full shadow-sm border transition-colors duration-300 ${theme === 'dark' ? 'bg-[#1e1e20]/80 backdrop-blur-sm border-gray-800 text-gray-300 hover:bg-white/10' : 'bg-white/80 backdrop-blur-sm border-gray-200 text-gray-600 hover:bg-black/5'}`}
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        )}
        <Toolbar 
          tool={tool} 
          setTool={setTool} 
          postItColor={postItColor} 
          setPostItColor={setPostItColor}
          drawingColor={drawingColor}
          setDrawingColor={setDrawingColor}
          drawingThickness={currentThickness}
          setDrawingThickness={setCurrentThickness}
          isAIVisible={isAIVisible}
          setIsAIVisible={setIsAIVisible}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
        />
        <div className="flex-1 flex flex-row overflow-hidden relative">
          <BoardView 
            tool={tool} 
            drawingColor={drawingColor} 
            drawingThickness={currentThickness} 
            postItColor={postItColor}
          />
          <AnimatePresence>
            {isAIVisible && (
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[400px] sm:w-96 bg-white shadow-xl lg:relative lg:shadow-none h-full flex-shrink-0"
              >
                <AIAssistant onClose={() => setIsAIVisible(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
