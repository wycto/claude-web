<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { state, newChat, toggleSidebar } from '../lib/store';
import Icon from './Icon.vue';
import TabBar from './TabBar.vue';
import TopBar from './TopBar.vue';
import MessageList from './MessageList.vue';
import Composer from './Composer.vue';
import PermissionDialog from './PermissionDialog.vue';
import ChangesPanel from './ChangesPanel.vue';
import DirectoryPicker from './DirectoryPicker.vue';

const pickerOpen = ref(false);
function onPick(cwd: string) {
  pickerOpen.value = false;
  newChat(cwd);
}

// The command palette's "新建会话" opens the directory picker via this event.
function openPicker() {
  pickerOpen.value = true;
}
onMounted(() => window.addEventListener('cw-open-picker', openPicker));
onUnmounted(() => window.removeEventListener('cw-open-picker', openPicker));
</script>

<template>
  <main class="chat">
    <div class="col">
      <TabBar v-if="state.tabs.length" @add="pickerOpen = true" />

      <div v-if="state.active" class="body">
        <div class="center" :key="state.active.id">
          <TopBar />
          <MessageList />
          <PermissionDialog />
          <Composer />
        </div>
        <Transition name="slide">
          <ChangesPanel v-if="state.showChanges" />
        </Transition>
      </div>

      <div v-else class="welcome">
        <button class="welcome-menu" title="菜单" @click="toggleSidebar"><Icon name="menu" /></button>
        <div class="hero">
          <div class="mark">✦</div>
          <h1>欢迎使用 Claude Web</h1>
          <p>从左侧选择历史会话，或点击「新建会话」选择一个工作目录开始。</p>
          <ul class="features">
            <li><span>🗂️</span> 会话管理 · 多标签并行 · 跨设备恢复</li>
            <li><span>🧠</span> 随时切换模型与权限模式</li>
            <li><span>📁</span> 选择任意工作目录 · @ 引用文件</li>
            <li><span>📝</span> 实时查看文件变更与 diff</li>
          </ul>
          <button class="btn primary start" @click="pickerOpen = true">
            开始新会话
          </button>
        </div>
      </div>
    </div>

    <DirectoryPicker v-if="pickerOpen" @close="pickerOpen = false" @pick="onPick" />
  </main>
</template>

<style scoped>
.chat {
  flex: 1;
  display: flex;
  min-width: 0;
  height: 100%;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
}
.welcome {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 40px;
  position: relative;
}
.welcome-menu {
  display: none;
  position: absolute;
  top: 12px;
  left: 12px;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  place-items: center;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text-dim);
}
@media (max-width: 900px) {
  .welcome-menu {
    display: grid;
  }
  .welcome {
    padding: 24px 18px;
  }
}
.hero {
  text-align: center;
  max-width: 440px;
}
.mark {
  width: 64px;
  height: 64px;
  margin: 0 auto 18px;
  display: grid;
  place-items: center;
  font-size: 32px;
  color: #1a120d;
  background: linear-gradient(135deg, var(--accent), #e8a06f);
  border-radius: 18px;
  box-shadow: var(--shadow);
}
.hero h1 {
  margin: 0 0 10px;
  font-size: 24px;
}
.hero p {
  color: var(--text-dim);
  margin: 0 0 24px;
}
.features {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  display: grid;
  gap: 10px;
  text-align: left;
}
.features li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-elev);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  font-size: 13.5px;
}
.features span {
  font-size: 18px;
}
.start {
  padding: 11px 22px;
}
.slide-enter-active,
.slide-leave-active {
  transition: all 0.22s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
