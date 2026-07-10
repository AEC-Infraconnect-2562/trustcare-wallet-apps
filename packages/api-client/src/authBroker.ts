import { getDemoUser } from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { callTrpcProcedure } from "./trpc";
import { usesDemoRuntime } from "./runtime";

export type AuthBrokerProviderKind =
  | "wallet_holder_did"
  | "hospital_staff_sso"
  | "payer_sso"
  | "national_id_bridge"
  | "foreign_passport";

export type AuthBrokerProvider = {
  providerId: string;
  label: string;
  kind: AuthBrokerProviderKind;
  assuranceLevel: "low" | "medium" | "high";
  demo: boolean;
  endpointConfigured: boolean;
};

export type AuthBrokerSessionRequest = {
  providerId: string;
  purpose:
    | "payer_consent"
    | "medical_tourist_intake"
    | "cross_border_referral"
    | "wallet_login";
  holderDid?: string;
  patientId?: string | number;
  redirectUri: string;
  state?: string;
};

export type AuthBrokerSession = {
  sessionId: string;
  providerId: string;
  authorizationUrl: string;
  state: string;
  expiresAt: string;
  demo: boolean;
};

export type AuthBrokerExchangeInput = {
  sessionId: string;
  providerId: string;
  code: string;
  state: string;
};

export type AuthBrokerTokenSet = {
  subjectId: string;
  assuranceLevel: "low" | "medium" | "high";
  consentReceiptId?: string;
  issuedAt: string;
  expiresAt: string;
  tokenType: "brokered_assertion";
  warnings?: string[];
};

export type AuthBrokerApiOptions = TrustCareClientOptions & {
  userId?: string | number;
};

const demoProviders: AuthBrokerProvider[] = [
  {
    providerId: "wallet_holder_did",
    label: "Wallet holder DID",
    kind: "wallet_holder_did",
    assuranceLevel: "medium",
    demo: true,
    endpointConfigured: false,
  },
  {
    providerId: "payer_sso_mock",
    label: "Payer SSO demo",
    kind: "payer_sso",
    assuranceLevel: "medium",
    demo: true,
    endpointConfigured: false,
  },
  {
    providerId: "foreign_passport_mock",
    label: "Foreign passport demo",
    kind: "foreign_passport",
    assuranceLevel: "low",
    demo: true,
    endpointConfigured: false,
  },
];

export async function listProviders(
  options: AuthBrokerApiOptions,
): Promise<AuthBrokerProvider[]> {
  if (usesDemoRuntime(options)) return demoProviders;
  return callTrpcProcedure<AuthBrokerProvider[]>(
    options,
    "authBroker.listProviders",
    {},
  );
}

export async function startSession(
  options: AuthBrokerApiOptions,
  input: AuthBrokerSessionRequest,
): Promise<AuthBrokerSession> {
  if (usesDemoRuntime(options)) {
    const state = input.state ?? `state_${stableSuffix(input)}`;
    return {
      sessionId: `auth_${stableSuffix({ ...input, userId: options.userId })}`,
      providerId: input.providerId,
      authorizationUrl: `${input.redirectUri}?demo_auth=1&provider=${encodeURIComponent(input.providerId)}&state=${encodeURIComponent(state)}`,
      state,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      demo: true,
    };
  }
  return callTrpcProcedure<AuthBrokerSession>(
    options,
    "authBroker.startSession",
    input,
  );
}

export async function exchangeCallback(
  options: AuthBrokerApiOptions,
  input: AuthBrokerExchangeInput,
): Promise<AuthBrokerTokenSet> {
  if (usesDemoRuntime(options)) {
    const user = getDemoUser(options.userId);
    return {
      subjectId: user.holderDid,
      assuranceLevel:
        demoProviders.find(
          (provider) => provider.providerId === input.providerId,
        )?.assuranceLevel ?? "medium",
      consentReceiptId: `consent_${stableSuffix(input)}`,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      tokenType: "brokered_assertion",
      warnings: [
        "Demo auth broker assertion. Do not store national ID, payer SSO, or ThaiD-compatible tokens in browser storage.",
      ],
    };
  }
  return callTrpcProcedure<AuthBrokerTokenSet>(
    options,
    "authBroker.exchangeCallback",
    input,
  );
}

export async function revokeSession(
  options: AuthBrokerApiOptions,
  sessionId: string,
): Promise<{ revoked: boolean }> {
  if (usesDemoRuntime(options)) return { revoked: true };
  return callTrpcProcedure<{ revoked: boolean }>(
    options,
    "authBroker.revokeSession",
    { sessionId },
  );
}

function stableSuffix(value: unknown): string {
  const source = JSON.stringify(value) ?? String(value ?? "unknown");
  let hash = 0;
  for (const char of source) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36).padStart(6, "0").slice(0, 10);
}
