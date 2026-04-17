'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Hand, MousePointer2, Pen, Eraser, Link as LinkIcon, Undo2, Redo2, LayoutGrid, Download, HelpCircle, Sparkles, Trash2, Menu, Sun, Moon, MessageSquare, Search } from 'lucide-react';
import { useBoardStore } from '@/store/useBoardStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger as DialogTriggerUI, DialogClose } from '@/components/ui/dialog';
import jsPDF from 'jspdf';

interface ToolbarProps {
  tool: 'board' | 'postit' | 'draw' | 'erase' | 'connect';
  setTool: (tool: 'board' | 'postit' | 'draw' | 'erase' | 'connect') => void;
  postItColor: string;
  setPostItColor: (color: string) => void;
  drawingColor: string;
  setDrawingColor: (color: string) => void;
  drawingThickness: number;
  setDrawingThickness: (thickness: number) => void;
  isAIVisible: boolean;
  setIsAIVisible: (visible: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  stageRef: React.RefObject<any>;
}

export default function Toolbar({ 
  tool, 
  setTool, 
  postItColor, 
  setPostItColor, 
  drawingColor, 
  setDrawingColor, 
  drawingThickness,
  setDrawingThickness,
  isAIVisible, 
  setIsAIVisible,
  isSidebarOpen,
  setIsSidebarOpen,
  stageRef
}: ToolbarProps) {
  const { 
    undo, 
    redo, 
    autoArrange, 
    currentBoardId, 
    boards, 
    theme, 
    setTheme, 
    addPostIt,
    clearDrawings,
    selectedIds,
    showSearch,
    setShowSearch
  } = useBoardStore();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const colors = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e5e7eb'];
  const drawColors = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#eab308'];

  const handleExportPDF = async () => {
    const stage = stageRef.current;
    if (!stage) {
      console.error('Konva stage not found');
      return;
    }
    
    try {
      // Get the stage's image data
      // pixelRatio: 2 for higher resolution
      const stageDataUrl = stage.toDataURL({ pixelRatio: 2 });
      
      // Load image to get dimensions
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = stageDataUrl;
      });

      // Create a temporary canvas to draw the background and the stage image
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;

      // Fill background
      ctx.fillStyle = theme === 'dark' ? '#000000' : '#f2f2f2';
      ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      
      // Draw the stage image
      ctx.drawImage(img, 0, 0);
      
      const finalImgData = tempCanvas.toDataURL('image/png');
      
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [tempCanvas.width, tempCanvas.height]
      });
      
      pdf.addImage(finalImgData, 'PNG', 0, 0, tempCanvas.width, tempCanvas.height);
      const boardName = boards.find(b => b.id === currentBoardId)?.name || 'mindmap';
      pdf.save(`${boardName}.pdf`);
    } catch (error) {
      console.error('Failed to export PDF', error);
    }
  };

  if (!currentBoardId) return null;

  return (
    <div className="absolute top-4 left-0 right-0 px-4 flex justify-center pointer-events-none z-50">
      <div className={`rounded-full shadow-lg border p-1.5 flex items-center gap-1 pointer-events-auto max-w-full overflow-x-auto no-scrollbar transition-colors duration-300 ${theme === 'dark' ? 'bg-[#000000] border-[#ff00ff]/50 shadow-[0_0_15px_rgba(255,0,255,0.3)]' : 'bg-white border-gray-200'}`}>
        <Tooltip>
          <TooltipTrigger render={<Button variant={tool === 'board' ? 'secondary' : 'ghost'} size="icon" className={`rounded-full ${theme === 'dark' && tool === 'board' ? 'bg-[#ff00ff]/20 text-[#ff00ff]' : theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={() => setTool('board')} />}>
            <Hand className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>ボード操作モード</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<Button variant={tool === 'postit' ? 'secondary' : 'ghost'} size="icon" className={`rounded-full ${theme === 'dark' && tool === 'postit' ? 'bg-[#ff00ff]/20 text-[#ff00ff]' : theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={() => setTool('postit')} />}>
            <MousePointer2 className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>付箋操作モード</TooltipContent>
        </Tooltip>

        <div className={`w-px h-6 mx-1 ${theme === 'dark' ? 'bg-[#ff00ff]/30' : 'bg-gray-200'}`} />

        <Tooltip>
          <TooltipTrigger render={<div className="flex items-center gap-1 px-2 select-none outline-none" tabIndex={-1} />}>
            {colors.map(c => (
              <div 
                key={c} 
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/mindmap-color', c);
                }}
                className={`w-6 h-6 rounded-sm cursor-grab active:cursor-grabbing border shadow-sm transition-transform hover:scale-110 ${postItColor === c ? (theme === 'dark' ? 'ring-2 ring-offset-1 ring-[#ff00ff]' : 'ring-2 ring-offset-1 ring-blue-500') : ''}`} 
                style={{ backgroundColor: c }}
                onClick={() => {
                  setPostItColor(c);
                  setTool('postit');
                  // Fallback for mobile: click to add at center-ish
                  if (currentBoardId) {
                    addPostIt({
                      title: '',
                      text: '',
                      x: 100 + Math.random() * 50,
                      y: 100 + Math.random() * 50,
                      width: 180,
                      height: 150,
                      rotation: 0,
                      color: c,
                      tags: [],
                      fontSize: 14
                    });
                  }
                }}
              />
            ))}
          </TooltipTrigger>
          <TooltipContent>ドラッグまたはクリックで付箋を追加</TooltipContent>
        </Tooltip>

        <div className={`w-px h-6 mx-1 ${theme === 'dark' ? 'bg-[#ff00ff]/30' : 'bg-gray-200'}`} />

        <Tooltip>
          <TooltipTrigger render={<Button variant={tool === 'connect' ? 'secondary' : 'ghost'} size="icon" className={`rounded-full ${theme === 'dark' && tool === 'connect' ? 'bg-[#ff00ff]/20 text-[#ff00ff]' : theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={() => setTool('connect')} />}>
            <LinkIcon className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>連結モード</TooltipContent>
        </Tooltip>

        <div className={`w-px h-6 mx-1 ${theme === 'dark' ? 'bg-[#ff00ff]/30' : 'bg-gray-200'}`} />

        <Tooltip>
          <TooltipTrigger render={<div className="flex items-center gap-1" />}>
            <Button variant={tool === 'draw' ? 'secondary' : 'ghost'} size="icon" className={`rounded-full ${theme === 'dark' && tool === 'draw' ? 'bg-[#ff00ff]/20 text-[#ff00ff]' : theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={() => setTool('draw')}>
              <Pen className="w-4 h-4" />
            </Button>
            <div className="flex gap-1 select-none outline-none" tabIndex={-1}>
              {drawColors.map(c => (
                <button 
                  key={c} 
                  className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 ${drawingColor === c ? (theme === 'dark' ? 'ring-2 ring-offset-1 ring-[#ff00ff]' : 'ring-2 ring-offset-1 ring-blue-500') : (theme === 'dark' ? 'border-[#00f3ff]/30' : 'border-gray-200')}`} 
                  style={{ 
                    backgroundColor: c,
                    boxShadow: c === '#ffffff' && theme === 'light' ? 'inset 0 0 0 1px #e5e7eb' : 'none'
                  }}
                  onClick={() => { setDrawingColor(c); setTool('draw'); }}
                />
              ))}
            </div>
          </TooltipTrigger>
          <TooltipContent>自由描画モード</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<Button variant={tool === 'erase' ? 'secondary' : 'ghost'} size="icon" className={`rounded-full ${theme === 'dark' && tool === 'erase' ? 'bg-[#ff00ff]/20 text-[#ff00ff]' : theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={() => setTool('erase')} />}>
            <Eraser className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>消しゴム</TooltipContent>
        </Tooltip>

        {(tool === 'draw' || tool === 'erase') && (
          <div className={`flex items-center gap-1 px-2 border-l ml-1 select-none outline-none ${theme === 'dark' ? 'border-[#ff00ff]/30' : 'border-gray-200'}`} tabIndex={-1}>
            {(tool === 'erase' ? [5, 10, 20, 40] : [2, 5, 10, 20]).map(t => (
              <button
                key={t}
                className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                  drawingThickness === t 
                    ? (theme === 'dark' ? 'bg-[#ff00ff] border-[#ff00ff] text-white' : 'bg-blue-600 border-blue-600 text-white') 
                    : (theme === 'dark' ? 'bg-transparent border-[#00f3ff]/30 text-[#00f3ff] hover:bg-[#00f3ff]/10' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
                }`}
                onClick={() => setDrawingThickness(t)}
              >
                <div style={{ 
                  width: tool === 'erase' ? Math.max(2, t/4) : Math.max(2, t/2), 
                  height: tool === 'erase' ? Math.max(2, t/4) : Math.max(2, t/2), 
                  backgroundColor: drawingThickness === t ? 'white' : 'currentColor', 
                  borderRadius: '50%' 
                }} />
              </button>
            ))}
          </div>
        )}

        <Dialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
          <Tooltip>
            <TooltipTrigger render={<DialogTriggerUI render={<Button variant="ghost" size="icon" className={`rounded-full ${theme === 'dark' ? 'text-red-400 hover:text-red-300 hover:bg-red-900/20' : 'text-red-500 hover:text-red-600 hover:bg-red-50'}`} />} />}>
              <Trash2 className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent>描画を一括削除</TooltipContent>
          </Tooltip>
          <DialogContent className={theme === 'dark' ? 'bg-[#000000] border-[#ff00ff] text-white' : ''}>
            <DialogHeader>
              <DialogTitle className={theme === 'dark' ? 'text-[#00f3ff]' : ''}>
                {selectedIds.length > 0 ? '付箋の描画を削除' : '自由描画の削除'}
              </DialogTitle>
            </DialogHeader>
            <div className={`py-4 ${theme === 'dark' ? 'text-[#00f3ff]/70' : 'text-gray-600'}`}>
              {selectedIds.length > 0 
                ? '選択中の付箋にある描画を全て削除してもよろしいですか？' 
                : 'ボード全体の自由描画を全て削除してもよろしいですか？'}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsClearConfirmOpen(false)}>キャンセル</Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (currentBoardId) clearDrawings(currentBoardId, selectedIds);
                  setIsClearConfirmOpen(false);
                }}
              >
                削除する
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className={`w-px h-6 mx-1 ${theme === 'dark' ? 'bg-[#ff00ff]/30' : 'bg-gray-200'}`} />

        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" className={`rounded-full ${theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={undo} />}>
            <Undo2 className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>元に戻す</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" className={`rounded-full ${theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={redo} />}>
            <Redo2 className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>やり直し</TooltipContent>
        </Tooltip>

        <div className={`w-px h-6 mx-1 ${theme === 'dark' ? 'bg-[#ff00ff]/30' : 'bg-gray-200'}`} />

        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" className={`rounded-full ${theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={autoArrange} />}>
            <LayoutGrid className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>自動整列</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<Button variant={showSearch ? 'secondary' : 'ghost'} size="icon" className={`rounded-full ${theme === 'dark' && showSearch ? 'bg-[#ff00ff]/20 text-[#ff00ff]' : theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={() => setShowSearch(!showSearch)} />}>
            <Search className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>検索 (Ctrl+F)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" className={`rounded-full ${theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={handleExportPDF} />}>
            <Download className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>PDFエクスポート</TooltipContent>
        </Tooltip>

        <div className={`w-px h-6 mx-1 ${theme === 'dark' ? 'bg-[#ff00ff]/30' : 'bg-gray-200'}`} />

        <Tooltip>
          <TooltipTrigger render={<Button variant={isAIVisible ? 'secondary' : 'ghost'} size="icon" className={`rounded-full ${theme === 'dark' && isAIVisible ? 'bg-[#ff00ff]/20 text-[#ff00ff]' : theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={() => setIsAIVisible(!isAIVisible)} />}>
            <Sparkles className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>AIチャット</TooltipContent>
        </Tooltip>

        <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
          <Tooltip>
            <TooltipTrigger render={<DialogTriggerUI render={<Button variant="ghost" size="icon" className={`rounded-full ${theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} />} />}>
              <HelpCircle className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent>ヘルプ</TooltipContent>
          </Tooltip>
          <DialogContent className={theme === 'dark' ? 'bg-[#000000] border-[#ff00ff] text-white' : ''}>
            <DialogHeader>
              <DialogTitle className={theme === 'dark' ? 'text-[#00f3ff]' : ''}>使い方ガイド</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className={`font-semibold mb-1 ${theme === 'dark' ? 'text-[#ff00ff]' : ''}`}>📌 基本操作</h4>
                <ul className={`list-disc pl-5 space-y-1 ${theme === 'dark' ? 'text-[#00f3ff]/70' : 'text-gray-600'}`}>
                  <li><strong>付箋の追加:</strong> ツールバーのカラーパレットから色をドラッグして、ボード上にドロップします。</li>
                  <li><strong>テキスト編集:</strong> 付箋をダブルクリックするとテキストを編集できます。</li>
                  <li><strong>移動:</strong> 選択ツールで付箋をドラッグして移動します。</li>
                  <li><strong>削除:</strong> 付箋を選択してDeleteキーを押すか、右クリックメニューから削除します。</li>
                  <li><strong>右クリックメニュー:</strong> 付箋を右クリックすると、画像アップロードやボード連結などの詳細メニューが開きます。</li>
                </ul>
              </div>
              <div>
                <h4 className={`font-semibold mb-1 ${theme === 'dark' ? 'text-[#ff00ff]' : ''}`}>🔗 繋がり</h4>
                <ul className={`list-disc pl-5 space-y-1 ${theme === 'dark' ? 'text-[#00f3ff]/70' : 'text-gray-600'}`}>
                  <li><strong>付箋を繋ぐ:</strong> リンクツールを選択し、一つの付箋から別の付箋へドラッグします。</li>
                  <li><strong>ボードの連結:</strong> サイドバーのボードをドラッグ＆ドロップすると、そのボードへのリンク付箋が作成されます。</li>
                </ul>
              </div>
              <div>
                <h4 className={`font-semibold mb-1 ${theme === 'dark' ? 'text-[#ff00ff]' : ''}`}>✏️ 描画</h4>
                <ul className={`list-disc pl-5 space-y-1 ${theme === 'dark' ? 'text-[#00f3ff]/70' : 'text-gray-600'}`}>
                  <li>ペンツールで自由に描画でき、消しゴムツールで消去できます。</li>
                </ul>
              </div>
              <div>
                <h4 className={`font-semibold mb-1 ${theme === 'dark' ? 'text-[#ff00ff]' : ''}`}>✨ AI機能</h4>
                <ul className={`list-disc pl-5 space-y-1 ${theme === 'dark' ? 'text-[#00f3ff]/70' : 'text-gray-600'}`}>
                  <li>右下のAIアシスタントにテーマを入力すると、自動でマインドマップを生成します。</li>
                  <li>「ボードを整理」ボタンで、散らばった付箋をAIが整理して繋ぎ合わせます。</li>
                </ul>
              </div>
              <div className={`pt-2 border-t ${theme === 'dark' ? 'border-[#ff00ff]/20' : 'border-gray-100'}`}>
                <h4 className={`font-semibold mb-1 ${theme === 'dark' ? 'text-[#ff00ff]' : ''}`}>🔍 検索とナビゲーション</h4>
                <ul className={`list-disc pl-5 space-y-1 ${theme === 'dark' ? 'text-[#00f3ff]/70' : 'text-gray-600'}`}>
                  <li><strong>検索 (Ctrl+F):</strong> 付箋の内容、タグ、グループ名、連結線を検索できます。</li>
                  <li><strong>ジャンプ:</strong> 検索結果を選択すると、その付箋へ自動で移動します。</li>
                  <li><strong>ミニマップ:</strong> 全体を俯瞰し、クリックした場所へ移動できます。</li>
                </ul>
              </div>
              <div className={`pt-2 border-t ${theme === 'dark' ? 'border-[#ff00ff]/20' : 'border-gray-100'}`}>
                <h4 className={`font-semibold mb-1 ${theme === 'dark' ? 'text-[#ff00ff]' : ''}`}>⌨️ ショートカット</h4>
                <ul className={`list-disc pl-5 space-y-1 ${theme === 'dark' ? 'text-[#00f3ff]/70' : 'text-gray-600'}`}>
                  <li><strong>Ctrl + F:</strong> 検索バーを表示</li>
                  <li><strong>Ctrl + Z / Y:</strong> 元に戻す / やり直し</li>
                  <li><strong>Ctrl + C / V / X:</strong> コピー / 貼り付け / 切り取り</li>
                  <li><strong>Delete / Backspace:</strong> 選択要素の削除</li>
                </ul>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
