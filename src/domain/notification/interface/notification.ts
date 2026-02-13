import { Job } from '../../job/interface/jobProcessor.js';

export type Message = Job | string;

export interface INotification {
  /**
   * Sends a notification message.
   * @param msg The message or job details to send.
   * @throws Nothing. Failures are logged internally.
   */
  send(msg: Message): Promise<void>;
}
