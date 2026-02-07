// Description: Entry point for Notion2WordPress sync service

import cron from 'node-cron';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { db } from './domain/db/impl/sqlite3.js';
import { syncOrchestrator } from './domain/orchestrator/impl/syncOrchestrator.js';
import { ISyncJobResult } from './domain/orchestrator/syncJobResult.js';
import { JobType } from './domain/db/enum/db.enums.js';
import { asError } from './lib/utils.js';

async function main() {
  logger.info('Starting Notion2WordPress Sync Service');
  logger.info(`Node environment: ${config.nodeEnv}`);
  logger.info(`Sync schedule: ${config.syncSchedule}`);
  setCron();
  endCron();
}

function setCron() {
  try {
    // Schedule sync job
    cron.schedule(config.syncSchedule, cronJob);
    logger.info('Sync scheduler started successfully');
  } catch (error: unknown) {
    logger.error('Failed to start sync service', asError(error));
    process.exit(1);
  }
}

async function cronJob() : Promise<void> {
  logger.info('Scheduled sync job triggered');
  try {
    const result = await startSync();
    endSync(result);
  } catch (error: unknown) { // TODO: Use custom error
    // fail to start scheduled sync
    logger.error('Scheduled sync failed', asError(error));
  }
}

async function startSync(): Promise<ISyncJobResult> {
  return await syncOrchestrator.executeSyncJob(JobType.Scheduled);
}

function endSync(result: ISyncJobResult) {
  result.logResult();
}

function endCron() {
  // 'SIGINT' is sent on Ctrl+C, 'SIGTERM' is sent by process managers
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    db.closeDb();
    process.exit(0);
  });

  // 'SIGTERM' is sent on termination signal, e.g., from Docker or Kubernetes
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    db.closeDb();
    process.exit(0);
  });
}

main();
