import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { get, set as idbSet } from 'idb-keyval';

export type ShapeType = 'none' | 'arrow' | 'dot';

export interface PostIt {
  id: string;
  boardId: string;
  title?: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  tags: string[];
  groupId?: string;
  linkedBoardId?: string;
  imageUrl?: string;
  fontSize?: number;
  mergedPostItIds?: string[]; // IDs of post-its merged into this one
  activeMergedIndex?: number; // Index of the currently visible post-it in the merged stack
  mergedData?: Partial<PostIt>[]; // Data for each merged post-it
}

export interface PostItGroup {
  id: string;
  boardId: string;
  name: string;
  postItIds: string[];
  color: string;
  borderStyle?: 'solid' | 'dashed';
  shape?: 'rect' | 'hull';
}

export interface Connection {
  id: string;
  boardId: string;
  fromId: string;
  toId: string;
  color: string;
  startShape: ShapeType;
  endShape: ShapeType;
  text?: string;
  isDashed?: boolean;
  bidirectionalStyle?: 'single' | 'double';
  controlPoint?: { x: number, y: number };
}

export interface DrawingLine {
  id: string;
  boardId: string;
  postItId?: string; // Optional: if bound to a post-it
  mergedSourceId?: string; // Original post-it ID if merged
  points: number[];
  color: string;
  thickness: number;
  tool: 'pen' | 'eraser';
}

export interface BoardGroup {
  id: string;
  name: string;
}

export interface Board {
  id: string;
  name: string;
  description: string;
  groupId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  type?: 'text' | 'image' | 'action';
  imageUrl?: string;
}

export interface BoardState {
  boards: Board[];
  boardGroups: BoardGroup[];
  currentBoardId: string | null;
  postIts: PostIt[];
  postItGroups: PostItGroup[];
  connections: Connection[];
  drawings: DrawingLine[];
  chatHistory: Record<string, ChatMessage[]>; // Key: boardId
  isLoaded: boolean;
  theme: 'light' | 'dark';
  selectedIds: string[];
  clipboardPostIts: PostIt[];
  geminiApiKey: string | null;
  showMinimap: boolean;
  showSearch: boolean;
  
  // History for undo/redo (scoped to current board)
  history: {
    postIts: PostIt[];
    postItGroups: PostItGroup[];
    connections: Connection[];
    drawings: DrawingLine[];
  }[];
  historyIndex: number;

  // Actions
  createBoard: (name: string, description?: string, groupId?: string) => string;
  setCurrentBoard: (id: string | null) => void;
  updateBoard: (id: string, data: Partial<Board>) => void;
  deleteBoard: (id: string) => void;
  copyBoard: (sourceBoardId: string, newName: string) => void;
  createBoardGroup: (name: string) => void;

  addPostIt: (postIt: Omit<PostIt, 'id' | 'boardId'>) => void;
  updatePostIt: (id: string, data: Partial<PostIt>) => void;
  deletePostIt: (id: string) => void;
  deletePostIts: (ids: string[]) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringToFrontMany: (ids: string[]) => void;
  sendToBackMany: (ids: string[]) => void;
  updatePostIts: (ids: string[], data: Partial<PostIt>) => void;
  
  createPostItGroup: (name: string, postItIds: string[], color?: string) => void;
  updatePostItGroup: (id: string, data: Partial<PostItGroup>) => void;
  deletePostItGroup: (id: string) => void;
  
  addConnection: (connection: Omit<Connection, 'id' | 'boardId'>) => void;
  addConnections: (connections: Omit<Connection, 'id' | 'boardId'>[]) => void;
  updateConnection: (id: string, data: Partial<Connection>) => void;
  deleteConnection: (id: string) => void;

  addDrawing: (drawing: Omit<DrawingLine, 'id' | 'boardId'>) => void;
  updateDrawing: (id: string, data: Partial<DrawingLine>) => void;
  deleteDrawing: (id: string) => void;
  clearDrawings: (boardId: string, postItIds?: string[]) => void;

  undo: () => void;
  redo: () => void;
  saveHistory: () => void;
  
  autoArrange: () => void;
  
  // AI Actions
  setPostIts: (postIts: PostIt[]) => void;
  setConnections: (connections: Connection[]) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setSelectedIds: (ids: string[]) => void;
  selectAllPostIts: () => void;
  
  copyPostIts: (ids: string[]) => void;
  cutPostIts: (ids: string[]) => void;
  pastePostIts: (x: number, y: number) => void;
  
  mergePostIts: (ids: string[]) => void;
  switchMergedPostIt: (id: string, direction: 'prev' | 'next') => void;
  unmergePostIt: (masterId: string, mergedIndex: number) => void;
  updateMergedPostIt: (masterId: string, mergedIndex: number, data: Partial<PostIt>) => void;
  deleteMergedPostIt: (masterId: string, mergedIndex: number) => void;

  addChatMessage: (boardId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearChatHistory: (boardId: string) => void;
  setGeminiApiKey: (key: string | null) => void;
  setShowMinimap: (show: boolean) => void;
  setShowSearch: (show: boolean) => void;
}

const saveStateToStorage = async (state: any) => {
  try {
    const serializedState = JSON.stringify({
      boards: state.boards,
      boardGroups: state.boardGroups,
      postIts: state.postIts,
      postItGroups: state.postItGroups,
      connections: state.connections,
      drawings: state.drawings,
      chatHistory: state.chatHistory,
      geminiApiKey: state.geminiApiKey,
      showMinimap: state.showMinimap,
      showSearch: state.showSearch,
    });
    await idbSet('mindmap-state', serializedState);
  } catch (e) {
    console.error('Could not save state', e);
  }
};

let updatePostItTimer: ReturnType<typeof setTimeout> | null = null;

export const useBoardStore = create<BoardState>((set, get) => ({
  boards: [],
  boardGroups: [],
  currentBoardId: null,
  postIts: [],
  postItGroups: [],
  connections: [],
  drawings: [],
  chatHistory: {},
  history: [],
  historyIndex: -1,
  isLoaded: false,
  theme: 'light',
  selectedIds: [],
  clipboardPostIts: [],
  geminiApiKey: null,
  showMinimap: true,
  showSearch: false,

  createBoard: (name, description = '', groupId) => {
    const id = uuidv4();
    const newBoard: Board = {
      id,
      name,
      description,
      groupId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => {
      const newState = { boards: [...state.boards, newBoard], currentBoardId: id, history: [], historyIndex: -1 };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    // Initialize history after setting current board
    get().saveHistory();
    return id;
  },

  setCurrentBoard: (id) => {
    set({ currentBoardId: id, history: [], historyIndex: -1 });
    if (id) get().saveHistory();
  },

  updateBoard: (id, data) => {
    set((state) => {
      const newState = {
        boards: state.boards.map((b) => (b.id === id ? { ...b, ...data, updatedAt: Date.now() } : b)),
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  deleteBoard: (id) => {
    set((state) => {
      const newState = {
        boards: state.boards.filter((b) => b.id !== id),
        postIts: state.postIts.filter((p) => p.boardId !== id),
        connections: state.connections.filter((c) => c.boardId !== id),
        drawings: state.drawings.filter((d) => d.boardId !== id),
        postItGroups: state.postItGroups.filter((g) => g.boardId !== id),
        currentBoardId: state.currentBoardId === id ? null : state.currentBoardId,
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  copyBoard: (sourceBoardId, newName) => {
    const { boards, postIts, postItGroups, connections, drawings } = get();
    const sourceBoard = boards.find(b => b.id === sourceBoardId);
    if (!sourceBoard) return;

    const newBoardId = uuidv4();
    const newBoard: Board = {
      ...sourceBoard,
      id: newBoardId,
      name: newName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Duplicate Post-its
    const idMap = new Map<string, string>();
    const newPostIts = postIts
      .filter(p => p.boardId === sourceBoardId)
      .map(p => {
        const newId = uuidv4();
        idMap.set(p.id, newId);
        
        const newP = { ...p, id: newId, boardId: newBoardId };
        
        if (p.mergedPostItIds && p.mergedData) {
          const newMergedIds = p.mergedPostItIds.map(() => uuidv4());
          const newMergedData = p.mergedData.map((data, idx) => {
            const newMergedId = newMergedIds[idx];
            idMap.set(p.mergedPostItIds![idx], newMergedId);
            return { ...data, id: newMergedId };
          });
          newP.mergedPostItIds = newMergedIds;
          newP.mergedData = newMergedData;
        }
        
        return newP;
      });

    // Duplicate Post-it Groups
    const newPostItGroups = postItGroups
      .filter(g => g.boardId === sourceBoardId)
      .map(g => {
        return {
          ...g,
          id: uuidv4(),
          boardId: newBoardId,
          postItIds: g.postItIds.map(pid => idMap.get(pid) || pid)
        };
      });

    // Duplicate Connections
    const newConnections = connections
      .filter(c => c.boardId === sourceBoardId)
      .map(c => {
        return {
          ...c,
          id: uuidv4(),
          boardId: newBoardId,
          fromId: idMap.get(c.fromId) || c.fromId,
          toId: idMap.get(c.toId) || c.toId
        };
      });

    // Duplicate Drawings
    const newDrawings = drawings
      .filter(d => d.boardId === sourceBoardId)
      .map(d => {
        return {
          ...d,
          id: uuidv4(),
          boardId: newBoardId,
          postItId: d.postItId ? idMap.get(d.postItId) : undefined,
          mergedSourceId: d.mergedSourceId ? idMap.get(d.mergedSourceId) : undefined
        };
      });

    set((state) => {
      const newState = {
        boards: [...state.boards, newBoard],
        postIts: [...state.postIts, ...newPostIts],
        postItGroups: [...state.postItGroups, ...newPostItGroups],
        connections: [...state.connections, ...newConnections],
        drawings: [...state.drawings, ...newDrawings],
        currentBoardId: newBoardId,
        history: [],
        historyIndex: -1
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  createBoardGroup: (name) => {
    set((state) => {
      const newState = { boardGroups: [...state.boardGroups, { id: uuidv4(), name }] };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  saveHistory: () => {
    set((state) => {
      const { currentBoardId, postIts, postItGroups, connections, drawings, history, historyIndex } = state;
      if (!currentBoardId) return state;

      const currentBoardPostIts = postIts.filter(p => p.boardId === currentBoardId);
      const currentBoardPostItGroups = postItGroups.filter(g => g.boardId === currentBoardId);
      const currentBoardConnections = connections.filter(c => c.boardId === currentBoardId);
      const currentBoardDrawings = drawings.filter(d => d.boardId === currentBoardId);

      const newHistoryState = {
        postIts: currentBoardPostIts,
        postItGroups: currentBoardPostItGroups,
        connections: currentBoardConnections,
        drawings: currentBoardDrawings,
      };

      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newHistoryState);

      // Keep last 50 states
      if (newHistory.length > 50) newHistory.shift();

      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  },

  addPostIt: (postIt) => {
    const { currentBoardId, saveHistory } = get();
    if (!currentBoardId) return;
    set((state) => {
      const newState = { postIts: [...state.postIts, { ...postIt, id: uuidv4(), boardId: currentBoardId }] };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    saveHistory();
  },

  updatePostIt: (id, data) => {
    set((state) => {
      const newState = {
        postIts: state.postIts.map((p) => (p.id === id ? { ...p, ...data } : p)),
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });

    if (updatePostItTimer) clearTimeout(updatePostItTimer);
    updatePostItTimer = setTimeout(() => {
      get().saveHistory();
      updatePostItTimer = null;
    }, 300);
  },

  updatePostIts: (ids, data) => {
    set((state) => {
      const newState = {
        postIts: state.postIts.map((p) => ids.includes(p.id) ? { ...p, ...data } : p),
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  deletePostIt: (id) => {
    set((state) => {
      const newState = {
        postIts: state.postIts.filter((p) => p.id !== id),
        connections: state.connections.filter((c) => c.fromId !== id && c.toId !== id),
        drawings: state.drawings.filter((d) => d.postItId !== id),
        postItGroups: state.postItGroups.map(g => ({ ...g, postItIds: g.postItIds.filter(pid => pid !== id) })).filter(g => g.postItIds.length > 0)
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  deletePostIts: (ids) => {
    set((state) => {
      const idSet = new Set(ids);
      const newState = {
        postIts: state.postIts.filter((p) => !idSet.has(p.id)),
        connections: state.connections.filter((c) => !idSet.has(c.fromId) && !idSet.has(c.toId)),
        drawings: state.drawings.filter((d) => !d.postItId || !idSet.has(d.postItId)),
        postItGroups: state.postItGroups.map(g => ({ ...g, postItIds: g.postItIds.filter(pid => !idSet.has(pid)) })).filter(g => g.postItIds.length > 0)
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  bringToFront: (id) => {
    set((state) => {
      const postIt = state.postIts.find(p => p.id === id);
      if (!postIt) return state;
      const otherPostIts = state.postIts.filter(p => p.id !== id);
      const newState = {
        postIts: [...otherPostIts, postIt]
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  bringToFrontMany: (ids) => {
    set((state) => {
      const idSet = new Set(ids);
      const toFront = state.postIts.filter(p => idSet.has(p.id));
      const others = state.postIts.filter(p => !idSet.has(p.id));
      const newState = {
        postIts: [...others, ...toFront]
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  sendToBack: (id) => {
    set((state) => {
      const postIt = state.postIts.find(p => p.id === id);
      if (!postIt) return state;
      const otherPostIts = state.postIts.filter(p => p.id !== id);
      const newState = {
        postIts: [postIt, ...otherPostIts]
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  sendToBackMany: (ids) => {
    set((state) => {
      const idSet = new Set(ids);
      const toBack = state.postIts.filter(p => idSet.has(p.id));
      const others = state.postIts.filter(p => !idSet.has(p.id));
      const newState = {
        postIts: [...toBack, ...others]
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  createPostItGroup: (name, postItIds, color = '#3b82f6') => {
    const { currentBoardId, saveHistory } = get();
    if (!currentBoardId) return;
    set((state) => {
      const newGroup: PostItGroup = { id: uuidv4(), boardId: currentBoardId, name, postItIds, color };
      // Auto-add tag to post-its
      const updatedPostIts = state.postIts.map(p => {
        if (postItIds.includes(p.id)) {
          const tags = p.tags || [];
          if (!tags.includes(name)) {
            return { ...p, tags: [...tags, name] };
          }
        }
        return p;
      });
      const newState = { postItGroups: [...state.postItGroups, newGroup], postIts: updatedPostIts };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    saveHistory();
  },

  updatePostItGroup: (id, data) => {
    set((state) => {
      const newState = {
        postItGroups: state.postItGroups.map((g) => (g.id === id ? { ...g, ...data } : g)),
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  deletePostItGroup: (id) => {
    set((state) => {
      const newState = {
        postItGroups: state.postItGroups.filter((g) => g.id !== id),
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  addConnection: (connection) => {
    const { currentBoardId, saveHistory } = get();
    if (!currentBoardId) return;
    set((state) => {
      const newState = { connections: [...state.connections, { ...connection, id: uuidv4(), boardId: currentBoardId }] };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    saveHistory();
  },

  addConnections: (connections) => {
    const { currentBoardId, saveHistory } = get();
    if (!currentBoardId || connections.length === 0) return;
    set((state) => {
      const newConnections = connections.map(c => ({ ...c, id: uuidv4(), boardId: currentBoardId }));
      const newState = { connections: [...state.connections, ...newConnections] };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    saveHistory();
  },

  updateConnection: (id, data) => {
    set((state) => {
      const newState = {
        connections: state.connections.map((c) => (c.id === id ? { ...c, ...data } : c)),
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  deleteConnection: (id) => {
    set((state) => {
      const newState = { connections: state.connections.filter((c) => c.id !== id) };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  addDrawing: (drawing) => {
    const { currentBoardId, saveHistory } = get();
    if (!currentBoardId) return;
    set((state) => {
      const newState = { drawings: [...state.drawings, { ...drawing, id: uuidv4(), boardId: currentBoardId }] };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    saveHistory();
  },

  updateDrawing: (id, data) => {
    set((state) => {
      const newState = {
        drawings: state.drawings.map((d) => (d.id === id ? { ...d, ...data } : d)),
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  deleteDrawing: (id) => {
    set((state) => {
      const newState = { drawings: state.drawings.filter((d) => d.id !== id) };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  clearDrawings: (boardId, postItIds) => {
    set((state) => {
      let newState;
      if (postItIds && postItIds.length > 0) {
        // Clear drawings for specific post-its
        newState = { 
          drawings: state.drawings.filter((d) => 
            d.boardId !== boardId || !d.postItId || !postItIds.includes(d.postItId)
          ) 
        };
      } else {
        // Clear only board-level drawings (those without postItId)
        // OR clear everything on the board? 
        // The original implementation was:
        // newState = { drawings: state.drawings.filter((d) => d.boardId !== boardId) };
        // But if we are in "board selected" mode, maybe we only want to clear the board drawings?
        // The user says "ボードを選択中にはボードに対して適応"
        // This implies board-level drawings.
        newState = { 
          drawings: state.drawings.filter((d) => 
            d.boardId !== boardId || d.postItId !== undefined
          ) 
        };
      }
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  undo: () => {
    set((state) => {
      if (state.historyIndex <= 0 || !state.currentBoardId) return state;
      
      const newIndex = state.historyIndex - 1;
      const historyState = state.history[newIndex];
      
      const otherPostIts = state.postIts.filter(p => p.boardId !== state.currentBoardId);
      const otherPostItGroups = state.postItGroups.filter(g => g.boardId !== state.currentBoardId);
      const otherConnections = state.connections.filter(c => c.boardId !== state.currentBoardId);
      const otherDrawings = state.drawings.filter(d => d.boardId !== state.currentBoardId);

      const newState = {
        historyIndex: newIndex,
        postIts: [...otherPostIts, ...historyState.postIts],
        postItGroups: [...otherPostItGroups, ...(historyState.postItGroups || [])],
        connections: [...otherConnections, ...historyState.connections],
        drawings: [...otherDrawings, ...historyState.drawings],
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex >= state.history.length - 1 || !state.currentBoardId) return state;
      
      const newIndex = state.historyIndex + 1;
      const historyState = state.history[newIndex];
      
      const otherPostIts = state.postIts.filter(p => p.boardId !== state.currentBoardId);
      const otherPostItGroups = state.postItGroups.filter(g => g.boardId !== state.currentBoardId);
      const otherConnections = state.connections.filter(c => c.boardId !== state.currentBoardId);
      const otherDrawings = state.drawings.filter(d => d.boardId !== state.currentBoardId);

      const newState = {
        historyIndex: newIndex,
        postIts: [...otherPostIts, ...historyState.postIts],
        postItGroups: [...otherPostItGroups, ...(historyState.postItGroups || [])],
        connections: [...otherConnections, ...historyState.connections],
        drawings: [...otherDrawings, ...historyState.drawings],
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  autoArrange: () => {
    const { currentBoardId, postIts, saveHistory } = get();
    if (!currentBoardId) return;
    
    const boardPostIts = postIts.filter(p => p.boardId === currentBoardId);
    if (boardPostIts.length === 0) return;

    // Simple grid layout
    const cols = Math.ceil(Math.sqrt(boardPostIts.length));
    const padding = 50;
    
    set((state) => {
      const updatedPostIts = state.postIts.map((p) => {
        if (p.boardId !== currentBoardId) return p;
        const index = boardPostIts.findIndex(bp => bp.id === p.id);
        const col = index % cols;
        const row = Math.floor(index / cols);
        return {
          ...p,
          x: col * (p.width + padding) + 100,
          y: row * (p.height + padding) + 100,
        };
      });
      const newState = { postIts: updatedPostIts };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    saveHistory();
  },

  setPostIts: (newPostIts) => {
    set((state) => {
      const otherPostIts = state.postIts.filter(p => p.boardId !== state.currentBoardId);
      const newState = { postIts: [...otherPostIts, ...newPostIts] };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  setConnections: (newConnections) => {
    set((state) => {
      const otherConnections = state.connections.filter(c => c.boardId !== state.currentBoardId);
      const newState = { connections: [...otherConnections, ...newConnections] };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  setTheme: (theme) => {
    set({ theme });
    if (typeof window !== 'undefined') {
      localStorage.setItem('mindmap-theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  },

  setSelectedIds: (ids) => {
    set({ selectedIds: ids });
  },

  selectAllPostIts: () => {
    const { currentBoardId, postIts } = get();
    if (!currentBoardId) return;
    const ids = postIts.filter(p => p.boardId === currentBoardId).map(p => p.id);
    set({ selectedIds: ids });
  },

  copyPostIts: (ids) => {
    const { postIts } = get();
    const toCopy = postIts.filter(p => ids.includes(p.id));
    set({ clipboardPostIts: toCopy });
  },

  cutPostIts: (ids) => {
    const { postIts, saveHistory, currentBoardId } = get();
    if (!currentBoardId) return;
    const toCopy = postIts.filter(p => ids.includes(p.id));
    const remaining = postIts.filter(p => !ids.includes(p.id));
    set({ 
      clipboardPostIts: toCopy,
      postIts: remaining,
      selectedIds: []
    });
    saveStateToStorage({ ...get(), postIts: remaining });
    saveHistory();
  },

  pastePostIts: (x, y) => {
    const { currentBoardId, clipboardPostIts, postIts, saveHistory } = get();
    if (!currentBoardId || clipboardPostIts.length === 0) return;
    
    // Find bounds of clipboard items to paste relative to (x, y)
    const minX = Math.min(...clipboardPostIts.map(p => p.x));
    const minY = Math.min(...clipboardPostIts.map(p => p.y));
    
    const newPostIts = clipboardPostIts.map(p => ({
      ...p,
      id: uuidv4(),
      boardId: currentBoardId,
      x: p.x - minX + x,
      y: p.y - minY + y,
    }));
    
    const newState = { 
      postIts: [...postIts, ...newPostIts],
      selectedIds: newPostIts.map(p => p.id)
    };
    set(newState);
    saveStateToStorage({ ...get(), ...newState });
    saveHistory();
  },

  mergePostIts: (ids) => {
    if (ids.length < 2) return;
    const { postIts, connections, drawings, saveHistory } = get();

    const selectedPostIts = postIts.filter(p => ids.includes(p.id));
    if (selectedPostIts.length < 2) return;

    // Flatten existing merged post-its
    const allMergedData: any[] = [];
    const allMergedIds: string[] = [];

    selectedPostIts.forEach(p => {
      if (p.mergedPostItIds && p.mergedData) {
        // If it's already a merged post-it, bring all its constituents
        allMergedData.push(...p.mergedData);
        allMergedIds.push(...p.mergedPostItIds);
      } else {
        // Otherwise just add itself
        allMergedData.push({
          id: p.id,
          text: p.text,
          title: p.title,
          color: p.color,
          tags: p.tags,
          imageUrl: p.imageUrl,
          fontSize: p.fontSize
        });
        allMergedIds.push(p.id);
      }
    });

    // Use the first selected as master
    const master = selectedPostIts[0];
    const otherIds = selectedPostIts.slice(1).map(p => p.id);

    // Update connections: redirect connections from all constituent IDs to the master ID
    const updatedConnections = connections.filter(c => {
      const fromMerged = allMergedIds.includes(c.fromId);
      const toMerged = allMergedIds.includes(c.toId);
      // Remove internal connections between any of the merged items
      return !(fromMerged && toMerged);
    }).map(c => {
      let newFromId = c.fromId;
      let newToId = c.toId;
      if (allMergedIds.includes(c.fromId)) newFromId = master.id;
      if (allMergedIds.includes(c.toId)) newToId = master.id;
      return { ...c, fromId: newFromId, toId: newToId };
    });

    // Update drawings: move drawings from all constituents to the master
    const updatedDrawings = drawings.map(d => {
      if (d.postItId && allMergedIds.includes(d.postItId)) {
        return { ...d, postItId: master.id, mergedSourceId: d.mergedSourceId || d.postItId };
      }
      return d;
    });

    // Update groups
    const updatedGroups = get().postItGroups.map(g => {
      const newPostItIds = g.postItIds.filter(pid => !allMergedIds.includes(pid));
      if (g.postItIds.some(pid => allMergedIds.includes(pid)) && !newPostItIds.includes(master.id)) {
        newPostItIds.push(master.id);
      }
      return { ...g, postItIds: newPostItIds };
    }).filter(g => g.postItIds.length > 0);

    set((state) => {
      const newState = {
        postIts: state.postIts.filter(p => !otherIds.includes(p.id)).map(p => {
          if (p.id === master.id) {
            return {
              ...p,
              mergedPostItIds: allMergedIds,
              activeMergedIndex: 0,
              mergedData: allMergedData,
              // Apply the first one's data to the master immediately
              ...allMergedData[0]
            };
          }
          return p;
        }),
        connections: updatedConnections,
        drawings: updatedDrawings,
        postItGroups: updatedGroups
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  switchMergedPostIt: (id, direction) => {
    set((state) => {
      const postIt = state.postIts.find(p => p.id === id);
      if (!postIt || !postIt.mergedPostItIds || !postIt.mergedData) return state;

      const count = postIt.mergedPostItIds.length;
      let newIndex = postIt.activeMergedIndex || 0;

      if (direction === 'next') {
        newIndex = (newIndex + 1) % count;
      } else {
        newIndex = (newIndex - 1 + count) % count;
      }

      const data = postIt.mergedData[newIndex];
      if (!data) return state;
      
      return {
        postIts: state.postIts.map(p => p.id === id ? { ...p, ...data, activeMergedIndex: newIndex } : p)
      };
    });
    get().saveHistory();
  },

  unmergePostIt: (masterId, mergedIndex) => {
    const { postIts } = get();
    const master = postIts.find(p => p.id === masterId);
    if (!master || !master.mergedData || !master.mergedPostItIds) return;
    
    const dataToUnmerge = master.mergedData[mergedIndex];
    const idToUnmerge = master.mergedPostItIds[mergedIndex];
    
    // If it's the only one left, it's not merged anymore
    if (master.mergedData.length <= 1) return;

    set((state) => {
      const newMergedData = master.mergedData!.filter((_, i) => i !== mergedIndex);
      const newMergedIds = master.mergedPostItIds!.filter((_, i) => i !== mergedIndex);
      
      const unmergedPostIt: PostIt = {
        id: idToUnmerge || uuidv4(),
        boardId: master.boardId,
        x: master.x + 20,
        y: master.y + 20,
        width: master.width,
        height: master.height,
        rotation: 0,
        tags: [],
        text: '',
        color: '#fef08a',
        ...dataToUnmerge
      } as PostIt;

      const updatedMaster: PostIt = {
        ...master,
        mergedData: newMergedData,
        mergedPostItIds: newMergedIds,
        activeMergedIndex: 0,
        ...newMergedData[0]
      } as PostIt;

      // If only one left, remove merged status
      if (newMergedData.length === 1) {
        updatedMaster.mergedData = undefined;
        updatedMaster.mergedPostItIds = undefined;
        updatedMaster.activeMergedIndex = undefined;
      }

      const newState = {
        postIts: [...state.postIts.map(p => p.id === masterId ? updatedMaster : p), unmergedPostIt]
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  updateMergedPostIt: (masterId, mergedIndex, data) => {
    set((state) => {
      const master = state.postIts.find(p => p.id === masterId);
      if (!master || !master.mergedData) return state;

      const newMergedData = [...master.mergedData];
      newMergedData[mergedIndex] = { ...newMergedData[mergedIndex], ...data };

      const newState = {
        postIts: state.postIts.map(p => {
          if (p.id === masterId) {
            const updated = { ...p, mergedData: newMergedData };
            // If the updated one is the currently active one, apply changes to master too
            if (p.activeMergedIndex === mergedIndex) {
              Object.assign(updated, data);
            }
            return updated;
          }
          return p;
        })
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  deleteMergedPostIt: (masterId, mergedIndex) => {
    const { postIts } = get();
    const master = postIts.find(p => p.id === masterId);
    if (!master || !master.mergedData || !master.mergedPostItIds) return;

    if (master.mergedData.length <= 1) {
      get().deletePostIt(masterId);
      return;
    }

    set((state) => {
      const newMergedData = master.mergedData!.filter((_, i) => i !== mergedIndex);
      const newMergedIds = master.mergedPostItIds!.filter((_, i) => i !== mergedIndex);
      
      const updatedMaster: PostIt = {
        ...master,
        mergedData: newMergedData,
        mergedPostItIds: newMergedIds,
        activeMergedIndex: 0,
        ...newMergedData[0]
      } as PostIt;

      if (newMergedData.length === 1) {
        updatedMaster.mergedData = undefined;
        updatedMaster.mergedPostItIds = undefined;
        updatedMaster.activeMergedIndex = undefined;
      }

      const newState = {
        postIts: state.postIts.map(p => p.id === masterId ? updatedMaster : p)
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
    get().saveHistory();
  },

  addChatMessage: (boardId, message) => {
    set((state) => {
      const history = state.chatHistory[boardId] || [];
      const newMessage: ChatMessage = {
        ...message,
        id: uuidv4(),
        timestamp: Date.now()
      };
      const newState = {
        chatHistory: {
          ...state.chatHistory,
          [boardId]: [...history, newMessage]
        }
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  clearChatHistory: (boardId) => {
    set((state) => {
      const newState = {
        chatHistory: {
          ...state.chatHistory,
          [boardId]: []
        }
      };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  setGeminiApiKey: (key) => {
    set((state) => {
      const newState = { geminiApiKey: key };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  setShowMinimap: (show) => {
    set((state) => {
      const newState = { showMinimap: show };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },

  setShowSearch: (show) => {
    set((state) => {
      const newState = { showSearch: show };
      saveStateToStorage({ ...state, ...newState });
      return newState;
    });
  },
}));

// Load initial state
if (typeof window !== 'undefined') {
  get('mindmap-state').then((saved) => {
    if (saved) {
      try {
        const parsed = JSON.parse(saved as string);
        const savedTheme = localStorage.getItem('mindmap-theme') as 'light' | 'dark' | null;
        const theme = savedTheme || 'light';
        
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        }

        const boards = parsed.boards || [];
        let currentBoardId = boards.length > 0 ? boards[0].id : null;

        if (boards.length === 0) {
          const newBoardId = uuidv4();
          const defaultBoard = {
            id: newBoardId,
            name: '無題のボード',
            description: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          boards.push(defaultBoard);
          currentBoardId = newBoardId;
        }

        useBoardStore.setState({
          boards,
          boardGroups: parsed.boardGroups || [],
          postIts: parsed.postIts || [],
          postItGroups: parsed.postItGroups || [],
          connections: parsed.connections || [],
          drawings: parsed.drawings || [],
          chatHistory: parsed.chatHistory || {},
          geminiApiKey: parsed.geminiApiKey || null,
          currentBoardId,
          isLoaded: true,
          theme,
        });
      } catch (e) {
        console.error('Failed to parse state', e);
        useBoardStore.setState({ isLoaded: true });
      }
    } else {
      // Fallback to localStorage migration
      try {
        const localSaved = localStorage.getItem('mindmap-state');
        if (localSaved) {
          const parsed = JSON.parse(localSaved);
          const boards = parsed.boards || [];
          let currentBoardId = boards.length > 0 ? boards[0].id : null;

          if (boards.length === 0) {
            const newBoardId = uuidv4();
            const defaultBoard = {
              id: newBoardId,
              name: '無題のボード',
              description: '',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            boards.push(defaultBoard);
            currentBoardId = newBoardId;
          }
          
          useBoardStore.setState({
            boards,
            boardGroups: parsed.boardGroups || [],
            postIts: parsed.postIts || [],
            postItGroups: parsed.postItGroups || [],
            connections: parsed.connections || [],
            drawings: parsed.drawings || [],
            geminiApiKey: parsed.geminiApiKey || null,
            showMinimap: parsed.showMinimap !== undefined ? parsed.showMinimap : true,
            showSearch: parsed.showSearch !== undefined ? parsed.showSearch : false,
            currentBoardId,
            isLoaded: true,
          });
          // Save to IDB and remove from localStorage
          idbSet('mindmap-state', localSaved).then(() => {
            localStorage.removeItem('mindmap-state');
          });
        } else {
          const newBoardId = uuidv4();
          const defaultBoard = {
            id: newBoardId,
            name: '無題のボード',
            description: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          useBoardStore.setState({ 
            boards: [defaultBoard],
            currentBoardId: newBoardId,
            isLoaded: true 
          });
        }
      } catch (e) {
        console.error('Failed to load state from localStorage', e);
        useBoardStore.setState({ isLoaded: true });
      }
    }
  }).catch(e => {
    console.error('Failed to load state from IDB', e);
    const newBoardId = uuidv4();
    const defaultBoard = {
      id: newBoardId,
      name: '無題のボード',
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    useBoardStore.setState({ 
      boards: [defaultBoard],
      currentBoardId: newBoardId,
      isLoaded: true 
    });
  });
}
