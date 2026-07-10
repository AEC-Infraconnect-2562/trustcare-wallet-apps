import { useCallback, useEffect, useMemo, useState } from "react";
import type { WalletDocumentRecordV2 } from "@trustcare/wallet-core";
import { env } from "../env";
import { createMobileWalletRepository } from "../repositories";
import {
  activeOwnerWalletDocuments,
  type OwnerScopedWalletDocumentsLoad,
} from "./mobileWalletDocumentsPolicy";
import { useActiveWalletUser } from "./useActiveWalletUser";

export type MobileWalletDocumentsState = {
  documents: WalletDocumentRecordV2[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

export function useMobileWalletDocuments(): MobileWalletDocumentsState {
  const { userId } = useActiveWalletUser();
  const repository = useMemo(
    () =>
      createMobileWalletRepository({
        runtimeEnvironment: env.runtimeEnvironment,
        ownerUserId: userId,
        demoUserId: userId,
      }),
    [userId],
  );
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [load, setLoad] = useState<OwnerScopedWalletDocumentsLoad | null>(null);
  const activeLoad = activeOwnerWalletDocuments(load, userId);

  useEffect(() => {
    let cancelled = false;
    setLoad({
      ownerUserId: userId,
      documents: [],
      isLoading: true,
      error: null,
    });
    void repository
      .listDocuments({ ownerUserId: userId })
      .then((records) => {
        if (!cancelled) {
          setLoad({
            ownerUserId: userId,
            documents: records,
            isLoading: false,
            error: null,
          });
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoad({
            ownerUserId: userId,
            documents: [],
            isLoading: false,
            error:
              reason instanceof Error
                ? reason.message
                : "ไม่สามารถเปิดคลังเอกสารได้",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshVersion, repository, userId]);

  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);

  return {
    documents: activeLoad.documents,
    isLoading: activeLoad.isLoading,
    error: activeLoad.error,
    refresh,
  };
}
