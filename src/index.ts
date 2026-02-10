// Description: Entry point for Notion2WordPress sync service

import cron from 'node-cron';
import { config } from './config/config.js';
import { logger } from './lib/logger.js';
import { db } from './domain/db/impl/sqlite3.js';
import { orchestrator } from './domain/orchestrator/impl/orchestratorImpl.js';
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
  cron.schedule(config.syncSchedule, cronJob);
  logger.info('Sync scheduler started successfully');
}

async function cronJob() : Promise<void> {
  logger.info('Scheduled sync job triggered');
  try {
    const result = await orchestrator.execute(JobType.Scheduled);
    result.logResult();
  } catch (error: unknown) {
    logger.error('Scheduled sync failed', asError(error));
  }
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
