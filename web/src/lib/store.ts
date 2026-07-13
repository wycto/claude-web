import { reactive } from 'vue';
import { api, ApiError } from './api';
import { ChatSocket } from './ws';
import type {
  GitStatus,
  ModelInfo,
  PermissionRequest,
  RenderItem,
  SessionMeta,
  ToolUseBlock,
  Attachment,
  UsageState,
} from './types';

const FALLBACK_MODELS: ModelInfo[] = [
  { value: 'opus', displayName: 'Opus', description: '最强能力' },
  { value: 'sonnet', displayName: 'Sonnet', description: '均衡高效' },
  { value: 'haiku', displayName: 'Haiku', description: '快速轻量' },
];

export interface ChatTab {
  id: string; // local tab id (not the Claude session id)
  sessionId: string | null;
  cwd: string;
  model: string;
  permissionMode: string;
  title: string;
  items: RenderItem[];
  toolMap: Record<string, ToolUseBlock>;
  streamingText: string;
  streamingThinking: string;
  running: boolean;
  status: string | null;
  totalCost: number;
  pendingUserEcho: string | null;
  connected: boolean;
  permissions: PermissionRequest[];
  slashCommands: string[];
  git: GitStatus | null;
  loadingGit: boolean;
  draft: string;
  rewindStash: { items: RenderItem[] } | null; // removed items, restorable via undo
  usage: UsageState | null;
}

interface State {
  user: string | null;
  authChecked: boolean;
  configured: boolean;
  models: ModelInfo[];
  defaultModel: string;
  sessions: SessionMeta[];
  loadingSessions: boolean;
  tabs: ChatTab[];
  active: ChatTab | null;
  showChanges: boolean;
  theme: ThemeName;
  sidebarOpen: boolean; // mobile drawer
  sidebarWidth: number; // sidebar width in px
  paletteOpen: boolean; // command palette (⌘K)
  toasts: { id: number; text: string; kind: 'error' | 'info' }[];
}

export type ThemeName = 'dark' | 'light' | 'cmux';
export const THEMES: ThemeName[] = ['dark', 'light', 'cmux'];

const storedTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('cw-theme') : null;
const savedTheme: ThemeName = THEMES.includes(storedTheme as ThemeName)
  ? (storedTheme as ThemeName)
  : 'dark';

const storedSidebarWidth = typeof localStorage !== 'undefined' ? localStorage.getItem('cw-sidebar-width') : null;
const savedSidebarWidth = storedSidebarWidth ? parseInt(storedSidebarWidth, 10) : 320;

export const state = reactive<State>({
  user: null,
  authChecked: false,
  configured: false,
  models: FALLBACK_MODELS,
  defaultModel: 'opus',
  sessions: [],
  loadingSessions: false,
  tabs: [],
  active: null,
  showChanges: false,
  theme: savedTheme,
  sidebarOpen: false,
  sidebarWidth: savedSidebarWidth,
  paletteOpen: false,
  toasts: [],
});

// ----------------------------------------------------------- Command palette
export function openPalette() {
  state.paletteOpen = true;
}
export function closePalette() {
  state.paletteOpen = false;
}
export function togglePalette() {
  state.paletteOpen = !state.paletteOpen;
}

// ----------------------------------------------------------------- Theme / UI
export function setTheme(t: ThemeName) {
  state.theme = t;
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = t;
  if (typeof localStorage !== 'undefined') localStorage.setItem('cw-theme', t);
}
export function toggleTheme() {
  const i = THEMES.indexOf(state.theme);
  setTheme(THEMES[(i + 1) % THEMES.length]);
}
export function setSidebarWidth(width: number) {
  state.sidebarWidth = width;
  if (typeof localStorage !== 'undefined') localStorage.setItem('cw-sidebar-width', String(width));
}
export function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
}
export function closeSidebar() {
  state.sidebarOpen = false;
}

// Sockets live outside reactive state (a WebSocket should not be proxied).
const sockets = new Map<string, ChatSocket>();
let keyCounter = 0;
const nextKey = () => `k${keyCounter++}`;
let tabSeq = 0;

let toastId = 0;
export function toast(text: string, kind: 'error' | 'info' = 'info') {
  const id = toastId++;
  state.toasts.push({ id, text, kind });
  setTimeout(() => {
    const i = state.toasts.findIndex((t) => t.id === id);
    if (i >= 0) state.toasts.splice(i, 1);
  }, 5000);
}

const tabById = (id: string) => state.tabs.find((t) => t.id === id) || null;

function baseName(p: string): string {
  const parts = (p || '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '/';
}

// ----------------------------------------------------------------- Auth
export async function bootstrap() {
  try {
    const s = await api.status();
    state.configured = s.configured;
    const me = await api.me();
    state.user = me.user;
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) console.error(e);
    state.user = null;
  } finally {
    state.authChecked = true;
  }
}

export async function login(username: string, password: string) {
  const res = await api.login(username, password);
  state.user = res.user;
}

export async function logout() {
  await api.logout();
  state.user = null;
  for (const t of [...state.tabs]) closeTab(t.id);
  state.sessions = [];
}

// ----------------------------------------------------------- Sessions list
export async function refreshSessions() {
  state.loadingSessions = true;
  try {
    const { sessions } = await api.sessions();
    state.sessions = sessions;
  } catch (e: any) {
    toast(e.message || '加载会话失败', 'error');
  } finally {
    state.loadingSessions = false;
  }
}

export async function deleteSession(id: string) {
  const meta = state.sessions.find((s) => s.id === id);
  await api.deleteSession(id, meta?.cwd || undefined);
  state.sessions = state.sessions.filter((s) => s.id !== id);
  const tab = state.tabs.find((t) => t.sessionId === id);
  if (tab) closeTab(tab.id);
}

export async function renameSession(id: string, title: string) {
  const meta = state.sessions.find((s) => s.id === id);
  await api.renameSession(id, title, meta?.cwd || undefined);
  if (meta) meta.title = title;
  const tab = state.tabs.find((t) => t.sessionId === id);
  if (tab) tab.title = title;
}

// Fork a whole session into a new branch, then open it.
export async function forkSession(meta: SessionMeta) {
  try {
    const { sessionId } = await api.forkSession(meta.id, { dir: meta.cwd || undefined });
    await refreshSessions();
    const fresh = state.sessions.find((s) => s.id === sessionId);
    openChat(fresh || { ...meta, id: sessionId, title: `${meta.title} (fork)` });
    toast('已分叉为新会话');
  } catch (e: any) {
    toast(e.message || '分叉失败', 'error');
  }
}

// ------------------------------------------------------------- Tabs / chat
function freshTab(cwd: string, model: string, title: string): ChatTab {
  return {
    id: `t${tabSeq++}`,
    sessionId: null,
    cwd,
    model,
    permissionMode: 'default',
    title,
    items: [],
    toolMap: {},
    streamingText: '',
    streamingThinking: '',
    running: false,
    status: null,
    totalCost: 0,
    pendingUserEcho: null,
    connected: false,
    permissions: [],
    slashCommands: [],
    git: null,
    loadingGit: false,
    draft: '',
    rewindStash: null,
    usage: null,
  };
}

function connectTab(tab: ChatTab, init: Record<string, unknown>) {
  const sock = new ChatSocket({
    onMessage: (data) => handleWs(tab.id, data),
    onOpen: () => {
      tab.connected = true;
      sock.send(init);
    },
    onClose: () => {
      tab.connected = false;
    },
  });
  sockets.set(tab.id, sock);
  sock.connect();
}

export function newChat(cwd: string, model?: string) {
  const tab = freshTab(cwd, model || state.defaultModel, baseName(cwd));
  state.tabs.push(tab);
  // Use the reactive proxy from the array, not the raw `tab` object.
  const live = state.tabs[state.tabs.length - 1];
  state.active = live;
  state.sidebarOpen = false;
  connectTab(live, {
    type: 'init',
    cwd,
    model: live.model,
    permissionMode: live.permissionMode,
  });
  refreshGit(live);
}

export async function openChat(meta: SessionMeta) {
  // If already open in a tab, just focus it.
  const existing = state.tabs.find((t) => t.sessionId === meta.id);
  if (existing) {
    state.active = existing;
    state.sidebarOpen = false;
    return;
  }
  state.sidebarOpen = false;
  const cwd = meta.cwd || '';
  const tab = freshTab(cwd, state.defaultModel, meta.title);
  tab.sessionId = meta.id;
  state.tabs.push(tab);
  // Use the reactive proxy from the array, not the raw `tab` object — mutating
  // the raw object bypasses reactivity and the message list won't re-render.
  const live = state.tabs[state.tabs.length - 1];
  state.active = live;
  try {
    const { messages } = await api.loadSession(meta.id, meta.cwd || undefined);
    for (const m of messages) ingestSdkMessage(live, m, false);
  } catch (e: any) {
    toast(e.message || '加载历史失败', 'error');
  }
  connectTab(live, {
    type: 'init',
    cwd,
    resume: meta.id,
    permissionMode: live.permissionMode,
  });
  refreshGit(live);
}

export function switchTab(id: string) {
  const t = tabById(id);
  if (t) state.active = t;
}

export function closeTab(id: string) {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  sockets.get(id)?.close();
  sockets.delete(id);
  state.tabs.splice(idx, 1);
  if (state.active?.id === id) {
    state.active = state.tabs[Math.min(idx, state.tabs.length - 1)] || null;
  }
}

// Client-side slash commands handled locally without sending a turn to Claude.
export const LOCAL_COMMANDS = [
  { name: 'status', description: '查看当前会话状态' },
];

function runLocalCommand(a: ChatTab, name: string): boolean {
  if (name === 'status') {
    a.items.push({
      kind: 'status',
      key: nextKey(),
      user: state.user,
      model: a.model,
      permissionMode: a.permissionMode,
      cwd: a.cwd,
      sessionId: a.sessionId,
      connected: a.connected,
      branch: a.git?.branch || null,
      totalCost: a.totalCost,
      messageCount: a.items.filter((it) => it.kind === 'text').length,
    });
    requestUsage();
    return true;
  }
  return false;
}

export function sendMessage(text: string, attachments: Attachment[] = []) {
  const a = state.active;
  if (!a) return;
  if (!text.trim() && !attachments.length) return;

  // Intercept local slash commands (e.g. /status) — handled in the browser.
  const cmd = text.trim().match(/^\/(\S+)\s*$/);
  if (cmd && !attachments.length && LOCAL_COMMANDS.some((c) => c.name === cmd[1])) {
    runLocalCommand(a, cmd[1]);
    return;
  }

  const sock = sockets.get(a.id);
  if (!sock) return;

  // A new turn forks the timeline — a prior rewind can no longer be undone.
  a.rewindStash = null;
  a.items.push({
    kind: 'text',
    role: 'user',
    text,
    key: nextKey(),
    attachments: attachments.length ? attachments.map((x) => ({ name: x.name, kind: x.kind })) : undefined,
  });
  a.pendingUserEcho = text;
  a.running = true;
  a.streamingText = '';
  a.streamingThinking = '';
  sock.send({
    type: 'user',
    text,
    images: attachments.filter((x) => x.kind === 'image').map((x) => ({ media_type: x.mediaType, data: x.data })),
    files: attachments.filter((x) => x.kind === 'file').map((x) => ({ name: x.name, text: x.text })),
  });
}

// Put a previously-sent message back into the composer for editing/resending.
export function refillComposer(text: string) {
  if (!state.active) return;
  state.active.draft = text;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cw-focus-composer'));
  }
}

export function interrupt() {
  const a = state.active;
  if (!a) return;
  sockets.get(a.id)?.send({ type: 'interrupt' });
  a.running = false;
}

// Rewind to before the Nth user prompt: the server restores changed files and
// truncates the conversation. Anchored by ordinal index (wire uuids differ from
// the persisted ones checkpoints use). Confirmed via a `rewound` event.
export type RewindMode = 'both' | 'conversation' | 'files';

export function rewind(userIndex: number, mode: RewindMode = 'both') {
  const a = state.active;
  if (!a) return;
  if (a.running) return toast('请先停止当前生成再回退', 'error');
  sockets.get(a.id)?.send({ type: 'rewind', userIndex, mode });
}

export function undoRewind() {
  const a = state.active;
  if (!a || !a.rewindStash) return;
  sockets.get(a.id)?.send({ type: 'undo_rewind' });
}

export function setModel(model: string) {
  const a = state.active;
  if (!a) return;
  a.model = model;
  sockets.get(a.id)?.send({ type: 'set_model', model });
}

export function requestUsage() {
  const a = state.active;
  if (!a) return;
  sockets.get(a.id)?.send({ type: 'get_usage' });
}

export function setPermissionMode(mode: string) {
  const a = state.active;
  if (!a) return;
  a.permissionMode = mode;
  sockets.get(a.id)?.send({ type: 'set_permission_mode', mode });
}

export function respondPermission(id: string, behavior: 'allow' | 'deny', remember = false) {
  const a = state.active;
  if (!a) return;
  sockets.get(a.id)?.send({ type: 'permission', id, behavior, remember });
  a.permissions = a.permissions.filter((p) => p.id !== id);
}

// ------------------------------------------------------------- WS handling
function handleWs(tabId: string, data: any) {
  const a = tabById(tabId);
  if (!a) return;
  switch (data.type) {
    case 'ready':
      if (data.sessionId) a.sessionId = data.sessionId;
      a.permissionMode = data.permissionMode || a.permissionMode;
      if (data.cwd) a.cwd = data.cwd;
      if (Array.isArray(data.commands)) {
        const existing = new Set(
          data.commands.map((c: any) => (typeof c === 'string' ? c : c.name))
        );
        a.slashCommands = [
          ...LOCAL_COMMANDS.filter((c) => !existing.has(c.name)),
          ...data.commands,
        ];
      }
      if (Array.isArray(data.models) && data.models.length) {
        state.models = data.models.filter((m: ModelInfo) => m.value !== 'default');
      }
      // Fetch usage right away so the topbar capsule shows on connect, without
      // waiting for a turn to finish or the user to run /status.
      sockets.get(a.id)?.send({ type: 'get_usage' });
      break;
    case 'usage':
      a.usage = {
        available: !!data.available,
        subscriptionType: data.subscriptionType ?? null,
        rateLimitsAvailable: !!data.rateLimitsAvailable,
        cost: typeof data.cost === 'number' ? data.cost : undefined,
        windows: Array.isArray(data.windows) ? data.windows : [],
        reason: data.reason,
      };
      break;
    case 'session':
      a.sessionId = data.sessionId;
      if (data.cwd) a.cwd = data.cwd;
      refreshSessions();
      break;
    case 'message':
      ingestSdkMessage(a, data.message, true);
      break;
    case 'permission_request':
      a.permissions.push({
        id: data.id,
        toolName: data.toolName,
        input: data.input,
        suggestions: data.suggestions,
      });
      break;
    case 'permission_cancel': {
      // The tool call this prompt belonged to is gone (query restarted/aborted).
      // Drop the dialog so the user isn't left clicking a dead prompt.
      const had = a.permissions.some((p) => p.id === data.id);
      a.permissions = a.permissions.filter((p) => p.id !== data.id);
      if (had) toast('权限请求已失效（会话已刷新），如仍需要请等待重新询问');
      break;
    }
    case 'model_changed':
      a.model = data.model;
      break;
    case 'permission_mode_changed':
      a.permissionMode = data.mode;
      break;
    case 'done':
      a.running = false;
      a.status = null;
      refreshGit(a);
      break;
    case 'rewound': {
      const mode = (data.mode as 'both' | 'conversation' | 'files') || 'both';
      // Truncate the visible conversation only when the mode reverted it.
      if (mode !== 'files') {
        // Drop the rewound turn and everything after it; stash for undo.
        // Locate the Nth user text item (matches the server's ordinal anchor).
        let n = -1;
        let idx = -1;
        for (let i = 0; i < a.items.length; i++) {
          const it = a.items[i];
          if (it.kind === 'text' && it.role === 'user') {
            n++;
            if (n === data.userIndex) {
              idx = i;
              break;
            }
          }
        }
        if (idx >= 0) a.rewindStash = { items: a.items.splice(idx) };
        a.streamingText = '';
        a.streamingThinking = '';
        a.running = false;
        a.pendingUserEcho = null;
      } else {
        // Files-only: nothing to undo via the conversation stash, but keep a
        // marker so the undo bar can offer to restore the files.
        a.rewindStash = { items: [] };
      }
      refreshGit(a);
      const nFiles = data.filesChanged?.length || 0;
      const convoNote = mode === 'files' ? '文件' : mode === 'conversation' ? '对话' : '对话与文件';
      toast(
        data.fileError
          ? `已回退${convoNote}（${data.fileError}）`
          : `已回退${convoNote}${nFiles ? `，恢复了 ${nFiles} 个文件` : ''}`,
        'info'
      );
      break;
    }
    case 'rewound_undo':
      if (a.rewindStash) {
        a.items.push(...a.rewindStash.items);
        a.rewindStash = null;
      }
      refreshGit(a);
      toast('已撤销回退');
      break;
    case 'rewind_error':
      toast(data.message || '回退失败', 'error');
      break;
    case 'error':
      toast(data.message || '发生错误', 'error');
      a.running = false;
      break;
    case 'stderr':
      if (/error|fatal|denied/i.test(data.text)) console.warn('[claude]', data.text);
      break;
  }
}

function extractText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b?.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }
  if (content?.type === 'text') return content.text;
  return typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
}

function ingestSdkMessage(a: ChatTab, m: any, live: boolean) {
  if (!m) return;

  if (m.type === 'stream_event' && live) {
    const e = m.event;
    if (e?.type === 'content_block_delta') {
      if (e.delta?.type === 'text_delta') a.streamingText += e.delta.text;
      else if (e.delta?.type === 'thinking_delta') a.streamingThinking += e.delta.thinking;
    }
    return;
  }

  if (m.type === 'assistant') {
    a.streamingText = '';
    a.streamingThinking = '';
    a.status = null; // clear any "retrying"/"compacting" status once content lands
    const content = m.message?.content || [];
    for (const block of Array.isArray(content) ? content : []) {
      if (block.type === 'text' && block.text?.trim()) {
        a.items.push({ kind: 'text', role: 'assistant', text: block.text, key: nextKey() });
      } else if (block.type === 'thinking' && block.thinking?.trim()) {
        a.items.push({ kind: 'thinking', text: block.thinking, key: nextKey() });
      } else if (block.type === 'tool_use') {
        const tool: ToolUseBlock = { id: block.id, name: block.name, input: block.input || {} };
        a.toolMap[block.id] = tool;
        a.items.push({ kind: 'tool', tool, key: nextKey() });
      }
    }
    return;
  }

  if (m.type === 'user') {
    const content = m.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_result') {
          const tool = a.toolMap[block.tool_use_id];
          if (tool) {
            tool.result = { content: extractText(block.content), isError: !!block.is_error };
          }
        }
      }
    }
    const text = typeof content === 'string' ? content : extractText(content);
    const hasToolResult = Array.isArray(content) && content.some((b) => b?.type === 'tool_result');
    if (text && text.trim() && !hasToolResult) {
      if (live && a.pendingUserEcho === text) {
        a.pendingUserEcho = null;
        // Attach the canonical uuid to the optimistic user item already shown,
        // so it can serve as a rewind anchor.
        for (let i = a.items.length - 1; i >= 0; i--) {
          const it = a.items[i];
          if (it.kind === 'text' && it.role === 'user') {
            it.uuid = m.uuid;
            break;
          }
        }
      } else {
        a.items.push({ kind: 'text', role: 'user', text, key: nextKey(), uuid: m.uuid });
      }
    }
    return;
  }

  if (m.type === 'result') {
    a.running = false;
    a.status = null;
    a.totalCost = m.total_cost_usd || a.totalCost;
    a.items.push({
      kind: 'result',
      key: nextKey(),
      cost: m.total_cost_usd || 0,
      durationMs: m.duration_ms || 0,
      numTurns: m.num_turns || 0,
      isError: !!m.is_error,
      usage: m.usage,
    });
    return;
  }

  if (m.type === 'system') {
    if (m.subtype === 'status') a.status = m.status;
    else if (m.subtype === 'api_retry') {
      // SDK is auto-retrying a transient API failure (e.g. overloaded/529).
      a.running = true;
      a.status = 'retrying';
    } else if (m.subtype === 'session_state_changed') {
      if (m.state === 'idle') a.running = false;
      else if (m.state === 'running') a.running = true;
    }
  }
}

// ------------------------------------------------------------------- Git
export async function refreshGit(tab?: ChatTab | null) {
  const a = tab || state.active;
  if (!a?.cwd) return;
  a.loadingGit = true;
  try {
    a.git = await api.gitStatus(a.cwd);
  } catch {
    a.git = null;
  } finally {
    a.loadingGit = false;
  }
}
