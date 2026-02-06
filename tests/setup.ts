// Description: Global Vitest setup

import { beforeEach, vi } from 'vitest';

function applyBaseEnv(): void {
  vi.stubEnv('NOTION_API_TOKEN', 'test-notion-token');
  vi.stubEnv('NOTION_DATASOURCE_ID', 'test-datasource');
  vi.stubEnv('NOTION_PAGE_PROPERTY_NAME', 'status');
  vi.stubEnv('WP_API_URL', 'https://example.com/wp-json');
  vi.stubEnv('WP_USERNAME', 'test-user');
  vi.stubEnv('WP_APP_PASSWORD', 'test-pass');
  vi.stubEnv('TELEGRAM_ENABLED', 'false');
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('MAX_CONCURRENT_IMAGE_DOWNLOADS', '2');
  vi.stubEnv('IMAGE_DOWNLOAD_TIMEOUT_MS', '50');
  vi.stubEnv('MAX_RETRY_ATTEMPTS', '3');
  vi.stubEnv('RETRY_INITIAL_DELAY_MS', '1');
  vi.stubEnv('RETRY_MAX_DELAY_MS', '5');
  vi.stubEnv('RETRY_BACKOFF_MULTIPLIER', '1');
}

// Apply once before modules import config.
applyBaseEnv();

// Reset to a known baseline per test.
beforeEach(() => {
  vi.unstubAllEnvs();
  applyBaseEnv();
});
