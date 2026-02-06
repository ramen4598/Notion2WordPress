import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from '../../../src/lib/retry.js';

describe('retryWithBackoff', () => {
  it('resolves on first attempt', async () => {
    let calls = 0;
    const result = await retryWithBackoff(async () => {
      calls++;
      return 'ok';
    }, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 2, backoffMultiplier: 1 });

    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    let calls = 0;
    const result = await retryWithBackoff(async () => {
      calls++;
      if (calls < 3) {
        throw new Error('temporary');
      }
      return 42;
    }, { maxAttempts: 5, initialDelayMs: 1, maxDelayMs: 2, backoffMultiplier: 1 });

    expect(result).toBe(42);
    expect(calls).toBe(3);
  });

  it('throws after exhausting attempts', async () => {
    let calls = 0;
    await expect(retryWithBackoff(async () => {
      calls++;
      throw new Error('fail');
    }, { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 2, backoffMultiplier: 1 }))
      .rejects.toThrow('fail');

    expect(calls).toBe(2);
  });

  it('calls onRetry with error and attempt number', async () => {
    vi.useFakeTimers();

    let calls = 0;
    const onRetry = vi.fn();

    const promise = retryWithBackoff(async () => {
      calls++;
      if (calls < 3) {
        throw new Error(`temporary-${calls}`);
      }
      return 'ok';
    }, { maxAttempts: 5, initialDelayMs: 10, maxDelayMs: 10, backoffMultiplier: 1, onRetry });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(onRetry.mock.calls[0]?.[0]?.message).toBe('temporary-1');
    expect(onRetry.mock.calls[0]?.[1]).toBe(1);
    expect(onRetry.mock.calls[1]?.[0]?.message).toBe('temporary-2');
    expect(onRetry.mock.calls[1]?.[1]).toBe(2);

    vi.useRealTimers();
  });
});
