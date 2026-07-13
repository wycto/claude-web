<script setup lang="ts">
import { ref } from 'vue';
import { login, state, refreshSessions } from '../lib/store';
import Icon from './Icon.vue';

const username = ref('admin');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  if (busy.value) return;
  error.value = '';
  busy.value = true;
  try {
    await login(username.value, password.value);
    refreshSessions();
  } catch (e: any) {
    error.value =
      e?.status === 401 ? '用户名或密码错误' : e?.message || '登录失败';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login">
    <div class="aurora"></div>
    <form class="card" @submit.prevent="submit">
      <div class="brand">
        <div class="mark">✦</div>
        <div>
          <h1>Claude Web</h1>
          <p>在浏览器中驾驭 Claude Code</p>
        </div>
      </div>

      <label class="field">
        <span>用户名</span>
        <input v-model="username" autocomplete="username" placeholder="admin" />
      </label>

      <label class="field">
        <span>密码</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="••••••••"
          @keyup.enter="submit"
        />
      </label>

      <p v-if="!state.configured" class="hint warn">
        尚未配置账号，请在服务器运行 <code>npm run setup</code>
      </p>
      <p v-if="error" class="hint err">{{ error }}</p>

      <button class="btn primary submit" :disabled="busy || !password">
        <Icon v-if="busy" name="loader" class="spin" />
        <span>{{ busy ? '登录中…' : '登 录' }}</span>
      </button>
    </form>
  </div>
</template>

<style scoped>
.login {
  height: 100%;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
}
.aurora {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(60% 50% at 20% 20%, rgba(217, 119, 87, 0.16), transparent 70%),
    radial-gradient(50% 50% at 85% 80%, rgba(176, 139, 217, 0.12), transparent 70%);
  filter: blur(20px);
}
.card {
  position: relative;
  width: 360px;
  padding: 32px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 6px;
}
.mark {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  font-size: 24px;
  color: #1a120d;
  background: linear-gradient(135deg, var(--accent), #e8a06f);
  border-radius: 13px;
  box-shadow: var(--shadow-soft);
}
.brand h1 {
  margin: 0;
  font-size: 19px;
}
.brand p {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--text-faint);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field span {
  font-size: 12px;
  color: var(--text-dim);
}
.field input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 11px 13px;
  font-size: 14px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.submit {
  justify-content: center;
  padding: 12px;
  margin-top: 4px;
  font-size: 14px;
}
.hint {
  font-size: 12px;
  margin: 0;
}
.hint.warn {
  color: var(--yellow);
}
.hint.err {
  color: var(--red);
}
.hint code {
  font-family: var(--mono);
  background: var(--bg);
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
