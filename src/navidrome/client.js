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
