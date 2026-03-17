import * as SQLite from 'expo-sqlite';
import type { Product } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('coachfit.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS products (
        barcode TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT NOT NULL,
        data TEXT NOT NULL,
        scanned_at TEXT NOT NULL
      );
    `);
  }
  return db;
}

export async function getCachedProduct(barcode: string): Promise<Product | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ data: string }>(
    'SELECT data FROM products WHERE barcode = ?',
    [barcode]
  );
  if (!row) return null;
  return JSON.parse(row.data) as Product;
}

export async function saveProduct(product: Product): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO products (barcode, name, brand, data, scanned_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      product.barcode,
      product.name,
      product.brand,
      JSON.stringify(product),
      product.scannedAt,
    ]
  );
}

export async function getHistory(limit: number = 50): Promise<Product[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{ data: string }>(
    'SELECT data FROM products ORDER BY scanned_at DESC LIMIT ?',
    [limit]
  );
  return rows.map((row) => JSON.parse(row.data) as Product);
}

export async function clearHistory(): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM products');
}
