import {
  CANONICAL_DOCUMENT_CATEGORIES,
  normalizeDocumentType,
  type CanonicalDocumentCategory,
  type WalletDocumentRecordV2,
  type WalletExchangeIssuerEvidence,
  type WalletExchangePreparedUpsertChange,
} from "@trustcare/wallet-core";
import type { WalletSyncUpsertChange } from "@trustcare/contracts";
import {
  portalHospitalDid,
  resolvePortalHospitalIssuer,
  verifyPortalHospitalCredentialJwt,
  type ResolvedPortalHospitalIssuer,
  type TrustCarePortalHospitalCode,
} from "./portalIssuerResolver";
import { normalizePortalOrigin } from "./walletContractLoader";

export type PrepareWalletExchangeCredentialInput = {
  change: WalletSyncUpsertChange;
  portalBaseUrl: string;
  holderDid: string;
  resolvedIssuer?: ResolvedPortalHospitalIssuer;
  fetchImpl?: typeof fetch;
  now?: Date;
};

/**
 * Verifies and normalizes one live sync upsert without re-signing it. Invalid
 * envelopes remain metadata for the state reducer to quarantine.
 */
export async function prepareWalletExchangeCredential(
  input: PrepareWalletExchangeCredentialInput,
): Promise<WalletExchangePreparedUpsertChange> {
  const portalOrigin = normalizePortalOrigin(input.portalBaseUrl);
  const issuerDid = input.change.credential.issuerDid ?? "";
  const hospitalCode = hospitalCodeFromIssuerDid(issuerDid);
  if (!hospitalCode) return { ...input.change };

  const expectedIssuerDid = portalHospitalDid(portalOrigin, hospitalCode);
  let resolvedIssuer = input.resolvedIssuer;
  if (!resolvedIssuer) {
    try {
      resolvedIssuer = await resolvePortalHospitalIssuer({
        portalBaseUrl: portalOrigin,
        hospitalCode,
        fetchImpl: input.fetchImpl,
      });
    } catch {
      return { ...input.change };
    }
  }
  if (
    resolvedIssuer.portalOrigin !== portalOrigin ||
    resolvedIssuer.hospitalCode !== hospitalCode ||
    resolvedIssuer.issuerDid !== expectedIssuerDid ||
    resolvedIssuer.didDocument.id !== expectedIssuerDid ||
    resolvedIssuer.jwks.issuer !== expectedIssuerDid
  ) {
    return { ...input.change };
  }
  const proofJwt = input.change.credential.proof?.jwt;
  const credentialData = input.change.credential.credentialData;
  const contentHashValid = await verifyWalletExchangeContentHash(input.change);
  const verification =
    proofJwt && credentialData
      ? await verifyPortalHospitalCredentialJwt({
          jwt: proofJwt,
          issuer: resolvedIssuer,
          expectedHolderDid: input.holderDid,
          expectedCredentialData: credentialData,
          now: input.now,
        })
      : {
          verified: false,
          status: "unknown" as const,
          errors: ["credential_proof_missing"],
        };
  const proofMetadataMatches = Boolean(
    input.change.credential.proof &&
    input.change.credential.proof.type === "jwt" &&
    input.change.credential.proof.alg === verification.alg &&
    input.change.credential.proof.kid === verification.kid &&
    input.change.credential.proof.issuer === issuerDid,
  );
  const signedTypeMatches = credentialData
    ? signedCredentialTypeMatches(input.change, credentialData)
    : false;
  const checkedAt = (input.now ?? new Date()).toISOString();
  const issuerEvidence: WalletExchangeIssuerEvidence = {
    hospitalCode,
    expectedIssuerDid,
    didDocumentId: resolvedIssuer.didDocument.id,
    credentialIssuerDid: issuerDid,
    proofVerified:
      verification.verified &&
      contentHashValid &&
      proofMetadataMatches &&
      signedTypeMatches,
    issuerActive: resolvedIssuer.didDocument.assertionMethod.includes(
      resolvedIssuer.activeAssertionMethod.id,
    ),
    checkedAt,
  };
  const document =
    verification.verified &&
    contentHashValid &&
    proofMetadataMatches &&
    signedTypeMatches &&
    credentialData &&
    input.change.credential.deliveryState === "signed"
      ? walletDocumentFromSyncedCredential({
          change: input.change,
          credentialData,
          portalOrigin,
          holderDid: input.holderDid,
          checkedAt,
          issuerName:
            resolvedIssuer.didDocument.trustcare.nameEn ??
            resolvedIssuer.didDocument.trustcare.name,
        })
      : undefined;
  return { ...input.change, issuerEvidence, document };
}

export async function verifyWalletExchangeContentHash(
  change: WalletSyncUpsertChange,
): Promise<boolean> {
  if (!/^sha256:[a-f0-9]{64}$/.test(change.contentHash)) return false;
  const digest = await sha256Hex(
    canonicalJson({
      credentialData: change.credential.credentialData,
      proofJwt: change.credential.proof?.jwt ?? null,
      status: change.status,
    }),
  );
  return (
    change.contentHash === `sha256:${digest}` &&
    change.credential.contentHash === change.contentHash
  );
}

function walletDocumentFromSyncedCredential(input: {
  change: WalletSyncUpsertChange;
  credentialData: Record<string, unknown>;
  portalOrigin: string;
  holderDid: string;
  checkedAt: string;
  issuerName?: string;
}): WalletDocumentRecordV2 | undefined {
  const credential = input.change.credential;
  const documentType = normalizeDocumentType(
    credential.cardType || credential.credentialType,
  );
  if (!documentType) return undefined;
  const category = normalizeCategory(credential.documentCategory);
  const subject = objectRecord(input.credentialData.credentialSubject);
  if (subject.id !== input.holderDid) return undefined;
  const expiresAt =
    credential.expiresAt ?? stringValue(input.credentialData.validUntil);
  const expiryPassed =
    Boolean(expiresAt) &&
    Number.isFinite(Date.parse(String(expiresAt))) &&
    Date.parse(String(expiresAt)) > Date.parse(input.checkedAt);
  const proofJwt = credential.proof?.jwt;
  if (!proofJwt) return undefined;
  const issuerDid = credential.issuerDid ?? undefined;
  return {
    schemaVersion: "2.0",
    id: `portal:${encodeURIComponent(credential.lineageKey)}:${encodeURIComponent(credential.version)}`,
    owner: { id: input.holderDid, holderDid: input.holderDid },
    documentType,
    category,
    title: signedDocumentTitle(input.credentialData, documentType),
    clinicalContext: {
      facility: input.issuerName
        ? { id: issuerDid, name: input.issuerName }
        : issuerDid
          ? { id: issuerDid }
          : undefined,
      recordTime: credential.issuedAt,
    },
    lifecycle: {
      status: "final",
      versionId: credential.version,
      issuedAt: credential.issuedAt,
      updatedAt: credential.updatedAt,
      expiresAt: expiresAt ?? undefined,
    },
    provenance: {
      sourceKind: "trustcare_portal",
      issuerDid,
      issuerName: input.issuerName,
      sourceEndpoint: `${input.portalOrigin}/api/wallet/v2/credentials/sync`,
      receivedAt: input.change.occurredAt,
    },
    content: {
      credentialPayload: input.credentialData,
      documentReference: {
        resourceType: "DocumentReference",
        id: `document-reference-${encodeURIComponent(input.change.credentialId)}`,
        status: "current",
        type: { text: credential.displayNameEn ?? credential.displayName },
        category: [{ text: category }],
        subject: { reference: input.holderDid },
        date: credential.issuedAt,
        content: [],
      },
      originalAttachments: [],
    },
    credential: {
      credentialType: credential.credentialType,
      format: credential.selectiveDisclosure ? "vc+sd-jwt" : "vc+jwt",
      credentialId: credential.credentialId,
      jwt: proofJwt,
      proof: credential.proof,
      credentialStatus: objectRecord(input.credentialData.credentialStatus),
    },
    trust: {
      // Policy/status-list publication is not yet public in Portal. Never show
      // green solely because the authenticated sync transport was valid.
      state: "issuer_signed_untrusted",
      checks: [
        { key: "proof", status: "passed", checkedAt: input.checkedAt },
        { key: "issuer", status: "passed", checkedAt: input.checkedAt },
        {
          key: "status",
          status: "passed",
          detail: "portal_sync_active",
          checkedAt: input.checkedAt,
        },
        {
          key: "expiry",
          status: expiryPassed ? "passed" : "warning",
          detail: expiryPassed
            ? undefined
            : "expiry_not_independently_confirmed",
          checkedAt: input.checkedAt,
        },
        { key: "holder", status: "passed", checkedAt: input.checkedAt },
        {
          key: "policy",
          status: "pending",
          detail: "public_issuer_status_policy_unavailable",
          checkedAt: input.checkedAt,
        },
      ],
    },
    privacy: {
      defaultDisclosure: "ask",
      selectivelyDisclosableFields: credential.selectiveDisclosure
        ? Object.keys(credential.selectiveDisclosure.disclosureMap)
        : [],
    },
    local: { pinned: false, availableOffline: true, cachedAt: input.checkedAt },
  };
}

function signedCredentialTypeMatches(
  change: WalletSyncUpsertChange,
  credentialData: Record<string, unknown>,
): boolean {
  const expectedDocumentType = normalizeDocumentType(
    change.credential.cardType,
  );
  const subject = objectRecord(credentialData.credentialSubject);
  const signedDocumentType = normalizeDocumentType(
    stringValue(subject.documentType),
  );
  const signedTypes = Array.isArray(credentialData.type)
    ? credentialData.type.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  return Boolean(
    expectedDocumentType &&
    signedDocumentType === expectedDocumentType &&
    signedTypes.includes(change.credential.credentialType),
  );
}

function signedDocumentTitle(
  credentialData: Record<string, unknown>,
  fallback: string,
): { th: string; en?: string } {
  const subject = objectRecord(credentialData.credentialSubject);
  const humanDocument = objectRecord(subject.humanDocument);
  const renderData = objectRecord(humanDocument.renderData);
  const document = objectRecord(renderData.document);
  return {
    th: stringValue(document.titleTh) ?? fallback,
    en: stringValue(document.titleEn),
  };
}

function hospitalCodeFromIssuerDid(
  issuerDid: string,
): TrustCarePortalHospitalCode | undefined {
  const match = issuerDid.match(/:hospital:(tcc|tcp|tcm)$/i);
  return match?.[1]?.toUpperCase() as TrustCarePortalHospitalCode | undefined;
}

function normalizeCategory(value: string | null): CanonicalDocumentCategory {
  return value &&
    (CANONICAL_DOCUMENT_CATEGORIES as readonly string[]).includes(value)
    ? (value as CanonicalDocumentCategory)
    : "operations";
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
