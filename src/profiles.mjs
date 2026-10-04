import { join } from 'node:path';
import { isRecord, readJson, updateJson, userDirectory } from './storage.mjs';
export function endpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid OpenViking endpoint URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('OpenViking endpoint must use HTTP(S) without URL credentials, query parameters or fragments.');
  }
  return url.href.replace(/\/+$/, '');
}
export function literalHeader(value) {
  if (typeof value !== 'string' || /[^\x20-\x7e]/.test(value) || value.startsWith('!') || value.includes('${')) {
    throw new Error('OpenViking headers must be printable literal values, without command or environment expressions.');
  }
  return value;
}
export function validateName(name) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(name)
    || ['legacy', '__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('Invalid or reserved connection name.');
  return name;
}
export function validateProfile(value) {
  const keys = ['url', 'mcpUrl', 'account', 'user', 'peerId', 'auth'];
  if (!isRecord(value) || Object.keys(value).some(k => !keys.includes(k))) throw new Error('Invalid connection fields.');
  const profile = { ...value, url: endpoint(value.url) };
  if (value.mcpUrl !== undefined) profile.mcpUrl = endpoint(value.mcpUrl);
  if (new URL(profile.mcpUrl ?? profile.url).origin !== new URL(profile.url).origin) {
    throw new Error('The HTTP base URL and MCP URL must use the same origin.');
  }
  for (const k of ['account', 'user', 'peerId']) if (value[k] !== undefined) literalHeader(value[k]);
  const auth = value.auth;
  if (!isRecord(auth)) throw new Error('Choose explicit authentication: env, token or none.');
  const authKeys = auth.type === 'env' ? ['type', 'variable'] : auth.type === 'token' ? ['type', 'value'] : ['type'];
  if (Object.keys(auth).some(k => !authKeys.includes(k))) throw new Error('Invalid authentication fields.');
  if (auth.type === 'env') {
    if (typeof auth.variable !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(auth.variable)) throw new Error('Invalid API key environment variable name.');
  } else if (auth.type === 'token') {
    if (!auth.value) throw new Error('API key is empty.');
    literalHeader(auth.value);
  } else if (auth.type !== 'none') throw new Error('Unsupported authentication type.');
  return profile;
}
export const profilesPath = options => join(userDirectory(options), 'openviking-connections.json');
const empty = () => ({ version: 1, profiles: {} });
function validateStore(value) {
  if (value.version !== 1 || !isRecord(value.profiles) || Object.keys(value).some(k => !['version', 'profiles'].includes(k))) {
    throw new Error('Invalid OpenViking connections file.');
  }
  for (const [name, profile] of Object.entries(value.profiles)) { validateName(name); validateProfile(profile); }
  return value;
}
export function loadProfiles(options = {}) {
  return validateStore(readJson(profilesPath(options), empty())).profiles;
}
export function saveProfile(options, name, value) {
  validateName(name);
  const profile = validateProfile(value);
  updateJson(profilesPath(options), current => {
    validateStore(current);
    if (Object.hasOwn(current.profiles, name)) throw new Error('Connection already exists. Use a new name, or remove the old connection first.');
    current.profiles[name] = profile;
    return current;
  }, empty());
}
export function removeProfile(options, name) {
  validateName(name);
  updateJson(profilesPath(options), current => {
    validateStore(current);
    if (!Object.hasOwn(current.profiles, name)) throw new Error('Connection does not exist.');
    delete current.profiles[name];
    return current;
  }, empty());
}
export function publicProfiles(options = {}) {
  return Object.entries(loadProfiles(options)).map(([name, p]) => ({ name, url: p.url, mcpUrl: p.mcpUrl ?? `${p.url}/mcp`,
    auth: p.auth.type, ...(p.auth.type === 'env' ? { variable: p.auth.variable } : {}) }));
}
