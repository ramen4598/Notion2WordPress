#!/usr/bin/env node
// shebang to specify Node.js interpreter
// MUST be at the very top of the file

// Description: CLI script to trigger a manual synchronization job

import { logger } from '../lib/logger.js';
import { db } from '../domain/db/impl/sqlite3.js';
import { orchestrator } from '../domain/orchestrator/impl/orchestratorImpl.js';
import { IJobResult } from '../domain/job/interface/jobResult.js';
import { JobType } from '../domain/db/enum/db.enums.js';
import { asError } from '../lib/utils.js';
import { StopWatch } from '../lib/stopWatch.js';

async function main() {
  await sync();
}

async function sync() {
  const stopWatch = new StopWatch();
  stopWatch.start();
  const result = await start();
  end(result);
  stopWatch.stop();
}

async function start(): Promise<IJobResult> {
  logger.info('Starting manual sync job');
  try {
    return await orchestrator.execute(JobType.Manual);
  } catch (error: unknown) {
    logger.error('Manual sync failed', asError(error));
    db.closeDb();
    process.exit(1);
  }
}

function end(result: IJobResult) {
  result.logResult();
  db.closeDb();
  process.exitCode = result.getExitCode();
}

await main();
