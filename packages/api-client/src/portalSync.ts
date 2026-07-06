import {
  getDemoUser,
  normalizeTrustCarePortalWalletCards,
  portalSyncedUsers,
  TRUSTCARE_PORTAL_WEB_ORIGIN,
  type PortalWalletImportResult,
  type TrustCarePortalWalletCard,
  type WalletCardsByCategory
} from "@trustcare/wallet-core";
import type { TrustCareClientOptions } from "./trpc";
import { TrustCareApiError } from "./errors";

export type PortalSyncMode = "disabled" | "live_demo";

export type PortalWalletSyncOptions = TrustCareClientOptions & {
  userId?: string | number;
  portalOrigin?: string;
};

type DemoLoginResponse = {
  success?: boolean;
  token?: string;
  accessToken?: string;
};

type TrpcResponse<T> = {
  result?: {
    data?: {
      json?: T;
    } | T;
  };
  error?: {
    message?: string;
    code?: string;
  };
};

export function canUsePortalDemoSync(userId?: string | number): boolean {
  const user = getDemoUser(userId);
  const openId = user.portalOpenId ?? user.id;
  return user.source === "trustcare_portal" && Boolean(portalSyncedUsers[openId] ?? portalSyncedUsers[user.id]);
}

export async function syncTrustCarePortalWallet(options: PortalWalletSyncOptions): Promise<PortalWalletImportResult> {
  const user = getDemoUser(options.userId);
  const portalOrigin = (options.portalOrigin ?? TRUSTCARE_PORTAL_WEB_ORIGIN).replace(/\/$/, "");
  const fetcher = options.fetchImpl ?? fetch;
  const openId = user.portalOpenId ?? user.id;
  if (!canUsePortalDemoSync(openId)) {
    throw new TrustCareApiError(`Portal demo sync is not configured for ${openId}`);
  }

  const token = await getPortalDemoToken(fetcher, portalOrigin, openId);
  const groupedCards = await getPortalCardsByCategory(fetcher, portalOrigin, token);
  return normalizeTrustCarePortalWalletCards({
    owner: user,
    groupedCards,
    source: "trustcare_portal_demo_login",
    sourceUrl: `${portalOrigin}/api/trpc/wallet.cardsByCategory`,
    portalOrigin
  });
}

export async function syncTrustCarePortalCardsByCategory(options: PortalWalletSyncOptions): Promise<WalletCardsByCategory> {
  return (await syncTrustCarePortalWallet(options)).cardsByCategory;
}

async function getPortalDemoToken(fetcher: typeof fetch, portalOrigin: string, openId: string): Promise<string> {
  const response = await fetcher(`${portalOrigin}/api/auth/demo-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ openId })
  });
  const payload = (await response.json().catch(() => null)) as DemoLoginResponse | null;
  if (!response.ok || !payload?.token) {
    throw new TrustCareApiError(`TrustCare Portal demo-login failed for ${openId}`, {
      status: response.status
    });
  }
  return payload.token ?? payload.accessToken ?? "";
}

async function getPortalCardsByCategory(
  fetcher: typeof fetch,
  portalOrigin: string,
  token: string
): Promise<Record<string, TrustCarePortalWalletCard[]>> {
  const input = encodeURIComponent(JSON.stringify({ json: null }));
  const response = await fetcher(`${portalOrigin}/api/trpc/wallet.cardsByCategory?input=${input}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const payload = (await response.json().catch(() => null)) as TrpcResponse<Record<string, TrustCarePortalWalletCard[]>> | null;
  if (!response.ok || payload?.error) {
    throw new TrustCareApiError(payload?.error?.message ?? "TrustCare Portal wallet.cardsByCategory failed", {
      status: response.status,
      code: payload?.error?.code
    });
  }
  const data = payload?.result?.data;
  const grouped = isTrpcJsonData<Record<string, TrustCarePortalWalletCard[]>>(data)
    ? data.json
    : data;
  if (!grouped || typeof grouped !== "object" || Array.isArray(grouped)) {
    throw new TrustCareApiError("TrustCare Portal returned an invalid wallet.cardsByCategory payload");
  }
  return grouped as Record<string, TrustCarePortalWalletCard[]>;
}

function isTrpcJsonData<T>(value: unknown): value is { json: T } {
  return Boolean(value && typeof value === "object" && "json" in value);
}
