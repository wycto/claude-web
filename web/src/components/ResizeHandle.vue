<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  minWidth?: number;
  maxWidth?: number;
}>();

const emit = defineEmits<{
  resize: [width: number];
}>();

const isDragging = ref(false);
const startX = ref(0);
const startWidth = ref(0);

const MIN_WIDTH = props.minWidth ?? 200;
const MAX_WIDTH = props.maxWidth ?? 500;

function onPointerDown(e: PointerEvent) {
  isDragging.value = true;
  startX.value = e.clientX;
  startWidth.value = (e.target as HTMLElement).parentElement?.offsetWidth ?? 320;
  
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return;
  
  const delta = e.clientX - startX.value;
  let newWidth = startWidth.value + delta;
  
  // Clamp to min/max
  newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
  
  emit('resize', newWidth);
}

function onPointerUp() {
  isDragging.value = false;
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}
</script>

<template>
  <div 
    class="resize-handle"
    :class="{ dragging: isDragging }"
    @pointerdown="onPointerDown"
  />
</template>

<style scoped>
.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s ease;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.resize-handle::after {
  content: '';
  position: absolute;
  inset: 0;
  width: 4px;
  background: var(--border);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.resize-handle:hover::after,
.resize-handle.dragging::after {
  opacity: 1;
}

.resize-handle:hover,
.resize-handle.dragging {
  background: var(--accent-soft);
}
</style>
