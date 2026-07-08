export type WalletUxCoverageStatus = "implemented" | "partial" | "planned";

export type WalletUxCoverageItem = {
  id: string;
  requirement: string;
  status: WalletUxCoverageStatus;
  webSurface?: string;
  mobileSurface?: string;
  guardrail: string;
};

export const walletUxCoverage: WalletUxCoverageItem[] = [
  {
    id: "status-tone.shared",
    requirement: "Credential and portable object status colors are mapped from lifecycle/trust state.",
    status: "implemented",
    webSurface: "wallet-web detail/home/store plus ui-web document components",
    mobileSurface: "wallet-mobile detail/store/card components",
    guardrail: "Do not map active to green and everything else to red.",
  },
  {
    id: "mobile.selective-disclosure-picker",
    requirement: "Mobile selective disclosure shows a field picker before VP generation.",
    status: "implemented",
    mobileSurface: "apps/wallet-mobile/src/screens/CredentialDetailScreen.tsx",
    guardrail: "At least one selected field is required before generating an SD VP.",
  },
  {
    id: "mobile.scan-manual-paste",
    requirement: "Mobile QR scanner supports manual paste fallback.",
    status: "implemented",
    mobileSurface: "apps/wallet-mobile/src/screens/ScanScreen.tsx",
    guardrail: "Manual paste must work even when camera permission is not granted.",
  },
  {
    id: "mobile.detail-history",
    requirement: "Mobile credential detail includes presentation/history context.",
    status: "implemented",
    mobileSurface: "apps/wallet-mobile/src/screens/CredentialDetailScreen.tsx",
    guardrail: "History must remain reachable from credential detail.",
  },
  {
    id: "mobile.home-state",
    requirement: "Mobile home shows active card count, online/offline, biometric state, and last sync.",
    status: "implemented",
    mobileSurface: "apps/wallet-mobile/src/screens/WalletScreen.tsx",
    guardrail: "Home status must distinguish cache state from share/trust status.",
  },
  {
    id: "shl.policy",
    requirement: "SHL access honors passcode, expiry, access count, and audit decision boundaries.",
    status: "implemented",
    webSurface: "wallet-core SHL resolver/gateway contracts",
    mobileSurface: "wallet-core SHL resolver/gateway contracts",
    guardrail: "Wallet can display/enforce local policy hints, but production trust remains Portal Backend responsibility.",
  },
  {
    id: "micro-ips.scope",
    requirement: "Micro-IPS+ stays a minimum-necessary patient-held sharing pack.",
    status: "implemented",
    webSurface: "wallet-core MicroIpsPlusPack",
    mobileSurface: "wallet-core MicroIpsPlusPack",
    guardrail: "Micro-IPS+ must not declare itself as a system of record.",
  },
];

export function requiredWalletUxCoverage(ids: string[]): WalletUxCoverageItem[] {
  const byId = new Map(walletUxCoverage.map((item) => [item.id, item]));
  return ids.map((id) => {
    const item = byId.get(id);
    if (!item) throw new Error(`Missing wallet UX coverage item: ${id}`);
    if (item.status !== "implemented") {
      throw new Error(`Wallet UX coverage item ${id} is ${item.status}.`);
    }
    return item;
  });
}
