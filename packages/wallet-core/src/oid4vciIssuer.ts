import {
  assertOid4vciIssuerMetadata,
  assertOid4vciTokenResponse,
} from "@trustcare/contracts";
import { SignJWT, importJWK } from "jose";
import type { WalletCard, WalletStoredObject } from "./models";
import type { ParsedCredentialOffer } from "./oid4vc";
import {
  createEphemeralEs256SigningKey,
  publicJwksForSigningKey,
  signTrustCareCredentialJwt,
  type JsonRecord,
  type TrustCareSigningKey,
} from "./trustcareJwt";

const preAuthorizedGrant =
  "urn:ietf:params:oauth:grant-type:pre-authorized_code";

export type DemoOid4vciIssuerMetadata = {
  credential_issuer: string;
  authorization_servers: string[];
  token_endpoint: string;
  nonce_endpoint: string;
  credential_endpoint: string;
  jwks_uri: string;
  credential_configurations_supported: Record<string, unknown>;
};

export type DemoOid4vciTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  c_nonce: string;
  c_nonce_expires_in: number;
};

export type Oid4vciHolderProofJwt = {
  jwt: string;
  holderDid: string;
  kid: string;
  nonce: string;
  audience: string;
  signingKey: TrustCareSigningKey;
};

export type DemoOid4vciIssuedCredential = {
  credential: WalletCard;
  storedObject: WalletStoredObject;
  sdJwtVc: string;
  issuerMetadata: DemoOid4vciIssuerMetadata;
  issuerJwks: JsonRecord;
  tokenResponse: DemoOid4vciTokenResponse;
  holderProof: Oid4vciHolderProofJwt;
  warnings: string[];
};

export function createDemoOid4vciIssuerMetadata(input: {
  issuerOrigin: string;
  credentialTypes: string[];
}): DemoOid4vciIssuerMetadata {
  const issuerOrigin = input.issuerOrigin.replace(/\/+$/, "");
  const configurations = Object.fromEntries(
    input.credentialTypes.map((type) => [
      type,
      {
        format: "vc+sd-jwt",
        vct: type,
        scope: `trustcare_${type}`,
        cryptographic_binding_methods_supported: ["jwk", "did"],
        credential_signing_alg_values_supported: ["ES256"],
        proof_types_supported: {
          jwt: {
            proof_signing_alg_values_supported: ["ES256"],
          },
        },
        display: [
          {
            name: type,
            locale: "th-TH",
          },
        ],
      },
    ]),
  );
  return assertOid4vciIssuerMetadata({
    credential_issuer: issuerOrigin,
    authorization_servers: [issuerOrigin],
    token_endpoint: `${issuerOrigin}/oid4vci/token`,
    nonce_endpoint: `${issuerOrigin}/oid4vci/nonce`,
    credential_endpoint: `${issuerOrigin}/oid4vci/credential`,
    jwks_uri: `${issuerOrigin}/.well-known/jwks.json`,
    credential_configurations_supported: configurations,
  }) as DemoOid4vciIssuerMetadata;
}

export function createDemoOid4vciPreAuthorizedOffer(input: {
  issuerOrigin: string;
  credentialTypes: string[];
  holderDid?: string;
  userId?: string | number;
}): ParsedCredentialOffer {
  const offer = {
    credential_issuer: input.issuerOrigin.replace(/\/+$/, ""),
    credential_configuration_ids: input.credentialTypes,
    grants: {
      [preAuthorizedGrant]: {
        "pre-authorized_code": `preauth-${stableId({
          holderDid: input.holderDid,
          userId: input.userId,
          credentialTypes: input.credentialTypes,
        })}`,
      },
    },
    trustcare: {
      holderDid: input.holderDid,
      userId: input.userId,
    },
  };
  return {
    kind: "oid4vci",
    raw: `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`,
    offer,
    issuer: offer.credential_issuer,
    configurationIds: input.credentialTypes,
    grantTypes: [preAuthorizedGrant],
  };
}

export function createDemoOid4vciTokenResponse(input: {
  offer: ParsedCredentialOffer;
  now?: Date;
}): DemoOid4vciTokenResponse {
  const now = input.now ?? new Date();
  const seed = stableId({
    issuer: input.offer.issuer,
    configurationIds: input.offer.configurationIds,
    now: Math.floor(now.getTime() / 1000),
  });
  return assertOid4vciTokenResponse({
    access_token: `demo-at-${seed}`,
    token_type: "Bearer",
    expires_in: 300,
    c_nonce: `demo-cnonce-${seed}`,
    c_nonce_expires_in: 300,
  }) as DemoOid4vciTokenResponse;
}

export async function createOid4vciHolderProofJwt(input: {
  holderDid: string;
  audience: string;
  nonce: string;
  signingKey?: TrustCareSigningKey;
  now?: Date;
}): Promise<Oid4vciHolderProofJwt> {
  const now = input.now ?? new Date();
  const signingKey =
    input.signingKey ??
    (await createEphemeralEs256SigningKey({
      issuerDid: input.holderDid,
      kidPrefix: input.holderDid,
    }));
  const key = await importJWK(signingKey.privateJwk, signingKey.alg);
  const jwt = await new SignJWT({
    nonce: input.nonce,
    cnf: { jwk: signingKey.publicJwk },
  })
    .setProtectedHeader({
      alg: signingKey.alg,
      typ: "openid4vci-proof+jwt",
      kid: signingKey.kid,
    })
    .setIssuer(input.holderDid)
    .setAudience(input.audience)
    .setJti(
      `proof-${stableId({ holderDid: input.holderDid, nonce: input.nonce })}`,
    )
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .sign(key);
  return {
    jwt,
    holderDid: input.holderDid,
    kid: signingKey.kid,
    nonce: input.nonce,
    audience: input.audience,
    signingKey,
  };
}

export async function issueDemoOid4vciCredential(input: {
  sourceCard: WalletCard;
  offer: ParsedCredentialOffer;
  holderDid: string;
  userId: string | number;
  issuerOrigin?: string;
  issuerSigningKey?: TrustCareSigningKey;
  holderSigningKey?: TrustCareSigningKey;
  now?: Date;
}): Promise<DemoOid4vciIssuedCredential> {
  const now = input.now ?? new Date();
  const credentialType =
    input.sourceCard.credentialType ??
    `${pascalCase(input.sourceCard.cardType)}Credential`;
  const issuerOrigin =
    input.issuerOrigin ??
    input.offer.issuer ??
    "https://issuer.trustcare.local";
  const issuerDid = didWebFromOrigin(issuerOrigin);
  const issuerSigningKey =
    input.issuerSigningKey ??
    (await createEphemeralEs256SigningKey({
      issuerDid,
      kidPrefix: issuerDid,
      jku: `${issuerOrigin.replace(/\/+$/, "")}/.well-known/jwks.json`,
    }));
  const metadata = createDemoOid4vciIssuerMetadata({
    issuerOrigin,
    credentialTypes: [credentialType],
  });
  const tokenResponse = createDemoOid4vciTokenResponse({
    offer: input.offer,
    now,
  });
  const holderProof = await createOid4vciHolderProofJwt({
    holderDid: input.holderDid,
    audience: metadata.credential_issuer,
    nonce: tokenResponse.c_nonce,
    signingKey: input.holderSigningKey,
    now,
  });
  const credential = buildIssuedCredential({
    sourceCard: input.sourceCard,
    credentialType,
    holderDid: input.holderDid,
    issuerDid,
    issuerName: "TrustCare Demo OID4VCI Issuer",
    issuerOrigin: metadata.credential_issuer,
    nonce: tokenResponse.c_nonce,
    holderProofKid: holderProof.kid,
    now,
  });
  const signed = await signTrustCareCredentialJwt({
    credential,
    signingKey: issuerSigningKey,
    credentialType,
    subject: input.holderDid,
    audience: metadata.credential_issuer,
    now,
    expiresAt: String(credential.validUntil),
  });
  const disclosure = base64UrlJson({
    holderDid: input.holderDid,
    credentialId: signed.credentialId,
    sourceCredentialId: input.sourceCard.credentialId,
  });
  const sdJwtVc = `${signed.jwt}~${disclosure}`;
  const walletCard = issuedWalletCard({
    sourceCard: input.sourceCard,
    credential: signed.credential,
    credentialType,
    credentialId: signed.credentialId,
    sdJwtVc,
    disclosure,
    issuerDid,
    issuerKid: issuerSigningKey.kid,
    holderDid: input.holderDid,
    userId: input.userId,
    now,
  });
  return {
    credential: walletCard,
    storedObject: walletObjectFromIssuedCredential(walletCard),
    sdJwtVc,
    issuerMetadata: metadata,
    issuerJwks: publicJwksForSigningKey(issuerSigningKey),
    tokenResponse,
    holderProof,
    warnings: [],
  };
}

function buildIssuedCredential(input: {
  sourceCard: WalletCard;
  credentialType: string;
  holderDid: string;
  issuerDid: string;
  issuerName: string;
  issuerOrigin: string;
  nonce: string;
  holderProofKid: string;
  now: Date;
}): JsonRecord {
  const subject = recordValue(
    input.sourceCard.credentialData?.credentialSubject,
  );
  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://trustcare.network/contexts/health/v1",
    ],
    id: `urn:uuid:oid4vci-${stableId({
      card: input.sourceCard.credentialId,
      holder: input.holderDid,
      issuedAt: input.now.toISOString(),
    })}`,
    type: ["VerifiableCredential", input.credentialType],
    issuer: {
      id: input.issuerDid,
      name: input.issuerName,
      credentialIssuer: input.issuerOrigin,
    },
    validFrom: input.now.toISOString(),
    validUntil:
      input.sourceCard.expiresAt ??
      new Date(input.now.getTime() + 365 * 24 * 60 * 60_000).toISOString(),
    credentialSubject: {
      id: input.holderDid,
      ...(subject ?? input.sourceCard.credentialData ?? {}),
      sourceCredentialId: input.sourceCard.credentialId,
    },
    evidence: [
      {
        type: "OID4VCIPreAuthorizedCodeFlow",
        sourceCredentialId: input.sourceCard.credentialId,
        holderProofKid: input.holderProofKid,
      },
    ],
    trustcare: {
      source: "demo_oid4vci_issuer",
      cNonce: input.nonce,
      sourceCardId: input.sourceCard.id,
    },
  };
}

function issuedWalletCard(input: {
  sourceCard: WalletCard;
  credential: JsonRecord;
  credentialType: string;
  credentialId: string;
  sdJwtVc: string;
  disclosure: string;
  issuerDid: string;
  issuerKid: string;
  holderDid: string;
  userId: string | number;
  now: Date;
}): WalletCard {
  return {
    ...input.sourceCard,
    id: Number(input.sourceCard.id) + 1_000_000,
    credentialId: input.credentialId,
    credentialStatus: "active",
    credentialType: input.credentialType,
    credentialData: input.credential,
    credentialJwt: input.sdJwtVc,
    credentialProof: {
      type: "jwt",
      format: "sd-jwt-vc",
      jwt: input.sdJwtVc,
      alg: "ES256",
      kid: input.issuerKid,
      disclosures: [input.disclosure],
      source: "oid4vci_demo_issuer",
    },
    issuerDid: input.issuerDid,
    holderDid: input.holderDid,
    ownerUserId: String(input.userId),
    sourceSystem: "oid4vci_demo_issuer",
    issuedAt: input.now.toISOString(),
    createdAt: input.now.toISOString(),
    portalVerification: {
      verified: true,
      trustLevel: "verified",
      status: "oid4vci_issued",
      checkedAt: input.now.toISOString(),
    },
  };
}

function walletObjectFromIssuedCredential(
  card: WalletCard,
): WalletStoredObject {
  return {
    id: `vc:${card.credentialId}`,
    type: "vc",
    title: card.displayName,
    subtitle: "Issued through OID4VCI pre-authorized flow",
    status: "active",
    protocol: "oid4vci",
    createdAt: card.createdAt,
    expiresAt: card.expiresAt,
    source: card.issuerDid ?? undefined,
    payload: card,
  };
}

function didWebFromOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return `did:web:${url.host.replace(/:/g, "%3A")}`;
  } catch {
    return "did:web:issuer.trustcare.local";
  }
}

function recordValue(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stableId(value: unknown): string {
  return base64UrlJson(value).slice(0, 24);
}

function base64UrlJson(value: unknown): string {
  return base64Url(
    typeof value === "string" ? value : JSON.stringify(sortJson(value)),
  );
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  );
}

function pascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((item) => item.slice(0, 1).toUpperCase() + item.slice(1))
    .join("");
}
