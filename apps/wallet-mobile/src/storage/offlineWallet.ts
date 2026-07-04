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
      payload TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qr_cache (
      card_id INTEGER PRIMARY KEY NOT NULL,
      qr_data TEXT NOT NULL,
      presentation_id TEXT NOT NULL,
      expires_at TEXT,
      generated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wallet_objects (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export async function cacheCards(cards: WalletCard[]) {
  const database = await db();
  await initOfflineWallet();
  await database.withTransactionAsync(async () => {
    await database.runAsync("DELETE FROM wallet_cards");
    for (const card of cards) {
      await database.runAsync(
        "INSERT INTO wallet_cards (id, payload, synced_at) VALUES (?, ?, ?)",
        card.id,
        JSON.stringify(card),
        new Date().toISOString()
      );
    }
  });
}

export async function loadCards(): Promise<WalletCard[]> {
  const database = await db();
  await initOfflineWallet();
  const rows = await database.getAllAsync<{ payload: string }>("SELECT payload FROM wallet_cards ORDER BY id");
  return rows.map(row => JSON.parse(row.payload) as WalletCard);
}

export async function cacheQr(cardId: number, qrData: string, presentationId: string, expiresAt?: string) {
  const database = await db();
  await initOfflineWallet();
  await database.runAsync(
    "INSERT OR REPLACE INTO qr_cache (card_id, qr_data, presentation_id, expires_at, generated_at) VALUES (?, ?, ?, ?, ?)",
    cardId,
    qrData,
    presentationId,
    expiresAt ?? null,
    new Date().toISOString()
  );
}

export async function cacheStoredObject(object: WalletStoredObject) {
  const database = await db();
  await initOfflineWallet();
  await database.runAsync(
    "INSERT OR REPLACE INTO wallet_objects (id, type, payload, created_at) VALUES (?, ?, ?, ?)",
    object.id,
    object.type,
    JSON.stringify(object),
    object.createdAt
  );
}

export async function cacheStoredObjects(objects: WalletStoredObject[]) {
  const database = await db();
  await initOfflineWallet();
  await database.withTransactionAsync(async () => {
    for (const object of objects) {
      await database.runAsync(
        "INSERT OR REPLACE INTO wallet_objects (id, type, payload, created_at) VALUES (?, ?, ?, ?)",
        object.id,
        object.type,
        JSON.stringify(object),
        object.createdAt
      );
    }
  });
}

export async function loadStoredObjects(): Promise<WalletStoredObject[]> {
  const database = await db();
  await initOfflineWallet();
  const rows = await database.getAllAsync<{ payload: string }>("SELECT payload FROM wallet_objects ORDER BY created_at DESC");
  return rows.map(row => JSON.parse(row.payload) as WalletStoredObject);
}

export async function clearOfflineWallet() {
  const database = await db();
  await initOfflineWallet();
  await database.execAsync("DELETE FROM wallet_cards; DELETE FROM qr_cache; DELETE FROM wallet_objects;");
}
