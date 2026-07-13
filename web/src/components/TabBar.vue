<script setup lang="ts">
import { state, switchTab, closeTab, toggleSidebar } from '../lib/store';
import Icon from './Icon.vue';

defineEmits<{ add: [] }>();
</script>

<template>
  <div class="tabbar">
    <button class="menu-btn" title="菜单" @click="toggleSidebar"><Icon name="menu" /></button>
    <div class="tabs">
      <div
        v-for="t in state.tabs"
        :key="t.id"
        class="tab"
        :class="{ active: state.active?.id === t.id }"
        @click="switchTab(t.id)"
        @mousedown.middle.prevent="closeTab(t.id)"
      >
        <span v-if="t.running" class="ind run"></span>
        <span v-else class="ind" :class="{ on: t.connected }"></span>
        <span class="label">{{ t.title }}</span>
        <button class="close" title="关闭" @click.stop="closeTab(t.id)">
          <Icon name="x" />
        </button>
      </div>
    </div>
    <button class="add" title="新建会话" @click="$emit('add')"><Icon name="plus" /></button>
  </div>
</template>

<style scoped>
.tabbar {
  display: flex;
  align-items: stretch;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 0 6px;
  height: 40px;
  flex-shrink: 0;
}
.menu-btn {
  display: none;
  align-self: center;
  width: 34px;
  height: 30px;
  border-radius: 8px;
  place-items: center;
  color: var(--text-dim);
  margin-right: 2px;
}
.menu-btn:hover {
  background: var(--bg-elev);
  color: var(--text);
}
@media (max-width: 900px) {
  .menu-btn {
    display: grid;
  }
}
.tabs {
  display: flex;
  gap: 3px;
  overflow-x: auto;
  align-items: center;
  flex: 1;
}
.tabs::-webkit-scrollbar {
  height: 0;
}
.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 12px;
  height: 30px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text-dim);
  max-width: 200px;
  border: 1px solid transparent;
  transition: background 0.13s;
}
.tab:hover {
  background: var(--bg-elev);
}
.tab.active {
  background: var(--bg-elev-2);
  color: var(--text);
  border-color: var(--border);
}
.ind {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-faint);
  flex-shrink: 0;
}
.ind.on {
  background: var(--green);
}
.ind.run {
  background: var(--accent);
  animation: ind-pulse 1s ease-in-out infinite;
}
@keyframes ind-pulse {
  50% {
    opacity: 0.3;
  }
}
.label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.close {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  opacity: 0;
  flex-shrink: 0;
}
.tab:hover .close,
.tab.active .close {
  opacity: 0.6;
}
.close:hover {
  opacity: 1;
  background: var(--bg-hover);
}
.close :deep(.icon-svg) {
  width: 13px;
  height: 13px;
}
.add {
  display: grid;
  place-items: center;
  width: 32px;
  align-self: center;
  height: 30px;
  border-radius: 8px;
  color: var(--text-dim);
}
.add:hover {
  background: var(--bg-elev);
  color: var(--text);
}
</style>
