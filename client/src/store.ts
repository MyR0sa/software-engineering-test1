import { create } from 'zustand';
import { api, connectWs } from './api';
import type {
  Config,
  HelloPayload,
  ModelsPayload,
  PluginInventory,
  SessionSummary,
  TodoItem,
  ToolInfo,
  TrajectoryEvent,
} from './types';

export type TabId = 'chat' | 'trajectory' | 'tools' | 'models' | 'plugins' | 'config';

interface HarnessState {
  connection: string;
  config: Config | null;
  sessions: SessionSummary[];
  tools: ToolInfo[];
  plugins: PluginInventory | null;
  models: ModelsPayload | null;
  currentId: string | null;
  events: Record<string, TrajectoryEvent[]>;
  loopStates: Record<string, string>;
  todos: Record<string, TodoItem[]>;
  tab: TabId;
  busy: boolean;

  init: () => Promise<void>;
  select: (id: string) => Promise<void>;
  newSession: () => Promise<void>;
  send: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  setTab: (t: TabId) => void;
  handleHello: (h: HelloPayload) => void;
  handleEvent: (e: TrajectoryEvent) => void;
}

export const useHarness = create<HarnessState>((set, get) => ({
  connection: 'connecting',
  config: null,
  sessions: [],
  tools: [],
  plugins: null,
  models: null,
  currentId: null,
  events: {},
  loopStates: {},
  todos: {},
  tab: 'chat',
  busy: false,

  handleHello: (h) => {
    set({
      config: h.config,
      sessions: h.sessions,
      tools: h.tools,
      plugins: h.plugins,
      models: h.models,
    });
  },

  handleEvent: (e) => {
    set((s) => {
      const bucket = s.events[e.sessionId] ?? [];
      const events = { ...s.events, [e.sessionId]: [...bucket, e] };
      const loopStates = { ...s.loopStates };
      const todos = { ...s.todos };
      if (e.type === 'loop.state') loopStates[e.sessionId] = String(e.data.state);
      if (e.type === 'todo.updated') todos[e.sessionId] = (e.data.todos as TodoItem[]) ?? [];
      return { events, loopStates, todos };
    });
  },

  init: async () => {
    try {
      const [config, tools, plugins, models, sessions] = await Promise.all([
        api.get<Config>('/api/config'),
        api.get<ToolInfo[]>('/api/tools'),
        api.get<PluginInventory>('/api/plugins'),
        api.get<ModelsPayload>('/api/models'),
        api.get<SessionSummary[]>('/api/sessions'),
      ]);
      set({ config, tools, plugins, models, sessions });

      let currentId = sessions.length ? sessions[0].id : null;
      if (!currentId) {
        const created = await api.post<SessionSummary>('/api/sessions', { title: '新会话' });
        set((s) => ({ sessions: [created, ...s.sessions] }));
        currentId = created.id;
      }
      if (currentId) await get().select(currentId);

      connectWs(
        (e) => get().handleEvent(e),
        (h) => get().handleHello(h),
        (connection) => set({ connection }),
      );
    } catch (err) {
      console.error('[init]', err);
      set({ connection: 'error' });
    }
  },

  select: async (id) => {
    try {
      const detail = await api.get<{ events: TrajectoryEvent[] }>(`/api/sessions/${id}`);
      set((s) => ({ currentId: id, events: { ...s.events, [id]: detail.events } }));
    } catch (err) {
      console.error('[select]', err);
    }
  },

  newSession: async () => {
    const created = await api.post<SessionSummary>('/api/sessions', { title: '新会话' });
    set((s) => ({ sessions: [created, ...s.sessions] }));
    await get().select(created.id);
  },

  send: async (text) => {
    const { currentId, busy } = get();
    if (!currentId || busy) return;
    set({ busy: true });
    try {
      await api.post(`/api/sessions/${currentId}/messages`, { text });
      const sessions = await api.get<SessionSummary[]>('/api/sessions');
      set({ sessions, busy: false });
    } catch (err) {
      console.error('[send]', err);
      set({ busy: false });
    }
  },

  abort: async () => {
    const { currentId } = get();
    if (!currentId) return;
    await api.post(`/api/sessions/${currentId}/abort`);
  },

  setTab: (tab) => set({ tab }),
}));
