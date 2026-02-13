import { JobType } from '../enum/db.enums.js';
import { JobRow } from '../model/job.js';
import { PageRow } from '../model/page.js';
import { ImageAsset } from '../model/imageAsset.js';
import { NotionPagePostMap } from '../model/nPagePostMap.js';

export interface IDatabase {
  /**
   * Closes the database connection.
   * @throws {DBException} if fails
   */
  closeDb(): void;

  /**
   * Creates a new job.
   * @param jobType The type of the job.
   * @returns The ID of the created job.
   * @throws {DBException} if fails
   */
  createJob(jobType: JobType): number;

  /**
   * Updates an existing job.
   * @param id The ID of the job to update.
   * @param updates The fields to update.
   * @throws {DBException} if fail
   */
  updateJob(id: number, updates: Partial<Omit<JobRow, 'id' | 'started_at'>>): void;

  /**
   * Gets a job by ID.
   * @param id
   * @return The job row or undefined if not found
   * @throws {DBException} if fails
   */
  getJob(id: number): JobRow | undefined;

  /**
   * Gets the timestamp of the last successful sync.
   * @returns The timestamp as a string, or undefined if no successful sync exists.
   * @throws {DBException} if fails
   */
  getLastSyncTimestamp(): string | undefined;

  /**
   * Creates a new page row.
   * @param page The page row to create.
   * @returns The ID of the created page row.
   * @throws {DBException} if fails
   */
  createPage(page: Omit<PageRow, 'id' | 'created_at' | 'updated_at'>): number;

  /**
   * Updates an existing page row.
   * @param id
   * @param updates
   * @throws {DBException} if fails
   */
  updatePage(id: number, updates: Partial<Omit<PageRow, 'id' | 'created_at'>>): void;

  /**
   * creates an image asset
   * @param asset The image asset to create
   * @returns The ID of the created image asset
   * @throws {DBException} if fails
   */
  createImageAsset(asset: Omit<ImageAsset, 'id' | 'created_at'>): number;

  /**
   * updates an existing image asset
   * @param id The ID of the image asset to update
   * @param updates The fields to update
   * @throws {DBException} if fails
   */
  updateImageAsset(id: number, updates: Partial<Omit<ImageAsset, 'id' | 'created_at'>>): void;

  /**
   * Gets image assets by page ID.
   * @param pageId The ID of the page
   * @returns An array of image assets
   * @throws {DBException} if fails
   */
  getImageAssetsByPage(pageId: number): ImageAsset[];

  /**
   * Creates a mapping from Notion page to WordPress post.
   * @param map The mapping to create
   * @returns The ID of the created mapping
   * @throws {DBException} if fails
   */
  createNPagePostMap(map: Omit<NotionPagePostMap, 'id' | 'created_at'>): number;

  /**
   * Gets the Notion page to WordPress post mapping by Notion page ID.
   * @param notionPageId The Notion page ID
   * @returns The mapping
   * @throws {DBException} if fails
   */
  getNPagePostMap(notionPageId: string): NotionPagePostMap | undefined;
}
