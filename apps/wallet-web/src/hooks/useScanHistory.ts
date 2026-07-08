import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const scanHistoryStorageKey = "trustcare-wallet-scan-history";

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
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(scanHistoryStorageKey);
    return value ? (JSON.parse(value) as Record<string, TScanOutcome[]>) : {};
  } catch {
    return {};
  }
}

function writeScanHistory<TScanOutcome>(value: Record<string, TScanOutcome[]>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(scanHistoryStorageKey, JSON.stringify(value));
}
