import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RuntimeEnvironment,
  WalletDocumentQuery,
  WalletDocumentRecordV2,
} from "@trustcare/wallet-core";
import { createWalletRepository } from "../repositories/walletRepositoryFactory";

export type UseWalletDocumentsOptions = {
  runtimeEnvironment: RuntimeEnvironment;
  userId: string;
  apiUrl: string;
  search?: string;
};

export function useWalletDocuments(options: UseWalletDocumentsOptions) {
  const [records, setRecords] = useState<WalletDocumentRecordV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const repository = useMemo(
    () =>
      createWalletRepository({
        runtimeEnvironment: options.runtimeEnvironment,
        userId: options.userId,
        apiUrl: options.apiUrl,
      }),
    [options.apiUrl, options.runtimeEnvironment, options.userId],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const query: WalletDocumentQuery = {
      ownerUserId: options.userId,
      search: options.search?.trim() || undefined,
    };
    void repository
      .listDocuments(query)
      .then((nextRecords) => {
        if (!active) return;
        setRecords(nextRecords);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setRecords([]);
        setError(
          reason instanceof Error
            ? reason.message
            : "Wallet repository could not list documents.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [options.search, options.userId, repository, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { records, loading, error, reload, repository };
}
