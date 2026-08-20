import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { getToolReport } from './tools.js';
import { okResponse } from './subsonic/responses.js';

export function buildServer() {
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  app.register(cors, { origin: true });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'navidrome-catalog-proxy'
  }));

  app.get('/api/config', async () => ({
    audio: config.audio,
    youtube: config.youtube,
    cleanup: config.cleanup,
    navidrome: {
      url: config.navidrome.url,
      configured: Boolean(config.navidrome.user && config.navidrome.password)
    }
  }));

  app.get('/api/tools', async () => getToolReport(config));

  app.get('/rest/ping.view', async () => okResponse());
  app.get('/rest/ping', async () => okResponse());

  app.get('/rest/getLicense.view', async () => okResponse({
    license: {
      valid: true
    }
  }));
  app.get('/rest/getLicense', async () => okResponse({
    license: {
      valid: true
    }
  }));

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const app = buildServer();
  await app.listen({ host: config.host, port: config.port });
}
