<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../lib/api';
import { toast } from '../lib/store';
import type { DirListing } from '../lib/types';
import Icon from './Icon.vue';

const emit = defineEmits<{ close: []; pick: [cwd: string] }>();

const listing = ref<DirListing | null>(null);
const roots = ref<string[]>([]);
const loading = ref(false);
const manual = ref('');
const showHidden = ref(false);

async function load(dir?: string) {
  loading.value = true;
  try {
    listing.value = await api.fsList(dir, showHidden.value);
    manual.value = listing.value.path;
  } catch (e: any) {
    toast(e.message || '无法读取目录', 'error');
  } finally {
    loading.value = false;
  }
}

function toggleHidden() {
  showHidden.value = !showHidden.value;
  load(listing.value?.path);
}

function goManual() {
  const dir = manual.value.trim();
  if (dir) load(dir); // load() already surfaces errors via toast
}

function choose() {
  if (listing.value) emit('pick', listing.value.path);
}

onMounted(async () => {
  try {
    const home = await api.fsHome();
    roots.value = home.roots;
    await load(home.home);
  } catch (e: any) {
    toast(e.message || '初始化失败', 'error');
  }
});
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <Transition name="pop" appear>
      <div class="modal">
        <header>
          <h3><Icon name="folder" /> 选择工作目录</h3>
          <div class="head-actions">
            <button
              class="btn"
              :class="{ on: showHidden }"
              title="显示/隐藏 以 . 开头的文件夹"
              @click="toggleHidden"
            >
              {{ showHidden ? '隐藏点文件夹' : '显示隐藏' }}
            </button>
            <button class="btn icon ghost" @click="emit('close')"><Icon name="x" /></button>
          </div>
        </header>

        <div class="pathbar">
          <input
            v-model="manual"
            placeholder="输入或粘贴绝对路径"
            @keyup.enter="goManual"
          />
          <button class="btn" @click="goManual">前往</button>
        </div>

        <div v-if="roots.length" class="roots">
          <button v-for="r in roots" :key="r" class="chip" @click="load(r)">
            <Icon name="folder" /> {{ r }}
          </button>
        </div>

        <div class="browser">
          <div v-if="loading" class="empty"><Icon name="loader" class="spin" /> 读取中…</div>
          <template v-else-if="listing">
            <button
              v-if="listing.parent"
              class="row up"
              @click="load(listing.parent!)"
            >
              <Icon name="chevronRight" style="transform: rotate(180deg)" /> 上级目录
            </button>
            <button
              v-for="d in listing.directories"
              :key="d.path"
              class="row"
              :class="{ dim: d.hidden }"
              @click="load(d.path)"
            >
              <Icon name="folder" />
              <span>{{ d.name }}</span>
              <Icon name="chevronRight" class="arrow" />
            </button>
            <div v-if="!listing.directories.length" class="empty sub">
              此目录下没有可见子文件夹{{ showHidden ? '' : '（可点右上「显示隐藏」查看 . 开头的）' }}
            </div>
          </template>
        </div>

        <footer>
          <div class="current" :title="listing?.path">
            将使用：<code>{{ listing?.path || '…' }}</code>
          </div>
          <button class="btn primary" :disabled="!listing" @click="choose">
            <Icon name="check" /> 在此开始
          </button>
        </footer>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
  display: grid;
  place-items: center;
  z-index: 100;
}
.modal {
  width: 560px;
  max-width: 92vw;
  max-height: 82vh;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-soft);
}
header h3 {
  margin: 0;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 9px;
}
header h3 :deep(.icon-svg) {
  color: var(--accent);
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.head-actions .btn {
  font-size: 12px;
  padding: 6px 10px;
}
.head-actions .btn.on {
  background: var(--accent-soft);
  border-color: rgba(217, 119, 87, 0.35);
  color: var(--text);
}
.pathbar {
  display: flex;
  gap: 8px;
  padding: 14px 18px 8px;
}
.pathbar input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 9px 12px;
  font-family: var(--mono);
  font-size: 12.5px;
}
.pathbar input:focus {
  outline: none;
  border-color: var(--accent);
}
.roots {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 0 18px 8px;
}
.roots .chip {
  cursor: pointer;
  font-family: var(--mono);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.roots .chip:hover {
  border-color: var(--accent);
  color: var(--text);
}
.browser {
  flex: 1;
  overflow-y: auto;
  padding: 6px 12px;
  min-height: 180px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  font-size: 13.5px;
  text-align: left;
}
.row:hover {
  background: var(--bg-hover);
}
.row.dim {
  opacity: 0.55;
}
.row :deep(.icon-svg) {
  color: var(--text-faint);
}
.row.up :deep(.icon-svg),
.row:hover :deep(.folder) {
  color: var(--accent);
}
.row span {
  flex: 1;
}
.arrow {
  opacity: 0;
}
.row:hover .arrow {
  opacity: 0.6;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-faint);
  padding: 26px;
  font-size: 13px;
}
.empty.sub {
  padding: 14px;
}
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-soft);
}
.current {
  font-size: 12px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.current code {
  font-family: var(--mono);
  color: var(--text);
}
</style>
