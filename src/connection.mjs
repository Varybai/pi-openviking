import { resolveOpenVikingCredentials } from '../vendor/credentials.mjs';
import { loadSettings } from './settings.mjs';
import { endpoint, literalHeader, loadProfiles, validateProfile } from './profiles.mjs';
export function connectionFromProfile(profile, settings, env = process.env) {
  const p = validateProfile(profile);
  const apiKey = p.auth.type === 'token' ? p.auth.value : p.auth.type === 'env' ? env[p.auth.variable] : '';
  if (p.auth.type !== 'none' && !apiKey) throw new Error('API key is missing. Set the configured environment variable before starting Pi.');
  if (apiKey) literalHeader(apiKey);
  return build({ baseUrl: p.url, mcpUrl: p.mcpUrl ?? `${p.url}/mcp`, apiKey, account: p.account,
    user: p.user, peerId: p.peerId, credentialSource: `profile:${p.auth.type}` }, settings);
}
function build(credentials, settings) {
  const baseUrl = endpoint(credentials.baseUrl);
  const mcpUrl = endpoint(credentials.mcpUrl);
  if (new URL(baseUrl).origin !== new URL(mcpUrl).origin) throw new Error('HTTP base URL and MCP URL must use the same origin.');
  const headers = {};
  if (credentials.apiKey) headers.Authorization = `Bearer ${literalHeader(credentials.apiKey)}`;
  if (credentials.account) headers['X-OpenViking-Account'] = literalHeader(credentials.account);
  if (credentials.user) headers['X-OpenViking-User'] = literalHeader(credentials.user);
  if (credentials.peerId) headers['X-OpenViking-Actor-Peer'] = literalHeader(credentials.peerId);
  const config = { url: mcpUrl, exposure: settings.exposure, timeout: settings.timeout,
    description: 'OpenViking knowledge retrieval, resource ingestion, source evidence and optional LEGO connector queries.' };
  if (Object.keys(headers).length) config.headers = headers;
  if (settings.toolExposure) config.toolExposure = settings.toolExposure;
  return { settings, config, baseUrl,
    publicInfo: { enabled: true, configured: true, profile: settings.profile, serverName: settings.serverName,
      baseUrl, mcpUrl, exposure: settings.exposure, timeout: settings.timeout, hasApiKey: Boolean(credentials.apiKey),
      credentialSource: credentials.credentialSource } };
}
export function resolveConnection(options = {}) {
  const settings = loadSettings(options);
  if (!settings.enabled) return { settings, publicInfo: { enabled: false, serverName: settings.serverName } };
  const env = options.env ?? process.env;
  if (settings.profile !== null) {
    const profiles = loadProfiles(options);
    if (!Object.hasOwn(profiles, settings.profile)) throw new Error('Selected OpenViking connection is missing. Run /ov-setup or /ov-use.');
    return connectionFromProfile(profiles[settings.profile], settings, env);
  }
  const c = resolveOpenVikingCredentials(env);
  const cliOnly = ['cli', 'ovcli', 'file', 'config'].includes((env.OPENVIKING_CREDENTIAL_SOURCE ?? env.OPENVIKING_CREDENTIALS_SOURCE ?? '').toLowerCase());
  const envUrl = cliOnly ? '' : (env.OPENVIKING_URL || env.OPENVIKING_BASE_URL || env.OPENVIKING_MCP_URL);
  const fileUrl = c.cliFile.url || c.ovFile.server?.url;
  if (!envUrl && !fileUrl && !c.ovFile.server?.port) {
    return { settings, publicInfo: { enabled: true, configured: false, serverName: settings.serverName, reason: 'Run /ov-setup to add a connection.' } };
  }
  // Do not send an old file's credential to a newly supplied environment URL.
  const expectedFileUrl = fileUrl && endpoint(fileUrl);
  const envIsMcpOnly = !env.OPENVIKING_URL && !env.OPENVIKING_BASE_URL && env.OPENVIKING_MCP_URL;
  if (envUrl && c.apiKey && c.credentialPath && (!fileUrl
    || endpoint(envUrl) !== (envIsMcpOnly ? `${expectedFileUrl}/mcp` : expectedFileUrl))) {
    throw new Error('Environment endpoint differs from credential file. Supply its own API key or create a named connection.');
  }
  return build(c, settings);
}
