import { config } from '../config.js';
import { deleteExpiredQuarantine, scanCleanupCandidates } from './quarantine.js';

function runCleanup(app) {
  try {
    const scan = scanCleanupCandidates();
    const deleted = deleteExpiredQuarantine();
    app.log.info({ scan, deleted, dryRun: config.cleanup.dryRun }, 'cleanup scheduler completed');
  } catch (error) {
    app.log.error({ error }, 'cleanup scheduler failed');
  }
}

export function startCleanupScheduler(app) {
  if (!config.cleanup.enabled) {
    app.log.info('cleanup scheduler disabled');
    return null;
  }

  const intervalMs = Math.max(config.cleanup.intervalHours, 1) * 60 * 60 * 1000;
  app.log.info({ intervalHours: config.cleanup.intervalHours, dryRun: config.cleanup.dryRun }, 'cleanup scheduler enabled');

  setTimeout(() => runCleanup(app), 30_000);
  const timer = setInterval(() => runCleanup(app), intervalMs);
  timer.unref?.();
  return timer;
}
