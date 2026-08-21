import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { searchYoutube } from './catalog/youtube.js';
import { registerCleanupRoutes } from './cleanup/routes.js';
import { startCleanupScheduler } from './cleanup/scheduler.js';
import { getCatalogStats } from './db/index.js';
import { getToolReport } from './tools.js';
import { registerSubsonicRoutes } from './subsonic/routes.js';
import { registerWebRoutes } from './web/routes.js';

export function buildServer() {
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  app.register(cors, { origin: true });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body ? Object.fromEntries(new URLSearchParams(body)) : {});
  });

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

  app.get('/api/catalog/stats', async () => getCatalogStats());

  app.get('/api/search', async request => {
    const query = String(request.query.q || request.query.query || '').trim();
    if (!query) return { results: [] };
    return { results: await searchYoutube(query) };
  });

  app.register(registerWebRoutes);
  app.register(registerSubsonicRoutes);
  app.register(registerCleanupRoutes);

  app.addHook('onReady', async () => {
    startCleanupScheduler(app);
  });

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const app = buildServer();
  await app.listen({ host: config.host, port: config.port });
}
