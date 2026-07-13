<script setup lang="ts">
import { computed, ref } from 'vue';
import { state, setModel } from '../lib/store';
import Icon from './Icon.vue';

const open = ref(false);
const current = computed(() =>
  state.models.find((m) => m.value === state.active?.model)
);

function pick(value: string) {
  open.value = false;
  setModel(value);
}

function close() {
  open.value = false;
}
</script>

<template>
  <div class="model-picker" v-click-outside="close">
    <button class="btn trigger" @click="open = !open">
      <Icon name="cpu" />
      <span>{{ current?.displayName || state.active?.model || '模型' }}</span>
      <Icon name="chevronDown" class="caret" />
    </button>

    <Transition name="pop">
      <div v-if="open" class="menu">
        <button
          v-for="m in state.models"
          :key="m.value"
          class="opt"
          :class="{ active: m.value === state.active?.model }"
          @click="pick(m.value)"
        >
          <div class="opt-main">
            <span class="name">{{ m.displayName }}</span>
            <span class="desc">{{ m.description }}</span>
          </div>
          <Icon v-if="m.value === state.active?.model" name="check" class="tick" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.model-picker {
  position: relative;
}
.trigger {
  font-weight: 500;
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
.menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 260px;
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
  gap: 10px;
  width: 100%;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  text-align: left;
}
.opt:hover {
  background: var(--bg-hover);
}
.opt.active {
  background: var(--accent-soft);
}
.opt-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.name {
  font-size: 13.5px;
  font-weight: 500;
}
.desc {
  font-size: 11.5px;
  color: var(--text-faint);
}
.tick {
  color: var(--accent);
}
</style>
