import type {
  ActivityQuery,
  RuntimeEnvironment,
  WalletActivityEvent,
  WalletDocumentQuery,
  WalletDocumentRecordV2,
} from "@trustcare/wallet-core";

export const WALLET_DOCUMENT_SCHEMA_VERSION = "2.0" as const;

export type WalletRepositoryNamespace = {
  runtimeEnvironment: RuntimeEnvironment;
  ownerUserId: string;
  schemaVersion: typeof WALLET_DOCUMENT_SCHEMA_VERSION;
};

export function createWalletRepositoryNamespace(input: {
  runtimeEnvironment: RuntimeEnvironment;
  ownerUserId: string;
  schemaVersion?: typeof WALLET_DOCUMENT_SCHEMA_VERSION;
}): WalletRepositoryNamespace {
  const ownerUserId = input.ownerUserId.trim();
  if (!ownerUserId) {
    throw new Error("SqliteWalletRepository requires an ownerUserId.");
  }
  return {
    runtimeEnvironment: input.runtimeEnvironment,
    ownerUserId,
    schemaVersion: input.schemaVersion ?? WALLET_DOCUMENT_SCHEMA_VERSION,
  };
}

export function assertDocumentInNamespace(
  namespace: WalletRepositoryNamespace,
  document: WalletDocumentRecordV2,
): void {
  if (document.owner.id !== namespace.ownerUserId) {
    throw new Error(`Wallet document ${document.id} belongs to another owner.`);
  }
  if (document.schemaVersion !== namespace.schemaVersion) {
    throw new Error(
      `Wallet document ${document.id} uses unsupported schema ${document.schemaVersion}.`,
    );
  }
}

export function documentMatchesQuery(
  namespace: WalletRepositoryNamespace,
  document: WalletDocumentRecordV2,
  query: WalletDocumentQuery,
): boolean {
  if (document.owner.id !== namespace.ownerUserId) return false;
  if (query.ownerUserId && query.ownerUserId !== namespace.ownerUserId)
    return false;
  if (
    query.documentTypes?.length &&
    !query.documentTypes.includes(document.documentType)
  )
    return false;
  if (query.categories?.length && !query.categories.includes(document.category))
    return false;
  if (
    query.statuses?.length &&
    !query.statuses.includes(document.lifecycle.status)
  )
    return false;
  if (
    query.trustStates?.length &&
    !query.trustStates.includes(document.trust.state)
  )
    return false;
  if (
    query.sourceSystems?.length &&
    !query.sourceSystems.includes(document.provenance.sourceKind)
  )
    return false;

  const search = query.search?.trim().toLocaleLowerCase();
  if (!search) return true;
  return [
    document.title.th,
    document.title.en,
    document.documentType,
    document.provenance.issuerName,
    document.clinicalContext.facility?.name,
    document.clinicalContext.practitioner?.name,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase().includes(search));
}

export function paginateDocuments(
  documents: WalletDocumentRecordV2[],
  query: Pick<WalletDocumentQuery, "offset" | "limit">,
): WalletDocumentRecordV2[] {
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.max(0, query.limit ?? documents.length);
  return documents.slice(offset, offset + limit);
}

export function activityMatchesQuery(
  namespace: WalletRepositoryNamespace,
  event: WalletActivityEvent,
  query: ActivityQuery,
): boolean {
  if (event.ownerUserId && event.ownerUserId !== namespace.ownerUserId)
    return false;
  if (query.ownerUserId && query.ownerUserId !== namespace.ownerUserId)
    return false;
  if (query.types?.length && !query.types.includes(event.type)) return false;
  const occurredAt = Date.parse(event.occurredAt);
  if (query.from && occurredAt < Date.parse(query.from)) return false;
  if (query.to && occurredAt > Date.parse(query.to)) return false;
  return true;
}
