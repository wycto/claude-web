// Filesystem browsing for the working-directory picker.
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';

// List immediate subdirectories of `dir` (directories only — this is a cwd picker).
export async function listDirectory(dir, { showHidden = false } = {}) {
  const target = dir ? resolve(dir) : homedir();
  const entries = await readdir(target, { withFileTypes: true });
  const dirs = [];
  for (const e of entries) {
    const hidden = e.name.startsWith('.');
    if (hidden && !showHidden && e.name !== '.claude') continue;
    let isDir = e.isDirectory();
    // WSL/Linux often expose directories via symlinks — resolve them.
    if (!isDir && e.isSymbolicLink()) {
      try {
        isDir = (await stat(join(target, e.name))).isDirectory();
      } catch {
        isDir = false;
      }
    }
    if (!isDir) continue;
    dirs.push({ name: e.name, path: join(target, e.name), hidden });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  const parent = dirname(target);
  return {
    path: target,
    parent: parent !== target ? parent : null,
    separator: sep,
    directories: dirs,
  };
}

// Quick-access roots for the picker: configured roots + home + filesystem root
// + any mounted drives under /mnt (WSL: /mnt/c, /mnt/d, …).
export async function suggestedRoots(configRoots = []) {
  const roots = [];
  const add = (p) => {
    if (p && !roots.includes(p)) roots.push(p);
  };
  for (const r of configRoots) add(r);
  add(homedir());
  for (const base of ['/mnt', '/media', '/run/media']) {
    try {
      const entries = await readdir(base, { withFileTypes: true });
      for (const e of entries) if (e.isDirectory()) add(join(base, e.name));
    } catch {
      /* not present */
    }
  }
  add('/');
  return roots;
}

export async function isDirectory(dir) {
  try {
    const s = await stat(resolve(dir));
    return s.isDirectory();
  } catch {
    return false;
  }
}

export function homeDir() {
  return homedir();
}

// Fuzzy-ish file search within a working directory for the "@" mention popup.
// Walks the tree (skipping heavy/ignored dirs) and ranks by subsequence match.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache', 'target',
  '.venv', 'venv', '__pycache__', '.idea', '.vscode', 'coverage', '.turbo',
]);

export async function searchFiles(cwd, query, limit = 30) {
  const root = resolve(cwd);
  const q = (query || '').toLowerCase();
  const results = [];
  const maxFiles = 4000;
  let scanned = 0;

  async function walk(dir, rel, depth) {
    if (depth > 8 || scanned > maxFiles || results.length > limit * 4) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.claude') continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        await walk(join(dir, e.name), childRel, depth + 1);
      } else if (e.isFile()) {
        scanned++;
        const score = matchScore(childRel.toLowerCase(), e.name.toLowerCase(), q);
        if (score > 0) results.push({ path: childRel, name: e.name, score });
      }
    }
  }

  await walk(root, '', 0);
  results.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
  return results.slice(0, limit).map(({ path, name }) => ({ path, name }));
}

function matchScore(relLower, nameLower, q) {
  if (!q) return nameLower.startsWith('readme') ? 50 : 1;
  if (nameLower === q) return 1000;
  if (nameLower.startsWith(q)) return 500;
  if (nameLower.includes(q)) return 300;
  if (relLower.includes(q)) return 150;
  // subsequence match on filename
  let i = 0;
  for (const ch of nameLower) if (ch === q[i]) i++;
  return i === q.length ? 60 : 0;
}
