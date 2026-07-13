<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  state,
  closePalette,
  openChat,
  setModel,
  setPermissionMode,
  toggleTheme,
} from '../lib/store';
import Icon from './Icon.vue';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  group: string;
  keywords?: string;
  run: () => void;
}

const query = ref('');
const index = ref(0);
const input = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

const MODES = [
  { value: 'default', label: '默认' },
  { value: 'acceptEdits', label: '自动编辑' },
  { value: 'plan', label: '计划模式' },
  { value: 'bypassPermissions', label: '跳过权限' },
];

const commands = computed<Command[]>(() => {
  const list: Command[] = [];
  const a = state.active;

  list.push({
    id: 'new-chat',
    label: '新建会话',
    hint: '选择工作目录',
    icon: 'plus',
    group: '操作',
    keywords: 'new chat session xinjian',
    run: () => window.dispatchEvent(new CustomEvent('cw-open-picker')),
  });
  list.push({
    id: 'toggle-theme',
    label: '切换主题',
    icon: 'theme',
    group: '操作',
    keywords: 'theme dark light cmux zhuti',
    run: toggleTheme,
  });
  if (a) {
    list.push({
      id: 'toggle-changes',
      label: state.showChanges ? '隐藏变更面板' : '显示变更面板',
      icon: 'diff',
      group: '操作',
      keywords: 'diff changes git bianggeng',
      run: () => (state.showChanges = !state.showChanges),
    });
  }

  // Recent sessions
  for (const s of state.sessions.slice(0, 12)) {
    list.push({
      id: 'session-' + s.id,
      label: s.title,
      hint: s.cwd || undefined,
      icon: 'message',
      group: '会话',
      keywords: (s.cwd || '') + ' ' + (s.gitBranch || ''),
      run: () => openChat(s),
    });
  }

  // Models (only when a chat is active)
  if (a) {
    for (const m of state.models) {
      list.push({
        id: 'model-' + m.value,
        label: `模型：${m.displayName}`,
        hint: m.value === a.model ? '当前' : m.description,
        icon: 'cpu',
        group: '模型',
        keywords: 'model ' + m.value + ' ' + m.displayName,
        run: () => setModel(m.value),
      });
    }
    for (const m of MODES) {
      list.push({
        id: 'mode-' + m.value,
        label: `权限：${m.label}`,
        hint: m.value === a.permissionMode ? '当前' : undefined,
        icon: 'shield',
        group: '权限模式',
        keywords: 'permission mode ' + m.value,
        run: () => setPermissionMode(m.value),
      });
    }
  }

  return list;
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return commands.value;
  return commands.value.filter((c) =>
    (c.label + ' ' + (c.hint || '') + ' ' + (c.keywords || '')).toLowerCase().includes(q)
  );
});

// Group the filtered list while keeping a flat index for keyboard nav.
const groups = computed(() => {
  const map = new Map<string, Command[]>();
  for (const c of filtered.value) {
    if (!map.has(c.group)) map.set(c.group, []);
    map.get(c.group)!.push(c);
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }));
});

watch(filtered, () => (index.value = 0));

function run(c: Command) {
  closePalette();
  c.run();
}

function move(delta: number) {
  const n = filtered.value.length;
  if (!n) return;
  index.value = (index.value + delta + n) % n;
  nextTick(() => {
    listEl.value
      ?.querySelector('.cmd.active')
      ?.scrollIntoView({ block: 'nearest' });
  });
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    move(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    move(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const c = filtered.value[index.value];
    if (c) run(c);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePalette();
  }
}

// Flat index → which command is highlighted (used for the active class).
const activeId = computed(() => filtered.value[index.value]?.id);

watch(
  () => state.paletteOpen,
  (open) => {
    if (open) {
      query.value = '';
      index.value = 0;
      nextTick(() => input.value?.focus());
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="overlay" @click.self="closePalette">
    <div class="palette">
      <div class="search">
        <Icon name="search" />
        <input
          ref="input"
          v-model="query"
          placeholder="输入命令或搜索会话…"
          @keydown="onKey"
        />
        <span class="kbd">Esc</span>
      </div>
      <div ref="listEl" class="results">
        <div v-if="!filtered.length" class="empty">没有匹配项</div>
        <template v-for="g in groups" :key="g.name">
          <div class="group">{{ g.name }}</div>
          <button
            v-for="c in g.items"
            :key="c.id"
            class="cmd"
            :class="{ active: c.id === activeId }"
            @click="run(c)"
            @mousemove="index = filtered.findIndex((x) => x.id === c.id)"
          >
            <Icon :name="c.icon" class="ci" />
            <span class="clabel">{{ c.label }}</span>
            <span v-if="c.hint" class="chint">{{ c.hint }}</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 200;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  backdrop-filter: blur(2px);
}
.palette {
  width: min(92vw, 600px);
  max-height: 70vh;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-soft);
}
.search :deep(.icon-svg) {
  width: 18px;
  height: 18px;
  color: var(--text-faint);
}
.search input {
  flex: 1;
  background: none;
  border: none;
  font-size: 15px;
}
.search input:focus {
  outline: none;
}
.kbd {
  font-size: 11px;
  color: var(--text-faint);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 6px;
}
.results {
  overflow-y: auto;
  padding: 6px;
}
.empty {
  padding: 28px;
  text-align: center;
  color: var(--text-faint);
  font-size: 13px;
}
.group {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-faint);
  padding: 10px 12px 4px;
}
.cmd {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  text-align: left;
}
.cmd.active {
  background: var(--accent-soft);
}
.ci {
  width: 16px;
  height: 16px;
  color: var(--accent);
  flex-shrink: 0;
}
.clabel {
  font-size: 13.5px;
  white-space: nowrap;
  flex-shrink: 0;
}
.chint {
  font-size: 11.5px;
  color: var(--text-faint);
  font-family: var(--mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: right;
}
</style>
