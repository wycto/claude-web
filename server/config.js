// Configuration + credential storage for claude-web.
// Stores a single account (username + scrypt-hashed password) and an HMAC
// token secret in data/config.json. No external crypto deps.

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');

// Where account config lives. Priority:
//   1. CLAUDE_WEB_DATA env (explicit override)
//   2. ./data next to the source (when running from a checkout)
//   3. ~/.claude-web (global install / fresh deploy on another machine)
function resolveDataDir() {
  if (process.env.CLAUDE_WEB_DATA) return process.env.CLAUDE_WEB_DATA;
  const local = join(ROOT, 'data');
  if (existsSync(local)) return local;
  return join(os.homedir(), '.claude-web');
}
export const DATA_DIR = resolveDataDir();
const CONFIG_PATH = join(DATA_DIR, 'config.json');

export const DEFAULT_PORT = 8787;

// Resolve the listen port. Priority: CLI flag > env > config.json > default.
export function resolvePort(cliPort) {
  if (cliPort && Number(cliPort)) return Number(cliPort);
  if (process.env.CLAUDE_WEB_PORT) return Number(process.env.CLAUDE_WEB_PORT);
  const cfg = readConfig();
  if (cfg?.port && Number(cfg.port)) return Number(cfg.port);
  return DEFAULT_PORT;
}

// Token lifetime in seconds (default 30 days).
const TOKEN_TTL = Number(process.env.CLAUDE_WEB_TOKEN_TTL || 60 * 60 * 24 * 30);

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function readConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function writeConfig(cfg) {
  ensureDataDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function isConfigured() {
  const cfg = readConfig();
  return !!(cfg && cfg.passwordHash && cfg.salt);
}

// Create or replace the single account.
export function setCredentials(username, password, port) {
  const { salt, hash } = hashPassword(password);
  const existing = readConfig() || {};
  const cfg = {
    ...existing,
    username: username || 'admin',
    salt,
    passwordHash: hash,
    tokenSecret: existing.tokenSecret || randomBytes(32).toString('hex'),
    // Default working directory roots offered in the directory picker.
    roots: existing.roots || [os.homedir()],
  };
  if (port && Number(port)) cfg.port = Number(port);
  writeConfig(cfg);
  return cfg;
}

// Update mutable settings (port, roots). Returns the merged config.
export function updateSettings({ port, roots } = {}) {
  const cfg = readConfig() || {};
  if (port !== undefined) {
    const p = Number(port);
    if (Number.isInteger(p) && p >= 1 && p <= 65535) cfg.port = p;
    else throw new Error('端口需为 1-65535 之间的整数');
  }
  if (Array.isArray(roots)) cfg.roots = roots.filter((r) => typeof r === 'string' && r.trim());
  writeConfig(cfg);
  return cfg;
}

export function getSettings() {
  const cfg = readConfig() || {};
  return {
    port: cfg.port || DEFAULT_PORT,
    roots: cfg.roots || [os.homedir()],
    portOverridden: !!process.env.CLAUDE_WEB_PORT,
  };
}

export function verifyPassword(username, password) {
  const cfg = readConfig();
  if (!cfg) return false;
  if (username && cfg.username && username !== cfg.username) return false;
  const { hash } = hashPassword(password, cfg.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(cfg.passwordHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- Stateless HMAC token (header.payload.signature, base64url) ---

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function issueToken(username) {
  const cfg = readConfig();
  const payload = b64url(
    JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL })
  );
  const sig = createHmac('sha256', cfg.tokenSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  const cfg = readConfig();
  if (!cfg || !token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', cfg.tokenSecret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export const TOKEN_MAX_AGE = TOKEN_TTL;
