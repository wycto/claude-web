<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { state, sendMessage, interrupt, toast } from '../lib/store';
import { api } from '../lib/api';
import type { Attachment } from '../lib/types';
import Icon from './Icon.vue';

const ta = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const running = computed(() => state.active?.running);
const attachments = ref<Attachment[]>([]);
const dragging = ref(false);

// Draft is stored per-tab so switching tabs keeps your half-written message.
const text = computed({
  get: () => state.active?.draft || '',
  set: (v: string) => {
    if (state.active) state.active.draft = v;
  },
});

// ---------------- autocomplete popup (mentions + slash commands) -----------
interface PopItem {
  primary: string;
  secondary?: string;
  insert: string;
}
const pop = ref<{ kind: 'mention' | 'slash'; items: PopItem[]; index: number } | null>(null);
let searchToken = 0;

async function detectPopup() {
  const el = ta.value;
  if (!el || !state.active) return (pop.value = null);
  const caret = el.selectionStart;
  const before = text.value.slice(0, caret);

  // Slash command: only when it's the very first token of the message.
  const slash = before.match(/^\/(\S*)$/);
  if (slash) {
    const q = slash[1].toLowerCase();
    const items = (state.active.slashCommands as any[])
      .map((c: any) => (typeof c === 'string' ? { name: c, description: '' } : c))
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((c) => ({ primary: '/' + c.name, secondary: c.description, insert: '/' + c.name + ' ' }));
    pop.value = items.length ? { kind: 'slash', items, index: 0 } : null;
    return;
  }

  // @ mention: token right before caret.
  const at = before.match(/(?:^|\s)@([^\s@]*)$/);
  if (at) {
    const q = at[1];
    const token = ++searchToken;
    try {
      const { files } = await api.fsSearch(state.active.cwd, q);
      if (token !== searchToken) return;
      const items = files.map((f) => ({ primary: f.name, secondary: f.path, insert: f.path }));
      pop.value = items.length ? { kind: 'mention', items, index: 0 } : null;
    } catch {
      pop.value = null;
    }
    return;
  }
  pop.value = null;
}

function applyPopup(item: PopItem) {
  const el = ta.value;
  if (!el) return;
  const caret = el.selectionStart;
  const before = text.value.slice(0, caret);
  const after = text.value.slice(caret);
  let newBefore = before;
  if (pop.value?.kind === 'slash') {
    newBefore = item.insert;
  } else {
    // replace the trailing @token with "@path "
    newBefore = before.replace(/@([^\s@]*)$/, '@' + item.insert + ' ');
  }
  text.value = newBefore + after;
  pop.value = null;
  nextTick(() => {
    el.focus();
    el.selectionStart = el.selectionEnd = newBefore.length;
    autosize();
  });
}

// ---------------- attachments --------------------------------------------
function pickFiles() {
  fileInput.value?.click();
}
function onFileInput(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (files) addFiles(files);
  (e.target as HTMLInputElement).value = '';
}

async function addFiles(files: FileList | File[]) {
  for (const f of Array.from(files)) {
    if (f.type.startsWith('image/')) {
      const data = await readAsBase64(f);
      attachments.value.push({ name: f.name, kind: 'image', mediaType: f.type, data });
    } else if (f.size <= 512 * 1024) {
      const txt = await f.text();
      attachments.value.push({ name: f.name, kind: 'file', text: txt });
    } else {
      toast(`"${f.name}" 过大（>512KB），已跳过`, 'error');
    }
  }
}

function readAsBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}

function removeAttachment(i: number) {
  attachments.value.splice(i, 1);
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  const imgs: File[] = [];
  for (const it of items) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) imgs.push(f);
    }
  }
  if (imgs.length) {
    e.preventDefault();
    addFiles(imgs);
  }
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
}

// ---------------- send ----------------------------------------------------
async function autosize() {
  await nextTick();
  const el = ta.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 220) + 'px';
}

function submit() {
  const t = text.value.trim();
  if ((!t && !attachments.value.length) || running.value) return;
  sendMessage(t, attachments.value);
  text.value = '';
  attachments.value = [];
  pop.value = null;
  autosize();
}

function onKey(e: KeyboardEvent) {
  if (pop.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      pop.value.index = (pop.value.index + 1) % pop.value.items.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      pop.value.index = (pop.value.index - 1 + pop.value.items.length) % pop.value.items.length;
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applyPopup(pop.value.items[pop.value.index]);
      return;
    }
    if (e.key === 'Escape') {
      pop.value = null;
      return;
    }
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit();
  }
}

function onInput() {
  autosize();
  detectPopup();
}

// Focus the composer when something refills it (e.g. "编辑并重发" on a message).
function focusComposer() {
  nextTick(() => {
    const el = ta.value;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.selectionStart = el.selectionEnd = end;
    autosize();
  });
}
onMounted(() => window.addEventListener('cw-focus-composer', focusComposer));
onUnmounted(() => window.removeEventListener('cw-focus-composer', focusComposer));
</script>

<template>
  <div class="composer">
    <div
      class="box"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <!-- autocomplete popup -->
      <Transition name="pop">
        <div v-if="pop" class="autocomplete">
          <button
            v-for="(it, i) in pop.items"
            :key="it.insert + i"
            class="ac-item"
            :class="{ active: i === pop.index }"
            @mousedown.prevent="applyPopup(it)"
            @mouseenter="pop.index = i"
          >
            <Icon :name="pop.kind === 'slash' ? 'sparkle' : 'file'" />
            <span class="ac-primary">{{ it.primary }}</span>
            <span v-if="it.secondary" class="ac-secondary">{{ it.secondary }}</span>
          </button>
        </div>
      </Transition>

      <!-- attachment chips -->
      <div v-if="attachments.length" class="attachments">
        <div v-for="(a, i) in attachments" :key="i" class="att">
          <img v-if="a.kind === 'image'" :src="`data:${a.mediaType};base64,${a.data}`" />
          <Icon v-else name="file" />
          <span class="att-name">{{ a.name }}</span>
          <button class="att-x" @click="removeAttachment(i)"><Icon name="x" /></button>
        </div>
      </div>

      <div class="input-row">
        <button class="attach-btn" title="添加图片 / 文件" @click="pickFiles">
          <Icon name="plus" />
        </button>
        <textarea
          ref="ta"
          v-model="text"
          rows="1"
          placeholder="给 Claude 发消息…  ( @ 引用文件，/ 命令，Enter 发送 )"
          @input="onInput"
          @keydown="onKey"
          @paste="onPaste"
          @click="detectPopup"
        ></textarea>
        <button v-if="running" class="send stop" title="停止" @click="interrupt">
          <Icon name="stop" />
        </button>
        <button v-else class="send" :disabled="!text.trim() && !attachments.length" title="发送" @click="submit">
          <Icon name="send" />
        </button>
      </div>
    </div>
    <input ref="fileInput" type="file" multiple hidden @change="onFileInput" />
    <div class="hint">Claude 可能会执行命令、读写文件 —— 注意权限提示。</div>
  </div>
</template>

<style scoped>
.composer {
  padding: 12px 24px 18px;
  max-width: var(--content-max);
  margin: 0 auto;
  width: 100%;
}
@media (max-width: 640px) {
  .composer {
    padding: 8px 12px 12px;
  }
  .hint {
    display: none;
  }
}
.box {
  position: relative;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.box:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.box.dragging {
  border-color: var(--accent);
  border-style: dashed;
  background: var(--accent-soft);
}
.input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
textarea {
  flex: 1;
  background: none;
  border: none;
  resize: none;
  font-size: 14px;
  line-height: 1.55;
  padding: 7px 0;
  max-height: 220px;
}
textarea:focus {
  outline: none;
}
.attach-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--text-dim);
  flex-shrink: 0;
}
.attach-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.send {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: #1a120d;
  flex-shrink: 0;
  transition: all 0.15s;
}
.send:hover:not(:disabled) {
  background: var(--accent-hover);
}
.send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.send.stop {
  background: var(--bg-elev-2);
  color: var(--red);
  border: 1px solid var(--border);
}
.send :deep(.icon-svg) {
  width: 17px;
  height: 17px;
}
.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 4px 10px;
}
.att {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 5px 9px 5px 5px;
  font-size: 12px;
  max-width: 200px;
}
.att img {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: 5px;
}
.att :deep(.icon-svg) {
  width: 16px;
  height: 16px;
  color: var(--text-dim);
}
.att-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.att-x {
  display: grid;
  place-items: center;
}
.att-x :deep(.icon-svg) {
  width: 13px;
  height: 13px;
  opacity: 0.6;
}
.att-x:hover :deep(.icon-svg) {
  opacity: 1;
  color: var(--red);
}
.autocomplete {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  max-height: 260px;
  overflow-y: auto;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 6px;
  z-index: 50;
}
.ac-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 11px;
  border-radius: var(--radius-sm);
  text-align: left;
}
.ac-item.active {
  background: var(--accent-soft);
}
.ac-item :deep(.icon-svg) {
  width: 15px;
  height: 15px;
  color: var(--accent);
  flex-shrink: 0;
}
.ac-primary {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}
.ac-secondary {
  font-size: 11.5px;
  color: var(--text-faint);
  font-family: var(--mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: right;
}
.hint {
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
  margin-top: 8px;
}
</style>
