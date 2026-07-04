import type { WalletCard } from "./models";

export type Oid4vcCredentialOffer = {
  credential_issuer: string;
  credential_configuration_ids?: string[];
  credentials?: unknown[];
  grants?: Record<string, unknown>;
  issuer_state?: string;
};

export type ParsedCredentialOffer = {
  kind: "oid4vci";
  raw: string;
  offer?: Oid4vcCredentialOffer;
  credentialOfferUri?: string;
  issuer?: string;
  configurationIds: string[];
  grantTypes: string[];
};

export type Oid4vpRequest = {
  response_type?: string;
  response_mode?: string;
  client_id?: string;
  client_metadata?: Record<string, unknown>;
  nonce?: string;
  state?: string;
  request_uri?: string;
  presentation_definition?: PresentationDefinition;
  dcql_query?: Record<string, unknown>;
  response_uri?: string;
  redirect_uri?: string;
  transaction_data?: unknown[];
};

export type PresentationDefinition = {
  id?: string;
  name?: string;
  purpose?: string;
  input_descriptors?: Array<{
    id: string;
    name?: string;
    purpose?: string;
    format?: unknown;
    constraints?: {
      fields?: Array<{
        path?: string[];
        filter?: { const?: string; enum?: string[]; type?: string };
        purpose?: string;
      }>;
    };
  }>;
};

export type ParsedPresentationRequest = {
  kind: "oid4vp";
  raw: string;
  request?: Oid4vpRequest;
  requestUri?: string;
  verifier?: string;
  nonce?: string;
  state?: string;
  responseMode?: string;
  descriptorCount: number;
  requestedCredentialTypes: string[];
};

export type ParsedWalletProtocol =
  | ParsedCredentialOffer
  | ParsedPresentationRequest
  | { kind: "unknown"; raw: string };

export function parseOid4vcCredentialOffer(raw: string): ParsedCredentialOffer | null {
  const value = raw.trim();
  if (!value) return null;

  const direct = parseJsonObject(value);
  if (direct && ("credential_issuer" in direct || "credential_offer" in direct)) {
    const offer = "credential_offer" in direct ? normalizeOffer((direct as any).credential_offer) : normalizeOffer(direct);
    return summarizeOffer(value, offer);
  }

  if (value.startsWith("openid-credential-offer://") || value.startsWith("https://") || value.startsWith("http://")) {
    try {
      const url = new URL(value);
      const offerParam = url.searchParams.get("credential_offer");
      const offerUri = url.searchParams.get("credential_offer_uri") ?? undefined;
      if (offerParam) return summarizeOffer(value, normalizeOffer(JSON.parse(decodeMaybe(offerParam))));
      if (offerUri || value.startsWith("openid-credential-offer://")) {
        return {
          kind: "oid4vci",
          raw: value,
          credentialOfferUri: offerUri,
          issuer: undefined,
          configurationIds: [],
          grantTypes: []
        };
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function parseOid4vpRequest(raw: string): ParsedPresentationRequest | null {
  const value = raw.trim();
  if (!value) return null;

  const direct = parseJsonObject(value);
  if (direct && ("presentation_definition" in direct || "dcql_query" in direct || "request_uri" in direct || direct.response_type === "vp_token")) {
    return summarizePresentationRequest(value, direct as Oid4vpRequest);
  }

  if (value.startsWith("openid4vp://") || value.startsWith("haip://") || value.startsWith("https://") || value.startsWith("http://")) {
    try {
      const url = new URL(value);
      const requestParam = url.searchParams.get("request");
      const requestUri = url.searchParams.get("request_uri") ?? undefined;
      if (requestParam) {
        const decoded = decodeMaybe(requestParam);
        const request = parseJsonObject(decoded) as Oid4vpRequest | null;
        if (request) return summarizePresentationRequest(value, { ...request, request_uri: request.request_uri ?? requestUri });
      }
      const presentationDefinition = parseMaybeJson(url.searchParams.get("presentation_definition"));
      const dcqlQuery = parseMaybeJson(url.searchParams.get("dcql_query"));
      if (requestUri || presentationDefinition || dcqlQuery || url.protocol === "openid4vp:") {
        return summarizePresentationRequest(value, {
          response_type: url.searchParams.get("response_type") ?? "vp_token",
          response_mode: url.searchParams.get("response_mode") ?? undefined,
          client_id: url.searchParams.get("client_id") ?? undefined,
          nonce: url.searchParams.get("nonce") ?? undefined,
          state: url.searchParams.get("state") ?? undefined,
          request_uri: requestUri,
          presentation_definition: presentationDefinition as PresentationDefinition | undefined,
          dcql_query: dcqlQuery as Record<string, unknown> | undefined,
          response_uri: url.searchParams.get("response_uri") ?? undefined,
          redirect_uri: url.searchParams.get("redirect_uri") ?? undefined
        });
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function parseWalletProtocol(raw: string): ParsedWalletProtocol {
  return parseOid4vcCredentialOffer(raw) ?? parseOid4vpRequest(raw) ?? { kind: "unknown", raw };
}

export function credentialOfferLabel(parsed: ParsedCredentialOffer): string {
  const ids = parsed.configurationIds.length ? parsed.configurationIds.join(", ") : "credential offer";
  return `${parsed.issuer ?? parsed.credentialOfferUri ?? "Unknown issuer"} · ${ids}`;
}

export function presentationRequestLabel(parsed: ParsedPresentationRequest): string {
  const types = parsed.requestedCredentialTypes.length ? parsed.requestedCredentialTypes.join(", ") : "credential presentation";
  return `${parsed.verifier ?? "Verifier"} requests ${types}`;
}

export function matchCardsForOid4vp(cards: WalletCard[], parsed: ParsedPresentationRequest): WalletCard[] {
  const requested = new Set(parsed.requestedCredentialTypes.map(normalizeType));
  if (!requested.size) return cards.filter(card => card.credentialStatus === "active");
  const requestedTypes = Array.from(requested);
  return cards.filter(card => {
    if (card.credentialStatus !== "active") return false;
    const cardTypes = [card.cardType, card.credentialType, card.displayNameEn].filter(Boolean).map(value => normalizeType(String(value)));
    return cardTypes.some(type =>
      requestedTypes.some(requestedType =>
        type === requestedType ||
        `${type}credential` === requestedType ||
        type.includes(requestedType) ||
        requestedType.includes(type)
      )
    );
  });
}

export function buildOid4vpConsentSummary(parsed: ParsedPresentationRequest, matches: WalletCard[]) {
  return {
    verifier: parsed.verifier ?? "Unknown verifier",
    nonce: parsed.nonce,
    state: parsed.state,
    descriptorCount: parsed.descriptorCount,
    requestedCredentialTypes: parsed.requestedCredentialTypes,
    matchedCredentialIds: matches.map(card => card.credentialId),
    responseMode: parsed.responseMode ?? "direct_post",
    safetyChecks: [
      { key: "nonce", ok: Boolean(parsed.nonce), label: "Verifier nonce present" },
      { key: "audience", ok: Boolean(parsed.verifier), label: "Verifier identity present" },
      { key: "match", ok: matches.length > 0, label: "Wallet has matching active credentials" },
      { key: "consent", ok: true, label: "User consent required before presentation" }
    ]
  };
}

function summarizeOffer(raw: string, offer?: Oid4vcCredentialOffer): ParsedCredentialOffer {
  const configurationIds = offer?.credential_configuration_ids ?? [];
  const grantTypes = Object.keys(offer?.grants ?? {});
  return {
    kind: "oid4vci",
    raw,
    offer,
    issuer: offer?.credential_issuer,
    configurationIds,
    grantTypes
  };
}

function summarizePresentationRequest(raw: string, request: Oid4vpRequest): ParsedPresentationRequest {
  const definition = request.presentation_definition;
  const types = new Set<string>();
  for (const descriptor of definition?.input_descriptors ?? []) {
    if (descriptor.name) types.add(descriptor.name);
    for (const field of descriptor.constraints?.fields ?? []) {
      const constant = field.filter?.const;
      if (constant) types.add(constant);
      for (const item of field.filter?.enum ?? []) types.add(item);
    }
  }
  const dcqlCredentials = Array.isArray((request.dcql_query as any)?.credentials) ? (request.dcql_query as any).credentials : [];
  for (const credential of dcqlCredentials) {
    if (credential.id) types.add(String(credential.id));
    if (credential.format) types.add(String(credential.format));
    if (Array.isArray(credential.meta?.type_values)) {
      for (const type of credential.meta.type_values) types.add(String(type));
    }
  }
  return {
    kind: "oid4vp",
    raw,
    request,
    requestUri: request.request_uri,
    verifier: request.client_id ?? (request.client_metadata?.client_name as string | undefined),
    nonce: request.nonce,
    state: request.state,
    responseMode: request.response_mode,
    descriptorCount: definition?.input_descriptors?.length ?? dcqlCredentials.length ?? 0,
    requestedCredentialTypes: Array.from(types)
  };
}

function normalizeOffer(value: unknown): Oid4vcCredentialOffer | undefined {
  if (typeof value === "string") return JSON.parse(value) as Oid4vcCredentialOffer;
  if (value && typeof value === "object") return value as Oid4vcCredentialOffer;
  return undefined;
}

function parseJsonObject(value: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseMaybeJson(value: string | null): unknown {
  if (!value) return undefined;
  return parseJsonObject(decodeMaybe(value)) ?? undefined;
}

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeType(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
