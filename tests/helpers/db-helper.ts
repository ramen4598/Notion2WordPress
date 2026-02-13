// Description: Helper functions for database testing

import DatabaseConstructor, { type Database as BetterSqliteDatabase } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DEFAULT_SCHEMA_PATH = path.resolve(__dirname, '../../config/schema.sql');

export type TestDbHandle = {
  db: BetterSqliteDatabase;
  teardown: () => void;
};

export function createTestDb(): TestDbHandle {
  const schemaPath = DEFAULT_SCHEMA_PATH;

  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  const db = new DatabaseConstructor(':memory:', {});
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql);

  const teardown = () => {
    db.close();
  };

  return { db, teardown };
}
