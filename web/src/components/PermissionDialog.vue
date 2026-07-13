<script setup lang="ts">
import { computed } from 'vue';
import { state, respondPermission } from '../lib/store';
import Icon from './Icon.vue';

const current = computed(() => state.active?.permissions[0] || null);
const queueLen = computed(() => state.active?.permissions.length || 0);

const summary = computed(() => {
  const p = current.value;
  if (!p) return '';
  const i = p.input || {};
  switch (p.toolName) {
    case 'Bash':
      return String(i.command ?? '');
    case 'Read':
    case 'Edit':
    case 'Write':
      return String(i.file_path ?? '');
    default:
      try {
        return JSON.stringify(i);
      } catch {
        return '';
      }
  }
});
</script>

<template>
  <Transition name="pop">
    <div v-if="current" class="perm">
      <div class="head">
        <div class="icon"><Icon name="shield" /></div>
        <div>
          <div class="title">请求权限 · {{ current.toolName }}</div>
          <div class="sub">Claude 想要执行以下操作</div>
        </div>
        <span v-if="queueLen > 1" class="queue">
          +{{ queueLen - 1 }}
        </span>
      </div>

      <pre class="detail">{{ summary }}</pre>

      <div class="actions">
        <button class="btn danger" @click="respondPermission(current.id, 'deny')">
          <Icon name="x" /> 拒绝
        </button>
        <button
          v-if="current.suggestions?.length"
          class="btn"
          @click="respondPermission(current.id, 'allow', true)"
        >
          <Icon name="check" /> 允许并记住
        </button>
        <button class="btn primary" @click="respondPermission(current.id, 'allow')">
          <Icon name="check" /> 允许
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.perm {
  margin: 0 auto 12px;
  max-width: var(--content-max);
  width: calc(100% - 48px);
  background: var(--bg-elev-2);
  border: 1px solid var(--accent-ring);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 14px 16px;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--accent-soft);
  display: grid;
  place-items: center;
}
.icon :deep(.icon-svg) {
  color: var(--accent);
}
.title {
  font-size: 13.5px;
  font-weight: 600;
}
.sub {
  font-size: 11.5px;
  color: var(--text-faint);
}
.queue {
  margin-left: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 11px;
  color: var(--text-dim);
}
.detail {
  margin: 11px 0;
  background: var(--bg);
  border: 1px solid var(--border-soft);
  border-radius: 7px;
  padding: 10px 12px;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.5;
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
