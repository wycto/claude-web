<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { state, refillComposer, toast, rewind, undoRewind } from '../lib/store';
import type { RewindMode } from '../lib/store';
import { renderMarkdown } from '../lib/markdown';
import type { RenderItem } from '../lib/types';
import { pct, usageLevel, fmtReset } from '../lib/usage';
import Icon from './Icon.vue';
import ToolCard from './ToolCard.vue';

const scroller = ref<HTMLElement | null>(null);
const active = computed(() => state.active);
const showJump = ref(false);

function atBottom(): boolean {
  const el = scroller.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}

let stick = true;
function onScroll() {
  stick = atBottom();
  showJump.value = !stick;
}

// Rewind anchors on a user prompt by ordinal index. From any message, resolve
// the nearest preceding user prompt and its index among all user prompts.
function rewindIndex(item: RenderItem): number | null {
  const items = active.value?.items || [];
  const start = items.indexOf(item);
  if (start < 0) return null;
  let target: RenderItem | null = null;
  for (let i = start; i >= 0; i--) {
    const it = items[i];
    if (it.kind === 'text' && it.role === 'user') {
      target = it;
      break;
    }
  }
  if (!target) return null;
  let n = -1;
  for (const it of items) {
    if (it.kind === 'text' && it.role === 'user') {
      n++;
      if (it === target) return n;
    }
  }
  return null;
}
// The first prompt (index 0) has no prior turn to truncate to, so it can't be rewound.
function canRewind(item: RenderItem): boolean {
  const i = rewindIndex(item);
  return i !== null && i >= 1;
}
// The rewind button opens a small menu so the user can pick what to revert.
const rewindMenu = ref<{ item: RenderItem; x: number; y: number } | null>(null);

function openRewindMenu(item: RenderItem, ev: MouseEvent) {
  if (!canRewind(item)) return toast('该消息无法回退', 'error');
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
  // Clamp so the fixed menu stays on-screen — user-message action bars sit on
  // the right edge, where a left-anchored menu would overflow the viewport.
  const MENU_W = 240;
  const MENU_H = 210;
  const M = 8;
  let x = Math.min(r.left, window.innerWidth - MENU_W - M);
  x = Math.max(M, x);
  let y = r.bottom + 4;
  if (y + MENU_H > window.innerHeight - M) y = Math.max(M, r.top - MENU_H - 4);
  rewindMenu.value = { item, x, y };
}

function chooseRewind(mode: RewindMode) {
  const item = rewindMenu.value?.item;
  rewindMenu.value = null;
  if (!item) return;
  const i = rewindIndex(item);
  if (i === null || i < 1) return toast('该消息无法回退', 'error');
  const desc =
    mode === 'conversation'
      ? '仅撤销其后的对话，文件保持现状'
      : mode === 'files'
      ? '仅把 Claude 改动的文件恢复到该消息发出前，对话保留'
      : '撤销其后的对话，并把改动的文件恢复到该消息发出前';
  if (!confirm(`回退到这条消息？${desc}。`)) return;
  rewind(i, mode);
}

// Copy a message's text to the clipboard.
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制');
  } catch {
    toast('复制失败', 'error');
  }
}

// Delegated handler for the copy buttons injected into rendered code blocks.
function onStreamClick(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('.code-copy') as HTMLElement | null;
  if (!btn) return;
  const code = btn.parentElement?.querySelector('pre code') as HTMLElement | null;
  const text = code?.textContent ?? '';
  navigator.clipboard.writeText(text).then(
    () => {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1200);
    },
    () => toast('复制失败', 'error')
  );
}

async function scrollDown(force = false) {
  if (!force && !stick) return;
  await nextTick();
  const el = scroller.value;
  if (el) el.scrollTop = el.scrollHeight;
}

watch(
  () => [
    active.value?.items.length,
    active.value?.streamingText,
    active.value?.streamingThinking,
  ],
  () => scrollDown()
);

// Force-scroll when switching sessions.
watch(
  () => active.value?.sessionId,
  () => {
    stick = true;
    scrollDown(true);
  }
);

function fmtCost(c: number) {
  return c >= 0.01 ? `$${c.toFixed(2)}` : `$${c.toFixed(4)}`;
}
function fmtDur(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
const collapsedThinking = ref<Record<string, boolean>>({});
</script>

<template>
  <div class="list-wrap">
  <div ref="scroller" class="scroller" @scroll="onScroll" @click="onStreamClick">
    <div class="stream">
      <template v-for="item in active?.items || []" :key="item.key">
        <!-- user / assistant text -->
        <div
          v-if="item.kind === 'text'"
          class="msg"
          :class="item.role"
        >
          <div v-if="item.role === 'assistant'" class="avatar a">✦</div>
          <div class="bubble" :class="item.role">
            <div
              v-if="item.role === 'assistant'"
              class="md"
              v-html="renderMarkdown(item.text)"
            ></div>
            <template v-else>
              <div v-if="item.text" class="user-text">{{ item.text }}</div>
              <div v-if="item.attachments?.length" class="atts">
                <span v-for="(a, i) in item.attachments" :key="i" class="att-chip">
                  <Icon :name="a.kind === 'image' ? 'file' : 'file'" /> {{ a.name }}
                </span>
              </div>
            </template>
            <div v-if="item.text" class="msg-actions" :class="item.role">
              <button class="ma-btn" title="复制" @click="copyText(item.text)">
                <Icon name="copy" />
              </button>
              <button
                v-if="item.role === 'user'"
                class="ma-btn"
                title="编辑并重发"
                @click="refillComposer(item.text)"
              >
                <Icon name="edit" />
              </button>
              <button
                v-if="canRewind(item)"
                class="ma-btn"
                title="回退到此处…"
                @click.stop="openRewindMenu(item, $event)"
              >
                <Icon name="rewind" />
              </button>
            </div>
          </div>
        </div>

        <!-- thinking -->
        <div v-else-if="item.kind === 'thinking'" class="thinking">
          <button
            class="th-head"
            @click="collapsedThinking[item.key] = !collapsedThinking[item.key]"
          >
            <Icon name="brain" />
            <span>思考过程</span>
            <Icon name="chevronRight" class="chev" :class="{ open: !collapsedThinking[item.key] }" />
          </button>
          <div v-if="!collapsedThinking[item.key]" class="th-body md" v-html="renderMarkdown(item.text)"></div>
        </div>

        <!-- tool -->
        <div v-else-if="item.kind === 'tool'" class="tool-wrap">
          <ToolCard :tool="item.tool" />
        </div>

        <!-- status card (local /status command) -->
        <div v-else-if="item.kind === 'status'" class="status-card">
          <div class="st-head"><Icon name="sparkle" /><span>会话状态</span></div>
          <div class="st-grid">
            <span class="st-k">用户</span><span class="st-v">{{ item.user || '—' }}</span>
            <span class="st-k">模型</span><span class="st-v">{{ item.model || '默认' }}</span>
            <span class="st-k">权限模式</span><span class="st-v">{{ item.permissionMode }}</span>
            <span class="st-k">工作目录</span><span class="st-v mono">{{ item.cwd || '—' }}</span>
            <span class="st-k">Git 分支</span><span class="st-v">{{ item.branch || '—' }}</span>
            <span class="st-k">会话 ID</span><span class="st-v mono">{{ item.sessionId || '（未开始）' }}</span>
            <span class="st-k">连接</span>
            <span class="st-v">
              <span class="dot" :class="{ on: item.connected }"></span>
              {{ item.connected ? '已连接' : '未连接' }}
            </span>
            <span class="st-k">消息数</span><span class="st-v">{{ item.messageCount }}</span>
            <span class="st-k">累计花费</span><span class="st-v">{{ fmtCost(item.totalCost) }}</span>
          </div>
          <!-- 用量额度（订阅限额） -->
          <div class="st-usage">
            <template v-if="active?.usage?.available && active.usage.rateLimitsAvailable && active.usage.windows?.length">
              <div class="su-title">
                用量额度<span v-if="active.usage.subscriptionType">（{{ active.usage.subscriptionType }}）</span>
              </div>
              <div v-for="w in active.usage.windows" :key="w.key" class="su-row">
                <span class="su-label">{{ w.label }}</span>
                <span class="su-bar"><span :class="usageLevel(w.utilization)" :style="{ width: pct(w.utilization) + '%' }"></span></span>
                <span class="su-pct">已用 {{ pct(w.utilization) }}%</span>
                <span class="su-reset">{{ fmtReset(w.resetsAt) }}</span>
              </div>
            </template>
            <div v-else-if="active?.usage?.available && active.usage.rateLimitsAvailable === false" class="su-note">
              当前账户无订阅额度数据（API Key 模式）
            </div>
            <div v-else-if="active?.usage && !active.usage.available && active.usage.reason === 'no_session'" class="su-note">
              发送一条消息后可查看额度
            </div>
            <div v-else-if="active?.usage && !active.usage.available" class="su-note">
              暂时无法获取额度数据
            </div>
            <div v-else class="su-note">正在获取额度…</div>
          </div>
        </div>

        <!-- result footer -->
        <div v-else-if="item.kind === 'result'" class="result" :class="{ err: item.isError }">
          <Icon :name="item.isError ? 'alert' : 'sparkle'" />
          <span>{{ item.isError ? '本轮出错' : '完成' }}</span>
          <span class="sep">·</span>
          <span>{{ item.numTurns }} 轮</span>
          <span class="sep">·</span>
          <span>{{ fmtDur(item.durationMs) }}</span>
          <span class="sep">·</span>
          <span>{{ fmtCost(item.cost) }}</span>
        </div>
      </template>

      <!-- live streaming thinking -->
      <div v-if="active?.streamingThinking" class="thinking live">
        <div class="th-head static"><Icon name="brain" /><span>思考中…</span></div>
        <div class="th-body md" v-html="renderMarkdown(active.streamingThinking)"></div>
      </div>

      <!-- live streaming assistant text -->
      <div v-if="active?.streamingText" class="msg assistant">
        <div class="avatar a">✦</div>
        <div class="bubble assistant">
          <div class="md" v-html="renderMarkdown(active.streamingText)"></div>
          <span class="caret"></span>
        </div>
      </div>

      <!-- working indicator -->
      <div
        v-if="active?.running && !active?.streamingText && !active?.streamingThinking"
        class="working"
      >
        <span class="d"></span><span class="d"></span><span class="d"></span>
        <span class="lbl">{{
          active?.status === 'compacting'
            ? '整理上下文…'
            : active?.status === 'retrying'
            ? '服务繁忙，正在重试…'
            : 'Claude 正在思考…'
        }}</span>
      </div>
    </div>
  </div>
    <Transition name="fade">
      <button v-if="showJump" class="jump" title="回到底部" @click="scrollDown(true)">
        <Icon name="chevronDown" />
      </button>
    </Transition>

    <Transition name="fade">
      <div v-if="active?.rewindStash" class="rewind-bar">
        <Icon name="rewind" />
        <span>已回退到此处。发送新消息将无法再撤销。</span>
        <button class="undo-btn" @click="undoRewind">撤销回退</button>
      </div>
    </Transition>

    <!-- Rewind scope chooser -->
    <template v-if="rewindMenu">
      <div class="rw-backdrop" @click="rewindMenu = null"></div>
      <div class="rw-menu" :style="{ left: rewindMenu.x + 'px', top: rewindMenu.y + 'px' }">
        <div class="rw-title">回退到此处</div>
        <button class="rw-opt" @click="chooseRewind('conversation')">
          <Icon name="message" />
          <span><b>只回退对话内容</b><small>撤销其后的对话，文件保持现状</small></span>
        </button>
        <button class="rw-opt" @click="chooseRewind('files')">
          <Icon name="file" />
          <span><b>只回退文件变更</b><small>恢复改动的文件，对话保留</small></span>
        </button>
        <button class="rw-opt" @click="chooseRewind('both')">
          <Icon name="rewind" />
          <span><b>对话和文件都回退</b><small>两者都恢复到该消息发出前</small></span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.list-wrap {
  flex: 1;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.scroller {
  flex: 1;
  overflow-y: auto;
  scroll-behavior: smooth;
}
.jump {
  position: absolute;
  bottom: 18px;
  right: 24px;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  box-shadow: var(--shadow-soft);
  z-index: 5;
}
.jump:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.jump :deep(.icon-svg) {
  width: 18px;
  height: 18px;
}
@media (max-width: 640px) {
  .jump {
    bottom: 12px;
    right: 14px;
  }
}
.rewind-bar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100% - 32px);
  padding: 9px 12px 9px 14px;
  background: var(--bg-elev-2);
  border: 1px solid var(--accent);
  border-radius: 999px;
  box-shadow: var(--shadow);
  font-size: 12.5px;
  color: var(--text-dim);
  z-index: 6;
}
.rewind-bar :deep(.icon-svg) {
  width: 15px;
  height: 15px;
  color: var(--accent);
  flex-shrink: 0;
}
.rewind-bar span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.undo-btn {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--accent);
  color: #1a120d;
  font-size: 12px;
  font-weight: 600;
}
.undo-btn:hover {
  background: var(--accent-hover);
}
.rw-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
}
.rw-menu {
  position: fixed;
  z-index: 81;
  min-width: 230px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 6px;
}
.rw-title {
  font-size: 11px;
  color: var(--text-faint);
  padding: 4px 8px 6px;
}
.rw-opt {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 8px 8px;
  border-radius: var(--radius-sm);
  color: var(--text);
}
.rw-opt:hover {
  background: var(--bg-hover);
}
.rw-opt :deep(.icon-svg) {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  color: var(--text-dim);
  flex-shrink: 0;
}
.rw-opt span {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rw-opt b {
  font-size: 13px;
  font-weight: 600;
}
.rw-opt small {
  font-size: 11px;
  color: var(--text-faint);
}
.stream {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 26px 24px 40px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
@media (max-width: 640px) {
  .stream {
    padding: 16px 14px 32px;
    gap: 14px;
  }
  .tool-wrap,
  .thinking,
  .result,
  .working {
    padding-left: 0;
  }
  .bubble.user {
    max-width: 88%;
  }
  .avatar {
    width: 26px;
    height: 26px;
    font-size: 13px;
  }
}
.msg {
  display: flex;
  gap: 12px;
  /* Reserve room below for the hover action row so it never overlaps the
     bubble or the next message. */
  padding-bottom: 12px;
}
.msg.user {
  justify-content: flex-end;
}
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  font-size: 15px;
}
.avatar.a {
  background: linear-gradient(135deg, var(--accent), #e8a06f);
  color: #1a120d;
}
.bubble {
  border-radius: var(--radius);
  padding: 13px 16px;
  max-width: 100%;
  position: relative;
}
.msg-actions {
  position: absolute;
  top: calc(100% + 2px);
  display: flex;
  gap: 1px;
  opacity: 0.4;
  transition: opacity 0.13s;
  pointer-events: auto;
  z-index: 3;
}
.msg:hover .msg-actions {
  opacity: 1;
}
.msg-actions.assistant {
  left: -4px;
}
.msg-actions.user {
  right: -4px;
}
.ma-btn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 22px;
  border-radius: 6px;
  color: var(--text-faint);
}
.ma-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.ma-btn :deep(.icon-svg) {
  width: 14px;
  height: 14px;
}
.bubble.assistant {
  background: var(--bg-elev);
  border: 1px solid var(--border-soft);
  flex: 1;
  min-width: 0;
}
.bubble.user {
  background: var(--accent-soft);
  border: 1px solid rgba(217, 119, 87, 0.25);
  max-width: 76%;
}
.user-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
}
.atts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.att-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  background: var(--bg);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 3px 8px;
}
.att-chip :deep(.icon-svg) {
  width: 12px;
  height: 12px;
  color: var(--text-dim);
}
.caret {
  display: inline-block;
  width: 7px;
  height: 15px;
  background: var(--accent);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 1s steps(2) infinite;
  border-radius: 1px;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.tool-wrap {
  padding-left: 42px;
}
.thinking {
  padding-left: 42px;
}
.th-head {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--text-faint);
  padding: 4px 0;
}
.th-head :deep(.icon-svg) {
  width: 14px;
  height: 14px;
  color: var(--purple);
}
.th-head.static {
  cursor: default;
}
.chev {
  transition: transform 0.15s;
}
.chev.open {
  transform: rotate(90deg);
}
.th-body {
  margin-top: 4px;
  padding: 10px 14px;
  border-left: 2px solid var(--purple);
  background: rgba(176, 139, 217, 0.06);
  border-radius: 0 8px 8px 0;
  color: var(--text-dim);
  font-size: 13px;
  font-style: italic;
}
.status-card {
  margin-left: 42px;
  background: var(--bg-elev);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  padding: 14px 16px;
  max-width: 460px;
}
.st-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}
.st-head :deep(.icon-svg) {
  width: 15px;
  height: 15px;
  color: var(--accent);
}
.st-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 16px;
  font-size: 13px;
}
.st-k {
  color: var(--text-faint);
  white-space: nowrap;
}
.st-v {
  color: var(--text);
  word-break: break-all;
  display: flex;
  align-items: center;
  gap: 6px;
}
.st-v.mono {
  font-family: var(--mono);
  font-size: 12px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-faint);
  flex-shrink: 0;
}
.dot.on {
  background: #3fb950;
}
.st-usage {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-soft);
}
.su-title {
  font-size: 12px;
  color: var(--text-faint);
  margin-bottom: 8px;
}
.su-row {
  display: grid;
  grid-template-columns: 84px 1fr auto auto;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  margin: 5px 0;
}
.su-label {
  color: var(--text-faint);
}
.su-bar {
  height: 6px;
  background: var(--border-soft);
  border-radius: 999px;
  overflow: hidden;
}
.su-bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--green);
}
.su-bar span.warn {
  background: var(--yellow);
}
.su-bar span.danger {
  background: var(--accent);
}
.su-pct {
  font-family: var(--mono);
  white-space: nowrap;
}
.su-reset {
  color: var(--text-faint);
  white-space: nowrap;
}
.su-note {
  font-size: 12px;
  color: var(--text-faint);
}
@media (max-width: 640px) {
  .status-card {
    margin-left: 0;
  }
}
.result {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: var(--text-faint);
  padding-left: 42px;
}
.result :deep(.icon-svg) {
  width: 13px;
  height: 13px;
  color: var(--accent);
}
.result.err :deep(.icon-svg) {
  color: var(--red);
}
.sep {
  opacity: 0.5;
}
.working {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 42px;
  color: var(--text-faint);
  font-size: 13px;
}
.working .d {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: bob 1.2s infinite ease-in-out;
}
.working .d:nth-child(2) {
  animation-delay: 0.18s;
}
.working .d:nth-child(3) {
  animation-delay: 0.36s;
}
.working .lbl {
  margin-left: 6px;
}
@keyframes bob {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  30% {
    transform: translateY(-5px);
    opacity: 1;
  }
}
</style>
