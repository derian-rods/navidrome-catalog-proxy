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

export async function triggerScanFromRequest(request) {
  const authKeys = ['u', 'p', 't', 's', 'c', 'v', 'f'];
  const params = new URLSearchParams();

  for (const key of authKeys) {
    if (request.query[key] !== undefined) {
      params.set(key, String(request.query[key]));
    }
  }

  if (!params.has('u') || (!params.has('p') && (!params.has('t') || !params.has('s')))) {
    request.log.warn('skipping Navidrome scan: missing Subsonic auth parameters');
    return false;
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
