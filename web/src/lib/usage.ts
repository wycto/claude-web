// 用量额度展示用的纯工具函数（顶栏胶囊 / status 卡片共用）。

// 利用率 0-100 取整并夹紧。
export function pct(u: number): number {
  return Math.max(0, Math.min(100, Math.round(u)));
}

// 利用率分级：>80 危险，>=60 警示，否则正常。
export function usageLevel(u: number): 'ok' | 'warn' | 'danger' {
  return u > 80 ? 'danger' : u >= 60 ? 'warn' : 'ok';
}

// ISO8601 重置时间 → 相对中文文案；已过期 / 空 / 非法时间返回空串。
export function fmtReset(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} 分钟后重置`;
  const hours = mins / 60;
  if (hours < 24) return `${hours.toFixed(1)} 小时后重置`;
  return `${Math.round(hours / 24)} 天后重置`;
}
