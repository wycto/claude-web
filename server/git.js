// Git change tracking for the "Changes" panel.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

const exec = promisify(execFile);
const NULL_DEVICE = os.platform() === 'win32' ? 'NUL' : '/dev/null';

async function git(cwd, args) {
  const { stdout } = await exec('git', args, {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

export async function isGitRepo(cwd) {
  try {
    const out = await git(cwd, ['rev-parse', '--is-inside-work-tree']);
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

// Returns { isRepo, branch, files: [{ path, status, staged }] }
export async function status(cwd) {
  if (!(await isGitRepo(cwd))) return { isRepo: false, files: [] };
  let branch = '';
  try {
    branch = (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  } catch {
    /* detached or empty repo */
  }
  const out = await git(cwd, ['status', '--porcelain=v1', '-z']);
  const files = [];
  const parts = out.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    const x = entry[0];
    const y = entry[1];
    let path = entry.slice(3);
    // Renames consume the next NUL-separated token (old path).
    if (x === 'R' || x === 'C') i++;
    files.push({
      path,
      x,
      y,
      staged: x !== ' ' && x !== '?',
      status: describe(x, y),
      untracked: x === '?' && y === '?',
    });
  }
  return { isRepo: true, branch, files };
}

function describe(x, y) {
  if (x === '?' && y === '?') return 'untracked';
  const code = (x !== ' ' ? x : y);
  switch (code) {
    case 'M': return 'modified';
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    case 'U': return 'conflict';
    default: return 'changed';
  }
}

// Unified diff for a single file (or whole tree when path omitted).
export async function diff(cwd, path, { staged = false } = {}) {
  if (!(await isGitRepo(cwd))) return '';
  const args = ['diff', '--no-color'];
  if (staged) args.push('--cached');
  // Include untracked files by diffing against /dev/null when needed.
  if (path) {
    args.push('--', path);
    try {
      const out = await git(cwd, args);
      if (out.trim()) return out;
      // Possibly an untracked file: synthesize a diff.
      return await git(cwd, ['diff', '--no-color', '--no-index', NULL_DEVICE, path]).catch((e) => e.stdout || '');
    } catch (e) {
      return e.stdout || '';
    }
  }
  try {
    return await git(cwd, args);
  } catch (e) {
    return e.stdout || '';
  }
}
