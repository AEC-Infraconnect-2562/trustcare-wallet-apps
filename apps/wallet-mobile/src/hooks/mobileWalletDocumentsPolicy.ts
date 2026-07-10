import type { WalletDocumentRecordV2 } from "@trustcare/wallet-core";

export type OwnerScopedWalletDocumentsLoad = {
  ownerUserId: string;
  documents: WalletDocumentRecordV2[];
  isLoading: boolean;
  error: string | null;
};

export function activeOwnerWalletDocuments(
  load: OwnerScopedWalletDocumentsLoad | null,
  ownerUserId: string,
): OwnerScopedWalletDocumentsLoad {
  if (load?.ownerUserId === ownerUserId) return load;
  return {
    ownerUserId,
    documents: [],
    isLoading: true,
    error: null,
  };
}
