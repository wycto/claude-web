import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

// Apply persisted theme before mount to avoid a flash.
document.documentElement.dataset.theme = localStorage.getItem('cw-theme') || 'dark';

const app = createApp(App);

// Autofocus directive (used by inline rename/compose inputs).
app.directive('focus', {
  mounted(el: HTMLElement) {
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  },
});

// Click-outside directive for dropdowns/popovers.
type COEl = HTMLElement & { __co__?: (e: MouseEvent) => void };
app.directive('click-outside', {
  mounted(el: COEl, binding) {
    el.__co__ = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) binding.value?.(e);
    };
    setTimeout(() => document.addEventListener('mousedown', el.__co__!), 0);
  },
  unmounted(el: COEl) {
    if (el.__co__) document.removeEventListener('mousedown', el.__co__);
  },
});

app.mount('#app');
