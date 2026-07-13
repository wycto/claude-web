<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../lib/api';
import { toast } from '../lib/store';
import Icon from './Icon.vue';

const emit = defineEmits<{ close: [] }>();

const port = ref<number>(8787);
const roots = ref<string[]>([]);
const newRoot = ref('');
const portOverridden = ref(false);
const loading = ref(true);
const saving = ref(false);
const restarting = ref(false);
const countdown = ref(0);

onMounted(async () => {
  try {
    const s = await api.getSettings();
    port.value = s.port;
    roots.value = s.roots;
    portOverridden.value = s.portOverridden;
  } catch (e: any) {
    toast(e.message || '加载设置失败', 'error');
  } finally {
    loading.value = false;
  }
});

function addRoot() {
  const r = newRoot.value.trim();
  if (r && !roots.value.includes(r)) roots.value.push(r);
  newRoot.value = '';
}
function removeRoot(i: number) {
  roots.value.splice(i, 1);
}

async function save() {
  saving.value = true;
  try {
    await api.updateSettings({ port: port.value, roots: roots.value });
    toast('设置已保存', 'info');
  } catch (e: any) {
    toast(e.message || '保存失败', 'error');
  } finally {
    saving.value = false;
  }
}

async function saveAndRestart() {
  saving.value = true;
  try {
    await api.updateSettings({ port: port.value, roots: roots.value });
  } catch (e: any) {
    saving.value = false;
    toast(e.message || '保存失败', 'error');
    return;
  }
  saving.value = false;
  if (!confirm(`将以端口 ${port.value} 重启服务，期间会短暂断开。确定继续？`)) return;

  restarting.value = true;
  let target = '';
  try {
    const r = await api.restart();
    target = `${location.protocol}//${location.hostname}:${r.port}`;
  } catch {
    target = `${location.protocol}//${location.hostname}:${port.value}`;
  }
  // Give the new process a few seconds to come up, then jump to it.
  countdown.value = 5;
  const timer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      clearInterval(timer);
      location.href = target;
    }
  }, 1000);
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <Transition name="pop" appear>
      <div class="modal">
        <header>
          <h3><Icon name="settings" /> 设置</h3>
          <button class="btn icon ghost" @click="emit('close')"><Icon name="x" /></button>
        </header>

        <div v-if="loading" class="loading"><Icon name="loader" class="spin" /> 加载中…</div>

        <div v-else class="content">
          <section>
            <label class="lbl">服务端口</label>
            <div class="port-row">
              <input v-model.number="port" type="number" min="1" max="65535" />
              <span class="cur">当前运行端口由地址栏显示</span>
            </div>
            <p v-if="portOverridden" class="warn">
              ⚠ 当前由环境变量 <code>CLAUDE_WEB_PORT</code> 指定端口，重启后将改用此处配置。
            </p>
            <p class="tip">修改端口需点击「保存并重启」后生效，页面会自动跳转到新端口。</p>
          </section>

          <section>
            <label class="lbl">工作目录快捷入口</label>
            <p class="tip">新建会话时目录选择器顶部展示的快捷路径。</p>
            <div class="roots">
              <div v-for="(r, i) in roots" :key="i" class="root">
                <Icon name="home" />
                <span>{{ r }}</span>
                <button class="btn icon ghost" @click="removeRoot(i)"><Icon name="x" /></button>
              </div>
            </div>
            <div class="add-root">
              <input v-model="newRoot" placeholder="添加目录绝对路径" @keyup.enter="addRoot" />
              <button class="btn" @click="addRoot"><Icon name="plus" /> 添加</button>
            </div>
          </section>
        </div>

        <footer v-if="!loading">
          <button class="btn" :disabled="saving" @click="save">
            <Icon name="check" /> 保存
          </button>
          <button class="btn primary" :disabled="saving || restarting" @click="saveAndRestart">
            <Icon name="power" /> 保存并重启
          </button>
        </footer>

        <div v-if="restarting" class="restart-overlay">
          <Icon name="loader" class="spin big" />
          <p>正在重启服务…</p>
          <p v-if="countdown > 0" class="cd">{{ countdown }} 秒后跳转到新地址</p>
        </div>
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
  z-index: 200;
}
.modal {
  position: relative;
  width: 520px;
  max-width: 92vw;
  max-height: 86vh;
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
.loading {
  padding: 40px;
  display: flex;
  justify-content: center;
  gap: 8px;
  color: var(--text-faint);
}
.content {
  padding: 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.lbl {
  font-size: 13px;
  font-weight: 600;
  display: block;
  margin-bottom: 6px;
}
.tip {
  font-size: 12px;
  color: var(--text-faint);
  margin: 0 0 10px;
}
.warn {
  font-size: 12px;
  color: var(--yellow);
  margin: 8px 0;
}
.warn code,
.tip code {
  font-family: var(--mono);
  background: var(--bg);
  padding: 1px 5px;
  border-radius: 4px;
}
.port-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.port-row input {
  width: 120px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 9px 12px;
  font-size: 14px;
  font-family: var(--mono);
}
.port-row input:focus {
  outline: none;
  border-color: var(--accent);
}
.cur {
  font-size: 11.5px;
  color: var(--text-faint);
}
.roots {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.root {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--bg);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  padding: 7px 8px 7px 11px;
  font-family: var(--mono);
  font-size: 12.5px;
}
.root span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.root :deep(.icon-svg) {
  color: var(--text-faint);
  width: 14px;
  height: 14px;
}
.add-root {
  display: flex;
  gap: 8px;
}
.add-root input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 9px 12px;
  font-family: var(--mono);
  font-size: 12.5px;
}
.add-root input:focus {
  outline: none;
  border-color: var(--accent);
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--border-soft);
}
.restart-overlay {
  position: absolute;
  inset: 0;
  background: rgba(26, 24, 21, 0.92);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.restart-overlay .big {
  width: 34px;
  height: 34px;
  color: var(--accent);
}
.restart-overlay p {
  margin: 0;
}
.cd {
  font-size: 12.5px;
  color: var(--text-faint);
}
</style>
