<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ToolUseBlock } from '../lib/types';
import Icon from './Icon.vue';

const props = defineProps<{ tool: ToolUseBlock }>();
const expanded = ref(false);

const summary = computed(() => {
  const i = props.tool.input || {};
  switch (props.tool.name) {
    case 'Bash':
      return String(i.command ?? '');
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return String(i.file_path ?? i.notebook_path ?? '');
    case 'Glob':
      return String(i.pattern ?? '');
    case 'Grep':
      return String(i.pattern ?? '') + (i.path ? ` in ${i.path}` : '');
    case 'WebFetch':
    case 'WebSearch':
      return String(i.url ?? i.query ?? '');
    case 'Task':
    case 'Agent':
      return String(i.description ?? i.subagent_type ?? '');
    case 'TodoWrite':
      return Array.isArray(i.todos) ? `${i.todos.length} 项任务` : '';
    default:
      return '';
  }
});

const running = computed(() => !props.tool.result);
const isError = computed(() => props.tool.result?.isError);

interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}
const todos = computed<Todo[] | null>(() => {
  if (props.tool.name !== 'TodoWrite') return null;
  const t = (props.tool.input as { todos?: unknown })?.todos;
  return Array.isArray(t) ? (t as Todo[]) : null;
});
const todoDone = computed(() => todos.value?.filter((t) => t.status === 'completed').length ?? 0);

const inputJson = computed(() => {
  try {
    return JSON.stringify(props.tool.input, null, 2);
  } catch {
    return String(props.tool.input);
  }
});

// For edit-like tools, render the change as a diff instead of raw JSON.
interface DiffLine {
  text: string;
  type: 'add' | 'del';
}
const editDiff = computed<DiffLine[] | null>(() => {
  const i = props.tool.input as Record<string, any>;
  const toLines = (s: unknown, type: 'add' | 'del'): DiffLine[] =>
    String(s ?? '')
      .split('\n')
      .map((text) => ({ text, type }));
  if (props.tool.name === 'Edit') {
    return [...toLines(i.old_string, 'del'), ...toLines(i.new_string, 'add')];
  }
  if (props.tool.name === 'Write') {
    return toLines(i.content, 'add');
  }
  if (props.tool.name === 'MultiEdit' && Array.isArray(i.edits)) {
    const out: DiffLine[] = [];
    for (const e of i.edits) {
      out.push(...toLines(e.old_string, 'del'), ...toLines(e.new_string, 'add'));
    }
    return out;
  }
  return null;
});

const resultText = computed(() => {
  const r = props.tool.result?.content || '';
  return r.length > 4000 ? r.slice(0, 4000) + '\n… (已截断)' : r;
});
</script>

<template>
  <!-- TodoWrite: render as a live checklist instead of raw JSON -->
  <div v-if="todos" class="todo-card">
    <div class="todo-head">
      <Icon name="check" />
      <span>任务清单</span>
      <span class="todo-count">{{ todoDone }}/{{ todos.length }}</span>
    </div>
    <ul class="todo-list">
      <li v-for="(t, i) in todos" :key="i" class="todo" :class="t.status">
        <span class="tick">
          <Icon v-if="t.status === 'completed'" name="check" />
          <Icon v-else-if="t.status === 'in_progress'" name="loader" class="spin" />
          <span v-else class="circle"></span>
        </span>
        <span class="ttext">{{
          t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content
        }}</span>
      </li>
    </ul>
  </div>

  <div v-else class="tool" :class="{ error: isError, running }">
    <button class="head" @click="expanded = !expanded">
      <Icon :name="running ? 'loader' : isError ? 'alert' : 'tool'" :class="{ spin: running }" class="ticon" />
      <span class="tname">{{ tool.name }}</span>
      <span class="tsummary" :title="summary">{{ summary }}</span>
      <span v-if="running" class="status run">运行中</span>
      <span v-else-if="isError" class="status err">失败</span>
      <span v-else class="status ok"><Icon name="check" /></span>
      <Icon name="chevronRight" class="chev" :class="{ open: expanded }" />
    </button>

    <div v-if="expanded" class="body">
      <div v-if="editDiff" class="section">
        <div class="label">改动</div>
        <pre class="diff"><span
          v-for="(l, i) in editDiff"
          :key="i"
          class="dl"
          :class="l.type"
        >{{ (l.type === 'add' ? '+ ' : '- ') + (l.text || ' ') }}
</span></pre>
      </div>
      <div v-else class="section">
        <div class="label">输入</div>
        <pre>{{ inputJson }}</pre>
      </div>
      <div v-if="tool.result" class="section">
        <div class="label">输出</div>
        <pre :class="{ errtext: isError }">{{ resultText }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todo-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elev);
  padding: 11px 13px;
}
.todo-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 8px;
}
.todo-head :deep(.icon-svg) {
  width: 14px;
  height: 14px;
  color: var(--accent);
}
.todo-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-faint);
  font-family: var(--mono);
}
.todo-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.todo {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 13px;
  line-height: 1.5;
}
.tick {
  display: grid;
  place-items: center;
  width: 16px;
  height: 19px;
  flex-shrink: 0;
}
.tick :deep(.icon-svg) {
  width: 14px;
  height: 14px;
}
.todo.completed .tick :deep(.icon-svg) {
  color: var(--green);
}
.todo.in_progress .tick :deep(.icon-svg) {
  color: var(--accent);
}
.circle {
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--text-faint);
  border-radius: 50%;
}
.todo.completed .ttext {
  color: var(--text-faint);
  text-decoration: line-through;
}
.todo.in_progress .ttext {
  color: var(--text);
  font-weight: 500;
}
.todo.pending .ttext {
  color: var(--text-dim);
}
.tool {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-elev);
  overflow: hidden;
}
.tool.error {
  border-color: rgba(224, 108, 108, 0.4);
}
.head {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px 12px;
  text-align: left;
}
.head:hover {
  background: var(--bg-hover);
}
.ticon {
  width: 15px;
  height: 15px;
  color: var(--accent);
  flex-shrink: 0;
}
.error .ticon {
  color: var(--red);
}
.tname {
  font-size: 12.5px;
  font-weight: 600;
  flex-shrink: 0;
}
.tsummary {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.status {
  font-size: 11px;
  flex-shrink: 0;
}
.status.run {
  color: var(--yellow);
}
.status.err {
  color: var(--red);
}
.status.ok :deep(.icon-svg) {
  width: 14px;
  height: 14px;
  color: var(--green);
}
.chev {
  width: 14px;
  height: 14px;
  opacity: 0.5;
  transition: transform 0.15s;
  flex-shrink: 0;
}
.chev.open {
  transform: rotate(90deg);
}
.body {
  border-top: 1px solid var(--border-soft);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-faint);
  margin-bottom: 5px;
}
.body pre {
  margin: 0;
  background: var(--bg);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 10px 12px;
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.5;
  overflow-x: auto;
  max-height: 320px;
  white-space: pre-wrap;
  word-break: break-word;
}
.body pre.errtext {
  color: var(--red);
}
.body pre.diff {
  padding: 0;
}
.dl {
  display: block;
  padding: 0 12px;
}
.dl.add {
  background: rgba(108, 194, 143, 0.12);
  color: #9bdcb5;
}
.dl.del {
  background: rgba(224, 108, 108, 0.12);
  color: #eaa0a0;
}
</style>
