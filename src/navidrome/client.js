import { config } from '../config.js';

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

function copyHeaders(headers) {
  const output = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!hopByHopHeaders.has(key.toLowerCase()) && value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

export async function proxyToNavidrome(request, reply) {
  const target = new URL(request.url, config.navidrome.url);
  const headers = copyHeaders(request.headers);
  delete headers.host;

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    duplex: ['GET', 'HEAD'].includes(request.method) ? undefined : 'half',
    redirect: 'manual'
  });

  reply.code(response.status);
  for (const [key, value] of response.headers.entries()) {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      reply.header(key, value);
    }
  }

  return reply.send(response.body);
}

function navidromeUrlFromRequest(request, endpoint) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(request.query || {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  params.set('f', 'json');
  return new URL(`/rest/${endpoint}?${params}`, config.navidrome.url);
}

export async function callNavidromeJson(request, endpoint) {
  const target = navidromeUrlFromRequest(request, endpoint);
  const response = await fetch(target, {
    method: 'GET',
    headers: { accept: 'application/json' }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Navidrome ${endpoint} failed with HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

export async function validateNavidromeCredentials(user, password) {
  if (!user || !password) return false;
  const params = new URLSearchParams({
    u: user,
    p: password,
    v: '1.16.1',
    c: 'navidrome-catalog-proxy',
    f: 'json'
  });
  const target = new URL(`/rest/ping.view?${params}`, config.navidrome.url);
  const response = await fetch(target, { method: 'GET', headers: { accept: 'application/json' } });
  if (!response.ok) return false;
  const payload = await response.json();
  return payload?.['subsonic-response']?.status === 'ok';
}

export async function triggerScanFromRequest(request) {
  const authKeys = ['u', 'p', 't', 's', 'c', 'v', 'f'];
  const params = new URLSearchParams();

  for (const key of authKeys) {
    if (request.query[key] !== undefined) {
      params.set(key, String(request.query[key]));
    }
  }

  if (!params.has('u') || (!params.has('p') && (!params.has('t') || !params.has('s')))) {
    if (!config.navidrome.user || !config.navidrome.password) {
      request.log.warn('skipping Navidrome scan: missing Subsonic auth parameters and configured Navidrome credentials');
      return false;
    }
    params.set('u', config.navidrome.user);
    params.set('p', config.navidrome.password);
  }

  if (!params.has('c')) params.set('c', 'navidrome-catalog-proxy');
  if (!params.has('v')) params.set('v', '1.16.1');
  if (!params.has('f')) params.set('f', 'json');

  const target = new URL(`/rest/startScan.view?${params}`, config.navidrome.url);
  try {
    const response = await fetch(target, { method: 'GET' });
    if (!response.ok) {
      request.log.warn({ status: response.status }, 'Navidrome scan request failed');
      return false;
    }
    return true;
  } catch (error) {
    request.log.warn({ error }, 'Navidrome scan request failed');
    return false;
  }
}
