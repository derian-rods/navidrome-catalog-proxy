import { okResponse } from './responses.js';
import { proxyToNavidrome } from '../navidrome/client.js';
import { search3 } from './search.js';
import { stream } from './stream.js';

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

  app.get('/rest/stream.view', async (request, reply) => stream(request, reply));
  app.get('/rest/stream', async (request, reply) => stream(request, reply));

  app.all('/rest/*', async (request, reply) => proxyToNavidrome(request, reply));
}
