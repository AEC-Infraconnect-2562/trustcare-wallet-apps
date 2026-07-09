import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { WalletStoredObject } from "@trustcare/wallet-core";
import {
  isRecordOfArrays,
  readJsonStorage,
  writeJsonStorage,
} from "../utils/storage";

const storedExtrasStorageKey = "trustcare-wallet-store-extras:v1";
const legacyStoredExtrasStorageKey = "trustcare-wallet-store-extras";

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
  return readJsonStorage<Record<string, WalletStoredObject[]>>(
    storedExtrasStorageKey,
    {
      fallback: {},
      legacyKeys: [legacyStoredExtrasStorageKey],
      validate: isRecordOfArrays,
    },
  );
}

function writeStoredExtras(value: Record<string, WalletStoredObject[]>) {
  writeJsonStorage(storedExtrasStorageKey, value);
}
