import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync,
  renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function userDirectory({ agentDir, env = process.env } = {}) {
  const path = agentDir ?? env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent');
  return resolve(path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);
}
export function readJson(path, fallback = {}) {
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error('symlink');
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(value)) throw new Error('object required');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    // Never echo JSON contents, parser errors or credentials.
    throw new Error(`Cannot read JSON object (or symlink refused): ${path}`);
  }
}
export function projectDirectory(cwd = process.cwd()) {
  const path = join(cwd, '.pi');
  if (existsSync(path)) {
    const rel = relative(realpathSync(cwd), realpathSync(path));
    if (rel.startsWith('..') || rel.startsWith('/')) throw new Error('Project .pi directory escapes the project.');
  }
  return path;
}
// Each read-modify-write holds a process-independent lock. A crash leaves an
// explicit lock to inspect instead of silently losing another writer's edit.
export function updateJson(path, update, fallback = {}) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const lock = `${path}.lock`;
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch { throw new Error(`Configuration is locked: ${lock}. Retry; remove a stale lock only after its writer has stopped.`); }
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const value = update(readJson(path, fallback));
    const fd = openSync(temp, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); }
    finally { closeSync(fd); }
    renameSync(temp, path);
    return value;
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
    rmdirSync(lock);
  }
}
