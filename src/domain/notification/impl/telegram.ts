import type { Message, INotification } from '../interface/notification.js';
import type { Job } from '../../job/interface/jobProcessor.js';
import { JobStatus } from '../../db/enum/db.enums.js';
import { Telegraf } from 'telegraf';
import { config } from '../../../config/config.js';
import { logger } from '../../../lib/logger.js';
import { retryWithBackoff } from '../../../lib/retry.js';
import { asError } from '../../../lib/utils.js';
import { NotificationException } from '../error/notification.error.js';

class Telegram implements INotification {
  private bot: Telegraf | null; // Telegram bot instance
  private chatId: string | null; // Telegram chat ID to send messages to
  private enabled: boolean; // Whether to use Telegram notifications

  constructor() {
    this.enabled = config.telegramEnabled;

    if(!this.enabled) {
      this.bot = null;
      this.chatId = null;
      logger.debug('Telegram - notifications are disabled');
      return;
    }

    if (!config.telegramBotToken || !config.telegramChatId) {
      logger.warn('Telegram is enabled but credentials are missing. Disabling notifications.');
      this.enabled = false;
      this.bot = null;
      this.chatId = null;
      return;
    }

    try {
      this.chatId = config.telegramChatId;
      this.bot = new Telegraf(config.telegramBotToken);
    } catch (error: unknown) {
      throw new NotificationException('Failed to initialize Telegram bot', error);
    }
  }

  async send(msg: Message): Promise<void> {
    if (!this.checkConfigured()) return;

    let formedMsg: string = '';
    let append: string = '';
    if (this.isSyncJob(msg)) {
      formedMsg = this.formatSyncJobMessage(msg);
      append += " for jobId: " + msg.jobId;
    } else {
      formedMsg = this.formatTextMessage(msg);
    }

    const onRetryFn = (error: Error, attempt: number) => {
      logger.warn(`Retrying Telegram notification (attempt ${attempt})`, error);
    };

    try {
      await retryWithBackoff(async () => await this.bot!.telegram.sendMessage(this.chatId!, formedMsg, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      }), { onRetry: onRetryFn });
      logger.debug(`Telegram - Sent Telegram notification${append}`);
    } catch (error : unknown) {
      logger.warn(`Failed to send Telegram notification${append}`, asError(error));
      // Don't throw - notification failures shouldn't block the sync
    }
  }

  private isSyncJob(msg: Message): msg is Job {
    return typeof msg === 'object' && msg !== null &&
      'jobId' in msg && 'status' in msg && 'jobType' in msg;
  }

  private formatTextMessage(text: string): string {
    let message = '⚠️ *Notification*\n\n';
    message += `*URL:* ${this.escapeTgMarkdown(this.getDomain())}\n\n`;
    message += this.escapeTgMarkdown(this.truncateText(text)) + '\n';
    message += `*Check logs for full error details*`;
    return message;
  }

  private formatSyncJobMessage(syncJob: Job): string {
    const { jobId, jobType, status, pagesProcessed, pagesSucceeded, pagesFailed, errors } =
      syncJob;

    const emoji = status === JobStatus.Completed ? '✅' : '❌';
    const statusText = status === JobStatus.Completed ? 'Completed' : 'Failed';

    let message = `${emoji} *Notion→WordPress Sync ${statusText}*\n\n`;
    message += `*URL:* ${this.escapeTgMarkdown(this.getDomain())}\n\n`;
    message += `*Job ID:* ${jobId}\n`;
    message += `*Type:* ${jobType}\n`;
    message += `*Pages Processed:* ${pagesProcessed}\n`;
    message += `*Succeeded:* ${pagesSucceeded}\n`;
    message += `*Failed:* ${pagesFailed}\n`;

    if (status === JobStatus.Failed && errors && errors.length > 0) {
      message += `\n*Errors:*\n`;
      const maxErrors = 5; // Limit to avoid message being too long
      const displayErrors = errors.slice(0, maxErrors);

      for (const error of displayErrors) {
        message += `• ${this.escapeTgMarkdown(error.pageTitle)}\n`;
        message += `  _${this.escapeTgMarkdown(this.truncateText(error.errorMessage))}_\n`;
      }

      if (errors.length > maxErrors) {
        message += `\n_...and ${errors.length - maxErrors} more errors_\n`;
      }

      message += `\n*Check logs for full error details*`;
    }

    return message;
  }

  private getDomain(): string {
    const url = new URL(config.wpApiUrl);
    return url.hostname;
  }

  /**
   * Truncates an error message to a maximum length.
   * @param error The error message.
   * @param maxLength Maximum length of the error message.
   * @returns Truncated error message string.
   */
  private truncateText(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  private escapeTgMarkdown(s: string): string {
    return s
      .replace(/\\/g, "\\\\")      // 백슬래시 먼저
      .replace(/_/g, "\\_")
      .replace(/\*/g, "\\*")
      .replace(/`/g, "\\`")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  /**
   * Checks if Telegram notifications are properly configured.
   * @returns True if configured, false otherwise.
   */
  private checkConfigured(): boolean {
    if (!this.enabled) {
      logger.debug('Telegram notifications disabled, skipping notification');
      return false;
    }
    if (!this.bot) {
      logger.warn('Telegram bot not configured, skipping notification');
      return false;
    }
    if (!this.chatId) {
      logger.warn('Telegram chat ID not configured, skipping notification');
      return false;
    }
    return true;
  }
}

export const telegram: INotification = new Telegram();
