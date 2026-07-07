import { useCallback, useEffect, useState } from "react";
import type { WalletCard } from "@trustcare/wallet-core";
import { isExpired } from "@trustcare/wallet-core";
import { toQrDataUrl } from "../utils/qrCode";

type QrCacheEntry = {
  cardId: number;
  qrDataUrl: string;
  qrData: string;
  presentationId: string;
  generatedAt: string;
  expiresAt?: string;
};

const dbName = "trustcare_wallet_apps";
const dbVersion = 1;
const storeCards = "health_cards";
const storeQr = "qr_cache";
const storeMeta = "meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeCards))
        db.createObjectStore(storeCards, { keyPath: "id" });
      if (!db.objectStoreNames.contains(storeQr))
        db.createObjectStore(storeQr, { keyPath: "cardId" });
      if (!db.objectStoreNames.contains(storeMeta))
        db.createObjectStore(storeMeta, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllCards(): Promise<WalletCard[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeCards, "readonly");
    const request = tx.objectStore(storeCards).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function putCards(cards: WalletCard[]) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeCards, "readwrite");
    const store = tx.objectStore(storeCards);
    store.clear();
    for (const card of cards) store.put(card);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function setMeta(key: string, value: unknown) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeMeta, "readwrite");
    tx.objectStore(storeMeta).put({
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function getMeta(key: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeMeta, "readonly");
    const request = tx.objectStore(storeMeta).get(key);
    request.onsuccess = () => resolve(request.result?.value ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function getCachedQr(cardId: number): Promise<QrCacheEntry | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeQr, "readonly");
    const request = tx.objectStore(storeQr).get(cardId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function putCachedQr(entry: QrCacheEntry) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeQr, "readwrite");
    tx.objectStore(storeQr).put(entry);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function useOfflineWallet() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [meta, setMetaState] = useState<{
    isLoaded: boolean;
    lastSyncTime: string | null;
  }>({
    isLoaded: false,
    lastSyncTime: null,
  });
  const [offlineCards, setOfflineCards] = useState<WalletCard[]>([]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void Promise.all([
      getAllCards().catch(() => []),
      getMeta("lastSyncTime").catch(() => null),
    ]).then(([cards, syncTime]) => {
      setOfflineCards(cards);
      setMetaState({ isLoaded: true, lastSyncTime: syncTime });
    });
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const syncCards = useCallback(async (cards: WalletCard[]) => {
    const now = new Date().toISOString();
    await putCards(cards);
    await setMeta("lastSyncTime", now);
    setOfflineCards(cards);
    setMetaState({ isLoaded: true, lastSyncTime: now });
  }, []);

  const cacheQr = useCallback(
    async (
      cardId: number,
      qrData: string,
      presentationId: string,
      expiresAt?: string,
    ) => {
      const qrDataUrl = await toQrDataUrl(qrData, { margin: 1, width: 260 });
      await putCachedQr({
        cardId,
        qrDataUrl,
        qrData,
        presentationId,
        expiresAt,
        generatedAt: new Date().toISOString(),
      });
      return qrDataUrl;
    },
    [],
  );

  const getOfflineQr = useCallback(async (cardId: number) => {
    const cached = await getCachedQr(cardId);
    if (!cached) return null;
    if (isExpired(cached.expiresAt)) return null;
    return cached;
  }, []);

  return {
    isOnline,
    isLoaded: meta.isLoaded,
    offlineCards,
    offlineCardCount: offlineCards.length,
    lastSyncTime: meta.lastSyncTime,
    syncCards,
    cacheQr,
    getOfflineQr,
  };
}
