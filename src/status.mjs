export async function inspectHealth(connection, { fetchImpl = globalThis.fetch, signal } = {}) {
  const info = { ...connection.publicInfo };
  if (!connection.settings.enabled) return { ...info, healthy: false, reason: 'disabled' };
  if (!connection.config) return { ...info, healthy: false, reason: 'setup_required' };
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
  try {
    const response = await fetchImpl(connection.baseUrl + '/health', {
      headers: connection.config.headers ?? {}, signal: requestSignal,
      // Do not forward credentials to a redirected origin.
      redirect: 'error',
    });
    const body = await response.json().catch(() => ({}));
    return { ...info, httpStatus: response.status, healthy: response.ok && body.healthy === true };
  } catch (error) {
    return { ...info, healthy: false, reason: error?.name === 'TimeoutError' ? 'timeout' : 'request_failed' };
  }
}
