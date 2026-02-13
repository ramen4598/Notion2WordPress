import { IDatabase } from '../interface/IDatabase.js';
import DatabaseConstructor, { type Database as BetterSqliteDatabase } from 'better-sqlite3';
import { logger } from '../../../lib/logger.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { JobType, JobStatus } from '../enum/db.enums.js';
import { JobRow } from '../model/job.js';
import { PageRow } from '../model/page.js';
import { ImageAsset } from '../model/imageAsset.js';
import { NotionPagePostMap } from '../model/nPagePostMap.js';
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
    try {
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

  // Jobs
  createJob(jobType: JobType): number {
    const sql = `
      INSERT INTO jobs (job_type, status, pages_processed, pages_succeeded, pages_failed)
      VALUES (?, ?, 0, 0, 0)
    `;

    let stmt;
    let info;
    try {
      stmt = this.getDb().prepare(sql);
      info = stmt.run(jobType, JobStatus.Running);
    } catch (error: unknown) {
      logger.warn('Failed to create job', asError(error));
      throw new DBException('Failed to create job', error);
    }

    const id = Number(info.lastInsertRowid);
    logger.debug(`sqlite3 - Created job with ID: ${id}`);
    return id;
  }

  updateJob(
    id: number,
    updates: Partial<Omit<JobRow, 'id' | 'started_at'>> // id and started_at are not updatable
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

    const sql = `UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);

    try {
      const stmt = this.getDb().prepare(sql);
      stmt.run(...values);
    } catch (error: unknown) {
      logger.warn(`Failed to update job ${id} to ${JSON.stringify(updates)}`, asError(error));
      throw new DBException('Failed to update job', error);
    }
    logger.debug(`sqlite3 - Updated job ${id} with ${JSON.stringify(updates)}`);
  }

  getJob(id: number): JobRow | undefined {
    const sql = 'SELECT * FROM jobs WHERE id = ?';

    type rowType = JobRow | undefined;
    try {
      const job = this.getDb().prepare(sql).get(id) as rowType;
      logger.debug(`sqlite3 - Fetched job ${id}: ${job ? JSON.stringify(job) : 'not found'}`);
      return job;
    } catch (error: unknown) {
      logger.warn(`Failed to get job ${id}`, asError(error));
      throw new DBException(`Failed to get job ${id}`, error);
    }
  }

  getLastSyncTimestamp(): string | undefined {
    const sql = `
      SELECT last_sync_timestamp
      FROM jobs
      WHERE status = ? AND last_sync_timestamp IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 1
    `;

    try {
      const row = this.getDb().prepare(sql).get(JobStatus.Completed) as
        | { last_sync_timestamp: string }
        | undefined;
      logger.debug(
        `sqlite3 - Fetched last sync timestamp: ${row ? row.last_sync_timestamp : 'none'}`
      );
      return row ? row.last_sync_timestamp : undefined;
    } catch (error: unknown) {
      logger.warn('Failed to get last sync timestamp', asError(error));
      throw new DBException(`Failed to get last sync timestamp`, error);
    }
  }

  // Pages
  createPage(page: Omit<PageRow, 'id' | 'created_at' | 'updated_at'>): number {
    const sql = `
      INSERT INTO pages (job_id, notion_page_id, wp_post_id, status)
      VALUES (?, ?, ?, ?)
    `;
    try {
      const stmt = this.getDb().prepare(sql);
      const info = stmt.run(page.job_id, page.notion_page_id, page.wp_post_id, page.status);
      logger.debug(
        `sqlite3 - Created page row for Notion page ${page.notion_page_id} with ID: ${info.lastInsertRowid}`
      );
      return Number(info.lastInsertRowid);
    } catch (error: unknown) {
      logger.warn('Failed to create page row', asError(error));
      throw new DBException('Failed to create page row', error);
    }
  }

  updatePage(id: number, updates: Partial<Omit<PageRow, 'id' | 'created_at'>>): void {
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

    const sql = `UPDATE pages SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    try {
      this.getDb()
        .prepare(sql)
        .run(...values);
    } catch (error: unknown) {
      logger.warn(`Failed to update page ${id} to ${JSON.stringify(updates)}`, asError(error));
      throw new DBException('Failed to update page', error);
    }
    logger.debug(`sqlite3 - Updated page ${id} with ${JSON.stringify(updates)}`);
  }

  // Image Assets
  createImageAsset(asset: Omit<ImageAsset, 'id' | 'created_at'>): number {
    const sql = `
      INSERT INTO image_assets (
        page_id, notion_page_id, notion_block_id, notion_url,
        wp_media_id, wp_media_url, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    try {
      const stmt = this.getDb().prepare(sql);
      const info = stmt.run(
        asset.page_id,
        asset.notion_page_id,
        asset.notion_block_id,
        asset.notion_url,
        asset.wp_media_id,
        asset.wp_media_url,
        asset.status,
        asset.error_message
      );
      logger.debug(
        `sqlite3 - Created image asset for Notion block ${asset.notion_block_id} with ID: ${info.lastInsertRowid}`
      );
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
      this.getDb()
        .prepare(sql)
        .run(...values);
    } catch (error: unknown) {
      logger.warn(
        `Failed to update image asset ${id} to ${JSON.stringify(updates)}`,
        asError(error)
      );
      throw new DBException('Failed to update image asset', error);
    }
    logger.debug(`sqlite3 - Updated image asset ${id} with ${JSON.stringify(updates)}`);
  }

  getImageAssetsByPage(pageId: number): ImageAsset[] {
    const sql = 'SELECT * FROM image_assets WHERE page_id = ?';

    try {
      const rows = this.getDb().prepare(sql).all(pageId) as ImageAsset[];
      logger.debug(`sqlite3 - Fetched ${rows.length} image assets for page ${pageId}`);
      return rows;
    } catch (error: unknown) {
      logger.warn(`Failed to get image assets for page ${pageId}`, asError(error));
      throw new DBException('Failed to get image assets for page', error);
    }
  }

  // Page Post Map
  createNPagePostMap(map: Omit<NotionPagePostMap, 'id' | 'created_at'>): number {
    const sql = `
      INSERT INTO npage_post_map (notion_page_id, wp_post_id)
      VALUES (?, ?)
    `;
    let stmt;
    let info;
    try {
      stmt = this.getDb().prepare(sql);
      info = stmt.run(map.notion_page_id, map.wp_post_id);
    } catch (error: unknown) {
      logger.warn(
        `Failed to create Notion page -> WordPress post mapping ${map.notion_page_id} -> ${map.wp_post_id}`,
        asError(error)
      );
      throw new DBException('Failed to create Notion page -> WordPress post mapping', error);
    }
    const id = Number(info.lastInsertRowid);
    logger.debug(
      `sqlite3 - Created Notion page -> WordPress post mapping: ${map.notion_page_id} -> ${map.wp_post_id}`
    );
    return id;
  }

  getNPagePostMap(notionPageId: string): NotionPagePostMap | undefined {
    const sql = 'SELECT * FROM npage_post_map WHERE notion_page_id = ?';

    type rowType = NotionPagePostMap | undefined;
    try {
      const row = this.getDb().prepare(sql).get(notionPageId) as rowType;
      logger.debug(
        `sqlite3 - Fetched Notion page -> WordPress post mapping for Notion page ${notionPageId}: ${row ? JSON.stringify(row) : 'not found'}`
      );
      return row;
    } catch (error: unknown) {
      logger.warn(
        `Failed to get Notion page -> WordPress post mapping for Notion page ${notionPageId}`,
        asError(error)
      );
      throw new DBException(
        `Failed to get Notion page -> WordPress post mapping for Notion page ${notionPageId}`,
        error
      );
    }
  }
}

export const db: IDatabase = new Database();
