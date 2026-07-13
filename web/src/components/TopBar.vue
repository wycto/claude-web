<script setup lang="ts">
import { computed, ref } from 'vue';
import { state, setPermissionMode, requestUsage } from '../lib/store';
import { pct, usageLevel, fmtReset } from '../lib/usage';
import Icon from './Icon.vue';
import ModelPicker from './ModelPicker.vue';

const MODES = [
  { value: 'default', label: '默认', desc: '危险操作时询问' },
  { value: 'acceptEdits', label: '自动编辑', desc: '自动接受文件修改' },
  { value: 'plan', label: '计划模式', desc: '只规划不执行' },
  { value: 'bypassPermissions', label: '跳过权限', desc: '不再询问（谨慎）' },
];

const modeOpen = ref(false);
const currentMode = computed(
  () => MODES.find((m) => m.value === state.active?.permissionMode) || MODES[0]
);

function pickMode(v: string) {
  modeOpen.value = false;
  setPermissionMode(v);
}

const changedCount = computed(() => state.active?.git?.files.length || 0);

const cost = computed(() => state.active?.totalCost || 0);
const costLabel = computed(() =>
  cost.value >= 0.01 ? `$${cost.value.toFixed(2)}` : `$${cost.value.toFixed(4)}`
);

function shortPath(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts.length <= 3 ? p : '…/' + parts.slice(-3).join('/');
}

const usageOpen = ref(false);
const usage = computed(() => state.active?.usage || null);
const mainWindows = computed(() =>
  (usage.value?.windows || []).filter((w) => w.key === 'five_hour' || w.key === 'seven_day')
);
const showCapsule = computed(
  () => !!usage.value?.available && !!usage.value?.rateLimitsAvailable && mainWindows.value.length > 0
);
function shortLabel(key: string): string {
  return key === 'five_hour' ? '5h' : key === 'seven_day' ? '7d' : key;
}
function toggleUsage() {
  usageOpen.value = !usageOpen.value;
  if (usageOpen.value) requestUsage();
}
</script>

<template>
  <header class="topbar">
    <div class="left">
      <div class="title">{{ state.active?.title || '会话' }}</div>
      <div class="cwd" :title="state.active?.cwd">
        <Icon name="folder" /> {{ shortPath(state.active?.cwd || '') }}
      </div>
      <span v-if="state.active?.connected" class="dot ok" title="已连接"></span>
      <span v-else class="dot off" title="连接中…"></span>
      <span v-if="cost > 0" class="cost" title="本会话累计花费">{{ costLabel }}</span>
      <div v-if="showCapsule" class="usage" v-click-outside="() => (usageOpen = false)">
        <button class="usage-cap" @click="toggleUsage" title="订阅用量额度">
          <span v-for="w in mainWindows" :key="w.key" class="seg" :class="usageLevel(w.utilization)">
            {{ shortLabel(w.key) }} {{ pct(w.utilization) }}%
          </span>
          <Icon name="chevronDown" class="caret" />
        </button>
        <Transition name="pop">
          <div v-if="usageOpen" class="usage-pop">
            <div class="up-head">
              用量额度<span v-if="usage?.subscriptionType">（{{ usage.subscriptionType }}）</span>
              <span v-if="cost > 0" class="up-cost">{{ costLabel }}</span>
            </div>
            <div v-for="w in usage?.windows || []" :key="w.key" class="up-row">
              <span class="up-label">{{ w.label }}</span>
              <span class="up-bar"><span :class="usageLevel(w.utilization)" :style="{ width: pct(w.utilization) + '%' }"></span></span>
              <span class="up-pct">{{ pct(w.utilization) }}%</span>
              <span class="up-reset">{{ fmtReset(w.resetsAt) }}</span>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <div class="right">
      <ModelPicker />

      <div class="mode" v-click-outside="() => (modeOpen = false)">
        <button class="btn trigger" @click="modeOpen = !modeOpen">
          <Icon name="shield" />
          <span>{{ currentMode.label }}</span>
          <Icon name="chevronDown" class="caret" />
        </button>
        <Transition name="pop">
          <div v-if="modeOpen" class="menu">
            <button
              v-for="m in MODES"
              :key="m.value"
              class="opt"
              :class="{ active: m.value === currentMode.value }"
              @click="pickMode(m.value)"
            >
              <div>
                <div class="name">{{ m.label }}</div>
                <div class="desc">{{ m.desc }}</div>
              </div>
              <Icon v-if="m.value === currentMode.value" name="check" class="tick" />
            </button>
          </div>
        </Transition>
      </div>

      <button
        class="btn"
        :class="{ on: state.showChanges }"
        @click="state.showChanges = !state.showChanges"
      >
        <Icon name="diff" />
        <span>变更</span>
        <span v-if="changedCount" class="badge">{{ changedCount }}</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elev);
  gap: 12px;
}
.left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.title {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}
.cwd {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-faint);
  font-family: var(--mono);
}
.cwd :deep(.icon-svg) {
  width: 13px;
  height: 13px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.ok {
  background: var(--green);
  box-shadow: 0 0 8px var(--green);
}
.dot.off {
  background: var(--text-faint);
}
.cost {
  font-size: 11.5px;
  font-family: var(--mono);
  color: var(--text-faint);
  padding: 2px 8px;
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  white-space: nowrap;
}
.usage {
  position: relative;
}
.usage-cap {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-family: var(--mono);
  color: var(--text-faint);
  padding: 2px 8px;
  border: 1px solid var(--border-soft);
  border-radius: 999px;
  white-space: nowrap;
}
.usage-cap:hover {
  background: var(--bg-hover);
}
.usage-cap .seg.warn {
  color: var(--yellow);
}
.usage-cap .seg.danger {
  color: var(--accent);
}
.usage-cap .caret {
  width: 12px !important;
  height: 12px !important;
  opacity: 0.6;
}
.usage-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 280px;
  max-width: calc(100vw - 36px);
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 12px;
  z-index: 40;
}
.up-head {
  font-size: 12px;
  color: var(--text-faint);
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
}
.up-cost {
  font-family: var(--mono);
}
.up-row {
  display: grid;
  grid-template-columns: 84px 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  margin: 6px 0;
}
.up-row .up-reset {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--text-faint);
  margin-top: -2px;
}
.up-label {
  color: var(--text-faint);
}
.up-bar {
  height: 6px;
  background: var(--border-soft);
  border-radius: 999px;
  overflow: hidden;
}
.up-bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--green);
}
.up-bar span.warn {
  background: var(--yellow);
}
.up-bar span.danger {
  background: var(--accent);
}
.up-pct {
  font-family: var(--mono);
}
@media (max-width: 760px) {
  .cost,
  .usage {
    display: none;
  }
}
.right {
  display: flex;
  align-items: center;
  gap: 9px;
}
.trigger :deep(.icon-svg) {
  width: 15px;
  height: 15px;
}
.caret {
  opacity: 0.6;
  width: 13px !important;
  height: 13px !important;
}
.mode {
  position: relative;
}
.menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 220px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 6px;
  z-index: 40;
}
.opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 11px;
  border-radius: var(--radius-sm);
  text-align: left;
}
.opt:hover {
  background: var(--bg-hover);
}
.opt.active {
  background: var(--accent-soft);
}
.name {
  font-size: 13px;
  font-weight: 500;
}
.desc {
  font-size: 11px;
  color: var(--text-faint);
}
.tick {
  color: var(--accent);
}
.btn.on {
  background: var(--accent-soft);
  border-color: rgba(217, 119, 87, 0.35);
  color: var(--text);
}
.badge {
  background: var(--accent);
  color: #1a120d;
  font-size: 10.5px;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}
@media (max-width: 760px) {
  .topbar {
    padding: 9px 12px;
    gap: 8px;
  }
  .cwd {
    display: none;
  }
  .title {
    max-width: 38vw;
    font-size: 13px;
  }
  .right {
    gap: 6px;
  }
  /* icon-only buttons: hide text labels & carets, keep the changes badge */
  .right .btn span:not(.badge) {
    display: none;
  }
  .right .caret {
    display: none;
  }
  .menu .trigger,
  .btn {
    padding: 8px;
  }
}
</style>
