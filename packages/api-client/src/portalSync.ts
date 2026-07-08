import {
  assertWalletSyncResponse,
  type WalletSyncResponseContract,
} from "@trustcare/contracts";
import {
  getDemoUser,
  buildPortalKnownCredentials,
  normalizeTrustCarePortalWalletSync,
  TRUSTCARE_PORTAL_WEB_ORIGIN,
  type PortalWalletImportResult,
  type PortalKnownCredential,
  type TrustCarePortalWalletCard,
  type TrustCarePortalWalletPresentation,
  type WalletCard,
  type WalletCardsByCategory,
} from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { TrustCareApiError } from "./errors";

export type PortalSyncMode = "disabled" | "live_demo";

export type PortalWalletSyncOptions = TrustCareClientOptions & {
  userId?: string | number;
  portalOrigin?: string;
  knownCredentials?: PortalKnownCredential[];
  currentCards?: WalletCard[];
};

type DemoLoginResponse = {
  success?: boolean;
  token?: string;
  accessToken?: string;
};

export type PortalWalletSyncStatus = {
  patientId?: number | string | null;
  available?: boolean;
  stats?: {
    totalCards?: number;
    totalCredentials?: number;
    activeCredentials?: number;
    totalPresentations?: number;
  };
  lastCredentialAt?: string | null;
  lastPresentationAt?: string | null;
};

type PortalWalletSyncResponse = WalletSyncResponseContract & {
  credentials: TrustCarePortalWalletCard[];
  presentations?: TrustCarePortalWalletPresentation[];
};

export type PortalCredentialVerifyResponse = {
  verified?: boolean;
  trustLevel?: "green" | "yellow" | "red" | "unknown" | string;
  status?: string;
  message?: string;
  decoded?: unknown;
  payload?: unknown;
  checks?: unknown;
  error?: string;
};

export type PortalDidResolveResponse = {
  did?: string;
  resolved?: boolean;
  verificationMethod?: unknown[];
  hospitalCode?: string;
  error?: string;
  message?: string;
};

export function canUsePortalDemoSync(userId?: string | number): boolean {
  const user = getDemoUser(userId);
  return user.source === "trustcare_portal" && Boolean(user.portalOpenId);
}

function portalOpenIdForSync(user: ReturnType<typeof getDemoUser>): string {
  if (!user.portalOpenId) {
    throw new TrustCareApiError(
      `Portal sync is not configured for wallet user ${user.id}`,
    );
  }
  return user.portalOpenId;
}

export async function syncTrustCarePortalWallet(
  options: PortalWalletSyncOptions,
): Promise<PortalWalletImportResult> {
  const user = getDemoUser(options.userId);
  const portalOrigin = (
    options.portalOrigin ?? TRUSTCARE_PORTAL_WEB_ORIGIN
  ).replace(/\/$/, "");
  const fetcher = options.fetchImpl ?? fetch;
  if (!canUsePortalDemoSync(user.id)) {
    throw new TrustCareApiError(
      `Portal sync is not configured for wallet user ${user.id}`,
    );
  }

  const openId = portalOpenIdForSync(user);
  const token = await getPortalDemoToken(fetcher, portalOrigin, openId);
  const syncPayload = await postPortalWalletSync(
    fetcher,
    portalOrigin,
    token,
    options.knownCredentials ??
      buildPortalKnownCredentials(options.currentCards ?? []),
  );
  const imported = normalizeTrustCarePortalWalletSync({
    owner: user,
    credentials: syncPayload.credentials ?? [],
    presentations: syncPayload.presentations ?? [],
    source: "trustcare_portal_wallet_sync",
    sourceUrl: `${portalOrigin}/api/wallet/sync`,
    portalOrigin,
    syncedAt: syncPayload.syncedAt,
    includeTrustArtifacts: false,
  });
  return await attachPortalJwtVerification(
    imported,
    fetcher,
    portalOrigin,
    token,
  );
}

export async function syncTrustCarePortalCardsByCategory(
  options: PortalWalletSyncOptions,
): Promise<WalletCardsByCategory> {
  return (await syncTrustCarePortalWallet(options)).cardsByCategory;
}

export async function getPortalWalletSyncStatus(
  options: PortalWalletSyncOptions,
): Promise<PortalWalletSyncStatus> {
  const user = getDemoUser(options.userId);
  const portalOrigin = (
    options.portalOrigin ?? TRUSTCARE_PORTAL_WEB_ORIGIN
  ).replace(/\/$/, "");
  const fetcher = options.fetchImpl ?? fetch;
  if (!canUsePortalDemoSync(user.id)) {
    throw new TrustCareApiError(
      `Portal sync is not configured for wallet user ${user.id}`,
    );
  }
  const token = await getPortalDemoToken(
    fetcher,
    portalOrigin,
    portalOpenIdForSync(user),
  );
  const response = await fetcher(`${portalOrigin}/api/wallet/sync/status`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = (await response.json().catch(() => null)) as
    PortalWalletSyncStatus | { error?: string; message?: string } | null;
  if (!response.ok) {
    throw new TrustCareApiError(
      errorMessage(payload) ?? "TrustCare Portal wallet sync status failed",
      { status: response.status },
    );
  }
  return (payload ?? {}) as PortalWalletSyncStatus;
}

export async function resolveTrustCareDid(
  options: Pick<PortalWalletSyncOptions, "fetchImpl" | "portalOrigin">,
  did: string,
): Promise<PortalDidResolveResponse> {
  const portalOrigin = (
    options.portalOrigin ?? TRUSTCARE_PORTAL_WEB_ORIGIN
  ).replace(/\/$/, "");
  const fetcher = options.fetchImpl ?? fetch;
  const response = await fetcher(
    `${portalOrigin}/api/wallet/sync/did-resolve`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ did }),
    },
  );
  const payload = (await response
    .json()
    .catch(() => null)) as PortalDidResolveResponse | null;
  if (!response.ok) {
    throw new TrustCareApiError(
      payload?.message ?? payload?.error ?? "TrustCare DID resolve failed",
      { status: response.status },
    );
  }
  return payload ?? {};
}

export async function verifyPortalCredentialJwt(
  options: Pick<PortalWalletSyncOptions, "fetchImpl" | "portalOrigin"> & {
    token?: string;
    jwt: string;
  },
): Promise<PortalCredentialVerifyResponse> {
  const portalOrigin = (
    options.portalOrigin ?? TRUSTCARE_PORTAL_WEB_ORIGIN
  ).replace(/\/$/, "");
  const fetcher = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const response = await fetcher(`${portalOrigin}/api/wallet/sync/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jwt: options.jwt }),
  });
  const payload = (await response
    .json()
    .catch(() => null)) as PortalCredentialVerifyResponse | null;
  if (!response.ok) {
    throw new TrustCareApiError(
      payload?.message ??
        payload?.error ??
        "TrustCare Portal credential verify failed",
      { status: response.status },
    );
  }
  return payload ?? {};
}

async function getPortalDemoToken(
  fetcher: typeof fetch,
  portalOrigin: string,
  openId: string,
): Promise<string> {
  const response = await fetcher(`${portalOrigin}/api/auth/demo-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ openId }),
  });
  const payload = (await response
    .json()
    .catch(() => null)) as DemoLoginResponse | null;
  const token = payload?.token ?? payload?.accessToken;
  if (!response.ok || !token) {
    throw new TrustCareApiError(
      `TrustCare Portal demo-login failed for ${openId}`,
      {
        status: response.status,
      },
    );
  }
  return token;
}

async function postPortalWalletSync(
  fetcher: typeof fetch,
  portalOrigin: string,
  token: string,
  knownCredentials: PortalKnownCredential[] = [],
): Promise<PortalWalletSyncResponse> {
  const response = await fetcher(`${portalOrigin}/api/wallet/sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      includePresentations: true,
      limit: 1000,
      knownCredentials,
    }),
  });
  const payload = await response.json().catch(() => null);
  const syncPayload = payload ? assertWalletSyncResponse(payload) : null;
  if (!response.ok || syncPayload?.error) {
    throw new TrustCareApiError(
      errorMessage(syncPayload) ?? "TrustCare Portal wallet sync failed",
      {
        status: response.status,
      },
    );
  }
  return syncPayload as PortalWalletSyncResponse;
}

async function attachPortalJwtVerification(
  imported: PortalWalletImportResult,
  fetcher: typeof fetch,
  portalOrigin: string,
  token: string,
): Promise<PortalWalletImportResult> {
  const cardsWithJwt = imported.cards.filter((card) =>
    Boolean(card.credentialJwt),
  );
  const missingJwtCount = imported.cards.length - cardsWithJwt.length;
  const verificationByCredentialId = new Map<
    string,
    PortalCredentialVerifyResponse
  >();
  const warnings = [...imported.report.warnings];

  if (missingJwtCount > 0) {
    warnings.push(
      `Portal sync นำเข้า VC ${imported.cards.length} รายการ แต่ ${missingJwtCount} รายการยังไม่มี JWT/proof envelope สำหรับตรวจลายเซ็น`,
    );
  }

  for (const card of cardsWithJwt) {
    try {
      const verification = await verifyPortalCredentialJwt({
        fetchImpl: fetcher,
        portalOrigin,
        token,
        jwt: card.credentialJwt ?? "",
      });
      verificationByCredentialId.set(String(card.credentialId), verification);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "TrustCare Portal credential verify failed";
      verificationByCredentialId.set(String(card.credentialId), {
        verified: false,
        trustLevel: "yellow",
        status: "verify_unavailable",
        message,
      });
      warnings.push(
        `ตรวจ JWT ของ ${String(card.credentialId)} ไม่สำเร็จ: ${message}`,
      );
    }
  }

  const cards = imported.cards.map((card) =>
    attachVerification(
      card,
      verificationByCredentialId.get(String(card.credentialId)),
    ),
  );
  return {
    ...imported,
    cards,
    cardsByCategory: cards.reduce<WalletCardsByCategory>((acc, card) => {
      acc[card.documentCategory] ??= [];
      acc[card.documentCategory].push(card);
      return acc;
    }, {}),
    report: {
      ...imported.report,
      warnings,
    },
  };
}

function attachVerification(
  card: WalletCard,
  verification: PortalCredentialVerifyResponse | undefined,
): WalletCard {
  if (!verification) return card;
  return {
    ...card,
    portalVerification: {
      verified: Boolean(verification.verified),
      trustLevel: verification.trustLevel ?? "unknown",
      status: verification.status,
      message: verification.message,
      checkedAt: new Date().toISOString(),
      payload: verification,
    },
  };
}

function errorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
    if (typeof nested.code === "string") return nested.code;
  }
  return undefined;
}
