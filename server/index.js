// claude-web server: REST API + WebSocket bridge to the Claude Agent SDK.
import http from 'node:http';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';

import {
  resolvePort,
  ROOT,
  isConfigured,
  verifyPassword,
  issueToken,
  readConfig,
  getSettings,
  updateSettings,
  TOKEN_MAX_AGE,
} from './config.js';
import { requireAuth, authenticateUpgrade, COOKIE_NAME } from './auth.js';
import { listSessions, loadSession, deleteSession, renameSession, forkSession } from './sessions.js';
import { listDirectory, isDirectory, homeDir, searchFiles, suggestedRoots } from './files.js';
import { status as gitStatus, diff as gitDiff } from './git.js';
import { ClaudeSession } from './claude.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '32mb' })); // headroom for inline image uploads

// CLI: `--port 9000` or `--port=9000`
function cliPort() {
  const i = process.argv.indexOf('--port');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith('--port='));
  return eq ? eq.split('=')[1] : undefined;
}
const PORT = resolvePort(cliPort());

// ---------------------------------------------------------------- Auth routes
app.get('/api/status', (req, res) => {
  res.json({ configured: isConfigured() });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!isConfigured()) return res.status(409).json({ error: 'not_configured' });
  if (!password || !verifyPassword(username, password)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  const cfg = readConfig();
  const token = issueToken(cfg.username);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: TOKEN_MAX_AGE * 1000,
  });
  res.json({ token, user: cfg.username });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ------------------------------------------------------------- Session routes
app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const dir = req.query.dir || undefined;
    res.json({ sessions: await listSessions({ dir }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    const dir = req.query.dir || undefined;
    res.json({ messages: await loadSession(req.params.id, { dir }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    await deleteSession(req.params.id, req.query.dir || undefined);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { title } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    await renameSession(req.params.id, title, req.query.dir || undefined);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions/:id/fork', requireAuth, async (req, res) => {
  try {
    const { dir, upToMessageId, title } = req.body || {};
    const sessionId = await forkSession(req.params.id, { dir, upToMessageId, title });
    res.json({ sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------- Filesystem picker
app.get('/api/fs', requireAuth, async (req, res) => {
  try {
    const showHidden = req.query.all === '1' || req.query.all === 'true';
    res.json(await listDirectory(req.query.dir || undefined, { showHidden }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/fs/home', requireAuth, async (req, res) => {
  const cfg = readConfig() || {};
  res.json({ home: homeDir(), roots: await suggestedRoots(cfg.roots) });
});

app.post('/api/fs/validate', requireAuth, async (req, res) => {
  const { dir } = req.body || {};
  res.json({ valid: dir ? await isDirectory(dir) : false });
});

// ------------------------------------------------------------------- Git diff
app.get('/api/git/status', requireAuth, async (req, res) => {
  try {
    if (!req.query.cwd) return res.status(400).json({ error: 'cwd required' });
    res.json(await gitStatus(req.query.cwd));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/git/diff', requireAuth, async (req, res) => {
  try {
    if (!req.query.cwd) return res.status(400).json({ error: 'cwd required' });
    const out = await gitDiff(req.query.cwd, req.query.path || undefined, {
      staged: req.query.staged === '1' || req.query.staged === 'true',
    });
    res.json({ diff: out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------- Settings
app.get('/api/settings', requireAuth, (req, res) => {
  res.json(getSettings());
});

app.patch('/api/settings', requireAuth, (req, res) => {
  try {
    const cfg = updateSettings(req.body || {});
    res.json({ ok: true, port: cfg.port, roots: cfg.roots });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Restart the server process (e.g. after a port change). Spawns a fresh,
// detached copy of itself and exits — works without an external supervisor.
app.post('/api/restart', requireAuth, (req, res) => {
  const newPort = resolvePort(); // re-read config (port may have just changed)
  res.json({ ok: true, port: newPort });
  // Under a process manager (pm2 / launchd / systemd) the supervisor will
  // respawn us on exit — just exit, otherwise we'd spawn a *second* detached
  // instance and fight over the port. Standalone: self-respawn detached.
  const managed = process.env.pm_id !== undefined || !!process.env.CLAUDE_WEB_MANAGED;
  setTimeout(() => {
    if (!managed) {
      try {
        const child = spawn(process.execPath, [join(__dirname, 'index.js')], {
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, CLAUDE_WEB_PORT: '' }, // let config.json decide
          cwd: ROOT,
        });
        child.unref();
      } catch (e) {
        console.error('restart spawn failed', e);
      }
    }
    process.exit(0);
  }, 300);
});

// ------------------------------------------------------- File search (@ refs)
app.get('/api/fs/search', requireAuth, async (req, res) => {
  try {
    if (!req.query.cwd) return res.status(400).json({ error: 'cwd required' });
    const files = await searchFiles(req.query.cwd, req.query.q || '', 30);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------- Serve built frontend
const webDist = join(ROOT, 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(join(webDist, 'index.html'));
  });
}

// --------------------------------------------------------------- HTTP + WS
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const user = authenticateUpgrade(req);
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  /** @type {ClaudeSession | null} */
  let session = null;
  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case 'init': {
        if (session) session.stop();
        session = new ClaudeSession({
          cwd: msg.cwd,
          model: msg.model,
          resume: msg.resume,
          permissionMode: msg.permissionMode,
          send,
        }).start();
        break;
      }
      case 'user':
        if (!session) return send({ type: 'error', message: 'No active session.' });
        session.sendUserMessage(msg.text, msg.images || [], msg.files || []);
        break;
      case 'permission':
        session?.resolvePermission(msg.id, msg.behavior, {
          updatedInput: msg.updatedInput,
          remember: msg.remember,
        });
        break;
      case 'set_model':
        session?.setModel(msg.model);
        break;
      case 'set_permission_mode':
        session?.setPermissionMode(msg.mode);
        break;
      case 'interrupt':
        session?.interrupt();
        break;
      case 'get_usage':
        session?.getUsage();
        break;
      case 'rewind':
        session?.rewind(msg.userIndex, msg.mode);
        break;
      case 'undo_rewind':
        session?.undoRewind();
        break;
      default:
        break;
    }
  });

  ws.on('close', () => session?.stop());
  ws.on('error', () => session?.stop());
});

server.listen(PORT, () => {
  const where = existsSync(webDist) ? '' : ' (frontend not built — run `npm run build`, or use `npm run dev`)';
  console.log(`\n  claude-web listening on http://localhost:${PORT}${where}`);
  if (!isConfigured()) {
    console.log('  ⚠ No account configured. Run:  npm run setup\n');
  } else {
    console.log('');
  }
});
