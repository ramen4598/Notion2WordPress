// Description: Database service using better-sqlite3 (synchronous API)
// for managing sync jobs, job items, image assets, and page-post mappings.

import { IDatabase } from '../interface/IDatabase.js';
import DatabaseConstructor, { type Database as BetterSqliteDatabase } from 'better-sqlite3';
import { logger } from '../../../lib/logger.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { JobType, JobStatus } from '../enum/db.enums.js';
import { SyncJob } from '../model/syncJob.js';
import { SyncJobItem } from '../model/syncJobItem.js';
import { ImageAsset } from '../model/imageAsset.js';
import { PagePostMap } from '../model/pagePostMap.js';
import { DBException, DBInitializationException } from '../error/db.error.js';
import { asError } from '../../../lib/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SCHEMA_PATH = path.resolve(__dirname, '../../../../config/schema.sql');
const DEFAULT_DATABASE_PATH = path.resolve(__dirname, '../../../../data/sync.db');

class Database implements IDatabase {
  private db: BetterSqliteDatabase | null = null;

  private getDb(): BetterSqliteDatabase {
    if (!this.db) this.db = this.initDB(); 
    return this.db; 
  }

  private initDB(): BetterSqliteDatabase {
    const dbPath = DEFAULT_DATABASE_PATH;
    const dbDir = path.dirname(dbPath);
    const schemaPath = DEFAULT_SCHEMA_PATH;

    this.checkDataDir(dbDir);
    const db = this.connectDb(dbPath);
    this.initSchema(db, schemaPath);

    logger.debug('sqlite3 - Database initialized successfully');
    return db;
  }

  private checkDataDir(dbDir: string): void {
    if (fs.existsSync(dbDir)) return;
    try {
      fs.mkdirSync(dbDir, { recursive: true });
    } catch (error: unknown) {
      logger.warn(`Failed to create database directory: ${dbDir}`, asError(error));
      throw new DBInitializationException(`Failed to create database directory: ${dbDir}`, error);
    }
    logger.debug(`sqlite3 - Created database directory: ${dbDir}`);
  }

  private connectDb(dbPath: string): BetterSqliteDatabase {
    try {
      const db = new DatabaseConstructor(dbPath, {});
      logger.debug(`sqlite3 - Database connected: ${dbPath}`);
      return db;
    } catch (error: unknown) {
      logger.warn(`Failed to connect to database: ${dbPath}`, asError(error));
      throw new DBInitializationException(`Failed to connect to database: ${dbPath}`, error);
    }
  }

  private initSchema(db: BetterSqliteDatabase, schemaPath: string): void {
    let schemaSql: string;
    try{
      schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    } catch (error: unknown) {
      logger.warn(`Failed to read schema file: ${schemaPath}`, asError(error));
      throw new DBInitializationException(`Failed to read schema file: ${schemaPath}`, error);
    }
    try {
      // schema.sql uses IF NOT EXISTS, so repeated initialization is safe.
      db.exec(schemaSql);
    } catch (error: unknown) {
      logger.warn('Failed to initialize database schema', asError(error));
      throw new DBInitializationException('Failed to initialize database schema', error);
    }
    logger.debug('sqlite3 - Database schema initialized');
  }

  closeDb(): void {
    if (!this.db) return;
    try {
      this.db.close();
    } catch (error: unknown) {
      logger.warn('Failed to close database connection', asError(error));
      throw new DBException('Failed to close database connection', error);
    }
    this.db = null;
    logger.debug('sqlite3 - Database connection closed');
  }

  // Sync Jobs
  createSyncJob(jobType: JobType): number {
    const sql = `
      INSERT INTO sync_jobs (job_type, status, pages_processed, pages_succeeded, pages_failed)
      VALUES (?, ?, 0, 0, 0)
    `;

    let stmt;
    let info;
    try {
      stmt = this.getDb().prepare(sql);
      info = stmt.run(jobType, JobStatus.Running);
    } catch (error: unknown) {
      logger.warn('Failed to create sync job', asError(error));
      throw new DBException('Failed to create sync job', error);
    }

    const id = Number(info.lastInsertRowid);
    logger.debug(`sqlite3 - Created sync job with ID: ${id}`);
    return id;
  }

  updateSyncJob(
    id: number,
    updates: Partial<Omit<SyncJob, 'id' | 'started_at'>> // id and started_at are not updatable
  ): void {
    type valuesType = string | number;
    const fields: string[] = [];
    const values: valuesType[] = [];

    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
      if (updates.status === JobStatus.Completed || updates.status === JobStatus.Failed) {
        fields.push("completed_at = datetime('now')");
      }
    }
    if (updates.error_message !== undefined) {
      fields.push('error_message = ?');
      values.push(updates.error_message);
    }
    if (updates.pages_processed !== undefined) {
      fields.push('pages_processed = ?');
      values.push(updates.pages_processed);
    }
    if (updates.pages_succeeded !== undefined) {
      fields.push('pages_succeeded = ?');
      values.push(updates.pages_succeeded);
    }
    if (updates.pages_failed !== undefined) {
      fields.push('pages_failed = ?');
      values.push(updates.pages_failed);
    }
    if (updates.last_sync_timestamp) {
      fields.push('last_sync_timestamp = ?');
      values.push(updates.last_sync_timestamp);
    }

    if (fields.length === 0) return;

    const sql = `UPDATE sync_jobs SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);

    try {
      const stmt = this.getDb().prepare(sql);
      stmt.run(...values);
    } catch (error: unknown) {
      logger.warn(`Failed to update sync job ${id} to ${JSON.stringify(updates)}`, asError(error));
      throw new DBException('Failed to update sync job', error);
    }
    logger.debug(`sqlite3 - Updated sync job ${id} with ${JSON.stringify(updates)}`);
  }

  getSyncJob(id: number): SyncJob | undefined {
    const sql = 'SELECT * FROM sync_jobs WHERE id = ?';

    type rowType = SyncJob | undefined;
    try {
      const job = this.getDb().prepare(sql).get(id) as rowType;
      logger.debug(`sqlite3 - Fetched sync job ${id}: ${job ? JSON.stringify(job) : 'not found'}`);
      return job;
    } catch (error: unknown) {
      logger.warn(`Failed to get sync job ${id}`, asError(error));
      throw new DBException(`Failed to get sync job ${id}`, error);
    }
  }

  getLastSyncTimestamp(): string | undefined {
    const sql = `
      SELECT last_sync_timestamp
      FROM sync_jobs
      WHERE status = ? AND last_sync_timestamp IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 1
    `;

    try {
      const row = this.getDb().prepare(sql).get(JobStatus.Completed) as { last_sync_timestamp: string } | undefined;
      logger.debug(`sqlite3 - Fetched last sync timestamp: ${row ? row.last_sync_timestamp : 'none'}`);
      return row ? row.last_sync_timestamp : undefined;
    } catch (error: unknown) {
      logger.warn('Failed to get last sync timestamp', asError(error));
      throw new DBException(`Failed to get last sync timestamp`, error);
    }
  }

  // Sync Job Items
  createSyncJobItem(item: Omit<SyncJobItem, 'id' | 'created_at' | 'updated_at'>): number {
    const sql = `
      INSERT INTO sync_job_items (sync_job_id, notion_page_id, wp_post_id, status)
      VALUES (?, ?, ?, ?)
    `;
    try {
      const stmt = this.getDb().prepare(sql);
      const info = stmt.run(item.sync_job_id, item.notion_page_id, item.wp_post_id, item.status);
      logger.debug(`sqlite3 - Created sync job item for Notion page ${item.notion_page_id} with ID: ${info.lastInsertRowid}`);
      return Number(info.lastInsertRowid);
    } catch (error: unknown) {
      logger.warn('Failed to create sync job item', asError(error));
      throw new DBException('Failed to create sync job item', error);
    }
  }

  updateSyncJobItem(id: number, updates: Partial<Omit<SyncJobItem, 'id' | 'created_at'>>): void {
    const fields: string[] = ["updated_at = datetime('now')"];
    const values: any[] = [];

    if (updates.wp_post_id !== undefined) {
      fields.push('wp_post_id = ?');
      values.push(updates.wp_post_id);
    }
    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.error_message !== undefined) {
      fields.push('error_message = ?');
      values.push(updates.error_message);
    }

    const sql = `UPDATE sync_job_items SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    try {
      this.getDb().prepare(sql).run(...values);
    } catch (error: unknown) {
      logger.warn(`Failed to update sync job item ${id} to ${JSON.stringify(updates)}`, asError(error));
      throw new DBException('Failed to update sync job item', error);
    }
    logger.debug(`sqlite3 - Updated sync job item ${id} with ${JSON.stringify(updates)}`);
  }

  // Image Assets
  createImageAsset(asset: Omit<ImageAsset, 'id' | 'created_at'>): number {
    const sql = `
      INSERT INTO image_assets (
        sync_job_item_id, notion_page_id, notion_block_id, notion_url,
        wp_media_id, wp_media_url, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    try {
      const stmt = this.getDb().prepare(sql);
      const info = stmt.run(
        asset.sync_job_item_id,
        asset.notion_page_id,
        asset.notion_block_id,
        asset.notion_url,
        asset.wp_media_id,
        asset.wp_media_url,
        asset.status,
        asset.error_message
      );
      logger.debug(`sqlite3 - Created image asset for Notion block ${asset.notion_block_id} with ID: ${info.lastInsertRowid}`);
      return Number(info.lastInsertRowid);
    } catch (error: unknown) {
      logger.warn('Failed to create image asset', asError(error));
      throw new DBException('Failed to create image asset', error);
    }
  }

  updateImageAsset(id: number, updates: Partial<Omit<ImageAsset, 'id' | 'created_at'>>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.wp_media_id !== undefined) {
      fields.push('wp_media_id = ?');
      values.push(updates.wp_media_id);
    }
    if (updates.wp_media_url) {
      fields.push('wp_media_url = ?');
      values.push(updates.wp_media_url);
    }
    if (updates.status) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.error_message !== undefined) {
      fields.push('error_message = ?');
      values.push(updates.error_message);
    }

    if (fields.length === 0) return;

    const sql = `UPDATE image_assets SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);

    try {
      this.getDb().prepare(sql).run(...values);
    } catch (error: unknown) {
      logger.warn(`Failed to update image asset ${id} to ${JSON.stringify(updates)}`, asError(error));
      throw new DBException('Failed to update image asset', error);
    }
    logger.debug(`sqlite3 - Updated image asset ${id} with ${JSON.stringify(updates)}`);
  }

  getImageAssetsByJobItem(syncJobItemId: number): ImageAsset[] {
    const sql = 'SELECT * FROM image_assets WHERE sync_job_item_id = ?';

    try {
      const rows = this.getDb().prepare(sql).all(syncJobItemId) as ImageAsset[];
      logger.debug(`sqlite3 - Fetched ${rows.length} image assets for job item ${syncJobItemId}`);
      return rows;
    } catch (error: unknown) {
      logger.warn(`Failed to get image assets for job item ${syncJobItemId}`, asError(error));
      throw new DBException('Failed to get image assets for job item', error);
    }
  }

  // Page Post Map
  createPagePostMap(map: Omit<PagePostMap, 'id' | 'created_at'>): number {
    const sql = `
      INSERT INTO page_post_map (notion_page_id, wp_post_id)
      VALUES (?, ?)
    `;
    let stmt;
    let info;
    try {
      stmt = this.getDb().prepare(sql);
      info = stmt.run(map.notion_page_id, map.wp_post_id);
    } catch (error: unknown) {
      logger.warn(`Failed to create page-post mapping ${map.notion_page_id} -> ${map.wp_post_id}`, asError(error));
      throw new DBException('Failed to create page-post mapping', error);
    }
    const id = Number(info.lastInsertRowid);
    logger.debug(`sqlite3 - Created page-post mapping: ${map.notion_page_id} -> ${map.wp_post_id}`);
    return id;
  }

  getPagePostMap(notionPageId: string): PagePostMap | undefined {
    const sql = 'SELECT * FROM page_post_map WHERE notion_page_id = ?';

    type rowType = PagePostMap | undefined;
    try {
      const row = this.getDb().prepare(sql).get(notionPageId) as rowType;
      logger.debug(`sqlite3 - Fetched page-post mapping for Notion page ${notionPageId}: ${row ? JSON.stringify(row) : 'not found'}`);
      return row;
    } catch (error: unknown) {
      logger.warn(`Failed to get page-post mapping for Notion page ${notionPageId}`, asError(error));
      throw new DBException(`Failed to get page-post mapping for Notion page ${notionPageId}`, error);
    }
  }
}

export const db: IDatabase = new Database();
