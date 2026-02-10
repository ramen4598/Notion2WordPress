import { JobType } from '../enum/db.enums.js';
import { SyncJob } from '../model/syncJob.js';
import { SyncJobItem } from '../model/syncJobItem.js';
import { ImageAsset } from '../model/imageAsset.js';
import { PagePostMap } from '../model/pagePostMap.js';

export interface IDatabase {
  /**
   * Closes the database connection.
   * @throws {DBException} if fails
   */
  closeDb(): void;

  /**
   * Creates a new sync job.
   * @param jobType The type of the job.
   * @returns The ID of the created sync job.
   * @throws {DBException} if fails
   */
  createSyncJob(jobType: JobType): number;

  /**
   * Updates an existing sync job.
   * @param id The ID of the sync job to update.
   * @param updates The fields to update.
   * @throws {DBException} if fail
   */
  updateSyncJob(id: number, updates: Partial<Omit<SyncJob, 'id' | 'started_at'>>): void;

  /**
   * get a sync job by id
   * @param id
   * @return The sync job or undefined if not found
   * @throws {DBException} if fails
   */
  getSyncJob(id: number): SyncJob | undefined;

  /**
   * Gets the timestamp of the last successful sync.
   * @returns The timestamp as a string, or undefined if no successful sync exists.
   * @throws {DBException} if fails
   */
  getLastSyncTimestamp(): string | undefined;

  /**
   * Creates a new sync job item.
   * @param item The sync job item to create.
   * @returns The ID of the created sync job item.
   * @throws {DBException} if fails
   */
  createSyncJobItem(item: Omit<SyncJobItem, 'id' | 'created_at' | 'updated_at'>): number;

  /**
   * Updates an existing sync job item.
   * @param id
   * @param updates
   * @throws {DBException} if fails
   */
  updateSyncJobItem(id: number, updates: Partial<Omit<SyncJobItem, 'id' | 'created_at'>>): void;

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
   * gets image assets by sync job item ID
   * @param syncJobItemId The ID of the sync job item
   * @returns An array of image assets
   * @throws {DBException} if fails
   */
  getImageAssetsByJobItem(syncJobItemId: number): ImageAsset[];

  /**
   * creates a page-post mapping
   * @param map The page-post mapping to create
   * @returns The ID of the created page-post mapping
   * @throws {DBException} if fails
   */
  createPagePostMap(map: Omit<PagePostMap, 'id' | 'created_at'>): number;

  /**
   * gets a page-post mapping by notion page ID
   * @param notionPageId The Notion page ID
   * @returns The page-post mapping
   * @throws {DBException} if fails
   */
  getPagePostMap(notionPageId: string): PagePostMap | undefined;
}
