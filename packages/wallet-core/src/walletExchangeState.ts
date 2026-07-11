import {
  WALLET_EXCHANGE_V2_HOSPITAL_CODES,
  type WalletExchangeHospitalCode,
  type WalletSyncAck,
  type WalletSyncAckOutcome,
  type WalletSyncChange,
  type WalletSyncPage,
  type WalletSyncStatusChange,
  type WalletSyncUpsertChange,
} from "@trustcare/contracts";
/*
 * Keep wire-level field names and enum values owned by @trustcare/contracts;
 * this file only adds patient-controlled persistence policy and reducers.
 */
import type { WalletDocumentRecordV2 } from "./walletDocumentV2";

export const WALLET_EXCHANGE_STATE_VERSION =
  "2026.07.wallet-exchange-state.v1" as const;

export type WalletExchangePartition = {
  portalOrigin: string;
  holderDid: string;
  key: string;
};

/**
 * Evidence produced by the live Portal DID/JWKS verifier before a synced
 * credential is allowed into the patient document store. The expected DID is
 * discovered from the current Portal contract; this module deliberately has
 * no static issuer-DID fallback.
 */
export type WalletExchangeIssuerEvidence = {
  hospitalCode: WalletExchangeHospitalCode;
  expectedIssuerDid: string;
  didDocumentId: string;
  credentialIssuerDid: string;
  proofVerified: boolean;
  issuerActive: boolean;
  checkedAt: string;
};

export type WalletExchangePreparedUpsertChange = WalletSyncUpsertChange & {
  /** Present only after a signed credential has been normalized to V2. */
  document?: WalletDocumentRecordV2;
  issuerEvidence?: WalletExchangeIssuerEvidence;
};

export type WalletExchangePreparedStatusChange = WalletSyncStatusChange;

export type WalletExchangePreparedChange =
  WalletExchangePreparedUpsertChange | WalletExchangePreparedStatusChange;

export type WalletExchangePreparedSyncPage = Omit<WalletSyncPage, "changes"> & {
  /** Cursor used to request this page; absent only for the initial page. */
  requestCursor?: string;
  /** Stable across retries, including retries after a renewed session. */
  ackIdempotencyKey: string;
  changes: WalletExchangePreparedChange[];
};

export type WalletExchangeAckResult = {
  eventId: string;
  outcome: WalletSyncAckOutcome;
  reasonCode?: string;
};

export type WalletExchangePendingAck = {
  syncId: string;
  cursor: string;
  idempotencyKey: string;
  results: WalletExchangeAckResult[];
  createdAt: string;
};

export type WalletExchangeAckReceipt = Pick<
  WalletSyncAck,
  "receiptId" | "syncId" | "acceptedAt" | "idempotent"
> & {
  cursor: string;
};

export type WalletExchangeEventReceipt = {
  eventId: string;
  fingerprint: string;
  syncId: string;
  cursor: string;
  ordinal: number;
  occurredAt: string;
  credentialId: string;
  changeType: WalletSyncChange["type"];
  outcome: WalletSyncAckOutcome;
  reasonCode?: string;
  processedAt: string;
};

export type WalletExchangeCredentialHistoryEntry = {
  historyId: string;
  lineageKey: string;
  credentialId: string;
  document: WalletDocumentRecordV2;
  archivedAt: string;
  causeEventId: string;
  reason: "replaced_by_version" | "lifecycle_status_changed";
  replacedByDocumentId?: string;
  lifecycleStatus?: WalletSyncStatusChange["status"];
};

export type WalletExchangeQuarantineReason =
  | "unsigned_metadata"
  | "portal_patient_id_forbidden"
  | "holder_mismatch"
  | "proof_missing"
  | "proof_invalid"
  | "issuer_unresolved"
  | "issuer_inactive"
  | "issuer_conflict"
  | "source_conflict"
  | "content_hash_mismatch"
  | "document_missing"
  | "document_conflict"
  | "version_conflict"
  | "credential_not_found"
  | "event_id_conflict";

export type WalletExchangeQuarantineEntry = {
  quarantineId: string;
  eventId: string;
  syncId: string;
  credentialId: string;
  changeType: WalletSyncChange["type"];
  occurredAt: string;
  quarantinedAt: string;
  reason: WalletExchangeQuarantineReason;
  detail: string;
  contentHash?: string;
  issuerDid?: string | null;
  holderDid?: string;
  lineageKey?: string;
  document?: WalletDocumentRecordV2;
};

export type WalletExchangeLineage = {
  lineageKey: string;
  activeDocumentId: string;
  credentialId: string;
  version: string;
  contentHash: string;
  updatedAt: string;
};

export type WalletExchangeRetryOperation =
  | "sync_ack"
  | "credential_request"
  | "submission"
  | "share_gateway_publication";

export type WalletExchangeRetryState =
  | "pending"
  | "in_flight"
  | "retry_scheduled"
  | "succeeded"
  | "terminal_failure";

export type WalletExchangeRetryJournalEntry = {
  operationId: string;
  operation: WalletExchangeRetryOperation;
  idempotencyKey: string;
  requestDigest: `sha256:${string}`;
  state: WalletExchangeRetryState;
  attemptCount: number;
  transportAttemptIds: string[];
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  lastHttpStatus?: number;
  lastErrorCode?: string;
};

export type WalletExchangeState = {
  version: typeof WALLET_EXCHANGE_STATE_VERSION;
  partition: WalletExchangePartition;
  nextCursor?: string;
  documents: WalletDocumentRecordV2[];
  lineages: WalletExchangeLineage[];
  history: WalletExchangeCredentialHistoryEntry[];
  processedEvents: WalletExchangeEventReceipt[];
  quarantine: WalletExchangeQuarantineEntry[];
  pendingAck?: WalletExchangePendingAck;
  lastAckReceipt?: WalletExchangeAckReceipt;
  retryJournal: WalletExchangeRetryJournalEntry[];
};

export type WalletExchangeAtomicCommitPlan = {
  partitionKey: string;
  expectedCursor?: string;
  documents: {
    put: WalletDocumentRecordV2[];
    deleteIds: string[];
  };
  lineages: { put: WalletExchangeLineage[] };
  history: { append: WalletExchangeCredentialHistoryEntry[] };
  events: { put: WalletExchangeEventReceipt[] };
  quarantine: { put: WalletExchangeQuarantineEntry[] };
  nextCursor: string;
  pendingAck: WalletExchangePendingAck;
  replayed: boolean;
};

export type WalletExchangeSyncReduction = {
  state: WalletExchangeState;
  plan: WalletExchangeAtomicCommitPlan;
};

type ChangeApplication = {
  state: WalletExchangeState;
  outcome: WalletSyncAckOutcome;
  reasonCode?: string;
  documentsToPut: WalletDocumentRecordV2[];
  documentIdsToDelete: string[];
  lineagesToPut: WalletExchangeLineage[];
  historyToAppend: WalletExchangeCredentialHistoryEntry[];
  quarantineToPut: WalletExchangeQuarantineEntry[];
};

const allowedHospitalCodes = new Set<WalletExchangeHospitalCode>(
  WALLET_EXCHANGE_V2_HOSPITAL_CODES,
);
const sha256Pattern = /^sha256:[a-f0-9]{64}$/;

export function createWalletExchangePartition(input: {
  portalOrigin: string;
  holderDid: string;
}): WalletExchangePartition {
  const portalOrigin = normalizePortalOrigin(input.portalOrigin);
  const holderDid = input.holderDid.trim();
  if (!holderDid.startsWith("did:key:")) {
    throw new Error("Wallet Exchange holder must use did:key.");
  }
  return {
    portalOrigin,
    holderDid,
    key: `${encodeURIComponent(portalOrigin)}::${encodeURIComponent(holderDid)}`,
  };
}

export function createWalletExchangeState(input: {
  portalOrigin: string;
  holderDid: string;
}): WalletExchangeState {
  return {
    version: WALLET_EXCHANGE_STATE_VERSION,
    partition: createWalletExchangePartition(input),
    documents: [],
    lineages: [],
    history: [],
    processedEvents: [],
    quarantine: [],
    retryJournal: [],
  };
}

/**
 * Reduces one server-ordered sync page to a storage-agnostic atomic commit.
 * A storage adapter must commit every field in the plan before sending ACK.
 */
export function prepareWalletExchangeSyncCommit(
  current: WalletExchangeState,
  page: WalletExchangePreparedSyncPage,
): WalletExchangeSyncReduction {
  assertState(current);
  assertSyncPage(current, page);

  if (current.pendingAck) {
    if (
      current.pendingAck.syncId === page.syncId &&
      current.pendingAck.cursor === page.nextCursor &&
      current.pendingAck.idempotencyKey === page.ackIdempotencyKey
    ) {
      return {
        state: current,
        plan: emptyReplayPlan(current, current.pendingAck),
      };
    }
    throw new Error(
      "Wallet Exchange must ACK the atomically committed sync page before applying another page.",
    );
  }

  let next = cloneValue(current);
  const documentsToPut = new Map<string, WalletDocumentRecordV2>();
  const documentIdsToDelete = new Set<string>();
  const lineagesToPut = new Map<string, WalletExchangeLineage>();
  const historyToAppend: WalletExchangeCredentialHistoryEntry[] = [];
  const eventsToPut: WalletExchangeEventReceipt[] = [];
  const quarantineToPut: WalletExchangeQuarantineEntry[] = [];
  const ackResults: WalletExchangeAckResult[] = [];
  const pageEventIds = new Set<string>();

  for (const change of page.changes) {
    const fingerprint = changeFingerprint(change);
    const prior = next.processedEvents.find(
      (receipt) => receipt.eventId === change.eventId,
    );
    if (prior) {
      ackResults.push(
        prior.fingerprint === fingerprint
          ? replayAckResult(prior)
          : {
              eventId: change.eventId,
              outcome: "rejected",
              reasonCode: "event_id_conflict",
            },
      );
      if (prior.fingerprint !== fingerprint) {
        const entry = quarantineEntry(
          page,
          change,
          "event_id_conflict",
          "The Portal reused an eventId for different credential state.",
        );
        next.quarantine.push(entry);
        quarantineToPut.push(entry);
      }
      continue;
    }
    if (pageEventIds.has(change.eventId)) continue;
    pageEventIds.add(change.eventId);

    const applied =
      change.type === "credential.upsert"
        ? applyUpsert(next, page, change)
        : applyStatus(next, page, change);
    next = applied.state;
    for (const document of applied.documentsToPut)
      documentsToPut.set(document.id, document);
    for (const id of applied.documentIdsToDelete) {
      documentsToPut.delete(id);
      documentIdsToDelete.add(id);
    }
    for (const lineage of applied.lineagesToPut)
      lineagesToPut.set(lineage.lineageKey, lineage);
    historyToAppend.push(...applied.historyToAppend);
    quarantineToPut.push(...applied.quarantineToPut);

    const receipt: WalletExchangeEventReceipt = {
      eventId: change.eventId,
      fingerprint,
      syncId: page.syncId,
      cursor: page.nextCursor,
      ordinal: nextEventOrdinal(next),
      occurredAt: change.occurredAt,
      credentialId: change.credentialId,
      changeType: change.type,
      outcome: applied.outcome,
      reasonCode: applied.reasonCode,
      processedAt: page.serverTime,
    };
    next.processedEvents.push(receipt);
    eventsToPut.push(receipt);
    ackResults.push({
      eventId: change.eventId,
      outcome: applied.outcome,
      reasonCode: applied.reasonCode,
    });
  }

  const pendingAck: WalletExchangePendingAck = {
    syncId: page.syncId,
    cursor: page.nextCursor,
    idempotencyKey: requireNonEmpty(
      page.ackIdempotencyKey,
      "ackIdempotencyKey",
    ),
    results: ackResults,
    createdAt: page.serverTime,
  };
  next.nextCursor = page.nextCursor;
  next.pendingAck = pendingAck;

  return {
    state: next,
    plan: {
      partitionKey: next.partition.key,
      expectedCursor: current.nextCursor,
      documents: {
        put: [...documentsToPut.values()],
        deleteIds: [...documentIdsToDelete],
      },
      lineages: { put: [...lineagesToPut.values()] },
      history: { append: historyToAppend },
      events: { put: eventsToPut },
      quarantine: { put: quarantineToPut },
      nextCursor: page.nextCursor,
      pendingAck,
      replayed: false,
    },
  };
}

export function applyWalletExchangeAckReceipt(
  current: WalletExchangeState,
  input: WalletSyncAck & { cursor: string },
): WalletExchangeState {
  assertState(current);
  if (input.schema !== "trustcare.wallet.sync-ack.v1") {
    throw new Error(`Unsupported Wallet Exchange ACK schema: ${input.schema}.`);
  }
  if (!current.pendingAck) {
    if (
      current.lastAckReceipt?.receiptId === input.receiptId &&
      current.lastAckReceipt.syncId === input.syncId &&
      current.lastAckReceipt.cursor === input.cursor
    ) {
      return current;
    }
    throw new Error("Wallet Exchange has no pending sync ACK.");
  }
  if (
    current.pendingAck.syncId !== input.syncId ||
    current.pendingAck.cursor !== input.cursor
  ) {
    throw new Error(
      "Wallet Exchange ACK does not match the pending sync page.",
    );
  }
  if (
    stableJson(ackSummary(current.pendingAck.results)) !==
    stableJson(input.summary)
  ) {
    throw new Error(
      "Wallet Exchange ACK summary does not cover the pending event results.",
    );
  }
  return {
    ...current,
    pendingAck: undefined,
    lastAckReceipt: {
      receiptId: input.receiptId,
      syncId: input.syncId,
      cursor: input.cursor,
      acceptedAt: input.acceptedAt,
      idempotent: input.idempotent,
    },
  };
}

export function enqueueWalletExchangeRetry(
  current: WalletExchangeState,
  input: Omit<
    WalletExchangeRetryJournalEntry,
    | "state"
    | "attemptCount"
    | "transportAttemptIds"
    | "updatedAt"
    | "lastAttemptAt"
    | "nextAttemptAt"
    | "lastHttpStatus"
    | "lastErrorCode"
  >,
): WalletExchangeState {
  assertState(current);
  assertRequestDigest(input.requestDigest);
  const idempotencyKey = requireNonEmpty(
    input.idempotencyKey,
    "idempotencyKey",
  );
  const operationId = requireNonEmpty(input.operationId, "operationId");
  const byId = current.retryJournal.find(
    (entry) => entry.operationId === operationId,
  );
  const byKey = current.retryJournal.find(
    (entry) => entry.idempotencyKey === idempotencyKey,
  );
  const existing = byId ?? byKey;
  if (existing) {
    if (
      existing.operationId !== operationId ||
      existing.operation !== input.operation ||
      existing.idempotencyKey !== idempotencyKey ||
      existing.requestDigest !== input.requestDigest
    ) {
      throw new Error(
        "Wallet Exchange idempotency key or operationId was reused for a different request.",
      );
    }
    return current;
  }
  const entry: WalletExchangeRetryJournalEntry = {
    operationId,
    operation: input.operation,
    idempotencyKey,
    requestDigest: input.requestDigest,
    state: "pending",
    attemptCount: 0,
    transportAttemptIds: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
  return { ...current, retryJournal: [...current.retryJournal, entry] };
}

export function beginWalletExchangeRetryAttempt(
  current: WalletExchangeState,
  input: {
    operationId: string;
    transportAttemptId: string;
    attemptedAt: string;
  },
): WalletExchangeState {
  const attemptId = requireNonEmpty(
    input.transportAttemptId,
    "transportAttemptId",
  );
  return updateRetryEntry(current, input.operationId, (entry) => {
    if (entry.state === "succeeded" || entry.state === "terminal_failure") {
      throw new Error(
        `Wallet Exchange operation ${entry.operationId} is final.`,
      );
    }
    if (entry.state === "in_flight") {
      throw new Error(
        `Wallet Exchange operation ${entry.operationId} already has an in-flight attempt.`,
      );
    }
    if (entry.transportAttemptIds.includes(attemptId)) {
      throw new Error(
        "Each transport retry must use a new attempt identifier and a new DPoP proof.",
      );
    }
    return {
      ...entry,
      state: "in_flight",
      attemptCount: entry.attemptCount + 1,
      transportAttemptIds: [...entry.transportAttemptIds, attemptId],
      lastAttemptAt: input.attemptedAt,
      nextAttemptAt: undefined,
      updatedAt: input.attemptedAt,
    };
  });
}

export function scheduleWalletExchangeRetry(
  current: WalletExchangeState,
  input: {
    operationId: string;
    retryAt: string;
    updatedAt: string;
    errorCode?: string;
    httpStatus?: number;
  },
): WalletExchangeState {
  return updateRetryEntry(current, input.operationId, (entry) => {
    if (entry.state !== "in_flight") {
      throw new Error("Only an in-flight Wallet Exchange operation can retry.");
    }
    return {
      ...entry,
      state: "retry_scheduled",
      nextAttemptAt: input.retryAt,
      lastErrorCode: input.errorCode,
      lastHttpStatus: input.httpStatus,
      updatedAt: input.updatedAt,
    };
  });
}

export function completeWalletExchangeRetry(
  current: WalletExchangeState,
  input: { operationId: string; completedAt: string },
): WalletExchangeState {
  return updateRetryEntry(current, input.operationId, (entry) => {
    if (entry.state !== "in_flight") {
      throw new Error(
        "Only an in-flight Wallet Exchange operation can complete.",
      );
    }
    return {
      ...entry,
      state: "succeeded",
      nextAttemptAt: undefined,
      lastErrorCode: undefined,
      lastHttpStatus: undefined,
      updatedAt: input.completedAt,
    };
  });
}

export function failWalletExchangeRetry(
  current: WalletExchangeState,
  input: {
    operationId: string;
    failedAt: string;
    errorCode: string;
    httpStatus?: number;
  },
): WalletExchangeState {
  return updateRetryEntry(current, input.operationId, (entry) => {
    if (entry.state !== "in_flight") {
      throw new Error("Only an in-flight Wallet Exchange operation can fail.");
    }
    return {
      ...entry,
      state: "terminal_failure",
      nextAttemptAt: undefined,
      lastErrorCode: input.errorCode,
      lastHttpStatus: input.httpStatus,
      updatedAt: input.failedAt,
    };
  });
}

export function dueWalletExchangeRetries(
  state: WalletExchangeState,
  now: Date,
): WalletExchangeRetryJournalEntry[] {
  const timestamp = now.getTime();
  return state.retryJournal.filter((entry) => {
    if (entry.state === "pending") return true;
    if (entry.state !== "retry_scheduled" || !entry.nextAttemptAt) return false;
    const due = Date.parse(entry.nextAttemptAt);
    return Number.isFinite(due) && due <= timestamp;
  });
}

function applyUpsert(
  current: WalletExchangeState,
  page: WalletExchangePreparedSyncPage,
  change: WalletExchangePreparedUpsertChange,
): ChangeApplication {
  const invalid = validateUpsert(current.partition, change, page.serverTime);
  if (invalid)
    return rejectChange(current, page, change, invalid.reason, invalid.detail);

  const document = cloneValue(change.document!);
  const credential = change.credential;
  const lineageIndex = current.lineages.findIndex(
    (lineage) => lineage.lineageKey === credential.lineageKey,
  );
  const lineage =
    lineageIndex >= 0 ? current.lineages[lineageIndex] : undefined;
  const existing = lineage
    ? current.documents.find(
        (candidate) => candidate.id === lineage.activeDocumentId,
      )
    : current.documents.find((candidate) => candidate.id === document.id);

  if (existing) {
    const sameVersion =
      existing.lifecycle.versionId === document.lifecycle.versionId;
    if (sameVersion) {
      if (stableJson(existing) === stableJson(document)) {
        return unchangedApplication(current, "already_current");
      }
      return rejectChange(
        current,
        page,
        change,
        "version_conflict",
        "Credential content changed without a new normalized document version.",
      );
    }
  }

  const next = cloneValue(current);
  const history: WalletExchangeCredentialHistoryEntry[] = [];
  const deleteIds: string[] = [];
  if (existing) {
    history.push({
      historyId: `${change.eventId}:${existing.id}:${existing.lifecycle.versionId}`,
      lineageKey: credential.lineageKey,
      credentialId:
        existing.credential.credentialId ??
        lineage?.credentialId ??
        change.credentialId,
      document: cloneValue(existing),
      archivedAt: change.occurredAt,
      causeEventId: change.eventId,
      reason: "replaced_by_version",
      replacedByDocumentId: document.id,
    });
    next.history.push(...history);
    if (existing.id !== document.id) {
      next.documents = next.documents.filter((item) => item.id !== existing.id);
      deleteIds.push(existing.id);
    }
  }

  const documentIndex = next.documents.findIndex(
    (item) => item.id === document.id,
  );
  if (documentIndex >= 0) next.documents[documentIndex] = document;
  else next.documents.push(document);
  next.documents.sort((left, right) => left.id.localeCompare(right.id));

  const nextLineage: WalletExchangeLineage = {
    lineageKey: credential.lineageKey,
    activeDocumentId: document.id,
    credentialId: change.credentialId,
    version: credential.version,
    contentHash: change.contentHash,
    updatedAt: credential.updatedAt,
  };
  if (lineageIndex >= 0) next.lineages[lineageIndex] = nextLineage;
  else next.lineages.push(nextLineage);
  next.lineages.sort((left, right) =>
    left.lineageKey.localeCompare(right.lineageKey),
  );

  return {
    state: next,
    outcome: "applied",
    documentsToPut: [document],
    documentIdsToDelete: deleteIds,
    lineagesToPut: [nextLineage],
    historyToAppend: history,
    quarantineToPut: [],
  };
}

function applyStatus(
  current: WalletExchangeState,
  page: WalletExchangePreparedSyncPage,
  change: WalletExchangePreparedStatusChange,
): ChangeApplication {
  const lineage = current.lineages.find(
    (candidate) => candidate.credentialId === change.credentialId,
  );
  const existing = lineage
    ? current.documents.find((item) => item.id === lineage.activeDocumentId)
    : current.documents.find(
        (item) =>
          item.credential.credentialId === change.credentialId ||
          item.id === change.credentialId,
      );
  if (!existing) {
    return rejectChange(
      current,
      page,
      change,
      "credential_not_found",
      "Lifecycle status referenced a credential that is not in this holder partition.",
    );
  }

  const next = cloneValue(current);
  const history: WalletExchangeCredentialHistoryEntry = {
    historyId: `${change.eventId}:${existing.id}:${existing.lifecycle.versionId}`,
    lineageKey: lineage?.lineageKey ?? change.credentialId,
    credentialId: change.credentialId,
    document: cloneValue(existing),
    archivedAt: change.lifecycle.effectiveAt,
    causeEventId: change.eventId,
    reason: "lifecycle_status_changed",
    lifecycleStatus: change.status,
  };
  const statusCheck = {
    key: "status",
    status: "failed" as const,
    detail: `${change.status}:${change.lifecycle.reasonCode}`,
    checkedAt: change.lifecycle.effectiveAt,
  };
  const updated: WalletDocumentRecordV2 = {
    ...cloneValue(existing),
    lifecycle: {
      ...existing.lifecycle,
      status: change.status,
      versionId: `${existing.lifecycle.versionId}:status:${change.eventId}`,
      updatedAt: change.lifecycle.effectiveAt,
    },
    trust: {
      ...existing.trust,
      state:
        change.status === "revoked"
          ? "revoked"
          : change.status === "expired"
            ? "expired"
            : "pending",
      verifiedAt: undefined,
      checks: [
        ...existing.trust.checks.filter((check) => check.key !== "status"),
        statusCheck,
      ],
    },
  };
  const index = next.documents.findIndex((item) => item.id === existing.id);
  next.documents[index] = updated;
  next.history.push(history);
  if (lineage) {
    const lineageIndex = next.lineages.findIndex(
      (candidate) => candidate.lineageKey === lineage.lineageKey,
    );
    next.lineages[lineageIndex] = {
      ...lineage,
      updatedAt: change.lifecycle.effectiveAt,
    };
  }
  return {
    state: next,
    outcome: "archived",
    reasonCode: change.lifecycle.reasonCode,
    documentsToPut: [updated],
    documentIdsToDelete: [],
    lineagesToPut: lineage
      ? [
          {
            ...lineage,
            updatedAt: change.lifecycle.effectiveAt,
          },
        ]
      : [],
    historyToAppend: [history],
    quarantineToPut: [],
  };
}

function validateUpsert(
  partition: WalletExchangePartition,
  change: WalletExchangePreparedUpsertChange,
  serverTime: string,
): { reason: WalletExchangeQuarantineReason; detail: string } | null {
  const credential = change.credential;
  if (credential.deliveryState === "unsigned_metadata") {
    return {
      reason: "unsigned_metadata",
      detail:
        "Portal delivered metadata without an issuer-signed credential envelope.",
    };
  }
  if (!change.document) {
    return {
      reason: "document_missing",
      detail: "Signed credential was not normalized to WalletDocumentRecordV2.",
    };
  }
  if ("patientId" in credential || change.document.owner.patientId) {
    return {
      reason: "portal_patient_id_forbidden",
      detail: "Wallet Exchange must not trust a Portal patientId.",
    };
  }
  if (
    credential.holderDid !== partition.holderDid ||
    !documentBelongsToHolder(change.document, partition.holderDid)
  ) {
    return {
      reason: "holder_mismatch",
      detail: "Credential holder does not match the did:key state partition.",
    };
  }
  if (!credential.proof?.jwt || !change.document.credential.jwt) {
    return {
      reason: "proof_missing",
      detail: "Signed delivery is missing the original issuer JWT.",
    };
  }
  if (!change.issuerEvidence) {
    return {
      reason: "issuer_unresolved",
      detail:
        "Live Portal did:web/JWKS evidence is required before persistence.",
    };
  }
  const evidence = change.issuerEvidence;
  if (!allowedHospitalCodes.has(evidence.hospitalCode)) {
    return {
      reason: "issuer_unresolved",
      detail: "Issuer is not one of the live TCC/TCP/TCM Portal hospitals.",
    };
  }
  if (!evidence.proofVerified) {
    return {
      reason: "proof_invalid",
      detail: "Issuer JWT did not verify against the live hospital JWKS.",
    };
  }
  if (!evidence.issuerActive) {
    return {
      reason: "issuer_inactive",
      detail: "Live Portal issuer status is not active.",
    };
  }
  const checkedAt = Date.parse(evidence.checkedAt);
  const observedAt = Date.parse(serverTime);
  if (
    !Number.isFinite(checkedAt) ||
    !Number.isFinite(observedAt) ||
    checkedAt > observedAt
  ) {
    return {
      reason: "issuer_unresolved",
      detail: "Live issuer evidence has an invalid or future checkedAt time.",
    };
  }
  const issuerCandidates: Array<string | null | undefined> = [
    credential.issuerDid,
    change.document.provenance.issuerDid,
    credentialDataIssuer(change.document.content.credentialPayload),
    evidence.credentialIssuerDid,
    evidence.didDocumentId,
  ];
  if (
    !evidence.expectedIssuerDid.startsWith("did:web:") ||
    issuerCandidates.some(
      (issuer) => !issuer || issuer !== evidence.expectedIssuerDid,
    ) ||
    (credential.proof.issuer !== null &&
      credential.proof.issuer !== evidence.expectedIssuerDid)
  ) {
    return {
      reason: "issuer_conflict",
      detail:
        "Credential issuer conflicts with the currently resolved live Portal hospital DID; Portal reissue is required.",
    };
  }
  if (
    credential.sourceSystem !== "trustcare_portal" ||
    change.document.provenance.sourceKind !== "trustcare_portal"
  ) {
    return {
      reason: "source_conflict",
      detail:
        "Wallet Exchange credentials must retain TrustCare Portal provenance.",
    };
  }
  if (
    !sha256Pattern.test(change.contentHash) ||
    change.contentHash !== credential.contentHash
  ) {
    return {
      reason: "content_hash_mismatch",
      detail: "Sync change and credential content hashes do not match.",
    };
  }
  if (
    change.credentialId !== credential.credentialId ||
    change.document.credential.credentialId !== change.credentialId ||
    change.document.lifecycle.versionId !== credential.version ||
    change.document.credential.jwt !== credential.proof.jwt
  ) {
    return {
      reason: "document_conflict",
      detail:
        "Normalized document does not match the signed sync credential metadata.",
    };
  }
  return null;
}

function rejectChange(
  current: WalletExchangeState,
  page: WalletExchangePreparedSyncPage,
  change: WalletExchangePreparedChange,
  reason: WalletExchangeQuarantineReason,
  detail: string,
): ChangeApplication {
  const entry = quarantineEntry(page, change, reason, detail);
  const next = cloneValue(current);
  next.quarantine.push(entry);
  return {
    state: next,
    outcome: "rejected",
    reasonCode: reason,
    documentsToPut: [],
    documentIdsToDelete: [],
    lineagesToPut: [],
    historyToAppend: [],
    quarantineToPut: [entry],
  };
}

function quarantineEntry(
  page: WalletExchangePreparedSyncPage,
  change: WalletExchangePreparedChange,
  reason: WalletExchangeQuarantineReason,
  detail: string,
): WalletExchangeQuarantineEntry {
  const upsert = change.type === "credential.upsert" ? change : undefined;
  return {
    quarantineId: `${page.syncId}:${change.eventId}:${reason}`,
    eventId: change.eventId,
    syncId: page.syncId,
    credentialId: change.credentialId,
    changeType: change.type,
    occurredAt: change.occurredAt,
    quarantinedAt: page.serverTime,
    reason,
    detail,
    contentHash: upsert?.contentHash,
    issuerDid: upsert?.credential.issuerDid,
    holderDid: upsert?.credential.holderDid,
    lineageKey: upsert?.credential.lineageKey,
    document: upsert?.document ? cloneValue(upsert.document) : undefined,
  };
}

function unchangedApplication(
  state: WalletExchangeState,
  outcome: WalletSyncAckOutcome,
): ChangeApplication {
  return {
    state,
    outcome,
    documentsToPut: [],
    documentIdsToDelete: [],
    lineagesToPut: [],
    historyToAppend: [],
    quarantineToPut: [],
  };
}

function replayAckResult(
  receipt: WalletExchangeEventReceipt,
): WalletExchangeAckResult {
  return receipt.outcome === "rejected"
    ? {
        eventId: receipt.eventId,
        outcome: "rejected",
        reasonCode: receipt.reasonCode,
      }
    : { eventId: receipt.eventId, outcome: "already_current" };
}

function emptyReplayPlan(
  state: WalletExchangeState,
  pendingAck: WalletExchangePendingAck,
): WalletExchangeAtomicCommitPlan {
  return {
    partitionKey: state.partition.key,
    expectedCursor: state.nextCursor,
    documents: { put: [], deleteIds: [] },
    lineages: { put: [] },
    history: { append: [] },
    events: { put: [] },
    quarantine: { put: [] },
    nextCursor: pendingAck.cursor,
    pendingAck,
    replayed: true,
  };
}

function updateRetryEntry(
  current: WalletExchangeState,
  operationId: string,
  update: (
    entry: WalletExchangeRetryJournalEntry,
  ) => WalletExchangeRetryJournalEntry,
): WalletExchangeState {
  assertState(current);
  const index = current.retryJournal.findIndex(
    (entry) => entry.operationId === operationId,
  );
  if (index < 0) {
    throw new Error(
      `Wallet Exchange retry operation not found: ${operationId}.`,
    );
  }
  const retryJournal = [...current.retryJournal];
  retryJournal[index] = update(retryJournal[index]);
  return { ...current, retryJournal };
}

function assertSyncPage(
  state: WalletExchangeState,
  page: WalletExchangePreparedSyncPage,
): void {
  if (page.schema !== "trustcare.wallet.sync.v2") {
    throw new Error(`Unsupported Wallet Exchange sync schema: ${page.schema}.`);
  }
  if (page.contractVersion !== "2026.07.wallet-exchange.v2") {
    throw new Error(
      `Unsupported Wallet Exchange contract: ${page.contractVersion}.`,
    );
  }
  requireNonEmpty(page.syncId, "syncId");
  requireNonEmpty(page.nextCursor, "nextCursor");
  if ((page as unknown as Record<string, unknown>).patientId !== undefined) {
    throw new Error("Wallet Exchange sync must not contain Portal patientId.");
  }
  const pendingReplay =
    state.pendingAck?.syncId === page.syncId &&
    state.pendingAck.cursor === page.nextCursor &&
    state.pendingAck.idempotencyKey === page.ackIdempotencyKey;
  if (pendingReplay) return;
  if (page.requestCursor !== state.nextCursor) {
    throw new Error(
      "Wallet Exchange sync page cursor does not match the durable partition cursor.",
    );
  }
  if (page.mode === "initial" && state.nextCursor) {
    throw new Error("Initial sync cannot replace an existing durable cursor.");
  }
  if (page.mode === "delta" && !state.nextCursor) {
    throw new Error("Delta sync requires an existing durable cursor.");
  }
}

function assertState(state: WalletExchangeState): void {
  if (state.version !== WALLET_EXCHANGE_STATE_VERSION) {
    throw new Error(
      `Unsupported Wallet Exchange state version: ${state.version}.`,
    );
  }
  const normalized = createWalletExchangePartition(state.partition);
  if (normalized.key !== state.partition.key) {
    throw new Error("Wallet Exchange state partition key is invalid.");
  }
  for (const document of state.documents) {
    if (
      document.owner.patientId ||
      !documentBelongsToHolder(document, state.partition.holderDid)
    ) {
      throw new Error(
        "Wallet Exchange state contains a document outside its holder partition.",
      );
    }
  }
}

function ackSummary(
  results: WalletExchangeAckResult[],
): WalletSyncAck["summary"] {
  return results.reduce<WalletSyncAck["summary"]>(
    (summary, result) => {
      if (result.outcome === "applied") summary.applied += 1;
      else if (result.outcome === "already_current")
        summary.alreadyCurrent += 1;
      else if (result.outcome === "archived") summary.archived += 1;
      else summary.rejected += 1;
      return summary;
    },
    { applied: 0, alreadyCurrent: 0, archived: 0, rejected: 0 },
  );
}

function changeFingerprint(change: WalletExchangePreparedChange): string {
  if (change.type === "credential.status") {
    return [
      change.type,
      change.credentialId,
      change.status,
      change.occurredAt,
      change.lifecycle.effectiveAt,
      change.lifecycle.reasonCode,
    ].join("\u0000");
  }
  return [
    change.type,
    change.credentialId,
    change.status,
    change.occurredAt,
    change.contentHash,
    change.credential.lineageKey,
    change.credential.version,
    change.credential.deliveryState,
    change.credential.issuerDid ?? "",
    change.credential.holderDid,
  ].join("\u0000");
}

function documentBelongsToHolder(
  document: WalletDocumentRecordV2,
  holderDid: string,
): boolean {
  return (
    document.owner.id === holderDid || document.owner.holderDid === holderDid
  );
}

function credentialDataIssuer(
  credential: Record<string, unknown> | undefined,
): string | undefined {
  if (!credential) return undefined;
  if (typeof credential.issuer === "string") return credential.issuer;
  if (
    credential.issuer &&
    typeof credential.issuer === "object" &&
    !Array.isArray(credential.issuer)
  ) {
    const id = (credential.issuer as Record<string, unknown>).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function nextEventOrdinal(state: WalletExchangeState): number {
  return (
    state.processedEvents.reduce(
      (maximum, receipt) => Math.max(maximum, receipt.ordinal),
      0,
    ) + 1
  );
}

function assertRequestDigest(
  value: string,
): asserts value is `sha256:${string}` {
  if (!sha256Pattern.test(value)) {
    throw new Error("Wallet Exchange requestDigest must be lowercase sha256.");
  }
}

function normalizePortalOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Wallet Exchange Portal origin must use HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "Wallet Exchange Portal origin cannot contain credentials, query, or fragment.",
    );
  }
  return url.origin;
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must be a non-empty string.`);
  return normalized;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function cloneValue<T>(value: T): T {
  return globalThis.structuredClone(value);
}
