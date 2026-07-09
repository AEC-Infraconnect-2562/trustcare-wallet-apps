import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  isRecordOfArrays,
  readJsonStorage,
  writeJsonStorage,
} from "../utils/storage";

const scanHistoryStorageKey = "trustcare-wallet-scan-history:v1";
const legacyScanHistoryStorageKey = "trustcare-wallet-scan-history";

export type UseScanHistoryResult<TScanOutcome> = {
  scanHistory: TScanOutcome[];
  scanHistoryByUser: Record<string, TScanOutcome[]>;
  setScanHistoryByUser: Dispatch<
    SetStateAction<Record<string, TScanOutcome[]>>
  >;
};

export function useScanHistory<TScanOutcome>(
  selectedUserId: string,
): UseScanHistoryResult<TScanOutcome> {
  const [scanHistoryByUser, setScanHistoryByUser] = useState<
    Record<string, TScanOutcome[]>
  >(() => readScanHistory<TScanOutcome>());

  useEffect(() => {
    writeScanHistory(scanHistoryByUser);
  }, [scanHistoryByUser]);

  return {
    scanHistory: scanHistoryByUser[selectedUserId] ?? [],
    scanHistoryByUser,
    setScanHistoryByUser,
  };
}

function readScanHistory<TScanOutcome>(): Record<string, TScanOutcome[]> {
  return readJsonStorage<Record<string, TScanOutcome[]>>(
    scanHistoryStorageKey,
    {
      fallback: {},
      legacyKeys: [legacyScanHistoryStorageKey],
      validate: isRecordOfArrays,
    },
  );
}

function writeScanHistory<TScanOutcome>(value: Record<string, TScanOutcome[]>) {
  writeJsonStorage(scanHistoryStorageKey, value);
}
