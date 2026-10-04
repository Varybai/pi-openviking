import { join } from 'node:path';
import { isRecord, projectDirectory, readJson, updateJson, userDirectory } from './storage.mjs';
const EXPOSURES = new Set(['codemode', 'deferred', 'direct', 'hidden']);
const KEYS = new Set(['enabled', 'profile', 'serverName', 'exposure', 'timeout', 'toolExposure']);
export const DEFAULTS = { enabled: true, profile: null, serverName: 'openviking', exposure: 'codemode', timeout: 120 };
export function validateSettings(value) {
  if (!isRecord(value) || Object.keys(value).some(key => !KEYS.has(key))) {
    throw new Error('Unsupported OpenViking MCP setting; credentials belong in private connections or environment variables.');
  }
  const s = { ...DEFAULTS, ...value };
  if (typeof s.enabled !== 'boolean') throw new Error('OpenViking MCP enabled must be boolean.');
  if (typeof s.serverName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(s.serverName)) throw new Error('Invalid MCP serverName.');
  if (s.profile !== null && (typeof s.profile !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(s.profile))) throw new Error('Invalid profile name.');
  if (!EXPOSURES.has(s.exposure)) throw new Error('Invalid OpenViking MCP exposure.');
  if (!Number.isFinite(s.timeout) || s.timeout <= 0) throw new Error('OpenViking MCP timeout must be positive seconds.');
  if (s.toolExposure !== undefined && (!isRecord(s.toolExposure) || Object.values(s.toolExposure).some(v => !EXPOSURES.has(v)))) {
    throw new Error('Invalid OpenViking MCP toolExposure.');
  }
  return s;
}
export function settingsPath(options = {}, scope = 'project') {
  if (!['project', 'user'].includes(scope)) throw new Error('Scope must be project or user.');
  if (scope === 'project' && options.projectTrusted === false) throw new Error('Trust the project before changing its configuration.');
  return join(scope === 'user' ? userDirectory(options) : projectDirectory(options.cwd), 'openviking-mcp.json');
}
export function loadSettings(options = {}) {
  const global = readJson(settingsPath(options, 'user'));
  validateSettings(global);
  const local = options.projectTrusted === false ? {} : readJson(settingsPath(options));
  validateSettings(local);
  return validateSettings({ ...global, ...local });
}
export function updateSettings(options, scope, changes) {
  return updateJson(settingsPath(options, scope), current => {
    const next = { ...current, ...changes };
    validateSettings(next);
    return next;
  });
}
