import type { RuntimeEnvironment } from "@trustcare/wallet-core";
import walletExchangeConfig from "../../../config/wallet-exchange-v2.json";
import { normalizePortalOrigin } from "./walletContractLoader";

/** Canonical live Portal origin; every endpoint is discovered from this base. */
export const TRUSTCARE_PORTAL_SANDBOX_ORIGIN =
  walletExchangeConfig.portalBaseUrl;

export function resolvePortalBaseUrl(input: {
  configuredUrl?: string;
  runtimeEnvironment: RuntimeEnvironment;
}): string {
  const configured = input.configuredUrl?.trim();
  if (configured) return normalizePortalOrigin(configured);
  return TRUSTCARE_PORTAL_SANDBOX_ORIGIN;
}
