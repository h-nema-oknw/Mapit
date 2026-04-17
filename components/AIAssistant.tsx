'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2, Plus, Send, Image as ImageIcon, RotateCcw, User, Bot, Trash2 } from 'lucide-react';
import { useBoardStore, ChatMessage } from '@/store/useBoardStore';
import { GoogleGenAI, Type } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';

export default function AIAssistant({ onClose }: { onClose?: () => void }) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { 
    currentBoardId, 
    setPostIts, 
    setConnections, 
    postIts, 
    connections,
    drawings,
    chatHistory,
    addChatMessage,
    clearChatHistory,
    theme 
  } = useBoardStore();

  const history = React.useMemo(() => 
    currentBoardId ? chatHistory[currentBoardId] || [] : [],
    [currentBoardId, chatHistory]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  // Auto-expand textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 20 * 24); // Assuming 24px per line
      textarea.style.height = `${newHeight}px`;
    }
  }, [input]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const processAIAction = async (prompt: string, imageBase64?: string) => {
    if (!currentBoardId) return;
    
    setIsLoading(true);
    setInput('');
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    addChatMessage(currentBoardId, {
      role: 'user',
      content: prompt,
      type: imageBase64 ? 'image' : 'text',
      imageUrl: imageBase64
    });

    try {
      const apiKey = useBoardStore.getState().geminiApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        addChatMessage(currentBoardId, {
          role: 'model',
          content: 'エラー: Gemini APIキーが設定されていません。設定から追加してください。'
        });
        setIsLoading(false);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      
      const currentBoardData = {
        postIts: postIts.filter(p => p.boardId === currentBoardId).slice(0, 100).map(p => ({
          id: p.id,
          title: (p.title || '').slice(0, 50),
          text: (p.text || '').slice(0, 500),
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          color: p.color
        })),
        connections: connections.filter(c => c.boardId === currentBoardId).slice(0, 150).map(c => ({
          fromId: c.fromId,
          toId: c.toId,
          text: (c.text || '').slice(0, 50),
          startShape: c.startShape,
          endShape: c.endShape,
          isDashed: c.isDashed
        }))
      };

      const systemInstruction = `
        あなたはマインドマップ、ワークフロー、およびチームファシリテーションの専門家です。
        単なる「ボード生成ツール」ではなく、ボードを活用したミーティングに参加するメンバーの一員として振る舞ってください。

        【あなたの役割と振る舞い】
        1. アドバイザー・コンサルタント：現状のボード内容を分析し、論理的な矛盾の指摘、改善のための助言、深い洞察を提供してください。
        2. タスクの洗出し：議論の流れから次に必要なアクションやタスクを具体的に特定し、提案してください。
        3. 解説者：複雑な概念や構造を、ボードの構成を引用しながら分かりやすく解説してください。
        4. 柔軟な対応：ユーザーの指示に対して、必ずしもボード操作（付箋の追加や更新）を行う必要はありません。対話を通じて思考を深めるサポートを優先してください。
        5. 議事録の作成：ユーザーから指示があった場合、ボードの全内容（付箋・接続）とこれまでの対話履歴（議論の流れ）を統合し、構造化されたMarkdown形式の議事録（Meeting Minutes）を作成してください。

        【ボード構成の基本方針】
        ユーザーの具体的な指示や、議論の整理が必要だと判断した場合にのみ、ボード上の付箋（postIts）と連結線（connections）を広大なキャンバス上に構成・更新してください。
        
        【重要：レイアウト解像度の向上】
        要素が重ならないよう、付箋は十分に幅を持たせ（例: 幅250〜300、高さ150〜200）、付箋同士の間隔を上下左右に200〜300ピクセル以上空けて、広々とした美しく見やすい高解像度なレイアウトを計算してx, y座標に反映してください。
        
        【重要：レスポンス制限】
        ボードの規模が大きい場合でも、一度の回答で扱う付箋の数は最大30個程度に留めてください。
        全てのデータを一度に返そうとすると、データ量が多すぎて途中で途切れてエラー（JSON不完全）になります。
        変更が必要な部分に絞って "update" アクションを利用してください。
        
        操作は以下のJSON形式で返してください：
        {
          "thought": "どのように構成するか、どの付箋をどう繋ぐかの思考プロセス（日本語）",
          "message": "ユーザーへの返答メッセージ",
          "action": {
            "type": "create" | "update" | "none",
            "postIts": [
              { 
                "id": "string", 
                "title": "string (オプション: タイトルが必要な場合)", 
                "text": "string (本文)", 
                "x": number, 
                "y": number, 
                "width": number (推奨: 250~300), 
                "height": number (推奨: 150~200), 
                "color": "string" 
              }
            ],
            "connections": [
              { 
                "fromId": "string", 
                "toId": "string",
                "text": "string (オプション: 矢印上のコメント・説明)",
                "startShape": "none" | "arrow" | "dot",
                "endShape": "none" | "arrow" | "dot",
                "isDashed": boolean (点線か),
                "controlPointOffset": { "x": number, "y": number } // オプション: 連結線を湾曲させるための中心からのピクセルオフセット量（大きく曲げるなら {x: 0, y: -200} など）
              }
            ]
          }
        }
        
        - "create" の場合、既存のボードを無視して新しく作成します。
        - "update" の場合、既存のボードデータを基に修正を加えます。
        - 付箋の色(color)は、以下のいずれかのみを使用してください：
          #fef08a (黄), #bbf7d0 (緑), #bfdbfe (青), #fbcfe8 (桃), #ddd6fe (紫), #fed7aa (橙)
        
        【連結線（connections）のルール】
        1. "connections" の fromId と toId には、"postIts" 配列で定義した "id" を使用してください。
        2. 新しい付箋を作成する場合、id は "new-1" など一時的なIDを使用してください。
        3. 順序や関連性を示す場合は必要に応じて \`startShape\`, \`endShape\` (デフォルトは 'none'と'arrow') をカスタマイズし、\`isDashed\` や コメント用 \`text\` も活用して表現力を高めてください。
        
        日本語で回答してください。
      `;

      const contents: any[] = [];
      if (imageBase64) {
        contents.push({
          inlineData: {
            mimeType: "image/png",
            data: imageBase64.split(',')[1]
          }
        });
      }
      const historyContext = history.slice(-30).map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n');
      contents.push({ text: `Current Board State: ${JSON.stringify(currentBoardData)}\n\nRecent Chat History:\n${historyContext}\n\nUser Instruction: ${prompt}` });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-05-20",
        contents: { parts: contents },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              thought: { type: Type.STRING },
              message: { type: Type.STRING },
              action: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ["create", "update", "none"] },
                  postIts: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        title: { type: Type.STRING },
                        text: { type: Type.STRING },
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER },
                        width: { type: Type.NUMBER },
                        height: { type: Type.NUMBER },
                        color: { type: Type.STRING }
                      },
                      required: ["id", "text", "x", "y", "color", "width", "height"]
                    }
                  },
                  connections: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        fromId: { type: Type.STRING },
                        toId: { type: Type.STRING },
                        text: { type: Type.STRING },
                        startShape: { type: Type.STRING, enum: ["none", "arrow", "dot"] },
                        endShape: { type: Type.STRING, enum: ["none", "arrow", "dot"] },
                        isDashed: { type: Type.BOOLEAN },
                        controlPointOffset: { 
                          type: Type.OBJECT, 
                          properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
                          description: "Offset from the midpoint of the connection to curve the line"
                        }
                      },
                      required: ["fromId", "toId"]
                    }
                  }
                },
                required: ["type", "postIts", "connections"]
              }
            },
            required: ["thought", "message", "action"]
          }
        }
      });

      const data = JSON.parse(response.text || '{}');
      
      addChatMessage(currentBoardId, {
        role: 'model',
        content: data.message,
        type: 'text'
      });

      if (data.action && data.action.type !== 'none') {
        const idMap: Record<string, string> = {};
        
        const newPostIts = (data.action.postIts || []).map((p: any) => {
          // Check if this is a new ID or an existing one
          const isExisting = postIts.find(oldP => oldP.id === p.id);
          const newId = (p.id.startsWith('new-') || !isExisting) ? uuidv4() : p.id;
          idMap[p.id] = newId;
          
          return {
            id: newId,
            boardId: currentBoardId,
            title: p.title || '',
            text: p.text,
            x: p.x,
            y: p.y,
            width: p.width || 250,
            height: p.height || 180,
            rotation: 0,
            color: p.color || '#fef08a',
            tags: [],
            fontSize: 14
          };
        });

        const newConnections = (data.action.connections || []).map((c: any) => {
          const fromId = idMap[c.fromId] || c.fromId;
          const toId = idMap[c.toId] || c.toId;
          
          let controlPoint = undefined;
          if (c.controlPointOffset && c.controlPointOffset.x !== undefined && c.controlPointOffset.y !== undefined) {
             const fromNode = newPostIts.find((p: any) => p.id === fromId) || postIts.find(p => p.id === fromId);
             const toNode = newPostIts.find((p: any) => p.id === toId) || postIts.find(p => p.id === toId);
             if (fromNode && toNode) {
               // Calculate the midpoint
               const midX = (fromNode.x + fromNode.width / 2 + toNode.x + toNode.width / 2) / 2;
               const midY = (fromNode.y + fromNode.height / 2 + toNode.y + toNode.height / 2) / 2;
               controlPoint = {
                 x: midX + c.controlPointOffset.x,
                 y: midY + c.controlPointOffset.y
               };
             }
          }

          return {
            id: uuidv4(),
            boardId: currentBoardId,
            fromId,
            toId,
            text: c.text || undefined,
            color: theme === 'dark' ? '#ffffff' : '#000000',
            startShape: c.startShape || 'none',
            endShape: c.endShape || 'arrow',
            isDashed: c.isDashed || false,
            controlPoint
          };
        }).filter((c: any) => c.fromId && c.toId);

        if (data.action.type === 'create') {
          setPostIts(newPostIts);
          setConnections(newConnections);
        } else if (data.action.type === 'update') {
          // For update, we merge with existing ones not in the update list
          const updatedIds = new Set(newPostIts.map((p: any) => p.id));
          const existingPostIts = postIts.filter(p => p.boardId === currentBoardId && !updatedIds.has(p.id));
          setPostIts([...existingPostIts, ...newPostIts]);
          
          const newConnectionPairs = new Set(
            newConnections.map((c: any) => `${c.fromId}__${c.toId}`)
          );
          const existingConnections = connections
            .filter(c => c.boardId === currentBoardId)
            .filter(c => !newConnectionPairs.has(`${c.fromId}__${c.toId}`));
          setConnections([...existingConnections, ...newConnections]);
        }
      }
      
    } catch (error) {
      console.error("AI Action failed", error);
      let errorMessage = "申し訳ありません。処理中にエラーが発生しました。";
      
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        errorMessage = "出力データが大きすぎたため、AIの回答が途中で途切れました。一回あたりの指示を細かく分けるか、規模を縮小して試してください。";
      }
      
      addChatMessage(currentBoardId, {
        role: 'model',
        content: errorMessage,
        type: 'text'
      });
    } finally {
      setIsLoading(false);
      setInput('');
      setSelectedImage(null);
    }
  };

  const handleExplainBoard = async () => {
    if (!currentBoardId) return;
    setIsLoading(true);
    addChatMessage(currentBoardId, {
      role: 'user',
      content: "現在のボードの内容を説明してください。",
      type: 'text'
    });

    try {
      const apiKey = useBoardStore.getState().geminiApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        addChatMessage(currentBoardId, {
          role: 'model',
          content: 'エラー: Gemini APIキーが設定されていません。設定から追加してください。'
        });
        setIsLoading(false);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const currentBoardData = {
        postIts: postIts.filter(p => p.boardId === currentBoardId).map(p => ({ text: p.text })),
        connections: connections.filter(c => c.boardId === currentBoardId).map(c => ({
          from: postIts.find(p => p.id === c.fromId)?.text,
          to: postIts.find(p => p.id === c.toId)?.text
        }))
      };

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-05-20",
        contents: `以下のボードデータを解析し、その内容を分かりやすく文章で説明してください：\n${JSON.stringify(currentBoardData)}`,
      });

      addChatMessage(currentBoardId, {
        role: 'model',
        content: response.text || "説明を生成できませんでした。",
        type: 'text'
      });
    } catch (error) {
      console.error("Explain failed", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    if (currentBoardId) {
      clearChatHistory(currentBoardId);
    }
  };

  return (
    <div className={`w-full h-full flex flex-col z-10 shadow-sm transition-colors duration-300 ${theme === 'dark' ? 'bg-[#000000] border-l border-[#ff00ff]/30' : 'bg-[#f8f9fa] border-l border-gray-200'}`}>
      {/* Header */}
      <div className={`p-4 border-b flex items-center justify-between font-semibold ${theme === 'dark' ? 'bg-[#000000] text-[#ff00ff] border-[#ff00ff]/30' : 'bg-white text-blue-600 border-gray-100'}`}>
        <div className="flex items-center gap-2">
          <Sparkles className={`w-5 h-5 ${theme === 'dark' ? 'drop-shadow-[0_0_5px_rgba(255,0,255,0.8)]' : ''}`} />
          <h3 className={theme === 'dark' ? 'text-[#00f3ff]' : ''}>AI アシスタント</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className={`h-8 w-8 ${theme === 'dark' ? 'text-gray-400 hover:text-white hover:bg-white/10' : ''}`} onClick={handleReset} title="会話をリセット">
            <RotateCcw className="w-4 h-4" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className={`h-8 w-8 ${theme === 'dark' ? 'text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}`} onClick={onClose}>
              <Plus className="w-4 h-4 rotate-45" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Chat History */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-50">
            <Sparkles className={`w-12 h-12 mb-4 ${theme === 'dark' ? 'text-[#ff00ff]/50' : 'text-blue-200'}`} />
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
              AIアシスタントに指示を入力してください
            </p>
          </div>
        ) : (
          history.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' 
                  ? (theme === 'dark' ? 'bg-[#ff00ff]/20 text-[#ff00ff]' : 'bg-blue-100 text-blue-600')
                  : (theme === 'dark' ? 'bg-[#00f3ff]/20 text-[#00f3ff]' : 'bg-gray-100 text-gray-600')
              }`}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? (theme === 'dark' ? 'bg-[#ff00ff]/10 text-white border border-[#ff00ff]/20' : 'bg-blue-600 text-white')
                  : (theme === 'dark' ? 'bg-[#1e1e20] text-gray-200 border border-[#00f3ff]/20' : 'bg-white border border-gray-100 shadow-sm')
              }`}>
                {msg.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={msg.imageUrl} alt="Uploaded" className="max-w-full rounded-lg mb-2 border border-white/10" />
                )}
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${theme === 'dark' ? 'bg-[#00f3ff]/20 text-[#00f3ff]' : 'bg-gray-100 text-gray-600'}`}>
              <Bot className="w-4 h-4" />
            </div>
            <div className={`rounded-2xl px-4 py-2 ${theme === 'dark' ? 'bg-[#1e1e20] border border-[#00f3ff]/20' : 'bg-white border border-gray-100 shadow-sm'}`}>
              <Loader2 className="w-4 h-4 animate-spin text-[#00f3ff]" />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className={`p-4 border-t ${theme === 'dark' ? 'bg-[#000000] border-[#ff00ff]/30' : 'bg-white border-gray-100'}`}>
        {selectedImage && (
          <div className="relative inline-block mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedImage} alt="Preview" className="h-16 w-16 object-cover rounded-md border border-gray-200" />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm"
            >
              <Plus className="w-3 h-3 rotate-45" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleImageSelect}
          />
          <Button 
            variant="ghost" 
            size="icon" 
            className={theme === 'dark' ? 'text-gray-400 hover:text-[#00f3ff] hover:bg-[#00f3ff]/10' : ''}
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            <ImageIcon className="w-5 h-5" />
          </Button>
          <textarea 
            ref={textareaRef}
            placeholder="AIに指示を入力..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                processAIAction(input, selectedImage || undefined);
              }
            }}
            disabled={isLoading || !currentBoardId}
            rows={1}
            className={`flex-1 resize-none py-2 px-3 rounded-md text-sm transition-colors focus:outline-none focus:ring-1 ${
              theme === 'dark' 
                ? 'bg-[#1e1e20] border-[#00f3ff]/30 text-white border focus:border-[#ff00ff] focus:ring-[#ff00ff]/30' 
                : 'bg-white border border-gray-200 focus:border-blue-500 focus:ring-blue-500/30'
            }`}
            style={{ maxHeight: '480px', overflowY: 'auto' }}
          />
          <Button 
            size="icon" 
            className={theme === 'dark' ? 'bg-[#ff00ff] hover:bg-[#ff00ff]/80 text-white' : 'bg-blue-600 hover:bg-blue-700'}
            onClick={() => processAIAction(input, selectedImage || undefined)}
            disabled={isLoading || (!input.trim() && !selectedImage) || !currentBoardId}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
