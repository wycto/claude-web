<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { state, bootstrap, refreshSessions, closeSidebar, togglePalette, closePalette } from './lib/store';
import LoginView from './components/LoginView.vue';
import Sidebar from './components/Sidebar.vue';
import ChatView from './components/ChatView.vue';
import ToastHost from './components/ToastHost.vue';
import CommandPalette from './components/CommandPalette.vue';

function onGlobalKey(e: KeyboardEvent) {
  // ⌘K / Ctrl-K toggles the command palette (only once logged in).
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    if (!state.user) return;
    e.preventDefault();
    togglePalette();
  } else if (e.key === 'Escape' && state.paletteOpen) {
    closePalette();
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onGlobalKey);
  await bootstrap();
  if (state.user) refreshSessions();
});
onUnmounted(() => window.removeEventListener('keydown', onGlobalKey));
</script>

<template>
  <ToastHost />
  <div v-if="!state.authChecked" class="boot">
    <div class="boot-logo">✦</div>
  </div>

  <LoginView v-else-if="!state.user" />

  <div v-else class="layout" :class="{ 'drawer-open': state.sidebarOpen }" :style="{ '--sidebar-width': state.sidebarWidth + 'px' }">
    <Sidebar />
    <div class="backdrop" @click="closeSidebar"></div>
    <ChatView />
  </div>

  <CommandPalette v-if="state.user && state.paletteOpen" />
</template>

<style scoped>
.layout {
  display: flex;
  height: 100%;
  overflow: hidden;
  position: relative;
}
.backdrop {
  display: none;
}
@media (max-width: 900px) {
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 55;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
  }
  .layout.drawer-open .backdrop {
    opacity: 1;
    pointer-events: auto;
  }
}
.boot {
  height: 100%;
  display: grid;
  place-items: center;
}
.boot-logo {
  font-size: 38px;
  color: var(--accent);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 0.4;
    transform: scale(0.95);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}
</style>
