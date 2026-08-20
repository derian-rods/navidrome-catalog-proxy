import { okResponse } from './responses.js';
import { proxyToNavidrome } from '../navidrome/client.js';

export async function registerSubsonicRoutes(app) {
  app.get('/rest/ping.view', async () => okResponse());
  app.get('/rest/ping', async () => okResponse());

  app.get('/rest/getLicense.view', async () => okResponse({
    license: { valid: true }
  }));
  app.get('/rest/getLicense', async () => okResponse({
    license: { valid: true }
  }));

  app.all('/rest/*', async (request, reply) => proxyToNavidrome(request, reply));
}
