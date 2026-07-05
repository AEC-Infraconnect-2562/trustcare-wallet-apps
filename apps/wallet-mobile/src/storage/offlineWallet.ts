import * as SQLite from "expo-sqlite";
import type { WalletCard, WalletStoredObject } from "@trustcare/wallet-core";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function db() {
  dbPromise ??= SQLite.openDatabaseAsync("trustcare_wallet.db");
  return dbPromise;
}

export async function initOfflineWallet() {
  const database = await db();
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS wallet_cards (
      id INTEGER PRIMARY KEY NOT NULL,
      owner_user_id TEXT,
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qr_cache (
      card_id INTEGER PRIMARY KEY NOT NULL,
      owner_user_id TEXT,
      qr_data TEXT NOT NULL,
      presentation_id TEXT NOT NULL,
      expires_at TEXT,
      generated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wallet_objects (
      id TEXT PRIMARY KEY NOT NULL,
      owner_user_id TEXT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  await ensureColumn(database, "wallet_cards", "owner_user_id", "TEXT");
  await ensureColumn(database, "qr_cache", "owner_user_id", "TEXT");
  await ensureColumn(database, "wallet_objects", "owner_user_id", "TEXT");
}

async function ensureColumn(database: SQLite.SQLiteDatabase, table: string, column: string, definition: string) {
  try {
    await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch {
    // Existing installations already have the column.
  }
}

export async function cacheCards(cards: WalletCard[], ownerUserId?: string) {
  const database = await db();
  await initOfflineWallet();
  await database.withTransactionAsync(async () => {
    if (ownerUserId) {
      await database.runAsync("DELETE FROM wallet_cards WHERE owner_user_id = ?", ownerUserId);
    } else {
      await database.runAsync("DELETE FROM wallet_cards");
    }
    for (const card of cards) {
      await database.runAsync(
        "INSERT OR REPLACE INTO wallet_cards (id, owner_user_id, payload, synced_at) VALUES (?, ?, ?, ?)",
        card.id,
        ownerUserId ?? card.ownerUserId ?? null,
        JSON.stringify(card),
        new Date().toISOString()
      );
    }
  });
}

export async function loadCards(ownerUserId?: string): Promise<WalletCard[]> {
  const database = await db();
  await initOfflineWallet();
  const rows = ownerUserId
    ? await database.getAllAsync<{ payload: string }>("SELECT payload FROM wallet_cards WHERE owner_user_id = ? ORDER BY id", ownerUserId)
    : await database.getAllAsync<{ payload: string }>("SELECT payload FROM wallet_cards ORDER BY id");
  return rows.map(row => JSON.parse(row.payload) as WalletCard);
}

export async function cacheQr(cardId: number, qrData: string, presentationId: string, expiresAt?: string, ownerUserId?: string) {
  const database = await db();
  await initOfflineWallet();
  await database.runAsync(
    "INSERT OR REPLACE INTO qr_cache (card_id, owner_user_id, qr_data, presentation_id, expires_at, generated_at) VALUES (?, ?, ?, ?, ?, ?)",
    cardId,
    ownerUserId ?? null,
    qrData,
    presentationId,
    expiresAt ?? null,
    new Date().toISOString()
  );
}

export async function cacheStoredObject(object: WalletStoredObject, ownerUserId?: string) {
  const database = await db();
  await initOfflineWallet();
  await database.runAsync(
    "INSERT OR REPLACE INTO wallet_objects (id, owner_user_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
    object.id,
    ownerUserId ?? null,
    object.type,
    JSON.stringify(object),
    object.createdAt
  );
}

export async function cacheStoredObjects(objects: WalletStoredObject[], ownerUserId?: string) {
  const database = await db();
  await initOfflineWallet();
  await database.withTransactionAsync(async () => {
    if (ownerUserId) {
      await database.runAsync("DELETE FROM wallet_objects WHERE owner_user_id = ?", ownerUserId);
    }
    for (const object of objects) {
      await database.runAsync(
        "INSERT OR REPLACE INTO wallet_objects (id, owner_user_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
        object.id,
        ownerUserId ?? null,
        object.type,
        JSON.stringify(object),
        object.createdAt
      );
    }
  });
}

export async function loadStoredObjects(ownerUserId?: string): Promise<WalletStoredObject[]> {
  const database = await db();
  await initOfflineWallet();
  const rows = ownerUserId
    ? await database.getAllAsync<{ payload: string }>("SELECT payload FROM wallet_objects WHERE owner_user_id = ? ORDER BY created_at DESC", ownerUserId)
    : await database.getAllAsync<{ payload: string }>("SELECT payload FROM wallet_objects ORDER BY created_at DESC");
  return rows.map(row => JSON.parse(row.payload) as WalletStoredObject);
}

export async function clearOfflineWallet() {
  const database = await db();
  await initOfflineWallet();
  await database.execAsync("DELETE FROM wallet_cards; DELETE FROM qr_cache; DELETE FROM wallet_objects;");
}
