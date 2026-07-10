import {
  photoBearingCredentialTypes,
  photoCandidatesForCard,
  type PhotoCandidate,
  type WalletCard,
} from "@trustcare/wallet-core";

const photoDocumentTypes = new Set<string>(photoBearingCredentialTypes);

export function photoCandidatesForNativeDocument(
  card: WalletCard,
  documentType: string,
): PhotoCandidate[] {
  return photoDocumentTypes.has(documentType)
    ? photoCandidatesForCard(card)
    : [];
}
