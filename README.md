# Claude Web

在浏览器里使用 **Claude Code** —— 会话管理、模型切换、工作目录选择、实时变更/diff 查看，方便你从家里任意一台电脑访问主力开发机继续工作。类似 *opencode web*，但直接驱动你本机已登录的 Claude Code。

底层通过 **Claude Agent SDK**（`@anthropic-ai/claude-agent-sdk`）驱动，会话与 `claude` CLI 完全互通：网页里建的会话能用 CLI 继续，反之亦然（都存在 `~/.claude/projects/`）。


<img width="4666" height="2452" alt="login" src="https://github.com/user-attachments/assets/ebc896a2-b347-4670-82bc-549a8f8fe9e6" />



<img width="4678" height="2466" alt="index" src="https://github.com/user-attachments/assets/8b4e6bf1-11be-4cdc-afc7-d0ba1366c168" />





## ✨ 功能

- **会话管理** —— 新建 / 恢复 / 重命名 / 删除；列表持久化，跨设备恢复历史
- **多标签并行** —— 顶部标签页同时开多个会话并行跑，互不打断（每个标签独立连接、独立草稿）
- **模型切换** —— 运行中随时在 Opus / Sonnet / Haiku 间切换
- **工作目录选择** —— 图形化浏览服务器文件夹，选定任意目录作为 `cwd`
- **变更记录 / Diff** —— 侧栏实时显示当前目录 git 改动，点开看彩色 diff
- **图片 / 文件上传** —— 拖拽、粘贴或点击上传：图片走多模态，文本文件内联为引用
- **@ 引用文件** —— 输入 `@` 弹出当前目录文件搜索，快速插入路径
- **Slash 命令** —— 输入 `/` 补全会话可用的 slash 命令
- **命令面板（⌘K / Ctrl-K）** —— 一键搜索并跳转会话、切换模型 / 权限模式 / 主题、显隐变更面板
- **代码高亮 + 一键复制** —— 回复中的代码块语法高亮（随明暗主题自适应），悬浮即可复制
- **消息操作** —— 悬浮消息可复制；自己的消息可「编辑并重发」（回填到输入框）
- **任务清单** —— TodoWrite 以复选清单形式展示进度（待办 / 进行中 / 已完成）
- **工具内联 Diff** —— Edit / Write / MultiEdit 展开后以增删着色的 diff 呈现改动
- **消息回退 / 撤销回退** —— 在任意消息上「回退」，把 Claude 改动的文件与对话一并退回到该消息之前；底部「撤销回退」可还原（发送新消息后失效）
- **会话分叉** —— 一键把会话复制成新分支，安全地尝试不同方向而不影响原会话
- **过载自愈** —— 遇到 Anthropic 过载（529）时显示「正在重试」，失败后保活会话，可直接重发
- **会话花费** —— 顶栏实时显示本会话累计花费
- **权限审批** —— 网页里弹窗确认 Claude 的工具调用（可“允许并记住”），也支持自动编辑 / 计划 / 跳过权限模式
- **流式输出** —— 打字机式实时回复，含思考过程、工具调用与结果、本轮耗时与花费
- **设置面板** —— 网页内修改端口、工作目录快捷入口，**一键保存并重启**（自动跳转新端口）
- **账号密码登录** —— HMAC token + httpOnly cookie，适合在家庭局域网安全访问

## 🚀 快速开始

前置：本机已安装并登录 `claude`（Claude Code CLI），Node ≥ 20。

```bash
# 1. 安装依赖（含前端）
npm install
npm --prefix web install

# 2. 设置登录账号（交互式，或用环境变量）
npm run setup
#   或: CLAUDE_WEB_USER=admin CLAUDE_WEB_PASSWORD=你的密码 npm run setup

# 3. 构建前端
npm run build

# 4. 启动
npm start
#   -> http://localhost:8787
```

从别的电脑访问，把 `localhost` 换成这台机器的局域网 IP（如 `http://192.168.1.10:8787`）。

### 开发模式（热更新）

```bash
npm run dev
# 前端 http://localhost:11602 （已自动代理 /api 与 /ws 到 dev 后端 8788）
```

## ⚙️ 端口配置

端口可用四种方式设置，优先级从高到低：

1. **命令行参数**：`npm start -- --port 9000`（或 `node server/index.js --port=9000`）
2. **环境变量**：`CLAUDE_WEB_PORT=9000 npm start`
3. **配置文件**：`data/config.json` 的 `port` 字段（由设置面板或 `npm run setup` 写入）
4. **默认**：`8787`

> 网页「设置」面板可直接改端口并**一键重启**，重启后页面会自动跳到新端口。

## ⚙️ 其他配置（环境变量）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `CLAUDE_WEB_PORT` | `8787` | 服务端口（也可用 `--port` 或配置文件） |
| `CLAUDE_WEB_DATA` | 见下 | 账号配置存放目录（含 `config.json`） |
| `CLAUDE_WEB_TOKEN_TTL` | `2592000` | 登录 token 有效期（秒，默认 30 天） |
| `CLAUDE_WEB_USER` / `CLAUDE_WEB_PASSWORD` | — | 供 `setup` 非交互设置账号 |

账号信息（scrypt 哈希密码 + token 密钥）存放位置按优先级：`CLAUDE_WEB_DATA` 环境变量 → 源码目录下的 `./data`（从源码运行时）→ `~/.claude-web`（全局安装/新机器部署时）。

## 🚢 部署 / 在其他电脑使用

> claude-web 要跑在**装了 `claude` CLI、有你工作目录**的那台机器上（它驱动本机 Claude、读写本机文件）。其他电脑通过它的 IP 访问。

### 方式一：全局命令安装（推荐，做成"成品"）

任意一台装了 Node ≥ 20、`claude` CLI、且能访问你 GitLab 的电脑：

```bash
# 从 GitLab 直接安装为全局命令（安装时自动构建前端）
npm install -g git+ssh://git@gitlab.wycto.cc/wycto/claude-web.git

claude-web setup          # 设置账号密码 + 端口（存到 ~/.claude-web）
claude-web                # 启动；或 claude-web --port 11622
```

更新到最新：重新跑一次上面的 `npm install -g git+...` 即可。

也可以**离线分发**：在开发机 `npm pack` 生成 `claude-web-1.0.0.tgz`，拷到目标机后
`npm install -g ./claude-web-1.0.0.tgz`（这种方式目标机无需构建、不下载构建工具）。

### 方式二：pm2 常驻（主力机长期运行 + 开机自启）

```bash
npm install -g pm2
npm run build
pm2 start ecosystem.config.cjs && pm2 save
pm2 startup               # 按提示执行它给的 sudo 命令，实现开机自启
```

之后每次"开发完→上线"一行搞定：

```bash
npm run deploy            # = 构建前端 + pm2 平滑重启 + 保存
```

常用：`pm2 status` / `pm2 logs claude-web` / `pm2 restart claude-web`。

## 🔒 安全说明

- 鉴权用于防止局域网内误触/他人访问；**请勿直接把端口暴露到公网**。若需公网访问，请在前面加 HTTPS 反向代理（Caddy / Nginx）。
- 网页登录后即可让 Claude 在所选目录读写文件、执行命令。默认权限模式会逐项弹窗确认；“跳过权限”模式请谨慎使用。

## 🏗️ 架构

```
server/                Node (ESM) 后端
  index.js             Express REST + WebSocket
  claude.js            封装 Agent SDK query() 流式输入会话 ↔ WebSocket
  sessions.js          会话列表/加载/删除/重命名（复用 SDK）
  files.js  git.js     目录浏览 / git 变更
  auth.js  config.js   账号、token、鉴权
web/                   Vue 3 + Vite + TypeScript 前端
  src/lib/             store（响应式状态）、ws、api、markdown
  src/components/      Sidebar / ChatView / TopBar / MessageList /
                       ToolCard / Composer / DirectoryPicker /
                       ChangesPanel / PermissionDialog ...
```

每个浏览器会话对应后端一个流式输入的 `query()`，通过 WebSocket 双向通信：用户消息、权限响应、模型/模式切换、中断都走同一条连接。
