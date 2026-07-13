<script setup lang="ts">
import { state } from '../lib/store';
import Icon from './Icon.vue';
</script>

<template>
  <div class="toast-host">
    <TransitionGroup name="toast">
      <div v-for="t in state.toasts" :key="t.id" class="toast" :class="t.kind">
        <Icon :name="t.kind === 'error' ? 'alert' : 'message'" />
        <span>{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 15px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  max-width: 360px;
  font-size: 13px;
}
.toast.error {
  border-color: rgba(224, 108, 108, 0.5);
}
.toast.error :deep(.icon-svg) {
  color: var(--red);
}
.toast.info :deep(.icon-svg) {
  color: var(--accent);
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
