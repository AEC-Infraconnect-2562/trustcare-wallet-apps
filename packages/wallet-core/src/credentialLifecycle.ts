import {
  isTrustArtifactDocumentType,
  normalizeDocumentType,
} from "./canonicalDocuments";
import { hashJson } from "./demoResolvers";
import type { ReadinessContext, WalletCard } from "./models";

export type CredentialSourceAuthority =
  | "portal_synced"
  | "issuer_signed"
  | "wallet_issued"
  | "payer_adapter"
  | "partner_wallet"
  | "patient_provided"
  | "trust_artifact"
  | "unknown";

export type CredentialVerificationRoute =
  | "source_issuer_did"
  | "wallet_issuer_profile"
  | "payer_adapter_issuer"
  | "holder_did"
  | "trustcare_artifact_policy"
  | "not_verifiable";

export type CredentialSigningOwner =
  | "source_issuer"
  | "wallet"
  | "payer_adapter"
  | "holder"
  | "trustcare_gateway"
  | "none";

export type CredentialLifecycleAction =
  | "keep"
  | "verify_source"
  | "request_issuer_signature"
  | "issue_and_sign"
  | "reissue_and_resign"
  | "reject_wrong_source";

export type CredentialLifecyclePolicy = {
  sourceAuthority: CredentialSourceAuthority;
  verifyWith: CredentialVerificationRoute;
  signingOwner: CredentialSigningOwner;
  canWalletReissue: boolean;
  canSourceReissue: boolean;
  reason: string;
};

export type CredentialLifecycleEvaluationInput = {
  card: WalletCard;
  expectedIssuerDid?: string | null;
  expectedPayerId?: string | null;
  expectedSchemaVersion?: string | null;
  expectedPayloadDigest?: string | null;
  changedFields?: string[];
};

export type CredentialLifecycleEvaluation = CredentialLifecyclePolicy & {
  action: CredentialLifecycleAction;
  payloadDigest: string;
  proofPresent: boolean;
  mismatches: string[];
};

export type PresentationLifecycleInput = {
  selectedCards: WalletCard[];
  context?: ReadinessContext;
  mode?: string;
  purpose?: string;
  recipient?: string;
  selectedFields?: string[];
  holderDid?: string | null;
  expiresAt?: string | null;
  currentPresentationDigest?: string | null;
};

export type PresentationLifecycleEvaluation = {
  action: "keep" | "rebuild_and_sign";
  presentationDigest: string;
  credentialDigests: string[];
  reasons: string[];
};

export type CredentialSourceSummary = {
  portalSynced: number;
  issuerSigned: number;
  walletIssued: number;
  payerAdapter: number;
  partnerWallet: number;
  patientProvided: number;
  trustArtifact: number;
  unknown: number;
};

export function classifyCredentialSource(
  card: WalletCard,
): CredentialSourceAuthority {
  const sourceSystem = lower(card.sourceSystem);
  const proofSource = lower(card.credentialProof?.source);
  const proofType = lower(card.credentialProof?.type);
  const credentialType = lower(card.credentialType);
  const cardType = lower(card.cardType);
  const issuerDid = lower(card.issuerDid);
  const hasProof = walletCardHasProof(card);
  const documentType = normalizeDocumentType(card.cardType);

  if (
    sourceSystem === "trustcare_portal" ||
    proofSource.startsWith("trustcare_portal") ||
    Boolean(card.portalVerification)
  ) {
    return "portal_synced";
  }

  if (sourceSystem === "partner_wallet") return "partner_wallet";

  if (documentType && isTrustArtifactDocumentType(documentType)) {
    return "trust_artifact";
  }

  if (
    sourceSystem.includes("payer") ||
    sourceSystem.includes("insurance") ||
    proofSource.includes("payer") ||
    credentialType.includes("payer") ||
    credentialType.includes("eligibility") ||
    credentialType.includes("claim") ||
    credentialType.includes("guarantee") ||
    cardType.includes("insurance_eligibility") ||
    cardType.includes("claim_") ||
    cardType.includes("guarantee_letter")
  ) {
    return "payer_adapter";
  }

  if (
    sourceSystem.includes("oid4vci") ||
    sourceSystem.includes("wallet") ||
    proofSource.includes("oid4vci") ||
    proofSource.includes("wallet") ||
    proofType.includes("wallet")
  ) {
    return "wallet_issued";
  }

  if (!hasProof && !issuerDid) return "patient_provided";

  if (issuerDid.startsWith("did:web:")) return "issuer_signed";

  if (hasProof) return "issuer_signed";

  return "unknown";
}

export function credentialLifecyclePolicy(
  card: WalletCard,
): CredentialLifecyclePolicy {
  const sourceAuthority = classifyCredentialSource(card);
  switch (sourceAuthority) {
    case "portal_synced":
      return {
        sourceAuthority,
        verifyWith: "source_issuer_did",
        signingOwner: "source_issuer",
        canWalletReissue: false,
        canSourceReissue: true,
        reason:
          "Portal-synced credentials must be verified against the original issuer/Portal DID and must not be re-signed by the wallet.",
      };
    case "payer_adapter":
      return {
        sourceAuthority,
        verifyWith: "payer_adapter_issuer",
        signingOwner: "payer_adapter",
        canWalletReissue: false,
        canSourceReissue: true,
        reason:
          "Payer artifacts are issued by the configured payer adapter or controlled integration service.",
      };
    case "wallet_issued":
      return {
        sourceAuthority,
        verifyWith: "wallet_issuer_profile",
        signingOwner: "wallet",
        canWalletReissue: true,
        canSourceReissue: true,
        reason:
          "Wallet-issued credentials can be regenerated and signed by the active wallet issuer profile.",
      };
    case "issuer_signed":
      return {
        sourceAuthority,
        verifyWith: "source_issuer_did",
        signingOwner: "source_issuer",
        canWalletReissue: false,
        canSourceReissue: true,
        reason:
          "Hospital or issuer credentials are re-issued by their DID owner, not by the wallet holder.",
      };
    case "partner_wallet":
      return {
        sourceAuthority,
        verifyWith: "holder_did",
        signingOwner: "holder",
        canWalletReissue: false,
        canSourceReissue: false,
        reason:
          "Partner wallet credentials are external holder artifacts and cannot be rewritten by this wallet.",
      };
    case "trust_artifact":
      return {
        sourceAuthority,
        verifyWith: "trustcare_artifact_policy",
        signingOwner: "trustcare_gateway",
        canWalletReissue: false,
        canSourceReissue: true,
        reason:
          "SHL and manifest artifacts are governed by gateway/manifest policy.",
      };
    case "patient_provided":
      return {
        sourceAuthority,
        verifyWith: "not_verifiable",
        signingOwner: "none",
        canWalletReissue: false,
        canSourceReissue: false,
        reason:
          "Patient-provided uploads are evidence until an issuer creates a VC proof.",
      };
    default:
      return {
        sourceAuthority,
        verifyWith: "not_verifiable",
        signingOwner: "none",
        canWalletReissue: false,
        canSourceReissue: false,
        reason: "Credential source authority is unknown.",
      };
  }
}

export function evaluateCredentialLifecycle(
  input: CredentialLifecycleEvaluationInput,
): CredentialLifecycleEvaluation {
  const policy = credentialLifecyclePolicy(input.card);
  const payloadDigest = credentialPayloadDigest(input.card);
  const proofPresent = walletCardHasProof(input.card);
  const mismatches = credentialMismatches(input, payloadDigest);

  let action: CredentialLifecycleAction = "keep";
  if (policy.sourceAuthority === "portal_synced") {
    action = proofPresent ? "verify_source" : "request_issuer_signature";
  } else if (
    policy.sourceAuthority === "patient_provided" ||
    policy.sourceAuthority === "unknown" ||
    policy.sourceAuthority === "partner_wallet"
  ) {
    action = proofPresent ? "verify_source" : "request_issuer_signature";
  } else if (!proofPresent) {
    action =
      policy.canWalletReissue || policy.canSourceReissue
        ? "issue_and_sign"
        : "request_issuer_signature";
  } else if (mismatches.length > 0) {
    action =
      policy.canWalletReissue || policy.canSourceReissue
        ? "reissue_and_resign"
        : "reject_wrong_source";
  }

  return {
    ...policy,
    action,
    payloadDigest,
    proofPresent,
    mismatches,
  };
}

export function credentialPayloadDigest(card: WalletCard): string {
  return hashJson({
    cardType: card.cardType,
    credentialId: card.credentialId,
    credentialType: card.credentialType,
    credentialData: card.credentialData ?? null,
    credentialJwt: card.credentialProof?.jwt ?? card.credentialJwt ?? null,
    credentialProof: card.credentialProof
      ? {
          type: card.credentialProof.type,
          format: card.credentialProof.format,
          alg: card.credentialProof.alg,
          kid: card.credentialProof.kid,
          source: card.credentialProof.source,
        }
      : null,
    issuerDid: card.issuerDid ?? null,
    holderDid: card.holderDid ?? null,
    issuedAt: card.issuedAt ?? null,
    expiresAt: card.expiresAt ?? null,
    sourceSystem: card.sourceSystem ?? null,
  });
}

export function evaluatePresentationLifecycle(
  input: PresentationLifecycleInput,
): PresentationLifecycleEvaluation {
  const credentialDigests = input.selectedCards.map(credentialPayloadDigest);
  const presentationDigest = presentationPackageDigest({
    ...input,
    credentialDigests,
  });
  const reasons: string[] = [];
  if (input.currentPresentationDigest !== presentationDigest) {
    reasons.push(
      "VP package changed; rebuild and sign a fresh presentation for this purpose, recipient, selection, expiry, and credential set.",
    );
  }
  return {
    action: reasons.length ? "rebuild_and_sign" : "keep",
    presentationDigest,
    credentialDigests,
    reasons,
  };
}

export function presentationPackageDigest(
  input: Omit<PresentationLifecycleInput, "selectedCards"> & {
    credentialDigests: string[];
  },
): string {
  return hashJson({
    credentialDigests: input.credentialDigests,
    context: input.context ?? null,
    mode: input.mode ?? null,
    purpose: input.purpose ?? null,
    recipient: input.recipient ?? null,
    selectedFields: input.selectedFields ?? [],
    holderDid: input.holderDid ?? null,
    expiresAt: input.expiresAt ?? null,
  });
}

export function summarizeCredentialSources(
  cards: WalletCard[],
): CredentialSourceSummary {
  const summary: CredentialSourceSummary = {
    portalSynced: 0,
    issuerSigned: 0,
    walletIssued: 0,
    payerAdapter: 0,
    partnerWallet: 0,
    patientProvided: 0,
    trustArtifact: 0,
    unknown: 0,
  };
  for (const card of cards) {
    const source = classifyCredentialSource(card);
    if (source === "portal_synced") summary.portalSynced += 1;
    else if (source === "issuer_signed") summary.issuerSigned += 1;
    else if (source === "wallet_issued") summary.walletIssued += 1;
    else if (source === "payer_adapter") summary.payerAdapter += 1;
    else if (source === "partner_wallet") summary.partnerWallet += 1;
    else if (source === "patient_provided") summary.patientProvided += 1;
    else if (source === "trust_artifact") summary.trustArtifact += 1;
    else summary.unknown += 1;
  }
  return summary;
}

export function walletCardHasProof(card: WalletCard): boolean {
  return Boolean(
    card.credentialProof?.jwt ||
      card.credentialJwt ||
      card.credentialProof?.kid ||
      card.credentialProof?.type,
  );
}

function credentialMismatches(
  input: CredentialLifecycleEvaluationInput,
  payloadDigest: string,
): string[] {
  const mismatches: string[] = [];
  if (
    input.expectedIssuerDid &&
    input.card.issuerDid &&
    input.expectedIssuerDid !== input.card.issuerDid
  ) {
    mismatches.push("issuer_did");
  }
  const actualPayerId = extractText(input.card.credentialData, [
    "payerId",
    "credentialSubject.payerId",
    "credentialSubject.payer.payerId",
  ]);
  if (
    input.expectedPayerId &&
    actualPayerId &&
    input.expectedPayerId !== actualPayerId
  ) {
    mismatches.push("payer_id");
  }
  const actualSchemaVersion = extractText(input.card.credentialData, [
    "schemaVersion",
    "credentialSchema.version",
    "trustcare.schemaVersion",
    "credentialSubject.schemaVersion",
  ]);
  if (
    input.expectedSchemaVersion &&
    actualSchemaVersion &&
    input.expectedSchemaVersion !== actualSchemaVersion
  ) {
    mismatches.push("schema_version");
  }
  if (
    input.expectedPayloadDigest &&
    input.expectedPayloadDigest !== payloadDigest
  ) {
    mismatches.push("payload_digest");
  }
  if (input.changedFields?.length) {
    mismatches.push("changed_fields");
  }
  return Array.from(new Set(mismatches));
}

function extractText(
  value: unknown,
  paths: string[],
): string | undefined {
  for (const path of paths) {
    const item = getPath(value, path);
    if (typeof item === "string" && item.length > 0) return item;
  }
  return undefined;
}

function getPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[key];
    }, value);
}

function lower(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}
