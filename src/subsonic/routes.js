import { okResponse } from './responses.js';
import { proxyToNavidrome } from '../navidrome/client.js';
import { search2, search3 } from './search.js';
import { stream } from './stream.js';
import { getCoverArt, getSong } from './media.js';

export async function registerSubsonicRoutes(app) {
  app.get('/rest/ping.view', async () => okResponse());
  app.get('/rest/ping', async () => okResponse());

  app.get('/rest/getLicense.view', async () => okResponse({
    license: { valid: true }
  }));
  app.get('/rest/getLicense', async () => okResponse({
    license: { valid: true }
  }));

  app.get('/rest/search3.view', async request => search3(request));
  app.get('/rest/search3', async request => search3(request));
  app.get('/rest/search2.view', async request => search2(request));
  app.get('/rest/search2', async request => search2(request));

  app.get('/rest/getSong.view', async (request, reply) => getSong(request, reply));
  app.get('/rest/getSong', async (request, reply) => getSong(request, reply));

  app.get('/rest/getCoverArt.view', async (request, reply) => getCoverArt(request, reply));
  app.get('/rest/getCoverArt', async (request, reply) => getCoverArt(request, reply));

  app.get('/rest/stream.view', async (request, reply) => stream(request, reply));
  app.get('/rest/stream', async (request, reply) => stream(request, reply));

  app.all('/rest/*', async (request, reply) => proxyToNavidrome(request, reply));
}
