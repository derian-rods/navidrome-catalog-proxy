import { listCleanupCandidates } from '../db/index.js';
import {
  deleteExpiredQuarantine,
  quarantineCandidate,
  restoreCandidate,
  scanCleanupCandidates
} from './quarantine.js';

function readTrackRef(request) {
  const source = String(request.body?.source || request.query?.source || '').trim();
  const sourceId = String(request.body?.sourceId || request.query?.sourceId || '').trim();
  if (!source || !sourceId) throw new Error('source and sourceId are required');
  return { source, sourceId };
}

export async function registerCleanupRoutes(app) {
  app.get('/api/cleanup/candidates', async request => {
    const status = String(request.query.status || '').trim();
    return { candidates: listCleanupCandidates(status) };
  });

  app.post('/api/cleanup/scan', async () => scanCleanupCandidates());

  app.post('/api/cleanup/quarantine', async request => {
    const { source, sourceId } = readTrackRef(request);
    return quarantineCandidate(source, sourceId);
  });

  app.post('/api/cleanup/restore', async request => {
    const { source, sourceId } = readTrackRef(request);
    return restoreCandidate(source, sourceId);
  });

  app.post('/api/cleanup/delete-expired', async () => deleteExpiredQuarantine());
}
