<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  state,
  logout,
  openChat,
  newChat,
  deleteSession,
  renameSession,
  refreshSessions,
  setTheme,
  setSidebarWidth,
  THEMES,
  openPalette,
  forkSession,
  toast,
} from '../lib/store';
import type { ThemeName } from '../lib/store';
import type { SessionMeta } from '../lib/types';
import Icon from './Icon.vue';
import DirectoryPicker from './DirectoryPicker.vue';
import SettingsModal from './SettingsModal.vue';
import ResizeHandle from './ResizeHandle.vue';

const search = ref('');
const pickerOpen = ref(false);
const settingsOpen = ref(false);
// Project rail collapse state (letters only) vs expanded (square + folder name).
const railExpanded = ref(localStorage.getItem('cw-rail-expanded') === '1');
function toggleRail() {
  railExpanded.value = !railExpanded.value;
  localStorage.setItem('cw-rail-expanded', railExpanded.value ? '1' : '0');
}
// Theme picker (深色 / 浅色 / cmux).
const themeOpen = ref(false);
const THEME_LABELS: Record<ThemeName, string> = { dark: '深色', light: '浅色', cmux: 'cmux' };
function pickTheme(t: ThemeName) {
  themeOpen.value = false;
  setTheme(t);
}
const renaming = ref<string | null>(null);
const renameText = ref('');
// Which project (working directory) is selected in the rail. `null` means
// "fall back to the active tab / first project".
const selectedCwd = ref<string | null>(null);

function baseName(p: string): string {
  if (!p) return '未指定目录';
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] || p;
}

async function copyPath() {
  const p = currentCwd.value;
  if (!p) return;
  try {
    await navigator.clipboard.writeText(p);
    toast('已复制路径');
  } catch {
    toast('复制失败', 'error');
  }
}

// Muted backdrop / bright glyph, keyed off the directory so each project keeps
// a stable colour across reloads.
const PALETTE = [
  '#7c3a6b', '#1e4f7a', '#5a6b1a', '#5a2d7a', '#7a3d1a',
  '#1a5a4f', '#6b1a3a', '#1a3a6b', '#4f5a1a', '#3a1a6b',
];
function avatarColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function avatarLetter(name: string): string {
  const c = name.trim()[0];
  return c ? c.toUpperCase() : '~';
}

// One entry per distinct working directory, drawn from saved sessions plus any
// open tabs (so a brand-new chat shows immediately). Sorted by recency.
const projects = computed(() => {
  const map = new Map<string, { cwd: string; count: number; lastModified: number }>();
  const bump = (cwd: string, ts: number) => {
    const e = map.get(cwd);
    if (e) {
      e.count++;
      e.lastModified = Math.max(e.lastModified, ts);
    } else {
      map.set(cwd, { cwd, count: 1, lastModified: ts });
    }
  };
  for (const s of state.sessions) bump(s.cwd || '', s.lastModified || 0);
  for (const t of state.tabs) {
    if (!map.has(t.cwd || '')) map.set(t.cwd || '', { cwd: t.cwd || '', count: 0, lastModified: Date.now() });
  }
  return [...map.values()].sort((a, b) => b.lastModified - a.lastModified);
});

const currentCwd = computed<string | null>(() => {
  const keys = projects.value.map((p) => p.cwd);
  if (selectedCwd.value !== null && keys.includes(selectedCwd.value)) return selectedCwd.value;
  const act = state.active?.cwd;
  if (act != null && keys.includes(act)) return act;
  return keys.length ? keys[0] : null;
});

const panelSessions = computed(() => {
  const cwd = currentCwd.value;
  if (cwd === null) return [];
  const q = search.value.trim().toLowerCase();
  return state.sessions.filter((s) => {
    if ((s.cwd || '') !== cwd) return false;
    if (!q) return true;
    return s.title.toLowerCase().includes(q);
  });
});

function relTime(ts: number | null): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ts).toLocaleDateString();
}

function formatContextSize(tokens: number): string {
  if (tokens === 0) return '';
  if (tokens < 1000) return `${tokens} tokens`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}k tokens`;
  return `${(tokens / 1000000).toFixed(1)}M tokens`;
}

function selectProject(cwd: string) {
  selectedCwd.value = cwd;
}

function newInCurrent() {
  const cwd = currentCwd.value;
  if (cwd) newChat(cwd);
  else pickerOpen.value = true;
}

function onPick(cwd: string) {
  pickerOpen.value = false;
  selectedCwd.value = cwd;
  newChat(cwd);
}

function startRename(s: SessionMeta) {
  renaming.value = s.id;
  renameText.value = s.title;
}
async function commitRename(s: SessionMeta) {
  const t = renameText.value.trim();
  renaming.value = null;
  if (t && t !== s.title) await renameSession(s.id, t);
}

async function onDelete(s: SessionMeta) {
  if (confirm(`删除会话 “${s.title}” ？此操作不可恢复。`)) {
    await deleteSession(s.id);
  }
}

const isActive = (id: string) => state.active?.sessionId === id;
</script>

<template>
  <aside class="sidebar" :class="{ open: state.sidebarOpen, 'rail-expanded': railExpanded }">
    <!-- Project rail -->
    <div class="rail" :class="{ expanded: railExpanded }">
      <div class="brand" title="Claude Web">✦</div>
      <div class="rail-list">
        <button
          v-for="p in projects"
          :key="p.cwd || '__none__'"
          class="avatar-btn"
          :class="{ active: currentCwd === p.cwd }"
          :title="p.cwd || '未指定目录'"
          @click="selectProject(p.cwd)"
        >
          <span class="avatar" :style="{ background: avatarColor(p.cwd) }">
            {{ avatarLetter(baseName(p.cwd)) }}
          </span>
          <span v-if="railExpanded" class="rail-name">{{ baseName(p.cwd) }}</span>
        </button>
      </div>
      <button class="rail-add" title="打开其它目录新建会话" @click="pickerOpen = true">
        <Icon name="plus" />
      </button>
      <button
        class="rail-toggle"
        :title="railExpanded ? '收起' : '展开'"
        @click="toggleRail"
      >
        <Icon name="chevronRight" />
      </button>
    </div>

    <!-- Selected project panel -->
    <div class="panel">
      <header class="panel-head">
        <div class="head-main">
          <div class="proj-name">{{ baseName(currentCwd ?? '') }}</div>
          <div v-if="currentCwd" class="proj-path-row">
            <span class="proj-path" :title="currentCwd">{{ currentCwd }}</span>
            <button class="btn icon ghost copy-btn" title="复制完整路径" @click="copyPath">
              <Icon name="copy" />
            </button>
          </div>
          <div v-else class="proj-path-row">
            <span class="proj-path muted">未指定目录</span>
          </div>
        </div>
        <div class="head-actions">
          <button class="btn icon ghost" title="命令面板 (⌘K)" @click="openPalette">
            <Icon name="search" />
          </button>
          <button class="btn icon ghost" title="刷新" @click="refreshSessions">
            <Icon name="refresh" />
          </button>
        </div>
      </header>

      <button class="btn primary new" @click="newInCurrent">
        <Icon name="edit" /> 新建会话
      </button>

      <div class="searchbox">
        <Icon name="search" />
        <input v-model="search" placeholder="搜索会话…" />
      </div>

      <div class="list">
        <div v-if="state.loadingSessions" class="empty">
          <Icon name="loader" class="spin" /> 加载中…
        </div>
        <div v-else-if="!panelSessions.length" class="empty">该目录暂无会话</div>

        <div
          v-for="s in panelSessions"
          :key="s.id"
          class="item"
          :class="{ active: isActive(s.id) }"
          @click="openChat(s)"
        >
          <div class="item-main">
            <input
              v-if="renaming === s.id"
              v-model="renameText"
              class="rename-input"
              @click.stop
              @keyup.enter="commitRename(s)"
              @blur="commitRename(s)"
              v-focus
            />
            <div v-else class="title">{{ s.title }}</div>
            <div class="meta">
              <span v-if="s.gitBranch" class="branch"><Icon name="branch" /> {{ s.gitBranch }}</span>
              <span v-if="s.contextSize" class="context-size">
                <Icon name="cpu" /> {{ formatContextSize(s.contextSize) }}
              </span>
            </div>
          </div>
          <div class="item-side">
            <span class="time">{{ relTime(s.lastModified) }}</span>
            <div class="actions">
              <button class="btn icon ghost" title="分叉为新会话" @click.stop="forkSession(s)">
                <Icon name="branch" />
              </button>
              <button class="btn icon ghost" title="重命名" @click.stop="startRename(s)">
                <Icon name="edit" />
              </button>
              <button class="btn icon ghost danger" title="删除" @click.stop="onDelete(s)">
                <Icon name="trash" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer class="bottom">
        <div class="user">
          <div class="avatar small">{{ (state.user || '?')[0].toUpperCase() }}</div>
          <span>{{ state.user }}</span>
        </div>
        <div class="foot-actions">
          <div class="theme-menu" v-click-outside="() => (themeOpen = false)">
            <button class="btn icon ghost" title="主题" @click="themeOpen = !themeOpen">
              <Icon name="theme" />
            </button>
            <Transition name="pop">
              <div v-if="themeOpen" class="theme-pop">
                <button
                  v-for="t in THEMES"
                  :key="t"
                  class="theme-opt"
                  :class="{ active: state.theme === t }"
                  @click="pickTheme(t)"
                >
                  <span>{{ THEME_LABELS[t] }}</span>
                  <Icon v-if="state.theme === t" name="check" class="tick" />
                </button>
              </div>
            </Transition>
          </div>
          <button class="btn icon ghost" title="设置" @click="settingsOpen = true">
            <Icon name="settings" />
          </button>
          <button class="btn icon ghost" title="退出登录" @click="logout">
            <Icon name="logout" />
          </button>
        </div>
      </footer>
    </div>

    <DirectoryPicker v-if="pickerOpen" @close="pickerOpen = false" @pick="onPick" />
    <SettingsModal v-if="settingsOpen" @close="settingsOpen = false" />
    <ResizeHandle @resize="setSidebarWidth" />
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width, 320px);
  flex-shrink: 0;
  height: 100%;
  background: var(--bg-elev);
  border-right: 1px solid var(--border);
  display: flex;
  transition: width 0.16s ease;
}
/* Grow the whole sidebar when the rail expands so the session panel keeps
   its width (rail 60->210 = +150px). */
.sidebar.rail-expanded {
  width: 470px;
}

/* ---- Project rail ---- */
.rail {
  width: 60px;
  flex-shrink: 0;
  height: 100%;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 8px;
  background: var(--bg);
  transition: width 0.16s ease;
}
.rail.expanded {
  width: 210px;
}
.brand {
  color: var(--accent);
  font-size: 20px;
  line-height: 1;
  padding-bottom: 8px;
}
.rail-list {
  flex: 1;
  width: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  /* vertical+horizontal room so the active selection outline (offset 2px +
     2px) isn't clipped by this scroll container's edges */
  padding: 5px 6px;
}
.rail-list::-webkit-scrollbar {
  width: 0;
}
.avatar-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: 12px;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color 0.13s;
}
.avatar-btn.active {
  outline-color: var(--text);
}
.avatar {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  font-size: 16px;
}
.avatar-btn:hover .avatar {
  filter: brightness(1.15);
}
/* Expanded: rows of square + last-folder name */
.rail.expanded .rail-list {
  align-items: stretch;
}
.rail.expanded .avatar-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 4px 8px;
  border-radius: 11px;
}
.rail.expanded .avatar-btn:hover {
  background: var(--bg-hover);
}
.rail-name {
  min-width: 0;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}
.rail-add {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 11px;
  background: none;
  border: 1px dashed var(--border);
  color: var(--text-faint);
  cursor: pointer;
  display: grid;
  place-items: center;
}
.rail-add:hover {
  color: var(--text);
  border-color: var(--text-faint);
}
.rail-toggle {
  width: 38px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 11px;
  background: none;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  display: grid;
  place-items: center;
}
.rail-toggle:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.rail-toggle :deep(.icon-svg) {
  transition: transform 0.16s ease;
}
.rail.expanded .rail-toggle :deep(.icon-svg) {
  transform: rotate(180deg);
}
.rail.expanded .rail-add,
.rail.expanded .rail-toggle {
  align-self: center;
}

/* ---- Project panel ---- */
.panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
  gap: 12px;
}
.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.head-main {
  min-width: 0;
}
.proj-name {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.proj-path-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 2px;
}
.proj-path {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--text-faint);
  /* show the whole path, wrapping as needed, and allow text selection/copy */
  white-space: normal;
  word-break: break-all;
  user-select: text;
  cursor: text;
}
.proj-path.muted {
  font-style: italic;
}
.copy-btn {
  padding: 2px;
  flex-shrink: 0;
  margin-top: 1px;
}
.copy-btn :deep(.icon-svg) {
  width: 13px;
  height: 13px;
}
.head-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.new {
  justify-content: center;
  padding: 11px;
}
.searchbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.searchbox :deep(.icon-svg) {
  color: var(--text-faint);
  width: 15px;
  height: 15px;
}
.searchbox input {
  flex: 1;
  background: none;
  border: none;
  padding: 9px 0;
  font-size: 13px;
}
.searchbox input:focus {
  outline: none;
}
.list {
  flex: 1;
  overflow-y: auto;
  margin: 0 -6px;
  padding: 0 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-faint);
  font-size: 13px;
  padding: 30px 0;
}
.item {
  display: flex;
  gap: 8px;
  padding: 10px 11px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.13s, border-color 0.13s;
}
.item:hover {
  background: var(--bg-hover);
}
.item.active {
  background: var(--accent-soft);
  border-color: rgba(217, 119, 87, 0.3);
}
.item-main {
  flex: 1;
  min-width: 0;
}
.title {
  font-size: 13.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rename-input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: 5px;
  padding: 3px 6px;
  font-size: 13px;
}
.rename-input:focus {
  outline: none;
}
.meta {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-faint);
}
.meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta :deep(.icon-svg) {
  width: 12px;
  height: 12px;
}
.context-size {
  color: var(--accent);
  font-weight: 500;
}
.item-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
}
.time {
  font-size: 10.5px;
  color: var(--text-faint);
  white-space: nowrap;
}
.actions {
  display: none;
  gap: 2px;
}
.item:hover .actions {
  display: flex;
}
.actions .btn {
  padding: 4px;
}
.actions :deep(.icon-svg) {
  width: 14px;
  height: 14px;
}
.bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--border-soft);
}
.user {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
}
.avatar.small {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 12px;
  background: linear-gradient(135deg, var(--accent), #e8a06f);
  color: #1a120d;
}
.foot-actions {
  display: flex;
  gap: 2px;
}
.theme-menu {
  position: relative;
}
.theme-pop {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  width: 132px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 5px;
  z-index: 40;
}
.theme-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  text-align: left;
}
.theme-opt:hover {
  background: var(--bg-hover);
}
.theme-opt.active {
  background: var(--accent-soft);
}
.theme-opt .tick {
  color: var(--accent);
  width: 14px;
  height: 14px;
}

/* Mobile: turn the sidebar into a slide-in drawer */
@media (max-width: 900px) {
  .sidebar,
  .sidebar.rail-expanded {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    width: min(90vw, 360px);
    z-index: 60;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: var(--shadow);
  }
  .sidebar.open {
    transform: translateX(0);
  }
}
</style>
