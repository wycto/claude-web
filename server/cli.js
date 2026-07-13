#!/usr/bin/env node
// Entry point for the global `claude-web` command.
//   claude-web            启动服务（端口取自 config.json，可加 --port）
//   claude-web setup      设置/修改登录账号与端口
//   claude-web --port N   指定端口启动
const cmd = process.argv[2];
if (cmd === 'setup') {
  await import('./setup.js');
} else {
  await import('./index.js');
}
