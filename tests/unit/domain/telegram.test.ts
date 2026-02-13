// Description: Unit tests for Telegram service

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}));

vi.mock('telegraf', () => ({
  Telegraf: class {
    telegram = {
      sendMessage: sendMessageMock,
    };
  },
}));

vi.mock('../../../src/lib/retry.js', () => ({
  retryWithBackoff: async <T>(fn: () => Promise<T>) => await fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { JobStatus, JobType } from '../../../src/domain/db/enum/db.enums.js';

async function loadTelegramService() {
  vi.resetModules();
  const mod = await import('../../../src/domain/notification/impl/telegram.js');
  return mod.telegram as typeof mod.telegram;
}

describe('TelegramService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WP_API_URL', 'https://example.com/wp-json');
  });

  it('disabled -> skips sending', async () => {
    vi.stubEnv('TELEGRAM_ENABLED', 'false');
    const telegramService = await loadTelegramService();
    await telegramService.send('hello');
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('enabled but credential missing -> disables and skips', async () => {
    vi.stubEnv('TELEGRAM_ENABLED', 'true');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('TELEGRAM_CHAT_ID', '');

    const telegramService = await loadTelegramService();
    await telegramService.send('hello');
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('formats job message', async () => {
    vi.stubEnv('TELEGRAM_ENABLED', 'true');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'chat');

    const job = {
      jobId: 1,
      jobType: JobType.Manual,
      status: JobStatus.Completed,
      pagesProcessed: 1,
      pagesSucceeded: 1,
      pagesFailed: 0,
      errors: [],
    };

    const telegramService = await loadTelegramService();
    await telegramService.send(job as any);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const args = sendMessageMock.mock.calls[0]!;
    expect(args[0]).toBe('chat');
    expect(args[1]).toContain('Notion→WordPress Sync');
    expect(args[1]).toContain('Job ID');
  });

  it('formats string message', async () => {
    vi.stubEnv('TELEGRAM_ENABLED', 'true');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'chat');

    const telegramService = await loadTelegramService();
    await telegramService.send('something happened');
    const args = sendMessageMock.mock.calls[0]!;
    expect(args[1]).toContain('Notification');
    expect(args[1]).toContain('something happened');
  });

  it('send failure does not throw', async () => {
    vi.stubEnv('TELEGRAM_ENABLED', 'true');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'chat');

    const telegramService = await loadTelegramService();
    sendMessageMock.mockRejectedValue(new Error('blocked'));
    await expect(telegramService.send('x')).resolves.toBeUndefined();
  });
});
