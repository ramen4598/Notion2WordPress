/**
 * Utility class to measure and log the duration of a sync job
 */
export class StopWatch {
  private isStarted: boolean = false;
  private startTime: number;

  constructor() {
    this.startTime = -1;
  }

  /**
   * Starts the stopwatch.
   */
  public start(): void {
    this.startTime = Date.now();
    this.isStarted = true;
  }

  /**
   * Stops the stopwatch and returns the elapsed time in milliseconds.
   * @returns Elapsed time in milliseconds
   * @throws StopWatchError if the stopwatch was not started
   */
  public stop(): void {
    if (!this.isStarted) throw new StopWatchError('StopWatch has not been started.');
    const duration = Date.now() - this.startTime;
    console.info(`StopWatch : Operation completed in ${duration} ms`);
  }
}

/**
 * Custom error class for StopWatch-related errors
 */
export class StopWatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StopWatchError';
  }
}
