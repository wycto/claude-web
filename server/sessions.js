// Session listing/loading backed by Claude Code's own session store
// (~/.claude/projects/...). We reuse the Agent SDK helpers so sessions created
// here are fully interoperable with the `claude` CLI and vice-versa.
import {
  listSessions as sdkListSessions,
  getSessionMessages,
  deleteSession as sdkDeleteSession,
  renameSession as sdkRenameSession,
  forkSession as sdkForkSession,
} from '@anthropic-ai/claude-agent-sdk';

// Estimate token count from text (rough approximation: 1 token ≈ 4 characters)
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Calculate context size for a message
function calculateMessageSize(message) {
  if (!message) return 0;
  
  let totalTokens = 0;
  const content = message.content;
  
  if (typeof content === 'string') {
    totalTokens += estimateTokens(content);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        totalTokens += estimateTokens(block.text);
      } else if (block.type === 'tool_use') {
        // Tool use blocks: count input as JSON
        totalTokens += estimateTokens(JSON.stringify(block.input || {}));
      } else if (block.type === 'tool_result') {
        // Tool results: count content
        if (typeof block.content === 'string') {
          totalTokens += estimateTokens(block.content);
        } else if (Array.isArray(block.content)) {
          for (const item of block.content) {
            if (item.type === 'text' && item.text) {
              totalTokens += estimateTokens(item.text);
            }
          }
        }
      } else if (block.type === 'image') {
        // Images: estimate based on base64 data
        totalTokens += 1000; // Fixed estimate for images
      }
    }
  }
  
  return totalTokens;
}

// List sessions, optionally scoped to a working directory.
export async function listSessions({ dir } = {}) {
  const opts = dir ? { dir } : {};
  const sessions = await sdkListSessions(opts);
  
  // Calculate context size for each session
  const sessionsWithSize = await Promise.all(
    sessions.map(async (s) => {
      let contextSize = 0;
      try {
        const messages = await getSessionMessages(s.sessionId, opts);
        contextSize = messages.reduce((sum, m) => sum + calculateMessageSize(m.message), 0);
      } catch {
        // If we can't load messages, set size to 0
        contextSize = 0;
      }
      
      return {
        id: s.sessionId,
        title: s.customTitle || s.summary || s.firstPrompt || 'Untitled session',
        cwd: s.cwd || null,
        gitBranch: s.gitBranch || null,
        lastModified: s.lastModified || null,
        createdAt: s.createdAt || null,
        tag: s.tag || null,
        contextSize,
      };
    })
  );
  
  return sessionsWithSize;
}

// Load a session transcript and normalize into UI-friendly message items.
export async function loadSession(id, { dir } = {}) {
  const opts = dir ? { dir } : {};
  const raw = await getSessionMessages(id, opts);
  return raw.map((m) => ({
    type: m.type,
    uuid: m.uuid,
    parent_tool_use_id: m.parent_tool_use_id ?? null,
    message: m.message,
  }));
}

export async function deleteSession(id, dir) {
  await sdkDeleteSession(id, dir ? { dir } : undefined);
}

export async function renameSession(id, title, dir) {
  await sdkRenameSession(id, title, dir ? { dir } : undefined);
}

// Fork a session into a new branch. `upToMessageId` (optional) slices the
// transcript up to that message; omit to copy the whole conversation.
export async function forkSession(id, { dir, upToMessageId, title } = {}) {
  const opts = {};
  if (dir) opts.dir = dir;
  if (upToMessageId) opts.upToMessageId = upToMessageId;
  if (title) opts.title = title;
  const res = await sdkForkSession(id, opts);
  return res.sessionId;
}
