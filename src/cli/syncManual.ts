#!/usr/bin/env node
// shebang to specify Node.js interpreter
// MUST be at the very top of the file

// Description: CLI script to trigger a manual synchronization job

import { logger } from '../lib/logger.js';
import { db } from '../db/index.js';
import { syncOrchestrator } from '../orchestrator/syncOrchestrator.js';
import { ISyncJobResult } from '../orchestrator/syncJobResult.js';
import { JobType } from '../enums/db.enums.js';
import { asError } from '../lib/utils.js';
import { StopWatch } from '../lib/stopWatch.js';

async function main() {
  await sync();
}

async function sync() {
  const stopWatch = new StopWatch();
  const result = await start(stopWatch);
  end(result, stopWatch);
}

async function start(stopWatch: StopWatch): Promise<ISyncJobResult> {
  stopWatch.start();
  logger.info('Starting manual sync job');
  return await executeSyncJob();
}

function end(result: ISyncJobResult, stopWatch: StopWatch) {
  stopWatch.stop();
  result.logResult();
  process.exit(result.getExitCode());
}

async function executeSyncJob(): Promise<ISyncJobResult> {
  let result: ISyncJobResult;
  try {
    result = await syncOrchestrator.executeSyncJob(JobType.Manual);
    db.closeDb(); // TODO: finally 블록으로 옮기기
  } catch (error: unknown) {
    logger.error('Manual sync failed', asError(error));
    db.closeDb(); // TODO: finally 블록으로 옮기기
    process.exit(1); // TODO: 커스텀 에러 코드를 정의하여 사용하여 예외처리
  }
  return result;
}

main();
