import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { WalletStoredObject } from "@trustcare/wallet-core";

const storedExtrasStorageKey = "trustcare-wallet-store-extras";

export type UseStoredExtrasResult = {
  storedExtras: WalletStoredObject[];
  storedExtrasByUser: Record<string, WalletStoredObject[]>;
  setStoredExtrasByUser: Dispatch<
    SetStateAction<Record<string, WalletStoredObject[]>>
  >;
};

export function useStoredExtras(selectedUserId: string): UseStoredExtrasResult {
  const [storedExtrasByUser, setStoredExtrasByUser] = useState<
    Record<string, WalletStoredObject[]>
  >(() => readStoredExtras());

  useEffect(() => {
    writeStoredExtras(storedExtrasByUser);
  }, [storedExtrasByUser]);

  return {
    storedExtras: storedExtrasByUser[selectedUserId] ?? [],
    storedExtrasByUser,
    setStoredExtrasByUser,
  };
}

function readStoredExtras(): Record<string, WalletStoredObject[]> {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(storedExtrasStorageKey);
    return value
      ? (JSON.parse(value) as Record<string, WalletStoredObject[]>)
      : {};
  } catch {
    return {};
  }
}

function writeStoredExtras(value: Record<string, WalletStoredObject[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storedExtrasStorageKey, JSON.stringify(value));
}
