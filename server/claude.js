// Wraps one live Claude Agent SDK query in streaming-input mode and bridges it
// to a WebSocket connection. One ClaudeSession == one browser chat tab.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { query, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';

// Detect Anthropic "overloaded" (HTTP 529) / transient capacity errors.
function isOverloadedError(err) {
  const msg = `${err?.message || err || ''}`.toLowerCase();
  return (
    err?.status === 529 ||
    err?.error?.type === 'overloaded_error' ||
    msg.includes('overloaded') ||
    msg.includes('529')
  );
}

// An async-iterable queue we feed user turns into while the query runs.
function createInputQueue() {
  const queue = [];
  let resolveNext = null;
  let closed = false;
  return {
    push(msg) {
      if (closed) return;
      if (resolveNext) {
        resolveNext({ value: msg, done: false });
        resolveNext = null;
      } else {
        queue.push(msg);
      }
    },
    close() {
      closed = true;
      if (resolveNext) {
        resolveNext({ value: undefined, done: true });
        resolveNext = null;
      }
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
          if (closed) return Promise.resolve({ value: undefined, done: true });
          return new Promise((res) => {
            resolveNext = res;
          });
        },
      };
    },
  };
}

export class ClaudeSession {
  constructor({ cwd, model, resume, permissionMode, send }) {
    this.cwd = cwd;
    this.model = model;
    this.resume = resume || undefined;
    this.resumeAt = undefined; // resumeSessionAt anchor (set during rewind)
    this.permissionMode = permissionMode || 'default';
    this.send = send; // (obj) => void  — push JSON to the client
    this.input = createInputQueue();
    this.query = null;
    this.sessionId = resume || null;
    this.pendingPermissions = new Map(); // id -> resolve fn
    this.stopped = false;
    this.undo = null; // { undoFiles, prevTurnIndex } for "undo rewind"
    // Self-managed file checkpoints (the SDK's own checkpointing proved
    // unreliable across CLI versions). turnBackups[g] = Map<absPath, Buffer|null>
    // of each file's content *before* its first edit during the turn with global
    // prompt ordinal g. `turnIndex` is the global ordinal of the latest turn.
    this.turnIndex = -1;
    this.turnBackups = [];
    // For resumed sessions, seed turnIndex from the existing prompt count so our
    // global ordinals line up with the client's (which counts history too).
    this._baseSet = !this.resume;
  }

  start() {
    this._startQuery();
    return this;
  }

  // Build options and (re)create the underlying query. Called on start and on
  // every rewind/undo (which restart with a different resumeSessionAt anchor).
  _startQuery() {
    this.input = createInputQueue();
    const options = {
      cwd: this.cwd,
      includePartialMessages: true,
      settingSources: ['user', 'project', 'local'],
      permissionMode: this.permissionMode,
      // Safety gate required by the SDK so the user can actually switch to
      // `bypassPermissions` ("跳过权限") at runtime. Without this, that mode is
      // ignored and canUseTool keeps prompting. It only takes effect while the
      // active permissionMode is `bypassPermissions`.
      allowDangerouslySkipPermissions: true,
      canUseTool: (toolName, input, { suggestions, signal } = {}) =>
        this._requestPermission(toolName, input, suggestions, signal),
      // Snapshot files before they're edited (fires in every permission mode),
      // so rewind can restore them. This is our own checkpointing.
      hooks: {
        PreToolUse: [{ hooks: [(input) => this._preToolSnapshot(input)] }],
      },
      stderr: (data) => {
        const text = String(data || '').trim();
        if (text) this.send({ type: 'stderr', text });
      },
    };
    if (this.model) options.model = this.model;
    if (this.resume) options.resume = this.resume;
    if (this.resumeAt) options.resumeSessionAt = this.resumeAt;

    this.query = query({ prompt: this.input, options });
    this._consume(this.query);
    // In streaming-input mode the subprocess only emits its `init` frame after
    // the first user turn is queued. Force initialization eagerly so the client
    // gets models + readiness up front (otherwise we'd deadlock waiting on each
    // other).
    this._sendReady();
  }

  // Tear down the active query (without ending the session) and start a fresh
  // one — used by rewind/undo to apply a new resumeSessionAt anchor.
  async _restart() {
    // The new query can't answer prompts raised by the old one; clear them so
    // the client dialogs are dismissed rather than left dead.
    this._clearPendingPermissions('Session restarted.', true);
    const old = this.query;
    try {
      await old?.interrupt();
    } catch {
      /* ignore */
    }
    try {
      this.input?.close();
    } catch {
      /* ignore */
    }
    this._startQuery();
  }

  async _consume(q) {
    try {
      for await (const msg of q) {
        if (this.stopped || this.query !== q) break;
        // Capture the canonical session id from the init frame (arrives once
        // the first turn runs; for new chats this is when we learn the id).
        if (msg.type === 'system' && msg.subtype === 'init') {
          if (this.sessionId !== msg.session_id) {
            this.sessionId = msg.session_id;
            this.send({ type: 'session', sessionId: this.sessionId, cwd: msg.cwd });
          }
        }
        this.send({ type: 'message', message: msg });
        // A turn finishes with a `result` message (streaming-input mode keeps
        // the query iterator open, so the synthetic `done` below only fires at
        // teardown). Refresh usage after each completed turn.
        if (msg.type === 'result') void this.getUsage();
      }
      this.send({ type: 'done' });
    } catch (err) {
      // Don't surface errors from a query we've already superseded (rewind/undo
      // interrupt the old query, which then throws as it unwinds).
      if (this.stopped || this.query !== q) return;
      const overloaded = isOverloadedError(err);
      this.send({
        type: 'error',
        message: overloaded
          ? 'Anthropic 服务繁忙（overloaded），请稍后重试。可在顶栏切换到更轻量的模型降低概率。'
          : err?.message || String(err),
        overloaded,
      });
      // Keep the session alive so the user can resend without reconnecting:
      // a thrown error ends this query iterator, so restart (resuming context).
      if (!this.stopped) {
        this.resume = this.sessionId || this.resume;
        this.resumeAt = undefined;
        try {
          await this._restart();
        } catch {
          /* ignore */
        }
      }
    }
  }

  async _sendReady() {
    let models = [];
    let model = this.model;
    let commands = [];
    try {
      const init = await this.query.initializationResult();
      model = init?.model || model;
      models = await this.query.supportedModels();
      const cmds = await this.query.supportedCommands();
      commands = (cmds || []).map((c) => ({
        name: c.name,
        description: c.description || '',
      }));
    } catch {
      /* not fatal — client falls back to a built-in model list */
    }
    // Seed the turn ordinal from existing history once (resumed sessions), so
    // file-checkpoint indices match the client's prompt ordinals.
    if (!this._baseSet) {
      this._baseSet = true;
      try {
        const msgs = await getSessionMessages(this.sessionId, this.cwd ? { dir: this.cwd } : {});
        this.turnIndex = msgs.filter((m) => ClaudeSession._isPrompt(m)).length - 1;
      } catch {
        /* leave at -1 */
      }
    }
    if (this.stopped) return;
    this.send({
      type: 'ready',
      sessionId: this.sessionId,
      cwd: this.cwd,
      model,
      permissionMode: this.permissionMode,
      models,
      commands,
    });
  }

  _requestPermission(toolName, input, suggestions, signal) {
    return new Promise((resolve) => {
      const id = randomUUID();
      const entry = { resolve, suggestions, input };
      // The SDK aborts a permission request when the tool call is no longer
      // valid (turn interrupted, query torn down, etc). Honour it so the
      // client dialog doesn't linger as a zombie that does nothing on click.
      if (signal) {
        const onAbort = () => {
          if (!this.pendingPermissions.delete(id)) return;
          this.send({ type: 'permission_cancel', id });
          resolve({ behavior: 'deny', message: 'Aborted.' });
        };
        entry.signal = signal;
        entry.onAbort = onAbort;
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      }
      this.pendingPermissions.set(id, entry);
      this.send({ type: 'permission_request', id, toolName, input, suggestions });
    });
  }

  resolvePermission(id, behavior, { updatedInput, remember } = {}) {
    const pending = this.pendingPermissions.get(id);
    if (!pending) return;
    this.pendingPermissions.delete(id);
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener('abort', pending.onAbort);
    }
    if (behavior === 'allow') {
      // The SDK validates the result with a Zod union; `updatedInput: undefined`
      // fails it ("invalid_union") and the tool is reported as a permission
      // failure. Echo back the original tool input so allow actually runs it.
      const result = { behavior: 'allow', updatedInput: updatedInput || pending.input || {} };
      if (remember && pending.suggestions?.length) result.updatedPermissions = pending.suggestions;
      pending.resolve(result);
    } else {
      pending.resolve({ behavior: 'deny', message: 'Denied by user.' });
    }
  }

  // Resolve all dangling permission prompts as denials (a torn-down query can no
  // longer consume them). When `notify`, tell the client to dismiss the dialogs
  // so the user isn't left clicking a prompt that maps to a dead tool call.
  _clearPendingPermissions(message, notify) {
    for (const [id, p] of this.pendingPermissions) {
      if (p.signal && p.onAbort) p.signal.removeEventListener('abort', p.onAbort);
      p.resolve({ behavior: 'deny', message });
      if (notify) this.send({ type: 'permission_cancel', id });
    }
    this.pendingPermissions.clear();
  }

  // ---------------------------------------------------------------- Rewind
  // Resolve the absolute path of a file reported by rewindFiles (paths may be
  // absolute or relative to the working directory).
  _absPath(p) {
    return isAbsolute(p) ? p : join(this.cwd, p);
  }

  // Snapshot the current on-disk content of files that a rewind is about to
  // change, so "undo rewind" can restore the forward state exactly. `null`
  // marks a file that does not currently exist (so undo re-deletes it).
  async _snapshotFiles(paths) {
    const map = new Map();
    for (const p of paths || []) {
      const abs = this._absPath(p);
      try {
        map.set(abs, await readFile(abs));
      } catch {
        map.set(abs, null);
      }
    }
    return map;
  }

  async _restoreFiles(map) {
    if (!map) return;
    for (const [abs, buf] of map) {
      try {
        if (buf === null) {
          await rm(abs, { force: true });
        } else {
          await mkdir(dirname(abs), { recursive: true });
          await writeFile(abs, buf);
        }
      } catch (err) {
        this.send({ type: 'stderr', text: `restore ${abs}: ${err?.message || err}` });
      }
    }
  }

  // PreToolUse hook: before an edit tool runs, record the affected files' current
  // content under the active turn (first touch only), building our checkpoint.
  async _preToolSnapshot(input) {
    try {
      const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
      if (EDIT_TOOLS.has(input?.tool_name)) {
        const ti = input.tool_input || {};
        const paths = [ti.file_path, ti.notebook_path].filter(Boolean);
        for (const p of paths) await this._captureForTurn(p);
      }
    } catch {
      /* never block a tool on snapshot failure */
    }
    return { continue: true };
  }

  async _captureForTurn(p) {
    if (this.turnIndex < 0) return;
    const abs = this._absPath(p);
    let map = this.turnBackups[this.turnIndex];
    if (!map) map = this.turnBackups[this.turnIndex] = new Map();
    if (map.has(abs)) return; // keep the earliest (pre-turn) content
    try {
      map.set(abs, await readFile(abs));
    } catch {
      map.set(abs, null); // file didn't exist before this turn
    }
  }

  // Files to restore to reach the state at the START of turn `n`: the earliest
  // recorded backup (for turns >= n) of each touched file.
  _filesToRestoreFrom(n) {
    const restore = new Map();
    for (let t = n; t <= this.turnIndex; t++) {
      const map = this.turnBackups[t];
      if (!map) continue;
      for (const [abs, buf] of map) if (!restore.has(abs)) restore.set(abs, buf);
    }
    return restore;
  }

  // Is this transcript user message a real prompt (not a tool_result carrier)?
  // Mirrors the client's ingest filter so ordinals line up between the two.
  static _isPrompt(m) {
    if (m.type !== 'user') return false;
    const c = m.message?.content;
    if (typeof c === 'string') return c.trim().length > 0;
    if (Array.isArray(c)) {
      if (c.some((b) => b?.type === 'tool_result')) return false;
      return c.some((b) => b?.type === 'text' && b.text?.trim()) || c.some((b) => b?.type === 'image');
    }
    return false;
  }

  // Rewind to before the Nth user prompt: restore the files Claude changed and
  // truncate the conversation (model context) to the previous turn. We anchor by
  // ordinal index because the live wire uuids differ from the persisted ones
  // that file checkpoints are keyed by.
  // `mode` controls what gets reverted:
  //   'both'         — conversation + files (default)
  //   'conversation' — truncate the conversation only, leave files on disk
  //   'files'        — restore the files only, keep the conversation intact
  async rewind(userIndex, mode = 'both') {
    const wantConvo = mode === 'both' || mode === 'conversation';
    const wantFiles = mode === 'both' || mode === 'files';
    if (!this.query || !this.sessionId) {
      return this.send({ type: 'rewind_error', message: '无活动会话' });
    }
    let resumeAt = null;
    try {
      const msgs = await getSessionMessages(this.sessionId, this.cwd ? { dir: this.cwd } : {});
      const promptIdxs = [];
      msgs.forEach((m, i) => {
        if (ClaudeSession._isPrompt(m)) promptIdxs.push(i);
      });
      if (userIndex < 0 || userIndex >= promptIdxs.length) {
        return this.send({ type: 'rewind_error', message: '找不到该消息' });
      }
      const fullIdx = promptIdxs[userIndex];
      // Truncate the conversation at the assistant message ending the prior turn.
      for (let i = fullIdx - 1; i >= 0; i--) {
        if (msgs[i].type === 'assistant') {
          resumeAt = msgs[i].uuid;
          break;
        }
      }
    } catch (err) {
      return this.send({ type: 'rewind_error', message: err?.message || String(err) });
    }
    if (wantConvo && !resumeAt) {
      return this.send({ type: 'rewind_error', message: '已是最早的对话，无法再回退' });
    }

    // Restore files to the state at the start of this turn, snapshotting the
    // current (forward) content first so the rewind can be undone.
    let filesChanged = [];
    let undoFiles = null;
    let fileNote = null;
    if (wantFiles) {
      const toRestore = this._filesToRestoreFrom(userIndex);
      undoFiles = await this._snapshotFiles([...toRestore.keys()]);
      await this._restoreFiles(toRestore);
      filesChanged = [...toRestore.keys()];
      fileNote =
        filesChanged.length === 0 && userIndex >= this.turnBackups.length
          ? '该轮次的文件改动不在当前会话进程中'
          : null;
    }

    this.undo = { undoFiles, prevTurnIndex: this.turnIndex, mode };

    if (wantConvo) {
      // The conversation is truncated to before this turn; the next message
      // becomes turn `userIndex` again.
      this.turnIndex = userIndex - 1;
      this.resume = this.sessionId;
      this.resumeAt = resumeAt;
      await this._restart();
    }

    this.send({ type: 'rewound', userIndex, mode, filesChanged, fileError: fileNote });
  }

  // Undo the most recent rewind: restore the forward files and (for modes that
  // truncated it) the full conversation. Only valid if no new turn has been
  // sent since the rewind.
  async undoRewind() {
    if (!this.undo) return this.send({ type: 'rewind_error', message: '无可撤销的回退' });
    const { undoFiles, prevTurnIndex, mode } = this.undo;
    await this._restoreFiles(undoFiles);
    this.turnIndex = prevTurnIndex;
    this.undo = null;
    if (mode !== 'files') {
      this.resume = this.sessionId;
      this.resumeAt = undefined;
      await this._restart();
    }
    this.send({ type: 'rewound_undo', mode });
  }

  // Send a user turn. `images` are base64 blocks; `files` are embedded as text.
  sendUserMessage(text, images = [], files = []) {
    // A new turn forks the timeline — the previous rewind can no longer be undone.
    this.undo = null;
    // Open a fresh per-turn checkpoint bucket.
    this.turnIndex += 1;
    this.turnBackups[this.turnIndex] = new Map();
    this.turnBackups.length = this.turnIndex + 1; // drop any stale forward turns
    let textPart = text || '';
    for (const f of files) {
      textPart += `\n\n--- 附件文件: ${f.name} ---\n${f.text}\n--- 文件结束 ---`;
    }
    let content;
    if (images.length) {
      content = [];
      for (const img of images) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: img.media_type, data: img.data },
        });
      }
      if (textPart.trim()) content.push({ type: 'text', text: textPart });
    } else {
      content = textPart;
    }
    this.input.push({
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null,
      session_id: this.sessionId || undefined,
    });
  }

  // 用量额度（/status）：来自活动 Query 的实验方法，含本会话花费与
  // claude.ai 订阅计划的限额利用率（5h / 7d / per-model）。实验 API，
  // 失败时静默降级为 available:false，不影响其它功能。
  async getUsage() {
    if (!this.query) {
      return this.send({ type: 'usage', available: false, reason: 'no_session' });
    }
    const WINDOWS = [
      ['five_hour', '5 小时'],
      ['seven_day', '7 天'],
      ['seven_day_opus', '7 天 · Opus'],
      ['seven_day_sonnet', '7 天 · Sonnet'],
    ];
    try {
      const res = await this.query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET();
      const rl = res?.rate_limits || {};
      const windows = [];
      for (const [key, label] of WINDOWS) {
        const w = rl[key];
        if (w && typeof w.utilization === 'number') {
          windows.push({ key, label, utilization: w.utilization, resetsAt: w.resets_at ?? null });
        }
      }
      this.send({
        type: 'usage',
        available: true,
        subscriptionType: res?.subscription_type ?? null,
        rateLimitsAvailable: !!res?.rate_limits_available,
        cost: res?.session?.total_cost_usd ?? 0,
        windows,
      });
    } catch {
      this.send({ type: 'usage', available: false, reason: 'error' });
    }
  }

  async setModel(model) {
    this.model = model;
    try {
      await this.query?.setModel(model || undefined);
      this.send({ type: 'model_changed', model });
    } catch (err) {
      this.send({ type: 'error', message: `Failed to switch model: ${err?.message || err}` });
    }
  }

  async setPermissionMode(mode) {
    this.permissionMode = mode;
    try {
      await this.query?.setPermissionMode(mode);
      this.send({ type: 'permission_mode_changed', mode });
    } catch (err) {
      this.send({ type: 'error', message: `Failed to set mode: ${err?.message || err}` });
    }
  }

  async interrupt() {
    try {
      await this.query?.interrupt();
    } catch {
      /* ignore */
    }
  }

  stop() {
    this.stopped = true;
    // Reject any dangling permission prompts as denials (client is gone — no
    // need to notify it).
    this._clearPendingPermissions('Connection closed.', false);
    this.input.close();
    this.interrupt();
  }
}
