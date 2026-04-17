'use client';

import React, { useState } from 'react';
import { useBoardStore } from '@/store/useBoardStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Folder, File, Trash2, Settings, Search, ArrowUpDown, Moon, Sun, Menu, Link as LinkIcon, ExternalLink, Filter, MoreHorizontal, Edit2, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { boards, boardGroups, currentBoardId, setCurrentBoard, createBoard, deleteBoard, updateBoard, copyBoard, theme, setTheme, postIts, geminiApiKey, setGeminiApiKey, showMinimap, setShowMinimap } = useBoardStore();
  const [isNewBoardOpen, setIsNewBoardOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDesc, setNewBoardDesc] = useState('');
  const [newBoardGroup, setNewBoardGroup] = useState<string | undefined>(undefined);
  
  const [isEditBoardOpen, setIsEditBoardOpen] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editBoardName, setEditBoardName] = useState('');
  const [editBoardDesc, setEditBoardDesc] = useState('');

  const [isCopyBoardOpen, setIsCopyBoardOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [copyBoardName, setCopyBoardName] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'タイトル' | '作成日' | '更新日'>('更新日');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [localApiKey, setLocalApiKey] = useState(geminiApiKey || '');

  React.useEffect(() => {
    setLocalApiKey(geminiApiKey || '');
  }, [geminiApiKey]);

  const handleCreateBoard = () => {
    if (newBoardName.trim()) {
      const id = createBoard(newBoardName, newBoardDesc, newBoardGroup);
      setCurrentBoard(id);
      setIsNewBoardOpen(false);
      setNewBoardName('');
      setNewBoardDesc('');
      setNewBoardGroup(undefined);
      if (onClose) onClose();
    }
  };

  const handleUpdateBoard = () => {
    if (editingBoardId && editBoardName.trim()) {
      updateBoard(editingBoardId, { name: editBoardName, description: editBoardDesc });
      setIsEditBoardOpen(false);
      setEditingBoardId(null);
    }
  };

  const openEditDialog = (board: any) => {
    setEditingBoardId(board.id);
    setEditBoardName(board.name);
    setEditBoardDesc(board.description || '');
    setIsEditBoardOpen(true);
  };

  const openCopyDialog = (board: any) => {
    setCopySourceId(board.id);
    
    // Generate default name: "Name (1)", "Name (2)", etc.
    const baseName = board.name;
    let counter = 1;
    let newName = `${baseName} (${counter})`;
    while (boards.some(b => b.name === newName)) {
      counter++;
      newName = `${baseName} (${counter})`;
    }
    
    setCopyBoardName(newName);
    setIsCopyBoardOpen(true);
  };

  const handleCopyBoard = () => {
    if (copySourceId && copyBoardName.trim()) {
      copyBoard(copySourceId, copyBoardName);
      setIsCopyBoardOpen(false);
      setCopySourceId(null);
      if (onClose) onClose();
    }
  };

  const hasLinks = (boardId: string) => {
    return postIts.some(p => p.boardId === boardId && p.linkedBoardId);
  };

  const filteredBoards = boards.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.description && b.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const sortedBoards = [...filteredBoards].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'タイトル') {
      comparison = a.name.localeCompare(b.name);
    } else if (sortField === '更新日') {
      comparison = (a.updatedAt || 0) - (b.updatedAt || 0);
    } else {
      comparison = (a.createdAt || 0) - (b.createdAt || 0);
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return (
    <div className={`w-64 border-r h-full flex flex-col shadow-xl md:shadow-none transition-colors duration-300 ${theme === 'dark' ? 'bg-[#1e1e20] border-gray-800' : 'bg-[#f0f4f9] border-gray-200'}`}>
      <div className={`p-3 flex items-center justify-between ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
        {onClose ? (
          <Button variant="ghost" size="icon" className={`shrink-0 rounded-full ${theme === 'dark' ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-black/5'}`} onClick={onClose}>
            <Menu className="w-5 h-5" />
          </Button>
        ) : (
          <div className="w-10" /> // Spacer to keep layout consistent if no menu
        )}

        <Dialog open={isNewBoardOpen} onOpenChange={setIsNewBoardOpen}>
          <DialogTrigger render={
            <Button 
              variant="ghost" 
              size="icon"
              className={`rounded-full ${theme === 'dark' ? 'text-gray-300 hover:bg-white/10' : 'text-gray-600 hover:bg-black/5'}`}
              title="新しいボードを作成"
            >
              <Plus className="w-5 h-5" />
            </Button>
          } />
          <DialogContent className={theme === 'dark' ? 'bg-[#1e1e20] border-gray-800 text-white' : ''}>
            <DialogHeader>
              <DialogTitle>新しいボードを作成</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>ボード名</Label>
                <Input value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} placeholder="新しいプロジェクト" className={theme === 'dark' ? 'bg-[#2a2a2c] border-gray-700 text-white' : ''} />
              </div>
              <div className="space-y-2">
                <Label>説明</Label>
                <Textarea value={newBoardDesc} onChange={(e) => setNewBoardDesc(e.target.value)} placeholder="目的を入力..." className={theme === 'dark' ? 'bg-[#2a2a2c] border-gray-700 text-white' : ''} />
              </div>
              <Button onClick={handleCreateBoard} className={`w-full ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}>作成</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="px-3 pb-2 space-y-2">
        <Dialog open={isEditBoardOpen} onOpenChange={setIsEditBoardOpen}>
          <DialogContent className={theme === 'dark' ? 'bg-[#1e1e20] border-gray-800 text-white' : ''}>
            <DialogHeader>
              <DialogTitle>ボードを編集</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>ボード名</Label>
                <Input value={editBoardName} onChange={(e) => setEditBoardName(e.target.value)} placeholder="プロジェクト名" className={theme === 'dark' ? 'bg-[#2a2a2c] border-gray-700 text-white' : ''} />
              </div>
              <div className="space-y-2">
                <Label>説明</Label>
                <Textarea value={editBoardDesc} onChange={(e) => setEditBoardDesc(e.target.value)} placeholder="目的を入力..." className={theme === 'dark' ? 'bg-[#2a2a2c] border-gray-700 text-white' : ''} />
              </div>
              <Button onClick={handleUpdateBoard} className={`w-full ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}>更新</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isCopyBoardOpen} onOpenChange={setIsCopyBoardOpen}>
          <DialogContent className={theme === 'dark' ? 'bg-[#1e1e20] border-gray-800 text-white' : ''}>
            <DialogHeader>
              <DialogTitle>ボードをコピー</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>新しいボード名</Label>
                <Input value={copyBoardName} onChange={(e) => setCopyBoardName(e.target.value)} placeholder="コピー後の名前" className={theme === 'dark' ? 'bg-[#2a2a2c] border-gray-700 text-white' : ''} />
              </div>
              <Button onClick={handleCopyBoard} className={`w-full ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}>コピーを作成</Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
          <Input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ボードを検索..."
            className={`pl-9 h-9 rounded-full border-none shadow-sm ${theme === 'dark' ? 'bg-[#2a2a2c] text-gray-200 placeholder:text-gray-600' : 'bg-white text-gray-700'}`}
          />
        </div>
        
        <div className="flex items-center gap-1">
          <Select value={sortField} onValueChange={(v: any) => setSortField(v)}>
            <SelectTrigger className={`h-8 text-[10px] rounded-full border-none shadow-sm flex-1 ${theme === 'dark' ? 'bg-[#2a2a2c] text-gray-300' : 'bg-white text-gray-600'}`}>
              <ArrowUpDown className={`w-3 h-3 mr-1 shrink-0 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
              <SelectValue placeholder="ソート対象のフィールド" />
            </SelectTrigger>
            <SelectContent className={theme === 'dark' ? 'bg-[#1e1e20] border-gray-800 text-white' : ''}>
              <SelectItem value="タイトル">タイトル</SelectItem>
              <SelectItem value="更新日">更新日</SelectItem>
              <SelectItem value="作成日">作成日</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            variant="ghost" 
            size="sm" 
            className={`h-8 px-2 rounded-full text-[10px] font-medium ${theme === 'dark' ? 'text-gray-400 hover:bg-white/10' : 'text-gray-500 hover:bg-black/5'}`}
            onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
          >
            {sortDirection === 'asc' ? '昇順' : '降順'}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1">
          {/* Ungrouped Boards */}
          {sortedBoards.filter(b => !b.groupId).map(board => (
            <Tooltip key={board.id} delayDuration={3000}>
              <TooltipTrigger render={
                <div 
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/mindmap-board', board.id);
                  }}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-full cursor-pointer transition-colors group ${
                    currentBoardId === board.id 
                      ? (theme === 'dark' ? 'bg-[#333335] text-blue-400' : 'bg-[#e1e5ea] text-blue-700') 
                      : (theme === 'dark' ? 'text-gray-300 hover:bg-[#2a2a2c]' : 'text-gray-700 hover:bg-[#e1e5ea]')
                  }`}
                  onClick={() => setCurrentBoard(board.id)}
                >
                  <div className="flex items-center gap-3 truncate">
                    <File className={`w-4 h-4 shrink-0 ${currentBoardId === board.id ? (theme === 'dark' ? 'text-blue-400' : 'text-blue-700') : (theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`} />
                    <span className="text-sm truncate">{board.name}</span>
                    {hasLinks(board.id) && (
                      <Tooltip>
                        <TooltipTrigger>
                          <ExternalLink className={`w-3 h-3 ${theme === 'dark' ? 'text-[#ff00ff]/70' : 'text-blue-500/70'}`} />
                        </TooltipTrigger>
                        <TooltipContent>他のボードへのリンクが含まれています</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger render={
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={`h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-300 text-gray-500'}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="w-3 h-3" />
                      </Button>
                    } />
                    <DropdownMenuContent className={theme === 'dark' ? 'bg-[#1e1e20] border-gray-800 text-white' : ''}>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(board); }}>
                        <Edit2 className="w-4 h-4 mr-2" />
                        編集
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openCopyDialog(board); }}>
                        <Copy className="w-4 h-4 mr-2" />
                        コピー
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); deleteBoard(board.id); }}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        削除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              } />
              {board.description && (
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-xs">{board.description}</p>
                </TooltipContent>
              )}
            </Tooltip>
          ))}

          {/* Groups */}
          {boardGroups.map(group => (
            <div key={group.id} className="space-y-1 mt-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                <Folder className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">{group.name}</span>
              </div>
              {sortedBoards.filter(b => b.groupId === group.id).map(board => (
                <Tooltip key={board.id} delayDuration={3000}>
                  <TooltipTrigger render={
                    <div 
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/mindmap-board', board.id);
                      }}
                      className={`flex items-center justify-between px-3 py-2.5 ml-2 rounded-full cursor-pointer transition-colors group ${
                        currentBoardId === board.id 
                          ? (theme === 'dark' ? 'bg-[#333335] text-blue-400' : 'bg-[#e1e5ea] text-blue-700') 
                          : (theme === 'dark' ? 'text-gray-300 hover:bg-[#2a2a2c]' : 'text-gray-700 hover:bg-[#e1e5ea]')
                      }`}
                      onClick={() => setCurrentBoard(board.id)}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <File className={`w-4 h-4 shrink-0 ${currentBoardId === board.id ? (theme === 'dark' ? 'text-blue-400' : 'text-blue-700') : (theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}`} />
                        <span className="text-sm truncate">{board.name}</span>
                        {hasLinks(board.id) && (
                          <Tooltip>
                            <TooltipTrigger>
                              <ExternalLink className={`w-3 h-3 ${theme === 'dark' ? 'text-[#ff00ff]/70' : 'text-blue-500/70'}`} />
                            </TooltipTrigger>
                            <TooltipContent>他のボードへのリンクが含まれています</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-300 text-gray-500'}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="w-3 h-3" />
                          </Button>
                        } />
                        <DropdownMenuContent className={theme === 'dark' ? 'bg-[#1e1e20] border-gray-800 text-white' : ''}>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(board); }}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            編集
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openCopyDialog(board); }}>
                            <Copy className="w-4 h-4 mr-2" />
                            コピー
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); deleteBoard(board.id); }}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            削除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  } />
                  {board.description && (
                    <TooltipContent side="right" className="max-w-xs">
                      <p className="text-xs">{board.description}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
      
      <div className="p-3 mt-auto">
        <Dialog>
          <DialogTrigger render={
            <Button variant="ghost" className={`w-full justify-start gap-3 rounded-full px-3 h-12 ${theme === 'dark' ? 'text-gray-300 hover:bg-[#2a2a2c]' : 'text-gray-700 hover:bg-[#e1e5ea]'}`}>
              <Settings className="w-5 h-5" /> 
              <span className="font-medium text-sm">設定</span>
            </Button>
          } />
          <DialogContent className={theme === 'dark' ? 'bg-[#1e1e20] border-gray-800 text-white' : ''}>
            <DialogHeader>
              <DialogTitle>設定</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>テーマ</Label>
                  <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>ライトモードとダークモードを切り替えます</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                  className={theme === 'dark' ? 'border-gray-700 bg-[#2a2a2c] hover:bg-[#333335] text-white' : ''}
                >
                  {theme === 'light' ? <><Moon className="w-4 h-4 mr-2" /> ダーク</> : <><Sun className="w-4 h-4 mr-2" /> ライト</>}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>ミニマップ</Label>
                  <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>画面右下に全体の縮小図を表示します</p>
                </div>
                <Switch 
                  checked={showMinimap} 
                  onCheckedChange={setShowMinimap} 
                />
              </div>

              <div className="space-y-2 border-t pt-4 border-gray-200 dark:border-gray-800">
                <div className="space-y-0.5 mb-3">
                  <Label>Gemini API キー</Label>
                  <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>AIチャット機能を利用するためのAPIキーを入力してください</p>
                </div>
                <div className="flex gap-2">
                  <Input 
                    type="password" 
                    value={localApiKey} 
                    onChange={(e) => setLocalApiKey(e.target.value)} 
                    placeholder="AIzaSy..." 
                    className={`flex-1 ${theme === 'dark' ? 'bg-[#2a2a2c] border-gray-700 text-white' : ''}`}
                  />
                  <Button 
                    onClick={() => setGeminiApiKey(localApiKey.trim() || null)}
                    className={theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                  >
                    保存
                  </Button>
                </div>
                <p className={`text-[10px] ${theme === 'dark' ? 'text-[#00f3ff]/70' : 'text-blue-500'}`}>
                  ※ 保存されたAPIキーはブラウザにのみ保存されます
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
