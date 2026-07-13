<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { state, refreshGit } from '../lib/store';
import { api } from '../lib/api';
import type { GitFile } from '../lib/types';
import Icon from './Icon.vue';

const selected = ref<GitFile | null>(null);
const diffLines = ref<{ text: string; type: string }[]>([]);
const loadingDiff = ref(false);

const git = computed(() => state.active?.git || null);
const files = computed(() => git.value?.files || []);

watch(
  () => state.showChanges,
  (v) => {
    if (v) refreshGit();
  }
);

// Reset the open diff when switching tabs.
watch(
  () => state.active?.id,
  () => {
    selected.value = null;
  }
);

function statusColor(s: string) {
  return (
    {
      modified: 'var(--yellow)',
      added: 'var(--green)',
      untracked: 'var(--green)',
      deleted: 'var(--red)',
      renamed: 'var(--blue)',
      conflict: 'var(--red)',
    }[s] || 'var(--text-dim)'
  );
}
function statusLetter(f: GitFile) {
  return { modified: 'M', added: 'A', untracked: 'U', deleted: 'D', renamed: 'R', conflict: '!' }[f.status] || '·';
}

async function openDiff(f: GitFile) {
  selected.value = f;
  loadingDiff.value = true;
  diffLines.value = [];
  try {
    const { diff } = await api.gitDiff(state.active!.cwd, f.path, f.staged && !f.untracked);
    diffLines.value = diff.split('\n').map((text) => ({ text, type: lineType(text) }));
  } catch {
    diffLines.value = [{ text: '无法加载 diff', type: 'meta' }];
  } finally {
    loadingDiff.value = false;
  }
}

function lineType(l: string): string {
  if (l.startsWith('+++') || l.startsWith('---')) return 'file';
  if (l.startsWith('@@')) return 'hunk';
  if (l.startsWith('+')) return 'add';
  if (l.startsWith('-')) return 'del';
  if (l.startsWith('diff ') || l.startsWith('index ')) return 'meta';
  return 'ctx';
}

function basename(p: string) {
  const parts = p.split('/');
  return { name: parts.pop(), dir: parts.join('/') };
}
</script>

<template>
  <aside class="panel">
    <header>
      <div class="ttl">
        <Icon name="diff" /> 变更记录
        <span v-if="git?.branch" class="branch"><Icon name="branch" />{{ git.branch }}</span>
      </div>
      <div class="hactions">
        <button class="btn icon ghost" title="刷新" @click="refreshGit()"><Icon name="refresh" :class="{ spin: state.active?.loadingGit }" /></button>
        <button class="btn icon ghost" title="关闭" @click="state.showChanges = false"><Icon name="x" /></button>
      </div>
    </header>

    <div v-if="!git?.isRepo" class="note">
      当前工作目录不是 Git 仓库，无法显示变更。
    </div>

    <template v-else>
      <div class="files" v-show="!selected">
        <div v-if="!files.length" class="note">没有未提交的变更 ✓</div>
        <button v-for="f in files" :key="f.path" class="file" @click="openDiff(f)">
          <span class="badge" :style="{ color: statusColor(f.status), borderColor: statusColor(f.status) }">
            {{ statusLetter(f) }}
          </span>
          <span class="fname">{{ basename(f.path).name }}</span>
          <span class="fdir">{{ basename(f.path).dir }}</span>
        </button>
      </div>

      <div v-if="selected" class="diff-view">
        <div class="diff-head">
          <button class="btn icon ghost" @click="selected = null"><Icon name="chevronRight" style="transform: rotate(180deg)" /></button>
          <span class="dfile" :title="selected.path">{{ selected.path }}</span>
        </div>
        <div class="diff-body">
          <div v-if="loadingDiff" class="note"><Icon name="loader" class="spin" /> 加载中…</div>
          <pre v-else><code><span
            v-for="(l, i) in diffLines"
            :key="i"
            class="dl"
            :class="l.type"
          >{{ l.text || ' ' }}
</span></code></pre>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.panel {
  width: 360px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  background: var(--bg-elev);
  display: flex;
  flex-direction: column;
  height: 100%;
}
@media (max-width: 900px) {
  .panel {
    position: fixed;
    inset: 0;
    width: 100%;
    z-index: 70;
  }
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-soft);
}
.ttl {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 600;
}
.ttl :deep(.icon-svg) {
  color: var(--accent);
}
.branch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-faint);
  font-family: var(--mono);
}
.branch :deep(.icon-svg) {
  width: 12px;
  height: 12px;
  color: var(--text-faint);
}
.hactions {
  display: flex;
  gap: 2px;
}
.note {
  padding: 22px 16px;
  color: var(--text-faint);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}
.files {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.file {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  text-align: left;
  width: 100%;
}
.file:hover {
  background: var(--bg-hover);
}
.badge {
  width: 18px;
  height: 18px;
  border: 1px solid;
  border-radius: 5px;
  display: grid;
  place-items: center;
  font-size: 10.5px;
  font-weight: 700;
  font-family: var(--mono);
  flex-shrink: 0;
}
.fname {
  font-size: 13px;
  white-space: nowrap;
}
.fdir {
  font-size: 11px;
  color: var(--text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  direction: rtl;
  text-align: left;
}
.diff-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.diff-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-soft);
}
.dfile {
  font-family: var(--mono);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diff-body {
  flex: 1;
  overflow: auto;
}
.diff-body pre {
  margin: 0;
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.55;
}
.dl {
  display: block;
  padding: 0 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
.dl.add {
  background: rgba(108, 194, 143, 0.12);
  color: #9bdcb5;
}
.dl.del {
  background: rgba(224, 108, 108, 0.12);
  color: #eaa0a0;
}
.dl.hunk {
  color: var(--blue);
  background: rgba(106, 166, 217, 0.08);
}
.dl.file {
  color: var(--text-dim);
}
.dl.meta {
  color: var(--text-faint);
}
.dl.ctx {
  color: var(--text-dim);
}
</style>
